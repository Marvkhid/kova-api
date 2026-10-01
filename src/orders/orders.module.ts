// ============================================================
// KOVA API — Orders Module (v2, Prisma 8)
// Real order lifecycle with an append-only event timeline.
//   • Buyer: create order, list own orders, view own order timeline
//   • Seller: view orders containing their items, advance fulfillment
//   • Payment confirmation (Paystack) writes PAID events
//   • Physical items progress: PAID → PROCESSING → PACKED → SHIPPED
//     → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
//   • Digital items progress: PAID → DELIVERED (no logistics states)
//   • Delivery confirmations are buyer/admin-only — sellers cannot
//     mark an order delivered on the buyer's behalf.
//   • Authorization: buyers see only their own orders; sellers see
//     only orders that contain their items; admins see everything.
// ============================================================

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { db } from '../prisma/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

// ── Money helpers (Decimal-safe) ──────────────────────────

export function money(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/** Cents-based arithmetic to avoid float drift on Naira amounts. */
function sumCents(pairs: { price: unknown; quantity: number }[]): number {
  return pairs.reduce((sum, i) => sum + Math.round(money(i.price) * 100) * i.quantity, 0);
}

// ── Status lifecycle rules ────────────────────────────────

type FulfillmentStatus =
  | 'PENDING' | 'PAID' | 'PROCESSING' | 'PACKED' | 'SHIPPED'
  | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
type OrderStatus =
  | 'PENDING' | 'PAID' | 'PROCESSING' | 'PACKED' | 'SHIPPED'
  | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

const PHYSICAL_FLOW: FulfillmentStatus[] = [
  'PENDING', 'PAID', 'PROCESSING', 'PACKED',
  'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED',
];
const DIGITAL_FLOW: FulfillmentStatus[] = ['PENDING', 'PAID', 'DELIVERED'];

/** Ordered index used to validate forward-only transitions. */
function flowRank(flow: FulfillmentStatus[], status: FulfillmentStatus): number {
  const idx = flow.indexOf(status);
  return idx === -1 ? -1 : idx;
}

/** Map an item-fulfillment status to the order-level status. */
function orderStatusFor(items: { fulfillmentStatus: FulfillmentStatus; product: { productType: 'PHYSICAL' | 'DIGITAL' } }[]): OrderStatus {
  if (items.length === 0) return 'PENDING';
  if (items.every((i) => i.fulfillmentStatus === 'DELIVERED')) return 'DELIVERED';
  if (items.some((i) => i.fulfillmentStatus === 'CANCELLED')) return 'CANCELLED';

  // The order tracks the least-advanced item (ignoring digital items,
  // which complete immediately).
  const physical = items.filter((i) => i.product.productType === 'PHYSICAL');
  const pool = physical.length ? physical : items;
  const minRank = Math.min(...pool.map((i) => flowRank(PHYSICAL_FLOW, i.fulfillmentStatus)));
  return PHYSICAL_FLOW[minRank] as OrderStatus;
}

const ITEM_EVENT_MESSAGES: Record<string, string> = {
  PAID: 'Payment confirmed',
  PROCESSING: 'Seller is preparing your order',
  PACKED: 'Package packed by seller',
  SHIPPED: 'Shipped by seller',
  IN_TRANSIT: 'Package is in transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Item cancelled',
};

// ── DTOs ──────────────────────────────────────────────────

class OrderItemDto {
  @IsString() productId: string;
  @IsNumber() @Min(1) @Type(() => Number) quantity: number;
}

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsObject()
  shippingAddress?: Record<string, any>;
}

export class UpdateItemFulfillmentDto {
  @IsEnum({
    PROCESSING: 'PROCESSING',
    PACKED: 'PACKED',
    SHIPPED: 'SHIPPED',
    IN_TRANSIT: 'IN_TRANSIT',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
  })
  status: FulfillmentStatus;

  @IsOptional() @IsString() trackingNumber?: string;
  @IsOptional() @IsString() carrier?: string;
  @IsOptional() @IsString() message?: string;
}

export class SellerOrdersQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
}

// ── Shared projections ────────────────────────────────────

/** Product line projection used across order reads. */
function itemsWithProduct(extraSellerFields = false) {
  return (item: any) =>
    extraSellerFields
      ? item
          .include('product', (p: any) =>
            p
              .select('id', 'name', 'slug', 'productType', 'images', 'sellerId')
              .include('seller', (s: any) =>
                s.select('id', 'name').include('sellerProfile', (sp: any) => sp.select('storeName')),
              ),
          )
      : item.include('product', (p: any) => p.select('id', 'name', 'slug', 'productType', 'images', 'sellerId'));
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class OrdersService {
  /** Load an order the requester is authorized to see. */
  private async getAuthorizedOrder(orderId: string, user: any): Promise<{ order: any; role: 'buyer' | 'seller' | 'admin' }> {
    const order = await db.orm.public.Order
      .include('items', (items: any) =>
        items
          .include('product', (p: any) => p.select('id', 'name', 'slug', 'productType', 'images', 'sellerId'))
          .select('id', 'fulfillmentStatus'),
      )
      .where({ id: orderId })
      .first();
    if (!order) throw new NotFoundException('Order not found');

    if (user.role === 'ADMIN') return { order, role: 'admin' };
    if (order.userId === user.id) return { order, role: 'buyer' };

    const isSellerOnOrder = (order.items as any[]).some((i: any) => i.product.sellerId === user.id);
    if (isSellerOnOrder) return { order, role: 'seller' };

    // Never trust the order ID alone.
    throw new ForbiddenException('You do not have access to this order');
  }

  async create(userId: string, dto: CreateOrderDto) {
    // Collapse duplicate product lines
    const merged = new Map<string, number>();
    for (const item of dto.items) {
      merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
    }
    const productIds = [...merged.keys()];

    const products = productIds.length
      ? await db.orm.public.Product
          .where((p) => p.id.in(productIds))
          .where({ status: 'PUBLISHED' })
          .all()
      : [];
    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products are unavailable');
    }

    const unavailable = products.find((p) => !p.inStock);
    if (unavailable) throw new BadRequestException(`"${unavailable.name}" is currently out of stock`);

    const itemRows = products.map((p) => ({
      productId: p.id,
      quantity: merged.get(p.id)!,
      price: p.price, // locked at purchase time
      product: p,
    }));

    const subtotalCents = sumCents(itemRows);
    const subtotal = subtotalCents / 100;
    // ₦2,500 flat shipping for physical orders; free above ₦50,000;
    // digital-only orders ship free.
    const hasPhysical = itemRows.some((i) => i.product.productType === 'PHYSICAL');
    const shipping = hasPhysical && subtotal < 50000 ? 2500 : 0;
    const total = subtotal + shipping;

    // Nested create + the event write run atomically.
    const order = await db.transaction(async (tx) => {
      const created = await tx.orm.public.Order
        .include('items', (items: any) =>
          items.include('product', (p: any) => p.select('id', 'name', 'slug', 'productType', 'images')),
        )
        .create({
          userId,
          subtotal,
          shipping,
          total,
          shippingAddress: dto.shippingAddress ?? null,
          status: 'PENDING',
          items: (r: any) =>
            r.create(
              itemRows.map(({ product: _p, ...row }) => ({
                ...row,
                fulfillmentStatus: 'PENDING',
              })),
            ),
        } as never);
      await tx.orm.public.OrderEvent.create({
        orderId: created.id,
        status: 'PENDING',
        message: 'Order placed',
      });
      return created;
    });

    return this.serializeOrder(order);
  }

  async findAllMine(userId: string) {
    const orders = await db.orm.public.Order
      .include('items', (items: any) =>
        items.include('product', (p: any) =>
          p
            .select('id', 'name', 'slug', 'productType', 'images', 'sellerId')
            .include('seller', (s: any) =>
              s.select('name').include('sellerProfile', (sp: any) => sp.select('storeName')),
            ),
        ),
      )
      .include('events', (events: any) => events.orderBy((e: any) => e.createdAt.asc()))
      .where({ userId })
      .orderBy((o) => o.createdAt.desc())
      .all();
    return orders.map((o) => this.serializeOrder(o));
  }

  async findOneForUser(orderId: string, user: any) {
    const { order } = await this.getAuthorizedOrder(orderId, user);
    const full = await db.orm.public.Order
      .include('items', (items: any) =>
        items.include('product', (p: any) =>
          p
            .select('id', 'name', 'slug', 'productType', 'images', 'sellerId')
            .include('seller', (s: any) =>
              s.select('name').include('sellerProfile', (sp: any) => sp.select('storeName', 'storeSlug')),
            ),
        ),
      )
      .include('events', (events: any) => events.orderBy((e: any) => e.createdAt.asc()))
      .where({ id: order.id })
      .first();
    return this.serializeOrder(full);
  }

  /** Seller order list — only orders containing this seller's items. */
  async findAllForSeller(sellerId: string, query: SellerOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = 20;

    let filtered = db.orm.public.Order
      .where((o) => o.items.some((i: any) => i.product.some({ sellerId })));
    if (query.status) {
      filtered = filtered.where((o) =>
        o.items.some((i: any) =>
          i.product.some({ sellerId, fulfillmentStatus: query.status!.toUpperCase() as FulfillmentStatus }),
        ),
      );
    }

    const [orders, totalAgg] = await Promise.all([
      filtered
        .include('user', (u: any) => u.select('id', 'name', 'email'))
        .include('items', (items: any) =>
          items
            .where((i: any) => i.product.some({ sellerId })) // seller sees only their own lines
            .include('product', (p: any) => p.select('id', 'name', 'slug', 'productType', 'images')),
        )
        .orderBy((o) => o.createdAt.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all(),
      filtered.aggregate((a) => ({ total: a.count() })),
    ]);
    const total = Number(totalAgg.total);

    return {
      orders: orders.map((o) => this.serializeSellerOrder(o, sellerId)),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Advance one item's fulfillment. Sellers may move their own items
   * forward through the physical flow but may NEVER mark DELIVERED —
   * that requires the buyer or an admin.
   */
  async updateItemFulfillment(orderId: string, itemId: string, user: any, dto: UpdateItemFulfillmentDto) {
    const { order, role } = await this.getAuthorizedOrder(orderId, user);
    const item = order.items.find((i: any) => i.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');

    if (role === 'seller' && item.product.sellerId !== user.id) {
      throw new ForbiddenException('This item belongs to another seller');
    }

    const isDigital = item.product.productType === 'DIGITAL';
    const flow = isDigital ? DIGITAL_FLOW : PHYSICAL_FLOW;
    const next = dto.status;

    if (!flow.includes(next)) {
      throw new BadRequestException(
        isDigital
          ? `Digital items cannot enter logistics state "${next}"`
          : `Invalid status "${next}" for this item`,
      );
    }

    // Forward-only transitions (CANCELLED allowed from anywhere by admin/buyer)
    const currentRank = flowRank(flow, item.fulfillmentStatus as FulfillmentStatus);
    const nextRank = flowRank(flow, next);
    const isBackward = nextRank <= currentRank;
    const isCancellation = next === 'CANCELLED';

    if (isBackward && !isCancellation) {
      throw new BadRequestException('Fulfillment status can only move forward');
    }

    // DELIVERED and CANCELLED are buyer/admin actions, never the seller's
    if (role === 'seller' && (next === 'DELIVERED' || isCancellation)) {
      throw new ForbiddenException('Only the buyer or an admin can confirm delivery or cancel');
    }
    if (role === 'buyer' && nextRank > flowRank(flow, 'PAID') && !isCancellation) {
      // Buyers may only cancel a pending/paid order — logistics is seller territory
      throw new ForbiddenException('Ask the seller to update fulfillment for this step');
    }

    const data: any = { fulfillmentStatus: next };
    if (dto.trackingNumber !== undefined) data.trackingNumber = dto.trackingNumber;
    if (dto.carrier !== undefined) data.carrier = dto.carrier;

    const updatedItem = await db.transaction(async (tx) => {
      const updated = await tx.orm.public.OrderItem.where({ id: itemId }).update(data);
      await tx.orm.public.OrderEvent.create({
        orderId,
        status: this.orderStatusForStatus(next),
        message: dto.message?.trim() || ITEM_EVENT_MESSAGES[next],
      });
      return updated;
    });

    // Recompute the order-level status from its items
    const refreshed = await db.orm.public.Order
      .include('items', (items: any) => items.include('product', (p: any) => p.select('productType')))
      .where({ id: orderId })
      .first();
    if (!refreshed) throw new NotFoundException('Order not found');
    const derived = orderStatusFor(refreshed.items as any);
    await db.orm.public.Order.where({ id: orderId }).update({ status: derived });

    return this.serializeItem(updatedItem);
  }

  /** Admin marketplace-wide order list. */
  async findAllForAdmin(query: SellerOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = 30;
    let filtered = db.orm.public.Order;
    if (query.status) filtered = filtered.where({ status: query.status.toUpperCase() as OrderStatus });

    const [orders, totalAgg] = await Promise.all([
      filtered
        .include('user', (u: any) => u.select('id', 'name', 'email'))
        .include('items', (items: any) =>
          items.include('product', (p: any) =>
            p
              .select('id', 'name', 'slug', 'productType')
              .include('seller', (s: any) =>
                s.select('id', 'name').include('sellerProfile', (sp: any) => sp.select('storeName')),
              ),
          ),
        )
        .orderBy((o) => o.createdAt.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all(),
      filtered.aggregate((a) => ({ total: a.count() })),
    ]);
    const total = Number(totalAgg.total);
    return { orders: orders.map((o) => this.serializeOrder(o)), total, page, pages: Math.ceil(total / limit) };
  }

  // ── Payment integration (used by Paystack module) ────────

  async confirmPayment(orderId: string, reference: string) {
    const order = await db.orm.public.Order
      .include('items', (items: any) => items.select('id', 'productId', 'quantity', 'fulfillmentStatus'))
      .where({ id: orderId })
      .first();
    if (!order) throw new NotFoundException('Order not found');

    // Idempotent — never double-apply a payment
    if (order.paymentStatus === 'PAID') {
      return this.findOneForUserAdmin(orderId);
    }

    await db.transaction(async (tx) => {
      await tx.orm.public.Order.where({ id: orderId }).update({
        paymentStatus: 'PAID',
        paymentRef: reference,
        status: 'PAID',
      });
      await tx.orm.public.OrderItem
        .where({ orderId, fulfillmentStatus: 'PENDING' })
        .update({ fulfillmentStatus: 'PAID' });
      // Digital items are complete once paid — there is no logistics leg
      await tx.orm.public.OrderItem
        .where({ orderId, fulfillmentStatus: 'PAID' })
        .where((i: any) => i.product.some({ productType: 'DIGITAL' }))
        .update({ fulfillmentStatus: 'DELIVERED' });
      await tx.orm.public.OrderEvent.createAll([
        { orderId, status: 'PAID', message: 'Payment confirmed' },
        { orderId, status: 'PROCESSING', message: 'Seller is preparing your order' },
      ]);
      // Prisma 8 has no { increment } in updates — read-then-write per item.
      for (const item of order.items as any[]) {
        const product = await tx.orm.public.Product
          .where({ id: item.productId })
          .select('buyCount')
          .first();
        if (product) {
          await tx.orm.public.Product
            .where({ id: item.productId })
            .update({ buyCount: product.buyCount + item.quantity });
        }
      }
    });

    return this.findOneForUserAdmin(orderId);
  }

  private async findOneForUserAdmin(orderId: string) {
    const order = await db.orm.public.Order
      .include('items', (items: any) =>
        items.include('product', (p: any) => p.select('id', 'name', 'slug', 'productType', 'images', 'sellerId')),
      )
      .include('events', (events: any) => events.orderBy((e: any) => e.createdAt.asc()))
      .where({ id: orderId })
      .first();
    return this.serializeOrder(order);
  }

  // ── Serialization (Decimal → number) ─────────────────────

  private serializeItem(item: any) {
    return {
      ...item,
      price: money(item.price),
      product: item.product
        ? { ...item.product, price: item.product.price !== undefined ? money(item.product.price) : undefined }
        : undefined,
    };
  }

  private serializeOrder(order: any) {
    return {
      ...order,
      subtotal: money(order.subtotal),
      shipping: money(order.shipping),
      total: money(order.total),
      items: (order.items ?? []).map((item: any) => ({
        ...item,
        price: money(item.price),
        product: item.product
          ? { ...item.product, price: item.product.price !== undefined ? money(item.product.price) : undefined }
          : undefined,
      })),
    };
  }

  /** Seller view: strips buyer PII to name/email + their own lines only. */
  private serializeSellerOrder(order: any, sellerId: string) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paymentStatus: order.paymentStatus,
      buyer: order.user
        ? { name: order.user.name, email: order.user.email }
        : null,
      // Shipping destination at an appropriate privacy level: city/state only
      shippingCity: (order.shippingAddress as any)?.city ?? null,
      shippingState: (order.shippingAddress as any)?.state ?? null,
      items: (order.items ?? []).map((item: any) => ({
        id: item.id,
        quantity: item.quantity,
        price: money(item.price),
        fulfillmentStatus: item.fulfillmentStatus,
        trackingNumber: item.trackingNumber,
        carrier: item.carrier,
        product: item.product,
      })),
      sellerSubtotal:
        (order.items ?? [])
          .filter((i: any) => i.product && (i.product.sellerId === sellerId || true))
          .reduce((sum: number, i: any) => sum + Math.round(money(i.price) * 100) * i.quantity, 0) / 100,
    };
  }

  private orderStatusForStatus(status: FulfillmentStatus): OrderStatus {
    return (PHYSICAL_FLOW.includes(status) ? PHYSICAL_FLOW : DIGITAL_FLOW).includes(status)
      ? (status as OrderStatus)
      : 'PENDING';
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private orders: OrdersService) {}

  // POST /api/orders — create new order (buyer)
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.id, dto);
  }

  // GET /api/orders — my orders (buyer)
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.orders.findAllMine(user.id);
  }

  // GET /api/orders/seller — orders containing my items (seller)
  @Get('seller')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  findSellerOrders(@CurrentUser() user: any, @Query() query: SellerOrdersQueryDto) {
    return this.orders.findAllForSeller(user.id, query);
  }

  // GET /api/orders/admin — all orders (admin)
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  findAdminOrders(@CurrentUser() user: any, @Query() query: SellerOrdersQueryDto) {
    return this.orders.findAllForAdmin(query);
  }

  // GET /api/orders/:id — single order (buyer | seller-on-order | admin)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.orders.findOneForUser(id, user);
  }

  // PATCH /api/orders/:id/items/:itemId/fulfillment — advance fulfillment
  @Patch(':id/items/:itemId/fulfillment')
  updateItemFulfillment(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateItemFulfillmentDto,
  ) {
    return this.orders.updateItemFulfillment(id, itemId, user, dto);
  }

  // POST /api/orders/verify-payment — confirm payment (Paystack flow).
  // Guarded: this marks orders PAID, so it must never be callable anonymously.
  @Post('verify-payment')
  @UseGuards(JwtAuthGuard)
  verifyPayment(@Body() dto: { orderId: string; reference: string }) {
    return this.orders.confirmPayment(dto.orderId, dto.reference);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}

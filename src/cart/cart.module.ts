// ============================================================
// KOVA API — Cart Module (Prisma 8)
// Server-side cart for guests (sessionId) and users.
// ============================================================

import {
  Injectable,
  NotFoundException,
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { db } from '../prisma/db';

// ── DTOs ──────────────────────────────────────────────────

export class AddToCartDto {
  @IsString() productId: string;
  @IsNumber() @Min(1) @Type(() => Number) quantity: number;
}

export class UpdateCartItemDto {
  @IsNumber() @Min(0) @Type(() => Number) quantity: number;
}

// ── Service ───────────────────────────────────────────────

/** Decimal → JSON-safe number (Naira, 2dp max). */
export function money(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/** Convert a product's Decimal money fields to plain numbers. */
function serializeProduct<T extends { price: unknown; originalPrice?: unknown }>(p: T): T {
  return { ...p, price: money(p.price), originalPrice: p.originalPrice ? money(p.originalPrice) : null };
}

@Injectable()
export class CartService {
  async getCart(sessionId: string) {
    const items = await db.orm.public.CartItem
      .where({ sessionId })
      .include('product')
      .orderBy((item) => item.createdAt.asc())
      .all();

    const serialized = items.map((item) => ({ ...item, product: serializeProduct(item.product) }));

    // Money math in kobo-equivalent cents to avoid float drift
    const subtotalCents = serialized.reduce(
      (sum, item) => sum + Math.round(money(item.product.price) * 100) * item.quantity,
      0,
    );
    const subtotal = subtotalCents / 100;
    const shipping = subtotal >= 50000 ? 0 : subtotal > 0 ? 2500 : 0; // ₦2,500 flat, free over ₦50,000
    const total = subtotal + shipping;

    return { items: serialized, subtotal, shipping, total, count: items.length };
  }

  async addItem(sessionId: string, dto: AddToCartDto) {
    // Verify product exists
    const product = await db.orm.public.Product.where({ id: dto.productId }).first();
    if (!product) throw new NotFoundException('Product not found');

    // Upsert — add or increment quantity. Prisma 8 has no { increment } in
    // updates, so the read-then-write runs inside a transaction.
    return db.transaction(async (tx) => {
      const existing = await tx.orm.public.CartItem
        .where({ sessionId, productId: dto.productId })
        .first();
      if (existing) {
        return tx.orm.public.CartItem
          .where({ id: existing.id })
          .include('product')
          .update({ quantity: existing.quantity + dto.quantity });
      }
      return tx.orm.public.CartItem
        .include('product')
        .create({ sessionId, productId: dto.productId, quantity: dto.quantity });
    });
  }

  async updateItem(
    sessionId: string,
    productId: string,
    dto: UpdateCartItemDto,
  ) {
    if (dto.quantity === 0) {
      return this.removeItem(sessionId, productId);
    }

    const updated = await db.orm.public.CartItem
      .where({ sessionId, productId })
      .update({ quantity: dto.quantity });
    if (!updated) throw new NotFoundException('Cart item not found');
    return db.orm.public.CartItem.where({ id: updated.id }).include('product').first();
  }

  async removeItem(sessionId: string, productId: string) {
    await db.orm.public.CartItem.where({ sessionId, productId }).delete();
    return { message: 'Item removed' };
  }

  async clearCart(sessionId: string) {
    await db.orm.public.CartItem.where({ sessionId }).deleteAll();
    return { message: 'Cart cleared' };
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('cart')
export class CartController {
  constructor(private cart: CartService) {}

  // Session ID comes from x-session-id header
  // Frontend generates this: crypto.randomUUID() stored in localStorage

  // GET /api/cart
  @Get()
  getCart(@Headers('x-session-id') sessionId: string) {
    return this.cart.getCart(sessionId || 'guest');
  }

  // POST /api/cart
  @Post()
  addItem(
    @Headers('x-session-id') sessionId: string,
    @Body() dto: AddToCartDto,
  ) {
    return this.cart.addItem(sessionId || 'guest', dto);
  }

  // PATCH /api/cart/:productId
  @Patch(':productId')
  updateItem(
    @Headers('x-session-id') sessionId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItem(sessionId || 'guest', productId, dto);
  }

  // DELETE /api/cart/:productId
  @Delete(':productId')
  removeItem(
    @Headers('x-session-id') sessionId: string,
    @Param('productId') productId: string,
  ) {
    return this.cart.removeItem(sessionId || 'guest', productId);
  }

  // DELETE /api/cart
  @Delete()
  clearCart(@Headers('x-session-id') sessionId: string) {
    return this.cart.clearCart(sessionId || 'guest');
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [CartService],
  controllers: [CartController],
  exports: [CartService],
})
export class CartModule {}

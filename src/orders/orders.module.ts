// ============================================================
// KOVA API — Orders Module
// Create orders, track status, payment verification.
// ============================================================

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  IsArray,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

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
  shippingAddress?: Record<string, any>;
}

export class VerifyPaymentDto {
  @IsString() reference: string;
  @IsString() orderId: string;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto) {
    // Fetch all products to get real prices
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products not found');
    }

    // Build items with locked prices
    const orderItems = dto.items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: product.price,
      };
    });

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const shipping = subtotal >= 50 ? 0 : 4.99;
    const total = subtotal + shipping;

    // Create order in DB
    const order = await this.prisma.order.create({
      data: {
        userId,
        subtotal,
        shipping,
        total,
        shippingAddress: dto.shippingAddress,
        items: {
          create: orderItems,
        },
      },
      include: {
        items: { include: { product: true } },
      },
    });

    return order;
  }

  async findAll(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: {
        items: { include: { product: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // Called after Paystack confirms payment
  async confirmPayment(orderId: string, reference: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Prevent double-confirming paid orders
    if (order.paymentStatus === 'PAID') {
      return this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { product: true } },
        },
      });
    }

    // Update order to paid + processing
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'PAID',
        paymentRef: reference,
        status: 'PROCESSING',
      },
      include: {
        items: { include: { product: true } },
      },
    });

    // Increment buyCount for each product
    for (const item of updated.items) {
      await this.prisma.product.update({
        where: { id: item.productId },
        data: { buyCount: { increment: item.quantity } },
      });
    }

    return updated;
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.order.update({
      where: { id },
      data: { status: status as any },
    });
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private orders: OrdersService) {}

  // POST /api/orders — create new order
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.id, dto);
  }

  // GET /api/orders — my orders
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.orders.findAll(user.id);
  }

  // GET /api/orders/:id — single order
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.orders.findOne(id, user.id);
  }

  // POST /api/orders/verify-payment — confirm payment
  @Post('verify-payment')
  verifyPayment(@Body() dto: VerifyPaymentDto) {
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
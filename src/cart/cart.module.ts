// ============================================================
// KOVA API — Cart Module
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
import { PrismaService } from '../prisma/prisma.module';

// ── DTOs ──────────────────────────────────────────────────

export class AddToCartDto {
  @IsString() productId: string;
  @IsNumber() @Min(1) @Type(() => Number) quantity: number;
}

export class UpdateCartItemDto {
  @IsNumber() @Min(0) @Type(() => Number) quantity: number;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  async getCart(sessionId: string) {
    const items = await this.prisma.cartItem.findMany({
      where: { sessionId },
      include: { product: true },
      orderBy: { createdAt: 'asc' },
    });

    const subtotal = items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );
    const shipping = subtotal >= 50 ? 0 : subtotal > 0 ? 4.99 : 0;
    const total = subtotal + shipping;

    return { items, subtotal, shipping, total, count: items.length };
  }

  async addItem(sessionId: string, dto: AddToCartDto) {
    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Upsert — add or increment quantity
    return this.prisma.cartItem.upsert({
      where: { sessionId_productId: { sessionId, productId: dto.productId } },
      update: { quantity: { increment: dto.quantity } },
      create: {
        sessionId,
        productId: dto.productId,
        quantity: dto.quantity,
      },
      include: { product: true },
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

    return this.prisma.cartItem.update({
      where: { sessionId_productId: { sessionId, productId } },
      data: { quantity: dto.quantity },
      include: { product: true },
    });
  }

  async removeItem(sessionId: string, productId: string) {
    await this.prisma.cartItem.delete({
      where: { sessionId_productId: { sessionId, productId } },
    });
    return { message: 'Item removed' };
  }

  async clearCart(sessionId: string) {
    await this.prisma.cartItem.deleteMany({ where: { sessionId } });
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

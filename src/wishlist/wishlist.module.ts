// ============================================================
// KOVA API — Wishlist Module
// Persistent wishlist for authenticated users.
// GET    /api/wishlist            — my wishlist (products included)
// POST   /api/wishlist/:productId — add
// DELETE /api/wishlist/:productId — remove
// ============================================================

import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

// ── Service ───────────────────────────────────────────────

@Injectable()
export class WishlistService {
  constructor(private prisma: PrismaService) {}

  async getMyWishlist(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            originalPrice: true,
            productType: true,
            images: true,
            inStock: true,
            status: true,
            rating: true,
            reviewCount: true,
            category: { select: { name: true, slug: true } },
            seller: {
              select: {
                id: true,
                name: true,
                sellerProfile: { select: { storeName: true } },
              },
            },
          },
        },
      },
    });
    // Only show products that are still publicly available
    return { items: items.filter((i) => i.product && i.product.status === 'PUBLISHED') };
  }

  async add(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true },
    });
    if (!product || product.status !== 'PUBLISHED') {
      throw new NotFoundException('Product not found');
    }

    const existing = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (existing) return existing;

    return this.prisma.wishlistItem.create({
      data: { userId, productId },
    });
  }

  async remove(userId: string, productId: string) {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (!item) throw new NotFoundException('Not in your wishlist');
    if (item.userId !== userId) throw new ForbiddenException('Not your wishlist item');

    await this.prisma.wishlistItem.delete({
      where: { id: item.id },
    });
    return { message: 'Removed from wishlist' };
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private wishlist: WishlistService) {}

  @Get()
  getMine(@CurrentUser() user: any) {
    return this.wishlist.getMyWishlist(user.id);
  }

  @Post(':productId')
  add(@CurrentUser() user: any, @Param('productId') productId: string) {
    return this.wishlist.add(user.id, productId);
  }

  @Delete(':productId')
  remove(@CurrentUser() user: any, @Param('productId') productId: string) {
    return this.wishlist.remove(user.id, productId);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [WishlistService],
  controllers: [WishlistController],
  exports: [WishlistService],
})
export class WishlistModule {}

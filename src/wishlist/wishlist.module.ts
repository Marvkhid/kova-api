// ============================================================
// KOVA API — Wishlist Module (Prisma 8)
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
import { db } from '../prisma/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

// ── Service ───────────────────────────────────────────────

@Injectable()
export class WishlistService {
  async getMyWishlist(userId: string) {
    const items = await db.orm.public.WishlistItem
      .where({ userId })
      .include('product', (product) =>
        product
          .include('category', (category) => category.select('name', 'slug'))
          .include('seller', (seller) =>
            seller.include('sellerProfile', (profile) => profile.select('storeName')),
          ),
      )
      .orderBy((item) => item.createdAt.desc())
      .all();
    // Only show products that are still publicly available
    return {
      items: items.filter(
        (i) => i.product && i.product.status === 'PUBLISHED',
      ),
    };
  }

  async add(userId: string, productId: string) {
    const product = await db.orm.public.Product
      .where({ id: productId })
      .select('id', 'status')
      .first();
    if (!product || product.status !== 'PUBLISHED') {
      throw new NotFoundException('Product not found');
    }

    const existing = await db.orm.public.WishlistItem
      .where({ userId, productId })
      .first();
    if (existing) return existing;

    return db.orm.public.WishlistItem.create({ userId, productId });
  }

  async remove(userId: string, productId: string) {
    const item = await db.orm.public.WishlistItem
      .where({ userId, productId })
      .first();
    if (!item) throw new NotFoundException('Not in your wishlist');
    if (item.userId !== userId) throw new ForbiddenException('Not your wishlist item');

    await db.orm.public.WishlistItem.where({ id: item.id }).delete();
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

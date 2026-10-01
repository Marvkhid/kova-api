// ============================================================
// KOVA API — Reviews Module (v2, Prisma 8)
// Product reviews + seller reputation reviews.
//   • verifiedPurchase is computed SERVER-SIDE from real PAID
//     OrderItems — the client can never assert it.
//   • Product.rating / reviewCount are true aggregates
//     recomputed from Review rows on every mutation.
//   • One review per user per product (DB unique constraint).
//   • Seller reviews: one per buyer per store, 1-5 overall plus
//     optional experience dimensions; store averages are
//     computed on demand in the sellers module.
//   • Moderation: admin can hide/restore reviews; hidden reviews
//     never appear publicly and are excluded from aggregates.
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
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { db } from '../prisma/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

// ── Helpers ───────────────────────────────────────────────

/** Decimal → number (kobo-exact: round at 2dp). */
function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value) * 100) / 100;
}

/** Recompute a product's rating aggregate from its VISIBLE reviews. */
async function recomputeProductRating(productId: string) {
  const agg = await db.orm.public.Review
    .where({ productId, status: 'VISIBLE' })
    .aggregate((a) => ({ avgRating: a.avg('rating'), total: a.count() }));
  await db.orm.public.Product.where({ id: productId }).update({
    rating: agg.avgRating ? Math.round(Number(agg.avgRating) * 10) / 10 : 0,
    reviewCount: Number(agg.total),
  });
}

/** Server-side verified-purchase check — the ONLY source of truth. */
async function isVerifiedPurchase(
  userId: string,
  productId: string,
): Promise<boolean> {
  const paidItem = await db.orm.public.OrderItem
    .where({ productId })
    .where((item) => item.order.some({ userId, paymentStatus: 'PAID' }))
    .select('id')
    .first();
  return paidItem !== null;
}

// ── DTOs ──────────────────────────────────────────────────

// NOTE: declared before SubmitReviewDto — @ValidateNested() emits a
// design:type metadata reference at class-evaluation time, so the
// nested DTO must already be initialized (avoids a TDZ runtime crash).
export class SellerRatingDto {
  @IsInt() @Min(1) @Max(5) @Type(() => Number) rating: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) @Type(() => Number) communication?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) @Type(() => Number) productAccuracy?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) @Type(() => Number) packaging?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) @Type(() => Number) deliveryExperience?: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class SubmitReviewDto {
  @IsString() productId: string;
  @IsInt() @Min(1) @Max(5) @Type(() => Number) rating: number;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;

  /** Optional same-submit seller rating (only honored if verified purchase). */
  @IsOptional() @IsObject() @ValidateNested()
  @Type(() => SellerRatingDto)
  sellerRating?: SellerRatingDto;
}

export class UpdateReviewDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) @Type(() => Number) rating?: number;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class ModerateReviewDto {
  @IsString() status: 'VISIBLE' | 'HIDDEN';
}

export class ReviewListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() sellerId?: string;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class ReviewsService {
  /** Public review list + honest summary for a product page. */
  async getProductReviews(productId: string, page = 1, limit = 10) {
    const product = await db.orm.public.Product
      .where({ id: productId })
      .select('id', 'slug', 'name')
      .first();
    if (!product) throw new NotFoundException('Product not found');

    const [reviews, total, distribution] = await Promise.all([
      db.orm.public.Review
        .where({ productId, status: 'VISIBLE' })
        .include('user', (user) => user.select('id', 'name', 'avatarUrl'))
        .orderBy((r) => r.createdAt.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all(),
      db.orm.public.Review.where({ productId, status: 'VISIBLE' })
        .aggregate((a) => ({ total: a.count() }))
        .then((r) => Number(r.total)),
      db.orm.public.Review
        .where({ productId, status: 'VISIBLE' })
        .groupBy('rating')
        .aggregate((a) => ({ count: a.count() })),
    ]);

    const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distribution) buckets[row.rating as number] = Number(row.count);

    return {
      product: { id: product.id, slug: product.slug, name: product.name },
      reviews: reviews.map((r) => this.serializeReview(r)),
      summary: {
        average: this.summaryAverage(total, distribution),
        total,
        distribution: buckets,
      },
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private summaryAverage(
    total: number,
    distribution: { rating: unknown; count: unknown }[],
  ): number {
    if (total === 0) return 0;
    const weighted = distribution.reduce((s, r) => s + Number(r.rating) * Number(r.count), 0);
    const sum = distribution.reduce((s, r) => s + Number(r.count), 0);
    return sum > 0 ? Math.round((weighted / sum) * 10) / 10 : 0;
  }

  private serializeReview(review: any) {
    return {
      id: review.id,
      rating: review.rating,
      title: review.title ?? null,
      comment: review.comment ?? null,
      verifiedPurchase: review.verifiedPurchase,
      status: review.status,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      user: review.user
        ? { id: review.user.id, name: review.user.name, avatarUrl: review.user.avatarUrl }
        : null,
    };
  }

  /**
   * Submit a product review. Rules enforced server-side:
   *   • one review per user per product (unique constraint)
   *   • verifiedPurchase computed from real PAID orders
   *   • cannot review your own product
   *   • optional seller rating only recorded on verified purchases
   */
  async submitReview(userId: string, dto: SubmitReviewDto) {
    const product = await db.orm.public.Product
      .where({ id: dto.productId })
      .select('id', 'sellerId', 'status')
      .first();
    if (!product) throw new NotFoundException('Product not found');

    if (product.sellerId === userId) {
      throw new BadRequestException('You cannot review your own product');
    }

    const verified = await isVerifiedPurchase(userId, dto.productId);

    const existing = await db.orm.public.Review
      .where({ userId, productId: dto.productId })
      .first();
    if (existing) {
      throw new BadRequestException(
        'You already reviewed this product — edit your review instead',
      );
    }

    const review = await db.transaction(async (tx) => {
      const created = await tx.orm.public.Review
        .include('user', (user) => user.select('id', 'name', 'avatarUrl'))
        .create({
          userId,
          productId: dto.productId,
          rating: dto.rating,
          title: dto.title?.trim() || null,
          comment: dto.comment?.trim() || null,
          verifiedPurchase: verified,
        });

      // Seller reputation rides along only on verified purchases
      if (dto.sellerRating && verified) {
        const existingSellerReview = await tx.orm.public.SellerReview
          .where({ sellerUserId: product.sellerId, authorId: userId })
          .first();
        const sellerRatingFields = {
          rating: dto.sellerRating.rating,
          communication: dto.sellerRating.communication ?? null,
          productAccuracy: dto.sellerRating.productAccuracy ?? null,
          packaging: dto.sellerRating.packaging ?? null,
          deliveryExperience: dto.sellerRating.deliveryExperience ?? null,
          comment: dto.sellerRating.comment?.trim() || null,
        };
        if (existingSellerReview) {
          await tx.orm.public.SellerReview
            .where({ id: existingSellerReview.id })
            .update(sellerRatingFields);
        } else {
          await tx.orm.public.SellerReview
            .create({ sellerUserId: product.sellerId, authorId: userId, ...sellerRatingFields });
        }
      }

      return created;
    });

    await recomputeProductRating(dto.productId);
    return this.serializeReview(review);
  }

  /** My review for a product (drives the edit form on the PDP). */
  async getMyReview(userId: string, productId: string) {
    const review = await db.orm.public.Review
      .where({ userId, productId })
      .first();
    // Also tell the buyer whether they're eligible (purchased + paid)
    const verified = await isVerifiedPurchase(userId, productId);
    return {
      review: review ? this.serializeReview(review) : null,
      verifiedPurchase: verified,
    };
  }

  /** My reviews across the marketplace. */
  async getMyReviews(userId: string) {
    const reviews = await db.orm.public.Review
      .where({ userId })
      .include('product', (product) => product.select('id', 'name', 'slug', 'images', 'price'))
      .orderBy((r) => r.createdAt.desc())
      .all();
    return reviews.map((r) => ({
      ...this.serializeReview(r),
      product: r.product
        ? { ...r.product, price: toNum(r.product.price) }
        : null,
    }));
  }

  /** Author edit — aggregates recomputed, moderation status untouched. */
  async updateReview(reviewId: string, userId: string, dto: UpdateReviewDto) {
    const review = await db.orm.public.Review.where({ id: reviewId }).first();
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) {
      throw new ForbiddenException('You can only edit your own review');
    }

    const updated = await db.orm.public.Review
      .include('user', (user) => user.select('id', 'name', 'avatarUrl'))
      .where({ id: reviewId })
      .update({
        ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() || null } : {}),
        ...(dto.comment !== undefined ? { comment: dto.comment.trim() || null } : {}),
      });

    await recomputeProductRating(review.productId);
    return this.serializeReview(updated);
  }

  /** Author delete — aggregates recomputed. */
  async deleteReview(reviewId: string, userId: string, isAdmin: boolean) {
    const review = await db.orm.public.Review.where({ id: reviewId }).first();
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId && !isAdmin) {
      throw new ForbiddenException('You can only delete your own review');
    }
    await db.orm.public.Review.where({ id: reviewId }).delete();
    await recomputeProductRating(review.productId);
    return { message: 'Review deleted' };
  }

  // ── Seller reviews (reputation) ──────────────────────────

  /** Public seller-review list + aggregate for the store page. */
  async getSellerReviews(sellerUserId: string, page = 1, limit = 10) {
    const seller = await db.orm.public.User
      .where({ id: sellerUserId })
      .include('sellerProfile', (profile) => profile.select('storeName', 'storeSlug'))
      .select('id', 'name')
      .first();
    if (!seller) throw new NotFoundException('Seller not found');

    const [reviews, total, agg] = await Promise.all([
      db.orm.public.SellerReview
        .where({ sellerUserId, status: 'VISIBLE' })
        .include('author', (author) => author.select('id', 'name', 'avatarUrl'))
        .orderBy((r) => r.createdAt.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all(),
      db.orm.public.SellerReview.where({ sellerUserId, status: 'VISIBLE' })
        .aggregate((a) => ({ total: a.count() }))
        .then((r) => Number(r.total)),
      db.orm.public.SellerReview
        .where({ sellerUserId, status: 'VISIBLE' })
        .aggregate((a) => ({
          avgRating: a.avg('rating'),
          avgCommunication: a.avg('communication'),
          avgProductAccuracy: a.avg('productAccuracy'),
          avgPackaging: a.avg('packaging'),
          avgDeliveryExperience: a.avg('deliveryExperience'),
        })),
    ]);

    const round1 = (v: unknown) => (v ? Math.round(Number(v) * 10) / 10 : null);

    return {
      seller: { id: seller.id, name: seller.name, store: seller.sellerProfile },
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        communication: r.communication,
        productAccuracy: r.productAccuracy,
        packaging: r.packaging,
        deliveryExperience: r.deliveryExperience,
        comment: r.comment,
        createdAt: r.createdAt,
        author: r.author
          ? { id: r.author.id, name: r.author.name, avatarUrl: r.author.avatarUrl }
          : null,
      })),
      summary: {
        average: agg.avgRating ? Math.round(Number(agg.avgRating) * 10) / 10 : 0,
        total,
        dimensions: {
          communication: round1(agg.avgCommunication),
          productAccuracy: round1(agg.avgProductAccuracy),
          packaging: round1(agg.avgPackaging),
          deliveryExperience: round1(agg.avgDeliveryExperience),
        },
      },
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ── Admin ────────────────────────────────────────────────

  /** Admin list across product + seller reviews, filterable. */
  async listForAdmin(query: ReviewListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;

    const productWhere: Record<string, unknown> = {};
    if (query.productId) productWhere.productId = query.productId;
    if (query.status) productWhere.status = query.status.toUpperCase();

    const [productReviews, productTotal] = await Promise.all([
      db.orm.public.Review
        .where(productWhere)
        .include('user', (user) => user.select('id', 'name', 'email'))
        .include('product', (product) => product.select('id', 'name', 'slug'))
        .orderBy((r) => r.createdAt.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all(),
      db.orm.public.Review.where(productWhere).aggregate((a) => ({ total: a.count() })),
    ]);

    const sellerWhere: Record<string, unknown> = {};
    if (query.sellerId) sellerWhere.sellerUserId = query.sellerId;
    if (query.status) sellerWhere.status = query.status.toUpperCase();

    const [sellerReviews, sellerTotal] = await Promise.all([
      db.orm.public.SellerReview
        .where(sellerWhere)
        .include('author', (author) => author.select('id', 'name', 'email'))
        .include('seller', (seller) =>
          seller.include('sellerProfile', (profile) => profile.select('storeName')),
        )
        .orderBy((r) => r.createdAt.desc())
        .limit(limit)
        .all(),
      db.orm.public.SellerReview.where(sellerWhere).aggregate((a) => ({ total: a.count() })),
    ]);

    return {
      productReviews: productReviews.map((r) => ({
        id: r.id,
        kind: 'PRODUCT' as const,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        verifiedPurchase: r.verifiedPurchase,
        status: r.status,
        createdAt: r.createdAt,
        author: r.user,
        target: r.product,
      })),
      sellerReviews: sellerReviews.map((r) => ({
        id: r.id,
        kind: 'SELLER' as const,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        createdAt: r.createdAt,
        author: r.author,
        target: r.seller,
      })),
      totals: { productReviews: Number(productTotal.total), sellerReviews: Number(sellerTotal.total) },
      page,
      pages: Math.max(1, Math.ceil(Math.max(Number(productTotal.total), Number(sellerTotal.total)) / limit)),
    };
  }

  /** Moderation — hide or restore. Aggregates follow visibility. */
  async moderateProductReview(reviewId: string, status: 'VISIBLE' | 'HIDDEN') {
    const review = await db.orm.public.Review.where({ id: reviewId }).first();
    if (!review) throw new NotFoundException('Review not found');
    await db.orm.public.Review.where({ id: reviewId }).update({ status });
    await recomputeProductRating(review.productId);
    return { message: `Review ${status === 'HIDDEN' ? 'hidden' : 'restored'}` };
  }

  async moderateSellerReview(reviewId: string, status: 'VISIBLE' | 'HIDDEN') {
    const review = await db.orm.public.SellerReview.where({ id: reviewId }).first();
    if (!review) throw new NotFoundException('Review not found');
    await db.orm.public.SellerReview.where({ id: reviewId }).update({ status });
    return { message: `Seller review ${status === 'HIDDEN' ? 'hidden' : 'restored'}` };
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('reviews')
export class ReviewsController {
  constructor(private reviews: ReviewsService) {}

  // GET /api/reviews/product/:productId — public reviews + summary
  @Get('product/:productId')
  getProductReviews(
    @Param('productId') productId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviews.getProductReviews(
      productId,
      page ? Math.max(1, parseInt(page, 10) || 1) : 1,
      limit ? Math.min(50, Math.max(1, parseInt(limit, 10) || 10)) : 10,
    );
  }

  // GET /api/reviews/seller/:sellerUserId — public seller reputation
  @Get('seller/:sellerUserId')
  getSellerReviews(
    @Param('sellerUserId') sellerUserId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviews.getSellerReviews(
      sellerUserId,
      page ? Math.max(1, parseInt(page, 10) || 1) : 1,
      limit ? Math.min(50, Math.max(1, parseInt(limit, 10) || 10)) : 10,
    );
  }

  // POST /api/reviews — submit a product review (auth required)
  @Post()
  @UseGuards(JwtAuthGuard)
  submit(@CurrentUser() user: any, @Body() dto: SubmitReviewDto) {
    return this.reviews.submitReview(user.id, dto);
  }

  // GET /api/reviews/mine — my reviews
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  getMine(@CurrentUser() user: any) {
    return this.reviews.getMyReviews(user.id);
  }

  // GET /api/reviews/mine/:productId — my review for a product + eligibility
  @Get('mine/:productId')
  @UseGuards(JwtAuthGuard)
  getMineForProduct(@CurrentUser() user: any, @Param('productId') productId: string) {
    return this.reviews.getMyReview(user.id, productId);
  }

  // PATCH /api/reviews/:id — author edit
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateReviewDto) {
    return this.reviews.updateReview(id, user.id, dto);
  }

  // DELETE /api/reviews/:id — author or admin
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.reviews.deleteReview(id, user.id, user.role === 'ADMIN');
  }

  // ── Admin ────────────────────────────────────────────────

  // GET /api/reviews/admin — moderation list
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listForAdmin(@Query() query: ReviewListQueryDto) {
    return this.reviews.listForAdmin(query);
  }

  // PATCH /api/reviews/admin/product/:id/moderate
  @Patch('admin/product/:id/moderate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  moderateProduct(@Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.reviews.moderateProductReview(id, dto.status);
  }

  // PATCH /api/reviews/admin/seller/:id/moderate
  @Patch('admin/seller/:id/moderate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  moderateSeller(@Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.reviews.moderateSellerReview(id, dto.status);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [ReviewsService],
  controllers: [ReviewsController],
  exports: [ReviewsService],
})
export class ReviewsModule {}

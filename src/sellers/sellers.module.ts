// ============================================================
// KOVA API — Sellers Module (Prisma 8)
// Seller onboarding + governance + honest dashboard analytics.
//
// Lifecycle (v4):
//   apply (PENDING) → admin review → APPROVED / REJECTED
//   APPROVED → publish products (moderation rules apply)
//   REJECTED → update profile → submit for review again
//   SUSPENDED / BLOCKED → seller functions disabled server-side
//
// Metrics are computed live from real data. When there are no
// sales yet, the numbers are zero — never fabricated.
// ============================================================

import {
  BadRequestException,
  Body,
  ConflictException,
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
import { IsString, IsOptional, IsEmail, MinLength, MaxLength, Matches } from 'class-validator';
import { db, now } from '../prisma/db';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { MailerService } from '../auth/mailer.service';

// ── Constants ─────────────────────────────────────────────

/** Current public version of the Seller Terms (/seller-terms). */
export const SELLER_TERMS_VERSION = '1.0';

// ── DTOs ──────────────────────────────────────────────────

export class CreateSellerProfileDto {
  @IsString() @MinLength(2) @MaxLength(60) storeName: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class UpdateSellerProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) storeName?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(80) location?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @Matches(/^\+?[0-9()\-\s]{7,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(400) bannerUrl?: string;
  @IsOptional() @IsString() @IsEmail() payoutEmail?: string;
}

/** Body of POST /sellers/apply — submit the application for review. */
export class ApplySellerDto {
  @IsString() @Matches(/^1\.0$/, { message: 'You must accept Seller Terms v1.0' })
  termsVersion: string;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class SellersService {
  constructor(private mailer: MailerService) {}

  /** Become a seller — same account, role upgraded, starts PENDING. */
  async createProfile(user: any, dto: CreateSellerProfileDto) {
    const existing = await db.orm.public.SellerProfile
      .where({ userId: user.id })
      .first();
    if (existing) throw new ConflictException('You already have a seller profile');

    const baseSlug =
      dto.storeName
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'store';

    // Collision-safe store slug
    let slug = baseSlug;
    let n = 2;
    while (await db.orm.public.SellerProfile.where({ storeSlug: slug }).first()) {
      slug = `${baseSlug}-${n++}`;
    }

    return db.transaction(async (tx) => {
      await tx.orm.public.User.where({ id: user.id }).update({ role: 'SELLER' });
      return tx.orm.public.SellerProfile.create({
        userId: user.id,
        storeName: dto.storeName,
        storeSlug: slug,
        description: dto.description ?? null,
        sellerStatus: 'PENDING',
      });
    });
  }

  /**
   * PATCH /sellers/profile — update store details. Rejected sellers
   * may edit and re-apply; approved ones keep their storefront fresh.
   */
  async updateProfile(user: any, dto: UpdateSellerProfileDto) {
    const profile = await db.orm.public.SellerProfile
      .where({ userId: user.id })
      .first();
    if (!profile) throw new NotFoundException('Seller profile not found');
    if (profile.sellerStatus === 'BLOCKED') {
      throw new ForbiddenException('This seller account is blocked');
    }

    return db.orm.public.SellerProfile.where({ userId: user.id }).update(dto);
  }

  /**
   * POST /sellers/apply — submit (or re-submit) the application for
   * admin review. Requires explicit acceptance of the current terms
   * version; records who accepted what and when.
   */
  async submitApplication(user: any, dto: ApplySellerDto) {
    if (dto.termsVersion !== SELLER_TERMS_VERSION) {
      throw new BadRequestException(
        `You must accept the current Seller Terms (v${SELLER_TERMS_VERSION})`,
      );
    }

    const profile = await db.orm.public.SellerProfile
      .where({ userId: user.id })
      .first();
    if (!profile) throw new NotFoundException('Create your seller profile first');

    if (profile.sellerStatus === 'APPROVED') {
      throw new ConflictException('Your seller account is already approved');
    }
    if (profile.sellerStatus === 'SUSPENDED' || profile.sellerStatus === 'BLOCKED') {
      throw new ForbiddenException(
        `This seller account is ${profile.sellerStatus.toLowerCase()} — contact support`,
      );
    }

    // Minimal completeness bar before an application can be submitted
    if (!profile.description?.trim() || !profile.location?.trim()) {
      throw new BadRequestException(
        'Add a store description and location before submitting for review',
      );
    }

    const updated = await db.orm.public.SellerProfile
      .where({ userId: user.id })
      .update({
        sellerStatus: 'PENDING',
        appliedAt: now(),
        rejectedAt: null,
        rejectionReason: null,
        termsVersion: dto.termsVersion,
        termsAcceptedAt: now(),
      });
    return { profile: updated, message: 'Application submitted — our team will review it shortly.' };
  }

  async getProfile(user: any) {
    const profile = await db.orm.public.SellerProfile
      .where({ userId: user.id })
      .include('user', (u) => u.select('name', 'email', 'avatarUrl', 'phone'))
      .first();
    if (!profile) throw new NotFoundException('Seller profile not found');
    return profile;
  }

  /** Dashboard stats — computed live, honest zeros when empty. */
  async getDashboardStats(userId: string) {
    const [products, paidOrderItems, sellerProfile] = await Promise.all([
      db.orm.public.Product
        .where({ sellerId: userId })
        .include('category', (c) => c.select('name', 'slug'))
        .select(
          'id', 'name', 'slug', 'price', 'productType', 'status', 'images',
          'viewCount', 'buyCount', 'rating', 'reviewCount', 'moderationReason', 'createdAt',
        )
        .orderBy((p) => p.createdAt.desc())
        .all(),
      db.orm.public.OrderItem
        .where((item) => item.order.some({ paymentStatus: 'PAID' }))
        .where((item) => item.product.some({ sellerId: userId }))
        .select('quantity', 'price', 'createdAt')
        .all(),
      db.orm.public.SellerProfile.where({ userId }).first(),
    ]);
    // A user without a seller profile has no seller dashboard — signal
    // the onboarding gate (/sell) with 404 rather than an empty shell.
    if (!sellerProfile) {
      throw new NotFoundException('Seller profile not found');
    }
    const profile = sellerProfile;

    const counts = {
      totalProducts: products.length,
      published: products.filter((p) => p.status === 'PUBLISHED').length,
      drafts: products.filter((p) => p.status === 'DRAFT').length,
      pendingReview: products.filter((p) => p.status === 'PENDING_REVIEW').length,
      rejected: products.filter((p) => p.status === 'REJECTED').length,
      unpublished: products.filter((p) => p.status === 'UNPUBLISHED').length,
      digital: products.filter((p) => p.productType === 'DIGITAL').length,
      physical: products.filter((p) => p.productType === 'PHYSICAL').length,
      totalViews: products.reduce((sum, p) => sum + p.viewCount, 0),
      totalSales: paidOrderItems.reduce((sum, i) => sum + i.quantity, 0),
      // Decimal-safe revenue: cents arithmetic, converted once at the end
      totalRevenue:
        paidOrderItems.reduce(
          (sum, i) => sum + Math.round(Number(i.price) * 100) * i.quantity,
          0,
        ) / 100,
      avgRating: 0 as number,
    };

    // Real rating average across published products (0 when no reviews)
    const rated = products.filter((p) => p.reviewCount > 0);
    counts.avgRating = rated.length
      ? Math.round((rated.reduce((s, p) => s + p.rating, 0) / rated.length) * 10) / 10
      : 0;

    // Decimal prices → JSON-safe numbers
    const recentProducts = products.slice(0, 12).map((p) => ({
      ...p,
      price: Number(p.price),
    }));

    return { stats: counts, products: recentProducts, profile };
  }

  /**
   * Featured sellers — homepage discovery cards from live data only.
   * Only APPROVED storefronts appear; suspended/blocked stores vanish
   * from discovery the moment moderation flips their status.
   */
  async listFeatured(limit = 8) {
    const profiles = await db.orm.public.SellerProfile
      .where({ sellerStatus: 'APPROVED' })
      .where((profile) => profile.user.some((u) => u.products.some({ status: 'PUBLISHED' })))
      .include('user', (u) =>
        u.include('products', (products) =>
          products
            .where({ status: 'PUBLISHED' })
            .select(
              'id', 'name', 'slug', 'price', 'images',
              'rating', 'reviewCount', 'productType',
            )
            .orderBy((pr) => pr.rating.desc())
            .orderBy((pr) => pr.reviewCount.desc())
            .limit(3),
        ),
      )
      .all();

    // Product counts in one grouped query
    const grouped = await db.orm.public.Product
      .where({ status: 'PUBLISHED' })
      .where((p) => p.seller.some((s) => s.sellerProfile.some({ sellerStatus: 'APPROVED' })))
      .groupBy('sellerId')
      .aggregate((a) => ({ count: a.count() }));
    const stats = new Map(grouped.map((g) => [g.sellerId, { count: Number(g.count) }]));

    // Store rating = average across RATED products only (zeros excluded,
    // matching the seller dashboard's honest math).
    const ratedRows = await db.orm.public.Product
      .where({ status: 'PUBLISHED' })
      .where((p) => p.reviewCount.gt(0))
      .where((p) => p.seller.some((s) => s.sellerProfile.some({ sellerStatus: 'APPROVED' })))
      .select('sellerId', 'rating')
      .all();
    const ratedSum = new Map<string, { sum: number; n: number }>();
    for (const r of ratedRows) {
      const cur = ratedSum.get(r.sellerId) ?? { sum: 0, n: 0 };
      cur.sum += r.rating;
      cur.n += 1;
      ratedSum.set(r.sellerId, cur);
    }

    // Rank: established stores (more products) first, then rating
    const cards = profiles
      .map((p) => {
        const s = stats.get(p.userId) ?? { count: 0 };
        const rated = ratedSum.get(p.userId);
        return {
          storeName: p.storeName,
          storeSlug: p.storeSlug,
          description: p.description,
          location: p.location,
          logoUrl: p.logoUrl,
          bannerUrl: p.bannerUrl,
          isVerified: p.sellerStatus === 'APPROVED',
          productCount: s.count,
          avgRating: rated ? Math.round((rated.sum / rated.n) * 10) / 10 : null,
          previewProducts: (p.user as any).products.map((pr: any) => ({ ...pr, price: Number(pr.price) })),
        };
      })
      .sort((a, b) => b.productCount - a.productCount || (b.avgRating ?? 0) - (a.avgRating ?? 0))
      .slice(0, limit);
    return cards;
  }

  // Public store page
  /** Public store page (paginated catalogue). APPROVED sellers only. */
  async getPublicStore(slug: string, page = 1, limit = 20) {
    const profile = await db.orm.public.SellerProfile
      .where({ storeSlug: slug })
      .include('user', (u) =>
        u
          .select('id', 'name', 'bio', 'avatarUrl', 'createdAt')
          .include('products', (products) =>
            products
              .where({ status: 'PUBLISHED' })
              .select(
                'id', 'name', 'slug', 'price', 'productType',
                'images', 'rating', 'reviewCount', 'createdAt',
              )
              .include('category', (c) => c.select('name', 'slug'))
              .orderBy((p) => p.createdAt.desc())
              .offset((page - 1) * limit)
              .limit(limit),
          ),
      )
      .first();
    if (!profile) throw new NotFoundException('Store not found');
    // Governance: only approved storefronts are publicly browsable.
    if (profile.sellerStatus !== 'APPROVED') {
      throw new NotFoundException('Store not found');
    }

    // Published-product total for pagination (separate count query)
    const totalAgg = await db.orm.public.Product
      .where({ sellerId: profile.userId, status: 'PUBLISHED' })
      .aggregate((a) => ({ total: a.count() }));

    // Distinct categories across the store's published catalogue
    const categoryRows = await db.orm.public.Product
      .where({ sellerId: profile.userId, status: 'PUBLISHED' })
      .where((p) => p.categoryId.isNotNull())
      .include('category', (c) => c.select('name', 'slug'))
      .distinct('categoryId')
      .all();

    const user = profile.user as any;
    const total = Number(totalAgg.total);
    // Decimal prices → JSON-safe numbers on the public store payload
    return {
      id: profile.id,
      userId: profile.userId,
      storeName: profile.storeName,
      storeSlug: profile.storeSlug,
      description: profile.description ?? user.bio,
      location: profile.location,
      logoUrl: profile.logoUrl,
      bannerUrl: profile.bannerUrl,
      isVerified: profile.sellerStatus === 'APPROVED',
      category: profile.category,
      ownerName: user.name,
      ownerAvatarUrl: user.avatarUrl,
      joinedAt: user.createdAt,
      categories: categoryRows.map((c: any) => c.category).filter(Boolean),
      totalProducts: total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      products: user.products.map((p: any) => ({
        ...p,
        price: Number(p.price),
      })),
    };
  }

  /** Public store slugs — consumed by the frontend sitemap. APPROVED only. */
  async listStoreSlugs() {
    const stores = await db.orm.public.SellerProfile
      .where({ sellerStatus: 'APPROVED' })
      .select('storeSlug')
      .orderBy((s) => s.createdAt.asc())
      .all();
    return { stores };
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('sellers')
export class SellersController {
  constructor(private sellers: SellersService) {}

  // POST /api/sellers/profile — create the seller profile (starts PENDING)
  @Post('profile')
  @UseGuards(JwtAuthGuard)
  createProfile(@CurrentUser() user: any, @Body() dto: CreateSellerProfileDto) {
    return this.sellers.createProfile(user, dto);
  }

  // GET /api/sellers/profile — my seller profile
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: any) {
    return this.sellers.getProfile(user);
  }

  // PATCH /api/sellers/profile — update store details
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateSellerProfileDto) {
    return this.sellers.updateProfile(user, dto);
  }

  // POST /api/sellers/apply — submit application for admin review
  @Post('apply')
  @UseGuards(JwtAuthGuard)
  apply(@CurrentUser() user: any, @Body() dto: ApplySellerDto) {
    return this.sellers.submitApplication(user, dto);
  }

  // GET /api/sellers/dashboard — honest dashboard stats
  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  getDashboard(@CurrentUser() user: any) {
    return this.sellers.getDashboardStats(user.id);
  }

  // GET /api/sellers/store/:slug — public store page (paginated)
  @Get('store/:slug')
  getStore(@Param() param: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.sellers.getPublicStore(
      param.slug,
      Math.max(1, Number(page) || 1),
      Math.min(50, Math.max(1, Number(limit) || 20)),
    );
  }

  // GET /api/sellers/featured — homepage featured-sellers cards
  @Get('featured')
  listFeatured() {
    return this.sellers.listFeatured(8);
  }

  // GET /api/sellers/store-all — public store slugs (sitemap only)
  @Get('store-all')
  listStoreSlugs() {
    return this.sellers.listStoreSlugs();
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [SellersService],
  controllers: [SellersController],
  exports: [SellersService],
})
export class SellersModule {}

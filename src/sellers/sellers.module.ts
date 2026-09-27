// ============================================================
// KOVA API — Sellers Module
// Seller onboarding + honest dashboard analytics.
// Metrics are computed live from real data. When there are no
// sales yet, the numbers are zero — never fabricated.
// ============================================================

import {
  Body,
  ConflictException,
  Controller,
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
import { IsString, IsOptional, IsEmail, MinLength, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

// ── DTOs ──────────────────────────────────────────────────

export class CreateSellerProfileDto {
  @IsString() @MinLength(2) @MaxLength(60) storeName: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class UpdateSellerProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) storeName?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(80) location?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() bannerUrl?: string;
  @IsOptional() @IsString() @IsEmail() payoutEmail?: string;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class SellersService {
  constructor(private prisma: PrismaService) {}

  /** Become a seller — same account, role upgraded, no duplicates. */
  async createProfile(user: any, dto: CreateSellerProfileDto) {
    const existing = await this.prisma.sellerProfile.findUnique({
      where: { userId: user.id },
    });
    if (existing) throw new ConflictException('You are already a seller');

    const baseSlug =
      dto.storeName
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'store';

    // Collision-safe store slug
    let slug = baseSlug;
    let n = 2;
    while (await this.prisma.sellerProfile.findUnique({ where: { storeSlug: slug } })) {
      slug = `${baseSlug}-${n++}`;
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { role: 'SELLER' },
      });
      return tx.sellerProfile.create({
        data: {
          userId: user.id,
          storeName: dto.storeName,
          storeSlug: slug,
          description: dto.description,
        },
      });
    });
  }

  async getProfile(user: any) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId: user.id },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    });
    if (!profile) throw new NotFoundException('Seller profile not found');
    return profile;
  }

  async updateProfile(user: any, dto: UpdateSellerProfileDto) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile) throw new NotFoundException('Seller profile not found');

    return this.prisma.sellerProfile.update({
      where: { userId: user.id },
      data: dto,
    });
  }

  /** Dashboard stats — computed live, honest zeros when empty. */
  async getDashboardStats(userId: string) {
    const [products, paidOrderItems, sellerProfile] = await Promise.all([
      this.prisma.product.findMany({
        where: { sellerId: userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          productType: true,
          status: true,
          images: true,
          viewCount: true,
          buyCount: true,
          rating: true,
          reviewCount: true,
          createdAt: true,
          category: { select: { name: true, slug: true } },
        },
      }),
      this.prisma.orderItem.findMany({
        where: {
          product: { sellerId: userId },
          order: { paymentStatus: 'PAID' },
        },
        select: { quantity: true, price: true, createdAt: true },
      }),
      this.prisma.sellerProfile.findUnique({ where: { userId } }),
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
   * Featured sellers — homepage discovery cards from live data only:
   * published product counts and rating aggregates computed per store.
   */
  async listFeatured(limit = 8) {
    const profiles = await this.prisma.sellerProfile.findMany({
      where: { user: { products: { some: { status: 'PUBLISHED' } } } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            products: {
              where: { status: 'PUBLISHED' },
              orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
              take: 3,
              select: {
                id: true, name: true, slug: true, price: true, images: true,
                rating: true, reviewCount: true, productType: true,
              },
            },
          },
        },
      },
    });

    // Product counts + rating aggregates in one grouped query
    const grouped = await this.prisma.product.groupBy({
      by: ['sellerId'],
      where: { status: 'PUBLISHED' },
      _count: { _all: true },
    });
    const stats = new Map(grouped.map((g) => [g.sellerId, { count: g._count._all }]));

    // Store rating = average across RATED products only (zeros excluded,
    // matching the seller dashboard's honest math).
    const ratedRows = await this.prisma.product.findMany({
      where: { status: 'PUBLISHED', reviewCount: { gt: 0 } },
      select: { sellerId: true, rating: true },
    });
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
          isVerified: p.isVerified,
          productCount: s.count,
          avgRating: rated ? Math.round((rated.sum / rated.n) * 10) / 10 : null,
          previewProducts: p.user.products.map((pr) => ({ ...pr, price: Number(pr.price) })),
        };
      })
      .sort((a, b) => b.productCount - a.productCount || (b.avgRating ?? 0) - (a.avgRating ?? 0))
      .slice(0, limit);
    return cards;
  }

  // Public store page
  /** Public store page (paginated catalogue). */
  async getPublicStore(slug: string, page = 1, limit = 20) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { storeSlug: slug },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            _count: { select: { products: { where: { status: 'PUBLISHED' } } } },
            products: {
              where: { status: 'PUBLISHED' },
              orderBy: { createdAt: 'desc' },
              skip: (page - 1) * limit,
              take: limit,
              select: {
                id: true,
                name: true,
                slug: true,
                price: true,
                productType: true,
                images: true,
                rating: true,
                reviewCount: true,
                createdAt: true,
                category: { select: { name: true, slug: true } },
              },
            },
          },
        },
      },
    });
    if (!profile) throw new NotFoundException('Store not found');

    const total = profile.user._count.products;
    // Decimal prices → JSON-safe numbers on the public store payload
    return {
      id: profile.id,
      userId: profile.userId,
      storeName: profile.storeName,
      storeSlug: profile.storeSlug,
      description: profile.description,
      location: profile.location,
      logoUrl: profile.logoUrl,
      bannerUrl: profile.bannerUrl,
      isVerified: profile.isVerified,
      ownerName: profile.user.name,
      totalProducts: total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      products: profile.user.products.map((p) => ({
        ...p,
        price: Number(p.price),
      })),
    };
  }

  /** Public store slugs — consumed by the frontend sitemap. */
  async listStoreSlugs() {
    const stores = await this.prisma.sellerProfile.findMany({
      select: { storeSlug: true },
      orderBy: { createdAt: 'asc' },
    });
    return { stores };
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('sellers')
export class SellersController {
  constructor(private sellers: SellersService) {}

  // POST /api/sellers/profile — become a seller
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

  // PATCH /api/sellers/profile — update seller profile
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateSellerProfileDto) {
    return this.sellers.updateProfile(user, dto);
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

// ============================================================
// KOVA API — Sellers Module
// Seller profile management and dashboard analytics.
// ============================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional } from 'class-validator';
import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

// ── DTOs ──────────────────────────────────────────────────

export class CreateSellerProfileDto {
  @IsString() storeName: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateSellerProfileDto {
  @IsOptional() @IsString() storeName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() bannerUrl?: string;
  @IsOptional() @IsString() payoutEmail?: string;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class SellersService {
  constructor(private prisma: PrismaService) {}

  async createProfile(userId: string, dto: CreateSellerProfileDto) {
    // Check if seller profile already exists
    const existing = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });
    if (existing) throw new ConflictException('Seller profile already exists');

    // Generate unique slug from store name
    const baseSlug = dto.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const slug = `${baseSlug}-${Date.now()}`;

    // Update user role to SELLER
    await this.prisma.user.update({
      where: { id: userId },
      data: { role: 'SELLER' },
    });

    return this.prisma.sellerProfile.create({
      data: {
        userId,
        storeName: dto.storeName,
        storeSlug: slug,
        description: dto.description,
      },
    });
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } },
      },
    });
    if (!profile) throw new NotFoundException('Seller profile not found');
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateSellerProfileDto) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Seller profile not found');

    return this.prisma.sellerProfile.update({
      where: { userId },
      data: dto,
    });
  }

  async getDashboardStats(userId: string) {
    const [products, orders, profile] = await Promise.all([
      // My products
      this.prisma.product.findMany({
        where: { sellerId: userId },
        select: {
          id: true,
          name: true,
          price: true,
          buyCount: true,
          rating: true,
          isPublished: true,
        },
      }),

      // Orders containing my products
      this.prisma.orderItem.findMany({
        where: {
          product: { sellerId: userId },
          order: { paymentStatus: 'PAID' },
        },
        include: {
          order: { select: { createdAt: true, status: true } },
          product: { select: { name: true, price: true } },
        },
        orderBy: { createdAt: 'desc' } as any,
        take: 20,
      }),

      this.prisma.sellerProfile.findUnique({ where: { userId } }),
    ]);

    // Calculate total revenue
    const totalRevenue = orders.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    // Update seller profile totals
    if (profile) {
      await this.prisma.sellerProfile.update({
        where: { userId },
        data: {
          totalSales: orders.length,
          totalRevenue: totalRevenue,
        },
      });
    }

    // Weekly earnings (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weeklyOrders = orders.filter(
      (o) => new Date((o.order as any).createdAt) >= weekAgo,
    );
    const weeklyRevenue = weeklyOrders.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    return {
      stats: {
        totalRevenue,
        totalOrders: orders.length,
        totalProducts: products.length,
        weeklyRevenue,
        avgRating: profile?.rating ?? 0,
      },
      products,
      recentOrders: orders.slice(0, 10),
    };
  }

  // Public store page
  async getPublicStore(slug: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { storeSlug: slug },
      include: {
        user: {
          select: {
            name: true,
            avatarUrl: true,
            products: {
              where: { isPublished: true },
              orderBy: { createdAt: 'desc' },
              take: 20,
            },
          },
        },
      },
    });
    if (!profile) throw new NotFoundException('Store not found');
    return profile;
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
    return this.sellers.createProfile(user.id, dto);
  }

  // GET /api/sellers/profile — my seller profile
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: any) {
    return this.sellers.getProfile(user.id);
  }

  // PATCH /api/sellers/profile — update seller profile
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateSellerProfileDto) {
    return this.sellers.updateProfile(user.id, dto);
  }

  // GET /api/sellers/dashboard — dashboard stats
  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  getDashboard(@CurrentUser() user: any) {
    return this.sellers.getDashboardStats(user.id);
  }

  // GET /api/sellers/store/:slug — public store page
  @Get('store/:slug')
  getStore(@Param('slug') slug: string) {
    return this.sellers.getPublicStore(slug);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [SellersService],
  controllers: [SellersController],
  exports: [SellersService],
})
export class SellersModule {}

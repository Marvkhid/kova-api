// ============================================================
// KOVA API — Admin Module
// ADMIN-only. Real metrics only — nothing is fabricated.
// GET    /api/admin/overview          — marketplace metrics
// GET    /api/admin/users             — user list
// PATCH  /api/admin/users/:id/role    — change a user's role
// GET    /api/admin/products          — all products (any status)
// PATCH  /api/admin/products/:id/status — moderate product status
// DELETE /api/admin/products/:id      — hard delete a product
// ============================================================

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { MailerService } from '../auth/mailer.service';

// ── DTOs ──────────────────────────────────────────────────

class UpdateRoleDto {
  @IsEnum({ BUYER: 'BUYER', SELLER: 'SELLER', ADMIN: 'ADMIN' })
  role: 'BUYER' | 'SELLER' | 'ADMIN';
}

class UpdateProductStatusDto {
  @IsEnum({
    DRAFT: 'DRAFT',
    PENDING_REVIEW: 'PENDING_REVIEW',
    PUBLISHED: 'PUBLISHED',
    REJECTED: 'REJECTED',
    UNPUBLISHED: 'UNPUBLISHED',
    REMOVED: 'REMOVED',
  })
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'UNPUBLISHED' | 'REMOVED';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

/** Seller moderation decision. reason goes to the seller; note stays internal. */
class SellerDecisionDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class RejectSellerDto {
  @IsString() @MaxLength(500) reason: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class AdminQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
  ) {}

  /** Real, database-computed metrics — no estimates. */
  async getOverview() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalSellers,
      totalProducts,
      publishedProducts,
      draftProducts,
      digitalProducts,
      physicalProducts,
      productsToday,
      productsThisWeek,
      totalViews,
      totalOrders,
      paidOrders,
      usersByRole,
      pendingSellers,
      approvedSellers,
      suspendedSellers,
      pendingReviewProducts,
      rejectedProducts,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'SELLER' } }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.product.count({ where: { status: 'DRAFT' } }),
      this.prisma.product.count({ where: { productType: 'DIGITAL' } }),
      this.prisma.product.count({ where: { productType: 'PHYSICAL' } }),
      this.prisma.product.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.product.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.product.aggregate({ _sum: { viewCount: true } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { paymentStatus: 'PAID' } }),
      this.prisma.user.groupBy({ by: ['role'], _count: true }),
      this.prisma.sellerProfile.count({ where: { sellerStatus: 'PENDING' } }),
      this.prisma.sellerProfile.count({ where: { sellerStatus: 'APPROVED' } }),
      this.prisma.sellerProfile.count({ where: { sellerStatus: { in: ['SUSPENDED', 'BLOCKED'] } } }),
      this.prisma.product.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.product.count({ where: { status: 'REJECTED' } }),
    ]);

    const roleCounts: Record<string, number> = { BUYER: 0, SELLER: 0, ADMIN: 0 };
    for (const g of usersByRole) roleCounts[g.role] = g._count;

    return {
      users: {
        total: totalUsers,
        buyers: roleCounts.BUYER,
        sellers: roleCounts.SELLER,
        admins: roleCounts.ADMIN,
      },
      moderation: {
        // Clickable cards on the admin dashboard → seller/product queues
        pendingSellerApplications: pendingSellers,
        approvedSellers,
        suspendedSellers,
        pendingProductReviews: pendingReviewProducts,
        rejectedProducts,
      },
      products: {
        total: totalProducts,
        published: publishedProducts,
        drafts: draftProducts,
        digital: digitalProducts,
        physical: physicalProducts,
        addedToday: productsToday,
        addedThisWeek: productsThisWeek,
      },
      engagement: {
        totalProductViews: totalViews._sum.viewCount ?? 0,
      },
      orders: {
        total: totalOrders,
        paid: paidOrders,
      },
      generatedAt: now.toISOString(),
    };
  }

  async listUsers(query: AdminQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { email: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          clerkId: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          createdAt: true,
          sellerProfile: { select: { storeName: true, storeSlug: true } },
          _count: { select: { products: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { users, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async updateUserRole(id: string, role: 'BUYER' | 'SELLER' | 'ADMIN') {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, role: true },
    });
  }

  async listProducts(query: AdminQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: any = {};
    if (query.status) where.status = query.status.toUpperCase();
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { seller: { email: { contains: query.q, mode: 'insensitive' } } },
        { seller: { name: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
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
          createdAt: true,
          category: { select: { name: true, slug: true } },
          seller: {
            select: {
              id: true,
              name: true,
              email: true,
              sellerProfile: { select: { storeName: true, storeSlug: true } },
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { products, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async updateProductStatus(id: string, status: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.product.update({
      where: { id },
      data: { status: status as any },
      select: { id: true, slug: true, status: true },
    });
  }

  async deleteProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    await this.prisma.product.delete({ where: { id } });
    return { message: 'Product deleted' };
  }

  // ── Seller applications & governance ───────────────────

  /** Seller applications queue (optionally filtered by status). */
  async listSellerApplications(status?: string) {
    const where = status
      ? { sellerStatus: status.toUpperCase() as any }
      : {};
    const sellers = await this.prisma.sellerProfile.findMany({
      where,
      orderBy: [{ appliedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            createdAt: true,
            _count: { select: { products: true } },
          },
        },
      },
    });
    return {
      applications: sellers.map((s) => ({
        id: s.id,
        userId: s.userId,
        storeName: s.storeName,
        storeSlug: s.storeSlug,
        description: s.description,
        location: s.location,
        category: s.category,
        logoUrl: s.logoUrl,
        bannerUrl: s.bannerUrl,
        sellerStatus: s.sellerStatus,
        phone: s.phone,
        email: s.user.email,
        ownerName: s.user.name,
        ownerAvatarUrl: s.user.avatarUrl,
        registeredAt: s.user.createdAt,
        appliedAt: s.appliedAt,
        approvedAt: s.approvedAt,
        rejectedAt: s.rejectedAt,
        suspendedAt: s.suspendedAt,
        rejectionReason: s.rejectionReason,
        termsVersion: s.termsVersion,
        termsAcceptedAt: s.termsAcceptedAt,
        productCount: s.user._count.products,
      })),
    };
  }

  /** Full application detail for the admin review screen. done by me  */
  async getSellerApplication(profileId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            bio: true,
            phone: true,
            createdAt: true,
            _count: { select: { products: true, orders: true } },
          },
        },
      },
    });
    if (!profile) throw new NotFoundException('Seller application not found');

    const products = await this.prisma.product.findMany({
      where: { sellerId: profile.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        productType: true,
        status: true,
        images: true,
        condition: true,
        quantity: true,
        tags: true,
        createdAt: true,
        category: { select: { name: true, slug: true } },
      },
    });

    return {
      id: profile.id,
      userId: profile.userId,
      storeName: profile.storeName,
      storeSlug: profile.storeSlug,
      description: profile.description,
      location: profile.location,
      category: profile.category,
      logoUrl: profile.logoUrl,
      bannerUrl: profile.bannerUrl,
      sellerStatus: profile.sellerStatus,
      phone: profile.phone,
      email: profile.user.email,
      ownerName: profile.user.name,
      ownerBio: profile.user.bio,
      ownerAvatarUrl: profile.user.avatarUrl,
      registeredAt: profile.user.createdAt,
      appliedAt: profile.appliedAt,
      approvedAt: profile.approvedAt,
      rejectedAt: profile.rejectedAt,
      suspendedAt: profile.suspendedAt,
      rejectionReason: profile.rejectionReason,
      adminNote: profile.adminNote,
      termsVersion: profile.termsVersion,
      termsAcceptedAt: profile.termsAcceptedAt,
      productCount: profile.user._count.products,
      orderCount: profile.user._count.orders,
      products: products.map((p) => ({ ...p, price: Number(p.price) })),
    };
  }

  /** Common guard for seller moderation actions. */
  private async getSellerOrThrow(profileId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { id: profileId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!profile) throw new NotFoundException('Seller application not found');
    return profile;
  }

  async approveSeller(profileId: string) {
    const profile = await this.getSellerOrThrow(profileId);
    if (profile.sellerStatus === 'APPROVED') {
      throw new ConflictException('Seller is already approved');
    }
    const updated = await this.prisma.sellerProfile.update({
      where: { id: profileId },
      data: {
        sellerStatus: 'APPROVED',
        isVerified: true,
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
    });
    // Notify (non-blocking; logged when Resend is not configured)
    this.mailer
      .sendSellerApproved(profile.user.email, profile.storeName)
      .catch((e) => this.logger.warn(`Approval email failed: ${e?.message ?? e}`));
    return updated;
  }

  async rejectSeller(profileId: string, dto: RejectSellerDto) {
    const profile = await this.getSellerOrThrow(profileId);
    if (profile.sellerStatus === 'APPROVED') {
      throw new BadRequestException('Suspend or block an approved seller instead of rejecting');
    }
    const updated = await this.prisma.sellerProfile.update({
      where: { id: profileId },
      data: {
        sellerStatus: 'REJECTED',
        isVerified: false,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
        adminNote: dto.note ?? null,
      },
    });
    // The rejection reason goes to the seller; the admin note stays internal.
    this.mailer
      .sendSellerRejected(profile.user.email, profile.storeName, dto.reason)
      .catch((e) => this.logger.warn(`Rejection email failed: ${e?.message ?? e}`));
    return updated;
  }

  async setSellerRestricted(profileId: string, action: 'SUSPENDED' | 'BLOCKED', dto: SellerDecisionDto) {
    const profile = await this.getSellerOrThrow(profileId);
    if (profile.sellerStatus === 'BLOCKED' && action === 'SUSPENDED') {
      throw new BadRequestException('Seller is already blocked');
    }
    const updated = await this.prisma.sellerProfile.update({
      where: { id: profileId },
      data: {
        sellerStatus: action,
        isVerified: false,
        suspendedAt: new Date(),
        ...(action === 'SUSPENDED' ? { rejectionReason: dto.reason ?? null } : {}),
        ...(dto.note ? { adminNote: dto.note } : {}),
      },
    });

    // Suspension must have real teeth: pull the store's live listings.
    await this.prisma.product.updateMany({
      where: { sellerId: profile.userId, status: 'PUBLISHED' },
      data: { status: 'UNPUBLISHED' },
    });

    this.mailer
      .sendSellerSuspended(profile.user.email, profile.storeName, dto.reason)
      .catch((e) => this.logger.warn(`Suspension email failed: ${e?.message ?? e}`));
    return updated;
  }

  /** Reinstate a suspended seller. */
  async reinstateSeller(profileId: string) {
    const profile = await this.getSellerOrThrow(profileId);
    if (profile.sellerStatus !== 'SUSPENDED' && profile.sellerStatus !== 'BLOCKED') {
      throw new BadRequestException('Only suspended or blocked sellers can be reinstated');
    }
    return this.prisma.sellerProfile.update({
      where: { id: profileId },
      data: {
        sellerStatus: 'APPROVED',
        isVerified: true,
        approvedAt: new Date(),
        suspendedAt: null,
        rejectionReason: null,
      },
    });
  }

  /** Product moderation with an auditable reason. */
  async moderateProduct(id: string, status: string, reason?: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.product.update({
      where: { id },
      data: {
        status: status as any,
        moderationReason: reason ?? null,
        moderatedAt: new Date(),
      },
      select: { id: true, slug: true, status: true, moderationReason: true },
    });
  }

  /**
   * Hard-delete a user and everything that belongs to them.
   * Used by both admin deletion and self-service account deletion.
   */
  async deleteUserCompletely(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'ADMIN') {
      throw new BadRequestException('Admin accounts cannot be deleted through this endpoint');
    }

    // Products first — their OrderItems keep the product row alive and
    // must be cleared before the product (and then the user) can go.
    await this.prisma.orderItem.deleteMany({ where: { product: { sellerId: userId } } });
    await this.prisma.product.deleteMany({ where: { sellerId: userId } });

    // The user's own orders: items cascade with the order; events too.
    await this.prisma.order.deleteMany({ where: { userId } });

    // Everything else cascades via FK (reviews, seller profile, wishlist,
    // auth tokens, seller reviews) — but cart items use sessionId, so
    // there is nothing user-scoped to clean there.
    await this.prisma.user.delete({ where: { id: userId } });

    return {
      message: `Account for ${user.email} deleted, including all their products and marketplace activity`,
    };
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('overview')
  getOverview() {
    return this.admin.getOverview();
  }

  @Get('users')
  listUsers(@Query() query: AdminQueryDto) {
    return this.admin.listUsers(query);
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    if (dto.role === 'ADMIN') {
      throw new BadRequestException('Use the database/console to grant ADMIN');
    }
    return this.admin.updateUserRole(id, dto.role);
  }

  @Get('products')
  listProducts(@Query() query: AdminQueryDto) {
    return this.admin.listProducts(query);
  }

  @Patch('products/:id/status')
  updateProductStatus(@Param('id') id: string, @Body() dto: UpdateProductStatusDto) {
    return this.admin.moderateProduct(id, dto.status, dto.reason);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.admin.deleteProduct(id);
  }

  // ── Seller applications & governance ────────────────────

  /** GET /api/admin/sellers?status=PENDING — application queue. */
  @Get('sellers')
  listSellerApplications(@Query('status') status?: string) {
    return this.admin.listSellerApplications(status);
  }

  /** GET /api/admin/sellers/:id — full review screen payload. */
  @Get('sellers/:id')
  getSellerApplication(@Param('id') id: string) {
    return this.admin.getSellerApplication(id);
  }

  /** POST /api/admin/sellers/:id/approve */
  @Post('sellers/:id/approve')
  approveSeller(@Param('id') id: string) {
    return this.admin.approveSeller(id);
  }

  /** POST /api/admin/sellers/:id/reject — reason required. */
  @Post('sellers/:id/reject')
  rejectSeller(@Param('id') id: string, @Body() dto: RejectSellerDto) {
    return this.admin.rejectSeller(id, dto);
  }

  /** POST /api/admin/sellers/:id/suspend — pulls live listings. */
  @Post('sellers/:id/suspend')
  suspendSeller(@Param('id') id: string, @Body() dto: SellerDecisionDto) {
    return this.admin.setSellerRestricted(id, 'SUSPENDED', dto);
  }

  /** POST /api/admin/sellers/:id/block — full seller lockout. */
  @Post('sellers/:id/block')
  blockSeller(@Param('id') id: string, @Body() dto: SellerDecisionDto) {
    return this.admin.setSellerRestricted(id, 'BLOCKED', dto);
  }

  /** POST /api/admin/sellers/:id/reinstate — suspended/blocked → approved. */
  @Post('sellers/:id/reinstate')
  reinstateSeller(@Param('id') id: string) {
    return this.admin.reinstateSeller(id);
  }

  /** DELETE /api/admin/users/:id — wipe an account, its store, its products. */
  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.admin.deleteUserCompletely(id);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}

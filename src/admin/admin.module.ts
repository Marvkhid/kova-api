// ============================================================
// KOVA API — Admin Module (Prisma 8)
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
import { db, now } from '../prisma/db';
import { rawRows } from '../prisma/raw-helper';
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

  constructor(private mailer: MailerService) {}

  /** Real, database-computed metrics — no estimates. */
  async getOverview() {
    const nowTs = new Date();
    const startOfToday = new Date(nowTs.getFullYear(), nowTs.getMonth(), nowTs.getDate());
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
      db.orm.public.User.aggregate((a) => ({ total: a.count() })),
      db.orm.public.User.where({ role: 'SELLER' }).aggregate((a) => ({ total: a.count() })),
      db.orm.public.Product.aggregate((a) => ({ total: a.count() })),
      db.orm.public.Product.where({ status: 'PUBLISHED' }).aggregate((a) => ({ total: a.count() })),
      db.orm.public.Product.where({ status: 'DRAFT' }).aggregate((a) => ({ total: a.count() })),
      db.orm.public.Product.where({ productType: 'DIGITAL' }).aggregate((a) => ({ total: a.count() })),
      db.orm.public.Product.where({ productType: 'PHYSICAL' }).aggregate((a) => ({ total: a.count() })),
      db.orm.public.Product.where((p) => p.createdAt.gte(Temporal.PlainDateTime.from(startOfToday.toISOString().replace(/\.\d+Z$/, '')))).aggregate((a) => ({ total: a.count() })),
      db.orm.public.Product.where((p) => p.createdAt.gte(Temporal.PlainDateTime.from(weekAgo.toISOString().replace(/\.\d+Z$/, '')))).aggregate((a) => ({ total: a.count() })),
      db.orm.public.Product.aggregate((a) => ({ views: a.sum('viewCount') })),
      db.orm.public.Order.aggregate((a) => ({ total: a.count() })),
      db.orm.public.Order.where({ paymentStatus: 'PAID' }).aggregate((a) => ({ total: a.count() })),
      db.orm.public.User.groupBy('role').aggregate((a) => ({ count: a.count() })),
      db.orm.public.SellerProfile.where({ sellerStatus: 'PENDING' }).aggregate((a) => ({ total: a.count() })),
      db.orm.public.SellerProfile.where({ sellerStatus: 'APPROVED' }).aggregate((a) => ({ total: a.count() })),
      db.orm.public.SellerProfile
        .where((sp) => sp.sellerStatus.in(['SUSPENDED', 'BLOCKED']))
        .aggregate((a) => ({ total: a.count() })),
      db.orm.public.Product.where({ status: 'PENDING_REVIEW' }).aggregate((a) => ({ total: a.count() })),
      db.orm.public.Product.where({ status: 'REJECTED' }).aggregate((a) => ({ total: a.count() })),
    ]);

    const roleCounts: Record<string, number> = { BUYER: 0, SELLER: 0, ADMIN: 0 };
    for (const g of usersByRole) roleCounts[g.role] = Number(g.count);

    return {
      users: {
        total: Number(totalUsers.total),
        buyers: roleCounts.BUYER,
        sellers: roleCounts.SELLER,
        admins: roleCounts.ADMIN,
      },
      moderation: {
        // Clickable cards on the admin dashboard → seller/product queues
        pendingSellerApplications: Number(pendingSellers.total),
        approvedSellers: Number(approvedSellers.total),
        suspendedSellers: Number(suspendedSellers.total),
        pendingProductReviews: Number(pendingReviewProducts.total),
        rejectedProducts: Number(rejectedProducts.total),
      },
      products: {
        total: Number(totalProducts.total),
        published: Number(publishedProducts.total),
        drafts: Number(draftProducts.total),
        digital: Number(digitalProducts.total),
        physical: Number(physicalProducts.total),
        addedToday: Number(productsToday.total),
        addedThisWeek: Number(productsThisWeek.total),
      },
      engagement: {
        totalProductViews: Number(totalViews.views ?? 0),
      },
      orders: {
        total: Number(totalOrders.total),
        paid: Number(paidOrders.total),
      },
      generatedAt: nowTs.toISOString(),
    };
  }

  async listUsers(query: AdminQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const q = query.q?.trim().toLowerCase();
    const term = q ? `%${q}%` : null;

    let chain = db.orm.public.User
      .include('sellerProfile', (sp: any) => sp.select('storeName', 'storeSlug'));
    if (term) {
      chain = chain.where((u) =>
        db.orm.public.User === null ? (false as never) : u.name.ilike(term),
      );
    }

    // Product count per user comes from a grouped query (v8 has no _count).
    const base = term
      ? db.orm.public.User.where((u) => u.name.ilike(term))
          .where((u) => u.email.ilike(term))
      : db.orm.public.User;

    const [users, totalAgg, productCounts] = await Promise.all([
      chain
        .orderBy((u) => u.createdAt.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all(),
      base.aggregate((a) => ({ total: a.count() })),
      db.orm.public.Product.groupBy('sellerId').aggregate((a) => ({ count: a.count() })),
    ]);
    const countMap = new Map(productCounts.map((g) => [g.sellerId, Number(g.count)]));
    const total = Number(totalAgg.total);

    return {
      users: users.map((u) => ({
        id: u.id,
        clerkId: u.clerkId,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
        role: u.role,
        createdAt: u.createdAt,
        sellerProfile: u.sellerProfile,
        _count: { products: countMap.get(u.id) ?? 0 },
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async updateUserRole(id: string, role: 'BUYER' | 'SELLER' | 'ADMIN') {
    const user = await db.orm.public.User.where({ id }).first();
    if (!user) throw new NotFoundException('User not found');
    const updated = await db.orm.public.User.where({ id }).update({ role });
    return { id: updated!.id, email: updated!.email, role: updated!.role };
  }

  async listProducts(query: AdminQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const term = query.q?.trim().toLowerCase();
    const like = term ? `%${term}%` : null;

    let chain = db.orm.public.Product
      .include('category', (c: any) => c.select('name', 'slug'))
      .include('seller', (s: any) =>
        s
          .select('id', 'name', 'email')
          .include('sellerProfile', (sp: any) => sp.select('storeName', 'storeSlug')),
      )
      .select('id', 'name', 'slug', 'price', 'productType', 'status', 'images', 'viewCount', 'buyCount', 'createdAt');
    if (query.status) {
      chain = chain.where({ status: query.status.toUpperCase() as never });
    }
    if (like) {
      const nameRows = await db.orm.public.Product.where((p) => p.name.ilike(like)).select('id').all();
      const sellerRows = await db.orm.public.User
        .where((u) => u.email.ilike(like))
        .select('id')
        .all();
      const sellerByName = await db.orm.public.User
        .where((u) => u.name.ilike(like))
        .select('id')
        .all();
      const ids = new Set<string>([...nameRows.map((r) => r.id), ...sellerRows.map((r) => r.id), ...sellerByName.map((r) => r.id)]);
      chain = chain.where((p) => p.id.in([...ids]));
    }

    const [products, totalAgg] = await Promise.all([
      chain
        .orderBy((p) => p.createdAt.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all(),
      chain.aggregate((a) => ({ total: a.count() })),
    ]);
    const total = Number(totalAgg.total);
    return { products, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async updateProductStatus(id: string, status: string) {
    const product = await db.orm.public.Product.where({ id }).first();
    if (!product) throw new NotFoundException('Product not found');
    const updated = await db.orm.public.Product.where({ id }).update({ status: status as never });
    return { id: updated!.id, slug: updated!.slug, status: updated!.status };
  }

  async deleteProduct(id: string) {
    const product = await db.orm.public.Product.where({ id }).first();
    if (!product) throw new NotFoundException('Product not found');
    await db.orm.public.Product.where({ id }).delete();
    return { message: 'Product deleted' };
  }

  // ── Seller applications & governance ───────────────────

  /** Seller applications queue (optionally filtered by status). */
  async listSellerApplications(status?: string) {
    let chain = db.orm.public.SellerProfile
      .include('user', (u: any) => u.select('id', 'name', 'email', 'avatarUrl', 'createdAt'));
    if (status) {
      chain = chain.where({ sellerStatus: status.toUpperCase() as never });
    }
    const sellers = await chain
      .orderBy((s) => s.appliedAt.desc())
      .orderBy((s) => s.createdAt.desc())
      .all();

    // Product counts per seller in one grouped query
    const productCounts = await db.orm.public.Product
      .groupBy('sellerId')
      .aggregate((a) => ({ count: a.count() }));
    const countMap = new Map(productCounts.map((g) => [g.sellerId, Number(g.count)]));

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
        email: (s.user as any).email,
        ownerName: (s.user as any).name,
        ownerAvatarUrl: (s.user as any).avatarUrl,
        registeredAt: (s.user as any).createdAt,
        appliedAt: s.appliedAt,
        approvedAt: s.approvedAt,
        rejectedAt: s.rejectedAt,
        suspendedAt: s.suspendedAt,
        rejectionReason: s.rejectionReason,
        termsVersion: s.termsVersion,
        termsAcceptedAt: s.termsAcceptedAt,
        productCount: countMap.get(s.userId) ?? 0,
      })),
    };
  }

  /** Full application detail for the admin review screen. */
  async getSellerApplication(profileId: string) {
    const profile = await db.orm.public.SellerProfile
      .include('user', (u: any) => u.select('id', 'name', 'email', 'avatarUrl', 'bio', 'phone', 'createdAt'))
      .where({ id: profileId })
      .first();
    if (!profile) throw new NotFoundException('Seller application not found');

    const products = await db.orm.public.Product
      .include('category', (c: any) => c.select('name', 'slug'))
      .where({ sellerId: profile.userId })
      .select(
        'id', 'name', 'slug', 'description', 'price', 'productType', 'status',
        'images', 'condition', 'quantity', 'tags', 'createdAt',
      )
      .orderBy((p) => p.createdAt.desc())
      .all();

    const user = profile.user as any;
    const orderCountAgg = await db.orm.public.Order
      .where({ userId: profile.userId })
      .aggregate((a) => ({ total: a.count() }));

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
      email: user.email,
      ownerName: user.name,
      ownerBio: user.bio,
      ownerAvatarUrl: user.avatarUrl,
      registeredAt: user.createdAt,
      appliedAt: profile.appliedAt,
      approvedAt: profile.approvedAt,
      rejectedAt: profile.rejectedAt,
      suspendedAt: profile.suspendedAt,
      rejectionReason: profile.rejectionReason,
      adminNote: profile.adminNote,
      termsVersion: profile.termsVersion,
      termsAcceptedAt: profile.termsAcceptedAt,
      productCount: products.length,
      orderCount: Number(orderCountAgg.total),
      products: products.map((p) => ({ ...p, price: Number(p.price) })),
    };
  }

  /** Common guard for seller moderation actions. */
  private async getSellerOrThrow(profileId: string) {
    const profile = await db.orm.public.SellerProfile
      .include('user', (u: any) => u.select('id', 'email', 'name'))
      .where({ id: profileId })
      .first();
    if (!profile) throw new NotFoundException('Seller application not found');
    return profile;
  }

  async approveSeller(profileId: string) {
    const profile = await this.getSellerOrThrow(profileId);
    if (profile.sellerStatus === 'APPROVED') {
      throw new ConflictException('Seller is already approved');
    }
    const updated = await db.orm.public.SellerProfile
      .where({ id: profileId })
      .update({
        sellerStatus: 'APPROVED',
        isVerified: true,
        approvedAt: now(),
        rejectedAt: null,
        rejectionReason: null,
      });
    // Notify (non-blocking; logged when Resend is not configured)
    this.mailer
      .sendSellerApproved((profile.user as any).email, profile.storeName)
      .catch((e) => this.logger.warn(`Approval email failed: ${e?.message ?? e}`));
    return updated;
  }

  async rejectSeller(profileId: string, dto: RejectSellerDto) {
    const profile = await this.getSellerOrThrow(profileId);
    if (profile.sellerStatus === 'APPROVED') {
      throw new BadRequestException('Suspend or block an approved seller instead of rejecting');
    }
    const updated = await db.orm.public.SellerProfile
      .where({ id: profileId })
      .update({
        sellerStatus: 'REJECTED',
        isVerified: false,
        rejectedAt: now(),
        rejectionReason: dto.reason,
        adminNote: dto.note ?? null,
      });
    // The rejection reason goes to the seller; the admin note stays internal.
    this.mailer
      .sendSellerRejected((profile.user as any).email, profile.storeName, dto.reason)
      .catch((e) => this.logger.warn(`Rejection email failed: ${e?.message ?? e}`));
    return updated;
  }

  async setSellerRestricted(profileId: string, action: 'SUSPENDED' | 'BLOCKED', dto: SellerDecisionDto) {
    const profile = await this.getSellerOrThrow(profileId);
    if (profile.sellerStatus === 'BLOCKED' && action === 'SUSPENDED') {
      throw new BadRequestException('Seller is already blocked');
    }
    const updated = await db.orm.public.SellerProfile
      .where({ id: profileId })
      .update({
        sellerStatus: action,
        isVerified: false,
        suspendedAt: now(),
        ...(action === 'SUSPENDED' ? { rejectionReason: dto.reason ?? null } : {}),
        ...(dto.note ? { adminNote: dto.note } : {}),
      });

    // Suspension must have real teeth: pull the store's live listings.
    await db.orm.public.Product
      .where({ sellerId: profile.userId, status: 'PUBLISHED' })
      .update({ status: 'UNPUBLISHED' });

    this.mailer
      .sendSellerSuspended((profile.user as any).email, profile.storeName, dto.reason)
      .catch((e) => this.logger.warn(`Suspension email failed: ${e?.message ?? e}`));
    return updated;
  }

  /** Reinstate a suspended seller. */
  async reinstateSeller(profileId: string) {
    const profile = await this.getSellerOrThrow(profileId);
    if (profile.sellerStatus !== 'SUSPENDED' && profile.sellerStatus !== 'BLOCKED') {
      throw new BadRequestException('Only suspended or blocked sellers can be reinstated');
    }
    return db.orm.public.SellerProfile
      .where({ id: profileId })
      .update({
        sellerStatus: 'APPROVED',
        isVerified: true,
        approvedAt: now(),
        suspendedAt: null,
        rejectionReason: null,
      });
  }

  /** Product moderation with an auditable reason. */
  async moderateProduct(id: string, status: string, reason?: string) {
    const product = await db.orm.public.Product.where({ id }).first();
    if (!product) throw new NotFoundException('Product not found');
    const updated = await db.orm.public.Product
      .where({ id })
      .update({
        status: status as never,
        moderationReason: reason ?? null,
        moderatedAt: now(),
      });
    return { id: updated!.id, slug: updated!.slug, status: updated!.status, moderationReason: updated!.moderationReason };
  }

  /**
   * Hard-delete a user and everything that belongs to them.
   * Used by both admin deletion and self-service account deletion.
   */
  async deleteUserCompletely(userId: string) {
    const user = await db.orm.public.User.where({ id: userId }).first();
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'ADMIN') {
      throw new BadRequestException('Admin accounts cannot be deleted through this endpoint');
    }

    await db.transaction(async (tx) => {
      // Products first — their OrderItems keep the product row alive and
      // must be cleared before the product (and then the user) can go.
      await tx.orm.public.OrderItem
        .where((i: any) => i.product.some({ sellerId: userId }))
        .delete();
      await tx.orm.public.Product.where({ sellerId: userId }).delete();

      // The user's own orders: items cascade with the order; events too.
      await tx.orm.public.Order.where({ userId }).delete();

      // Everything else cascades via FK (reviews, seller profile, wishlist,
      // auth tokens, seller reviews) — but cart items use sessionId, so
      // there is nothing user-scoped to clean there.
      await tx.orm.public.User.where({ id: userId }).delete();
    });

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

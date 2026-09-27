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
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';

// ── DTOs ──────────────────────────────────────────────────

class UpdateRoleDto {
  @IsEnum({ BUYER: 'BUYER', SELLER: 'SELLER', ADMIN: 'ADMIN' })
  role: 'BUYER' | 'SELLER' | 'ADMIN';
}

class UpdateProductStatusDto {
  @IsEnum({
    DRAFT: 'DRAFT',
    PUBLISHED: 'PUBLISHED',
    UNPUBLISHED: 'UNPUBLISHED',
    REMOVED: 'REMOVED',
  })
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'REMOVED';
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
  constructor(private prisma: PrismaService) {}

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
    return this.admin.updateProductStatus(id, dto.status);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.admin.deleteProduct(id);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}

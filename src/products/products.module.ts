// ============================================================
// KOVA API — Products Module
// Marketplace product lifecycle:
//   create (DRAFT) → publish (validated) → unpublish → delete
// Server-side enforcement:
//   • Ownership: a seller can only mutate their own listings
//   • PHYSICAL products require >= 3 images to publish
//   • Only PUBLISHED products are publicly discoverable
//   • Slugs are generated once and never change (stable QR URLs)
// ============================================================

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

// ── Constants ─────────────────────────────────────────────

export const MIN_PHYSICAL_IMAGES = 3;
const RESERVED_ROUTE_PARAMS = new Set([
  'featured', 'new', 'slug', 'seller', 'me',
]);

// ── DTOs ──────────────────────────────────────────────────

export class CreateProductDto {
  @IsString()
  @MinLength(3, { message: 'Product name must be at least 3 characters' })
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  condition?: string; // e.g. "Brand new" / "Refurbished" / "Used — excellent"

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  @Type(() => Number)
  quantity?: number; // available units (physical stock)

  @IsOptional()
  @IsString()
  @MaxLength(500)
  digitalInfo?: string; // file type / access info for digital products

  @IsString()
  @MinLength(20, { message: 'Description must be at least 20 characters' })
  @MaxLength(5000)
  description: string;

  @IsNumber()
  @Min(0.01, { message: 'Price must be greater than zero' })
  @Max(1_000_000)
  @Type(() => Number)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  originalPrice?: number;

  @IsEnum({ PHYSICAL: 'PHYSICAL', DIGITAL: 'DIGITAL' })
  productType: 'PHYSICAL' | 'DIGITAL';

  @IsString()
  categorySlug: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(24, { each: true }) // per-tag cap (array form validated via IsArray)
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsBoolean()
  inStock?: boolean;

  @IsOptional()
  @IsBoolean()
  publish?: boolean; // true → publish immediately if the product validates
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(60) condition?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) @Type(() => Number) quantity?: number;
  @IsOptional() @IsString() @MaxLength(500) digitalInfo?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1_000_000)
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  originalPrice?: number;

  @IsOptional()
  @IsEnum({ PHYSICAL: 'PHYSICAL', DIGITAL: 'DIGITAL' })
  productType?: 'PHYSICAL' | 'DIGITAL';

  @IsOptional()
  @IsString()
  categorySlug?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsBoolean()
  inStock?: boolean;
}

export class ProductQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() category?: string; // category slug
  @IsOptional() @IsString() type?: string;     // PHYSICAL | DIGITAL
  @IsOptional() @IsString() badge?: string;
  @IsOptional() @IsString() store?: string;    // seller store slug
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(50) limit?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minPrice?: number;
}

// ── Helpers ───────────────────────────────────────────────

/** Prisma Decimal → JSON-safe number (Naira, 2dp max). */
export function money(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/** Convert a product's Decimal money fields to plain numbers. */
function serializeProduct<T extends { price: unknown; originalPrice?: unknown }>(p: T): T {
  return { ...p, price: money(p.price), originalPrice: p.originalPrice ? money(p.originalPrice) : null };
}

const PRODUCT_CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  price: true,
  originalPrice: true,
  productType: true,
  status: true,
  badge: true,
  tags: true,
  images: true,
  inStock: true,
  rating: true,
  reviewCount: true,
  buyCount: true,
  viewCount: true,
  createdAt: true,
  categoryId: true,
  category: { select: { name: true, slug: true } },
  seller: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      sellerProfile: { select: { storeName: true, storeSlug: true, isVerified: true } },
    },
  },
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'product';
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  /** Generate a unique slug once — never regenerated on rename. */
  private async createUniqueSlug(name: string, productId?: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    let n = 2;
    // Loop is bounded in practice; skip our own product when updating
    // (not needed today — slugs are never regenerated).
    while (true) {
      const clash = await this.prisma.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!clash || clash.id === productId) return candidate;
      candidate = `${base}-${n++}`;
    }
  }

  /** Publish requirements — enforced server-side, never by the UI. */
  private validateForPublish(product: {
    name: string;
    description: string;
    price: unknown; // number or Prisma Decimal
    categoryId: string | null;
    productType: 'PHYSICAL' | 'DIGITAL';
    images: string[];
  }) {
    const errors: string[] = [];
    const price = money(product.price);
    if (!product.name || product.name.trim().length < 3)
      errors.push('Product name is required');
    if (!product.description || product.description.trim().length < 20)
      errors.push('A description of at least 20 characters is required');
    if (!price || price <= 0)
      errors.push('A valid price greater than zero is required');
    if (!product.categoryId)
      errors.push('A category is required');

    if (product.productType === 'PHYSICAL') {
      const usableImages = (product.images ?? []).filter(Boolean).length;
      if (usableImages < MIN_PHYSICAL_IMAGES) {
        errors.push(
          `Physical products need at least ${MIN_PHYSICAL_IMAGES} images before publishing`,
        );
      }
    }
    return errors;
  }

  private buildWhere(query: ProductQueryDto) {
    const { q, category, type, badge, store, maxPrice, minPrice } = query;
    const where: any = { status: 'PUBLISHED' };

    if (q && q.trim()) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { tags: { has: q.toLowerCase() } },
        { seller: { sellerProfile: { storeName: { contains: q, mode: 'insensitive' } } } },
      ];
    }
    if (category) where.category = { slug: category.toLowerCase() };
    if (type) where.productType = type.toUpperCase();
    if (badge) where.badge = badge.toUpperCase();
    if (store) where.seller = { sellerProfile: { storeSlug: store } };

    const priceFilter: any = {};
    if (minPrice !== undefined) priceFilter.gte = minPrice;
    if (maxPrice !== undefined) priceFilter.lte = maxPrice;
    if (Object.keys(priceFilter).length) where.price = priceFilter;

    return where;
  }

  private buildOrder(sort?: string) {
    switch (sort) {
      case 'price-asc':  return { price: 'asc' as const };
      case 'price-desc': return { price: 'desc' as const };
      case 'rating':     return [{ rating: 'desc' as const }, { reviewCount: 'desc' as const }];
      case 'popular':    return [{ buyCount: 'desc' as const }, { viewCount: 'desc' as const }];
      case 'views':      return { viewCount: 'desc' as const };
      case 'name':       return { name: 'asc' as const };
      default:           return { createdAt: 'desc' as const }; // newest first
    }
  }

  async findAll(query: ProductQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: this.buildOrder(query.sort),
        skip: (page - 1) * limit,
        take: limit,
        select: PRODUCT_CARD_SELECT,
      }),
      this.prisma.product.count({ where }),
    ]);

    return { products: products.map(serializeProduct), total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getFeatured(limit = 8) {
    const products = await this.prisma.product.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ buyCount: 'desc' }, { viewCount: 'desc' }],
      take: limit,
      select: PRODUCT_CARD_SELECT,
    });
    return products.map(serializeProduct);
  }

  /**
   * Marketplace discovery — products drawn from MANY different sellers
   * and categories for the homepage. Deterministic rotation from a
   * large offset pool keeps the grid fresh between visits without
   * fabricating anything: every candidate is a real published row.
   */
  async getDiscovery(limit = 20) {
    const total = await this.prisma.product.count({ where: { status: 'PUBLISHED' } });
    if (total === 0) return [];

    // Day-changing offset + deterministic jitter rotates the pool daily
    // while keeping a single render consistent.
    const dayBucket = Math.floor(Date.now() / 86_400_000);
    const jitter = (dayBucket * 2654435761) % 97;
    const offset = total > limit * 3 ? (jitter * (total - limit * 3)) / 97 : 0;

    const [a, b] = await Promise.all([
      this.prisma.product.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'desc' },
        skip: Math.floor(offset),
        take: limit,
        select: PRODUCT_CARD_SELECT,
      }),
      // Guarantee multi-seller variety: top-rated picks appended from a
      // different sort order so a sparse day still shows diverse sellers.
      this.prisma.product.findMany({
        where: { status: 'PUBLISHED', rating: { gte: 4 } },
        orderBy: [{ reviewCount: 'desc' }, { buyCount: 'desc' }],
        take: Math.ceil(limit / 2),
        select: PRODUCT_CARD_SELECT,
      }),
    ]);

    // Merge, de-dupe, then balance so one seller can't dominate the grid
    const seen = new Set<string>();
    const merged = [...a, ...b].filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    const bySeller = new Map<string, number>();
    const balanced: typeof merged = [];
    for (const p of merged) {
      const n = bySeller.get(p.seller.id) ?? 0;
      if (n >= Math.max(2, Math.ceil(limit / 5))) continue;
      bySeller.set(p.seller.id, n + 1);
      balanced.push(p);
    }
    return balanced.slice(0, limit).map(serializeProduct);
  }

  /** New Arrivals — newest published listings first. */
  async getNew(limit = 12) {
    const products = await this.prisma.product.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: PRODUCT_CARD_SELECT,
    });
    return products.map(serializeProduct);
  }

  /** Public product page by slug — the canonical URL QR codes point to. */
  async findBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: {
        ...PRODUCT_CARD_SELECT,
        description: true,
        updatedAt: true,
        reviews: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!product || product.status !== 'PUBLISHED') {
      throw new NotFoundException('Product not found');
    }

    // Count the view (fire-and-forget: never block the page on it)
    this.prisma.product
      .update({ where: { id: product.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);

    return serializeProduct(product);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        ...PRODUCT_CARD_SELECT,
        description: true,
        reviews: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return serializeProduct(product);
  }

  async getRelated(productId: string, categoryId: string | null, limit = 4) {
    const products = await this.prisma.product.findMany({
      where: {
        status: 'PUBLISHED',
        id: { not: productId },
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: PRODUCT_CARD_SELECT,
    });
    return products.map(serializeProduct);
  }

  async create(user: any, dto: CreateProductDto) {
    if (RESERVED_ROUTE_PARAMS.has(dto.categorySlug)) {
      throw new BadRequestException('Invalid category');
    }

    const category = await this.prisma.category.findUnique({
      where: { slug: dto.categorySlug.toLowerCase() },
    });
    if (!category) throw new BadRequestException('Unknown category');

    // Sellers must have completed onboarding
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile && user.role !== 'ADMIN') {
      throw new ForbiddenException('Create your seller profile first');
    }

    const images = (dto.images ?? []).filter(Boolean);
    const wantsPublish = dto.publish ?? false;

    // Governance: seller status decides whether publish is even possible.
    // Enforced HERE on the server — never by the UI alone.
    let publishStatus: 'PUBLISHED' | 'PENDING_REVIEW' = 'PUBLISHED';
    if (wantsPublish && user.role !== 'ADMIN') {
      if (profile.sellerStatus === 'PENDING') {
        throw new ForbiddenException(
          'Your seller application is still under review — products can be saved as drafts, but not published yet',
        );
      }
      if (profile.sellerStatus === 'REJECTED') {
        throw new ForbiddenException(
          'Your seller application was not approved — you cannot publish products',
        );
      }
      if (profile.sellerStatus === 'SUSPENDED' || profile.sellerStatus === 'BLOCKED') {
        throw new ForbiddenException(
          `Your seller account is ${profile.sellerStatus.toLowerCase()} — contact support`,
        );
      }
    }

    if (wantsPublish) {
      const errors = this.validateForPublish({
        name: dto.name,
        description: dto.description,
        price: dto.price,
        categoryId: category.id,
        productType: dto.productType,
        images,
      });
      if (errors.length) throw new BadRequestException({ message: errors, statusCode: 400 });
    }

    const slug = await this.createUniqueSlug(dto.name);

    return this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        price: dto.price,
        originalPrice: dto.originalPrice ?? null,
        productType: dto.productType,
        condition: dto.condition ?? null,
        quantity: dto.quantity ?? null,
        digitalInfo: dto.digitalInfo ?? null,
        status: wantsPublish ? publishStatus : 'DRAFT',
        tags: (dto.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean),
        images,
        inStock: dto.inStock ?? true,
        categoryId: category.id,
        sellerId: user.id,
      },
      select: { id: true, slug: true, status: true, name: true },
    });
  }

  /** Load a product the requester is allowed to mutate. */
  private async getOwnedProduct(id: string, user: any) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.sellerId !== user.id && user.role !== 'ADMIN') {
      // Ownership enforced here — the server decides, never the client.
      throw new ForbiddenException('You do not own this product');
    }
    return product;
  }

  async update(id: string, user: any, dto: UpdateProductDto) {
    const product = await this.getOwnedProduct(id, user);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name; // slug intentionally NOT regenerated
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.originalPrice !== undefined) data.originalPrice = dto.originalPrice;
    if (dto.productType !== undefined) data.productType = dto.productType;
    if (dto.condition !== undefined) data.condition = dto.condition;
    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.digitalInfo !== undefined) data.digitalInfo = dto.digitalInfo;
    if (dto.tags !== undefined) {
      data.tags = dto.tags.map((t) => t.toLowerCase().trim()).filter(Boolean);
    }
    if (dto.images !== undefined) data.images = dto.images.filter(Boolean);
    if (dto.inStock !== undefined) data.inStock = dto.inStock;

    if (dto.categorySlug !== undefined) {
      const category = await this.prisma.category.findUnique({
        where: { slug: dto.categorySlug.toLowerCase() },
      });
      if (!category) throw new BadRequestException('Unknown category');
      data.categoryId = category.id;
    }

    // If the product is published, edits may not break publish rules
    const next = {
      name: data.name ?? product.name,
      description: data.description ?? product.description,
      price: data.price ?? product.price,
      categoryId: data.categoryId ?? product.categoryId,
      productType: data.productType ?? product.productType,
      images: data.images ?? product.images,
    };
    if (product.status === 'PUBLISHED') {
      const errors = this.validateForPublish(next);
      if (errors.length) throw new BadRequestException({ message: errors, statusCode: 400 });
    }

    return this.prisma.product.update({
      where: { id },
      data,
      select: { id: true, slug: true, status: true, name: true },
    });
  }

  async publish(id: string, user: any) {
    const product = await this.getOwnedProduct(id, user);
    const errors = this.validateForPublish(product);
    if (errors.length) throw new BadRequestException({ message: errors, statusCode: 400 });

    // Governance: seller status gates publishing server-side.
    const profile = user.role === 'ADMIN'
      ? null
      : await this.prisma.sellerProfile.findUnique({
          where: { userId: user.id },
        });
    if (user.role !== 'ADMIN') {
      if (!profile || profile.sellerStatus === 'PENDING') {
        throw new ForbiddenException(
          'Your seller application is under review — publishing unlocks once approved',
        );
      }
      if (profile.sellerStatus === 'REJECTED') {
        throw new ForbiddenException(
          'Your seller application was not approved — you cannot publish products',
        );
      }
      if (profile.sellerStatus === 'SUSPENDED' || profile.sellerStatus === 'BLOCKED') {
        throw new ForbiddenException(
          `Your seller account is ${profile.sellerStatus.toLowerCase()} — contact support`,
        );
      }
    }

    // APPROVED sellers publish straight live; anyone else (should never
    // reach here) would go through review. Admins always publish live.
    const nextStatus: 'PUBLISHED' | 'PENDING_REVIEW' =
      user.role === 'ADMIN' || profile?.sellerStatus === 'APPROVED'
        ? 'PUBLISHED'
        : 'PENDING_REVIEW';

    return this.prisma.product.update({
      where: { id },
      data: { status: nextStatus, moderationReason: null, moderatedAt: null },
      select: { id: true, slug: true, status: true },
    });
  }

  async unpublish(id: string, user: any) {
    await this.getOwnedProduct(id, user);
    return this.prisma.product.update({
      where: { id },
      data: { status: 'UNPUBLISHED' },
      select: { id: true, slug: true, status: true },
    });
  }

  async remove(id: string, user: any) {
    await this.getOwnedProduct(id, user);
    await this.prisma.product.delete({ where: { id } });
    return { message: 'Product deleted' };
  }

  // ── Seller endpoints ─────────────────────────────────────

  async getSellerProducts(sellerId: string) {
    const products = await this.prisma.product.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      select: PRODUCT_CARD_SELECT,
    });
    const serialized = products.map(serializeProduct);

    const counts = {
      total: products.length,
      published: products.filter((p) => p.status === 'PUBLISHED').length,
      draft: products.filter((p) => p.status === 'DRAFT').length,
      pendingReview: products.filter((p) => p.status === 'PENDING_REVIEW').length,
      rejected: products.filter((p) => p.status === 'REJECTED').length,
      unpublished: products.filter((p) => p.status === 'UNPUBLISHED').length,
      digital: products.filter((p) => p.productType === 'DIGITAL').length,
      physical: products.filter((p) => p.productType === 'PHYSICAL').length,
      views: products.reduce((sum, p) => sum + p.viewCount, 0),
    };

    return { products: serialized, counts };
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('products')
export class ProductsController {
  constructor(private products: ProductsService) {}

  // GET /api/products — public marketplace listing w/ filters
  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.products.findAll(query);
  }

  // GET /api/products/featured
  @Get('featured')
  getFeatured() {
    return this.products.getFeatured();
  }

  // GET /api/products/new — New Arrivals
  @Get('new')
  getNew() {
    return this.products.getNew();
  }

  // GET /api/products/discovery — homepage multi-seller discovery grid
  @Get('discovery')
  getDiscovery() {
    return this.products.getDiscovery(20);
  }

  // GET /api/products/slug/:slug — public product page (canonical URL)
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.products.findBySlug(slug);
  }

  // GET /api/products/seller/me — my listings (any status)
  @Get('seller/me')
  @UseGuards(JwtAuthGuard)
  getMyProducts(@CurrentUser() user: any) {
    return this.products.getSellerProducts(user.id);
  }

  // POST /api/products — create (seller or admin)
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SELLER', 'ADMIN')
  create(@CurrentUser() user: any, @Body() dto: CreateProductDto) {
    return this.products.create(user, dto);
  }

  // GET /api/products/:id — single product (used for previews/edit)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  // PATCH /api/products/:id — update (owner only)
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateProductDto) {
    return this.products.update(id, user, dto);
  }

  // POST /api/products/:id/publish — owner only, validated
  @Post(':id/publish')
  @UseGuards(JwtAuthGuard)
  publish(@Param('id') id: string, @CurrentUser() user: any) {
    return this.products.publish(id, user);
  }

  // POST /api/products/:id/unpublish — owner only
  @Post(':id/unpublish')
  @UseGuards(JwtAuthGuard)
  unpublish(@Param('id') id: string, @CurrentUser() user: any) {
    return this.products.unpublish(id, user);
  }

  // DELETE /api/products/:id — owner only
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.products.remove(id, user);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}

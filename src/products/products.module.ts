// ============================================================
// KOVA API — Products Module (Prisma 8)
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
import { db } from '../prisma/db';
import { rawRows } from '../prisma/raw-helper';
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

/** Decimal → JSON-safe number (Naira, 2dp max). */
export function money(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/** Convert a product's Decimal money fields to plain numbers. */
function serializeProduct<T extends { price: unknown; originalPrice?: unknown }>(p: T): T {
  return { ...p, price: money(p.price), originalPrice: p.originalPrice ? money(p.originalPrice) : null };
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class ProductsService {
  /** Generate a unique slug once — never regenerated on rename. */
  private async createUniqueSlug(name: string, productId?: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    let n = 2;
    // Loop is bounded in practice; skip our own product when updating
    // (not needed today — slugs are never regenerated).
    while (true) {
      const clash = await db.orm.public.Product
        .where({ slug: candidate })
        .select('id')
        .first();
      if (!clash || clash.id === productId) return candidate;
      candidate = `${base}-${n++}`;
    }
  }

  /** Publish requirements — enforced server-side, never by the UI. */
  private validateForPublish(product: {
    name: string;
    description: string;
    price: unknown; // number or string (numeric codec)
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

  /**
   * Card projection + related reads, shared by every listing query.
   * Mirrors the old PRODUCT_CARD_SELECT exactly (category + seller +
   * sellerProfile.isVerified included).
   */
  private card() {
    return db.orm.public.Product
      .include('category', (c) => c.select('name', 'slug'))
      .include('seller', (s) =>
        s
          .select('id', 'name', 'avatarUrl')
          .include('sellerProfile', (sp) => sp.select('storeName', 'storeSlug', 'isVerified')),
      )
      .select(
        'id', 'name', 'slug', 'price', 'originalPrice', 'productType',
        'status', 'badge', 'tags', 'images', 'inStock', 'rating',
        'reviewCount', 'buyCount', 'viewCount', 'createdAt',
      );
  }

  /**
   * Text search — v8's chained API has no OR-combiner, so the free-text
   * branch runs as its own ID pre-query (name/description ilike + tag
   * element match + store name ilike), then the main filter narrows to
   * those IDs. Semantics match the previous OR search.
   */
  private async searchTextIds(q: string): Promise<string[] | null> {
    const term = q.trim();
    if (!term) return null;
    const like = `%${term}%`;
    const tag = term.toLowerCase();

    const [byName, byDescription, byTag, byStore] = await Promise.all([
      db.orm.public.Product.where((p) => p.name.ilike(like)).select('id').all(),
      db.orm.public.Product.where((p) => p.description.ilike(like)).select('id').all(),
      // Scalar lists have no element-membership operator in v8 — match
      // tags in SQL, then narrow by ID (same rows as v5's `{ has: tag }`).
      rawRows<{ id: string }>(
        db.raw.sql`SELECT id FROM products WHERE ${tag}::text = ANY(tags)`.returnsRow({
          id: 'pg/text@1',
        }),
      ),
      db.orm.public.SellerProfile
        .where((sp) => sp.storeName.ilike(like))
        .select('userId')
        .all(),
    ]);

    const sellerIds = new Set(byStore.map((s) => s.userId));
    const bySeller = sellerIds.size
      ? await db.orm.public.Product
          .where((p) => p.sellerId.in([...sellerIds]))
          .select('id')
          .all()
      : [];

    const ids = new Set<string>();
    for (const row of [...byName, ...byDescription, ...byTag, ...bySeller]) {
      ids.add(row.id);
    }
    return [...ids];
  }

  /** Apply the shared query filters to a collection chain. */
  private applyFilters(
    query: ProductQueryDto,
    textIds: string[] | null,
  ) {
    let chain = this.card().where({ status: 'PUBLISHED' as const });

    if (textIds) {
      if (textIds.length === 0) return null; // no matches at all
      chain = chain.where((p) => p.id.in(textIds));
    }
    if (query.category) {
      chain = chain.where((p) => p.category.some({ slug: query.category!.toLowerCase() }));
    }
    if (query.type) chain = chain.where({ productType: query.type.toUpperCase() as 'PHYSICAL' | 'DIGITAL' });
    if (query.badge) chain = chain.where({ badge: query.badge.toUpperCase() as 'NEW' | 'HOT' | 'SALE' });
    if (query.store) {
      chain = chain.where((p) =>
        p.seller.some((s) => s.sellerProfile.some({ storeSlug: query.store! })),
      );
    }
    if (query.minPrice !== undefined) chain = chain.where((p) => p.price.gte(String(query.minPrice) as never));
    if (query.maxPrice !== undefined) chain = chain.where((p) => p.price.lte(String(query.maxPrice) as never));
    return chain;
  }

  /** Order a chain by the public sort options (multi-key sorts chained). */
  private applySort(chain: ReturnType<ProductsService['card']>, sort?: string) {
    switch (sort) {
      case 'price-asc':  return chain.orderBy((p) => p.price.asc());
      case 'price-desc': return chain.orderBy((p) => p.price.desc());
      case 'rating':     return chain.orderBy((p) => p.rating.desc()).orderBy((p) => p.reviewCount.desc());
      case 'popular':    return chain.orderBy((p) => p.buyCount.desc()).orderBy((p) => p.viewCount.desc());
      case 'views':      return chain.orderBy((p) => p.viewCount.desc());
      case 'name':       return chain.orderBy((p) => p.name.asc());
      default:           return chain.orderBy((p) => p.createdAt.desc()); // newest first
    }
  }

  async findAll(query: ProductQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const textIds = await this.searchTextIds(query.q ?? '');
    const filtered = this.applyFilters(query, textIds);
    if (!filtered) {
      return { products: [], total: 0, page, limit, pages: 0 };
    }

    const [products, totalAgg] = await Promise.all([
      this.applySort(filtered, query.sort)
        .offset((page - 1) * limit)
        .limit(limit)
        .all(),
      filtered.aggregate((a) => ({ total: a.count() })),
    ]);
    const total = Number(totalAgg.total);

    return {
      products: products.map(serializeProduct),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getFeatured(limit = 8) {
    const products = await this.card()
      .where({ status: 'PUBLISHED' })
      .orderBy((p) => p.buyCount.desc())
      .orderBy((p) => p.viewCount.desc())
      .limit(limit)
      .all();
    return products.map(serializeProduct);
  }

  /**
   * Marketplace discovery — products drawn from MANY different sellers
   * and categories for the homepage. Deterministic rotation from a
   * large offset pool keeps the grid fresh between visits without
   * fabricating anything: every candidate is a real published row.
   */
  async getDiscovery(limit = 20) {
    const totalAgg = await db.orm.public.Product
      .where({ status: 'PUBLISHED' })
      .aggregate((a) => ({ total: a.count() }));
    const total = Number(totalAgg.total);
    if (total === 0) return [];

    // Day-changing offset + deterministic jitter rotates the pool daily
    // while keeping a single render consistent.
    const dayBucket = Math.floor(Date.now() / 86_400_000);
    const jitter = (dayBucket * 2654435761) % 97;
    const offset = total > limit * 3 ? (jitter * (total - limit * 3)) / 97 : 0;

    const [a, b] = await Promise.all([
      this.card()
        .where({ status: 'PUBLISHED' })
        .orderBy((p) => p.createdAt.desc())
        .offset(Math.floor(offset))
        .limit(limit)
        .all(),
      // Guarantee multi-seller variety: top-rated picks appended from a
      // different sort order so a sparse day still shows diverse sellers.
      this.card()
        .where({ status: 'PUBLISHED' })
        .where((p) => p.rating.gte(4))
        .orderBy((p) => p.reviewCount.desc())
        .orderBy((p) => p.buyCount.desc())
        .limit(Math.ceil(limit / 2))
        .all(),
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
      const sellerId = p.seller?.id;
      if (!sellerId) continue;
      const n = bySeller.get(sellerId) ?? 0;
      if (n >= Math.max(2, Math.ceil(limit / 5))) continue;
      bySeller.set(sellerId, n + 1);
      balanced.push(p);
    }
    return balanced.slice(0, limit).map(serializeProduct);
  }

  /** New Arrivals — newest published listings first. */
  async getNew(limit = 12) {
    const products = await this.card()
      .where({ status: 'PUBLISHED' })
      .orderBy((p) => p.createdAt.desc())
      .limit(limit)
      .all();
    return products.map(serializeProduct);
  }

  /** Public product page by slug — the canonical URL QR codes point to. */
  async findBySlug(slug: string) {
    const product = await this.detailChain().where({ slug }).first();
    if (!product || product.status !== 'PUBLISHED') {
      throw new NotFoundException('Product not found');
    }

    // Count the view (fire-and-forget: never block the page on it)
    db.orm.public.Product
      .where({ id: product.id })
      .update({ viewCount: product.viewCount + 1 })
      .catch(() => undefined);

    return serializeProduct(product);
  }

  /** Card projection + description + latest reviews. */
  private detailChain() {
    return this.card()
      .select(
        'id', 'name', 'slug', 'price', 'originalPrice', 'productType',
        'status', 'badge', 'tags', 'images', 'inStock', 'rating',
        'reviewCount', 'buyCount', 'viewCount', 'createdAt',
        'description', 'updatedAt',
      )
      .include('reviews', (r) =>
        r
          .include('user', (u) => u.select('id', 'name', 'avatarUrl'))
          .select('id', 'rating', 'title', 'comment', 'createdAt', 'verifiedPurchase')
          .orderBy((rev) => rev.createdAt.desc())
          .limit(10),
      );
  }

  async findOne(id: string) {
    const product = await this.detailChain().where({ id }).first();
    if (!product) throw new NotFoundException('Product not found');
    return serializeProduct(product);
  }

  async getRelated(productId: string, categoryId: string | null, limit = 4) {
    let chain = this.card()
      .where({ status: 'PUBLISHED' })
      .where((p) => p.id.neq(productId));
    if (categoryId) chain = chain.where({ categoryId });
    const products = await chain
      .orderBy((p) => p.createdAt.desc())
      .limit(limit)
      .all();
    return products.map(serializeProduct);
  }

  async create(user: any, dto: CreateProductDto) {
    if (RESERVED_ROUTE_PARAMS.has(dto.categorySlug)) {
      throw new BadRequestException('Invalid category');
    }

    const category = await db.orm.public.Category
      .where({ slug: dto.categorySlug.toLowerCase() })
      .select('id')
      .first();
    if (!category) throw new BadRequestException('Unknown category');

    // Sellers must have completed onboarding
    const profile = await db.orm.public.SellerProfile
      .where({ userId: user.id })
      .first();
    if (!profile && user.role !== 'ADMIN') {
      throw new ForbiddenException('Create your seller profile first');
    }

    const images = (dto.images ?? []).filter(Boolean);
    const wantsPublish = dto.publish ?? false;

    // Governance: seller status decides whether publish is even possible.
    // Enforced HERE on the server — never by the UI alone.
    // (An ADMIN with no seller profile skips these checks entirely.)
    if (wantsPublish && user.role !== 'ADMIN' && profile) {
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

    const created = await db.orm.public.Product
      .include('category', (c) => c.select('name', 'slug'))
      .create({
        name: dto.name,
        slug,
        description: dto.description,
        price: dto.price as never,
        originalPrice: (dto.originalPrice ?? null) as never,
        productType: dto.productType,
        condition: dto.condition ?? null,
        quantity: dto.quantity ?? null,
        digitalInfo: dto.digitalInfo ?? null,
        status: wantsPublish ? 'PUBLISHED' : 'DRAFT',
        tags: (dto.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean),
        images,
        inStock: dto.inStock ?? true,
        categoryId: category.id,
        sellerId: user.id,
      });
    return { id: created.id, slug: created.slug, status: created.status, name: created.name };
  }

  /** Load a product the requester is allowed to mutate. */
  private async getOwnedProduct(id: string, user: any) {
    const product = await db.orm.public.Product.where({ id }).first();
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
      const category = await db.orm.public.Category
        .where({ slug: dto.categorySlug.toLowerCase() })
        .select('id')
        .first();
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

    const updated = await db.orm.public.Product
      .where({ id })
      .update(data);
    if (!updated) throw new NotFoundException('Product not found');
    return { id: updated!.id, slug: updated!.slug, status: updated!.status, name: updated!.name };
  }

  async publish(id: string, user: any) {
    const product = await this.getOwnedProduct(id, user);
    const errors = this.validateForPublish({
      ...product,
      images: product.images ? [...product.images] : [],
    });
    if (errors.length) throw new BadRequestException({ message: errors, statusCode: 400 });

    // Governance: seller status gates publishing server-side.
    const profile = user.role === 'ADMIN'
      ? null
      : await db.orm.public.SellerProfile.where({ userId: user.id }).first();
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

    const updated = await db.orm.public.Product
      .where({ id })
      .update({ status: nextStatus, moderationReason: null, moderatedAt: null });
    if (!updated) throw new NotFoundException('Product not found');
    return { id: updated!.id, slug: updated!.slug, status: updated!.status };
  }

  async unpublish(id: string, user: any) {
    await this.getOwnedProduct(id, user);
    const updated = await db.orm.public.Product
      .where({ id })
      .update({ status: 'UNPUBLISHED' });
    if (!updated) throw new NotFoundException('Product not found');
    return { id: updated!.id, slug: updated!.slug, status: updated!.status };
  }

  async remove(id: string, user: any) {
    await this.getOwnedProduct(id, user);
    await db.orm.public.Product.where({ id }).delete();
    return { message: 'Product deleted' };
  }

  // ── Seller endpoints ─────────────────────────────────────

  async getSellerProducts(sellerId: string) {
    const products = await this.card()
      .where({ sellerId })
      .orderBy((p) => p.createdAt.desc())
      .all();
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'product';
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

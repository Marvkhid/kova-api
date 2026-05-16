// ============================================================
// KOVA API — Products Module
// CRUD for products. Public reads, auth required for writes.
// ============================================================

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../auth/auth.module';

// ── DTOs ──────────────────────────────────────────────────

enum ProductCategory {
  FASHION = 'FASHION',
  DIGITAL = 'DIGITAL',
  SERVICES = 'SERVICES',
  PHYSICAL = 'PHYSICAL',
  ART = 'ART',
  COURSES = 'COURSES',
}
enum ProductBadge {
  NEW = 'NEW',
  HOT = 'HOT',
  SALE = 'SALE',
}

export class CreateProductDto {
  @IsString() name: string;
  @IsString() description: string;
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  originalPrice?: number;
  @IsEnum(ProductCategory) category: ProductCategory;
  @IsOptional()
  @IsEnum(ProductBadge)
  badge?: ProductBadge;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;
  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;
  @IsOptional()
  @IsEnum(ProductBadge)
  badge?: ProductBadge;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsArray() images?: string[];
  @IsOptional() @IsBoolean() isPublished?: boolean;
}

export class ProductQueryDto {
  @IsOptional() @IsString() q?: string; // search query
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() badge?: string;
  @IsOptional() @IsString() seller?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @Type(() => Number) @IsNumber() page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() limit?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxPrice?: number;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: ProductQueryDto) {
    const {
      q,
      category,
      badge,
      seller,
      sort = 'createdAt',
      page = 1,
      limit = 20,
      maxPrice,
    } = query;

    const where: any = { isPublished: true };

    // Search
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { tags: { has: q } },
      ];
    }

    if (category) where.category = category.toUpperCase();
    if (badge) where.badge = badge.toUpperCase();
    if (maxPrice) where.price = { lte: maxPrice };

    if (seller) {
      where.seller = { name: { contains: seller, mode: 'insensitive' } };
    }

    // Sort
    const orderBy: any = {};
    switch (sort) {
      case 'price-asc':
        orderBy.price = 'asc';
        break;
      case 'price-desc':
        orderBy.price = 'desc';
        break;
      case 'rating':
        orderBy.rating = 'desc';
        break;
      case 'popular':
        orderBy.buyCount = 'desc';
        break;
      default:
        orderBy.createdAt = 'desc';
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          seller: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { products, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            sellerProfile: true,
          },
        },
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

    // Increment view count
    await this.prisma.product.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return product;
  }

  async create(sellerId: string, dto: CreateProductDto) {
    // Generate slug from name
    const slug =
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') +
      '-' +
      Date.now();

    return this.prisma.product.create({
      data: {
        ...dto,
        slug,
        sellerId,
        tags: dto.tags ?? [],
        images: dto.images ?? [],
      },
    });
  }

  async update(id: string, sellerId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.sellerId !== sellerId)
      throw new ForbiddenException('Not your product');

    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async remove(id: string, sellerId: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.sellerId !== sellerId)
      throw new ForbiddenException('Not your product');

    await this.prisma.product.delete({ where: { id } });
    return { message: 'Product deleted' };
  }

  async getSellerProducts(sellerId: string) {
    return this.prisma.product.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFeatured() {
    return this.prisma.product.findMany({
      where: { isPublished: true },
      orderBy: { buyCount: 'desc' },
      take: 8,
      include: { seller: { select: { name: true } } },
    });
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('products')
export class ProductsController {
  constructor(private products: ProductsService) {}

  // GET /api/products — list all with filters
  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.products.findAll(query);
  }

  // GET /api/products/featured
  @Get('featured')
  getFeatured() {
    return this.products.getFeatured();
  }

  // GET /api/products/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  // POST /api/products — create (seller only)
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: any, @Body() dto: CreateProductDto) {
    return this.products.create(user.id, dto);
  }

  // PATCH /api/products/:id — update (seller only)
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, user.id, dto);
  }

  // DELETE /api/products/:id — delete (seller only)
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.products.remove(id, user.id);
  }

  // GET /api/products/seller/me — my listings
  @Get('seller/me')
  @UseGuards(JwtAuthGuard)
  getMyProducts(@CurrentUser() user: any) {
    return this.products.getSellerProducts(user.id);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}

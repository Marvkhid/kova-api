// ============================================================
// KOVA API — Categories Module
// Database-driven categories. Public reads, admin writes.
// ============================================================

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';

// ── DTOs ──────────────────────────────────────────────────

export class CreateCategoryDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() @Min(0) @Max(999) @Type(() => Number) sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() @Min(0) @Max(999) @Type(() => Number) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** Public list with published-product counts. */
  async findAll() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: {
            products: { where: { status: 'PUBLISHED' } },
          },
        },
      },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      icon: c.icon,
      sortOrder: c.sortOrder,
      productCount: c._count.products,
    }));
  }

  async create(dto: CreateCategoryDto) {
    const slug = this.slugify(dto.name);
    if (!slug) throw new BadRequestException('Invalid category name');
    const exists = await this.prisma.category.findUnique({ where: { slug } });
    if (exists) throw new ConflictException('A category with that name already exists');
    return this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 99,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.name && dto.name !== category.name) {
      const slug = this.slugify(dto.name);
      const clash = await this.prisma.category.findUnique({ where: { slug } });
      if (clash && clash.id !== id) {
        throw new ConflictException('A category with that name already exists');
      }
      return this.prisma.category.update({
        where: { id },
        data: { ...dto, slug },
      });
    }

    return this.prisma.category.update({ where: { id }, data: dto });
  }

  /** Delete only when the category has no products. */
  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category._count.products > 0) {
      throw new ConflictException(
        `Cannot delete — ${category._count.products} product(s) still use this category`,
      );
    }
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Category deleted' };
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('categories')
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  // GET /api/categories — public
  @Get()
  findAll() {
    return this.categories.findAll();
  }

  // POST /api/categories — admin only
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  // PATCH /api/categories/:id — admin only
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  // DELETE /api/categories/:id — admin only, safe delete
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [CategoriesService],
  controllers: [CategoriesController],
  exports: [CategoriesService],
})
export class CategoriesModule {}

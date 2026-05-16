// ============================================================
// KOVA API — Reviews Module
// Product reviews and ratings.
// ============================================================

import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Module,
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.module';
import { JwtAuthGuard, CurrentUser } from '../auth/auth.module';

// ── DTOs ──────────────────────────────────────────────────

export class CreateReviewDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

// ── Service ───────────────────────────────────────────────

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, productId: string, dto: CreateReviewDto) {
    // Check product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Check user hasn't already reviewed
    const existing = await this.prisma.review.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (existing)
      throw new ConflictException('You have already reviewed this product');

    // Create review
    const review = await this.prisma.review.create({
      data: { userId, productId, ...dto },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    // Update product average rating
    await this.updateProductRating(productId);

    return review;
  }

  async getProductReviews(productId: string) {
    return this.prisma.review.findMany({
      where: { productId },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(id: string, userId: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId)
      throw new ForbiddenException('Not your review');

    await this.prisma.review.delete({ where: { id } });

    // Recalculate product rating
    await this.updateProductRating(review.productId);

    return { message: 'Review deleted' };
  }

  private async updateProductRating(productId: string) {
    const reviews = await this.prisma.review.findMany({ where: { productId } });
    const avg = reviews.length
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    await this.prisma.product.update({
      where: { id: productId },
      data: {
        rating: Math.round(avg * 10) / 10,
        reviewCount: reviews.length,
      },
    });
  }
}

// ── Controller ────────────────────────────────────────────

@Controller('products/:productId/reviews')
export class ReviewsController {
  constructor(private reviews: ReviewsService) {}

  // GET /api/products/:productId/reviews
  @Get()
  getReviews(@Param('productId') productId: string) {
    return this.reviews.getProductReviews(productId);
  }

  // POST /api/products/:productId/reviews
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Param('productId') productId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(user.id, productId, dto);
  }

  // DELETE /api/products/:productId/reviews/:id
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.reviews.delete(id, user.id);
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [ReviewsService],
  controllers: [ReviewsController],
})
export class ReviewsModule {}

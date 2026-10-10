// ============================================================
// KOVA API — Categories Module
// Serves the categories list for the frontend navigation.
// ============================================================

import { Module, Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

@Controller('categories')
export class CategoriesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getCategories() {
    const categories = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        slug: string;
        icon: string | null;
        sortOrder: number;
        isActive: boolean;
      }>
    >`SELECT id, name, slug, icon, "sortOrder", "isActive"
     FROM categories
     WHERE "isActive" = true
     ORDER BY "sortOrder" ASC`;
    return categories;
  }
}

@Module({
  controllers: [CategoriesController],
})
export class CategoriesModule {}

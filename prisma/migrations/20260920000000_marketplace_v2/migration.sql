-- ============================================================
-- KOVA — Marketplace v2
-- 1. DB-driven Category table
-- 2. ProductType (PHYSICAL / DIGITAL)
-- 3. ProductStatus (DRAFT / PUBLISHED / UNPUBLISHED / REMOVED)
-- 4. Wishlist
-- Backfills all data from the legacy `category` enum + `isPublished`
-- columns, then drops them. Stable product slugs are NOT touched.
-- ============================================================

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PHYSICAL', 'DIGITAL');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'REMOVED');

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_userId_productId_key" ON "wishlist_items"("userId", "productId");

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable — new product columns (safe defaults before backfill)
ALTER TABLE "products" ADD COLUMN "productType" "ProductType" NOT NULL DEFAULT 'PHYSICAL';
ALTER TABLE "products" ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "products" ADD COLUMN "categoryId" TEXT;

-- ── Backfill categories from the legacy enum ───────────────
INSERT INTO "categories" ("id", "name", "slug", "icon", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Fashion & Style',    'fashion',  'fashion',  1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Digital Products',   'digital',  'digital',  2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Services',           'services', 'services', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Physical Goods',     'physical', 'physical', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Art & Crafts',       'art',      'art',      5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Courses & Learning', 'courses',  'courses',  6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Map every product to its category row via the legacy enum value
UPDATE "products"
SET "categoryId" = c."id"
FROM "categories" c
WHERE c."slug" = LOWER("products"."category"::text);

-- Derive productType from the legacy category
UPDATE "products"
SET "productType" = CASE
  WHEN "category"::text IN ('DIGITAL', 'COURSES') THEN 'DIGITAL'::"ProductType"
  ELSE 'PHYSICAL'::"ProductType"
END;

-- Derive status from the legacy isPublished flag
UPDATE "products"
SET "status" = CASE WHEN "isPublished" THEN 'PUBLISHED'::"ProductStatus" ELSE 'UNPUBLISHED'::"ProductStatus" END;

-- FK + indexes for products.categoryId
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "products_status_createdAt_idx" ON "products"("status", "createdAt");
CREATE INDEX "products_sellerId_idx" ON "products"("sellerId");
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- ── Drop legacy columns ────────────────────────────────────
ALTER TABLE "products" DROP COLUMN IF EXISTS "category";
ALTER TABLE "products" DROP COLUMN IF EXISTS "isPublished";
DROP TYPE IF EXISTS "ProductCategory";

-- SellerProfile denormalized counters removed — computed live from real data
ALTER TABLE "seller_profiles" DROP COLUMN IF EXISTS "totalSales";
ALTER TABLE "seller_profiles" DROP COLUMN IF EXISTS "totalRevenue";
ALTER TABLE "seller_profiles" DROP COLUMN IF EXISTS "rating";
ALTER TABLE "seller_profiles" DROP COLUMN IF EXISTS "reviewCount";

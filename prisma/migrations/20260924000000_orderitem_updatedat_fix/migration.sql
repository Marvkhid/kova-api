-- ============================================================
-- KOVA — Corrective migration
-- 1. order_items.updatedAt existed in the Prisma schema but was
--    missing from every prior migration, so live databases that
--    migrated (rather than db push) lacked it. Add it now.
-- 2. products.price accidentally gained a DEFAULT 0 during the
--    v3 decimal conversion; the schema defines no default.
-- ============================================================

ALTER TABLE "order_items" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "products" ALTER COLUMN "price" DROP DEFAULT;

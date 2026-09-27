-- ============================================================
-- KOVA — Marketplace v3
-- Single self-contained migration:
--   1. Extend OrderStatus enum (PAID, PACKED, IN_TRANSIT, OUT_FOR_DELIVERY)
--   2. Convert money columns to DECIMAL(12,2)
--   3. Review moderation + verified-purchase backfill
--   4. Per-item fulfillment state (FulfillmentStatus)
--   5. Append-only OrderEvent timeline
--   6. SellerReview (seller reputation)
--   7. Seller location for public store pages
--
-- Postgres restriction: after `ALTER TYPE ... ADD VALUE`, the new
-- values cannot be *referenced as literals* later in the same
-- transaction. Where a backfill must match the new 'PAID' label,
-- it compares the enum as ::text — the restriction applies to
-- enum-typed usage, and legacy rows can only hold legacy labels.
-- ============================================================

-- ── 1. Enum extensions ─────────────────────────────────────
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PACKED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'OUT_FOR_DELIVERY';

-- ── 2. Money → Decimal(12,2) ───────────────────────────────
ALTER TABLE "products" ALTER COLUMN "price" TYPE DECIMAL(12,2),
                      ALTER COLUMN "price" SET DEFAULT 0,
                      ALTER COLUMN "originalPrice" TYPE DECIMAL(12,2);
ALTER TABLE "orders" ALTER COLUMN "subtotal" TYPE DECIMAL(12,2);
ALTER TABLE "orders" ALTER COLUMN "shipping" TYPE DECIMAL(12,2);
ALTER TABLE "orders" ALTER COLUMN "shipping" SET DEFAULT 0;
ALTER TABLE "orders" ALTER COLUMN "total" TYPE DECIMAL(12,2);
ALTER TABLE "order_items" ALTER COLUMN "price" TYPE DECIMAL(12,2);

-- ── 3. Review moderation + verification ───────────────────
CREATE TYPE "ReviewStatus" AS ENUM ('VISIBLE', 'HIDDEN');

ALTER TABLE "reviews" ADD COLUMN "title" TEXT;
ALTER TABLE "reviews" ADD COLUMN "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reviews" ADD COLUMN "status" "ReviewStatus" NOT NULL DEFAULT 'VISIBLE';

CREATE INDEX "reviews_productId_status_createdAt_idx" ON "reviews"("productId", "status", "createdAt");

-- Backfill: a review is a verified purchase when a paid order
-- links this user to this product. Compared as text because the
-- 'PAID' OrderStatus-adjacent PaymentStatus value is not new, but
-- keeping ::text avoids any enum-literal restriction entirely.
UPDATE "reviews" r
SET "verifiedPurchase" = EXISTS (
  SELECT 1
  FROM "order_items" oi
  JOIN "orders" o ON o."id" = oi."orderId"
  WHERE oi."productId" = r."productId"
    AND o."userId" = r."userId"
    AND o."paymentStatus"::text = 'PAID'
);

-- ── 4. FulfillmentStatus on order items ────────────────────
CREATE TYPE "FulfillmentStatus" AS ENUM (
  'PENDING', 'PAID', 'PROCESSING', 'PACKED', 'SHIPPED',
  'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'
);

ALTER TABLE "order_items"
  ADD COLUMN "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "trackingNumber" TEXT,
  ADD COLUMN "carrier" TEXT;

CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- Backfill item fulfillment from the order's current status.
-- CASE over a runtime column — no new-enum literals referenced.
UPDATE "order_items" oi
SET "fulfillmentStatus" = (
  SELECT o."status"::text::"FulfillmentStatus"
  FROM "orders" o
  WHERE o."id" = oi."orderId"
)
WHERE EXISTS (SELECT 1 FROM "orders" o WHERE o."id" = oi."orderId");

-- ── 5. OrderEvent timeline ─────────────────────────────────
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_events_orderId_createdAt_idx" ON "order_events"("orderId", "createdAt");

ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill one event per existing order from its current status,
-- timestamped at the order's creation (approximation for legacy rows).
INSERT INTO "order_events" ("orderId", "status", "message", "createdAt")
SELECT o."id", o."status", 'Imported from legacy order state', o."createdAt"
FROM "orders" o;

-- ── 6. SellerReview ────────────────────────────────────────
CREATE TABLE "seller_reviews" (
    "id" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "communication" INTEGER,
    "productAccuracy" INTEGER,
    "packaging" INTEGER,
    "deliveryExperience" INTEGER,
    "comment" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "seller_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seller_reviews_sellerUserId_authorId_key" ON "seller_reviews"("sellerUserId", "authorId");
CREATE INDEX "seller_reviews_sellerUserId_status_idx" ON "seller_reviews"("sellerUserId", "status");

ALTER TABLE "seller_reviews" ADD CONSTRAINT "seller_reviews_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seller_reviews" ADD CONSTRAINT "seller_reviews_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 7. Seller location for public store pages ──────────────
ALTER TABLE "seller_profiles" ADD COLUMN "location" TEXT;

-- ── 8. Order query index ───────────────────────────────────
CREATE INDEX "orders_userId_createdAt_idx" ON "orders"("userId", "createdAt");

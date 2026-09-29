-- CreateEnum
CREATE TYPE "SellerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'BLOCKED');

-- AlterEnum
-- the enum.


ALTER TYPE "ProductStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "ProductStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "condition" TEXT,
ADD COLUMN     "digitalInfo" TEXT,
ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderationReason" TEXT,
ADD COLUMN     "quantity" INTEGER;

-- AlterTable
ALTER TABLE "seller_profiles" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "category" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "sellerStatus" "SellerStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT;


-- ── Backfill: sellers that already exist were onboarded before
-- governance. They are established storefronts with live products
-- and buyer reviews — mark them APPROVED with terms v1.0 accepted
-- at profile creation, instead of dumping them into PENDING.
UPDATE "seller_profiles"
SET "sellerStatus"  = 'APPROVED',
    "appliedAt"     = "createdAt",
    "approvedAt"    = "createdAt",
    "termsVersion"  = '1.0',
    "termsAcceptedAt" = "createdAt"
WHERE "sellerStatus" = 'PENDING';

-- Brings the migration history in line with schema.prisma: SellerProfile and
-- columns that were added to the schema (via db push) without a migration.
-- Idempotent on purpose, so it is safe on databases that already have them.

-- AlterTable
ALTER TABLE "BuyerProfile"
  ADD COLUMN IF NOT EXISTS "mortgageBuyerType" TEXT,
  ADD COLUMN IF NOT EXISTS "mortgageDesiredPayment" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "mortgageEquity" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "mortgageIncome" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "mortgageMaxPrice" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "amenities" TEXT[],
  ADD COLUMN IF NOT EXISTS "building_3d_url" TEXT,
  ADD COLUMN IF NOT EXISTS "ownerType" TEXT NOT NULL DEFAULT 'developer',
  ADD COLUMN IF NOT EXISTS "teaserVideoData" TEXT,
  ADD COLUMN IF NOT EXISTS "video_url" TEXT;

-- AlterTable
ALTER TABLE "UnitType"
  ADD COLUMN IF NOT EXISTS "floor_plan_url" TEXT,
  ADD COLUMN IF NOT EXISTS "image_urls" TEXT[],
  ADD COLUMN IF NOT EXISTS "ownerType" TEXT NOT NULL DEFAULT 'developer',
  ADD COLUMN IF NOT EXISTS "video_url" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "quotaResetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SellerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SellerProfile_userId_key" ON "SellerProfile"("userId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

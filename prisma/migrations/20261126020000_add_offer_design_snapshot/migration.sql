-- A buyer's Design Studio design is private to them; it is copied onto an offer only when they attach it.
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "designSnapshot" JSONB;

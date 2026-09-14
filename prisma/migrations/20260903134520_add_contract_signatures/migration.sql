-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "buyerSignature" TEXT,
ADD COLUMN     "contractEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "developerSignature" TEXT;

-- AlterTable: add buyer consent field for profile sharing with developer
-- Consent is given via checkbox at offer submission and stored per offer.
-- Profile/insights are never shared with the developer without this consent.
ALTER TABLE "Offer" ADD COLUMN "consentToShareProfile" BOOLEAN NOT NULL DEFAULT false;

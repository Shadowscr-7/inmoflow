-- AlterTable: Tenant — add phoneCountryCode for WhatsApp normalization
ALTER TABLE "Tenant" ADD COLUMN "phoneCountryCode" TEXT NOT NULL DEFAULT '598';

-- MercadoLibre integration fields on Tenant
ALTER TABLE "Tenant" ADD COLUMN "meliAccessToken" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "meliRefreshToken" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "meliUserId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "meliEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "meliLastSync" TIMESTAMP(3);

-- New property fields for MeLi + operations
ALTER TABLE "Property" ADD COLUMN "operationType" TEXT;
ALTER TABLE "Property" ADD COLUMN "floors" INTEGER;
ALTER TABLE "Property" ADD COLUMN "amenities" TEXT;
ALTER TABLE "Property" ADD COLUMN "meliItemId" TEXT;
ALTER TABLE "Property" ADD COLUMN "meliPermalink" TEXT;
ALTER TABLE "Property" ADD COLUMN "meliSyncedAt" TIMESTAMP(3);
ALTER TABLE "Property" ADD COLUMN "meliStatus" TEXT;

-- Unique constraint: one MeLi item per tenant
CREATE UNIQUE INDEX "Property_tenantId_meliItemId_key" ON "Property"("tenantId", "meliItemId");

-- PropertyMedia: default kind, add thumbnailUrl
ALTER TABLE "PropertyMedia" ALTER COLUMN "kind" SET DEFAULT 'image';
ALTER TABLE "PropertyMedia" ALTER COLUMN "kind" SET NOT NULL;
UPDATE "PropertyMedia" SET "kind" = 'image' WHERE "kind" IS NULL;
ALTER TABLE "PropertyMedia" ADD COLUMN "thumbnailUrl" TEXT;

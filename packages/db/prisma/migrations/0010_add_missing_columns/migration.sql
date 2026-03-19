-- AlterTable: Message — add mediaUrl and mediaType
ALTER TABLE "Message" ADD COLUMN "mediaUrl" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaType" TEXT;

-- AlterTable: AiConfig — add userId for per-agent override
ALTER TABLE "AiConfig" ADD COLUMN "userId" TEXT;

-- DropIndex: remove old unique constraint on tenantId (schema now uses @@index)
DROP INDEX IF EXISTS "AiConfig_tenantId_key";

-- CreateIndex: composite index on tenantId + userId
CREATE INDEX "AiConfig_tenantId_userId_idx" ON "AiConfig"("tenantId", "userId");

-- AddForeignKey: AiConfig.userId → User.id
ALTER TABLE "AiConfig" ADD CONSTRAINT "AiConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum: add missing EventType values
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'lead_assigned';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'lead_contacted';

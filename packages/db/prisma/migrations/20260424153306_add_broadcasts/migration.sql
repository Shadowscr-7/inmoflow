-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'READY', 'SENDING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BroadcastItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "BroadcastBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "autoApproveStageIds" TEXT[],
    "autoSend" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channelId" TEXT,
    "status" "BroadcastItemStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BroadcastBatch_tenantId_status_idx" ON "BroadcastBatch"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BroadcastBatch_tenantId_createdAt_idx" ON "BroadcastBatch"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "BroadcastBatch_createdBy_idx" ON "BroadcastBatch"("createdBy");

-- CreateIndex
CREATE INDEX "BroadcastItem_batchId_status_idx" ON "BroadcastItem"("batchId", "status");

-- CreateIndex
CREATE INDEX "BroadcastItem_leadId_idx" ON "BroadcastItem"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastItem_batchId_leadId_key" ON "BroadcastItem"("batchId", "leadId");

-- AddForeignKey
ALTER TABLE "BroadcastBatch" ADD CONSTRAINT "BroadcastBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastBatch" ADD CONSTRAINT "BroadcastBatch_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastItem" ADD CONSTRAINT "BroadcastItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BroadcastBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastItem" ADD CONSTRAINT "BroadcastItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

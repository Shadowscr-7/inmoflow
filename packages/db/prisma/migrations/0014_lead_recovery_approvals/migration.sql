-- CreateEnum
CREATE TYPE "LeadApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "LeadApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT,
    "leadgenId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "formName" TEXT,
    "status" "LeadApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "leadId" TEXT,
    "rawData" JSONB NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadApproval_tenantId_leadgenId_key" ON "LeadApproval"("tenantId", "leadgenId");

-- CreateIndex
CREATE INDEX "LeadApproval_tenantId_status_idx" ON "LeadApproval"("tenantId", "status");

-- CreateIndex
CREATE INDEX "LeadApproval_tenantId_createdAt_idx" ON "LeadApproval"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadApproval" ADD CONSTRAINT "LeadApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadApproval" ADD CONSTRAINT "LeadApproval_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

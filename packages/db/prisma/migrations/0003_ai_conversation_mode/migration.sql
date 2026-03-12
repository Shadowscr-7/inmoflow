-- AlterTable: Add AI conversation fields to Lead
ALTER TABLE "Lead" ADD COLUMN "aiConversationActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "aiInstruction" TEXT;
ALTER TABLE "Lead" ADD COLUMN "aiRuleId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_tenantId_aiConversationActive_idx" ON "Lead"("tenantId", "aiConversationActive");

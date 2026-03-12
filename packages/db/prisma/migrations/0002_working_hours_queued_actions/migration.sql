-- AlterTable: Add workingHours to Rule
ALTER TABLE "Rule" ADD COLUMN "workingHours" JSONB;

-- CreateTable: QueuedAction
CREATE TABLE "QueuedAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "trigger" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processAt" TIMESTAMP(3),

    CONSTRAINT "QueuedAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueuedAction_tenantId_status_idx" ON "QueuedAction"("tenantId", "status");

-- CreateIndex
CREATE INDEX "QueuedAction_status_processAt_idx" ON "QueuedAction"("status", "processAt");

-- CreateIndex
CREATE INDEX "QueuedAction_assigneeId_status_idx" ON "QueuedAction"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "QueuedAction_ruleId_idx" ON "QueuedAction"("ruleId");

-- AddForeignKey
ALTER TABLE "QueuedAction" ADD CONSTRAINT "QueuedAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueuedAction" ADD CONSTRAINT "QueuedAction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

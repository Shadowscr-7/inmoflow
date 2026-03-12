-- CreateTable: Agent weekly availability slots
CREATE TABLE "AgentAvailability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AgentAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentAvailability_tenantId_userId_idx" ON "AgentAvailability"("tenantId", "userId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "AgentAvailability_userId_dayOfWeek_key" ON "AgentAvailability"("userId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "AgentAvailability" ADD CONSTRAINT "AgentAvailability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAvailability" ADD CONSTRAINT "AgentAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add Google Calendar fields to User
ALTER TABLE "User" ADD COLUMN "googleCalendarRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "googleCalendarEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add Google Calendar sync + AI fields to Visit
ALTER TABLE "Visit" ADD COLUMN "googleEventId" TEXT;
ALTER TABLE "Visit" ADD COLUMN "reminderSent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Visit" ADD COLUMN "createdByAi" BOOLEAN NOT NULL DEFAULT false;

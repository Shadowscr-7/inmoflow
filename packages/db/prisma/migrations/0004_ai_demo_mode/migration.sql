-- AlterTable: Add AI demo mode and goal fields to Lead
ALTER TABLE "Lead" ADD COLUMN "aiDemoMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "aiDemoPhone" TEXT;
ALTER TABLE "Lead" ADD COLUMN "aiGoal" TEXT;

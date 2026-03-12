-- AlterTable: Add calendarToken to User for ICS feed
ALTER TABLE "User" ADD COLUMN "calendarToken" TEXT;

-- CreateIndex: unique on calendarToken
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");

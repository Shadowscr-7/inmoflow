-- AlterTable
ALTER TABLE "Property" ADD COLUMN "assignedUserId" TEXT,
ADD COLUMN "meliSellerId" TEXT;

-- CreateIndex
CREATE INDEX "Property_tenantId_assignedUserId_idx" ON "Property"("tenantId", "assignedUserId");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

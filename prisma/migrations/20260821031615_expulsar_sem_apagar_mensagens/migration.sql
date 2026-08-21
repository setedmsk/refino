-- AlterTable
ALTER TABLE "User" ADD COLUMN     "removedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_removedAt_idx" ON "User"("removedAt");

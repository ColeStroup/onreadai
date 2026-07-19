-- AlterTable
ALTER TABLE "ImplementationDraft" ADD COLUMN     "sourceKey" TEXT;

-- CreateIndex
CREATE INDEX "ImplementationDraft_businessId_sourceKey_idx" ON "ImplementationDraft"("businessId", "sourceKey");

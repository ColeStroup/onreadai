-- CreateEnum
CREATE TYPE "ImplementationDraftStatus" AS ENUM ('DRAFT', 'SAVED', 'APPLIED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "onboardingDismissedAt" TIMESTAMP(3),
ADD COLUMN     "onboardingLastStep" TEXT;

-- CreateTable
CREATE TABLE "ImplementationDraft" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "auditId" TEXT,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "status" "ImplementationDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImplementationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImplementationDraft_businessId_idx" ON "ImplementationDraft"("businessId");

-- CreateIndex
CREATE INDEX "ImplementationDraft_recommendationId_idx" ON "ImplementationDraft"("recommendationId");

-- CreateIndex
CREATE INDEX "ImplementationDraft_auditId_idx" ON "ImplementationDraft"("auditId");

-- CreateIndex
CREATE INDEX "ImplementationDraft_userId_createdAt_idx" ON "ImplementationDraft"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImplementationDraft_status_idx" ON "ImplementationDraft"("status");

-- AddForeignKey
ALTER TABLE "ImplementationDraft" ADD CONSTRAINT "ImplementationDraft_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationDraft" ADD CONSTRAINT "ImplementationDraft_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationDraft" ADD CONSTRAINT "ImplementationDraft_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImplementationDraft" ADD CONSTRAINT "ImplementationDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

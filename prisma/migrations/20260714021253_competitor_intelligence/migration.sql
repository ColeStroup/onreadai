-- CreateEnum
CREATE TYPE "CompetitorSnapshotStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "sourceReferenceId" TEXT,
ADD COLUMN     "sourceType" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateTable
CREATE TABLE "CompetitorSnapshot" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "auditId" TEXT,
    "status" "CompetitorSnapshotStatus" NOT NULL DEFAULT 'PENDING',
    "websiteUrl" TEXT,
    "websiteScore" INTEGER,
    "seoScore" INTEGER,
    "socialCoverageScore" INTEGER,
    "reviewsScore" INTEGER,
    "positioningScore" INTEGER,
    "websiteSnapshot" JSONB,
    "seoSnapshot" JSONB,
    "socialSnapshot" JSONB,
    "reviewsSnapshot" JSONB,
    "positioningSnapshot" JSONB,
    "analysisSummary" JSONB,
    "completedSections" JSONB,
    "failedSections" JSONB,
    "errorMessage" TEXT,
    "source" TEXT,
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitorSnapshot_competitorId_createdAt_idx" ON "CompetitorSnapshot"("competitorId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitorSnapshot_auditId_idx" ON "CompetitorSnapshot"("auditId");

-- CreateIndex
CREATE INDEX "CompetitorSnapshot_status_idx" ON "CompetitorSnapshot"("status");

-- AddForeignKey
ALTER TABLE "CompetitorSnapshot" ADD CONSTRAINT "CompetitorSnapshot_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorSnapshot" ADD CONSTRAINT "CompetitorSnapshot_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

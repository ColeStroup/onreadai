-- CreateEnum
CREATE TYPE "BusinessProfileSource" AS ENUM ('SUBMITTED', 'DISCOVERED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ProfileReviewDecision" AS ENUM ('SKIPPED', 'NOT_USED');

-- AlterTable
ALTER TABLE "Business"
ADD COLUMN "auditSourceAcknowledgementHash" TEXT,
ADD COLUMN "auditSourceAcknowledgedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BusinessProfile"
ADD COLUMN "normalizedUrl" TEXT,
ADD COLUMN "source" "BusinessProfileSource" NOT NULL DEFAULT 'DISCOVERED',
ADD COLUMN "manuallyAddedAt" TIMESTAMP(3),
ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Audit"
ADD COLUMN "progressStage" TEXT;

-- CreateTable
CREATE TABLE "BusinessProfileDecision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "platform" "ProfilePlatform" NOT NULL,
    "decision" "ProfileReviewDecision" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProfileDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_businessId_normalizedUrl_key"
ON "BusinessProfile"("businessId", "normalizedUrl");

-- CreateIndex
CREATE INDEX "BusinessProfile_businessId_source_idx"
ON "BusinessProfile"("businessId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfileDecision_businessId_platform_key"
ON "BusinessProfileDecision"("businessId", "platform");

-- CreateIndex
CREATE INDEX "BusinessProfileDecision_businessId_idx"
ON "BusinessProfileDecision"("businessId");

-- CreateIndex
CREATE INDEX "BusinessProfileDecision_platform_decision_idx"
ON "BusinessProfileDecision"("platform", "decision");

-- AddForeignKey
ALTER TABLE "BusinessProfileDecision"
ADD CONSTRAINT "BusinessProfileDecision_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

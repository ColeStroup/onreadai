-- CreateTable
CREATE TABLE "CompetitorProfile" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "platform" "ProfilePlatform" NOT NULL,
    "label" TEXT NOT NULL,
    "urlOrHandle" TEXT,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "status" "BusinessProfileStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitorProfile_competitorId_idx" ON "CompetitorProfile"("competitorId");

-- CreateIndex
CREATE INDEX "CompetitorProfile_platform_idx" ON "CompetitorProfile"("platform");

-- CreateIndex
CREATE INDEX "CompetitorProfile_status_idx" ON "CompetitorProfile"("status");

-- AddForeignKey
ALTER TABLE "CompetitorProfile" ADD CONSTRAINT "CompetitorProfile_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

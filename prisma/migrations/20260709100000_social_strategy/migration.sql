CREATE TABLE "SocialStrategy" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "platformRecommendations" JSONB,
    "contentPillars" JSONB,
    "weeklyPlan" JSONB,
    "suggestedPosts" JSONB,
    "conversionTips" JSONB,
    "competitorOpportunities" JSONB,
    "confidence" INTEGER,
    "source" TEXT,
    "reasoningSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialStrategy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocialStrategy_businessId_idx" ON "SocialStrategy"("businessId");
CREATE INDEX "SocialStrategy_createdAt_idx" ON "SocialStrategy"("createdAt");

ALTER TABLE "SocialStrategy" ADD CONSTRAINT "SocialStrategy_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

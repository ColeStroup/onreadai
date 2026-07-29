-- CreateEnum
CREATE TYPE "AiOperationType" AS ENUM (
  'PAGE_ANALYSIS',
  'AUDIT_SYNTHESIS',
  'CONSULTANT_MESSAGE',
  'COMPLEX_CONSULTANT_MESSAGE',
  'IMPLEMENTATION_DRAFT',
  'COMPETITOR_ANALYSIS',
  'SOCIAL_ANALYSIS'
);

-- CreateEnum
CREATE TYPE "AiUsageStatus" AS ENUM (
  'SUCCEEDED',
  'FAILED',
  'VALIDATION_REJECTED',
  'CACHE_HIT'
);

-- CreateTable
CREATE TABLE "PageAnalysisCache" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "normalizedUrl" TEXT NOT NULL,
  "canonicalUrl" TEXT,
  "contentHash" TEXT NOT NULL,
  "metadataHash" TEXT NOT NULL,
  "businessContextHash" TEXT NOT NULL,
  "goalContextHash" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "modelRoute" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "analysis" JSONB NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostMicros" INTEGER,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "providerRequestId" TEXT,
  "contentTruncated" BOOLEAN NOT NULL DEFAULT false,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PageAnalysisCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditAiUsage" (
  "id" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "pageAnalysisCacheId" TEXT,
  "operationType" "AiOperationType" NOT NULL,
  "pageUrl" TEXT,
  "provider" TEXT NOT NULL,
  "modelRoute" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostMicros" INTEGER,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "status" "AiUsageStatus" NOT NULL,
  "cacheHit" BOOLEAN NOT NULL DEFAULT false,
  "promptVersion" TEXT NOT NULL,
  "providerRequestId" TEXT,
  "failureCode" TEXT,
  "planType" "PlanType",
  "auditProduct" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditAiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PageAnalysisCache_cacheKey_key"
ON "PageAnalysisCache"("cacheKey");

-- CreateIndex
CREATE INDEX "PageAnalysisCache_businessId_idx"
ON "PageAnalysisCache"("businessId");

-- CreateIndex
CREATE INDEX "PageAnalysisCache_businessId_normalizedUrl_idx"
ON "PageAnalysisCache"("businessId", "normalizedUrl");

-- CreateIndex
CREATE INDEX "PageAnalysisCache_businessId_normalizedUrl_contentHash_idx"
ON "PageAnalysisCache"("businessId", "normalizedUrl", "contentHash");

-- CreateIndex
CREATE INDEX "PageAnalysisCache_businessId_promptVersion_schemaVersion_idx"
ON "PageAnalysisCache"("businessId", "promptVersion", "schemaVersion");

-- CreateIndex
CREATE INDEX "PageAnalysisCache_generatedAt_idx"
ON "PageAnalysisCache"("generatedAt");

-- CreateIndex
CREATE INDEX "AuditAiUsage_auditId_idx"
ON "AuditAiUsage"("auditId");

-- CreateIndex
CREATE INDEX "AuditAiUsage_businessId_idx"
ON "AuditAiUsage"("businessId");

-- CreateIndex
CREATE INDEX "AuditAiUsage_businessId_operationType_createdAt_idx"
ON "AuditAiUsage"("businessId", "operationType", "createdAt");

-- CreateIndex
CREATE INDEX "AuditAiUsage_operationType_createdAt_idx"
ON "AuditAiUsage"("operationType", "createdAt");

-- CreateIndex
CREATE INDEX "AuditAiUsage_pageAnalysisCacheId_idx"
ON "AuditAiUsage"("pageAnalysisCacheId");

-- CreateIndex
CREATE INDEX "AuditAiUsage_status_createdAt_idx"
ON "AuditAiUsage"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PageAnalysisCache"
ADD CONSTRAINT "PageAnalysisCache_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditAiUsage"
ADD CONSTRAINT "AuditAiUsage_auditId_fkey"
FOREIGN KEY ("auditId") REFERENCES "Audit"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditAiUsage"
ADD CONSTRAINT "AuditAiUsage_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditAiUsage"
ADD CONSTRAINT "AuditAiUsage_pageAnalysisCacheId_fkey"
FOREIGN KEY ("pageAnalysisCacheId") REFERENCES "PageAnalysisCache"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

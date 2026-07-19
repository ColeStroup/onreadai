-- Add a shared event ledger for rate limits across serverless instances.
CREATE TABLE "RateLimitEvent" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitEvent_scope_keyHash_createdAt_idx"
ON "RateLimitEvent"("scope", "keyHash", "createdAt");

CREATE INDEX "RateLimitEvent_createdAt_idx"
ON "RateLimitEvent"("createdAt");

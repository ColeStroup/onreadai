CREATE TYPE "PlanType" AS ENUM ('FREE', 'ONE_TIME_AUDIT', 'STARTER', 'PRO', 'AGENCY');

CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'FREE');

CREATE TYPE "OneTimePurchaseStatus" AS ENUM ('AVAILABLE', 'USED', 'REFUNDED', 'EXPIRED');

CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "PlanType" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'FREE',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OneTimeAuditPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "auditId" TEXT,
    "status" "OneTimePurchaseStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "OneTimeAuditPurchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSubscription_userId_idx" ON "UserSubscription"("userId");
CREATE INDEX "UserSubscription_plan_idx" ON "UserSubscription"("plan");
CREATE INDEX "UserSubscription_status_idx" ON "UserSubscription"("status");

CREATE INDEX "OneTimeAuditPurchase_userId_idx" ON "OneTimeAuditPurchase"("userId");
CREATE INDEX "OneTimeAuditPurchase_businessId_idx" ON "OneTimeAuditPurchase"("businessId");
CREATE INDEX "OneTimeAuditPurchase_auditId_idx" ON "OneTimeAuditPurchase"("auditId");
CREATE INDEX "OneTimeAuditPurchase_status_idx" ON "OneTimeAuditPurchase"("status");

ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OneTimeAuditPurchase" ADD CONSTRAINT "OneTimeAuditPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

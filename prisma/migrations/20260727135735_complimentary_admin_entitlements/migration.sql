-- CreateEnum
CREATE TYPE "ComplimentaryEntitlementSource" AS ENUM ('FOUNDER', 'INTERNAL', 'BETA', 'PROMOTION', 'CUSTOMER_SUPPORT', 'MANUAL_ADMIN');

-- CreateTable
CREATE TABLE "ComplimentaryEntitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "PlanType" NOT NULL,
    "source" "ComplimentaryEntitlementSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "internalNotes" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "grantedByUserId" TEXT NOT NULL,
    "revokedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplimentaryEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplimentaryEntitlement_userId_idx" ON "ComplimentaryEntitlement"("userId");

-- CreateIndex
CREATE INDEX "ComplimentaryEntitlement_plan_idx" ON "ComplimentaryEntitlement"("plan");

-- CreateIndex
CREATE INDEX "ComplimentaryEntitlement_source_idx" ON "ComplimentaryEntitlement"("source");

-- CreateIndex
CREATE INDEX "ComplimentaryEntitlement_startsAt_idx" ON "ComplimentaryEntitlement"("startsAt");

-- CreateIndex
CREATE INDEX "ComplimentaryEntitlement_expiresAt_idx" ON "ComplimentaryEntitlement"("expiresAt");

-- CreateIndex
CREATE INDEX "ComplimentaryEntitlement_revokedAt_idx" ON "ComplimentaryEntitlement"("revokedAt");

-- CreateIndex
CREATE INDEX "ComplimentaryEntitlement_createdAt_idx" ON "ComplimentaryEntitlement"("createdAt");

-- CreateIndex
CREATE INDEX "ComplimentaryEntitlement_userId_startsAt_expiresAt_revokedA_idx" ON "ComplimentaryEntitlement"("userId", "startsAt", "expiresAt", "revokedAt");

-- AddForeignKey
ALTER TABLE "ComplimentaryEntitlement" ADD CONSTRAINT "ComplimentaryEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplimentaryEntitlement" ADD CONSTRAINT "ComplimentaryEntitlement_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplimentaryEntitlement" ADD CONSTRAINT "ComplimentaryEntitlement_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

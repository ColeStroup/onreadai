-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PartnerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WAITLISTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PENDING_TRAINING', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PartnerTier" AS ENUM ('CERTIFIED', 'GROWTH', 'ELITE');

-- CreateEnum
CREATE TYPE "PartnerPayoutEligibilityStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING_REVIEW', 'ELIGIBLE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PartnerAgreementType" AS ENUM ('PARTNER_TERMS', 'COMMISSION_POLICY', 'PROMOTION_STANDARDS', 'SCANNER_POLICY');

-- CreateEnum
CREATE TYPE "PartnerAttributionStatus" AS ENUM ('LOCKED', 'CONVERTED', 'DISQUALIFIED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "PartnerAttributionSource" AS ENUM ('REFERRAL_LINK', 'REFERRAL_CODE', 'PROSPECT_PREVIEW', 'ADMIN_OVERRIDE');

-- CreateEnum
CREATE TYPE "PartnerPurchaseType" AS ENUM ('FULL_AUDIT', 'STARTER_SUBSCRIPTION', 'PRO_SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "PartnerCommissionStatus" AS ENUM ('PENDING', 'AVAILABLE', 'PARTIALLY_REVERSED', 'REVERSED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartnerCommissionAdjustmentType" AS ENUM ('REFUND', 'PARTIAL_REFUND', 'DISPUTE', 'DISPUTE_REVERSAL', 'MANUAL_CREDIT', 'MANUAL_DEBIT', 'CORRECTION');

-- CreateEnum
CREATE TYPE "PartnerPayoutStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PartnerPayoutMethod" AS ENUM ('PAYPAL', 'WISE', 'ACH_MANUAL', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerProspectStatus" AS ENUM ('NEW', 'SCANNED', 'CONTACTED', 'INTERESTED', 'CONVERTED', 'CLOSED', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "PartnerProspectScanStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "OneTimeAuditPurchase" ADD COLUMN     "partnerId" TEXT,
ADD COLUMN     "partnerReferralAttributionId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "UserSubscription" ADD COLUMN     "partnerId" TEXT,
ADD COLUMN     "partnerReferralAttributionId" TEXT;

-- CreateTable
CREATE TABLE "PartnerApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "activeApplicationKey" TEXT,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "stateOrRegion" TEXT,
    "websiteUrl" TEXT,
    "socialProfiles" JSONB,
    "experienceSummary" TEXT NOT NULL,
    "intendedPromotionMethods" JSONB,
    "audienceOrOutreachSummary" TEXT NOT NULL,
    "applicationMessage" TEXT NOT NULL,
    "ageConfirmation" BOOLEAN NOT NULL,
    "standardsAgreement" BOOLEAN NOT NULL,
    "earningsDisclaimerAccepted" BOOLEAN NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewNotes" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING_TRAINING',
    "tier" "PartnerTier" NOT NULL DEFAULT 'CERTIFIED',
    "referralCode" TEXT NOT NULL,
    "normalizedReferralCode" TEXT NOT NULL,
    "commissionRateBps" INTEGER NOT NULL,
    "recurringCommissionMonths" INTEGER NOT NULL,
    "referralWindowDays" INTEGER NOT NULL,
    "commissionHoldDays" INTEGER NOT NULL,
    "minimumPayoutCents" INTEGER NOT NULL,
    "allowedCountry" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "trainingCompletedAt" TIMESTAMP(3),
    "certificationIssuedAt" TIMESTAMP(3),
    "currentTermsVersion" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "termsReacceptRequiredAt" TIMESTAMP(3),
    "scannerDailyLimit" INTEGER NOT NULL,
    "scannerMonthlyLimit" INTEGER NOT NULL,
    "scannerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "referralEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutEligibilityStatus" "PartnerPayoutEligibilityStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "payoutMethod" "PartnerPayoutMethod",
    "payoutContactEmail" TEXT,
    "payoutAccountDisplayName" TEXT,
    "payoutInstructions" TEXT,
    "complianceReviewStatus" TEXT NOT NULL DEFAULT 'CLEAR',
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerProgramSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "applicationsOpen" BOOLEAN NOT NULL DEFAULT false,
    "referralAttributionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "commissionCreationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scannerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "previewPagesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "manualPayoutWorkflowEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultCommissionRateBps" INTEGER NOT NULL DEFAULT 2000,
    "defaultRecurringCommissionMonths" INTEGER NOT NULL DEFAULT 12,
    "defaultReferralWindowDays" INTEGER NOT NULL DEFAULT 30,
    "defaultCommissionHoldDays" INTEGER NOT NULL DEFAULT 30,
    "defaultMinimumPayoutCents" INTEGER NOT NULL DEFAULT 5000,
    "defaultScannerDailyLimit" INTEGER NOT NULL DEFAULT 25,
    "defaultScannerMonthlyLimit" INTEGER NOT NULL DEFAULT 500,
    "scanCacheDays" INTEGER NOT NULL DEFAULT 30,
    "approvedCountries" JSONB NOT NULL,
    "currentTermsVersion" TEXT NOT NULL DEFAULT '1.0',
    "currentTrainingVersion" TEXT NOT NULL DEFAULT '1.0',
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProgramSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerTrainingModule" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerTrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerTrainingProgress" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "versionCompleted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerTrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerTrainingAssessment" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "trainingVersion" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerTrainingAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerAgreementAcceptance" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "agreementType" "PartnerAgreementType" NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgentSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerAgreementAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerReferralVisit" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "anonymousVisitorId" TEXT NOT NULL,
    "landingPath" TEXT NOT NULL,
    "referrerHost" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerReferralVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerReferralAttribution" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "status" "PartnerAttributionStatus" NOT NULL DEFAULT 'LOCKED',
    "source" "PartnerAttributionSource" NOT NULL,
    "firstVisitAt" TIMESTAMP(3) NOT NULL,
    "signupAt" TIMESTAMP(3) NOT NULL,
    "convertedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "landingPath" TEXT NOT NULL,
    "prospectId" TEXT,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disqualifiedAt" TIMESTAMP(3),
    "disqualificationReason" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "overriddenByUserId" TEXT,
    "overrideReason" TEXT,
    "firstSubscriptionPaidAt" TIMESTAMP(3),
    "paidSubscriptionMonths" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerReferralAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCheckoutIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerCheckoutIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCommission" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "purchaseType" "PartnerPurchaseType" NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeInvoiceId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "commissionableAmountCents" INTEGER NOT NULL,
    "commissionRateBps" INTEGER NOT NULL,
    "originalCommissionAmountCents" INTEGER NOT NULL,
    "reversedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "netCommissionAmountCents" INTEGER NOT NULL,
    "status" "PartnerCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "recurringPaymentNumber" INTEGER,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "disputeOpen" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCommissionAdjustment" (
    "id" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "PartnerCommissionAdjustmentType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sourceAmountCents" INTEGER,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerCommissionAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPayout" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "status" "PartnerPayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "grossCommissionCents" INTEGER NOT NULL,
    "adjustmentCents" INTEGER NOT NULL DEFAULT 0,
    "netPayoutCents" INTEGER NOT NULL,
    "paymentMethod" "PartnerPayoutMethod",
    "externalReference" TEXT,
    "adminNotes" TEXT,
    "thresholdOverrideReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPayoutItem" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerPayoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPayoutAdjustmentItem" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "adjustmentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerPayoutAdjustmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerProspect" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "businessName" TEXT,
    "websiteUrl" TEXT NOT NULL,
    "normalizedDomain" TEXT NOT NULL,
    "status" "PartnerProspectStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "contactName" TEXT,
    "contactMethod" TEXT,
    "latestScanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerProspectScan" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "normalizedDomain" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "scannerVersion" TEXT NOT NULL,
    "status" "PartnerProspectScanStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "pagesAttempted" INTEGER NOT NULL DEFAULT 0,
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "findings" JSONB,
    "outreachSummary" TEXT,
    "technicalMetadata" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProspectScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerProspectPreview" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProspectPreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerScannerUsage" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "usageDate" DATE NOT NULL,
    "usageMonth" TEXT NOT NULL,
    "scanRequests" INTEGER NOT NULL DEFAULT 0,
    "freshScans" INTEGER NOT NULL DEFAULT 0,
    "cachedScans" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "totalDurationMs" INTEGER NOT NULL DEFAULT 0,
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerScannerUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerAdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "partnerId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerAdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerApplication_activeApplicationKey_key" ON "PartnerApplication"("activeApplicationKey");

-- CreateIndex
CREATE INDEX "PartnerApplication_userId_createdAt_idx" ON "PartnerApplication"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerApplication_status_submittedAt_idx" ON "PartnerApplication"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "PartnerApplication_country_idx" ON "PartnerApplication"("country");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_userId_key" ON "PartnerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_applicationId_key" ON "PartnerProfile"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_referralCode_key" ON "PartnerProfile"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_normalizedReferralCode_key" ON "PartnerProfile"("normalizedReferralCode");

-- CreateIndex
CREATE INDEX "PartnerProfile_status_createdAt_idx" ON "PartnerProfile"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerProfile_tier_idx" ON "PartnerProfile"("tier");

-- CreateIndex
CREATE INDEX "PartnerProfile_payoutEligibilityStatus_idx" ON "PartnerProfile"("payoutEligibilityStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProgramSettings_key_key" ON "PartnerProgramSettings"("key");

-- CreateIndex
CREATE INDEX "PartnerTrainingModule_version_isPublished_sortOrder_idx" ON "PartnerTrainingModule"("version", "isPublished", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerTrainingModule_slug_version_key" ON "PartnerTrainingModule"("slug", "version");

-- CreateIndex
CREATE INDEX "PartnerTrainingProgress_partnerId_completedAt_idx" ON "PartnerTrainingProgress"("partnerId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerTrainingProgress_partnerId_moduleId_versionCompleted_key" ON "PartnerTrainingProgress"("partnerId", "moduleId", "versionCompleted");

-- CreateIndex
CREATE INDEX "PartnerTrainingAssessment_partnerId_passed_idx" ON "PartnerTrainingAssessment"("partnerId", "passed");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerTrainingAssessment_partnerId_trainingVersion_key" ON "PartnerTrainingAssessment"("partnerId", "trainingVersion");

-- CreateIndex
CREATE INDEX "PartnerAgreementAcceptance_partnerId_acceptedAt_idx" ON "PartnerAgreementAcceptance"("partnerId", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerAgreementAcceptance_partnerId_agreementType_version_key" ON "PartnerAgreementAcceptance"("partnerId", "agreementType", "version");

-- CreateIndex
CREATE INDEX "PartnerReferralVisit_partnerId_createdAt_idx" ON "PartnerReferralVisit"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerReferralVisit_anonymousVisitorId_idx" ON "PartnerReferralVisit"("anonymousVisitorId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerReferralVisit_partnerId_anonymousVisitorId_key" ON "PartnerReferralVisit"("partnerId", "anonymousVisitorId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerReferralAttribution_referredUserId_key" ON "PartnerReferralAttribution"("referredUserId");

-- CreateIndex
CREATE INDEX "PartnerReferralAttribution_partnerId_status_idx" ON "PartnerReferralAttribution"("partnerId", "status");

-- CreateIndex
CREATE INDEX "PartnerReferralAttribution_referredUserId_status_idx" ON "PartnerReferralAttribution"("referredUserId", "status");

-- CreateIndex
CREATE INDEX "PartnerReferralAttribution_expiresAt_idx" ON "PartnerReferralAttribution"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCheckoutIntent_stripeCheckoutSessionId_key" ON "PartnerCheckoutIntent"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "PartnerCheckoutIntent_userId_createdAt_idx" ON "PartnerCheckoutIntent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerCheckoutIntent_attributionId_idx" ON "PartnerCheckoutIntent"("attributionId");

-- CreateIndex
CREATE INDEX "PartnerCheckoutIntent_status_idx" ON "PartnerCheckoutIntent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCommission_stripePaymentIntentId_key" ON "PartnerCommission"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCommission_stripeInvoiceId_key" ON "PartnerCommission"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCommission_sourceKey_key" ON "PartnerCommission"("sourceKey");

-- CreateIndex
CREATE INDEX "PartnerCommission_partnerId_status_availableAt_idx" ON "PartnerCommission"("partnerId", "status", "availableAt");

-- CreateIndex
CREATE INDEX "PartnerCommission_referredUserId_createdAt_idx" ON "PartnerCommission"("referredUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerCommission_stripeCheckoutSessionId_idx" ON "PartnerCommission"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "PartnerCommission_stripeSubscriptionId_idx" ON "PartnerCommission"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "PartnerCommission_stripeChargeId_idx" ON "PartnerCommission"("stripeChargeId");

-- CreateIndex
CREATE INDEX "PartnerCommission_sourceEventId_idx" ON "PartnerCommission"("sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCommissionAdjustment_sourceKey_key" ON "PartnerCommissionAdjustment"("sourceKey");

-- CreateIndex
CREATE INDEX "PartnerCommissionAdjustment_commissionId_createdAt_idx" ON "PartnerCommissionAdjustment"("commissionId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerCommissionAdjustment_partnerId_createdAt_idx" ON "PartnerCommissionAdjustment"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerCommissionAdjustment_sourceEventId_idx" ON "PartnerCommissionAdjustment"("sourceEventId");

-- CreateIndex
CREATE INDEX "PartnerPayout_partnerId_status_createdAt_idx" ON "PartnerPayout"("partnerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerPayout_status_currency_createdAt_idx" ON "PartnerPayout"("status", "currency", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerPayoutItem_commissionId_key" ON "PartnerPayoutItem"("commissionId");

-- CreateIndex
CREATE INDEX "PartnerPayoutItem_payoutId_idx" ON "PartnerPayoutItem"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerPayoutAdjustmentItem_adjustmentId_key" ON "PartnerPayoutAdjustmentItem"("adjustmentId");

-- CreateIndex
CREATE INDEX "PartnerPayoutAdjustmentItem_payoutId_idx" ON "PartnerPayoutAdjustmentItem"("payoutId");

-- CreateIndex
CREATE INDEX "PartnerProspect_partnerId_status_updatedAt_idx" ON "PartnerProspect"("partnerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "PartnerProspect_normalizedDomain_idx" ON "PartnerProspect"("normalizedDomain");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProspect_partnerId_normalizedDomain_key" ON "PartnerProspect"("partnerId", "normalizedDomain");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProspectScan_cacheKey_key" ON "PartnerProspectScan"("cacheKey");

-- CreateIndex
CREATE INDEX "PartnerProspectScan_normalizedDomain_expiresAt_idx" ON "PartnerProspectScan"("normalizedDomain", "expiresAt");

-- CreateIndex
CREATE INDEX "PartnerProspectScan_status_expiresAt_idx" ON "PartnerProspectScan"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProspectPreview_tokenHash_key" ON "PartnerProspectPreview"("tokenHash");

-- CreateIndex
CREATE INDEX "PartnerProspectPreview_partnerId_createdAt_idx" ON "PartnerProspectPreview"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerProspectPreview_prospectId_idx" ON "PartnerProspectPreview"("prospectId");

-- CreateIndex
CREATE INDEX "PartnerProspectPreview_expiresAt_revokedAt_idx" ON "PartnerProspectPreview"("expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "PartnerScannerUsage_partnerId_usageMonth_idx" ON "PartnerScannerUsage"("partnerId", "usageMonth");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerScannerUsage_partnerId_usageDate_key" ON "PartnerScannerUsage"("partnerId", "usageDate");

-- CreateIndex
CREATE INDEX "PartnerAdminAuditLog_adminUserId_createdAt_idx" ON "PartnerAdminAuditLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerAdminAuditLog_partnerId_createdAt_idx" ON "PartnerAdminAuditLog"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerAdminAuditLog_entityType_entityId_idx" ON "PartnerAdminAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "PartnerNotification_userId_readAt_createdAt_idx" ON "PartnerNotification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerNotification_partnerId_createdAt_idx" ON "PartnerNotification"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "OneTimeAuditPurchase_partnerId_idx" ON "OneTimeAuditPurchase"("partnerId");

-- CreateIndex
CREATE INDEX "OneTimeAuditPurchase_partnerReferralAttributionId_idx" ON "OneTimeAuditPurchase"("partnerReferralAttributionId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "UserSubscription_partnerId_idx" ON "UserSubscription"("partnerId");

-- CreateIndex
CREATE INDEX "UserSubscription_partnerReferralAttributionId_idx" ON "UserSubscription"("partnerReferralAttributionId");

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_partnerReferralAttributionId_fkey" FOREIGN KEY ("partnerReferralAttributionId") REFERENCES "PartnerReferralAttribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimeAuditPurchase" ADD CONSTRAINT "OneTimeAuditPurchase_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimeAuditPurchase" ADD CONSTRAINT "OneTimeAuditPurchase_partnerReferralAttributionId_fkey" FOREIGN KEY ("partnerReferralAttributionId") REFERENCES "PartnerReferralAttribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplication" ADD CONSTRAINT "PartnerApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "PartnerApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTrainingProgress" ADD CONSTRAINT "PartnerTrainingProgress_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTrainingProgress" ADD CONSTRAINT "PartnerTrainingProgress_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PartnerTrainingModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTrainingAssessment" ADD CONSTRAINT "PartnerTrainingAssessment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAgreementAcceptance" ADD CONSTRAINT "PartnerAgreementAcceptance_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerReferralVisit" ADD CONSTRAINT "PartnerReferralVisit_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerReferralAttribution" ADD CONSTRAINT "PartnerReferralAttribution_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerReferralAttribution" ADD CONSTRAINT "PartnerReferralAttribution_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerReferralAttribution" ADD CONSTRAINT "PartnerReferralAttribution_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "PartnerProspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCheckoutIntent" ADD CONSTRAINT "PartnerCheckoutIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCheckoutIntent" ADD CONSTRAINT "PartnerCheckoutIntent_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCheckoutIntent" ADD CONSTRAINT "PartnerCheckoutIntent_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "PartnerReferralAttribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "PartnerReferralAttribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommissionAdjustment" ADD CONSTRAINT "PartnerCommissionAdjustment_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "PartnerCommission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommissionAdjustment" ADD CONSTRAINT "PartnerCommissionAdjustment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayout" ADD CONSTRAINT "PartnerPayout_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayoutItem" ADD CONSTRAINT "PartnerPayoutItem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "PartnerPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayoutItem" ADD CONSTRAINT "PartnerPayoutItem_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "PartnerCommission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayoutAdjustmentItem" ADD CONSTRAINT "PartnerPayoutAdjustmentItem_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "PartnerPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPayoutAdjustmentItem" ADD CONSTRAINT "PartnerPayoutAdjustmentItem_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "PartnerCommissionAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProspect" ADD CONSTRAINT "PartnerProspect_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProspect" ADD CONSTRAINT "PartnerProspect_latestScanId_fkey" FOREIGN KEY ("latestScanId") REFERENCES "PartnerProspectScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProspectPreview" ADD CONSTRAINT "PartnerProspectPreview_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProspectPreview" ADD CONSTRAINT "PartnerProspectPreview_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "PartnerProspect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerProspectPreview" ADD CONSTRAINT "PartnerProspectPreview_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "PartnerProspectScan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerScannerUsage" ADD CONSTRAINT "PartnerScannerUsage_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerAdminAuditLog" ADD CONSTRAINT "PartnerAdminAuditLog_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerNotification" ADD CONSTRAINT "PartnerNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerNotification" ADD CONSTRAINT "PartnerNotification_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

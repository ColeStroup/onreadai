import {
  PartnerAgreementType,
  PartnerAttributionSource,
  PartnerAttributionStatus,
  PartnerCommissionAdjustmentType,
  PartnerCommissionStatus,
  PartnerPayoutEligibilityStatus,
  PartnerPayoutMethod,
  PartnerPurchaseType,
  PartnerStatus,
  UserRole,
} from "@prisma/client";

import { requiredPartnerAgreementTypes } from "@/lib/partners/training-content";
import { ensurePartnerTrainingModules } from "@/lib/partners/training";
import { prisma } from "@/lib/prisma";

function assertDevelopmentFixtureTarget() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Partner fixtures are development-only and cannot run in production.");
  }

  if (process.env.ALLOW_DEVELOPMENT_FIXTURES?.trim().toLowerCase() !== "true") {
    throw new Error(
      "Set ALLOW_DEVELOPMENT_FIXTURES=true explicitly before loading development fixtures.",
    );
  }

  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required for development fixtures.");

  const url = new URL(value);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(url.hostname.toLowerCase())) {
    throw new Error("Development fixtures may only target a local PostgreSQL host.");
  }
}

async function main() {
assertDevelopmentFixtureTarget();

const now = new Date();
const month = now.toISOString().slice(0, 7);

await prisma.partnerProgramSettings.upsert({
  where: { key: "default" },
  create: {
    key: "default",
    enabled: true,
    applicationsOpen: true,
    referralAttributionEnabled: true,
    commissionCreationEnabled: true,
    scannerEnabled: true,
    previewPagesEnabled: true,
    manualPayoutWorkflowEnabled: true,
    approvedCountries: ["US"],
  },
  update: {
    enabled: true,
    applicationsOpen: true,
    referralAttributionEnabled: true,
    commissionCreationEnabled: true,
    scannerEnabled: true,
    previewPagesEnabled: true,
    manualPayoutWorkflowEnabled: true,
  },
});

const settings = await prisma.partnerProgramSettings.findUniqueOrThrow({ where: { key: "default" } });
const [admin, pendingUser, trainingUser, activeUser, referredUser] = await Promise.all([
  prisma.user.upsert({ where: { email: "partner-admin@example.test" }, create: { email: "partner-admin@example.test", name: "Partner Admin", role: UserRole.ADMIN }, update: { role: UserRole.ADMIN } }),
  prisma.user.upsert({ where: { email: "pending-partner@example.test" }, create: { email: "pending-partner@example.test", name: "Pending Partner" }, update: {} }),
  prisma.user.upsert({ where: { email: "training-partner@example.test" }, create: { email: "training-partner@example.test", name: "Training Partner" }, update: {} }),
  prisma.user.upsert({ where: { email: "active-partner@example.test" }, create: { email: "active-partner@example.test", name: "Active Partner" }, update: {} }),
  prisma.user.upsert({ where: { email: "referred-customer@example.test" }, create: { email: "referred-customer@example.test", name: "Referred Customer" }, update: {} }),
]);

await prisma.partnerApplication.upsert({
  where: { activeApplicationKey: pendingUser.id },
  create: {
    userId: pendingUser.id,
    activeApplicationKey: pendingUser.id,
    legalName: "Pending Partner LLC",
    displayName: "Pending Partner",
    email: pendingUser.email!,
    country: "US",
    experienceSummary: "Development fixture with enough detail for the administrator application review screen.",
    intendedPromotionMethods: ["Educational content"],
    audienceOrOutreachSummary: "Independent operators and creators who want evidence-based growth recommendations.",
    applicationMessage: "I will use accurate product claims, clear disclosures, and professional outreach practices.",
    ageConfirmation: true,
    standardsAgreement: true,
    earningsDisclaimerAccepted: true,
  },
  update: {},
});

async function fixturePartner(userId: string, code: string, status: PartnerStatus) {
  return prisma.partnerProfile.upsert({
    where: { userId },
    create: {
      userId,
      status,
      referralCode: code,
      normalizedReferralCode: code,
      commissionRateBps: 2_000,
      recurringCommissionMonths: 12,
      referralWindowDays: 30,
      commissionHoldDays: 30,
      minimumPayoutCents: 5_000,
      allowedCountry: "US",
      approvedAt: now,
      activatedAt: status === PartnerStatus.ACTIVE ? now : null,
      trainingCompletedAt: status === PartnerStatus.ACTIVE ? now : null,
      certificationIssuedAt: status === PartnerStatus.ACTIVE ? now : null,
      currentTermsVersion: status === PartnerStatus.ACTIVE ? settings.currentTermsVersion : null,
      termsAcceptedAt: status === PartnerStatus.ACTIVE ? now : null,
      scannerDailyLimit: 25,
      scannerMonthlyLimit: 500,
      scannerEnabled: status === PartnerStatus.ACTIVE,
      referralEnabled: status === PartnerStatus.ACTIVE,
      payoutEligibilityStatus: status === PartnerStatus.ACTIVE ? PartnerPayoutEligibilityStatus.ELIGIBLE : PartnerPayoutEligibilityStatus.NOT_CONFIGURED,
      payoutMethod: status === PartnerStatus.ACTIVE ? PartnerPayoutMethod.PAYPAL : null,
      payoutContactEmail: status === PartnerStatus.ACTIVE ? "active-partner@example.test" : null,
    },
    update: {},
  });
}

await fixturePartner(trainingUser.id, "training-partner", PartnerStatus.PENDING_TRAINING);
const activePartner = await fixturePartner(activeUser.id, "active-partner", PartnerStatus.ACTIVE);
await ensurePartnerTrainingModules();
await prisma.partnerAgreementAcceptance.createMany({
  data: requiredPartnerAgreementTypes.map((agreementType) => ({
    partnerId: activePartner.id,
    agreementType: agreementType as PartnerAgreementType,
    version: settings.currentTermsVersion,
  })),
  skipDuplicates: true,
});

await prisma.partnerReferralVisit.upsert({
  where: { partnerId_anonymousVisitorId: { partnerId: activePartner.id, anonymousVisitorId: "fixture-visitor" } },
  create: { partnerId: activePartner.id, referralCode: activePartner.referralCode, anonymousVisitorId: "fixture-visitor", landingPath: "/pricing", utmSource: "fixture" },
  update: {},
});
const attribution = await prisma.partnerReferralAttribution.upsert({
  where: { referredUserId: referredUser.id },
  create: {
    partnerId: activePartner.id,
    referredUserId: referredUser.id,
    referralCode: activePartner.referralCode,
    status: PartnerAttributionStatus.CONVERTED,
    source: PartnerAttributionSource.REFERRAL_LINK,
    firstVisitAt: new Date(now.getTime() - 86_400_000),
    signupAt: now,
    convertedAt: now,
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    landingPath: "/pricing",
  },
  update: {},
});

async function fixtureCommission(input: {
  key: string;
  paymentIntentId: string;
  status: PartnerCommissionStatus;
  amount: number;
  availableAt: Date;
}) {
  return prisma.partnerCommission.upsert({
    where: { sourceKey: input.key },
    create: {
      partnerId: activePartner.id,
      attributionId: attribution.id,
      referredUserId: referredUser.id,
      purchaseType: PartnerPurchaseType.FULL_AUDIT,
      stripeCustomerId: "cus_fixture_partner",
      stripePaymentIntentId: input.paymentIntentId,
      sourceKey: input.key,
      sourceEventId: `evt_${input.paymentIntentId}`,
      currency: "usd",
      commissionableAmountCents: input.amount * 5,
      commissionRateBps: 2_000,
      originalCommissionAmountCents: input.amount,
      netCommissionAmountCents: input.amount,
      status: input.status,
      availableAt: input.availableAt,
      paidAt: input.status === PartnerCommissionStatus.PAID ? now : null,
    },
    update: {},
  });
}

await fixtureCommission({ key: "fixture:pending", paymentIntentId: "pi_fixture_pending", status: PartnerCommissionStatus.PENDING, amount: 1_000, availableAt: new Date(now.getTime() + 30 * 86_400_000) });
await fixtureCommission({ key: "fixture:available", paymentIntentId: "pi_fixture_available", status: PartnerCommissionStatus.AVAILABLE, amount: 1_500, availableAt: new Date(now.getTime() - 86_400_000) });
const paidCommission = await fixtureCommission({ key: "fixture:paid", paymentIntentId: "pi_fixture_paid", status: PartnerCommissionStatus.PAID, amount: 2_000, availableAt: new Date(now.getTime() - 60 * 86_400_000) });
const refundedCommission = await fixtureCommission({ key: "fixture:refunded", paymentIntentId: "pi_fixture_refunded", status: PartnerCommissionStatus.REVERSED, amount: 500, availableAt: new Date(now.getTime() - 30 * 86_400_000) });
await prisma.partnerCommission.update({
  where: { id: refundedCommission.id },
  data: { status: PartnerCommissionStatus.REVERSED, reversedAmountCents: 500, netCommissionAmountCents: 0 },
});
await prisma.partnerCommissionAdjustment.upsert({
  where: { sourceKey: "fixture:refund-adjustment" },
  create: { commissionId: refundedCommission.id, partnerId: activePartner.id, type: PartnerCommissionAdjustmentType.REFUND, sourceKey: "fixture:refund-adjustment", sourceEventId: "evt_fixture_refund", amountCents: -500, sourceAmountCents: 2_500, reason: "Development refund fixture." },
  update: {},
});

let payout = await prisma.partnerPayout.findFirst({ where: { partnerId: activePartner.id, externalReference: "FIXTURE-PAID-001" } });
if (!payout) {
  payout = await prisma.partnerPayout.create({
    data: {
      partnerId: activePartner.id,
      status: "PAID",
      currency: "usd",
      periodStart: new Date(now.getTime() - 60 * 86_400_000),
      periodEnd: now,
      grossCommissionCents: 2_000,
      netPayoutCents: 2_000,
      paymentMethod: PartnerPayoutMethod.PAYPAL,
      externalReference: "FIXTURE-PAID-001",
      createdByUserId: admin.id,
      approvedByUserId: admin.id,
      approvedAt: now,
      paidAt: now,
      items: { create: { commissionId: paidCommission.id, amountCents: 2_000 } },
    },
  });
}

const scan = await prisma.partnerProspectScan.upsert({
  where: { cacheKey: "example.test:partner-prospect-v1" },
  create: {
    cacheKey: "example.test:partner-prospect-v1",
    normalizedDomain: "example.test",
    websiteUrl: "https://example.test/",
    scannerVersion: "partner-prospect-v1",
    status: "COMPLETED",
    startedAt: now,
    completedAt: now,
    expiresAt: new Date(now.getTime() + 30 * 86_400_000),
    pagesAttempted: 4,
    pagesScanned: 4,
    findings: [{ title: "Fixture finding", category: "Visitor clarity" }],
    outreachSummary: "Development-only scanner fixture.",
  },
  update: {},
});
await prisma.partnerProspect.upsert({
  where: { partnerId_normalizedDomain: { partnerId: activePartner.id, normalizedDomain: "example.test" } },
  create: { partnerId: activePartner.id, businessName: "Example Prospect", websiteUrl: "https://example.test/", normalizedDomain: "example.test", status: "SCANNED", latestScanId: scan.id },
  update: { latestScanId: scan.id },
});
await prisma.partnerScannerUsage.upsert({
  where: { partnerId_usageDate: { partnerId: activePartner.id, usageDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) } },
  create: { partnerId: activePartner.id, usageDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), usageMonth: month, scanRequests: 2, freshScans: 1, cachedScans: 1, pagesScanned: 4 },
  update: {},
});

console.info("Partner Program development fixtures are ready.", {
  adminEmail: admin.email,
  pendingApplicationEmail: pendingUser.email,
  trainingPartnerEmail: trainingUser.email,
  activePartnerEmail: activeUser.email,
  referralCode: activePartner.referralCode,
  paidPayoutId: payout.id,
});
await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});

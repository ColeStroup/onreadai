import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  PartnerAgreementType,
  PartnerAttributionSource,
  PartnerCommissionStatus,
  PartnerPayoutEligibilityStatus,
  PartnerPayoutMethod,
  PartnerPurchaseType,
  PartnerStatus,
  UserRole,
} from "@prisma/client";
import type Stripe from "stripe";

import type { BillingProduct } from "@/lib/billing/catalog";
import { reviewPartnerApplication, submitPartnerApplication } from "@/lib/partners/applications";
import { partnerCanRefer } from "@/lib/partners/partner-access-policy";
import { PartnerProgramError } from "@/lib/partners/errors";
import {
  approveManualPartnerPayout,
  cancelManualPartnerPayout,
  createManualPartnerPayout,
  getPartnerAvailableBalance,
  markManualPartnerPayoutPaid,
} from "@/lib/partners/payouts";
import { lockPartnerReferralAttribution } from "@/lib/partners/referral-attribution";
import { runPartnerProspectScan } from "@/lib/partners/scanner";
import {
  applyPartnerDispute,
  applyPartnerRefund,
  createOneTimePartnerCommission,
  createSubscriptionInvoiceCommission,
} from "@/lib/partners/stripe-commissions";
import {
  partnerTrainingModules,
  requiredPartnerAgreementTypes,
} from "@/lib/partners/training-content";
import { ensurePartnerTrainingModules, evaluatePartnerActivation } from "@/lib/partners/training";
import { prisma } from "@/lib/prisma";

const databaseUrl = process.env.DATABASE_URL ?? "";
const isolatedDatabase = /partner_test/i.test(databaseUrl);

async function resetTestDatabase() {
  if (!isolatedDatabase) return;
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "PartnerProgramSettings", "User" CASCADE');
}

before(resetTestDatabase);
after(async () => {
  await resetTestDatabase();
  await prisma.$disconnect();
});

test(
  "partner approval, certification, attribution, suspension, and payout ledger lifecycle",
  { skip: !isolatedDatabase, timeout: 30_000 },
  async () => {
    const now = new Date();
    await prisma.partnerProgramSettings.create({
      data: {
        key: "default",
        enabled: true,
        applicationsOpen: true,
        referralAttributionEnabled: true,
        commissionCreationEnabled: true,
        scannerEnabled: true,
        previewPagesEnabled: true,
        manualPayoutWorkflowEnabled: true,
        defaultCommissionRateBps: 2_000,
        defaultRecurringCommissionMonths: 12,
        defaultReferralWindowDays: 30,
        defaultCommissionHoldDays: 30,
        defaultMinimumPayoutCents: 500,
        defaultScannerDailyLimit: 5,
        defaultScannerMonthlyLimit: 20,
        scanCacheDays: 30,
        approvedCountries: ["US"],
        currentTermsVersion: "test-1",
        currentTrainingVersion: "test-1",
      },
    });
    const [admin, applicant] = await Promise.all([
      prisma.user.create({ data: { email: "partner-admin@test.invalid", role: UserRole.ADMIN } }),
      prisma.user.create({ data: { email: "applicant@test.invalid" } }),
    ]);
    const applicationInput = {
      legalName: "Test Partner LLC",
      displayName: "Test Growth Partner",
      email: "applicant@test.invalid",
      country: "US",
      stateOrRegion: "Texas",
      websiteUrl: "https://partner.test",
      socialProfiles: [],
      experienceSummary: "I help independent businesses understand practical growth priorities and make evidence-based decisions.",
      intendedPromotionMethods: ["Educational content"],
      audienceOrOutreachSummary: "My audience is made up of consultants, creators, and local business owners seeking practical guidance.",
      applicationMessage: "I will explain the product accurately, disclose the referral relationship, and avoid guaranteed claims.",
      ageConfirmation: true,
      standardsAgreement: true,
      earningsDisclaimerAccepted: true,
    };

    const application = await submitPartnerApplication(applicant.id, applicationInput);
    await assert.rejects(
      submitPartnerApplication(applicant.id, applicationInput),
      (error: unknown) => error instanceof PartnerProgramError && error.code === "ACTIVE_APPLICATION_EXISTS",
    );
    await assert.rejects(
      reviewPartnerApplication({
        adminUserId: applicant.id,
        applicationId: application.id,
        decision: "APPROVE",
        reason: "Unauthorized attempt",
      }),
      (error: unknown) => error instanceof PartnerProgramError && error.code === "FORBIDDEN",
    );

    await reviewPartnerApplication({
      adminUserId: admin.id,
      applicationId: application.id,
      decision: "APPROVE",
      reason: "Application satisfies the test approval criteria.",
    });
    const partner = await prisma.partnerProfile.findUniqueOrThrow({ where: { userId: applicant.id } });
    assert.equal(partner.status, PartnerStatus.PENDING_TRAINING);
    assert.equal(partner.referralEnabled, false);

    await ensurePartnerTrainingModules();
    const modules = await prisma.partnerTrainingModule.findMany({ where: { version: "test-1" } });
    assert.equal(modules.length, partnerTrainingModules.length);
    await prisma.partnerTrainingProgress.createMany({
      data: modules.map((module) => ({
        partnerId: partner.id,
        moduleId: module.id,
        completedAt: now,
        versionCompleted: "test-1",
      })),
    });
    await prisma.partnerTrainingAssessment.create({
      data: { partnerId: partner.id, trainingVersion: "test-1", score: 100, passed: true },
    });
    await prisma.partnerAgreementAcceptance.createMany({
      data: requiredPartnerAgreementTypes.map((agreementType) => ({
        partnerId: partner.id,
        agreementType: agreementType as PartnerAgreementType,
        version: "test-1",
      })),
    });
    const activation = await evaluatePartnerActivation(partner.id);
    assert.equal(activation.activated, true);

    const activePartner = await prisma.partnerProfile.update({
      where: { id: partner.id },
      data: {
        payoutEligibilityStatus: PartnerPayoutEligibilityStatus.ELIGIBLE,
        payoutMethod: PartnerPayoutMethod.PAYPAL,
        payoutContactEmail: "payout@test.invalid",
      },
    });
    assert.equal(activePartner.status, PartnerStatus.ACTIVE);
    assert.equal(activePartner.referralEnabled, true);

    const firstVisitAt = new Date(Date.now() - 1_000);
    const referredUser = await prisma.user.create({ data: { email: "referred@test.invalid" } });
    const referralPayload = {
      version: 1 as const,
      referralCode: activePartner.referralCode,
      anonymousVisitorId: "visitor-integration-one",
      firstVisitAt: firstVisitAt.toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      landingPath: "/pricing",
      source: PartnerAttributionSource.REFERRAL_LINK,
    };
    const locked = await lockPartnerReferralAttribution(referredUser.id, referralPayload);
    assert.equal(locked.attributed, true);
    const duplicate = await lockPartnerReferralAttribution(referredUser.id, referralPayload);
    assert.equal(duplicate.reason, "already_attributed");
    const selfReferral = await lockPartnerReferralAttribution(applicant.id, {
      ...referralPayload,
      anonymousVisitorId: "visitor-self",
    });
    assert.equal(selfReferral.reason, "self_referral");

    const attribution = await prisma.partnerReferralAttribution.findUniqueOrThrow({
      where: { referredUserId: referredUser.id },
    });
    const fullAuditProduct = { key: "full_audit" } as BillingProduct;
    const oneTimeIntent = await prisma.partnerCheckoutIntent.create({
      data: {
        userId: referredUser.id,
        partnerId: activePartner.id,
        attributionId: attribution.id,
        productKey: "full_audit",
      },
    });
    const oneTimeSession = {
      id: "cs_partner_policy",
      customer: "cus_partner_policy",
      currency: "usd",
      amount_subtotal: 10_000,
      total_details: { amount_discount: 1_000, amount_tax: 800 },
      payment_intent: "pi_partner_policy",
      metadata: {
        partnerId: activePartner.id,
        partnerAttributionId: attribution.id,
        partnerCheckoutIntentId: oneTimeIntent.id,
      },
    } as unknown as Stripe.Checkout.Session;
    const policyCommission = await prisma.$transaction((transaction) =>
      createOneTimePartnerCommission(transaction, {
        session: oneTimeSession,
        userId: referredUser.id,
        product: fullAuditProduct,
        eventId: "evt_partner_policy_one",
        paymentAt: now,
      }),
    );
    assert.equal(policyCommission?.commissionableAmountCents, 9_000);
    assert.equal(policyCommission?.originalCommissionAmountCents, 1_800);
    const duplicatePolicyCommission = await prisma.$transaction((transaction) =>
      createOneTimePartnerCommission(transaction, {
        session: oneTimeSession,
        userId: referredUser.id,
        product: fullAuditProduct,
        eventId: "evt_partner_policy_duplicate",
        paymentAt: now,
      }),
    );
    assert.equal(duplicatePolicyCommission?.id, policyCommission?.id);
    assert.equal(
      await prisma.partnerCommission.count({ where: { sourceKey: "full_audit:payment_intent:pi_partner_policy" } }),
      1,
    );
    await prisma.$transaction((transaction) =>
      applyPartnerRefund(transaction, {
        refund: {
          id: "re_partner_policy_partial",
          status: "succeeded",
          amount: 2_250,
          currency: "usd",
          payment_intent: "pi_partner_policy",
          charge: null,
        } as unknown as Stripe.Refund,
        eventId: "evt_partner_policy_refund",
      }),
    );
    const partiallyRefunded = await prisma.partnerCommission.findUniqueOrThrow({ where: { id: policyCommission!.id } });
    assert.equal(partiallyRefunded.reversedAmountCents, 450);
    assert.equal(partiallyRefunded.netCommissionAmountCents, 1_350);

    const starterProduct = { key: "starter_monthly" } as BillingProduct;
    const subscriptionIntent = await prisma.partnerCheckoutIntent.create({
      data: {
        userId: referredUser.id,
        partnerId: activePartner.id,
        attributionId: attribution.id,
        productKey: "starter_monthly",
      },
    });
    const subscriptionMetadata = {
      partnerId: activePartner.id,
      partnerAttributionId: attribution.id,
      partnerCheckoutIntentId: subscriptionIntent.id,
    };
    const subscription = {
      id: "sub_partner_policy",
      metadata: subscriptionMetadata,
    } as unknown as Stripe.Subscription;
    const invoice = {
      id: "in_partner_policy_one",
      status: "paid",
      currency: "usd",
      customer: "cus_partner_policy",
      total_excluding_tax: 2_900,
      amount_paid: 2_900,
      payments: {
        data: [
          {
            status: "paid",
            payment: { payment_intent: "pi_partner_subscription", charge: "ch_partner_subscription" },
          },
        ],
      },
    } as unknown as Stripe.Invoice;
    const subscriptionCommission = await prisma.$transaction((transaction) =>
      createSubscriptionInvoiceCommission(transaction, {
        invoice,
        subscription,
        userId: referredUser.id,
        product: starterProduct,
        eventId: "evt_partner_subscription_one",
        paymentAt: now,
      }),
    );
    assert.equal(subscriptionCommission?.originalCommissionAmountCents, 580);
    assert.equal(subscriptionCommission?.recurringPaymentNumber, 1);
    await prisma.$transaction((transaction) =>
      applyPartnerDispute(transaction, {
        dispute: {
          id: "dp_partner_subscription",
          amount: 2_900,
          currency: "usd",
          payment_intent: "pi_partner_subscription",
          charge: "ch_partner_subscription",
          status: "needs_response",
        } as unknown as Stripe.Dispute,
        eventId: "evt_partner_dispute_open",
        closed: false,
      }),
    );
    await prisma.$transaction((transaction) =>
      applyPartnerDispute(transaction, {
        dispute: {
          id: "dp_partner_subscription",
          amount: 2_900,
          currency: "usd",
          payment_intent: "pi_partner_subscription",
          charge: "ch_partner_subscription",
          status: "won",
        } as unknown as Stripe.Dispute,
        eventId: "evt_partner_dispute_won",
        closed: true,
      }),
    );
    const restoredSubscription = await prisma.partnerCommission.findUniqueOrThrow({ where: { id: subscriptionCommission!.id } });
    assert.equal(restoredSubscription.netCommissionAmountCents, 580);
    assert.equal(restoredSubscription.disputeOpen, false);

    const availableCommission = await prisma.partnerCommission.create({
      data: {
        partnerId: activePartner.id,
        attributionId: attribution.id,
        referredUserId: referredUser.id,
        purchaseType: PartnerPurchaseType.FULL_AUDIT,
        stripeCustomerId: "cus_partner_test",
        stripePaymentIntentId: "pi_partner_available",
        sourceKey: "full_audit:payment_intent:pi_partner_available",
        sourceEventId: "evt_partner_available",
        currency: "usd",
        commissionableAmountCents: 5_000,
        commissionRateBps: 2_000,
        originalCommissionAmountCents: 1_000,
        netCommissionAmountCents: 1_000,
        status: PartnerCommissionStatus.AVAILABLE,
        availableAt: new Date(Date.now() - 86_400_000),
      },
    });

    const payout = await createManualPartnerPayout({
      adminUserId: admin.id,
      partnerId: activePartner.id,
      periodStart: new Date(Date.now() - 30 * 86_400_000),
      periodEnd: new Date(),
    });
    assert.equal(payout.netPayoutCents, 1_000);
    await assert.rejects(
      createManualPartnerPayout({
        adminUserId: admin.id,
        partnerId: activePartner.id,
        periodStart: new Date(Date.now() - 30 * 86_400_000),
        periodEnd: new Date(),
      }),
      (error: unknown) => error instanceof PartnerProgramError && error.code === "NO_AVAILABLE_BALANCE",
    );
    await approveManualPartnerPayout({
      adminUserId: admin.id,
      payoutId: payout.id,
      reason: "Ledger reviewed for test payout.",
    });
    await markManualPartnerPayoutPaid({
      adminUserId: admin.id,
      payoutId: payout.id,
      paymentMethod: PartnerPayoutMethod.PAYPAL,
      externalReference: "TEST-PAYOUT-001",
      reason: "External test payment recorded.",
    });
    await assert.rejects(
      cancelManualPartnerPayout({ adminUserId: admin.id, payoutId: payout.id, reason: "Should fail" }),
      (error: unknown) => error instanceof PartnerProgramError && error.code === "PAYOUT_CANCEL_NOT_ALLOWED",
    );

    await prisma.$transaction((transaction) =>
      applyPartnerRefund(transaction, {
        refund: {
          id: "re_partner_after_payout",
          status: "succeeded",
          amount: 1_250,
          currency: "usd",
          payment_intent: "pi_partner_available",
          charge: null,
        } as unknown as Stripe.Refund,
        eventId: "evt_partner_after_payout",
      }),
    );
    const paidAfterRefund = await prisma.partnerCommission.findUniqueOrThrow({ where: { id: availableCommission.id } });
    assert.equal(paidAfterRefund.status, PartnerCommissionStatus.PAID);
    assert.equal(paidAfterRefund.netCommissionAmountCents, 750);
    await prisma.partnerCommission.create({
      data: {
        partnerId: activePartner.id,
        attributionId: attribution.id,
        referredUserId: referredUser.id,
        purchaseType: PartnerPurchaseType.FULL_AUDIT,
        stripeCustomerId: "cus_partner_test",
        stripePaymentIntentId: "pi_partner_future",
        sourceKey: "full_audit:payment_intent:pi_partner_future",
        sourceEventId: "evt_partner_future",
        currency: "usd",
        commissionableAmountCents: 2_500,
        commissionRateBps: 2_000,
        originalCommissionAmountCents: 500,
        netCommissionAmountCents: 500,
        status: PartnerCommissionStatus.AVAILABLE,
        availableAt: new Date(Date.now() - 86_400_000),
      },
    });
    const carryForward = await getPartnerAvailableBalance(activePartner.id);
    assert.equal(carryForward.grossCommissionCents, 500);
    assert.equal(carryForward.adjustmentCents, -250);
    assert.equal(carryForward.netAvailableCents, 250);

    await assert.rejects(
      runPartnerProspectScan({ partnerId: activePartner.id, websiteUrl: "http://127.0.0.1/private" }),
      /private|reserved/i,
    );
    const suspended = await prisma.partnerProfile.update({
      where: { id: activePartner.id },
      data: { status: PartnerStatus.SUSPENDED, referralEnabled: false, scannerEnabled: false },
    });
    assert.equal(partnerCanRefer(suspended), false);
    const afterSuspensionUser = await prisma.user.create({ data: { email: "after-suspension@test.invalid" } });
    const afterSuspension = await lockPartnerReferralAttribution(afterSuspensionUser.id, {
      ...referralPayload,
      anonymousVisitorId: "visitor-after-suspension",
    });
    assert.equal(afterSuspension.reason, "partner_ineligible");

    const auditCount = await prisma.partnerAdminAuditLog.count({ where: { partnerId: activePartner.id } });
    assert.ok(auditCount >= 4);
  },
);

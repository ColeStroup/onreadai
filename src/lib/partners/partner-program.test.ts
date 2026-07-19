import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import {
  PartnerAttributionStatus,
  PartnerCommissionStatus,
  PartnerStatus,
} from "@prisma/client";

import { PublicHttpError, assertPublicHttpUrl } from "@/lib/network/public-http";
import { validatePartnerApplication } from "@/lib/partners/application-validation";
import {
  calculateCommissionCents,
  commissionEligibility,
  effectiveCommissionStatus,
  proportionalCommissionReversal,
} from "@/lib/partners/commission-policy";
import { PartnerProgramError } from "@/lib/partners/errors";
import {
  createAnonymousVisitorId,
  signPartnerReferralCookie,
  verifyPartnerReferralCookie,
  type PartnerReferralCookiePayload,
} from "@/lib/partners/referral-cookie";
import { normalizeReferralCode, safeReferralDestination } from "@/lib/partners/referral-policy";
import { hashPreviewToken } from "@/lib/partners/preview-token";
import {
  PARTNER_SCANNER_MAX_FINDINGS,
  PARTNER_SCANNER_MAX_PAGES,
} from "@/lib/partners/scanner-constants";
import {
  PARTNER_ASSESSMENT_PASSING_SCORE,
  partnerAssessmentQuestions,
  partnerTrainingModules,
  requiredPartnerAgreementTypes,
} from "@/lib/partners/training-content";

const priorSecret = process.env.PARTNER_REFERRAL_SIGNING_SECRET;

before(() => {
  process.env.PARTNER_REFERRAL_SIGNING_SECRET = "partner-test-secret-with-enough-entropy";
});

after(() => {
  if (priorSecret === undefined) delete process.env.PARTNER_REFERRAL_SIGNING_SECRET;
  else process.env.PARTNER_REFERRAL_SIGNING_SECRET = priorSecret;
});

describe("commission policy", () => {
  test("uses integer cents and floors fractional commission cents", () => {
    assert.equal(calculateCommissionCents(999, 2_000), 199);
    assert.equal(calculateCommissionCents(10_000, 2_000), 2_000);
    assert.equal(calculateCommissionCents(-1, 2_000), 0);
  });

  test("calculates cumulative partial-refund reversals without exceeding the original", () => {
    const first = proportionalCommissionReversal({
      originalCommissionCents: 2_000,
      commissionableAmountCents: 10_000,
      cumulativeRefundAmountCents: 2_500,
      alreadyReversedCents: 0,
    });
    const second = proportionalCommissionReversal({
      originalCommissionCents: 2_000,
      commissionableAmountCents: 10_000,
      cumulativeRefundAmountCents: 12_000,
      alreadyReversedCents: first,
    });
    assert.equal(first, 500);
    assert.equal(second, 1_500);
  });

  test("rejects disabled, inactive, unsupported, and non-positive commissions", () => {
    const base = {
      programEnabled: true,
      commissionCreationEnabled: true,
      partnerStatus: PartnerStatus.ACTIVE,
      attributionStatus: PartnerAttributionStatus.LOCKED,
      amountCents: 10_000,
      currency: "usd",
      productKey: "full_audit",
    };
    assert.equal(commissionEligibility({ ...base, programEnabled: false }).reason, "commission_creation_disabled");
    assert.equal(commissionEligibility({ ...base, partnerStatus: PartnerStatus.SUSPENDED }).reason, "partner_inactive");
    assert.equal(commissionEligibility({ ...base, productKey: "arbitrary_price" }).reason, "unsupported_product");
    assert.equal(commissionEligibility({ ...base, amountCents: 0 }).reason, "non_positive_amount");
  });

  test("accepts audited admin overrides and enforces recurring duration", () => {
    const base = {
      programEnabled: true,
      commissionCreationEnabled: true,
      partnerStatus: PartnerStatus.ACTIVE,
      attributionStatus: PartnerAttributionStatus.OVERRIDDEN,
      amountCents: 2_900,
      currency: "usd",
      productKey: "starter_monthly",
      recurringCommissionMonths: 12,
    };
    assert.equal(commissionEligibility({ ...base, recurringPaymentNumber: 12 }).eligible, true);
    assert.equal(commissionEligibility({ ...base, recurringPaymentNumber: 13 }).reason, "recurring_window_complete");
  });

  test("derives availability without rewriting terminal statuses", () => {
    const past = new Date(Date.now() - 1_000);
    assert.equal(effectiveCommissionStatus({ storedStatus: PartnerCommissionStatus.PENDING, availableAt: past, netCommissionAmountCents: 100, disputeOpen: false }), PartnerCommissionStatus.AVAILABLE);
    assert.equal(effectiveCommissionStatus({ storedStatus: PartnerCommissionStatus.PAID, availableAt: past, netCommissionAmountCents: 100, disputeOpen: false }), PartnerCommissionStatus.PAID);
    assert.equal(effectiveCommissionStatus({ storedStatus: PartnerCommissionStatus.PENDING, availableAt: past, netCommissionAmountCents: 100, disputeOpen: true }), PartnerCommissionStatus.PENDING);
  });
});

describe("referral integrity", () => {
  function payload(): PartnerReferralCookiePayload {
    const now = Date.now();
    return {
      version: 1,
      referralCode: "certified-1234",
      anonymousVisitorId: createAnonymousVisitorId(),
      firstVisitAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 86_400_000).toISOString(),
      landingPath: "/pricing?utm_source=partner",
      source: "REFERRAL_LINK",
    };
  }

  test("round-trips a signed first-touch cookie", () => {
    const original = payload();
    const verified = verifyPartnerReferralCookie(signPartnerReferralCookie(original));
    assert.deepEqual(verified, original);
  });

  test("rejects a tampered signed cookie", () => {
    const signed = signPartnerReferralCookie(payload());
    const tampered = `${signed.slice(0, -1)}${signed.endsWith("a") ? "b" : "a"}`;
    assert.equal(verifyPartnerReferralCookie(tampered), null);
  });

  test("normalizes referral codes and rejects external destinations", () => {
    assert.equal(normalizeReferralCode("  Cole's Growth!  "), "colesgrowth");
    assert.equal(safeReferralDestination("https://attacker.example/steal"), "/");
    assert.equal(safeReferralDestination("//attacker.example"), "/");
    assert.equal(safeReferralDestination("/r/loop"), "/");
    assert.equal(safeReferralDestination("/pricing?plan=pro"), "/pricing?plan=pro");
  });
});

describe("application and certification content", () => {
  const validApplication = {
    legalName: "  Cole Example  ",
    displayName: "Growth Studio",
    email: "PARTNER@EXAMPLE.COM",
    country: "us",
    stateOrRegion: "Texas",
    websiteUrl: "example.com",
    socialProfiles: ["instagram.com/example"],
    experienceSummary: "I help small businesses explain their offers and improve practical customer acquisition systems.",
    intendedPromotionMethods: ["Educational content", "Educational content"],
    audienceOrOutreachSummary: "My audience includes independent consultants, local operators, and early-stage service businesses.",
    applicationMessage: "I want to teach evidence-based growth decisions without promising guaranteed rankings or revenue.",
    ageConfirmation: true,
    standardsAgreement: true,
    earningsDisclaimerAccepted: true,
  };

  test("normalizes a complete application", () => {
    const result = validatePartnerApplication(validApplication);
    assert.equal(result.email, "partner@example.com");
    assert.equal(result.country, "US");
    assert.equal(result.websiteUrl, "https://example.com/");
    assert.deepEqual(result.intendedPromotionMethods, ["Educational content"]);
  });

  test("requires substantive answers and all confirmations", () => {
    assert.throws(
      () => validatePartnerApplication({ ...validApplication, experienceSummary: "Too short" }),
      (error: unknown) => error instanceof PartnerProgramError && error.code === "APPLICATION_DETAIL_REQUIRED",
    );
    assert.throws(
      () => validatePartnerApplication({ ...validApplication, standardsAgreement: false }),
      (error: unknown) => error instanceof PartnerProgramError && error.code === "CONFIRMATIONS_REQUIRED",
    );
  });

  test("ships all required launch training and assessment requirements", () => {
    assert.equal(partnerTrainingModules.length, 8);
    assert.equal(partnerAssessmentQuestions.length, 5);
    assert.equal(PARTNER_ASSESSMENT_PASSING_SCORE, 80);
    assert.equal(requiredPartnerAgreementTypes.length, 4);
  });
});

describe("bounded Partner Scanner", () => {
  test("publishes hard limits of four pages and three findings", () => {
    assert.equal(PARTNER_SCANNER_MAX_PAGES, 4);
    assert.equal(PARTNER_SCANNER_MAX_FINDINGS, 3);
  });

  test("does not import AI, Places, competitor analysis, or the audit generator", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/partners/scanner.ts"),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /from\s+["'][^"']*(openai|google-places|competitor-analysis|deterministic-audit|audit-runner)/i,
    );
    assert.match(source, /crawlWebsite/);
    assert.match(source, /PARTNER_SCANNER_MAX_PAGES/);
    assert.match(source, /PARTNER_SCANNER_MAX_FINDINGS/);
  });

  test("hashes public preview tokens instead of storing raw tokens", () => {
    const raw = "a-very-long-random-preview-token";
    const hashed = hashPreviewToken(raw);
    assert.notEqual(hashed, raw);
    assert.equal(hashed.length, 64);
    assert.equal(hashPreviewToken(raw), hashed);
  });

  test("blocks unsafe protocols and private network targets", async () => {
    await assert.rejects(
      assertPublicHttpUrl("file:///etc/passwd"),
      (error: unknown) => error instanceof PublicHttpError && error.code === "INVALID_URL",
    );
    await assert.rejects(
      assertPublicHttpUrl("http://127.0.0.1/admin"),
      (error: unknown) => error instanceof PublicHttpError && error.code === "UNSAFE_HOST",
    );
    await assert.rejects(
      assertPublicHttpUrl("http://169.254.169.254/latest/meta-data"),
      (error: unknown) => error instanceof PublicHttpError && error.code === "UNSAFE_HOST",
    );
  });
});

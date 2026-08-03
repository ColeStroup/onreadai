import assert from "node:assert/strict";
import test from "node:test";

import {
  AuditStatus,
  BusinessProfileSource,
  BusinessProfileStatus,
  ProfilePlatform,
  ProfileReviewDecision,
} from "@prisma/client";

import {
  deriveBusinessSetupProgress,
  type BusinessSetupSource,
} from "@/lib/onboarding/business-setup";

function source(
  overrides: Partial<BusinessSetupSource> = {},
): BusinessSetupSource {
  return {
    profiles: [],
    description: null,
    targetAudience: null,
    mainOffer: null,
    contextConfirmedAt: null,
    goals: [],
    primaryGoal: null,
    audits: [],
    googleBusinessProfiles: [],
    profileDecisions: [],
    ...overrides,
  };
}

test("a submitted high-confidence profile still requires user confirmation", () => {
  const progress = deriveBusinessSetupProgress(
    source({
      profiles: [
        {
          platform: ProfilePlatform.WEBSITE,
          status: BusinessProfileStatus.PENDING,
          source: BusinessProfileSource.SUBMITTED,
          url: "https://example.com",
        },
      ],
      profileDecisions: [
        {
          platform: ProfilePlatform.GOOGLE_BUSINESS,
          decision: ProfileReviewDecision.SKIPPED,
        },
      ],
    }),
  );

  assert.equal(progress.profileCounts.confirmed, 0);
  assert.equal(progress.profileCounts.pending, 1);
  assert.equal(progress.profilesComplete, false);
});

test("a manual social profile cannot complete website setup", () => {
  const progress = deriveBusinessSetupProgress(
    source({
      profiles: [
        {
          platform: ProfilePlatform.INSTAGRAM,
          status: BusinessProfileStatus.CONFIRMED,
          source: BusinessProfileSource.MANUAL,
          url: "https://instagram.com/example",
        },
      ],
      profileDecisions: [
        {
          platform: ProfilePlatform.GOOGLE_BUSINESS,
          decision: ProfileReviewDecision.NOT_USED,
        },
      ],
    }),
  );

  assert.equal(progress.profilesComplete, false);
  assert.equal(progress.profileCounts.manuallyAdded, 0);
  assert.equal(progress.profileCounts.notUsed, 0);
});

test("disabled profile records are ignored while a confirmed website completes setup", () => {
  const progress = deriveBusinessSetupProgress(
    source({
      profiles: [
        {
          platform: ProfilePlatform.FACEBOOK,
          status: BusinessProfileStatus.REMOVED,
          source: BusinessProfileSource.DISCOVERED,
          url: "https://facebook.com/wrong",
        },
        {
          platform: ProfilePlatform.WEBSITE,
          status: BusinessProfileStatus.CONFIRMED,
          source: BusinessProfileSource.MANUAL,
          url: "https://example.com",
        },
      ],
      profileDecisions: [
        {
          platform: ProfilePlatform.GOOGLE_BUSINESS,
          decision: ProfileReviewDecision.SKIPPED,
        },
      ],
    }),
  );

  assert.equal(progress.profileCounts.removed, 0);
  assert.equal(progress.profileCounts.pending, 0);
  assert.equal(progress.profilesComplete, true);
});

test("Google decisions do not affect launch setup progress", () => {
  const skipped = deriveBusinessSetupProgress(
    source({
      profiles: [
        {
          platform: ProfilePlatform.WEBSITE,
          status: BusinessProfileStatus.CONFIRMED,
          url: "https://example.com",
        },
      ],
      profileDecisions: [
        {
          platform: ProfilePlatform.GOOGLE_BUSINESS,
          decision: ProfileReviewDecision.SKIPPED,
        },
      ],
    }),
  );
  const notUsed = deriveBusinessSetupProgress(
    source({
      profiles: [
        {
          platform: ProfilePlatform.WEBSITE,
          status: BusinessProfileStatus.CONFIRMED,
          url: "https://example.com",
        },
      ],
      profileDecisions: [
        {
          platform: ProfilePlatform.GOOGLE_BUSINESS,
          decision: ProfileReviewDecision.NOT_USED,
        },
      ],
    }),
  );

  assert.equal(skipped.profileCounts.skipped, 0);
  assert.equal(skipped.profileCounts.notUsed, 0);
  assert.equal(notUsed.profileCounts.skipped, 0);
  assert.equal(notUsed.profileCounts.notUsed, 0);
});

test("pending Google candidates do not block website-only setup", () => {
  const progress = deriveBusinessSetupProgress(
    source({
      profiles: [
        {
          platform: ProfilePlatform.WEBSITE,
          status: BusinessProfileStatus.CONFIRMED,
          url: "https://example.com",
        },
      ],
      googleBusinessProfiles: [{ status: "pending" }],
    }),
  );

  assert.equal(progress.profileCounts.pending, 0);
  assert.equal(progress.googleReviewed, true);
  assert.equal(progress.profilesComplete, true);
});

test("setup progress counts completed steps rather than profiles", () => {
  const progress = deriveBusinessSetupProgress(
    source({
      profiles: [
        {
          platform: ProfilePlatform.WEBSITE,
          status: BusinessProfileStatus.CONFIRMED,
          url: "https://example.com",
        },
      ],
      profileDecisions: [
        {
          platform: ProfilePlatform.GOOGLE_BUSINESS,
          decision: ProfileReviewDecision.NOT_USED,
        },
      ],
      description: "A local studio.",
      targetAudience: "Local families.",
      mainOffer: "Portrait sessions.",
      contextConfirmedAt: new Date(),
      goals: ["MORE_CUSTOMERS"],
      primaryGoal: "MORE_CUSTOMERS",
      audits: [{ status: AuditStatus.COMPLETED }],
    }),
  );

  assert.equal(progress.completedCount, 4);
  assert.equal(progress.percent, 80);
  assert.equal(progress.profileCounts.confirmed, 1);
});

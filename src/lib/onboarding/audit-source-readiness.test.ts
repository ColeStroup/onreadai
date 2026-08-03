import assert from "node:assert/strict";
import test from "node:test";

import {
  BusinessProfileStatus,
  ProfilePlatform,
  ProfileReviewDecision,
} from "@prisma/client";

import {
  auditSourceStateHash,
  deriveAuditSourceReadiness,
  type AuditSourceReadinessInput,
} from "@/lib/onboarding/audit-source-readiness";

function input(
  overrides: Partial<AuditSourceReadinessInput> = {},
): AuditSourceReadinessInput {
  return {
    profiles: [
      {
        id: "profile-1",
        platform: ProfilePlatform.WEBSITE,
        status: BusinessProfileStatus.CONFIRMED,
        normalizedUrl: "https://example.com/",
      },
    ],
    googleBusinessProfiles: [],
    profileDecisions: [
      {
        platform: ProfilePlatform.GOOGLE_BUSINESS,
        decision: ProfileReviewDecision.SKIPPED,
      },
    ],
    description: "A local studio.",
    targetAudience: "Local families.",
    mainOffer: "Portrait sessions.",
    contextConfirmedAt: new Date("2026-07-01T00:00:00.000Z"),
    goals: ["MORE_CUSTOMERS"],
    primaryGoal: "MORE_CUSTOMERS",
    ...overrides,
  };
}

test("a confirmed website is the only required audit source", () => {
  const readiness = deriveAuditSourceReadiness(input());

  assert.equal(readiness.hasWebsite, true);
  assert.equal(readiness.hasSocial, false);
  assert.equal(readiness.googleReviewState, "not_used");
  assert.deepEqual(readiness.missingSources, []);
  assert.equal(readiness.requiresAcknowledgement, false);
});

test("acknowledgement applies only to the same source state", () => {
  const current = input({
    description: null,
    targetAudience: null,
    mainOffer: null,
    contextConfirmedAt: null,
  });
  const stateHash = auditSourceStateHash(current);
  const acknowledged = deriveAuditSourceReadiness({
    ...current,
    auditSourceAcknowledgementHash: stateHash,
  });
  const changed = deriveAuditSourceReadiness({
    ...current,
    profiles: [
      {
        ...current.profiles[0]!,
        normalizedUrl: "https://changed.example/",
      },
    ],
    auditSourceAcknowledgementHash: stateHash,
  });

  assert.equal(acknowledged.acknowledged, true);
  assert.equal(acknowledged.requiresAcknowledgement, false);
  assert.equal(changed.acknowledged, false);
  assert.equal(changed.requiresAcknowledgement, true);
});

test("idempotent timestamp changes do not invalidate acknowledgement", () => {
  const before = input({
    profiles: [
      {
        ...input().profiles[0]!,
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ],
  });
  const after = input({
    profiles: [
      {
        ...input().profiles[0]!,
        updatedAt: new Date("2026-07-02T00:00:00.000Z"),
      },
    ],
  });

  assert.equal(auditSourceStateHash(before), auditSourceStateHash(after));
});

test("disabled-module profiles do not enter launch source readiness", () => {
  const readiness = deriveAuditSourceReadiness(
    input({
      profiles: [
        {
          id: "pending",
          platform: ProfilePlatform.INSTAGRAM,
          status: BusinessProfileStatus.PENDING,
          url: "https://instagram.com/example",
        },
        {
          id: "removed",
          platform: ProfilePlatform.WEBSITE,
          status: BusinessProfileStatus.REMOVED,
          url: "https://example.com",
        },
      ],
    }),
  );

  assert.equal(readiness.confirmedProfileCount, 0);
  assert.equal(readiness.pendingProfileCount, 0);
  assert.equal(readiness.hasWebsite, false);
  assert.equal(readiness.hasSocial, false);
});

test("Google candidate state is ignored by website-only launch readiness", () => {
  const readiness = deriveAuditSourceReadiness(
    input({
      googleBusinessProfiles: [
        {
          id: "google-1",
          status: "confirmed",
        },
      ],
      profileDecisions: [],
    }),
  );

  assert.equal(readiness.googleReviewState, "not_used");
  assert.equal(
    readiness.missingSources.some(
      (source) => source.code === "GOOGLE_NOT_REVIEWED",
    ),
    false,
  );
});

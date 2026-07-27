import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ComplimentaryEntitlementSource,
  PlanType,
  SubscriptionStatus,
} from "@prisma/client";

import { buildBillingAccessDisplay } from "@/lib/billing/billing-access-display";
import {
  complimentaryEntitlementIsActive,
  complimentaryEntitlementStatus,
} from "@/lib/billing/complimentary-entitlement-policy";
import {
  type ComplimentaryEntitlementCandidate,
  type PaidEntitlementCandidate,
  resolveEffectiveEntitlementFromRecords,
} from "@/lib/billing/effective-entitlement";
import { getPlanEntitlements } from "@/lib/billing/plans";

const now = new Date("2027-01-10T12:00:00.000Z");

function paid(
  plan: PlanType,
  options: Partial<PaidEntitlementCandidate> = {},
): PaidEntitlementCandidate {
  return {
    id: `paid-${plan}-${options.status ?? SubscriptionStatus.ACTIVE}`,
    plan,
    status: SubscriptionStatus.ACTIVE,
    stripeSubscriptionId: `sub_${plan.toLowerCase()}`,
    currentPeriodEnd: new Date("2027-02-10T12:00:00.000Z"),
    updatedAt: new Date("2027-01-09T12:00:00.000Z"),
    ...options,
  };
}

function complimentary(
  plan: PlanType,
  options: Partial<ComplimentaryEntitlementCandidate> = {},
): ComplimentaryEntitlementCandidate {
  return {
    id: `grant-${plan}-${options.startsAt?.toISOString() ?? "active"}`,
    plan,
    source: ComplimentaryEntitlementSource.MANUAL_ADMIN,
    startsAt: new Date("2027-01-01T00:00:00.000Z"),
    expiresAt: new Date("2027-02-01T00:00:00.000Z"),
    revokedAt: null,
    createdAt: new Date("2026-12-31T00:00:00.000Z"),
    ...options,
  };
}

describe("complimentary entitlement timing", () => {
  test("derives scheduled, active, expired, and revoked status from timestamps", () => {
    assert.equal(
      complimentaryEntitlementStatus(
        complimentary(PlanType.STARTER, {
          startsAt: new Date("2027-01-11T00:00:00.000Z"),
        }),
        now,
      ),
      "SCHEDULED",
    );
    assert.equal(
      complimentaryEntitlementStatus(
        complimentary(PlanType.STARTER),
        now,
      ),
      "ACTIVE",
    );
    assert.equal(
      complimentaryEntitlementStatus(
        complimentary(PlanType.STARTER, {
          expiresAt: new Date("2027-01-10T12:00:00.000Z"),
        }),
        now,
      ),
      "EXPIRED",
    );
    assert.equal(
      complimentaryEntitlementStatus(
        complimentary(PlanType.STARTER, {
          revokedAt: new Date("2027-01-05T00:00:00.000Z"),
        }),
        now,
      ),
      "REVOKED",
    );
  });

  test("activates a scheduled grant exactly at its start time", () => {
    const grant = complimentary(PlanType.PRO, {
      startsAt: new Date("2027-01-11T00:00:00.000Z"),
      expiresAt: null,
    });

    assert.equal(complimentaryEntitlementIsActive(grant, now), false);
    assert.equal(
      complimentaryEntitlementIsActive(
        grant,
        new Date("2027-01-11T00:00:00.000Z"),
      ),
      true,
    );
  });

  test("keeps a permanent grant active until it is revoked", () => {
    const grant = complimentary(PlanType.PRO, { expiresAt: null });

    assert.equal(
      complimentaryEntitlementIsActive(
        grant,
        new Date("2037-01-10T12:00:00.000Z"),
      ),
      true,
    );
  });
});

describe("effective entitlement precedence", () => {
  test("resolves paid Starter plus complimentary Pro to Pro", () => {
    const result = resolveEffectiveEntitlementFromRecords({
      subscriptions: [paid(PlanType.STARTER)],
      complimentaryEntitlements: [complimentary(PlanType.PRO)],
      now,
    });

    assert.equal(result.effectivePlan, PlanType.PRO);
    assert.equal(result.paidPlan, PlanType.STARTER);
    assert.equal(result.complimentaryPlan, PlanType.PRO);
    assert.equal(result.source, "COMPLIMENTARY");
  });

  test("resolves paid Pro plus complimentary Starter to paid Pro", () => {
    const result = resolveEffectiveEntitlementFromRecords({
      subscriptions: [paid(PlanType.PRO)],
      complimentaryEntitlements: [complimentary(PlanType.STARTER)],
      now,
    });

    assert.equal(result.effectivePlan, PlanType.PRO);
    assert.equal(result.paidPlan, PlanType.PRO);
    assert.equal(result.complimentaryPlan, PlanType.STARTER);
    assert.equal(result.source, "PAID");
  });

  test("gives paid access precedence when paid and complimentary plans tie", () => {
    const result = resolveEffectiveEntitlementFromRecords({
      subscriptions: [paid(PlanType.PRO)],
      complimentaryEntitlements: [complimentary(PlanType.PRO)],
      now,
    });

    assert.equal(result.effectivePlan, PlanType.PRO);
    assert.equal(result.source, "PAID");
  });

  test("uses complimentary Pro when a paid subscription is no longer active", () => {
    const result = resolveEffectiveEntitlementFromRecords({
      subscriptions: [
        paid(PlanType.STARTER, {
          status: SubscriptionStatus.CANCELED,
          currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
        }),
      ],
      complimentaryEntitlements: [complimentary(PlanType.PRO)],
      now,
    });

    assert.equal(result.effectivePlan, PlanType.PRO);
    assert.equal(result.paidPlan, PlanType.FREE);
    assert.equal(result.source, "COMPLIMENTARY");
  });

  test("ignores an expired non-Stripe paid record before applying complimentary access", () => {
    const result = resolveEffectiveEntitlementFromRecords({
      subscriptions: [
        paid(PlanType.STARTER, {
          stripeSubscriptionId: null,
          currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
        }),
      ],
      complimentaryEntitlements: [complimentary(PlanType.PRO)],
      now,
    });

    assert.equal(result.effectivePlan, PlanType.PRO);
    assert.equal(result.paidPlan, PlanType.FREE);
  });

  test("ignores expired and revoked complimentary grants", () => {
    const result = resolveEffectiveEntitlementFromRecords({
      subscriptions: [],
      complimentaryEntitlements: [
        complimentary(PlanType.PRO, {
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        }),
        complimentary(PlanType.PRO, {
          expiresAt: null,
          revokedAt: new Date("2027-01-05T00:00:00.000Z"),
        }),
      ],
      now,
    });

    assert.equal(result.effectivePlan, PlanType.FREE);
    assert.equal(result.complimentaryPlan, null);
    assert.equal(result.source, "FREE");
  });

  test("falls back to a valid paid plan when complimentary access expires", () => {
    const result = resolveEffectiveEntitlementFromRecords({
      subscriptions: [paid(PlanType.STARTER)],
      complimentaryEntitlements: [
        complimentary(PlanType.PRO, {
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        }),
      ],
      now,
    });

    assert.equal(result.effectivePlan, PlanType.STARTER);
    assert.equal(result.source, "PAID");
  });

  test("selects the highest active grant and uses the newest grant for ties", () => {
    const olderPro = complimentary(PlanType.PRO, {
      id: "older-pro",
      startsAt: new Date("2027-01-01T00:00:00.000Z"),
    });
    const newerPro = complimentary(PlanType.PRO, {
      id: "newer-pro",
      startsAt: new Date("2027-01-05T00:00:00.000Z"),
    });
    const result = resolveEffectiveEntitlementFromRecords({
      subscriptions: [],
      complimentaryEntitlements: [
        complimentary(PlanType.STARTER),
        olderPro,
        newerPro,
      ],
      now,
    });

    assert.equal(result.effectivePlan, PlanType.PRO);
    assert.equal(result.complimentaryEntitlement?.id, "newer-pro");
  });

  test("inherits the existing plan catalog limits for the effective plan", () => {
    const result = resolveEffectiveEntitlementFromRecords({
      subscriptions: [],
      complimentaryEntitlements: [complimentary(PlanType.PRO)],
      now,
    });

    assert.deepEqual(
      getPlanEntitlements(result.effectivePlan),
      getPlanEntitlements(PlanType.PRO),
    );
  });

  test("does not expose internal notes through the effective resolver", () => {
    const result = resolveEffectiveEntitlementFromRecords({
      subscriptions: [],
      complimentaryEntitlements: [
        {
          ...complimentary(PlanType.PRO),
          internalNotes: "Private administrative context",
        } as ComplimentaryEntitlementCandidate,
      ],
      now,
    });

    assert.equal(
      "internalNotes" in (result.complimentaryEntitlement ?? {}),
      false,
    );
  });
});

describe("billing access display", () => {
  test("labels complimentary access honestly and hides the portal without Stripe", () => {
    const display = buildBillingAccessDisplay({
      effectivePlan: PlanType.PRO,
      paidPlan: PlanType.FREE,
      complimentaryPlan: PlanType.PRO,
      source: "COMPLIMENTARY",
      complimentaryExpiresAt: new Date("2027-01-15T00:00:00.000Z"),
      hasActiveStripeSubscription: false,
    });

    assert.equal(display.effectivePlanLabel, "Pro");
    assert.equal(display.accessSourceLabel, "Complimentary access");
    assert.equal(display.complimentaryExpiration, "Ends January 15, 2027");
    assert.match(display.complimentaryMessage ?? "", /No charge was made/);
    assert.equal(display.showCustomerPortal, false);
  });

  test("keeps paid and complimentary plan labels separate", () => {
    const display = buildBillingAccessDisplay({
      effectivePlan: PlanType.PRO,
      paidPlan: PlanType.STARTER,
      complimentaryPlan: PlanType.PRO,
      source: "COMPLIMENTARY",
      complimentaryExpiresAt: null,
      hasActiveStripeSubscription: true,
    });

    assert.equal(display.effectivePlanLabel, "Pro");
    assert.equal(display.paidPlanLabel, "Starter");
    assert.equal(display.complimentaryExpiration, "No expiration");
    assert.equal(display.showCustomerPortal, true);
  });
});

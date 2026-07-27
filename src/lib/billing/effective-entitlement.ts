import {
  PlanType,
  SubscriptionStatus,
  type ComplimentaryEntitlement,
  type UserSubscription,
} from "@prisma/client";

import { complimentaryEntitlementIsActive } from "@/lib/billing/complimentary-entitlement-policy";
import { planOrder } from "@/lib/billing/plans";

export const paidSubscriptionAccessStatuses = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.PAST_DUE,
] as const;

export const entitlingSubscriptionStatuses = [
  ...paidSubscriptionAccessStatuses,
  SubscriptionStatus.FREE,
] as const;

export type PaidEntitlementCandidate = Pick<
  UserSubscription,
  | "id"
  | "plan"
  | "status"
  | "stripeSubscriptionId"
  | "currentPeriodEnd"
  | "updatedAt"
>;

export type ComplimentaryEntitlementCandidate = Pick<
  ComplimentaryEntitlement,
  | "id"
  | "plan"
  | "source"
  | "startsAt"
  | "expiresAt"
  | "revokedAt"
  | "createdAt"
>;

export type EffectiveEntitlementSource = "PAID" | "COMPLIMENTARY" | "FREE";

export type EffectiveEntitlement = {
  effectivePlan: PlanType;
  paidPlan: PlanType;
  complimentaryPlan: PlanType | null;
  source: EffectiveEntitlementSource;
  paidSubscription: PaidEntitlementCandidate | null;
  complimentaryEntitlement: ComplimentaryEntitlementCandidate | null;
  complimentaryExpiresAt: Date | null;
};

export function resolveEffectiveEntitlementFromRecords(input: {
  subscriptions: PaidEntitlementCandidate[];
  complimentaryEntitlements: ComplimentaryEntitlementCandidate[];
  now?: Date;
}): EffectiveEntitlement {
  const now = input.now ?? new Date();
  const paidSubscription = highestPlanRecord(
    input.subscriptions.filter((subscription) =>
      subscriptionGrantsAccess(subscription, now),
    ),
    (subscription) => subscription.plan,
    (subscription) => subscription.updatedAt,
  );
  const complimentaryEntitlement = highestPlanRecord(
    input.complimentaryEntitlements.filter((entitlement) =>
      complimentaryEntitlementIsActive(entitlement, now),
    ),
    (entitlement) => entitlement.plan,
    (entitlement) => entitlement.startsAt,
  );
  const safeComplimentaryEntitlement = complimentaryEntitlement
    ? {
        id: complimentaryEntitlement.id,
        plan: complimentaryEntitlement.plan,
        source: complimentaryEntitlement.source,
        startsAt: complimentaryEntitlement.startsAt,
        expiresAt: complimentaryEntitlement.expiresAt,
        revokedAt: complimentaryEntitlement.revokedAt,
        createdAt: complimentaryEntitlement.createdAt,
      }
    : null;
  const paidPlan = paidSubscription?.plan ?? PlanType.FREE;
  const complimentaryPlan = safeComplimentaryEntitlement?.plan ?? null;
  const complimentaryOutranksPaid =
    complimentaryPlan !== null &&
    planRank(complimentaryPlan) > planRank(paidPlan);

  if (complimentaryOutranksPaid && safeComplimentaryEntitlement) {
    return {
      effectivePlan: safeComplimentaryEntitlement.plan,
      paidPlan,
      complimentaryPlan: safeComplimentaryEntitlement.plan,
      source: "COMPLIMENTARY",
      paidSubscription,
      complimentaryEntitlement: safeComplimentaryEntitlement,
      complimentaryExpiresAt: safeComplimentaryEntitlement.expiresAt,
    };
  }

  if (paidSubscription && paidPlan !== PlanType.FREE) {
    return {
      effectivePlan: paidPlan,
      paidPlan,
      complimentaryPlan,
      source: "PAID",
      paidSubscription,
      complimentaryEntitlement: safeComplimentaryEntitlement,
      complimentaryExpiresAt:
        safeComplimentaryEntitlement?.expiresAt ?? null,
    };
  }

  if (safeComplimentaryEntitlement) {
    return {
      effectivePlan: safeComplimentaryEntitlement.plan,
      paidPlan,
      complimentaryPlan: safeComplimentaryEntitlement.plan,
      source: "COMPLIMENTARY",
      paidSubscription,
      complimentaryEntitlement: safeComplimentaryEntitlement,
      complimentaryExpiresAt: safeComplimentaryEntitlement.expiresAt,
    };
  }

  return {
    effectivePlan: PlanType.FREE,
    paidPlan,
    complimentaryPlan: null,
    source: "FREE",
    paidSubscription,
    complimentaryEntitlement: null,
    complimentaryExpiresAt: null,
  };
}

export function planRank(plan: PlanType) {
  const rank = planOrder.indexOf(plan);
  return rank === -1 ? 0 : rank;
}

function subscriptionGrantsAccess(
  subscription: PaidEntitlementCandidate,
  now: Date,
) {
  if (
    !entitlingSubscriptionStatuses.includes(
      subscription.status as (typeof entitlingSubscriptionStatuses)[number],
    )
  ) {
    return false;
  }

  if (subscription.plan === PlanType.FREE) return true;
  if (subscription.stripeSubscriptionId) return true;

  return (
    !subscription.currentPeriodEnd || subscription.currentPeriodEnd >= now
  );
}

function highestPlanRecord<T>(
  records: T[],
  getPlan: (record: T) => PlanType,
  getTimestamp: (record: T) => Date,
) {
  return (
    [...records].sort((left, right) => {
      const rankDifference = planRank(getPlan(right)) - planRank(getPlan(left));
      if (rankDifference !== 0) return rankDifference;
      return getTimestamp(right).getTime() - getTimestamp(left).getTime();
    })[0] ?? null
  );
}

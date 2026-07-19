import {
  PlanType,
  SubscriptionStatus,
} from "@prisma/client";
import type Stripe from "stripe";

const paidAccessStatuses = new Set<SubscriptionStatus>([
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.PAST_DUE,
]);

const billingProblemStatuses = new Set<SubscriptionStatus>([
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.INCOMPLETE,
  SubscriptionStatus.INCOMPLETE_EXPIRED,
  SubscriptionStatus.PAUSED,
]);

export function subscriptionHasPaidAccess(status: SubscriptionStatus) {
  return paidAccessStatuses.has(status);
}

export function subscriptionHasBillingProblem(status: SubscriptionStatus) {
  return billingProblemStatuses.has(status);
}

export function stripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  const statuses: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
    active: SubscriptionStatus.ACTIVE,
    canceled: SubscriptionStatus.CANCELED,
    incomplete: SubscriptionStatus.INCOMPLETE,
    incomplete_expired: SubscriptionStatus.INCOMPLETE_EXPIRED,
    past_due: SubscriptionStatus.PAST_DUE,
    paused: SubscriptionStatus.PAUSED,
    trialing: SubscriptionStatus.TRIALING,
    unpaid: SubscriptionStatus.UNPAID,
  };

  return statuses[status];
}

export function paidPlanOrFree({
  plan,
  status,
}: {
  plan: PlanType;
  status: SubscriptionStatus;
}) {
  return subscriptionHasPaidAccess(status) ? plan : PlanType.FREE;
}

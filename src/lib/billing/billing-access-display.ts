import { PlanType } from "@prisma/client";

import type { EffectiveEntitlementSource } from "@/lib/billing/effective-entitlement";
import { planLabels } from "@/lib/billing/plans";

export function buildBillingAccessDisplay(input: {
  effectivePlan: PlanType;
  paidPlan: PlanType;
  complimentaryPlan: PlanType | null;
  source: EffectiveEntitlementSource;
  complimentaryExpiresAt: Date | null;
  hasActiveStripeSubscription: boolean;
}) {
  const complimentaryExpiration = input.complimentaryPlan
    ? input.complimentaryExpiresAt
      ? `Ends ${formatBillingDate(input.complimentaryExpiresAt)}`
      : "No expiration"
    : null;

  return {
    effectivePlanLabel: planLabels[input.effectivePlan],
    paidPlanLabel:
      input.paidPlan === PlanType.FREE
        ? "No active paid plan"
        : planLabels[input.paidPlan],
    accessSourceLabel:
      input.source === "COMPLIMENTARY"
        ? "Complimentary access"
        : input.source === "PAID"
          ? "Paid access"
          : "Free access",
    complimentaryExpiration,
    complimentaryMessage: input.complimentaryPlan
      ? input.complimentaryExpiresAt
        ? `Onread granted complimentary ${planLabels[input.complimentaryPlan]} access through ${formatBillingDate(input.complimentaryExpiresAt)}. No charge was made for this access.`
        : `Onread granted complimentary ${planLabels[input.complimentaryPlan]} access with no expiration. No charge was made for this access.`
      : null,
    showCustomerPortal: input.hasActiveStripeSubscription,
  };
}

function formatBillingDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

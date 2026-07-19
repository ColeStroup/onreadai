import "server-only";

import { PlanType } from "@prisma/client";

import { BillingError } from "@/lib/billing/errors";
import { planDefinitions } from "@/lib/billing/plans";

export const billingProductKeys = [
  "full_audit",
  "starter_monthly",
  "pro_monthly",
] as const;

export type BillingProductKey = (typeof billingProductKeys)[number];
export type BillingPurchaseType = "subscription" | "one_time";

export type BillingProduct = {
  key: BillingProductKey;
  displayName: string;
  purchaseType: BillingPurchaseType;
  interval: "month" | null;
  stripePriceId: string | null;
  plan: PlanType;
  active: boolean;
  disabledReason: string | null;
  oneTimeAuditCredits: number;
};

type BillingEnvironment = Partial<
  Record<
    | "STRIPE_PRICE_FULL_AUDIT"
    | "STRIPE_PRICE_STARTER_MONTHLY"
    | "STRIPE_PRICE_PRO_MONTHLY",
    string | undefined
  >
>;

function priceId(value: string | undefined) {
  const normalized = value?.trim();
  return normalized?.startsWith("price_") ? normalized : null;
}

function product(
  input: Omit<BillingProduct, "active" | "disabledReason">,
): BillingProduct {
  const active = Boolean(input.stripePriceId);

  return {
    ...input,
    active,
    disabledReason: active
      ? null
      : "Stripe checkout is not configured for this product yet.",
  };
}

export function getBillingCatalog(
  environment: BillingEnvironment = process.env as BillingEnvironment,
): Record<BillingProductKey, BillingProduct> {
  return {
    full_audit: product({
      key: "full_audit",
      displayName: planDefinitions.ONE_TIME_AUDIT.name,
      purchaseType: "one_time",
      interval: null,
      stripePriceId: priceId(environment.STRIPE_PRICE_FULL_AUDIT),
      plan: PlanType.ONE_TIME_AUDIT,
      oneTimeAuditCredits: 1,
    }),
    starter_monthly: product({
      key: "starter_monthly",
      displayName: planDefinitions.STARTER.name,
      purchaseType: "subscription",
      interval: "month",
      stripePriceId: priceId(environment.STRIPE_PRICE_STARTER_MONTHLY),
      plan: PlanType.STARTER,
      oneTimeAuditCredits: 0,
    }),
    pro_monthly: product({
      key: "pro_monthly",
      displayName: planDefinitions.PRO.name,
      purchaseType: "subscription",
      interval: "month",
      stripePriceId: priceId(environment.STRIPE_PRICE_PRO_MONTHLY),
      plan: PlanType.PRO,
      oneTimeAuditCredits: 0,
    }),
  };
}

export function isBillingProductKey(value: unknown): value is BillingProductKey {
  return (
    typeof value === "string" &&
    billingProductKeys.includes(value as BillingProductKey)
  );
}

export function resolveBillingProduct(
  key: unknown,
  catalog = getBillingCatalog(),
) {
  if (!isBillingProductKey(key)) {
    throw new BillingError(
      "That billing product is not available.",
      "UNKNOWN_PRODUCT",
      400,
    );
  }

  const resolved = catalog[key];

  if (!resolved.active || !resolved.stripePriceId) {
    throw new BillingError(
      resolved.disabledReason ?? "That billing product is not available.",
      "PRODUCT_NOT_CONFIGURED",
      503,
    );
  }

  return resolved;
}

export function findBillingProductByPriceId(
  stripePriceId: string,
  catalog = getBillingCatalog(),
) {
  return Object.values(catalog).find(
    (candidate) =>
      candidate.active && candidate.stripePriceId === stripePriceId,
  );
}

export function billingProductForPlan(
  plan: PlanType,
  catalog = getBillingCatalog(),
) {
  return Object.values(catalog).find((candidate) => candidate.plan === plan);
}

import {
  PartnerAttributionStatus,
  PartnerCommissionStatus,
  PartnerPurchaseType,
  PartnerStatus,
} from "@prisma/client";

export function calculateCommissionCents(
  commissionableAmountCents: number,
  commissionRateBps: number,
) {
  if (
    !Number.isSafeInteger(commissionableAmountCents) ||
    !Number.isSafeInteger(commissionRateBps) ||
    commissionableAmountCents <= 0 ||
    commissionRateBps <= 0
  ) {
    return 0;
  }

  return Number(
    (BigInt(commissionableAmountCents) * BigInt(commissionRateBps)) /
      BigInt(10_000),
  );
}

export function proportionalCommissionReversal(input: {
  originalCommissionCents: number;
  commissionableAmountCents: number;
  cumulativeRefundAmountCents: number;
  alreadyReversedCents: number;
}) {
  if (input.commissionableAmountCents <= 0) return 0;
  const cappedRefund = Math.min(
    Math.max(0, input.cumulativeRefundAmountCents),
    input.commissionableAmountCents,
  );
  const targetReversal = Number(
    (BigInt(input.originalCommissionCents) * BigInt(cappedRefund)) /
      BigInt(input.commissionableAmountCents),
  );

  return Math.max(
    0,
    Math.min(
      input.originalCommissionCents - input.alreadyReversedCents,
      targetReversal - input.alreadyReversedCents,
    ),
  );
}

export function commissionAvailableAt(paymentAt: Date, holdDays: number) {
  return new Date(
    paymentAt.getTime() + Math.max(0, holdDays) * 24 * 60 * 60 * 1_000,
  );
}

export function effectiveCommissionStatus(input: {
  storedStatus: PartnerCommissionStatus;
  availableAt: Date;
  netCommissionAmountCents: number;
  disputeOpen: boolean;
  now?: Date;
}) {
  if (
    input.storedStatus === PartnerCommissionStatus.PAID ||
    input.storedStatus === PartnerCommissionStatus.REVERSED ||
    input.storedStatus === PartnerCommissionStatus.REJECTED ||
    input.storedStatus === PartnerCommissionStatus.PARTIALLY_REVERSED
  ) {
    return input.storedStatus;
  }

  if (input.netCommissionAmountCents <= 0) {
    return PartnerCommissionStatus.REVERSED;
  }
  if (input.disputeOpen) return PartnerCommissionStatus.PENDING;
  return input.availableAt <= (input.now ?? new Date())
    ? PartnerCommissionStatus.AVAILABLE
    : PartnerCommissionStatus.PENDING;
}

export function commissionEligibility(input: {
  programEnabled: boolean;
  commissionCreationEnabled: boolean;
  partnerStatus: PartnerStatus;
  attributionStatus: PartnerAttributionStatus;
  amountCents: number;
  currency: string;
  productKey: string;
  recurringPaymentNumber?: number;
  recurringCommissionMonths?: number;
}) {
  if (!input.programEnabled || !input.commissionCreationEnabled) {
    return { eligible: false, reason: "commission_creation_disabled" } as const;
  }
  if (input.partnerStatus !== PartnerStatus.ACTIVE) {
    return { eligible: false, reason: "partner_inactive" } as const;
  }
  if (
    input.attributionStatus !== PartnerAttributionStatus.LOCKED &&
    input.attributionStatus !== PartnerAttributionStatus.CONVERTED &&
    input.attributionStatus !== PartnerAttributionStatus.OVERRIDDEN
  ) {
    return { eligible: false, reason: "attribution_ineligible" } as const;
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    return { eligible: false, reason: "non_positive_amount" } as const;
  }
  if (input.currency.toLowerCase() !== "usd") {
    return { eligible: false, reason: "unsupported_currency" } as const;
  }
  if (!partnerPurchaseTypeForProduct(input.productKey)) {
    return { eligible: false, reason: "unsupported_product" } as const;
  }
  if (
    input.recurringPaymentNumber !== undefined &&
    input.recurringPaymentNumber > (input.recurringCommissionMonths ?? 0)
  ) {
    return { eligible: false, reason: "recurring_window_complete" } as const;
  }

  return { eligible: true, reason: "eligible" } as const;
}

export function partnerPurchaseTypeForProduct(productKey: string) {
  const types: Record<string, PartnerPurchaseType> = {
    full_audit: PartnerPurchaseType.FULL_AUDIT,
    starter_monthly: PartnerPurchaseType.STARTER_SUBSCRIPTION,
    pro_monthly: PartnerPurchaseType.PRO_SUBSCRIPTION,
  };
  return types[productKey] ?? null;
}

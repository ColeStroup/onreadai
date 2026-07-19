import "server-only";

import {
  PartnerAttributionStatus,
  PartnerCommissionAdjustmentType,
  PartnerCommissionStatus,
  PartnerStatus,
  type Prisma,
} from "@prisma/client";
import type Stripe from "stripe";

import type { BillingProduct } from "@/lib/billing/catalog";
import {
  calculateCommissionCents,
  commissionAvailableAt,
  commissionEligibility,
  partnerPurchaseTypeForProduct,
  proportionalCommissionReversal,
} from "@/lib/partners/commission-policy";

type StripeMetadata = Stripe.Metadata | null | undefined;

function objectId(value: { id: string } | string | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function metadataIds(metadata: StripeMetadata) {
  const partnerId = metadata?.partnerId;
  const attributionId = metadata?.partnerAttributionId;
  const checkoutIntentId = metadata?.partnerCheckoutIntentId;
  if (!partnerId || !attributionId || !checkoutIntentId) return null;
  return { partnerId, attributionId, checkoutIntentId };
}

export async function resolvePartnerCheckoutMetadata(
  transaction: Prisma.TransactionClient,
  input: {
    metadata: StripeMetadata;
    userId: string;
    productKey: string;
  },
) {
  const ids = metadataIds(input.metadata);
  if (!ids) return null;

  const intent = await transaction.partnerCheckoutIntent.findUnique({
    where: { id: ids.checkoutIntentId },
    include: { partner: true, attribution: true },
  });
  if (
    !intent ||
    intent.userId !== input.userId ||
    intent.productKey !== input.productKey ||
    intent.partnerId !== ids.partnerId ||
    intent.attributionId !== ids.attributionId ||
    intent.attribution.referredUserId !== input.userId ||
    intent.attribution.partnerId !== intent.partnerId
  ) {
    return null;
  }

  return intent;
}

function oneTimeCommissionableAmount(session: Stripe.Checkout.Session) {
  const subtotal = session.amount_subtotal ?? 0;
  const discount = session.total_details?.amount_discount ?? 0;
  return Math.max(0, subtotal - discount);
}

function invoiceCommissionableAmount(invoice: Stripe.Invoice) {
  const excludingTax = invoice.total_excluding_tax ?? invoice.subtotal_excluding_tax ?? 0;
  return Math.max(0, Math.min(excludingTax, invoice.amount_paid));
}

function invoicePaymentReferences(invoice: Stripe.Invoice) {
  const payment = invoice.payments?.data.find((item) => item.status === "paid");
  return {
    paymentIntentId: objectId(payment?.payment.payment_intent),
    chargeId: objectId(payment?.payment.charge),
  };
}

function sessionChargeId(session: Stripe.Checkout.Session) {
  const intent = session.payment_intent;
  if (!intent || typeof intent === "string") return null;
  return objectId(intent.latest_charge);
}

async function commissionSettings(transaction: Prisma.TransactionClient) {
  return transaction.partnerProgramSettings.findUnique({ where: { key: "default" } });
}

export async function linkPartnerOneTimePurchase(
  transaction: Prisma.TransactionClient,
  input: {
    session: Stripe.Checkout.Session;
    userId: string;
    product: BillingProduct;
    purchaseId: string;
  },
) {
  const intent = await resolvePartnerCheckoutMetadata(transaction, {
    metadata: input.session.metadata,
    userId: input.userId,
    productKey: input.product.key,
  });
  if (!intent) return null;

  await Promise.all([
    transaction.oneTimeAuditPurchase.update({
      where: { id: input.purchaseId },
      data: {
        partnerId: intent.partnerId,
        partnerReferralAttributionId: intent.attributionId,
      },
    }),
    transaction.partnerCheckoutIntent.update({
      where: { id: intent.id },
      data: {
        status: "FULFILLED",
        stripeCheckoutSessionId: input.session.id,
      },
    }),
  ]);
  return intent;
}

export async function createOneTimePartnerCommission(
  transaction: Prisma.TransactionClient,
  input: {
    session: Stripe.Checkout.Session;
    userId: string;
    product: BillingProduct;
    eventId: string;
    paymentAt: Date;
  },
) {
  const ids = metadataIds(input.session.metadata);
  if (!ids) return null;
  const settings = await commissionSettings(transaction);
  if (!settings) return null;

  const intent = await resolvePartnerCheckoutMetadata(transaction, {
    metadata: input.session.metadata,
    userId: input.userId,
    productKey: input.product.key,
  });
  if (!intent) return null;

  const paymentIntentId = objectId(input.session.payment_intent);
  if (!paymentIntentId) return null;
  const sourceKey = `full_audit:payment_intent:${paymentIntentId}`;
  const existing = await transaction.partnerCommission.findUnique({
    where: { sourceKey },
  });
  if (existing) return existing;

  const amountCents = oneTimeCommissionableAmount(input.session);
  const eligibility = commissionEligibility({
    programEnabled: settings.enabled,
    commissionCreationEnabled: settings.commissionCreationEnabled,
    partnerStatus: intent.partner.status,
    attributionStatus: intent.attribution.status,
    amountCents,
    currency: input.session.currency ?? "",
    productKey: input.product.key,
  });
  if (!eligibility.eligible) return null;

  const purchaseType = partnerPurchaseTypeForProduct(input.product.key);
  if (!purchaseType) return null;
  const commissionCents = calculateCommissionCents(
    amountCents,
    intent.partner.commissionRateBps,
  );
  if (commissionCents <= 0) return null;

  const commission = await transaction.partnerCommission.create({
    data: {
      partnerId: intent.partnerId,
      attributionId: intent.attributionId,
      referredUserId: input.userId,
      purchaseType,
      stripeCustomerId: objectId(input.session.customer) ?? "",
      stripeCheckoutSessionId: input.session.id,
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: sessionChargeId(input.session),
      sourceKey,
      sourceEventId: input.eventId,
      currency: (input.session.currency ?? "usd").toLowerCase(),
      commissionableAmountCents: amountCents,
      commissionRateBps: intent.partner.commissionRateBps,
      originalCommissionAmountCents: commissionCents,
      netCommissionAmountCents: commissionCents,
      availableAt: commissionAvailableAt(
        input.paymentAt,
        intent.partner.commissionHoldDays,
      ),
    },
  });
  await transaction.partnerReferralAttribution.update({
    where: { id: intent.attributionId },
    data: {
      status: PartnerAttributionStatus.CONVERTED,
      convertedAt: intent.attribution.convertedAt ?? input.paymentAt,
    },
  });
  await transaction.partnerNotification.create({
    data: {
      userId: intent.partner.userId,
      partnerId: intent.partnerId,
      type: "PARTNER_COMMISSION_CREATED",
      title: "New pending commission",
      message:
        "A referred Full Audit purchase qualified for commission and is now in the refund hold period.",
    },
  });
  return commission;
}

export async function linkPartnerSubscription(
  transaction: Prisma.TransactionClient,
  input: {
    metadata: StripeMetadata;
    userId: string;
    product: BillingProduct;
    subscriptionId: string;
  },
) {
  const ids = metadataIds(input.metadata);
  if (!ids) return null;
  const intent = await resolvePartnerCheckoutMetadata(transaction, {
    metadata: input.metadata,
    userId: input.userId,
    productKey: input.product.key,
  });
  if (!intent) return null;

  await Promise.all([
    transaction.userSubscription.update({
      where: { stripeSubscriptionId: input.subscriptionId },
      data: {
        partnerId: intent.partnerId,
        partnerReferralAttributionId: intent.attributionId,
      },
    }),
    transaction.partnerCheckoutIntent.update({
      where: { id: intent.id },
      data: { status: "SUBSCRIPTION_LINKED" },
    }),
  ]);
  return intent;
}

export async function createSubscriptionInvoiceCommission(
  transaction: Prisma.TransactionClient,
  input: {
    invoice: Stripe.Invoice;
    subscription: Stripe.Subscription;
    userId: string;
    product: BillingProduct;
    eventId: string;
    paymentAt: Date;
  },
) {
  const ids = metadataIds(input.subscription.metadata);
  if (!ids || input.invoice.status !== "paid") return null;
  const settings = await commissionSettings(transaction);
  if (!settings) return null;

  const intent = await resolvePartnerCheckoutMetadata(transaction, {
    metadata: input.subscription.metadata,
    userId: input.userId,
    productKey: input.product.key,
  });
  if (!intent) return null;

  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-recurring-attribution:${intent.attributionId}`}))`;
  const currentAttribution = await transaction.partnerReferralAttribution.findUnique({
    where: { id: intent.attributionId },
  });
  if (!currentAttribution) return null;

  const sourceKey = `subscription_invoice:${input.invoice.id}`;
  const existing = await transaction.partnerCommission.findUnique({
    where: { sourceKey },
  });
  if (existing) return existing;

  const paymentNumber = currentAttribution.paidSubscriptionMonths + 1;
  const amountCents = invoiceCommissionableAmount(input.invoice);
  const eligibility = commissionEligibility({
    programEnabled: settings.enabled,
    commissionCreationEnabled: settings.commissionCreationEnabled,
    partnerStatus: intent.partner.status,
    attributionStatus: currentAttribution.status,
    amountCents,
    currency: input.invoice.currency,
    productKey: input.product.key,
    recurringPaymentNumber: paymentNumber,
    recurringCommissionMonths: intent.partner.recurringCommissionMonths,
  });
  if (!eligibility.eligible) return null;

  const purchaseType = partnerPurchaseTypeForProduct(input.product.key);
  if (!purchaseType) return null;
  const commissionCents = calculateCommissionCents(
    amountCents,
    intent.partner.commissionRateBps,
  );
  if (commissionCents <= 0) return null;

  const references = invoicePaymentReferences(input.invoice);
  const commission = await transaction.partnerCommission.create({
    data: {
      partnerId: intent.partnerId,
      attributionId: intent.attributionId,
      referredUserId: input.userId,
      purchaseType,
      stripeCustomerId: objectId(input.invoice.customer) ?? "",
      stripeCheckoutSessionId: intent.stripeCheckoutSessionId,
      stripePaymentIntentId: references.paymentIntentId,
      stripeChargeId: references.chargeId,
      stripeSubscriptionId: input.subscription.id,
      stripeInvoiceId: input.invoice.id,
      sourceKey,
      sourceEventId: input.eventId,
      currency: input.invoice.currency.toLowerCase(),
      commissionableAmountCents: amountCents,
      commissionRateBps: intent.partner.commissionRateBps,
      originalCommissionAmountCents: commissionCents,
      netCommissionAmountCents: commissionCents,
      recurringPaymentNumber: paymentNumber,
      availableAt: commissionAvailableAt(
        input.paymentAt,
        intent.partner.commissionHoldDays,
      ),
    },
  });
  await transaction.partnerReferralAttribution.update({
    where: { id: intent.attributionId },
    data: {
      status: PartnerAttributionStatus.CONVERTED,
      convertedAt: currentAttribution.convertedAt ?? input.paymentAt,
      firstSubscriptionPaidAt:
        currentAttribution.firstSubscriptionPaidAt ?? input.paymentAt,
      paidSubscriptionMonths: { increment: 1 },
    },
  });
  await transaction.partnerNotification.create({
    data: {
      userId: intent.partner.userId,
      partnerId: intent.partnerId,
      type: "PARTNER_COMMISSION_CREATED",
      title: "New pending commission",
      message: `A referred subscription payment qualified as paid month ${paymentNumber}.`,
    },
  });
  return commission;
}

async function commissionForPayment(
  transaction: Prisma.TransactionClient,
  paymentIntentId: string | null,
  chargeId: string | null,
) {
  if (!paymentIntentId && !chargeId) return null;
  return transaction.partnerCommission.findFirst({
    where: {
      OR: [
        ...(paymentIntentId ? [{ stripePaymentIntentId: paymentIntentId }] : []),
        ...(chargeId ? [{ stripeChargeId: chargeId }] : []),
      ],
    },
    include: { adjustments: true, partner: true },
  });
}

export async function applyPartnerRefund(
  transaction: Prisma.TransactionClient,
  input: { refund: Stripe.Refund; eventId: string },
) {
  if (input.refund.status !== "succeeded" || input.refund.amount <= 0) return null;
  const sourceKey = `refund:${input.refund.id}`;
  const duplicate = await transaction.partnerCommissionAdjustment.findUnique({
    where: { sourceKey },
  });
  if (duplicate) return duplicate;

  const commission = await commissionForPayment(
    transaction,
    objectId(input.refund.payment_intent),
    objectId(input.refund.charge),
  );
  if (!commission || input.refund.currency.toLowerCase() !== commission.currency) return null;

  const priorRefundAmount = commission.adjustments
    .filter(
      (adjustment) =>
        adjustment.type === PartnerCommissionAdjustmentType.REFUND ||
        adjustment.type === PartnerCommissionAdjustmentType.PARTIAL_REFUND,
    )
    .reduce((total, adjustment) => total + (adjustment.sourceAmountCents ?? 0), 0);
  const reversal = proportionalCommissionReversal({
    originalCommissionCents: commission.originalCommissionAmountCents,
    commissionableAmountCents: commission.commissionableAmountCents,
    cumulativeRefundAmountCents: priorRefundAmount + input.refund.amount,
    alreadyReversedCents: commission.reversedAmountCents,
  });
  const nextNet = Math.max(0, commission.netCommissionAmountCents - reversal);
  const type =
    input.refund.amount >= commission.commissionableAmountCents - priorRefundAmount
      ? PartnerCommissionAdjustmentType.REFUND
      : PartnerCommissionAdjustmentType.PARTIAL_REFUND;

  const adjustment = await transaction.partnerCommissionAdjustment.create({
    data: {
      commissionId: commission.id,
      partnerId: commission.partnerId,
      type,
      sourceKey,
      sourceEventId: input.eventId,
      amountCents: -reversal,
      sourceAmountCents: input.refund.amount,
      reason: "Verified Stripe refund reduced the eligible customer payment.",
    },
  });
  await transaction.partnerCommission.update({
    where: { id: commission.id },
    data: {
      reversedAmountCents: { increment: reversal },
      netCommissionAmountCents: nextNet,
      status:
        commission.status === PartnerCommissionStatus.PAID
          ? PartnerCommissionStatus.PAID
          : nextNet === 0
            ? PartnerCommissionStatus.REVERSED
            : PartnerCommissionStatus.PARTIALLY_REVERSED,
    },
  });
  await transaction.partnerNotification.create({
    data: {
      userId: commission.partner.userId,
      partnerId: commission.partnerId,
      type: "PARTNER_COMMISSION_REVERSED",
      title: "Commission adjusted",
      message:
        commission.status === PartnerCommissionStatus.PAID
          ? "A customer refund created a negative balance adjustment for a future payout. The completed payout was preserved."
          : "A customer refund reduced or reversed a pending commission.",
    },
  });
  return adjustment;
}

export async function applyPartnerDispute(
  transaction: Prisma.TransactionClient,
  input: { dispute: Stripe.Dispute; eventId: string; closed: boolean },
) {
  const commission = await commissionForPayment(
    transaction,
    objectId(input.dispute.payment_intent),
    objectId(input.dispute.charge),
  );
  if (!commission || input.dispute.currency.toLowerCase() !== commission.currency) return null;

  if (!input.closed) {
    const sourceKey = `dispute:${input.dispute.id}:opened`;
    const duplicate = await transaction.partnerCommissionAdjustment.findUnique({
      where: { sourceKey },
    });
    if (duplicate) return duplicate;
    const proportional = calculateCommissionCents(
      Math.min(input.dispute.amount, commission.commissionableAmountCents),
      commission.commissionRateBps,
    );
    const reversal = Math.min(commission.netCommissionAmountCents, proportional);
    const nextNet = Math.max(0, commission.netCommissionAmountCents - reversal);
    const adjustment = await transaction.partnerCommissionAdjustment.create({
      data: {
        commissionId: commission.id,
        partnerId: commission.partnerId,
        type: PartnerCommissionAdjustmentType.DISPUTE,
        sourceKey,
        sourceEventId: input.eventId,
        amountCents: -reversal,
        sourceAmountCents: input.dispute.amount,
        reason: "Stripe reported an open dispute on the related payment.",
      },
    });
    await transaction.partnerCommission.update({
      where: { id: commission.id },
      data: {
        disputeOpen: true,
        reversedAmountCents: { increment: reversal },
        netCommissionAmountCents: nextNet,
        status:
          commission.status === PartnerCommissionStatus.PAID
            ? PartnerCommissionStatus.PAID
            : nextNet === 0
              ? PartnerCommissionStatus.REVERSED
              : PartnerCommissionStatus.PARTIALLY_REVERSED,
      },
    });
    return adjustment;
  }

  await transaction.partnerCommission.update({
    where: { id: commission.id },
    data: { disputeOpen: false },
  });
  if (input.dispute.status !== "won") return null;

  const opened = await transaction.partnerCommissionAdjustment.findUnique({
    where: { sourceKey: `dispute:${input.dispute.id}:opened` },
  });
  const sourceKey = `dispute:${input.dispute.id}:won`;
  const duplicate = await transaction.partnerCommissionAdjustment.findUnique({
    where: { sourceKey },
  });
  if (!opened || duplicate || opened.amountCents >= 0) return duplicate;

  const restoration = Math.min(
    Math.abs(opened.amountCents),
    commission.originalCommissionAmountCents - commission.netCommissionAmountCents,
  );
  if (restoration <= 0) return null;
  const nextNet = commission.netCommissionAmountCents + restoration;
  const adjustment = await transaction.partnerCommissionAdjustment.create({
    data: {
      commissionId: commission.id,
      partnerId: commission.partnerId,
      type: PartnerCommissionAdjustmentType.DISPUTE_REVERSAL,
      sourceKey,
      sourceEventId: input.eventId,
      amountCents: restoration,
      sourceAmountCents: input.dispute.amount,
      reason: "Stripe closed the dispute as won and restored eligible funds.",
    },
  });
  await transaction.partnerCommission.update({
    where: { id: commission.id },
    data: {
      reversedAmountCents: { decrement: restoration },
      netCommissionAmountCents: nextNet,
      status:
        commission.status === PartnerCommissionStatus.PAID
          ? PartnerCommissionStatus.PAID
          : nextNet === commission.originalCommissionAmountCents
            ? PartnerCommissionStatus.PENDING
            : PartnerCommissionStatus.PARTIALLY_REVERSED,
    },
  });
  return adjustment;
}

export function partnerMetadataPresent(metadata: StripeMetadata) {
  return Boolean(metadataIds(metadata));
}

export function partnerEligibleStatus(status: PartnerStatus) {
  return status === PartnerStatus.ACTIVE;
}

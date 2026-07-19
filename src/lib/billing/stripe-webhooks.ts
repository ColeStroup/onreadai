import "server-only";

import {
  PlanType,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import type Stripe from "stripe";

import {
  findBillingProductByPriceId,
  getBillingCatalog,
  type BillingProduct,
} from "@/lib/billing/catalog";
import { BillingError } from "@/lib/billing/errors";
import { stripeSubscriptionStatus } from "@/lib/billing/subscription-policy";
import {
  applyPartnerDispute,
  applyPartnerRefund,
  createOneTimePartnerCommission,
  createSubscriptionInvoiceCommission,
  linkPartnerOneTimePurchase,
  linkPartnerSubscription,
  partnerMetadataPresent,
} from "@/lib/partners/stripe-commissions";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

type PreparedStripeOperation =
  | {
      kind: "subscription";
      subscription: Stripe.Subscription;
      forceCanceled: boolean;
      invoiceOutcome: "paid" | "failed" | null;
      invoice: Stripe.Invoice | null;
    }
  | {
      kind: "one_time";
      session: Stripe.Checkout.Session;
    }
  | { kind: "refund"; refund: Stripe.Refund }
  | { kind: "dispute"; dispute: Stripe.Dispute; closed: boolean }
  | { kind: "none" };

type WebhookDependencies = {
  stripe: Pick<Stripe, "checkout" | "subscriptions"> &
    Partial<Pick<Stripe, "invoices">>;
  database: typeof prisma;
  catalog: ReturnType<typeof getBillingCatalog>;
};

function productionWebhookDependencies(): WebhookDependencies {
  return {
    stripe: getStripe(),
    database: prisma,
    catalog: getBillingCatalog(),
  };
}

function objectId(value: { id: string } | string | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  return objectId(invoice.parent?.subscription_details?.subscription);
}

async function prepareStripeOperation(
  event: Stripe.Event,
  stripe: WebhookDependencies["stripe"],
): Promise<PreparedStripeOperation> {
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    return {
      kind: "subscription",
      subscription: event.data.object,
      forceCanceled: event.type === "customer.subscription.deleted",
      invoiceOutcome: null,
      invoice: null,
    };
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;

    if (session.mode === "subscription") {
      const subscriptionId = objectId(session.subscription);

      if (!subscriptionId) {
        throw new BillingError(
          "A completed subscription Checkout Session had no subscription.",
          "WEBHOOK_SUBSCRIPTION_MISSING",
          500,
        );
      }

      return {
        kind: "subscription",
        subscription: await stripe.subscriptions.retrieve(subscriptionId),
        forceCanceled: false,
        invoiceOutcome: null,
        invoice: null,
      };
    }

    if (session.mode === "payment" && session.payment_status === "paid") {
      return {
        kind: "one_time",
        session: await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items", "payment_intent.latest_charge"],
        }),
      };
    }

    return { kind: "none" };
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const eventInvoice = event.data.object;
    const invoice = stripe.invoices
      ? await stripe.invoices.retrieve(eventInvoice.id, {
          expand: ["payments.data.payment.payment_intent"],
        })
      : eventInvoice;
    const subscriptionId = invoiceSubscriptionId(invoice);

    if (!subscriptionId) {
      return { kind: "none" };
    }

    return {
      kind: "subscription",
      subscription: await stripe.subscriptions.retrieve(subscriptionId),
      forceCanceled: false,
      invoiceOutcome: event.type === "invoice.paid" ? "paid" : "failed",
      invoice,
    };
  }

  if (event.type === "refund.created" || event.type === "refund.updated") {
    return { kind: "refund", refund: event.data.object };
  }

  if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.closed"
  ) {
    return {
      kind: "dispute",
      dispute: event.data.object,
      closed: event.type === "charge.dispute.closed",
    };
  }

  return { kind: "none" };
}

async function resolveWebhookUser(
  transaction: Prisma.TransactionClient,
  input: {
    customerId: string;
    metadataUserId?: string | null;
  },
) {
  const byCustomer = await transaction.user.findUnique({
    where: { stripeCustomerId: input.customerId },
    select: { id: true, stripeCustomerId: true },
  });

  if (byCustomer) {
    if (input.metadataUserId && input.metadataUserId !== byCustomer.id) {
      throw new BillingError(
        "Stripe customer metadata did not match the stored user.",
        "WEBHOOK_USER_MISMATCH",
        500,
      );
    }

    return byCustomer;
  }

  if (!input.metadataUserId) {
    throw new BillingError(
      "The Stripe customer is not linked to an application user.",
      "WEBHOOK_USER_NOT_FOUND",
      500,
    );
  }

  const byMetadata = await transaction.user.findUnique({
    where: { id: input.metadataUserId },
    select: { id: true, stripeCustomerId: true },
  });

  if (!byMetadata) {
    throw new BillingError(
      "The application user in Stripe metadata was not found.",
      "WEBHOOK_USER_NOT_FOUND",
      500,
    );
  }

  if (
    byMetadata.stripeCustomerId &&
    byMetadata.stripeCustomerId !== input.customerId
  ) {
    throw new BillingError(
      "The Stripe customer did not match the user's stored billing identity.",
      "WEBHOOK_CUSTOMER_MISMATCH",
      500,
    );
  }

  if (!byMetadata.stripeCustomerId) {
    await transaction.user.update({
      where: { id: byMetadata.id },
      data: { stripeCustomerId: input.customerId },
    });
  }

  return { id: byMetadata.id, stripeCustomerId: input.customerId };
}

function subscriptionProduct(
  subscription: Stripe.Subscription,
  catalog: WebhookDependencies["catalog"],
) {
  const stripePriceId = subscription.items.data[0]?.price.id;
  const product = stripePriceId
    ? findBillingProductByPriceId(stripePriceId, catalog)
    : undefined;

  if (!stripePriceId || !product || product.purchaseType !== "subscription") {
    throw new BillingError(
      "The Stripe subscription uses an unknown or disabled Price.",
      "WEBHOOK_PRICE_NOT_ALLOWED",
      500,
    );
  }

  return { stripePriceId, product };
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];

  return {
    currentPeriodStart: item?.current_period_start
      ? new Date(item.current_period_start * 1000)
      : null,
    currentPeriodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1000)
      : null,
  };
}

async function applySubscriptionOperation(
  transaction: Prisma.TransactionClient,
  operation: Extract<PreparedStripeOperation, { kind: "subscription" }>,
  eventCreatedAt: Date,
  eventId: string,
  catalog: WebhookDependencies["catalog"],
) {
  const subscription = operation.subscription;
  const customerId = objectId(subscription.customer);

  if (!customerId) {
    throw new BillingError(
      "The Stripe subscription has no customer.",
      "WEBHOOK_CUSTOMER_MISSING",
      500,
    );
  }

  const { stripePriceId, product } = subscriptionProduct(subscription, catalog);
  const user = await resolveWebhookUser(transaction, {
    customerId,
    metadataUserId: subscription.metadata.appUserId,
  });
  const existing = await transaction.userSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  const eventIsStale = Boolean(
    existing?.latestStripeEventCreatedAt &&
    existing.latestStripeEventCreatedAt > eventCreatedAt
  );

  if (existing && existing.userId !== user.id) {
    throw new BillingError(
      "The Stripe subscription belongs to another application user.",
      "WEBHOOK_SUBSCRIPTION_OWNER_MISMATCH",
      500,
    );
  }

  let status = operation.forceCanceled
    ? SubscriptionStatus.CANCELED
    : stripeSubscriptionStatus(subscription.status);

  if (
    operation.invoiceOutcome === "failed" &&
    (status === SubscriptionStatus.ACTIVE ||
      status === SubscriptionStatus.TRIALING)
  ) {
    status = SubscriptionStatus.PAST_DUE;
  }

  const period = subscriptionPeriod(subscription);
  const data = {
    userId: user.id,
    plan: product.plan,
    status,
    stripePriceId,
    stripeProductKey: product.key,
    currentPeriodStart: period.currentPeriodStart,
    currentPeriodEnd: period.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    latestStripeEventCreatedAt: eventCreatedAt,
    ...(operation.invoiceOutcome === "paid"
      ? { lastInvoicePaidAt: eventCreatedAt }
      : {}),
    ...(operation.invoiceOutcome === "failed"
      ? { lastPaymentFailedAt: eventCreatedAt }
      : {}),
  };

  if (!eventIsStale) {
    await transaction.userSubscription.upsert({
      where: { stripeSubscriptionId: subscription.id },
      create: {
        ...data,
        stripeSubscriptionId: subscription.id,
      },
      update: data,
    });
  }

  if (partnerMetadataPresent(subscription.metadata)) {
    await linkPartnerSubscription(transaction, {
      metadata: subscription.metadata,
      userId: user.id,
      product,
      subscriptionId: subscription.id,
    });

    if (operation.invoiceOutcome === "paid" && operation.invoice) {
      await createSubscriptionInvoiceCommission(transaction, {
        invoice: operation.invoice,
        subscription,
        userId: user.id,
        product,
        eventId,
        paymentAt: eventCreatedAt,
      });
    }
  }

  return user.id;
}

function oneTimeProduct(
  session: Stripe.Checkout.Session,
  catalog: WebhookDependencies["catalog"],
) {
  const lineItems = session.line_items?.data ?? [];
  const lineItem = lineItems[0];
  const stripePriceId = lineItem?.price?.id;
  const product = stripePriceId
    ? findBillingProductByPriceId(stripePriceId, catalog)
    : undefined;

  if (
    lineItems.length !== 1 ||
    lineItem.quantity !== 1 ||
    !stripePriceId ||
    !product ||
    product.purchaseType !== "one_time" ||
    product.oneTimeAuditCredits !== 1
  ) {
    throw new BillingError(
      "The one-time Checkout Session did not match an allowed product.",
      "WEBHOOK_ONE_TIME_PRODUCT_INVALID",
      500,
    );
  }

  if (
    session.metadata?.productKey &&
    session.metadata.productKey !== product.key
  ) {
    throw new BillingError(
      "Checkout metadata did not match the purchased Price.",
      "WEBHOOK_PRODUCT_MISMATCH",
      500,
    );
  }

  return { stripePriceId, product };
}

async function activateOneTimePlan(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    product: BillingProduct;
    stripePriceId: string;
    eventCreatedAt: Date;
  },
) {
  const existing = await transaction.userSubscription.findFirst({
    where: {
      userId: input.userId,
      plan: PlanType.ONE_TIME_AUDIT,
      stripeSubscriptionId: null,
    },
    orderBy: { updatedAt: "desc" },
  });
  const data = {
    plan: input.product.plan,
    status: SubscriptionStatus.ACTIVE,
    stripePriceId: input.stripePriceId,
    stripeProductKey: input.product.key,
    currentPeriodStart: input.eventCreatedAt,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    latestStripeEventCreatedAt: input.eventCreatedAt,
  };

  if (existing) {
    await transaction.userSubscription.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await transaction.userSubscription.create({
      data: {
        userId: input.userId,
        ...data,
      },
    });
  }
}

async function applyOneTimeOperation(
  transaction: Prisma.TransactionClient,
  operation: Extract<PreparedStripeOperation, { kind: "one_time" }>,
  eventCreatedAt: Date,
  eventId: string,
  catalog: WebhookDependencies["catalog"],
) {
  const session = operation.session;
  const customerId = objectId(session.customer);

  if (!customerId) {
    throw new BillingError(
      "The one-time Checkout Session has no customer.",
      "WEBHOOK_CUSTOMER_MISSING",
      500,
    );
  }

  const { product, stripePriceId } = oneTimeProduct(session, catalog);
  const user = await resolveWebhookUser(transaction, {
    customerId,
    metadataUserId: session.metadata?.appUserId,
  });

  if (session.client_reference_id && session.client_reference_id !== user.id) {
    throw new BillingError(
      "Checkout Session ownership did not match the Stripe customer.",
      "WEBHOOK_USER_MISMATCH",
      500,
    );
  }

  let purchase = await transaction.oneTimeAuditPurchase.findUnique({
    where: { stripeCheckoutSessionId: session.id },
    select: { id: true },
  });

  if (!purchase) {
    purchase = await transaction.oneTimeAuditPurchase.create({
      data: {
        userId: user.id,
        productKey: product.key,
        stripePriceId,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: objectId(session.payment_intent),
      },
      select: { id: true },
    });
  }

  if (partnerMetadataPresent(session.metadata)) {
    await linkPartnerOneTimePurchase(transaction, {
      session,
      userId: user.id,
      product,
      purchaseId: purchase.id,
    });
    await createOneTimePartnerCommission(transaction, {
      session,
      userId: user.id,
      product,
      eventId,
      paymentAt: eventCreatedAt,
    });
  }

  await activateOneTimePlan(transaction, {
    userId: user.id,
    product,
    stripePriceId,
    eventCreatedAt,
  });

  return user.id;
}

async function applyPreparedOperation(
  transaction: Prisma.TransactionClient,
  operation: PreparedStripeOperation,
  eventCreatedAt: Date,
  eventId: string,
  catalog: WebhookDependencies["catalog"],
) {
  if (operation.kind === "subscription") {
    return applySubscriptionOperation(
      transaction,
      operation,
      eventCreatedAt,
      eventId,
      catalog,
    );
  }

  if (operation.kind === "one_time") {
    return applyOneTimeOperation(
      transaction,
      operation,
      eventCreatedAt,
      eventId,
      catalog,
    );
  }

  if (operation.kind === "refund") {
    await applyPartnerRefund(transaction, {
      refund: operation.refund,
      eventId,
    });
    return null;
  }

  if (operation.kind === "dispute") {
    await applyPartnerDispute(transaction, {
      dispute: operation.dispute,
      eventId,
      closed: operation.closed,
    });
    return null;
  }

  return null;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function processStripeWebhookEvent(
  event: Stripe.Event,
  dependencies = productionWebhookDependencies(),
) {
  const alreadyProcessed = await dependencies.database.stripeWebhookEvent.findUnique({
    where: { stripeEventId: event.id },
    select: { id: true },
  });

  if (alreadyProcessed) {
    return { duplicate: true, userId: null };
  }

  const operation = await prepareStripeOperation(event, dependencies.stripe);
  const eventCreatedAt = new Date(event.created * 1000);

  try {
    return await dependencies.database.$transaction(async (transaction) => {
      const duplicate = await transaction.stripeWebhookEvent.findUnique({
        where: { stripeEventId: event.id },
        select: { id: true },
      });

      if (duplicate) {
        return { duplicate: true, userId: null };
      }

      const userId = await applyPreparedOperation(
        transaction,
        operation,
        eventCreatedAt,
        event.id,
        dependencies.catalog,
      );

      await transaction.stripeWebhookEvent.create({
        data: {
          stripeEventId: event.id,
          eventType: event.type,
          userId,
          stripeCreatedAt: eventCreatedAt,
        },
      });

      return { duplicate: false, userId };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { duplicate: true, userId: null };
    }

    throw error;
  }
}

export const supportedStripeWebhookEvents = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "refund.created",
  "refund.updated",
  "charge.dispute.created",
  "charge.dispute.closed",
] as const satisfies readonly Stripe.Event.Type[];

export function isSupportedStripeWebhookEvent(
  event: Stripe.Event,
): event is Stripe.Event {
  return supportedStripeWebhookEvents.includes(
    event.type as (typeof supportedStripeWebhookEvents)[number],
  );
}

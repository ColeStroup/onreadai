import "server-only";

import {
  SubscriptionStatus,
} from "@prisma/client";
import type Stripe from "stripe";

import { getBillingAppUrl } from "@/lib/billing/app-url";
import {
  getBillingCatalog,
  resolveBillingProduct,
  type BillingProduct,
  type BillingProductKey,
} from "@/lib/billing/catalog";
import { BillingError } from "@/lib/billing/errors";
import { getOrCreateStripeCustomer } from "@/lib/billing/stripe-customer";
import {
  preparePartnerCheckoutContext,
  recordPartnerCheckoutSession,
  type PartnerCheckoutContext,
} from "@/lib/partners/checkout-attribution";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

type CheckoutStripeClient = Pick<Stripe, "checkout">;

type CheckoutDependencies = {
  stripe: CheckoutStripeClient;
  appUrl: string;
  resolveProduct: (key: unknown) => BillingProduct;
  getCustomer: (userId: string) => Promise<{ id: string }>;
  hasBlockingSubscription: (userId: string) => Promise<boolean>;
  getPartnerContext?: (
    userId: string,
    productKey: string,
  ) => Promise<PartnerCheckoutContext | null>;
  recordPartnerSession?: (
    context: PartnerCheckoutContext,
    sessionId: string,
  ) => Promise<void>;
};

const blockingSubscriptionStatuses = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.UNPAID,
  SubscriptionStatus.INCOMPLETE,
  SubscriptionStatus.PAUSED,
];

function productionCheckoutDependencies(): CheckoutDependencies {
  const stripe = getStripe();

  return {
    stripe,
    appUrl: getBillingAppUrl(),
    resolveProduct: (key) => resolveBillingProduct(key, getBillingCatalog()),
    getCustomer: (userId) => getOrCreateStripeCustomer(userId),
    getPartnerContext: preparePartnerCheckoutContext,
    recordPartnerSession: recordPartnerCheckoutSession,
    hasBlockingSubscription: async (userId) => {
      const subscription = await prisma.userSubscription.findFirst({
        where: {
          userId,
          stripeSubscriptionId: { not: null },
          status: { in: blockingSubscriptionStatuses },
        },
        select: { id: true },
      });

      return Boolean(subscription);
    },
  };
}

export async function createStripeCheckoutSession(
  input: {
    userId: string;
    productKey: BillingProductKey | string;
  },
  dependencies = productionCheckoutDependencies(),
) {
  const product = dependencies.resolveProduct(input.productKey);

  if (
    product.purchaseType === "subscription" &&
    (await dependencies.hasBlockingSubscription(input.userId))
  ) {
    throw new BillingError(
      "An existing subscription must be managed from the billing portal.",
      "SUBSCRIPTION_ALREADY_EXISTS",
      409,
    );
  }

  if (!product.stripePriceId) {
    throw new BillingError(
      "Stripe checkout is not configured for this product.",
      "PRODUCT_NOT_CONFIGURED",
      503,
    );
  }

  const customer = await dependencies.getCustomer(input.userId);
  const partnerContext = dependencies.getPartnerContext
    ? await dependencies.getPartnerContext(input.userId, product.key)
    : null;
  const metadata = {
    appUserId: input.userId,
    productKey: product.key,
    ...(partnerContext
      ? {
          partnerId: partnerContext.partnerId,
          partnerAttributionId: partnerContext.partnerAttributionId,
          partnerCheckoutIntentId: partnerContext.partnerCheckoutIntentId,
        }
      : {}),
  };
  const shared: Stripe.Checkout.SessionCreateParams = {
    mode: product.purchaseType === "subscription" ? "subscription" : "payment",
    customer: customer.id,
    client_reference_id: input.userId,
    line_items: [{ price: product.stripePriceId, quantity: 1 }],
    metadata,
    success_url: `${dependencies.appUrl}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${dependencies.appUrl}/dashboard/billing/canceled`,
  };
  const params: Stripe.Checkout.SessionCreateParams =
    product.purchaseType === "subscription"
      ? {
          ...shared,
          subscription_data: { metadata },
        }
      : {
          ...shared,
          payment_intent_data: { metadata },
        };
  const session = await dependencies.stripe.checkout.sessions.create(params);

  if (partnerContext && dependencies.recordPartnerSession) {
    await dependencies.recordPartnerSession(partnerContext, session.id);
  }

  if (!session.url) {
    throw new BillingError(
      "Stripe did not return a checkout URL.",
      "CHECKOUT_URL_MISSING",
      502,
    );
  }

  return {
    id: session.id,
    url: session.url,
    mode: params.mode,
    product,
  };
}

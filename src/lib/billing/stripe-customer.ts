import "server-only";

import type Stripe from "stripe";

import { BillingError } from "@/lib/billing/errors";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

type CustomerStripeClient = Pick<Stripe, "customers">;

type StripeCustomerDependencies = {
  stripe: CustomerStripeClient;
  database: typeof prisma;
};

export async function getOrCreateStripeCustomer(
  userId: string,
  dependencies?: StripeCustomerDependencies,
) {
  const stripe = dependencies?.stripe ?? getStripe();
  const database = dependencies?.database ?? prisma;
  const user = await database.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      stripeCustomerId: true,
    },
  });

  if (!user) {
    throw new BillingError("User account was not found.", "USER_NOT_FOUND", 404);
  }

  if (user.stripeCustomerId) {
    const existing = await stripe.customers.retrieve(user.stripeCustomerId);

    if (existing.deleted) {
      throw new BillingError(
        "The billing customer is no longer available. Contact support before purchasing.",
        "STRIPE_CUSTOMER_DELETED",
        409,
      );
    }

    return existing;
  }

  const created = await stripe.customers.create(
    {
      ...(user.email ? { email: user.email } : {}),
      ...(user.name ? { name: user.name } : {}),
      metadata: {
        appUserId: user.id,
      },
    },
    {
      idempotencyKey: `ai-growth-consultant:customer:${user.id}`,
    },
  );
  const claimed = await database.user.updateMany({
    where: {
      id: user.id,
      stripeCustomerId: null,
    },
    data: {
      stripeCustomerId: created.id,
    },
  });

  if (claimed.count === 1) {
    return created;
  }

  const winner = await database.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true },
  });

  if (!winner?.stripeCustomerId) {
    throw new BillingError(
      "The billing customer could not be saved.",
      "STRIPE_CUSTOMER_PERSIST_FAILED",
      500,
    );
  }

  const existing = await stripe.customers.retrieve(winner.stripeCustomerId);

  if (existing.deleted) {
    throw new BillingError(
      "The billing customer is no longer available.",
      "STRIPE_CUSTOMER_DELETED",
      409,
    );
  }

  return existing;
}

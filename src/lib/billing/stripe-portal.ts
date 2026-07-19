import "server-only";

import type Stripe from "stripe";

import { getBillingAppUrl } from "@/lib/billing/app-url";
import { getOrCreateStripeCustomer } from "@/lib/billing/stripe-customer";
import { BillingError } from "@/lib/billing/errors";
import { getStripe } from "@/lib/stripe";

type PortalDependencies = {
  stripe: Pick<Stripe, "billingPortal">;
  appUrl: string;
  getCustomer: (userId: string) => Promise<{ id: string }>;
};

function productionPortalDependencies(): PortalDependencies {
  return {
    stripe: getStripe(),
    appUrl: getBillingAppUrl(),
    getCustomer: (userId) => getOrCreateStripeCustomer(userId),
  };
}

export async function createStripePortalSession(
  userId: string,
  dependencies = productionPortalDependencies(),
) {
  const customer = await dependencies.getCustomer(userId);
  const session = await dependencies.stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: `${dependencies.appUrl}/dashboard/billing`,
  });

  if (!session.url) {
    throw new BillingError(
      "Stripe did not return a billing portal URL.",
      "PORTAL_URL_MISSING",
      502,
    );
  }

  return session;
}

import "server-only";

import Stripe from "stripe";

import { BillingError } from "@/lib/billing/errors";
import { getDeploymentStage } from "@/lib/config/environment";

const globalForStripe = globalThis as unknown as {
  stripeClient?: Stripe;
  stripeSecretKey?: string;
};

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const mode = stripeMode();

  if (!secretKey) {
    throw new BillingError(
      "Stripe is not configured. Add STRIPE_SECRET_KEY to the server environment.",
      "STRIPE_NOT_CONFIGURED",
      503,
    );
  }

  if (mode === "test" && !secretKey.startsWith("sk_test_")) {
    throw new BillingError(
      "Stripe test mode is not configured correctly.",
      "STRIPE_MODE_MISMATCH",
      503,
    );
  }

  if (mode === "live" && !secretKey.startsWith("sk_live_")) {
    throw new BillingError(
      "Stripe live mode is not configured correctly.",
      "STRIPE_MODE_MISMATCH",
      503,
    );
  }

  if (
    !globalForStripe.stripeClient ||
    globalForStripe.stripeSecretKey !== secretKey
  ) {
    globalForStripe.stripeClient = new Stripe(secretKey, {
      maxNetworkRetries: 1,
      timeout: 20_000,
      appInfo: {
        name: "Onread AI",
        version: "0.1.0",
      },
    });
    globalForStripe.stripeSecretKey = secretKey;
  }

  return globalForStripe.stripeClient;
}

export function stripeMode() {
  const configured = process.env.STRIPE_MODE?.trim().toLowerCase();
  const stage = getDeploymentStage();

  if (configured !== "test" && configured !== "live") {
    if (process.env.NODE_ENV !== "production") return "test" as const;
    throw new BillingError(
      "Stripe billing mode is not configured.",
      "STRIPE_MODE_NOT_CONFIGURED",
      503,
    );
  }

  if (stage === "production" && configured !== "live") {
    throw new BillingError(
      "Stripe production mode is not configured correctly.",
      "STRIPE_MODE_MISMATCH",
      503,
    );
  }

  if (stage !== "production" && configured === "live") {
    throw new BillingError(
      "Live Stripe billing is disabled outside public production.",
      "STRIPE_LIVE_MODE_NOT_ALLOWED",
      503,
    );
  }

  return configured;
}

export function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    throw new BillingError(
      "Stripe webhooks are not configured. Add STRIPE_WEBHOOK_SECRET to the server environment.",
      "STRIPE_WEBHOOK_NOT_CONFIGURED",
      503,
    );
  }

  if (!webhookSecret.startsWith("whsec_")) {
    throw new BillingError(
      "Stripe webhooks are not configured correctly.",
      "STRIPE_WEBHOOK_INVALID",
      503,
    );
  }

  return webhookSecret;
}

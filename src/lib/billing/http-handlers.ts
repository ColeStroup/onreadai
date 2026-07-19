import "server-only";

import type Stripe from "stripe";

import { billingErrorResponse } from "@/lib/billing/errors";
import type { createStripeCheckoutSession } from "@/lib/billing/stripe-checkout";
import type { createStripePortalSession } from "@/lib/billing/stripe-portal";
import type { processStripeWebhookEvent } from "@/lib/billing/stripe-webhooks";
import { logError } from "@/lib/observability/log";

type RouteUser = { id: string } | null;

type CheckoutRouteDependencies = {
  getUser: () => Promise<RouteUser>;
  createSession: typeof createStripeCheckoutSession;
};

type PortalRouteDependencies = {
  getUser: () => Promise<RouteUser>;
  createSession: typeof createStripePortalSession;
};

type WebhookRouteDependencies = {
  constructEvent: (
    payload: string,
    signature: string,
    secret: string,
  ) => Stripe.Event;
  webhookSecret: () => string;
  processEvent: typeof processStripeWebhookEvent;
};

const maximumWebhookPayloadBytes = 1_000_000;
const maximumCheckoutPayloadBytes = 2_000;

function validCheckoutBody(value: unknown): value is { productKey: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 1 &&
    typeof record.productKey === "string" &&
    record.productKey.length <= 80
  );
}

export async function handleCheckoutRequest(
  request: Request,
  dependencies: CheckoutRouteDependencies,
) {
  const user = await dependencies.getUser();

  if (!user) {
    return Response.json(
      {
        error: "Sign in before starting checkout.",
        code: "AUTH_REQUIRED",
      },
      { status: 401 },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maximumCheckoutPayloadBytes
  ) {
    return Response.json(
      { error: "The checkout request is too large.", code: "INVALID_BODY" },
      { status: 413 },
    );
  }

  let body: unknown;

  try {
    const payload = await request.text();
    if (Buffer.byteLength(payload, "utf8") > maximumCheckoutPayloadBytes) {
      return Response.json(
        { error: "The checkout request is too large.", code: "INVALID_BODY" },
        { status: 413 },
      );
    }
    body = JSON.parse(payload);
  } catch {
    return Response.json(
      { error: "A valid product selection is required.", code: "INVALID_BODY" },
      { status: 400 },
    );
  }

  if (!validCheckoutBody(body)) {
    return Response.json(
      { error: "A valid product selection is required.", code: "INVALID_BODY" },
      { status: 400 },
    );
  }

  try {
    const session = await dependencies.createSession({
      userId: user.id,
      productKey: body.productKey,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    return billingErrorResponse(error);
  }
}

export async function handlePortalRequest(
  dependencies: PortalRouteDependencies,
) {
  const user = await dependencies.getUser();

  if (!user) {
    return Response.json(
      { error: "Sign in to manage billing.", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  try {
    const session = await dependencies.createSession(user.id);
    return Response.json({ url: session.url });
  } catch (error) {
    return billingErrorResponse(error);
  }
}

export async function handleWebhookRequest(
  request: Request,
  dependencies: WebhookRouteDependencies,
) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maximumWebhookPayloadBytes
  ) {
    return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json(
      { error: "Missing Stripe signature." },
      { status: 400 },
    );
  }

  const payload = await request.text();
  if (Buffer.byteLength(payload, "utf8") > maximumWebhookPayloadBytes) {
    return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
  }
  let event: Stripe.Event;

  try {
    event = dependencies.constructEvent(
      payload,
      signature,
      dependencies.webhookSecret(),
    );
  } catch {
    return Response.json(
      { error: "Invalid Stripe signature." },
      { status: 400 },
    );
  }

  try {
    const result = await dependencies.processEvent(event);
    return Response.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    logError("stripe_webhook_processing_failed", error, {
      eventId: event.id,
      eventType: event.type,
    });
    return Response.json(
      { error: "Stripe webhook processing failed." },
      { status: 500 },
    );
  }
}

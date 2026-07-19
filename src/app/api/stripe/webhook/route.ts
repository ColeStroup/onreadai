import { handleWebhookRequest } from "@/lib/billing/http-handlers";
import { processStripeWebhookEvent } from "@/lib/billing/stripe-webhooks";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleWebhookRequest(request, {
    constructEvent: (payload, signature, secret) =>
      getStripe().webhooks.constructEvent(payload, signature, secret),
    webhookSecret: getStripeWebhookSecret,
    processEvent: processStripeWebhookEvent,
  });
}

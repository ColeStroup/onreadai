import { createStripeCheckoutSession } from "@/lib/billing/stripe-checkout";
import { handleCheckoutRequest } from "@/lib/billing/http-handlers";
import { getCurrentUser } from "@/lib/session";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";
import {
  isSameOriginMutation,
  sameOriginErrorResponse,
} from "@/lib/security/request-origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginErrorResponse();
  const user = await getCurrentUser();

  if (user) {
    try {
      await enforceRateLimit({
        scope: "stripe-checkout",
        identifiers: [user.id, await currentRequestRateLimitIdentifier()],
        limit: 10,
        windowMs: 15 * 60 * 1_000,
      });
    } catch (error) {
      if (error instanceof RateLimitError) {
        return Response.json(
          { error: "Please wait before starting another checkout.", code: "RATE_LIMITED" },
          { status: 429 },
        );
      }
      throw error;
    }
  }

  return handleCheckoutRequest(request, {
    getUser: async () => user,
    createSession: createStripeCheckoutSession,
  });
}

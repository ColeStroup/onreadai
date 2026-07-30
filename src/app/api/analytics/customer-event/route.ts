import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  isCustomerEventName,
  isCustomerEventSurface,
} from "@/lib/analytics/customer-events";
import { logInfo } from "@/lib/observability/log";
import {
  isSameOriginMutation,
  sameOriginErrorResponse,
} from "@/lib/security/request-origin";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginErrorResponse();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid event." }, { status: 400 });
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return Response.json({ error: "Invalid event." }, { status: 400 });
  }

  const { eventName, surface } = input as Record<string, unknown>;
  if (!isCustomerEventName(eventName) || !isCustomerEventSurface(surface)) {
    return Response.json({ error: "Unknown event." }, { status: 400 });
  }

  logInfo("customer_experience_event", { eventName, surface });
  return new Response(null, { status: 204 });
}

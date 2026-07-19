import { logError } from "@/lib/observability/log";

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export function billingErrorResponse(error: unknown) {
  if (error instanceof BillingError) {
    if (error.status >= 500) {
      logError("stripe_billing_request_failed", error, { code: error.code });
      return Response.json(
        { error: "Billing is temporarily unavailable.", code: "BILLING_UNAVAILABLE" },
        { status: error.status },
      );
    }
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  logError("stripe_billing_request_failed", error);
  return Response.json(
    { error: "Billing is temporarily unavailable." },
    { status: 500 },
  );
}

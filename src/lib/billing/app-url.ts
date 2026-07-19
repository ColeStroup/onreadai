import "server-only";

import { BillingError } from "@/lib/billing/errors";

export function getBillingAppUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  const value =
    configuredUrl ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");

  if (!value) {
    throw new BillingError(
      "The application URL is not configured for Stripe redirects.",
      "APP_URL_NOT_CONFIGURED",
      503,
    );
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new BillingError(
      "NEXT_PUBLIC_APP_URL must be a valid HTTP or HTTPS URL.",
      "APP_URL_INVALID",
      503,
    );
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BillingError(
      "NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.",
      "APP_URL_INVALID",
      503,
    );
  }

  return url.origin;
}

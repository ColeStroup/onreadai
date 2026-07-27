import * as nextEnv from "@next/env";
import { defineConfig } from "@playwright/test";

nextEnv.loadEnvConfig(process.cwd());

const port = 3019;
const baseURL = `http://127.0.0.1:${port}`;
const databaseUrl =
  process.env.ENTITLEMENT_E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const databaseName = databaseUrl
  ? new URL(databaseUrl).pathname.replace(/^\/+/, "")
  : "";

if (!databaseName.includes("complimentary_entitlement_e2e_test")) {
  throw new Error(
    "Complimentary entitlement browser tests require ENTITLEMENT_E2E_DATABASE_URL to use a dedicated database containing complimentary_entitlement_e2e_test in its name.",
  );
}

export default defineConfig({
  testDir: "./tests",
  testMatch: "complimentary-entitlements.spec.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    colorScheme: "dark",
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: "complimentary-entitlement-e2e-nextauth-secret",
      APP_ENVIRONMENT: "preview",
      VERCEL_ENV: "preview",
      STRIPE_MODE: "test",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      STRIPE_PRICE_FULL_AUDIT: "",
      STRIPE_PRICE_STARTER_MONTHLY: "",
      STRIPE_PRICE_PRO_MONTHLY: "",
      RESEND_API_KEY: "",
      EMAIL_VERIFICATION_SECRET:
        "complimentary-entitlement-e2e-verification-secret",
      PASSWORD_RESET_SECRET:
        "complimentary-entitlement-e2e-password-reset-secret",
      RATE_LIMIT_SECRET:
        "complimentary-entitlement-e2e-rate-limit-secret",
    },
  },
});

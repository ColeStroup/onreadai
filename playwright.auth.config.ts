import "dotenv/config";

import { defineConfig } from "@playwright/test";

const port = 3017;
const baseURL = `http://127.0.0.1:${port}`;
const production = process.env.AUTH_E2E_PRODUCTION === "1";
const verificationSecret = "auth-e2e-email-verification-secret-123456789";
const resetSecret = "auth-e2e-password-reset-secret-123456789012";

process.env.EMAIL_VERIFICATION_SECRET = verificationSecret;
process.env.PASSWORD_RESET_SECRET = resetSecret;

export default defineConfig({
  testDir: "./tests",
  testMatch: "authentication-experience.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    colorScheme: "dark",
    locale: "en-US",
    userAgent: "Onread Auth E2E",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: production
      ? `npm run start -- --hostname 127.0.0.1 --port ${port}`
      : `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXTAUTH_URL: baseURL,
      APP_ENVIRONMENT: "preview",
      VERCEL_ENV: "preview",
      RESEND_API_KEY: "",
      EMAIL_VERIFICATION_SECRET: verificationSecret,
      PASSWORD_RESET_SECRET: resetSecret,
    },
  },
});

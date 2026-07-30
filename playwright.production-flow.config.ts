import * as nextEnv from "@next/env";
import { defineConfig } from "@playwright/test";

nextEnv.loadEnvConfig(process.cwd());

const port = 3020;
const baseURL = `http://127.0.0.1:${port}`;
const databaseUrl = process.env.PRODUCTION_FLOW_TEST_DATABASE_URL;

if (!databaseUrl || !databaseUrl.includes("production_flow_test")) {
  throw new Error(
    "PRODUCTION_FLOW_TEST_DATABASE_URL must identify an isolated production_flow_test database.",
  );
}

process.env.DATABASE_URL = databaseUrl;
process.env.DIRECT_URL = databaseUrl;

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "production-business-flow.spec.ts",
    "audit-quality-v3.spec.ts",
  ],
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    colorScheme: "light",
    locale: "en-US",
    userAgent: "Onread Production Flow E2E",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXTAUTH_URL: baseURL,
      APP_ENVIRONMENT: "preview",
      VERCEL_ENV: "preview",
      STRIPE_MODE: "test",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      OPENAI_API_KEY: "",
      RESEND_API_KEY: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    },
  },
});

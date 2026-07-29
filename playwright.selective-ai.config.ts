import * as nextEnv from "@next/env";
import { defineConfig } from "@playwright/test";

nextEnv.loadEnvConfig(process.cwd());

const port = 3022;
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
  testMatch: "selective-ai-audit.spec.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    colorScheme: "light",
    locale: "en-US",
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
      AI_ASSISTED_AUDITS_ENABLED: "false",
      RESEND_API_KEY: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_PLACES_API_KEY: "",
    },
  },
});

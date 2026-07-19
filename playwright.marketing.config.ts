import { defineConfig } from "@playwright/test";

const port = 3012;
const baseURL = `http://127.0.0.1:${port}`;
const production = process.env.MARKETING_E2E_PRODUCTION === "1";

export default defineConfig({
  testDir: "./tests",
  testMatch: "marketing-homepage.spec.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL,
    colorScheme: "dark",
    locale: "en-US",
    screenshot: "off",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile-375", use: { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true } },
    { name: "mobile-430", use: { viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true } },
    { name: "tablet-portrait", use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "tablet-landscape", use: { viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: "laptop-1366", use: { viewport: { width: 1366, height: 768 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "desktop-1920", use: { viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: {
    command: production
      ? `npm run start -- --hostname 127.0.0.1 --port ${port}`
      : `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_APP_URL: "https://growth-audit.example",
      NEXTAUTH_URL: baseURL,
    },
  },
});


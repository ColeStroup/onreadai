import assert from "node:assert/strict";
import test from "node:test";

import {
  EnvironmentValidationError,
  validateEnvironment,
} from "@/lib/config/environment";

function productionEnvironment() {
  const secret = "x".repeat(48);
  return {
    NODE_ENV: "production",
    APP_ENVIRONMENT: "production",
    DATABASE_URL: "postgresql://user:password@db.example.com:6432/app?sslmode=require",
    DIRECT_URL: "postgresql://user:password@db.example.com:5432/app?sslmode=require",
    NEXT_PUBLIC_APP_URL: "https://onread.ai",
    NEXTAUTH_URL: "https://onread.ai",
    NEXTAUTH_SECRET: secret,
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: secret,
    RESEND_API_KEY: "re_test_value",
    EMAIL_FROM_NAME: "Onread",
    EMAIL_FROM_ADDRESS: "notifications@updates.onread.ai",
    EMAIL_REPLY_TO: "support@onread.ai",
    EMAIL_VERIFICATION_SECRET: secret,
    PASSWORD_RESET_SECRET: secret,
    RATE_LIMIT_SECRET: secret,
    OPENAI_API_KEY: "sk-example",
    STRIPE_MODE: "live",
    STRIPE_SECRET_KEY: "sk_live_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    STRIPE_PRICE_FULL_AUDIT: "price_full",
    STRIPE_PRICE_STARTER_MONTHLY: "price_starter",
    STRIPE_PRICE_PRO_MONTHLY: "price_pro",
    PARTNER_REFERRAL_SIGNING_SECRET: secret,
  };
}

test("accepts a complete public production configuration", () => {
  assert.deepEqual(validateEnvironment(productionEnvironment()), {
    stage: "production",
  });
});

test("rejects test Stripe credentials in public production", () => {
  const env = {
    ...productionEnvironment(),
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_example",
  };

  assert.throws(
    () => validateEnvironment(env),
    (error) =>
      error instanceof EnvironmentValidationError &&
      error.issues.some((issue) => issue.includes("STRIPE_MODE must be live")),
  );
});

test("rejects live Stripe credentials in a preview", () => {
  const env = {
    ...productionEnvironment(),
    APP_ENVIRONMENT: "preview",
  };

  assert.throws(
    () => validateEnvironment(env),
    (error) =>
      error instanceof EnvironmentValidationError &&
      error.issues.some((issue) => issue.includes("not allowed outside")),
  );
});

test("Vercel production cannot be downgraded by APP_ENVIRONMENT", () => {
  const env = {
    ...productionEnvironment(),
    APP_ENVIRONMENT: "preview",
    VERCEL_ENV: "production",
  };

  assert.throws(
    () => validateEnvironment(env),
    (error) =>
      error instanceof EnvironmentValidationError &&
      error.issues.some((issue) => issue.includes("must match VERCEL_ENV")),
  );
});

test("a production-mode preview does not require live provider credentials", () => {
  assert.deepEqual(
    validateEnvironment({
      NODE_ENV: "production",
      APP_ENVIRONMENT: "preview",
      STRIPE_MODE: "test",
      STRIPE_SECRET_KEY: "sk_test_example",
    }),
    { stage: "preview" },
  );
});

test("reports variable names without echoing secret values", () => {
  const secretValue = "do-not-echo-this-secret";
  const env = {
    ...productionEnvironment(),
    NEXTAUTH_SECRET: secretValue,
  };

  assert.throws(
    () => validateEnvironment(env),
    (error) =>
      error instanceof Error &&
      error.message.includes("NEXTAUTH_SECRET") &&
      !error.message.includes(secretValue),
  );
});

import { getAuditAiModelRoute } from "@/lib/ai/model-routing";
import {
  featureFlagEnvironmentVariables,
  isAuditAiFindingReviewEnabled,
  isAiAssistedAuditsEnabled,
} from "@/lib/features/feature-flags";

type Environment = Record<string, string | undefined>;

export type DeploymentStage = "development" | "preview" | "production";

const publicProductionOrigin = "https://onread.ai";
const booleanValues = new Set(["true", "false"]);
const requiredProductionVariables = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM_NAME",
  "EMAIL_FROM_ADDRESS",
  "EMAIL_REPLY_TO",
  "EMAIL_VERIFICATION_SECRET",
  "PASSWORD_RESET_SECRET",
  "RATE_LIMIT_SECRET",
  "OPENAI_API_KEY",
  "STRIPE_MODE",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_FULL_AUDIT",
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRICE_PRO_MONTHLY",
  "PARTNER_REFERRAL_SIGNING_SECRET",
] as const;

export class EnvironmentValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Environment validation failed:\n- ${issues.join("\n- ")}`);
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

export function getDeploymentStage(env: Environment = process.env) {
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  if (env.VERCEL_ENV === "development") return "development";

  const configured = env.APP_ENVIRONMENT?.trim().toLowerCase();

  if (
    configured === "development" ||
    configured === "preview" ||
    configured === "production"
  ) {
    return configured;
  }

  return "development";
}

export function isPublicProduction(env: Environment = process.env) {
  return getDeploymentStage(env) === "production";
}

export function validateEnvironment(env: Environment = process.env) {
  const issues: string[] = [];
  const stage = getDeploymentStage(env);
  const configuredStage = env.APP_ENVIRONMENT?.trim().toLowerCase();

  if (
    env.APP_ENVIRONMENT &&
    !["development", "preview", "production"].includes(configuredStage ?? "")
  ) {
    issues.push("APP_ENVIRONMENT must be development, preview, or production.");
  }

  if (
    env.VERCEL_ENV &&
    configuredStage &&
    ["development", "preview", "production"].includes(env.VERCEL_ENV) &&
    configuredStage !== env.VERCEL_ENV
  ) {
    issues.push("APP_ENVIRONMENT must match VERCEL_ENV on Vercel.");
  }

  for (const name of featureFlagEnvironmentVariables) {
    const value = env[name]?.trim().toLowerCase();
    if (value && !booleanValues.has(value)) {
      issues.push(`${name} must be true or false.`);
    }
  }

  validateUrlVariable(env, "NEXT_PUBLIC_APP_URL", issues);
  validateUrlVariable(env, "NEXTAUTH_URL", issues);
  validateDatabaseUrl(env, "DATABASE_URL", issues);
  validateDatabaseUrl(env, "DIRECT_URL", issues);
  validateOptionalHttpsUrl(env, "PARTNER_COMMUNITY_URL", issues);
  validateSecret(env, "NEXTAUTH_SECRET", issues, stage === "production" ? 32 : 16);
  validateSecret(env, "EMAIL_VERIFICATION_SECRET", issues, 32);
  validateSecret(env, "PASSWORD_RESET_SECRET", issues, 32);
  validateSecret(env, "RATE_LIMIT_SECRET", issues, 32);
  validateSecret(env, "PARTNER_REFERRAL_SIGNING_SECRET", issues, 32);
  validateStripeConfiguration(env, stage, issues);

  const priceIds = [
    env.STRIPE_PRICE_FULL_AUDIT?.trim(),
    env.STRIPE_PRICE_STARTER_MONTHLY?.trim(),
    env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
  ].filter((value): value is string => Boolean(value));

  if (new Set(priceIds).size !== priceIds.length) {
    issues.push("Stripe price IDs must be unique.");
  }

  if (stage === "production") {
    for (const name of requiredProductionVariables) {
      if (!env[name]?.trim()) issues.push(`${name} is required in production.`);
    }
    validateAiAssistedAuditConfiguration(env, issues);

    if (env.EMAIL_FROM_NAME?.trim() !== "Onread") {
      issues.push('EMAIL_FROM_NAME must be "Onread" in production.');
    }
    if (env.EMAIL_FROM_ADDRESS?.trim().toLowerCase() !== "notifications@updates.onread.ai") {
      issues.push("EMAIL_FROM_ADDRESS must be notifications@updates.onread.ai in production.");
    }
    if (env.EMAIL_REPLY_TO?.trim().toLowerCase() !== "support@onread.ai") {
      issues.push("EMAIL_REPLY_TO must be support@onread.ai in production.");
    }
    if (!env.STRIPE_WEBHOOK_SECRET?.trim().startsWith("whsec_")) {
      issues.push("STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret.");
    }
    for (const [name, value] of [
      ["STRIPE_PRICE_FULL_AUDIT", env.STRIPE_PRICE_FULL_AUDIT],
      ["STRIPE_PRICE_STARTER_MONTHLY", env.STRIPE_PRICE_STARTER_MONTHLY],
      ["STRIPE_PRICE_PRO_MONTHLY", env.STRIPE_PRICE_PRO_MONTHLY],
    ] as const) {
      if (value?.trim() && !value.trim().startsWith("price_")) {
        issues.push(`${name} must be a Stripe Price ID.`);
      }
    }
  }

  if (stage === "production") {
    if (env.NEXT_PUBLIC_APP_URL?.trim() !== publicProductionOrigin) {
      issues.push(`NEXT_PUBLIC_APP_URL must be ${publicProductionOrigin} in production.`);
    }
    if (env.NEXTAUTH_URL?.trim() !== publicProductionOrigin) {
      issues.push(`NEXTAUTH_URL must be ${publicProductionOrigin} in production.`);
    }
    requireSslDatabaseUrl(env, "DATABASE_URL", issues);
    requireSslDatabaseUrl(env, "DIRECT_URL", issues);
  }

  if (issues.length > 0) throw new EnvironmentValidationError(unique(issues));

  return { stage };
}

function validateAiAssistedAuditConfiguration(
  env: Environment,
  issues: string[],
) {
  if (
    !isAiAssistedAuditsEnabled(env) &&
    !isAuditAiFindingReviewEnabled(env)
  ) {
    return;
  }

  if (!env.OPENAI_API_KEY?.trim()) {
    issues.push("OPENAI_API_KEY is required in production.");
  }

  for (const task of ["PAGE_ANALYSIS", "AUDIT_SYNTHESIS"] as const) {
    if (!getAuditAiModelRoute(task, env).model.trim()) {
      issues.push(
        `${task} must resolve from its audit-specific model, OPENAI_MODEL, or the application default.`,
      );
    }
  }
}

function validateStripeConfiguration(
  env: Environment,
  stage: DeploymentStage,
  issues: string[],
) {
  const mode = env.STRIPE_MODE?.trim().toLowerCase();
  const secret = env.STRIPE_SECRET_KEY?.trim();

  if (mode && mode !== "test" && mode !== "live") {
    issues.push("STRIPE_MODE must be test or live.");
  }
  if (mode === "test" && secret && !secret.startsWith("sk_test_")) {
    issues.push("STRIPE_MODE=test requires an sk_test_ secret key.");
  }
  if (mode === "live" && secret && !secret.startsWith("sk_live_")) {
    issues.push("STRIPE_MODE=live requires an sk_live_ secret key.");
  }
  if (stage === "production" && mode !== "live") {
    issues.push("STRIPE_MODE must be live in the public production environment.");
  }
  if (stage !== "production" && (mode === "live" || secret?.startsWith("sk_live_"))) {
    issues.push("Live Stripe credentials are not allowed outside public production.");
  }
}

function validateUrlVariable(env: Environment, name: string, issues: string[]) {
  const value = env[name]?.trim();
  if (!value) return;

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      issues.push(`${name} must be an HTTP(S) origin without credentials.`);
    }
    if (url.pathname !== "/" || url.search || url.hash) {
      issues.push(`${name} must be an origin without a path, query, or fragment.`);
    }
  } catch {
    issues.push(`${name} must be a valid URL origin.`);
  }
}

function validateOptionalHttpsUrl(env: Environment, name: string, issues: string[]) {
  const value = env[name]?.trim();
  if (!value) return;
  try {
    if (new URL(value).protocol !== "https:") issues.push(`${name} must use HTTPS.`);
  } catch {
    issues.push(`${name} must be a valid HTTPS URL.`);
  }
}

function validateDatabaseUrl(env: Environment, name: string, issues: string[]) {
  const value = env[name]?.trim();
  if (!value) return;
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      issues.push(`${name} must be a PostgreSQL connection URL.`);
    }
  } catch {
    issues.push(`${name} must be a valid PostgreSQL connection URL.`);
  }
}

function requireSslDatabaseUrl(env: Environment, name: string, issues: string[]) {
  const value = env[name]?.trim();
  if (!value) return;
  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
    const ssl = url.searchParams.get("ssl")?.toLowerCase();
    if (!sslMode || ["disable", "allow", "prefer"].includes(sslMode)) {
      if (ssl !== "true") {
        issues.push(`${name} must require TLS in public production.`);
      }
    }
  } catch {
    return;
  }
}

function validateSecret(
  env: Environment,
  name: string,
  issues: string[],
  minimumLength: number,
) {
  const value = env[name]?.trim();
  if (value && value.length < minimumLength) {
    issues.push(`${name} must be at least ${minimumLength} characters.`);
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

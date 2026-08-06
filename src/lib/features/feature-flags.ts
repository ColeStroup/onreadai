export const featureFlagInventory = [
  {
    key: "socialGrowth",
    environmentVariable: "SOCIAL_GROWTH_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["/dashboard/businesses/[businessId]/social"],
    effect:
      "Controls the future connected Social Growth module. It is excluded from the launch product by default.",
  },
  {
    key: "competitorIntelligence",
    environmentVariable: "COMPETITOR_INTELLIGENCE_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["/dashboard/businesses/[businessId]/competitors"],
    effect:
      "Controls the future Competitive Intelligence module. It is excluded from the launch product by default.",
  },
  {
    key: "localGrowth",
    environmentVariable: "LOCAL_GROWTH_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["/dashboard/businesses/[businessId]/reviews"],
    effect:
      "Controls the future connected Local Growth module. It is excluded from the launch product by default.",
  },
  {
    key: "partnerProgram",
    environmentVariable: "PARTNER_PROGRAM_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["/partners", "/partners/apply", "/dashboard/partner"],
    effect:
      "Controls partner applications, partner workspaces, and all partner subfeatures.",
  },
  {
    key: "partnerApplications",
    environmentVariable: "PARTNER_APPLICATIONS_OPEN",
    developmentDefault: false,
    productionDefault: false,
    routes: ["/partners/apply"],
    effect: "Allows authenticated users to submit a partner application.",
  },
  {
    key: "partnerReferralAttribution",
    environmentVariable: "PARTNER_REFERRAL_ATTRIBUTION_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["/r/[code]"],
    effect:
      "Allows signed first-touch referral attribution and checkout attribution.",
  },
  {
    key: "partnerCommissionCreation",
    environmentVariable: "PARTNER_COMMISSION_CREATION_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["Stripe webhook processing"],
    effect:
      "Allows new partner commissions to be created from verified Stripe events.",
  },
  {
    key: "partnerScanner",
    environmentVariable: "PARTNER_SCANNER_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["/dashboard/partner/scanner"],
    effect: "Allows active partners to run rate-limited public website scans.",
  },
  {
    key: "partnerPreviewPages",
    environmentVariable: "PARTNER_PREVIEW_PAGES_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["/preview/[token]"],
    effect:
      "Allows creation and viewing of expiring, revocable prospect previews.",
  },
  {
    key: "partnerManualPayouts",
    environmentVariable: "PARTNER_MANUAL_PAYOUT_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["/dashboard/admin/partners/payouts"],
    effect:
      "Allows administrators to prepare, approve, and reconcile manual payouts.",
  },
  {
    key: "aiAssistedAudits",
    environmentVariable: "AI_ASSISTED_AUDITS_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["Audit generation"],
    effect:
      "Adds bounded AI review of selected crawled pages without changing deterministic audit scores.",
  },
  {
    key: "auditValidationPipelineV2",
    environmentVariable: "AUDIT_VALIDATION_PIPELINE_V2_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["Audit generation"],
    effect:
      "Publishes only candidate findings that pass evidence, contradiction, materiality, and completeness validation. Shadow diagnostics run before promotion.",
  },
  {
    key: "auditAiFindingReview",
    environmentVariable: "AUDIT_AI_FINDING_REVIEW_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["Audit finding validation"],
    effect:
      "Uses bounded structured AI review only for ambiguous finding candidates after deterministic contradiction checks.",
  },
  {
    key: "auditRenderedFetchFallback",
    environmentVariable: "AUDIT_RENDERED_FETCH_FALLBACK_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["Website crawl"],
    effect:
      "Escalates incomplete static pages to the secure browser-rendering adapter when available.",
  },
  {
    key: "auditPlainLanguageV2",
    environmentVariable: "AUDIT_PLAIN_LANGUAGE_V2_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["Audit report", "AI Consultant"],
    effect:
      "Shows the validated plain-language finding contract and specialist-readiness guidance.",
  },
  {
    key: "auditTargetedVerificationV1",
    environmentVariable: "AUDIT_TARGETED_VERIFICATION_V1_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["Audit verification"],
    effect:
      "Enables frozen-scope verification contracts separately from discovery audits.",
  },
] as const;

export const featureFlagEnvironmentVariables = featureFlagInventory.map(
  (flag) => flag.environmentVariable,
);

export const partnerFeatureEnvironmentVariables =
  featureFlagEnvironmentVariables.filter((name) => name.startsWith("PARTNER_"));

export function isAiAssistedAuditsEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return env.AI_ASSISTED_AUDITS_ENABLED?.trim().toLowerCase() === "true";
}

type AuditQualityFlag =
  | "AUDIT_VALIDATION_PIPELINE_V2_ENABLED"
  | "AUDIT_AI_FINDING_REVIEW_ENABLED"
  | "AUDIT_RENDERED_FETCH_FALLBACK_ENABLED"
  | "AUDIT_PLAIN_LANGUAGE_V2_ENABLED"
  | "AUDIT_TARGETED_VERIFICATION_V1_ENABLED";

function auditQualityFlagEnabled(
  name: AuditQualityFlag,
  env: Record<string, string | undefined> = process.env,
  businessId?: string | null,
) {
  if (env[name]?.trim().toLowerCase() === "true") return true;
  if (!businessId) return false;
  const allowlist = env[`${name.replace(/_ENABLED$/, "")}_BUSINESS_IDS`]
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowlist?.includes(businessId) ?? false;
}

export function isAuditValidationPipelineV2Enabled(
  env: Record<string, string | undefined> = process.env,
  businessId?: string | null,
) {
  return auditQualityFlagEnabled(
    "AUDIT_VALIDATION_PIPELINE_V2_ENABLED",
    env,
    businessId,
  );
}

export function isAuditAiFindingReviewEnabled(
  env: Record<string, string | undefined> = process.env,
  businessId?: string | null,
) {
  return auditQualityFlagEnabled(
    "AUDIT_AI_FINDING_REVIEW_ENABLED",
    env,
    businessId,
  );
}

export function isAuditRenderedFetchFallbackEnabled(
  env: Record<string, string | undefined> = process.env,
  businessId?: string | null,
) {
  return auditQualityFlagEnabled(
    "AUDIT_RENDERED_FETCH_FALLBACK_ENABLED",
    env,
    businessId,
  );
}

export function isAuditPlainLanguageV2Enabled(
  env: Record<string, string | undefined> = process.env,
  businessId?: string | null,
) {
  return auditQualityFlagEnabled(
    "AUDIT_PLAIN_LANGUAGE_V2_ENABLED",
    env,
    businessId,
  );
}

export function isAuditTargetedVerificationV1Enabled(
  env: Record<string, string | undefined> = process.env,
  businessId?: string | null,
) {
  return auditQualityFlagEnabled(
    "AUDIT_TARGETED_VERIFICATION_V1_ENABLED",
    env,
    businessId,
  );
}

function enabled(
  name:
    | "SOCIAL_GROWTH_ENABLED"
    | "COMPETITOR_INTELLIGENCE_ENABLED"
    | "LOCAL_GROWTH_ENABLED",
  env: Record<string, string | undefined> = process.env,
) {
  return env[name]?.trim().toLowerCase() === "true";
}

export function isSocialGrowthEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return enabled("SOCIAL_GROWTH_ENABLED", env);
}

export function isCompetitorIntelligenceEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return enabled("COMPETITOR_INTELLIGENCE_ENABLED", env);
}

export function isLocalGrowthEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return enabled("LOCAL_GROWTH_ENABLED", env);
}

export function isWebsiteSeoLaunchScope(
  env: Record<string, string | undefined> = process.env,
) {
  return (
    !isSocialGrowthEnabled(env) &&
    !isCompetitorIntelligenceEnabled(env) &&
    !isLocalGrowthEnabled(env)
  );
}

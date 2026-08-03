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

export const featureFlagInventory = [
  {
    key: "partnerProgram",
    environmentVariable: "PARTNER_PROGRAM_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["/partners", "/partners/apply", "/dashboard/partner"],
    effect: "Controls partner applications, partner workspaces, and all partner subfeatures.",
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
    effect: "Allows signed first-touch referral attribution and checkout attribution.",
  },
  {
    key: "partnerCommissionCreation",
    environmentVariable: "PARTNER_COMMISSION_CREATION_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["Stripe webhook processing"],
    effect: "Allows new partner commissions to be created from verified Stripe events.",
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
    effect: "Allows creation and viewing of expiring, revocable prospect previews.",
  },
  {
    key: "partnerManualPayouts",
    environmentVariable: "PARTNER_MANUAL_PAYOUT_ENABLED",
    developmentDefault: false,
    productionDefault: false,
    routes: ["/dashboard/admin/partners/payouts"],
    effect: "Allows administrators to prepare, approve, and reconcile manual payouts.",
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
  featureFlagEnvironmentVariables.filter((name) =>
    name.startsWith("PARTNER_"),
  );

export function isAiAssistedAuditsEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return env.AI_ASSISTED_AUDITS_ENABLED?.trim().toLowerCase() === "true";
}

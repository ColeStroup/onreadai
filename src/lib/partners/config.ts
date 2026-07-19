import "server-only";

import type { PartnerProgramSettings, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const SETTINGS_KEY = "default";

function envBoolean(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function envInteger(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function approvedCountries() {
  const countries = (process.env.PARTNER_ALLOWED_COUNTRIES ?? "US")
    .split(",")
    .map((country) => country.trim().toUpperCase())
    .filter((country) => /^[A-Z]{2}$/.test(country));

  return countries.length > 0 ? [...new Set(countries)] : ["US"];
}

export function partnerProgramBootstrapDefaults(): Prisma.PartnerProgramSettingsCreateInput {
  return {
    key: SETTINGS_KEY,
    enabled: envBoolean("PARTNER_PROGRAM_ENABLED", false),
    applicationsOpen: envBoolean("PARTNER_APPLICATIONS_OPEN", false),
    referralAttributionEnabled: envBoolean(
      "PARTNER_REFERRAL_ATTRIBUTION_ENABLED",
      false,
    ),
    commissionCreationEnabled: envBoolean(
      "PARTNER_COMMISSION_CREATION_ENABLED",
      false,
    ),
    scannerEnabled: envBoolean("PARTNER_SCANNER_ENABLED", false),
    previewPagesEnabled: envBoolean("PARTNER_PREVIEW_PAGES_ENABLED", false),
    manualPayoutWorkflowEnabled: envBoolean(
      "PARTNER_MANUAL_PAYOUT_ENABLED",
      false,
    ),
    defaultCommissionRateBps: envInteger(
      "PARTNER_DEFAULT_COMMISSION_BPS",
      2_000,
      0,
      10_000,
    ),
    defaultRecurringCommissionMonths: envInteger(
      "PARTNER_RECURRING_COMMISSION_MONTHS",
      12,
      0,
      60,
    ),
    defaultReferralWindowDays: envInteger(
      "PARTNER_REFERRAL_WINDOW_DAYS",
      30,
      1,
      365,
    ),
    defaultCommissionHoldDays: envInteger(
      "PARTNER_COMMISSION_HOLD_DAYS",
      30,
      0,
      180,
    ),
    defaultMinimumPayoutCents: envInteger(
      "PARTNER_MINIMUM_PAYOUT_CENTS",
      5_000,
      0,
      1_000_000,
    ),
    defaultScannerDailyLimit: envInteger(
      "PARTNER_SCANNER_DAILY_LIMIT",
      25,
      0,
      1_000,
    ),
    defaultScannerMonthlyLimit: envInteger(
      "PARTNER_SCANNER_MONTHLY_LIMIT",
      500,
      0,
      25_000,
    ),
    scanCacheDays: envInteger("PARTNER_SCAN_CACHE_DAYS", 30, 1, 365),
    approvedCountries: approvedCountries(),
    currentTermsVersion: process.env.PARTNER_TERMS_VERSION?.trim() || "1.0",
    currentTrainingVersion:
      process.env.PARTNER_TRAINING_VERSION?.trim() || "1.0",
  };
}

export async function getPartnerProgramSettings(
  database: Pick<typeof prisma, "partnerProgramSettings"> = prisma,
): Promise<PartnerProgramSettings> {
  const existing = await database.partnerProgramSettings.findUnique({
    where: { key: SETTINGS_KEY },
  });

  if (existing) return existing;

  return database.partnerProgramSettings.upsert({
    where: { key: SETTINGS_KEY },
    create: partnerProgramBootstrapDefaults(),
    update: {},
  });
}

export function settingsCountries(settings: Pick<PartnerProgramSettings, "approvedCountries">) {
  return Array.isArray(settings.approvedCountries)
    ? settings.approvedCountries.filter(
        (country): country is string => typeof country === "string",
      )
    : [];
}

export function partnerCommunityUrl() {
  const value = process.env.PARTNER_COMMUNITY_URL?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

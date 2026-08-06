import "server-only";

import { createHash } from "node:crypto";

export const LEGACY_REPORT_VIEW_MODEL_VERSION =
  "audit-report-v3-normalized-facts";
export const REPORT_VIEW_MODEL_VERSION =
  "audit-report-v4-canonical-integrity";
export const SOCIAL_STRATEGY_GENERATOR_VERSION =
  "social-strategy-v3-business-model";
export const COMPETITOR_COMPARISON_VERSION = "competitor-comparison-v2";
export const SCORING_ENGINE_VERSION = "website-growth-score-v1";
export const WEBSITE_ANALYZER_VERSION = "website-analyzer-v4-content-quality";
export const SEO_ANALYZER_VERSION = "seo-analyzer-v3-guideline-quality";

export type DerivedFreshnessStatus =
  "CURRENT" | "STALE" | "PARTIAL" | "UNAVAILABLE";

export type DerivedFreshness = {
  status: DerivedFreshnessStatus;
  generatedAt: Date | null;
  sourceAuditId: string | null;
  dependencyFingerprint: string;
  storedDependencyFingerprint: string | null;
  generatorVersion: string;
  reason: string;
};

export function createDependencyFingerprint(value: unknown) {
  return createHash("sha256")
    .update(stableSerialize(value))
    .digest("hex")
    .slice(0, 24);
}

export function buildSocialStrategyDependencyFingerprint(input: {
  auditId: string;
  businessContext: Record<string, unknown>;
  goals: string[];
  primaryGoal?: string | null;
  profiles: Array<{
    id?: string;
    platform: string;
    status: string;
    url?: string | null;
    handle?: string | null;
    updatedAt?: Date | string | null;
  }>;
  googleBusinessProfiles: Array<{
    id?: string;
    status: string;
    rating?: number | null;
    reviewCount?: number | null;
    updatedAt?: Date | string | null;
  }>;
  competitors: Array<{
    id: string;
    profiles: Array<{
      platform: string;
      status: string;
      urlOrHandle?: string | null;
    }>;
    snapshotIds: string[];
  }>;
}) {
  return createDependencyFingerprint({
    generatorVersion: SOCIAL_STRATEGY_GENERATOR_VERSION,
    auditId: input.auditId,
    businessContext: input.businessContext,
    goals: [...input.goals].sort(),
    primaryGoal: input.primaryGoal ?? null,
    profiles: input.profiles
      .map((profile) => ({
        id: profile.id ?? null,
        platform: profile.platform,
        status: profile.status,
        url: profile.url ?? null,
        handle: profile.handle ?? null,
        updatedAt: dateValue(profile.updatedAt),
      }))
      .sort((a, b) =>
        `${a.platform}:${a.id}`.localeCompare(`${b.platform}:${b.id}`),
      ),
    googleBusinessProfiles: input.googleBusinessProfiles
      .map((profile) => ({
        id: profile.id ?? null,
        status: profile.status,
        rating: profile.rating ?? null,
        reviewCount: profile.reviewCount ?? null,
        updatedAt: dateValue(profile.updatedAt),
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    competitors: input.competitors
      .map((competitor) => ({
        id: competitor.id,
        profiles: competitor.profiles
          .map((profile) => ({
            platform: profile.platform,
            status: profile.status,
            urlOrHandle: profile.urlOrHandle ?? null,
          }))
          .sort((a, b) =>
            `${a.platform}:${a.urlOrHandle}`.localeCompare(
              `${b.platform}:${b.urlOrHandle}`,
            ),
          ),
        snapshotIds: [...competitor.snapshotIds].sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function buildCompetitorComparisonDependencyFingerprint(input: {
  businessAuditId: string;
  competitors: Array<{
    id: string;
    profiles: Array<{
      platform: string;
      status: string;
      urlOrHandle?: string | null;
    }>;
    snapshots: Array<{
      id: string;
      status?: string | null;
      scannedAt?: Date | string | null;
      updatedAt?: Date | string | null;
    }>;
  }>;
}) {
  return createDependencyFingerprint({
    generatorVersion: COMPETITOR_COMPARISON_VERSION,
    businessAuditId: input.businessAuditId,
    competitors: input.competitors
      .map((competitor) => ({
        id: competitor.id,
        profiles: competitor.profiles
          .map((profile) => ({
            platform: profile.platform,
            status: profile.status,
            urlOrHandle: profile.urlOrHandle ?? null,
          }))
          .sort((a, b) =>
            `${a.platform}:${a.urlOrHandle}`.localeCompare(
              `${b.platform}:${b.urlOrHandle}`,
            ),
          ),
        snapshots: competitor.snapshots
          .map((snapshot) => ({
            id: snapshot.id,
            status: snapshot.status ?? null,
            scannedAt: dateValue(snapshot.scannedAt),
            updatedAt: dateValue(snapshot.updatedAt),
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function assessDerivedFreshness({
  generatedAt,
  sourceAuditId,
  dependencyFingerprint,
  storedDependencyFingerprint,
  generatorVersion,
  storedGeneratorVersion,
  latestDependencyAt,
  contentValid = true,
}: {
  generatedAt?: Date | null;
  sourceAuditId?: string | null;
  dependencyFingerprint: string;
  storedDependencyFingerprint?: string | null;
  generatorVersion: string;
  storedGeneratorVersion?: string | null;
  latestDependencyAt?: Date | null;
  contentValid?: boolean;
}): DerivedFreshness {
  const base = {
    generatedAt: generatedAt ?? null,
    sourceAuditId: sourceAuditId ?? null,
    dependencyFingerprint,
    storedDependencyFingerprint: storedDependencyFingerprint ?? null,
    generatorVersion,
  };

  if (!generatedAt) {
    return {
      ...base,
      status: "UNAVAILABLE",
      reason: "No derived content has been generated.",
    };
  }

  if (!contentValid) {
    return {
      ...base,
      status: "STALE",
      reason:
        "Saved content is incompatible with the current business evidence.",
    };
  }

  if (storedGeneratorVersion && storedGeneratorVersion !== generatorVersion) {
    return {
      ...base,
      status: "STALE",
      reason: "The saved content was generated by an older strategy version.",
    };
  }

  if (
    storedDependencyFingerprint &&
    storedDependencyFingerprint === dependencyFingerprint
  ) {
    return {
      ...base,
      status: "CURRENT",
      reason: "All tracked dependencies match the saved generated content.",
    };
  }

  if (
    latestDependencyAt &&
    generatedAt.getTime() < latestDependencyAt.getTime()
  ) {
    return {
      ...base,
      status: "STALE",
      reason:
        "One or more source records changed after this content was generated.",
    };
  }

  if (!storedDependencyFingerprint) {
    return {
      ...base,
      status: "PARTIAL",
      reason:
        "This legacy record does not include a dependency fingerprint, so its freshness cannot be fully verified.",
    };
  }

  return {
    ...base,
    status: "STALE",
    reason: "The current dependency fingerprint differs from the saved record.",
  };
}

export function latestDate(values: Array<Date | string | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return latest;
    return !latest || date > latest ? date : latest;
  }, null);
}

function stableSerialize(value: unknown): string {
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function dateValue(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

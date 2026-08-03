import { ScoreCategory } from "@prisma/client";

export const WEBSITE_GROWTH_SCORING_VERSION = "website-growth-score-v1";
export const WEBSITE_GROWTH_SCORE_LABEL = "Website Growth Score";
export const LEGACY_SCORE_LABEL = "Legacy overall score";
export const LEGACY_SCORING_LABEL = "Legacy scoring model";

export const websiteSeoScoreCategories = [
  ScoreCategory.WEBSITE,
  ScoreCategory.SEO,
] as const;

export function isWebsiteSeoCategory(category: ScoreCategory) {
  return websiteSeoScoreCategories.includes(
    category as (typeof websiteSeoScoreCategories)[number],
  );
}

export function isWebsiteSeoReportCategory(category: ScoreCategory) {
  return category === ScoreCategory.OVERALL || isWebsiteSeoCategory(category);
}

export function isWebsiteGrowthScoringVersion(value?: string | null) {
  return value === WEBSITE_GROWTH_SCORING_VERSION;
}

export function scoringVersionFromSnapshot(snapshot: unknown) {
  if (!isRecord(snapshot) || !isRecord(snapshot.scoringMetadata)) return null;
  const value = snapshot.scoringMetadata.scoringEngineVersion;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isWebsiteGrowthAuditSnapshot(snapshot: unknown) {
  return isWebsiteGrowthScoringVersion(scoringVersionFromSnapshot(snapshot));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

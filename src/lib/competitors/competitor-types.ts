import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import { emptyWebsiteActionSummary } from "@/lib/analyzers/action-classifier";
import type { PrimaryCtaClarity } from "@/lib/audits/evidence-contracts";

export type CompetitorWebsiteSnapshot = {
  homepage: WebsiteAnalysis;
  crawl: WebsiteCrawlResult | null;
};

export type CompetitorSocialProfileEvidence = {
  platform: string;
  url: string | null;
  status: "confirmed" | "pending" | "detected";
  source: "saved_profile" | "website_detected";
};

export type CompetitorSocialSnapshot = {
  score: number;
  confirmedPlatforms: string[];
  pendingPlatforms: string[];
  detectedPlatforms: string[];
  profiles: CompetitorSocialProfileEvidence[];
  coverageLevel: "none" | "low" | "moderate" | "strong";
  platformCount: number;
  confirmedProfileCount?: number;
  pendingProfileCount?: number;
  detectedProfileCount?: number;
  observations: string[];
  limitations: string[];
};

export type CompetitorReviewSnapshot = {
  status:
    | "manually_confirmed"
    | "likely_match"
    | "possible_match"
    | "not_found"
    | "not_configured"
    | "error";
  applicability: "important" | "useful" | "optional";
  score: number | null;
  listingName: string | null;
  googlePlaceId: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  formattedAddress: string | null;
  phoneNumber: string | null;
  businessStatus: string | null;
  primaryType: string | null;
  matchConfidence: number | null;
  matchReasons: string[];
  source: "places_api" | "saved_profile" | "website_detected" | "none";
  searched: boolean;
  apiConfigured: boolean;
  note: string;
};

export type PositioningEvidence = {
  label: string;
  value: string;
  sourceUrl: string | null;
};

export type CompetitorPositioningSnapshot = {
  apparentBusinessDescription: string | null;
  apparentTargetAudience: string | null;
  mainOffer: string | null;
  positioningStatement: string | null;
  primaryConversionGoal: string | null;
  primaryCTA: string | null;
  primaryCtaClarity: PrimaryCtaClarity;
  detectedActionTypes: string[];
  secondaryCTAs: string[];
  keyDifferentiators: string[];
  detectedBusinessType: string;
  confidence: number;
  score: number;
  methodologyVersion: string;
  evidence: PositioningEvidence[];
  limitations: string[];
};

export type ComparisonCategory =
  | "website"
  | "seo"
  | "reviews"
  | "social"
  | "positioning";

export type ComparisonEvidence = {
  label: string;
  businessValue: string;
  competitorValue: string;
  sourceUrls: string[];
};

export type CategoryComparison = {
  competitorId: string;
  competitorName: string;
  category: ComparisonCategory;
  businessScore: number | null;
  competitorScore: number | null;
  businessDisplay: string;
  competitorDisplay: string;
  status:
    | "business_stronger"
    | "competitor_stronger"
    | "similar"
    | "needs_attention"
    | "not_comparable"
    | "not_applicable"
    | "data_unavailable";
  observation: string;
  evidence: ComparisonEvidence[];
};

export type ComparisonStatement = {
  id: string;
  competitorId: string;
  competitorName: string;
  category: ComparisonCategory;
  title: string;
  description: string;
  confidence: "high" | "medium";
  evidence: ComparisonEvidence[];
};

export type CompetitorComparisonResult = {
  analyzedCompetitorCount: number;
  staleCompetitorCount: number;
  failedCompetitorCount: number;
  savedButUnanalyzedCount: number;
  categoryComparisons: CategoryComparison[];
  businessAdvantages: ComparisonStatement[];
  competitorAdvantages: ComparisonStatement[];
  parityAreas: ComparisonStatement[];
  opportunities: ComparisonStatement[];
  risks: ComparisonStatement[];
  evidence: ComparisonEvidence[];
  freshness: Array<{
    competitorId: string;
    competitorName: string;
    snapshotId: string | null;
    status: "current" | "stale" | "partial" | "failed" | "not_analyzed";
    scannedAt: string | null;
  }>;
  limitations: string[];
  generatedAt: string;
};

export type CompetitorIntelligenceSummary = {
  executiveSummary: string;
  topBusinessAdvantages: string[];
  topCompetitorAdvantages: string[];
  topOpportunities: string[];
  recommendedResponses: string[];
  questionsToInvestigate: string[];
  limitations: string[];
  source: "ai_generated" | "deterministic_fallback";
};

export type AuditCompetitorIntelligence = {
  snapshotIds: string[];
  competitorNames: string[];
  comparison: CompetitorComparisonResult;
  summary: CompetitorIntelligenceSummary;
  generatedAt: string;
  limitations: string[];
};

export function asCompetitorWebsiteSnapshot(
  value: unknown,
): CompetitorWebsiteSnapshot | null {
  if (!isRecord(value) || !isRecord(value.homepage)) {
    return null;
  }

  const homepage = value.homepage;
  if (
    !isFiniteNumber(homepage.score) ||
    typeof homepage.normalizedUrl !== "string" ||
    !isFiniteNumber(homepage.h1Count) ||
    !isStringArray(homepage.h1Text)
  ) {
    return null;
  }

  const emptyActions = emptyWebsiteActionSummary();
  const rawActions = isRecord(homepage.actionSummary)
    ? homepage.actionSummary
    : {};
  const primaryCtaAssessment =
    isRecord(rawActions.primaryCtaAssessment) &&
    typeof rawActions.primaryCtaAssessment.clarity === "string" &&
    Array.isArray(rawActions.primaryCtaAssessment.evidence)
      ? rawActions.primaryCtaAssessment
      : emptyActions.primaryCtaAssessment;
  const actionSummary = {
    ...emptyActions,
    ...rawActions,
    detectedActionTypes: stringArray(rawActions.detectedActionTypes),
    detectedActionLinks: Array.isArray(rawActions.detectedActionLinks)
      ? rawActions.detectedActionLinks
      : [],
    primaryActions: stringArray(rawActions.primaryActions),
    secondaryNavigation: stringArray(rawActions.secondaryNavigation),
    socialLinks: stringArray(rawActions.socialLinks),
    eventLinks: stringArray(rawActions.eventLinks),
    utilityLinks: stringArray(rawActions.utilityLinks),
    rawCandidates: stringArray(rawActions.rawCandidates),
    primaryCtaAssessment,
  } as WebsiteAnalysis["actionSummary"];
  const crawl = normalizeWebsiteCrawl(value.crawl);

  return {
    homepage: {
      ...homepage,
      normalizedUrl: homepage.normalizedUrl,
      pageTitle: nullableString(homepage.pageTitle),
      metaDescription: nullableString(homepage.metaDescription),
      h1Count: homepage.h1Count,
      h1Text: homepage.h1Text,
      detectedSocialLinks: stringArray(homepage.detectedSocialLinks),
      detectedGoogleMapsLinks: stringArray(homepage.detectedGoogleMapsLinks),
      detectedMapEmbeds: stringArray(homepage.detectedMapEmbeds),
      detectedLocalBusinessSchema: Array.isArray(
        homepage.detectedLocalBusinessSchema,
      )
        ? homepage.detectedLocalBusinessSchema
        : [],
      operatingHoursSignals: stringArray(homepage.operatingHoursSignals),
      ctaCandidates: stringArray(homepage.ctaCandidates),
      actionSummary,
      warnings: stringArray(homepage.warnings),
      score: homepage.score,
    } as WebsiteAnalysis,
    crawl,
  };
}

export function asSeoAnalysis(value: unknown): SeoAnalysis | null {
  if (!isRecord(value) || !isFiniteNumber(value.score)) return null;

  return {
    score: value.score,
    titleStatus: seoQualityStatus(value.titleStatus),
    titleLength: finiteNumber(value.titleLength),
    metaDescriptionStatus: seoQualityStatus(value.metaDescriptionStatus),
    metaDescriptionLength: finiteNumber(value.metaDescriptionLength),
    h1Status: seoQualityStatus(value.h1Status),
    canonicalStatus: seoQualityStatus(value.canonicalStatus),
    viewportStatus: seoQualityStatus(value.viewportStatus),
    robotsTxtStatus: seoFileStatus(value.robotsTxtStatus),
    sitemapStatus: seoFileStatus(value.sitemapStatus),
    indexabilityWarnings: stringArray(value.indexabilityWarnings),
    seoWarnings: stringArray(value.seoWarnings),
    seoStrengths: stringArray(value.seoStrengths),
    recommendedFixes: stringArray(value.recommendedFixes),
  };
}

export function asCompetitorSocialSnapshot(
  value: unknown,
): CompetitorSocialSnapshot | null {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.score) ||
    !Array.isArray(value.profiles) ||
    !isCoverageLevel(value.coverageLevel)
  ) {
    return null;
  }

  const profiles = value.profiles.flatMap(
    (profile): CompetitorSocialProfileEvidence[] => {
    if (
      !isRecord(profile) ||
      typeof profile.platform !== "string" ||
      !["confirmed", "pending", "detected"].includes(String(profile.status))
    ) {
      return [];
    }

      const source: CompetitorSocialProfileEvidence["source"] =
        profile.source === "saved_profile" ||
        profile.source === "website_detected"
          ? profile.source
          : profile.status === "detected"
            ? "website_detected"
            : "saved_profile";

      return [
      {
        platform: profile.platform,
        url: nullableString(profile.url),
        status: profile.status as CompetitorSocialProfileEvidence["status"],
        source,
      },
      ];
    },
  );
  const malformedProfiles = profiles.length !== value.profiles.length;

  return {
    score: value.score,
    confirmedPlatforms: stringArray(value.confirmedPlatforms),
    pendingPlatforms: stringArray(value.pendingPlatforms),
    detectedPlatforms: stringArray(value.detectedPlatforms),
    profiles,
    coverageLevel: value.coverageLevel,
    platformCount: isFiniteNumber(value.platformCount)
      ? value.platformCount
      : profiles.length,
    confirmedProfileCount: optionalFiniteNumber(value.confirmedProfileCount),
    pendingProfileCount: optionalFiniteNumber(value.pendingProfileCount),
    detectedProfileCount: optionalFiniteNumber(value.detectedProfileCount),
    observations: stringArray(value.observations),
    limitations: uniqueStrings([
      ...stringArray(value.limitations),
      ...(malformedProfiles
        ? [
            "Some saved social-profile evidence was unavailable because its stored shape was invalid.",
          ]
        : []),
    ]),
  };
}

export function asCompetitorReviewSnapshot(
  value: unknown,
): CompetitorReviewSnapshot | null {
  if (!isRecord(value) || !isReviewStatus(value.status)) return null;

  return {
    status: value.status,
    applicability: isReviewApplicability(value.applicability)
      ? value.applicability
      : "useful",
    score: nullableFiniteNumber(value.score),
    listingName: nullableString(value.listingName),
    googlePlaceId: nullableString(value.googlePlaceId),
    googleMapsUri: nullableString(value.googleMapsUri),
    rating: nullableFiniteNumber(value.rating),
    reviewCount: nullableFiniteNumber(value.reviewCount),
    formattedAddress: nullableString(value.formattedAddress),
    phoneNumber: nullableString(value.phoneNumber),
    businessStatus: nullableString(value.businessStatus),
    primaryType: nullableString(value.primaryType),
    matchConfidence: nullableFiniteNumber(value.matchConfidence),
    matchReasons: stringArray(value.matchReasons),
    source: isReviewSource(value.source) ? value.source : "none",
    searched: value.searched === true,
    apiConfigured: value.apiConfigured === true,
    note:
      typeof value.note === "string"
        ? value.note
        : "Comparable public review details are unavailable.",
  };
}

export function asCompetitorPositioningSnapshot(
  value: unknown,
): CompetitorPositioningSnapshot | null {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.score) ||
    !Array.isArray(value.evidence)
  ) {
    return null;
  }

  const legacy = value;
  const legacyScore = value.score;
  const hasExplicitAssessment = isPrimaryCtaClarity(
    legacy.primaryCtaClarity,
  );
  const primaryCtaClarity = hasExplicitAssessment
    ? (legacy.primaryCtaClarity as PrimaryCtaClarity)
    : "UNCERTAIN";
  const detectedActionTypes = Array.isArray(legacy.detectedActionTypes)
    ? stringArray(legacy.detectedActionTypes)
    : [legacy.primaryCTA, ...stringArray(legacy.secondaryCTAs)].filter(
        (item): item is string => Boolean(item),
      );
  const confidence = finiteNumber(legacy.confidence);
  const evidence = value.evidence.flatMap((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.label !== "string" ||
      typeof item.value !== "string"
    ) {
      return [];
    }
    return [
      {
        label: item.label,
        value: item.value,
        sourceUrl: nullableString(item.sourceUrl),
      },
    ];
  });

  return {
    apparentBusinessDescription: nullableString(
      legacy.apparentBusinessDescription,
    ),
    apparentTargetAudience: nullableString(legacy.apparentTargetAudience),
    mainOffer: nullableString(legacy.mainOffer),
    positioningStatement: nullableString(legacy.positioningStatement),
    primaryConversionGoal:
      primaryCtaClarity === "CLEAR"
        ? nullableString(legacy.primaryConversionGoal)
        : null,
    primaryCTA:
      primaryCtaClarity === "CLEAR" ? nullableString(legacy.primaryCTA) : null,
    primaryCtaClarity,
    detectedActionTypes: [...new Set(detectedActionTypes)],
    secondaryCTAs: stringArray(legacy.secondaryCTAs),
    keyDifferentiators: stringArray(legacy.keyDifferentiators),
    detectedBusinessType:
      typeof legacy.detectedBusinessType === "string"
        ? legacy.detectedBusinessType
        : "Unknown",
    score: hasExplicitAssessment
      ? legacyScore
      : Math.max(0, legacyScore - 12),
    confidence: hasExplicitAssessment
      ? confidence
      : Math.min(confidence, 60),
    methodologyVersion:
      typeof legacy.methodologyVersion === "string"
        ? legacy.methodologyVersion
        :
      "competitor-positioning-v1-legacy-action-links",
    evidence,
    limitations: [
      ...stringArray(legacy.limitations),
      ...(!hasExplicitAssessment
        ? [
            "This legacy snapshot detected action links but did not independently assess primary CTA clarity.",
          ]
        : []),
    ],
  };
}

function isPrimaryCtaClarity(value: unknown): value is PrimaryCtaClarity {
  return [
    "CLEAR",
    "NEEDS_IMPROVEMENT",
    "UNCERTAIN",
    "NOT_ASSESSED",
    "NOT_APPLICABLE",
  ].includes(String(value));
}

export function getAuditCompetitorIntelligence(
  value: unknown,
): AuditCompetitorIntelligence | null {
  if (!isRecord(value) || !isRecord(value.competitorIntelligence)) {
    return null;
  }

  const intelligence = value.competitorIntelligence;

  return isRecord(intelligence.comparison) && isRecord(intelligence.summary)
    ? (intelligence as unknown as AuditCompetitorIntelligence)
    : null;
}

export function trustedBusinessAdvantages(
  comparison: CompetitorComparisonResult,
) {
  return comparison.businessAdvantages.filter((statement) =>
    hasComparableSupportingRow(comparison, statement, "business_stronger"),
  );
}

export function trustedCompetitorAdvantages(
  comparison: CompetitorComparisonResult,
) {
  return comparison.competitorAdvantages.filter((statement) =>
    hasComparableSupportingRow(comparison, statement, "competitor_stronger"),
  );
}

function hasComparableSupportingRow(
  comparison: CompetitorComparisonResult,
  statement: ComparisonStatement,
  expectedStatus: CategoryComparison["status"],
) {
  const row = comparison.categoryComparisons.find(
    (item) =>
      item.competitorId === statement.competitorId &&
      item.category === statement.category,
  );

  return Boolean(
    row &&
      row.status === expectedStatus &&
      !/^data unavailable$/i.test(row.businessDisplay) &&
      !/^data unavailable$/i.test(row.competitorDisplay),
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeWebsiteCrawl(value: unknown): WebsiteCrawlResult | null {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    !Array.isArray(value.pageResults) ||
    !isFiniteNumber(value.pagesScanned) ||
    !isStringArray(value.importantPagesFound)
  ) {
    return null;
  }
  return value as unknown as WebsiteCrawlResult;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteNumber(value: unknown) {
  return isFiniteNumber(value) ? value : 0;
}

function optionalFiniteNumber(value: unknown) {
  return isFiniteNumber(value) ? value : undefined;
}

function nullableFiniteNumber(value: unknown) {
  return isFiniteNumber(value) ? value : null;
}

function seoQualityStatus(value: unknown): SeoAnalysis["titleStatus"] {
  return ["good", "missing", "too_short", "too_long", "multiple", "unknown"].includes(
    String(value),
  )
    ? (value as SeoAnalysis["titleStatus"])
    : "unknown";
}

function seoFileStatus(value: unknown): SeoAnalysis["robotsTxtStatus"] {
  return [
    "found",
    "missing",
    "blocked",
    "timeout",
    "unreachable",
    "unknown",
  ].includes(String(value))
    ? (value as SeoAnalysis["robotsTxtStatus"])
    : "unknown";
}

function isCoverageLevel(
  value: unknown,
): value is CompetitorSocialSnapshot["coverageLevel"] {
  return ["none", "low", "moderate", "strong"].includes(String(value));
}

function isReviewStatus(
  value: unknown,
): value is CompetitorReviewSnapshot["status"] {
  return [
    "manually_confirmed",
    "likely_match",
    "possible_match",
    "not_found",
    "not_configured",
    "error",
  ].includes(String(value));
}

function isReviewApplicability(
  value: unknown,
): value is CompetitorReviewSnapshot["applicability"] {
  return ["important", "useful", "optional"].includes(String(value));
}

function isReviewSource(
  value: unknown,
): value is CompetitorReviewSnapshot["source"] {
  return ["places_api", "saved_profile", "website_detected", "none"].includes(
    String(value),
  );
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

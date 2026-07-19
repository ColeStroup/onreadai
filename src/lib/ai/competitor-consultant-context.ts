import "server-only";

import {
  BusinessProfileStatus,
  CompetitorSnapshotStatus,
  ProfilePlatform,
  ScoreCategory,
} from "@prisma/client";

import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import {
  asCompetitorPositioningSnapshot,
  asCompetitorReviewSnapshot,
  asCompetitorSocialSnapshot,
  asCompetitorWebsiteSnapshot,
  asSeoAnalysis,
  type CompetitorComparisonResult,
  type ComparisonEvidence,
} from "@/lib/competitors/competitor-types";
import { buildCurrentCompetitorComparison } from "@/lib/competitors/current-comparison";
import type { ConsultantDiagnostics } from "@/lib/observability/consultant-diagnostics";

export type CompetitorSectionState =
  | "complete"
  | "needs_confirmation"
  | "unavailable"
  | "inferred";

export type CompetitorConsultantSnapshot = {
  competitorId: string;
  competitorName: string;
  websiteUrl: string | null;
  latestSnapshotId: string | null;
  usableSnapshotId: string | null;
  latestSnapshotStatus:
    | "pending"
    | "running"
    | "completed"
    | "partial"
    | "failed"
    | "not_analyzed";
  freshnessState: "current" | "stale" | "partial" | "failed" | "not_analyzed";
  scannedAt: string | null;
  pagesScanned: number;
  completedSections: string[];
  failedSections: string[];
  sections: {
    website: CompetitorSectionState;
    seo: CompetitorSectionState;
    social: CompetitorSectionState;
    reviews: CompetitorSectionState;
    positioning: CompetitorSectionState;
  };
  website: {
    score: number;
    pageTitle: string | null;
    headline: string | null;
    primaryActions: string[];
    importantPages: string[];
    pagesScanned: number;
    sourceUrl: string;
  } | null;
  seo: {
    score: number;
    titleStatus: string;
    metaDescriptionStatus: string;
    h1Status: string;
    canonicalStatus: string;
    robotsTxtStatus: string;
    sitemapStatus: string;
    sitewideIssueCount: number | null;
  } | null;
  social: {
    confirmedProfiles: Array<{ platform: string; url: string | null }>;
    pendingProfiles: Array<{ platform: string; url: string | null }>;
    detectedProfiles: Array<{ platform: string; url: string | null }>;
    confirmedPlatforms: string[];
    pendingPlatforms: string[];
    detectedPlatforms: string[];
    limitations: string[];
  };
  reviews: {
    listingConfirmationStatus: "confirmed" | "pending" | "not_confirmed";
    analysisStatus: string;
    rating: number | null;
    reviewCount: number | null;
    listingName: string | null;
    mapsUrl: string | null;
    comparableMetricsAvailable: boolean;
    note: string;
  };
  positioning: {
    apparentBusinessDescription: string | null;
    apparentTargetAudience: string | null;
    mainOffer: string | null;
    primaryConversionGoal: string | null;
    primaryCTA: string | null;
    primaryCtaClarity?: string;
    detectedActionTypes?: string[];
    secondaryCTAs: string[];
    differentiators: string[];
    confidence: "low" | "moderate" | "high";
    note: string;
  } | null;
  evidence: ComparisonEvidence[];
  limitations: string[];
};

export type CompetitorConsultantContext = {
  businessId: string;
  businessName: string;
  configuredCompetitors: number;
  analyzedCompetitors: number;
  unscannedCompetitors: string[];
  staleCompetitors: string[];
  partialCompetitors: string[];
  failedCompetitors: string[];
  latestSnapshots: CompetitorConsultantSnapshot[];
  currentComparison: CompetitorComparisonResult | null;
  comparisonSource: "live_rebuilt" | "audit_historical_fallback" | "unavailable";
  primaryBusinessEvidence: {
    latestAuditAt: string | null;
    contextUpdatedAt: string | null;
    businessContext: {
      description: string | null;
      targetAudience: string | null;
      mainOffer: string | null;
      businessType: string | null;
      primaryConversionGoal: string | null;
    };
    goals: string[];
    primaryGoal: string | null;
    confirmedProfiles: string[];
    pendingProfiles: string[];
    social: {
      confirmedProfileCount: number;
      pendingProfileCount: number;
      confirmedPlatforms: string[];
      pendingPlatforms: string[];
    };
    reviews: {
      googleBusinessStatus: string;
      rating: number | null;
      reviewCount: number | null;
      mapsUrl: string | null;
    };
    website: {
      score: number | null;
      pageTitle: string | null;
      headline: string | null;
      h1Count: number;
      primaryActions: string[];
      secondaryNavigation: string[];
      eventLinks: string[];
      pagesScanned: number;
    } | null;
    seo: {
      score: number | null;
      titleStatus: string;
      metaDescriptionStatus: string;
      h1Status: string;
      canonicalStatus: string;
      robotsTxtStatus: string;
      sitemapStatus: string;
      recommendedFixes: string[];
    } | null;
  };
  freshness: {
    builtAt: string;
    primaryAuditAt: string | null;
    newestCompetitorSnapshotAt: string | null;
    competitorDataNewerThanAudit: string[];
  };
  limitations: string[];
};

export async function buildCompetitorConsultantContext({
  userId,
  businessId,
  auditId,
  diagnostics,
}: {
  userId: string;
  businessId: string;
  auditId?: string;
  diagnostics?: ConsultantDiagnostics;
}): Promise<CompetitorConsultantContext | null> {
  diagnostics?.started("COMPETITOR_CONTEXT_BUILD");
  let current;

  try {
    current = await buildCurrentCompetitorComparison({
      businessId,
      ownerId: userId,
      auditId,
      diagnostics,
    });
  } catch (error) {
    diagnostics?.failed("COMPETITOR_CONTEXT_BUILD", error);
    throw error;
  }

  if (!current) {
    diagnostics?.completed("COMPETITOR_CONTEXT_BUILD", {
      contextAvailable: false,
      configuredCompetitors: 0,
    });
    return null;
  }

  const comparison = current.comparison;
  const historicalComparison = current.savedIntelligence?.comparison ?? null;
  const activeNames = new Set(
    current.activeCompetitors.map((competitor) => competitor.name),
  );
  const historicalMatchesCurrentCompetitor =
    historicalComparison?.freshness.some((item) =>
      activeNames.has(item.competitorName),
    ) ?? false;
  const useHistoricalFallback =
    !comparison && Boolean(historicalComparison && historicalMatchesCurrentCompetitor);
  const effectiveComparison =
    comparison ?? (useHistoricalFallback ? historicalComparison : null);
  const latestAuditAt =
    current.latestAudit?.completedAt ?? current.latestAudit?.createdAt ?? null;
  const primaryWebsite = snapshotSection<WebsiteAnalysis>(
    current.latestAudit?.analysisSnapshot,
    "website",
    (value) => typeof value.score === "number",
  );
  const primaryWebsiteCrawl = snapshotSection<WebsiteCrawlResult>(
    current.latestAudit?.analysisSnapshot,
    "websiteCrawl",
    (value) => Array.isArray(value.pageResults),
  );
  const primarySeo = snapshotSection<SeoAnalysis>(
    current.latestAudit?.analysisSnapshot,
    "seo",
    (value) => typeof value.score === "number",
  );
  const snapshots = current.activeCompetitors.map((competitor) => {
    const latestSnapshot = competitor.snapshots.at(0) ?? null;
    const usableSnapshot = competitor.snapshots.find(
      (snapshot) =>
        snapshot.status === CompetitorSnapshotStatus.COMPLETED ||
        snapshot.status === CompetitorSnapshotStatus.PARTIAL,
    );
    const freshness = effectiveComparison?.freshness.find(
      (item) => item.competitorId === competitor.id,
    );
    const website = asCompetitorWebsiteSnapshot(
      usableSnapshot?.websiteSnapshot,
    );
    const seo = asSeoAnalysis(usableSnapshot?.seoSnapshot);
    const social = asCompetitorSocialSnapshot(
      usableSnapshot?.socialSnapshot,
    );
    const reviews = asCompetitorReviewSnapshot(
      usableSnapshot?.reviewsSnapshot,
    );
    const positioning = asCompetitorPositioningSnapshot(
      usableSnapshot?.positioningSnapshot,
    );
    const liveSocialProfiles = competitor.discoveredProfiles.filter(
      (profile) => isSocialPlatform(profile.platform),
    );
    const confirmedProfiles = liveSocialProfiles
      .filter((profile) => profile.status === BusinessProfileStatus.CONFIRMED)
      .map((profile) => ({
        platform: platformLabel(profile.platform),
        url: profile.urlOrHandle,
      }));
    const pendingProfiles = liveSocialProfiles
      .filter((profile) => profile.status === BusinessProfileStatus.PENDING)
      .map((profile) => ({
        platform: platformLabel(profile.platform),
        url: profile.urlOrHandle,
      }));
    const liveProfileValues = new Set(
      liveSocialProfiles.map((profile) => comparableProfileValue(profile.urlOrHandle)),
    );
    const detectedProfiles =
      social?.profiles
        .filter(
          (profile) =>
            profile.status === "detected" &&
            !liveProfileValues.has(comparableProfileValue(profile.url)),
        )
        .map((profile) => ({
          platform: profile.platform,
          url: profile.url,
        })) ?? [];
    const googleProfiles = competitor.discoveredProfiles.filter(
      (profile) => profile.platform === ProfilePlatform.GOOGLE_BUSINESS,
    );
    const listingConfirmationStatus = googleProfiles.some(
      (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
    )
      ? "confirmed"
      : googleProfiles.some(
            (profile) => profile.status === BusinessProfileStatus.PENDING,
          )
        ? "pending"
        : "not_confirmed";
    const completedSections = stringArray(usableSnapshot?.completedSections);
    const failedSections = stringArray(usableSnapshot?.failedSections);
    const rows =
      effectiveComparison?.categoryComparisons.filter(
        (row) => row.competitorId === competitor.id,
      ) ?? [];
    const snapshotLimitations = unique([
      ...(social?.limitations ?? []),
      ...(positioning?.limitations ?? []),
      ...(freshness?.status === "stale"
        ? ["The latest usable public snapshot is stale."]
        : []),
      ...(latestSnapshot?.status === CompetitorSnapshotStatus.FAILED &&
      usableSnapshot
        ? ["The most recent refresh failed, so an older usable snapshot is shown."]
        : []),
      ...(failedSections.length > 0
        ? [`Unavailable analyzer sections: ${failedSections.join(", ")}.`]
        : []),
    ]);

    return {
      competitorId: competitor.id,
      competitorName: competitor.name,
      websiteUrl: competitor.websiteUrl,
      latestSnapshotId: latestSnapshot?.id ?? null,
      usableSnapshotId: usableSnapshot?.id ?? null,
      latestSnapshotStatus: snapshotStatus(latestSnapshot?.status),
      freshnessState: freshness?.status ?? "not_analyzed",
      scannedAt: usableSnapshot?.scannedAt?.toISOString() ?? null,
      pagesScanned:
        website?.crawl?.pagesScanned ?? (website?.homepage ? 1 : 0),
      completedSections,
      failedSections,
      sections: {
        website: website ? "complete" : "unavailable",
        seo: seo ? "complete" : "unavailable",
        social: social
          ? pendingProfiles.length > 0 || detectedProfiles.length > 0
            ? "needs_confirmation"
            : "complete"
          : "unavailable",
        reviews:
          reviews?.rating !== null && reviews?.rating !== undefined
            ? "complete"
            : listingConfirmationStatus === "pending"
              ? "needs_confirmation"
              : "unavailable",
        positioning: positioning ? "inferred" : "unavailable",
      },
      website: website
        ? {
            score: website.homepage.score,
            pageTitle: website.homepage.pageTitle,
            headline: website.homepage.h1Text.at(0) ?? null,
            primaryActions: website.homepage.actionSummary.primaryActions.slice(
              0,
              6,
            ),
            importantPages: website.crawl?.importantPagesFound.slice(0, 10) ?? [],
            pagesScanned:
              website.crawl?.pagesScanned ?? (website.homepage ? 1 : 0),
            sourceUrl: website.homepage.normalizedUrl,
          }
        : null,
      seo: seo
        ? {
            score: seo.score,
            titleStatus: seo.titleStatus,
            metaDescriptionStatus: seo.metaDescriptionStatus,
            h1Status: seo.h1Status,
            canonicalStatus: seo.canonicalStatus,
            robotsTxtStatus: seo.robotsTxtStatus,
            sitemapStatus: seo.sitemapStatus,
            sitewideIssueCount: website?.crawl
              ? website.crawl.pagesMissingTitle +
                website.crawl.pagesMissingMetaDescription +
                website.crawl.pagesWithNoH1 +
                website.crawl.pagesWithMultipleH1
              : null,
          }
        : null,
      social: {
        confirmedProfiles,
        pendingProfiles,
        detectedProfiles,
        confirmedPlatforms: unique(
          confirmedProfiles.map((profile) => profile.platform),
        ),
        pendingPlatforms: unique(
          pendingProfiles.map((profile) => profile.platform),
        ),
        detectedPlatforms: unique(
          detectedProfiles.map((profile) => profile.platform),
        ),
        limitations: social?.limitations ?? [
          "Individual posts and engagement metrics were not analyzed.",
        ],
      },
      reviews: {
        listingConfirmationStatus,
        analysisStatus: reviews?.status ?? "unavailable",
        rating: reviews?.rating ?? null,
        reviewCount: reviews?.reviewCount ?? null,
        listingName: reviews?.listingName ?? null,
        mapsUrl: reviews?.googleMapsUri ?? null,
        comparableMetricsAvailable: Boolean(
          reviews &&
            (reviews.rating !== null || reviews.reviewCount !== null),
        ),
        note:
          reviews?.note ??
          "Comparable public Google rating and review-count data is unavailable.",
      },
      positioning: positioning
        ? {
            apparentBusinessDescription:
              positioning.apparentBusinessDescription,
            apparentTargetAudience: positioning.apparentTargetAudience,
            mainOffer: positioning.mainOffer,
            primaryConversionGoal: positioning.primaryConversionGoal,
            primaryCTA: positioning.primaryCTA,
            primaryCtaClarity: positioning.primaryCtaClarity,
            detectedActionTypes: positioning.detectedActionTypes.slice(0, 8),
            secondaryCTAs: positioning.secondaryCTAs.slice(0, 5),
            differentiators: positioning.keyDifferentiators.slice(0, 5),
            confidence: confidenceLabel(positioning.confidence),
            note:
              "Positioning is a heuristic interpretation of public homepage and crawl evidence, not an objective performance score.",
          }
        : null,
      evidence: rows.flatMap((row) => row.evidence).slice(0, 12),
      limitations: snapshotLimitations,
    } satisfies CompetitorConsultantSnapshot;
  });
  const newestCompetitorSnapshotAt = snapshots
    .map((snapshot) => snapshot.scannedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const competitorDataNewerThanAudit = latestAuditAt
    ? snapshots
        .filter(
          (snapshot) =>
            snapshot.scannedAt &&
            new Date(snapshot.scannedAt).getTime() >
              latestAuditAt.getTime() + 60_000,
        )
        .map((snapshot) => snapshot.competitorName)
    : [];
  const freshnessByName = new Map(
    effectiveComparison?.freshness.map((item) => [
      item.competitorName,
      item.status,
    ]) ?? [],
  );
  const failedCompetitors = snapshots
    .filter(
      (snapshot) =>
        snapshot.latestSnapshotStatus === "failed" ||
        freshnessByName.get(snapshot.competitorName) === "failed",
    )
    .map((snapshot) => snapshot.competitorName);
  const primaryConfirmedProfiles = current.business.profiles.filter(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const primaryPendingProfiles = current.business.profiles.filter(
    (profile) => profile.status === BusinessProfileStatus.PENDING,
  );

  const context = {
    businessId: current.business.id,
    businessName: current.business.name,
    configuredCompetitors: current.activeCompetitors.length,
    analyzedCompetitors: effectiveComparison?.analyzedCompetitorCount ?? 0,
    unscannedCompetitors: snapshots
      .filter((snapshot) => snapshot.freshnessState === "not_analyzed")
      .map((snapshot) => snapshot.competitorName),
    staleCompetitors: snapshots
      .filter((snapshot) => snapshot.freshnessState === "stale")
      .map((snapshot) => snapshot.competitorName),
    partialCompetitors: snapshots
      .filter((snapshot) => snapshot.freshnessState === "partial")
      .map((snapshot) => snapshot.competitorName),
    failedCompetitors: unique(failedCompetitors),
    latestSnapshots: snapshots,
    currentComparison: effectiveComparison,
    comparisonSource: comparison
      ? "live_rebuilt"
      : useHistoricalFallback
        ? "audit_historical_fallback"
        : "unavailable",
    primaryBusinessEvidence: {
      latestAuditAt: latestAuditAt?.toISOString() ?? null,
      contextUpdatedAt:
        current.business.contextUpdatedAt?.toISOString() ?? null,
      businessContext: {
        description: current.business.description,
        targetAudience: current.business.targetAudience,
        mainOffer: current.business.mainOffer,
        businessType: current.business.businessType,
        primaryConversionGoal: current.business.primaryConversionGoal,
      },
      goals: current.business.goals,
      primaryGoal: current.business.primaryGoal,
      confirmedProfiles: primaryConfirmedProfiles.map(
        (profile) => platformLabel(profile.platform),
      ),
      pendingProfiles: primaryPendingProfiles.map((profile) =>
        platformLabel(profile.platform),
      ),
      social: {
        confirmedProfileCount: current.currentSocial.confirmedProfilesCount,
        pendingProfileCount: current.currentSocial.pendingProfilesCount,
        confirmedPlatforms: current.currentSocial.confirmedPlatforms,
        pendingPlatforms: current.currentSocial.pendingPlatforms,
      },
      reviews: {
        googleBusinessStatus: current.currentReviews.googleBusinessStatus,
        rating: current.currentReviews.googleRating,
        reviewCount: current.currentReviews.googleReviewCount,
        mapsUrl: current.currentReviews.googleMapsUri,
      },
      website: primaryWebsite
        ? {
            score: auditScore(current.latestAudit?.scores, ScoreCategory.WEBSITE),
            pageTitle: primaryWebsite.pageTitle,
            headline: primaryWebsite.h1Text.at(0) ?? null,
            h1Count: primaryWebsite.h1Count,
            primaryActions: primaryWebsite.actionSummary.primaryActions.slice(
              0,
              8,
            ),
            secondaryNavigation:
              primaryWebsite.actionSummary.secondaryNavigation.slice(0, 8),
            eventLinks: primaryWebsite.actionSummary.eventLinks.slice(0, 8),
            pagesScanned:
              primaryWebsiteCrawl?.pagesScanned ?? (primaryWebsite ? 1 : 0),
          }
        : null,
      seo: primarySeo
        ? {
            score: auditScore(current.latestAudit?.scores, ScoreCategory.SEO),
            titleStatus: primarySeo.titleStatus,
            metaDescriptionStatus: primarySeo.metaDescriptionStatus,
            h1Status: primarySeo.h1Status,
            canonicalStatus: primarySeo.canonicalStatus,
            robotsTxtStatus: primarySeo.robotsTxtStatus,
            sitemapStatus: primarySeo.sitemapStatus,
            recommendedFixes: primarySeo.recommendedFixes.slice(0, 8),
          }
        : null,
    },
    freshness: {
      builtAt: new Date().toISOString(),
      primaryAuditAt: latestAuditAt?.toISOString() ?? null,
      newestCompetitorSnapshotAt,
      competitorDataNewerThanAudit,
    },
    limitations: unique([
      ...(effectiveComparison?.limitations ?? []),
      "Confirmed social profiles are compared separately from pending and website-detected links.",
      "Unavailable review data is not evidence that either business is stronger.",
      "No private social analytics, engagement, post performance, traffic, sales, conversions, or revenue data is available.",
    ]),
  } satisfies CompetitorConsultantContext;

  diagnostics?.completed("COMPETITOR_CONTEXT_BUILD", {
    contextAvailable: true,
    configuredCompetitors: context.configuredCompetitors,
    analyzedCompetitors: context.analyzedCompetitors,
    unscannedCompetitors: context.unscannedCompetitors.length,
    staleCompetitors: context.staleCompetitors.length,
    failedCompetitors: context.failedCompetitors.length,
    comparisonAvailable: Boolean(context.currentComparison),
  });

  return context;
}

export function compactCompetitorConsultantContext(
  context: CompetitorConsultantContext,
) {
  return {
    sourcePriority: [
      "current live business records",
      "latest usable competitor snapshots",
      "comparison rebuilt from those records",
      "latest primary business audit",
      "historical audit comparison only as a labeled fallback",
    ],
    comparisonSource: context.comparisonSource,
    configuredCompetitors: context.configuredCompetitors,
    analyzedCompetitors: context.analyzedCompetitors,
    unscannedCompetitors: context.unscannedCompetitors,
    staleCompetitors: context.staleCompetitors,
    partialCompetitors: context.partialCompetitors,
    failedCompetitors: context.failedCompetitors,
    primaryBusinessEvidence: context.primaryBusinessEvidence,
    freshness: context.freshness,
    competitors: context.latestSnapshots.slice(0, 8).map((snapshot) => ({
      name: snapshot.competitorName,
      websiteUrl: snapshot.websiteUrl,
      analysisStatus: snapshot.latestSnapshotStatus,
      freshness: snapshot.freshnessState,
      snapshotDate: snapshot.scannedAt,
      pagesScanned: snapshot.pagesScanned,
      sections: snapshot.sections,
      website: snapshot.website,
      seo: snapshot.seo,
      reviews: snapshot.reviews,
      social: snapshot.social,
      positioning: snapshot.positioning,
      limitations: snapshot.limitations,
    })),
    comparison: context.currentComparison
      ? {
          generatedAt: context.currentComparison.generatedAt,
          rows: context.currentComparison.categoryComparisons
            .slice(0, 30)
            .map((row) => ({
              competitor: row.competitorName,
              category: row.category,
              businessValue: row.businessDisplay,
              competitorValue: row.competitorDisplay,
              result: row.status,
              observation: row.observation,
              evidence: row.evidence.slice(0, 3),
            })),
          businessAdvantages: context.currentComparison.businessAdvantages
            .slice(0, 8)
            .map(compactStatement),
          competitorAdvantages: context.currentComparison.competitorAdvantages
            .slice(0, 8)
            .map(compactStatement),
          opportunities: context.currentComparison.opportunities
            .slice(0, 8)
            .map(compactStatement),
          freshness: context.currentComparison.freshness.map((item) => ({
            competitor: item.competitorName,
            status: item.status,
            scannedAt: item.scannedAt,
          })),
          limitations: context.currentComparison.limitations.slice(0, 10),
        }
      : null,
    limitations: context.limitations,
  };
}

export function getCompetitorSuggestedQuestions(
  context: CompetitorConsultantContext | null,
) {
  if (!context || context.configuredCompetitors === 0) return [];
  const firstCompetitor = context.latestSnapshots.at(0);

  if (!firstCompetitor) return [];
  if (context.analyzedCompetitors === 0) {
    return [
      `Has ${firstCompetitor.competitorName} been analyzed?`,
      "What competitor data is missing?",
    ];
  }

  return [
    `How do I compare against ${firstCompetitor.competitorName}?`,
    `What is ${firstCompetitor.competitorName} doing better?`,
    "What competitor data is missing?",
  ];
}

function compactStatement(statement: {
  competitorName: string;
  category: string;
  description: string;
  confidence: string;
  evidence: ComparisonEvidence[];
}) {
  return {
    competitor: statement.competitorName,
    category: statement.category,
    statement: statement.description,
    confidence: statement.confidence,
    evidence: statement.evidence.slice(0, 3),
  };
}

function snapshotStatus(status?: CompetitorSnapshotStatus) {
  switch (status) {
    case CompetitorSnapshotStatus.PENDING:
      return "pending" as const;
    case CompetitorSnapshotStatus.RUNNING:
      return "running" as const;
    case CompetitorSnapshotStatus.COMPLETED:
      return "completed" as const;
    case CompetitorSnapshotStatus.PARTIAL:
      return "partial" as const;
    case CompetitorSnapshotStatus.FAILED:
      return "failed" as const;
    default:
      return "not_analyzed" as const;
  }
}

function confidenceLabel(value: number) {
  if (value >= 75) return "high" as const;
  if (value >= 50) return "moderate" as const;
  return "low" as const;
}

function isSocialPlatform(platform: ProfilePlatform) {
  return (
    platform !== ProfilePlatform.WEBSITE &&
    platform !== ProfilePlatform.GOOGLE_BUSINESS &&
    platform !== ProfilePlatform.OTHER
  );
}

function platformLabel(platform: ProfilePlatform) {
  if (platform === ProfilePlatform.X) return "X";
  if (platform === ProfilePlatform.TIKTOK) return "TikTok";
  if (platform === ProfilePlatform.YOUTUBE) return "YouTube";
  return platform
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function comparableProfileValue(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\/$/, "");
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function snapshotSection<T>(
  snapshot: unknown,
  key: string,
  validate: (value: Record<string, unknown>) => boolean,
) {
  if (
    !isRecord(snapshot) ||
    !isRecord(snapshot[key]) ||
    !validate(snapshot[key])
  ) {
    return null;
  }

  return snapshot[key] as T;
}

function auditScore(
  scores:
    | Array<{
        category: ScoreCategory;
        platform: ProfilePlatform | null;
        score: number;
      }>
    | undefined,
  category: ScoreCategory,
) {
  return (
    scores?.find((score) => score.category === category && !score.platform)
      ?.score ?? null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

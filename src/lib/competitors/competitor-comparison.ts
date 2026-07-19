import {
  BusinessProfileStatus,
  CompetitorSnapshotStatus,
  ProfilePlatform,
  ScoreCategory,
} from "@prisma/client";

import type { ReviewAnalysis } from "@/lib/analyzers/review-analyzer";
import type { SocialAnalysis } from "@/lib/analyzers/social-analyzer";
import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import { getPrimaryCtaAssessment } from "@/lib/analyzers/action-classifier";
import { competitorSnapshotFreshnessMs } from "@/lib/competitors/competitor-analysis-runner";
import { buildCompetitorPositioning } from "@/lib/competitors/competitor-positioning";
import {
  asCompetitorPositioningSnapshot,
  asCompetitorReviewSnapshot,
  asCompetitorSocialSnapshot,
  asCompetitorWebsiteSnapshot,
  asSeoAnalysis,
  type CategoryComparison,
  type ComparisonCategory,
  type ComparisonEvidence,
  type ComparisonStatement,
  type CompetitorComparisonResult,
} from "@/lib/competitors/competitor-types";

type SnapshotInput = {
  id: string;
  status: CompetitorSnapshotStatus;
  websiteUrl: string | null;
  websiteScore: number | null;
  seoScore: number | null;
  socialCoverageScore: number | null;
  reviewsScore: number | null;
  positioningScore: number | null;
  websiteSnapshot: unknown;
  seoSnapshot: unknown;
  socialSnapshot: unknown;
  reviewsSnapshot: unknown;
  positioningSnapshot: unknown;
  scannedAt: Date | null;
  createdAt: Date;
};

export type CompetitorComparisonInput = {
  business: {
    name: string;
    description?: string | null;
    targetAudience?: string | null;
    mainOffer?: string | null;
    primaryConversionGoal?: string | null;
  };
  primaryAudit: {
    analysisSnapshot: unknown;
    createdAt?: Date;
    completedAt?: Date | null;
    scores: Array<{
      category: ScoreCategory;
      platform?: ProfilePlatform | null;
      score: number;
    }>;
  };
  currentReviews: ReviewAnalysis;
  currentSocial: SocialAnalysis;
  confirmedProfiles: Array<{
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
  }>;
  competitors: Array<{
    id: string;
    name: string;
    websiteUrl: string | null;
    profiles?: Array<{
      platform: ProfilePlatform;
      status: BusinessProfileStatus;
      urlOrHandle?: string | null;
    }>;
    snapshots: SnapshotInput[];
  }>;
  now?: Date;
};

export function compareBusinessToCompetitors(
  input: CompetitorComparisonInput,
): CompetitorComparisonResult {
  const now = input.now ?? new Date();
  const primaryWebsite = primaryWebsiteAnalysis(input.primaryAudit.analysisSnapshot);
  const primaryCrawl = primaryWebsiteCrawl(input.primaryAudit.analysisSnapshot);
  const primarySeo = primarySeoAnalysis(input.primaryAudit.analysisSnapshot);
  const primaryPositioning =
    primaryWebsite && primaryCrawl
      ? buildCompetitorPositioning({
          competitorName: input.business.name,
          website: primaryWebsite,
          crawl: primaryCrawl,
          social: {
            score: input.currentSocial.score,
            confirmedPlatforms: input.currentSocial.confirmedPlatforms,
            pendingPlatforms: input.currentSocial.pendingPlatforms,
            detectedPlatforms: [],
            profiles: [],
            coverageLevel: input.currentSocial.platformCoverageLevel,
            platformCount: input.currentSocial.confirmedPlatforms.length,
            observations: [],
            limitations: input.currentSocial.limitations,
          },
          reviews: {
            status:
              input.currentReviews.googleBusinessStatus === "confirmed"
                ? "manually_confirmed"
                : input.currentReviews.googleBusinessStatus === "pending"
                  ? "possible_match"
                  : "not_found",
            applicability: input.currentReviews.googleBusinessApplicability,
            score: input.currentReviews.score,
            listingName: input.currentReviews.googleBusinessListingName,
            googlePlaceId: null,
            googleMapsUri: input.currentReviews.googleMapsUri,
            rating: input.currentReviews.googleRating,
            reviewCount: input.currentReviews.googleReviewCount,
            formattedAddress: null,
            phoneNumber: null,
            businessStatus: null,
            primaryType: null,
            matchConfidence: null,
            matchReasons: [],
            source: "saved_profile",
            searched: false,
            apiConfigured: false,
            note: "Current saved business review context.",
          },
        })
      : null;
  const categoryComparisons: CategoryComparison[] = [];
  const businessAdvantages: ComparisonStatement[] = [];
  const competitorAdvantages: ComparisonStatement[] = [];
  const parityAreas: ComparisonStatement[] = [];
  const opportunities: ComparisonStatement[] = [];
  const risks: ComparisonStatement[] = [];
  const freshness: CompetitorComparisonResult["freshness"] = [];
  let staleCompetitorCount = 0;
  let failedCompetitorCount = 0;
  let savedButUnanalyzedCount = 0;
  let analyzedCompetitorCount = 0;
  const newerSnapshotCompetitors: string[] = [];
  const changedWebsiteCompetitors: string[] = [];

  for (const competitor of input.competitors) {
    const ordered = [...competitor.snapshots].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    const latest = ordered.at(0);
    const usableStatuses: CompetitorSnapshotStatus[] = [
      CompetitorSnapshotStatus.COMPLETED,
      CompetitorSnapshotStatus.PARTIAL,
    ];
    const usable = ordered.find((snapshot) =>
      usableStatuses.includes(snapshot.status),
    );

    if (!usable) {
      const failed = latest?.status === CompetitorSnapshotStatus.FAILED;
      if (failed) failedCompetitorCount += 1;
      else savedButUnanalyzedCount += 1;
      freshness.push({
        competitorId: competitor.id,
        competitorName: competitor.name,
        snapshotId: latest?.id ?? null,
        status: failed ? "failed" : "not_analyzed",
        scannedAt: latest?.scannedAt?.toISOString() ?? null,
      });
      continue;
    }

    analyzedCompetitorCount += 1;
    const age = usable.scannedAt
      ? now.getTime() - usable.scannedAt.getTime()
      : Number.POSITIVE_INFINITY;
    const refreshFailed = latest?.status === CompetitorSnapshotStatus.FAILED;
    const websiteChanged = Boolean(
      competitor.websiteUrl &&
        usable.websiteUrl &&
        comparableUrl(competitor.websiteUrl) !== comparableUrl(usable.websiteUrl),
    );
    const stale =
      age > competitorSnapshotFreshnessMs || refreshFailed || websiteChanged;
    const partial = usable.status === CompetitorSnapshotStatus.PARTIAL;
    if (stale) staleCompetitorCount += 1;
    if (websiteChanged) changedWebsiteCompetitors.push(competitor.name);
    if (refreshFailed) failedCompetitorCount += 1;
    freshness.push({
      competitorId: competitor.id,
      competitorName: competitor.name,
      snapshotId: usable.id,
      status: stale ? "stale" : partial ? "partial" : "current",
      scannedAt: usable.scannedAt?.toISOString() ?? null,
    });
    const primaryDataDate =
      input.primaryAudit.completedAt ?? input.primaryAudit.createdAt ?? null;
    if (
      primaryDataDate &&
      usable.scannedAt &&
      usable.scannedAt.getTime() > primaryDataDate.getTime() + 60_000
    ) {
      newerSnapshotCompetitors.push(competitor.name);
    }

    const competitorWebsite = asCompetitorWebsiteSnapshot(usable.websiteSnapshot);
    const competitorSeo = asSeoAnalysis(usable.seoSnapshot);
    const competitorSocial = asCompetitorSocialSnapshot(usable.socialSnapshot);
    const competitorReviews = asCompetitorReviewSnapshot(usable.reviewsSnapshot);
    const competitorPositioning = asCompetitorPositioningSnapshot(
      usable.positioningSnapshot,
    );
    const comparisons = [
      compareWebsite({
        businessName: input.business.name,
        competitorId: competitor.id,
        competitorName: competitor.name,
        primary: primaryWebsite,
        primaryCrawl,
        competitor: competitorWebsite?.homepage ?? null,
        competitorCrawl: competitorWebsite?.crawl ?? null,
        businessScore: scoreFor(input.primaryAudit.scores, ScoreCategory.WEBSITE),
        competitorScore: usable.websiteScore,
      }),
      compareSeo({
        businessName: input.business.name,
        competitorId: competitor.id,
        competitorName: competitor.name,
        primary: primarySeo,
        primaryCrawl,
        competitor: competitorSeo,
        competitorCrawl: competitorWebsite?.crawl ?? null,
        businessScore: scoreFor(input.primaryAudit.scores, ScoreCategory.SEO),
        competitorScore: usable.seoScore,
      }),
      compareReviews({
        businessName: input.business.name,
        competitorId: competitor.id,
        competitorName: competitor.name,
        primary: input.currentReviews,
        competitor: competitorReviews,
        competitorProfiles: competitor.profiles ?? [],
      }),
      compareSocial({
        businessName: input.business.name,
        competitorId: competitor.id,
        competitorName: competitor.name,
        primary: input.currentSocial,
        competitor: competitorSocial,
        competitorProfiles: competitor.profiles ?? [],
      }),
      comparePositioning({
        businessName: input.business.name,
        competitorId: competitor.id,
        competitorName: competitor.name,
        primary: primaryPositioning,
        competitor: competitorPositioning,
      }),
    ].filter((comparison): comparison is CategoryComparison => Boolean(comparison));

    categoryComparisons.push(...comparisons);

    for (const comparison of comparisons) {
      const statement = statementFromComparison(comparison);

      if (comparison.status === "business_stronger") {
        businessAdvantages.push(statement);
      } else if (comparison.status === "competitor_stronger") {
        competitorAdvantages.push(statement);
        opportunities.push(opportunityFromComparison(comparison));

        if (
          comparison.businessScore !== null &&
          comparison.competitorScore !== null &&
          comparison.competitorScore - comparison.businessScore >= 15
        ) {
          risks.push({
            ...statement,
            id: `${statement.id}-risk`,
            title: `${competitor.name} has a material ${comparison.category} gap`,
          });
        }
      } else if (comparison.status === "similar") {
        parityAreas.push(statement);
      }
    }
  }

  return {
    analyzedCompetitorCount,
    staleCompetitorCount,
    failedCompetitorCount,
    savedButUnanalyzedCount,
    categoryComparisons,
    businessAdvantages: uniqueStatements(businessAdvantages),
    competitorAdvantages: uniqueStatements(competitorAdvantages),
    parityAreas: uniqueStatements(parityAreas),
    opportunities: uniqueStatements(opportunities),
    risks: uniqueStatements(risks),
    evidence: uniqueEvidence(categoryComparisons.flatMap((item) => item.evidence)),
    freshness,
    limitations: [
      "Comparisons use timestamped public website scans, confirmed or detected profile coverage, current saved business data, and Google Places data when configured.",
      "The analysis does not include sales, traffic, conversions, ad spend, private analytics, social reach, engagement, posting frequency, or post performance.",
      "A detected profile or public page indicates coverage only; it does not prove that the channel performs well.",
      ...(newerSnapshotCompetitors.length > 0
        ? [
            `${unique(newerSnapshotCompetitors).join(", ")} has a newer public snapshot than the primary business audit. Rerun the business audit for the fairest side-by-side comparison.`,
          ]
        : []),
      ...(changedWebsiteCompetitors.length > 0
        ? [
            `${unique(changedWebsiteCompetitors).join(", ")} has a saved website URL that differs from the latest snapshot. Refresh the competitor before relying on that comparison.`,
          ]
        : []),
    ],
    generatedAt: now.toISOString(),
  };
}

function compareWebsite(input: {
  businessName: string;
  competitorId: string;
  competitorName: string;
  primary: WebsiteAnalysis | null;
  primaryCrawl: WebsiteCrawlResult | null;
  competitor: WebsiteAnalysis | null;
  competitorCrawl: WebsiteCrawlResult | null;
  businessScore: number | null;
  competitorScore: number | null;
}) {
  if (!input.primary || !input.competitor) return null;
  const businessH1 = input.primary.h1Count === 1 && Boolean(input.primary.h1Text.at(0));
  const competitorH1 =
    input.competitor.h1Count === 1 && Boolean(input.competitor.h1Text.at(0));
  const businessActions =
    input.primary.actionSummary.detectedActionTypes ??
    input.primary.actionSummary.primaryActions;
  const competitorActions =
    input.competitor.actionSummary.detectedActionTypes ??
    input.competitor.actionSummary.primaryActions;
  const businessCta = getPrimaryCtaAssessment(input.primary.actionSummary);
  const competitorCta = getPrimaryCtaAssessment(input.competitor.actionSummary);
  const businessPages = input.primaryCrawl?.importantPagesFound.length ?? null;
  const competitorPages = input.competitorCrawl?.importantPagesFound.length ?? null;
  const evidence: ComparisonEvidence[] = [
    comparisonEvidence(
      "Homepage headline",
      input.primary.h1Text.at(0) ?? `${input.primary.h1Count} H1 detected`,
      input.competitor.h1Text.at(0) ?? `${input.competitor.h1Count} H1 detected`,
      [input.primary.normalizedUrl, input.competitor.normalizedUrl],
    ),
    comparisonEvidence(
      "Detected customer action types",
      businessActions.join(", ") || "None detected",
      competitorActions.join(", ") || "None detected",
      [input.primary.normalizedUrl, input.competitor.normalizedUrl],
    ),
    comparisonEvidence(
      "Homepage primary CTA clarity",
      businessCta.clarity.replaceAll("_", " "),
      competitorCta.clarity.replaceAll("_", " "),
      [input.primary.normalizedUrl, input.competitor.normalizedUrl],
    ),
  ];
  if (businessPages !== null && competitorPages !== null) {
    evidence.push(
      comparisonEvidence(
        "Important page coverage",
        `${businessPages} page types`,
        `${competitorPages} page types`,
        [input.primary.normalizedUrl, input.competitor.normalizedUrl],
      ),
    );
  }
  let observation: string;
  let status = compareScoreStatus(input.businessScore, input.competitorScore);

  if (!businessH1 && competitorH1) {
    status = "competitor_stronger";
    observation = `${input.competitorName} communicates its apparent offer more clearly in the homepage headline.`;
  } else if (businessH1 && !competitorH1) {
    status = "business_stronger";
    observation = `${input.businessName} has the clearer single homepage headline in the latest scans.`;
  } else if (
    competitorCta.clarity === "CLEAR" &&
    businessCta.clarity !== "CLEAR"
  ) {
    status = "competitor_stronger";
    observation = `${input.competitorName} has a structurally assessed clear primary visitor action while ${input.businessName} does not.`;
  } else if (
    businessCta.clarity === "CLEAR" &&
    competitorCta.clarity !== "CLEAR"
  ) {
    status = "business_stronger";
    observation = `${input.businessName} has a structurally assessed clear primary visitor action while ${input.competitorName} does not.`;
  } else {
    observation = scoreObservation(
      input.businessName,
      input.competitorName,
      "website structure",
      status,
    );
  }

  return categoryComparison(input, "website", status, observation, evidence);
}

function compareSeo(input: {
  businessName: string;
  competitorId: string;
  competitorName: string;
  primary: SeoAnalysis | null;
  primaryCrawl: WebsiteCrawlResult | null;
  competitor: SeoAnalysis | null;
  competitorCrawl: WebsiteCrawlResult | null;
  businessScore: number | null;
  competitorScore: number | null;
}) {
  if (!input.primary || !input.competitor) return null;
  const businessIssues = crawlSeoIssues(input.primaryCrawl);
  const competitorIssues = crawlSeoIssues(input.competitorCrawl);
  const evidenceItems = [
    comparisonEvidence(
      "Homepage SEO checks",
      seoStatusSummary(input.primary),
      seoStatusSummary(input.competitor),
      [],
    ),
  ];
  if (businessIssues !== null && competitorIssues !== null) {
    evidenceItems.push(
      comparisonEvidence(
        "Sitewide title, description, and H1 issues",
        String(businessIssues),
        String(competitorIssues),
        [],
      ),
    );
  }
  const status = compareScoreStatus(input.businessScore, input.competitorScore);
  return categoryComparison(
    input,
    "seo",
    status,
    scoreObservation(input.businessName, input.competitorName, "public SEO basics", status),
    evidenceItems,
  );
}

function compareReviews(input: {
  businessName: string;
  competitorId: string;
  competitorName: string;
  primary: ReviewAnalysis;
  competitor: ReturnType<typeof asCompetitorReviewSnapshot>;
  competitorProfiles: Array<{
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
    urlOrHandle?: string | null;
  }>;
}) {
  const businessCount = input.primary.googleReviewCount;
  const businessRating = input.primary.googleRating;
  const competitorCount = input.competitor?.reviewCount ?? null;
  const competitorRating = input.competitor?.rating ?? null;
  const competitorGoogleProfiles = input.competitorProfiles.filter(
    (profile) => profile.platform === ProfilePlatform.GOOGLE_BUSINESS,
  );
  const competitorGoogleStatus = competitorGoogleProfiles.some(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  )
    ? "confirmed"
    : competitorGoogleProfiles.some(
          (profile) => profile.status === BusinessProfileStatus.PENDING,
        )
      ? "pending"
      : "not confirmed";
  const businessHasMetrics = businessCount !== null || businessRating !== null;
  const competitorHasMetrics =
    competitorCount !== null || competitorRating !== null;
  const businessDisplay = reviewDisplay(businessRating, businessCount);
  const competitorDisplay = reviewDisplay(competitorRating, competitorCount);
  const evidenceItems = [
    comparisonEvidence(
      "Visible Google rating and review count",
      businessDisplay,
      competitorDisplay,
      [
        input.primary.googleMapsUri,
        input.competitor?.googleMapsUri,
        ...competitorGoogleProfiles.map((profile) => profile.urlOrHandle),
      ],
    ),
    comparisonEvidence(
      "Google listing confirmation",
      input.primary.googleBusinessStatus,
      competitorGoogleStatus,
      competitorGoogleProfiles.map((profile) => profile.urlOrHandle),
    ),
  ];

  if (!input.competitor) {
    return categoryComparison(
      {
        ...input,
        businessScore: input.primary.score,
        competitorScore: null,
      },
      "reviews",
      "data_unavailable",
      `The competitor review-analysis section is unavailable for ${input.competitorName}, so review strength cannot currently be compared.`,
      evidenceItems,
      businessDisplay,
      "Data unavailable",
    );
  }

  if (!businessHasMetrics && !competitorHasMetrics) {
    const notApplicable =
      input.primary.googleBusinessApplicability === "optional" &&
      input.competitor.applicability === "optional";

    return categoryComparison(
      {
        ...input,
        businessScore: null,
        competitorScore: null,
      },
      "reviews",
      notApplicable ? "not_applicable" : "data_unavailable",
      notApplicable
        ? "Google review strength is not applicable to this comparison based on the current business context."
        : "Comparable public Google rating or review-count data is unavailable for both businesses.",
      evidenceItems,
      "Data unavailable",
      "Data unavailable",
    );
  }

  if (businessHasMetrics && !competitorHasMetrics) {
    return categoryComparison(
      {
        ...input,
        businessScore: input.primary.score,
        competitorScore: null,
      },
      "reviews",
      "not_comparable",
      `${input.businessName} has confirmed Google review data. Comparable rating and review-count data for ${input.competitorName} is unavailable, so review strength cannot currently be compared.`,
      evidenceItems,
      businessDisplay,
      "Data unavailable",
    );
  }

  if (!businessHasMetrics && competitorHasMetrics) {
    return categoryComparison(
      {
        ...input,
        businessScore: null,
        competitorScore: input.competitor.score,
      },
      "reviews",
      "not_comparable",
      `${input.competitorName} has public Google review data. Comparable rating and review-count data for ${input.businessName} is unavailable, so review strength cannot currently be compared.`,
      evidenceItems,
      "Data unavailable",
      competitorDisplay,
    );
  }

  const canCompareCount = businessCount !== null && competitorCount !== null;
  const canCompareRating = businessRating !== null && competitorRating !== null;

  if (!canCompareCount && !canCompareRating) {
    return categoryComparison(
      {
        ...input,
        businessScore: input.primary.score,
        competitorScore: input.competitor.score,
      },
      "reviews",
      "not_comparable",
      "The available Google fields do not overlap, so a fair review comparison cannot be made.",
      evidenceItems,
      businessDisplay,
      competitorDisplay,
    );
  }

  let status: CategoryComparison["status"] = "similar";
  let observation = `${input.businessName} and ${input.competitorName} have similar visible Google review signals in the available public data.`;

  if (canCompareCount) {
    if (businessCount >= competitorCount * 1.2 + 20) {
      status = "business_stronger";
      observation = `${input.businessName} currently has stronger visible Google review volume.`;
    } else if (competitorCount >= businessCount * 1.2 + 20) {
      status = "competitor_stronger";
      observation = `${input.competitorName} currently has stronger visible Google review volume.`;
    }
  }

  if (status === "similar" && canCompareRating) {
    const ratingDelta = businessRating - competitorRating;
    if (ratingDelta >= 0.2) {
      status = "business_stronger";
      observation = `${input.businessName} has the higher visible Google rating in the current public data.`;
    } else if (ratingDelta <= -0.2) {
      status = "competitor_stronger";
      observation = `${input.competitorName} has the higher visible Google rating in the current public data.`;
    }
  }

  return categoryComparison(
    {
      ...input,
      businessScore: input.primary.score,
      competitorScore: input.competitor.score,
    },
    "reviews",
    status,
    observation,
    evidenceItems,
    businessDisplay,
    competitorDisplay,
  );
}

function compareSocial(input: {
  businessName: string;
  competitorId: string;
  competitorName: string;
  primary: SocialAnalysis;
  competitor: ReturnType<typeof asCompetitorSocialSnapshot>;
  competitorProfiles: Array<{
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
    urlOrHandle?: string | null;
  }>;
}) {
  if (!input.competitor) return null;
  const liveSocialProfiles = input.competitorProfiles.filter((profile) =>
    isSocialPlatform(profile.platform),
  );
  const competitorConfirmedProfiles = liveSocialProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const competitorPendingProfiles = liveSocialProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.PENDING,
  );
  const competitorConfirmedPlatforms = unique(
    competitorConfirmedProfiles.map((profile) => platformLabel(profile.platform)),
  );
  const competitorPendingPlatforms = unique(
    competitorPendingProfiles.map((profile) => platformLabel(profile.platform)),
  );
  const liveProfileUrls = new Set(
    liveSocialProfiles.map((profile) => comparableProfileValue(profile.urlOrHandle)),
  );
  const additionalDetectedProfiles = input.competitor.profiles.filter(
    (profile) =>
      profile.status === "detected" &&
      !liveProfileUrls.has(comparableProfileValue(profile.url)),
  );
  const additionalDetectedPlatforms = unique(
    additionalDetectedProfiles.map((profile) => profile.platform),
  );
  const businessConfirmedCount = input.primary.confirmedProfilesCount;
  const businessPendingCount = input.primary.pendingProfilesCount;
  const competitorConfirmedCount = competitorConfirmedProfiles.length;
  const competitorPendingCount = competitorPendingProfiles.length;
  const evidenceItems = [
    comparisonEvidence(
      "Confirmed public social profiles",
      profileCoverageDisplay(
        businessConfirmedCount,
        input.primary.confirmedPlatforms,
      ),
      profileCoverageDisplay(
        competitorConfirmedCount,
        competitorConfirmedPlatforms,
      ),
      competitorConfirmedProfiles.map((profile) => profile.urlOrHandle),
    ),
    comparisonEvidence(
      "Profiles awaiting confirmation",
      profileCoverageDisplay(businessPendingCount, input.primary.pendingPlatforms),
      profileCoverageDisplay(competitorPendingCount, competitorPendingPlatforms),
      competitorPendingProfiles.map((profile) => profile.urlOrHandle),
    ),
  ];

  if (additionalDetectedProfiles.length > 0) {
    evidenceItems.push(
      comparisonEvidence(
        "Additional website-detected social links",
        "No equivalent unconfirmed links included",
        profileCoverageDisplay(
          additionalDetectedProfiles.length,
          additionalDetectedPlatforms,
        ),
        additionalDetectedProfiles.map((profile) => profile.url),
      ),
    );
  }

  let status: CategoryComparison["status"];
  let observation: string;

  if (competitorConfirmedCount > businessConfirmedCount) {
    status = "competitor_stronger";
    observation = `${input.competitorName} has broader confirmed public profile coverage (${competitorConfirmedCount} vs. ${businessConfirmedCount}).`;
  } else if (businessConfirmedCount > competitorConfirmedCount) {
    status = "business_stronger";
    observation = `${input.businessName} has broader confirmed public profile coverage (${businessConfirmedCount} vs. ${competitorConfirmedCount}).`;
  } else if (businessConfirmedCount === 0) {
    status = "not_comparable";
    observation = `Neither ${input.businessName} nor ${input.competitorName} has a confirmed social profile in the current records. Pending or detected links are not treated as confirmed coverage.`;
  } else {
    status = "similar";
    observation = `${input.businessName} and ${input.competitorName} each have ${businessConfirmedCount} confirmed social profile${businessConfirmedCount === 1 ? "" : "s"}.`;
  }

  const unconfirmedCount =
    competitorPendingCount + additionalDetectedProfiles.length;
  if (unconfirmedCount > 0) {
    observation += ` ${input.competitorName} also has ${unconfirmedCount} additional public link${unconfirmedCount === 1 ? "" : "s"} pending confirmation or detected from its website.`;
  }

  return categoryComparison(
    {
      ...input,
      businessScore: null,
      competitorScore: null,
    },
    "social",
    status,
    observation,
    evidenceItems,
    `${businessConfirmedCount} confirmed; ${businessPendingCount} pending`,
    `${competitorConfirmedCount} confirmed; ${competitorPendingCount} pending${additionalDetectedProfiles.length > 0 ? `; ${additionalDetectedProfiles.length} additionally detected` : ""}`,
  );
}

function comparePositioning(input: {
  businessName: string;
  competitorId: string;
  competitorName: string;
  primary: ReturnType<typeof asCompetitorPositioningSnapshot>;
  competitor: ReturnType<typeof asCompetitorPositioningSnapshot>;
}) {
  if (!input.primary || !input.competitor) return null;
  const evidenceItems = [
    comparisonEvidence(
      "Observable offer and structurally assessed CTA",
      [input.primary.mainOffer, input.primary.primaryCTA]
        .filter(Boolean)
        .join(" / ") || "Not clearly detected",
      [input.competitor.mainOffer, input.competitor.primaryCTA]
        .filter(Boolean)
        .join(" / ") || "Not clearly detected",
      [...input.primary.evidence, ...input.competitor.evidence]
        .map((item) => item.sourceUrl)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const status = positioningComparisonStatus(
    input.primary.score,
    input.competitor.score,
  );
  return categoryComparison(
    {
      ...input,
      businessScore: input.primary.score,
      competitorScore: input.competitor.score,
    },
    "positioning",
    status,
    scoreObservation(input.businessName, input.competitorName, "observable offer clarity", status),
    evidenceItems,
    positioningDisplay(input.primary),
    positioningDisplay(input.competitor),
  );
}

function categoryComparison(
  input: {
    competitorId: string;
    competitorName: string;
    businessScore: number | null;
    competitorScore: number | null;
  },
  category: ComparisonCategory,
  status: CategoryComparison["status"],
  observation: string,
  evidenceItems: ComparisonEvidence[],
  businessDisplay = scoreDisplay(input.businessScore),
  competitorDisplay = scoreDisplay(input.competitorScore),
): CategoryComparison {
  return {
    competitorId: input.competitorId,
    competitorName: input.competitorName,
    category,
    businessScore: input.businessScore,
    competitorScore: input.competitorScore,
    businessDisplay,
    competitorDisplay,
    status,
    observation,
    evidence: evidenceItems,
  };
}

function statementFromComparison(comparison: CategoryComparison): ComparisonStatement {
  return {
    id: statementId(comparison, "comparison"),
    competitorId: comparison.competitorId,
    competitorName: comparison.competitorName,
    category: comparison.category,
    title: comparison.observation,
    description: comparison.observation,
    confidence: comparison.evidence.length >= 2 ? "high" : "medium",
    evidence: comparison.evidence,
  };
}

function opportunityFromComparison(comparison: CategoryComparison): ComparisonStatement {
  const copy: Record<ComparisonCategory, { title: string; description: string }> = {
    website: {
      title: "Clarify the primary website conversion path",
      description: `Use ${possessive(comparison.competitorName)} publicly observable headline, CTA, and important-page structure as a benchmark, then improve the equivalent path without copying its wording.`,
    },
    seo: {
      title: "Close the highest-confidence SEO structure gap",
      description: `Review the saved title, meta, H1, robots, sitemap, and sitewide issue evidence against ${comparison.competitorName}, then fix the clearest difference first.`,
    },
    reviews: {
      title: "Strengthen visible review and trust proof",
      description: `The latest public snapshot shows a review-presence advantage for ${comparison.competitorName}. Improve the review request process and feature verified proof more clearly.`,
    },
    social: {
      title: "Evaluate the missing high-fit social channel",
      description: `${comparison.competitorName} has broader detected profile coverage. Confirm whether the missing channel fits the business before investing in it; no engagement advantage is assumed.`,
    },
    positioning: {
      title: "Make the offer and next step easier to understand",
      description: `Use the observable positioning difference with ${comparison.competitorName} to tighten the business's audience, offer, differentiator, and primary CTA.`,
    },
  };
  return {
    id: statementId(comparison, "opportunity"),
    competitorId: comparison.competitorId,
    competitorName: comparison.competitorName,
    category: comparison.category,
    title: copy[comparison.category].title,
    description: copy[comparison.category].description,
    confidence: comparison.evidence.length >= 2 ? "high" : "medium",
    evidence: comparison.evidence,
  };
}

function compareScoreStatus(
  businessScore: number | null,
  competitorScore: number | null,
): CategoryComparison["status"] {
  if (businessScore === null || competitorScore === null) return "data_unavailable";
  const delta = businessScore - competitorScore;
  if (delta >= 5) return "business_stronger";
  if (delta <= -5) return "competitor_stronger";
  return "similar";
}

function scoreObservation(
  businessName: string,
  competitorName: string,
  label: string,
  status: CategoryComparison["status"],
) {
  if (status === "business_stronger") {
    return `${businessName} is stronger on the comparable ${label} signals in the latest snapshots.`;
  }
  if (status === "competitor_stronger") {
    return `${competitorName} is stronger on the comparable ${label} signals in the latest snapshots.`;
  }
  if (status === "similar") {
    return `${businessName} and ${competitorName} are similar on the available ${label} signals.`;
  }
  return `There is not enough comparable ${label} data for a reliable conclusion.`;
}

function scoreFor(
  scores: CompetitorComparisonInput["primaryAudit"]["scores"],
  category: ScoreCategory,
) {
  return scores.find((score) => score.category === category && !score.platform)?.score ?? null;
}

function primaryWebsiteAnalysis(snapshot: unknown) {
  return snapshotSection<WebsiteAnalysis>(snapshot, "website", (value) =>
    typeof value.score === "number",
  );
}

function primaryWebsiteCrawl(snapshot: unknown) {
  return snapshotSection<WebsiteCrawlResult>(snapshot, "websiteCrawl", (value) =>
    Array.isArray(value.pageResults),
  );
}

function primarySeoAnalysis(snapshot: unknown) {
  return snapshotSection<SeoAnalysis>(snapshot, "seo", (value) =>
    typeof value.score === "number",
  );
}

function snapshotSection<T>(
  snapshot: unknown,
  key: string,
  validate: (value: Record<string, unknown>) => boolean,
): T | null {
  if (!isRecord(snapshot) || !isRecord(snapshot[key]) || !validate(snapshot[key])) {
    return null;
  }
  return snapshot[key] as T;
}

function crawlSeoIssues(crawl: WebsiteCrawlResult | null) {
  return crawl
    ? crawl.pagesMissingTitle +
        crawl.pagesMissingMetaDescription +
        crawl.pagesWithNoH1 +
        crawl.pagesWithMultipleH1
    : null;
}

function seoStatusSummary(seo: SeoAnalysis) {
  return `title ${seo.titleStatus}, description ${seo.metaDescriptionStatus}, H1 ${seo.h1Status}, canonical ${seo.canonicalStatus}, robots ${seo.robotsTxtStatus}, sitemap ${seo.sitemapStatus}`;
}

function reviewDisplay(rating: number | null, count: number | null) {
  if (rating === null && count === null) return "Data unavailable";
  return `${rating !== null ? `${rating.toFixed(1)} stars` : "Rating unavailable"}, ${count !== null ? `${count.toLocaleString()} reviews` : "count unavailable"}`;
}

function profileCoverageDisplay(count: number, platforms: string[]) {
  return `${count} profile${count === 1 ? "" : "s"}${
    platforms.length > 0 ? ` (${unique(platforms).join(", ")})` : ""
  }`;
}

function positioningDisplay(
  positioning: NonNullable<ReturnType<typeof asCompetitorPositioningSnapshot>>,
) {
  const offerClarity =
    positioning.score >= 80
      ? "Clear observable offer"
      : positioning.score >= 60
        ? "Moderately clear observable offer"
        : "Limited observable offer clarity";
  const ctaClarity =
    positioning.primaryCtaClarity === "CLEAR"
      ? "clear primary CTA structurally assessed"
      : `primary CTA ${positioning.primaryCtaClarity.replaceAll("_", " ").toLowerCase()}`;
  const confidence =
    positioning.confidence >= 75
      ? "high evidence confidence"
      : positioning.confidence >= 50
        ? "moderate evidence confidence"
        : "low evidence confidence";

  return `${offerClarity}; ${ctaClarity} (${confidence})`;
}

function positioningComparisonStatus(
  businessScore: number,
  competitorScore: number,
): CategoryComparison["status"] {
  const delta = businessScore - competitorScore;
  if (delta >= 10) return "business_stronger";
  if (delta <= -10) return "competitor_stronger";
  return "similar";
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
  return platform
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function comparableProfileValue(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\/$/, "");
}

function comparisonEvidence(
  label: string,
  businessValue: string,
  competitorValue: string,
  sourceUrls: Array<string | null | undefined>,
): ComparisonEvidence {
  return {
    label,
    businessValue,
    competitorValue,
    sourceUrls: unique(
      sourceUrls.filter((value): value is string => Boolean(value)),
    ),
  };
}

function scoreDisplay(score: number | null) {
  return score === null ? "Data unavailable" : `${score}/100`;
}

function statementId(comparison: CategoryComparison, suffix: string) {
  return `${comparison.competitorId}:${comparison.category}:${suffix}`;
}

function uniqueStatements(items: ComparisonStatement[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.competitorId}:${item.category}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueEvidence(items: ComparisonEvidence[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.label}:${item.businessValue}:${item.competitorValue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function comparableUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return value.trim().toLowerCase().replace(/\/$/, "");
  }
}

function possessive(value: string) {
  if (/[\u2018\u2019']s$/i.test(value)) return value;
  return /s$/i.test(value) ? `${value}'` : `${value}'s`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

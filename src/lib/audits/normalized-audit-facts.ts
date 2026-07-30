import {
  BusinessProfileStatus,
  ProfilePlatform,
  ScoreCategory,
} from "@prisma/client";

import type { ReviewAnalysis } from "@/lib/analyzers/review-analyzer";
import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import type { SocialAnalysis } from "@/lib/analyzers/social-analyzer";
import type {
  CrawledPageResult,
  WebsiteCrawlResult,
} from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import type { SelectiveAiAuditSnapshot } from "@/lib/audits/selective-ai/types";
import {
  classifyBusinessModel,
  type BusinessModelClassification,
  type BusinessModelContext,
} from "@/lib/business-model";

export const NORMALIZED_AUDIT_FACTS_VERSION = "normalized-audit-facts-v3";
export const COVERAGE_MODEL_VERSION = "audit-coverage-v2";

export type FactConfidence = "HIGH" | "MEDIUM" | "LOW";

export type NormalizedTextFact = {
  value: string | null;
  length: number;
  status: "GOOD" | "MISSING" | "TOO_SHORT" | "TOO_LONG" | "UNKNOWN";
  confidence: FactConfidence;
};

export type NormalizedH1Fact = {
  count: number;
  values: string[];
  status: "GOOD" | "MISSING" | "MULTIPLE";
  confidence: "HIGH";
};

export type NormalizedPageFacts = {
  url: string;
  title: NormalizedTextFact;
  metaDescription: NormalizedTextFact;
  h1: NormalizedH1Fact;
  actions: {
    detectedTypes: string[];
    conversionLinks: string[];
    contactActions: string[];
    emailActions: string[];
    orderActions: string[];
    bookingActions: string[];
    newsletterActions: string[];
    socialLinks: string[];
    primaryCtaClarity:
      | "CLEAR"
      | "NEEDS_IMPROVEMENT"
      | "UNCERTAIN"
      | "NOT_ASSESSED"
      | "NOT_APPLICABLE";
  };
};

export type AuditCoverageV2 = {
  version: typeof COVERAGE_MODEL_VERSION;
  crawl: {
    eligiblePages: number;
    successfulPages: number;
    failedPages: number;
    excludedPages: number;
    crawlLimit: number;
    crawlLimitReached: boolean;
    status:
      | "NOT_APPLICABLE"
      | "HOMEPAGE_ONLY"
      | "COMPLETE_FOR_ELIGIBLE_CRAWLED_PAGES"
      | "LIMITED_TO_CRAWL_SCOPE"
      | "PARTIAL_FAILURES";
    explanation: string;
  };
  technical: {
    pagesAnalyzed: number;
    status: "NOT_APPLICABLE" | "COMPLETE" | "PARTIAL";
    explanation: string;
  };
  aiContent: {
    selectedPages: number;
    completedPages: number;
    failedPages: number;
    deterministicOnlyPages: number;
    status:
      | "NOT_ENABLED"
      | "NOT_APPLICABLE"
      | "COMPLETE_FOR_SELECTED_PAGES"
      | "PARTIAL_FOR_SELECTED_PAGES";
    explanation: string;
  };
  socialProfiles: {
    userConfirmed: number;
    publiclyDetected: number;
    pending: number;
    contentAnalyzed: number;
    status: "NOT_CONFIGURED" | "PROFILE_ONLY" | "CONTENT_ANALYZED";
    explanation: string;
  };
  reviews: {
    listingConfirmed: boolean;
    ratingAvailable: boolean;
    countAvailable: boolean;
    status: "NOT_CONFIGURED" | "LIMITED" | "SCORABLE";
    explanation: string;
  };
  competitors: {
    configured: boolean;
    analyzed: boolean;
    status: "NOT_CONFIGURED" | "SAVED_NOT_ANALYZED" | "ANALYZED";
    explanation: string;
  };
};

export type NormalizedAuditFacts = {
  version: typeof NORMALIZED_AUDIT_FACTS_VERSION;
  generatedAt: string;
  businessModel: BusinessModelClassification;
  homepage: NormalizedPageFacts | null;
  siteWide: {
    analyzedPages: Array<{
      url: string;
      titleLength: number;
      metaDescriptionLength: number;
      h1Count: number;
    }>;
    pagesMissingTitles: Array<{ url: string; length: number }>;
    pagesMissingMetaDescriptions: Array<{ url: string; length: number }>;
    pagesMissingH1: Array<{ url: string; count: number }>;
    pagesWithMultipleH1: Array<{ url: string; count: number }>;
    thinPages: NonNullable<WebsiteCrawlResult["thinPages"]>;
    duplicateContentGroups: NonNullable<
      WebsiteCrawlResult["duplicateContentGroups"]
    >;
    copyQualityFindings: NonNullable<
      WebsiteCrawlResult["copyQualityFindings"]
    >;
    orderingFrictionPages: NonNullable<
      WebsiteCrawlResult["orderingFrictionPages"]
    >;
  };
  profiles: {
    userConfirmedPlatforms: string[];
    userConfirmedSocialProfiles: number;
    publiclyDetectedPlatforms: string[];
    publiclyDetectedSocialProfiles: number;
    additionalDetectedPlatforms: string[];
    pendingPlatforms: string[];
    pendingSocialProfiles: number;
    profileContentAnalyzed: number;
  };
  scoreEvidence: {
    categories: Partial<
      Record<
        ScoreCategory,
        {
          score: number | null;
          confidence: FactConfidence;
          coverageStatus:
            | "COMPLETE_FOR_AVAILABLE_SCOPE"
            | "PARTIAL"
            | "LIMITED"
            | "NOT_CONFIGURED"
            | "NOT_APPLICABLE";
          evidenceCompleteness: number;
          dataRequirementsMet: boolean;
          missingInputs: string[];
        }
      >
    >;
    social: {
      score: number;
      scope: "PROFILE_COVERAGE";
      confidence: FactConfidence;
      performanceAnalyzed: false;
    };
    reviews: {
      score: number;
      status: ReviewAnalysis["scoreStatus"];
      confidence: FactConfidence;
      scope: ReviewAnalysis["scoreScope"];
      evidenceCompleteness: number;
      dataRequirementsMet: boolean;
      missingInputs: string[];
    };
  };
  coverage: AuditCoverageV2;
  scoreValues: Partial<Record<ScoreCategory, number>>;
};

export function buildNormalizedAuditFacts({
  website,
  websiteCrawl,
  seo,
  social,
  reviews,
  selectiveAi,
  businessProfiles,
  businessContext,
  competitorConfigured,
  competitorAnalyzed,
  scoreValues = {},
  generatedAt = new Date().toISOString(),
}: {
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  seo: SeoAnalysis | null;
  social: SocialAnalysis;
  reviews: ReviewAnalysis;
  selectiveAi: SelectiveAiAuditSnapshot | null;
  businessProfiles: Array<{
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
  }>;
  businessContext: BusinessModelContext;
  competitorConfigured: boolean;
  competitorAnalyzed: boolean;
  scoreValues?: Partial<Record<ScoreCategory, number>>;
  generatedAt?: string;
}): NormalizedAuditFacts {
  const homepagePage = findHomepagePage(website, websiteCrawl);
  const homepage = website
    ? normalizedHomepageFacts({
        website,
        homepagePage,
        seo,
      })
    : null;
  const successfulPages = (websiteCrawl?.pageResults ?? []).filter(
    (page) => page.analysisStatus !== "FAILED",
  );
  const confirmedSocialPlatforms = unique(
    businessProfiles
      .filter(
        (profile) =>
          profile.status === BusinessProfileStatus.CONFIRMED &&
          isSocialPlatform(profile.platform),
      )
      .map((profile) => platformLabel(profile.platform)),
  );
  const pendingSocialPlatforms = unique(
    businessProfiles
      .filter(
        (profile) =>
          profile.status === BusinessProfileStatus.PENDING &&
          isSocialPlatform(profile.platform),
      )
      .map((profile) => platformLabel(profile.platform)),
  );
  const publiclyDetectedPlatforms = detectedSocialPlatforms({
    website,
    websiteCrawl,
    pendingSocialPlatforms,
  });
  const businessModel = classifyBusinessModel({
    context: businessContext,
    detectedAddress: website?.detectedAddress,
    operatingHoursSignals: website?.operatingHoursSignals,
    detectedActionTypes: homepage?.actions.detectedTypes ?? [],
  });
  const coverage = buildCoverage({
    website,
    websiteCrawl,
    selectiveAi,
    confirmedSocialProfiles: confirmedSocialPlatforms.length,
    detectedSocialProfiles: publiclyDetectedPlatforms.length,
    pendingSocialProfiles: pendingSocialPlatforms.length,
    socialContentAnalyzed: social.contentAnalyzedProfilesCount ?? 0,
    reviews,
    competitorConfigured,
    competitorAnalyzed,
  });
  const categoryScoreEvidence = buildCategoryScoreEvidence({
    website,
    seo,
    social,
    reviews,
    coverage,
    competitorConfigured,
    competitorAnalyzed,
    businessProfiles,
    businessContext,
    scoreValues,
  });

  return {
    version: NORMALIZED_AUDIT_FACTS_VERSION,
    generatedAt,
    businessModel,
    homepage,
    siteWide: {
      analyzedPages: successfulPages.map((page) => ({
        url: page.url,
        titleLength: page.title?.length ?? 0,
        metaDescriptionLength: page.metaDescription?.length ?? 0,
        h1Count: page.h1Count,
      })),
      pagesMissingTitles: successfulPages
        .filter((page) => !page.title)
        .map((page) => ({ url: page.url, length: 0 })),
      pagesMissingMetaDescriptions: successfulPages
        .filter((page) => !page.metaDescription)
        .map((page) => ({ url: page.url, length: 0 })),
      pagesMissingH1: successfulPages
        .filter((page) => page.h1Count === 0)
        .map((page) => ({ url: page.url, count: 0 })),
      pagesWithMultipleH1: successfulPages
        .filter((page) => page.h1Count > 1)
        .map((page) => ({ url: page.url, count: page.h1Count })),
      thinPages: websiteCrawl?.thinPages ?? [],
      duplicateContentGroups: websiteCrawl?.duplicateContentGroups ?? [],
      copyQualityFindings: websiteCrawl?.copyQualityFindings ?? [],
      orderingFrictionPages: websiteCrawl?.orderingFrictionPages ?? [],
    },
    profiles: {
      userConfirmedPlatforms: confirmedSocialPlatforms,
      userConfirmedSocialProfiles: confirmedSocialPlatforms.length,
      publiclyDetectedPlatforms,
      publiclyDetectedSocialProfiles: publiclyDetectedPlatforms.length,
      additionalDetectedPlatforms: publiclyDetectedPlatforms.filter(
        (platform) => !confirmedSocialPlatforms.includes(platform),
      ),
      pendingPlatforms: pendingSocialPlatforms,
      pendingSocialProfiles: pendingSocialPlatforms.length,
      profileContentAnalyzed: social.contentAnalyzedProfilesCount ?? 0,
    },
    scoreEvidence: {
      categories: categoryScoreEvidence,
      social: {
        score: social.score,
        scope: "PROFILE_COVERAGE",
        confidence: social.scoreConfidence ?? "LOW",
        performanceAnalyzed: false,
      },
      reviews: {
        score: reviews.score,
        status: reviews.scoreStatus ?? "INSUFFICIENT_DATA",
        confidence: reviews.scoreConfidence ?? "LOW",
        scope: reviews.scoreScope ?? "LISTING_PRESENCE",
        evidenceCompleteness: reviews.evidenceCompleteness ?? 0,
        dataRequirementsMet: reviews.dataRequirementsMet ?? false,
        missingInputs: reviews.missingInputs ?? [],
      },
    },
    coverage,
    scoreValues,
  };
}

function buildCategoryScoreEvidence({
  website,
  seo,
  social,
  reviews,
  coverage,
  competitorConfigured,
  competitorAnalyzed,
  businessProfiles,
  businessContext,
  scoreValues,
}: {
  website: WebsiteAnalysis | null;
  seo: SeoAnalysis | null;
  social: SocialAnalysis;
  reviews: ReviewAnalysis;
  coverage: AuditCoverageV2;
  competitorConfigured: boolean;
  competitorAnalyzed: boolean;
  businessProfiles: Array<{
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
  }>;
  businessContext: BusinessModelContext;
  scoreValues: Partial<Record<ScoreCategory, number>>;
}): NormalizedAuditFacts["scoreEvidence"]["categories"] {
  const crawlTotal =
    coverage.crawl.successfulPages + coverage.crawl.failedPages;
  const websiteCompleteness = website
    ? crawlTotal > 0
      ? Math.round((coverage.crawl.successfulPages / crawlTotal) * 100)
      : 100
    : 0;
  const websiteConfidence: FactConfidence = !website
    ? "LOW"
    : coverage.crawl.failedPages > 0
      ? "MEDIUM"
      : "HIGH";
  const confirmedProfileCount = businessProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  ).length;
  const contextFieldCount = [
    businessContext.description,
    businessContext.targetAudience,
    businessContext.mainOffer,
    businessContext.businessType,
    businessContext.primaryConversionGoal,
  ].filter((value) => Boolean(value?.trim())).length;
  const brandingCompleteness = Math.min(
    100,
    contextFieldCount * 10 + (website ? 30 : 0) + Math.min(20, confirmedProfileCount * 5),
  );
  const socialMissingInputs = [
    "Profile content",
    "Posting activity",
    "Engagement and performance",
  ];
  const competitorMissingInputs = competitorConfigured
    ? competitorAnalyzed
      ? []
      : ["Completed public competitor analysis"]
    : ["Saved competitors", "Completed public competitor analysis"];

  return {
    [ScoreCategory.OVERALL]: {
      score: scoreValues[ScoreCategory.OVERALL] ?? null,
      confidence:
        websiteConfidence === "LOW" ||
        social.scoreConfidence === "LOW" ||
        reviews.scoreConfidence === "LOW"
          ? "LOW"
          : "MEDIUM",
      coverageStatus:
        website || confirmedProfileCount > 0
          ? "PARTIAL"
          : "NOT_APPLICABLE",
      evidenceCompleteness: Math.round(
        (websiteCompleteness +
          social.evidenceCompleteness +
          reviews.evidenceCompleteness +
          (competitorAnalyzed ? 100 : 0) +
          brandingCompleteness) /
          5,
      ),
      dataRequirementsMet:
        Boolean(website) || confirmedProfileCount > 0,
      missingInputs: [
        ...(social.dataRequirementsMet ? [] : socialMissingInputs),
        ...(reviews.dataRequirementsMet ? [] : reviews.missingInputs),
        ...competitorMissingInputs,
      ],
    },
    [ScoreCategory.WEBSITE]: {
      score: website
        ? scoreValues[ScoreCategory.WEBSITE] ?? website.score
        : null,
      confidence: websiteConfidence,
      coverageStatus: !website
        ? "NOT_APPLICABLE"
        : coverage.crawl.failedPages > 0
          ? "PARTIAL"
          : "COMPLETE_FOR_AVAILABLE_SCOPE",
      evidenceCompleteness: websiteCompleteness,
      dataRequirementsMet: Boolean(website),
      missingInputs: website
        ? coverage.crawl.failedPages > 0
          ? ["Pages that failed to load"]
          : []
        : ["Confirmed website profile"],
    },
    [ScoreCategory.SEO]: {
      score: seo ? scoreValues[ScoreCategory.SEO] ?? seo.score : null,
      confidence: seo ? websiteConfidence : "LOW",
      coverageStatus: !seo
        ? "NOT_APPLICABLE"
        : coverage.crawl.failedPages > 0
          ? "PARTIAL"
          : "COMPLETE_FOR_AVAILABLE_SCOPE",
      evidenceCompleteness: seo ? websiteCompleteness : 0,
      dataRequirementsMet: Boolean(seo),
      missingInputs: seo
        ? coverage.crawl.failedPages > 0
          ? ["SEO signals from pages that failed to load"]
          : []
        : ["Confirmed website profile"],
    },
    [ScoreCategory.BRANDING]: {
      score: scoreValues[ScoreCategory.BRANDING] ?? null,
      confidence:
        brandingCompleteness >= 70
          ? "HIGH"
          : brandingCompleteness >= 40
            ? "MEDIUM"
            : "LOW",
      coverageStatus:
        brandingCompleteness >= 70
          ? "COMPLETE_FOR_AVAILABLE_SCOPE"
          : "PARTIAL",
      evidenceCompleteness: brandingCompleteness,
      dataRequirementsMet: contextFieldCount >= 3,
      missingInputs: [
        ...(contextFieldCount >= 3 ? [] : ["Confirmed Business Context"]),
        ...(website || confirmedProfileCount > 0
          ? []
          : ["Website or confirmed public profiles"]),
      ],
    },
    [ScoreCategory.SOCIAL]: {
      score: social.score,
      confidence: social.scoreConfidence,
      coverageStatus:
        social.confirmedProfilesCount > 0 ||
        social.pendingProfilesCount > 0
          ? "LIMITED"
          : "NOT_CONFIGURED",
      evidenceCompleteness: social.evidenceCompleteness,
      dataRequirementsMet: social.dataRequirementsMet,
      missingInputs: socialMissingInputs,
    },
    [ScoreCategory.REVIEWS]: {
      score: reviews.score,
      confidence: reviews.scoreConfidence,
      coverageStatus:
        reviews.googleBusinessStatus === "missing"
          ? "NOT_CONFIGURED"
          : reviews.dataRequirementsMet
            ? "COMPLETE_FOR_AVAILABLE_SCOPE"
            : "LIMITED",
      evidenceCompleteness: reviews.evidenceCompleteness,
      dataRequirementsMet: reviews.dataRequirementsMet,
      missingInputs: reviews.missingInputs,
    },
    [ScoreCategory.COMPETITORS]: {
      score: competitorAnalyzed
        ? scoreValues[ScoreCategory.COMPETITORS] ?? null
        : null,
      confidence: competitorAnalyzed ? "MEDIUM" : "LOW",
      coverageStatus: competitorAnalyzed
        ? "COMPLETE_FOR_AVAILABLE_SCOPE"
        : competitorConfigured
          ? "LIMITED"
          : "NOT_CONFIGURED",
      evidenceCompleteness: competitorAnalyzed
        ? 100
        : competitorConfigured
          ? 35
          : 0,
      dataRequirementsMet: competitorAnalyzed,
      missingInputs: competitorMissingInputs,
    },
  };
}

export function readNormalizedAuditFacts(
  snapshot: unknown,
): NormalizedAuditFacts | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.normalizedFacts)) return null;
  const value = snapshot.normalizedFacts;
  if (
    value.version !== NORMALIZED_AUDIT_FACTS_VERSION ||
    !isRecord(value.siteWide) ||
    !isRecord(value.profiles) ||
    !isRecord(value.coverage) ||
    !isRecord(value.scoreEvidence)
  ) {
    return null;
  }
  return value as NormalizedAuditFacts;
}

export function preferKnownFact<T>(
  current: T | null | undefined,
  candidate: T | null | undefined,
) {
  return current ?? candidate ?? null;
}

function normalizedHomepageFacts({
  website,
  homepagePage,
  seo,
}: {
  website: WebsiteAnalysis;
  homepagePage: CrawledPageResult | null;
  seo: SeoAnalysis | null;
}): NormalizedPageFacts {
  const title = preferKnownFact(website.pageTitle, homepagePage?.title);
  const metaDescription = preferKnownFact(
    website.metaDescription,
    homepagePage?.metaDescription,
  );
  const h1Count = website.h1Count;
  const h1Values =
    website.h1Text.length > 0 ? website.h1Text : homepagePage?.h1Text ?? [];
  const actionSummary = website.actionSummary ?? homepagePage?.actionSummary;
  const primaryCtaClarity =
    actionSummary?.primaryCtaAssessment?.clarity ?? "NOT_ASSESSED";

  return {
    url: website.normalizedUrl || homepagePage?.url || "",
    title: {
      value: title,
      length: title?.length ?? 0,
      status: normalizeTextStatus(seo?.titleStatus, title),
      confidence: "HIGH",
    },
    metaDescription: {
      value: metaDescription,
      length: metaDescription?.length ?? 0,
      status: normalizeTextStatus(seo?.metaDescriptionStatus, metaDescription),
      confidence: "HIGH",
    },
    h1: {
      count: h1Count,
      values: h1Values,
      status: h1Count === 1 ? "GOOD" : h1Count === 0 ? "MISSING" : "MULTIPLE",
      confidence: "HIGH",
    },
    actions: {
      detectedTypes: actionSummary?.detectedActionTypes ?? [],
      conversionLinks: actionSummary?.conversionLinks ?? [],
      contactActions: actionSummary?.contactActions ?? [],
      emailActions: actionSummary?.emailActions ?? [],
      orderActions: actionSummary?.orderActions ?? [],
      bookingActions: actionSummary?.bookingActions ?? [],
      newsletterActions: actionSummary?.newsletterActions ?? [],
      socialLinks:
        actionSummary?.socialLinks ?? website.detectedSocialLinks ?? [],
      primaryCtaClarity,
    },
  };
}

function buildCoverage({
  website,
  websiteCrawl,
  selectiveAi,
  confirmedSocialProfiles,
  detectedSocialProfiles,
  pendingSocialProfiles,
  socialContentAnalyzed,
  reviews,
  competitorConfigured,
  competitorAnalyzed,
}: {
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  selectiveAi: SelectiveAiAuditSnapshot | null;
  confirmedSocialProfiles: number;
  detectedSocialProfiles: number;
  pendingSocialProfiles: number;
  socialContentAnalyzed: number;
  reviews: ReviewAnalysis;
  competitorConfigured: boolean;
  competitorAnalyzed: boolean;
}): AuditCoverageV2 {
  const crawlStatus = !website
    ? ("NOT_APPLICABLE" as const)
    : !websiteCrawl
      ? ("HOMEPAGE_ONLY" as const)
      : websiteCrawl.failedPages > 0
        ? ("PARTIAL_FAILURES" as const)
        : websiteCrawl.crawlLimitReached
          ? ("LIMITED_TO_CRAWL_SCOPE" as const)
          : ("COMPLETE_FOR_ELIGIBLE_CRAWLED_PAGES" as const);
  const selectedPages = selectiveAi?.coverage.selectedPages ?? 0;
  const completedPages = selectiveAi?.coverage.deepReviewedPages ?? 0;
  const failedAiPages = selectiveAi?.coverage.failedAiPages ?? 0;
  const aiStatus = !selectiveAi?.enabled
    ? ("NOT_ENABLED" as const)
    : selectedPages === 0
      ? ("NOT_APPLICABLE" as const)
      : completedPages === selectedPages && failedAiPages === 0
        ? ("COMPLETE_FOR_SELECTED_PAGES" as const)
        : ("PARTIAL_FOR_SELECTED_PAGES" as const);

  return {
    version: COVERAGE_MODEL_VERSION,
    crawl: {
      eligiblePages:
        selectiveAi?.coverage.eligiblePages ??
        websiteCrawl?.successfulPages ??
        (website ? 1 : 0),
      successfulPages: websiteCrawl?.successfulPages ?? (website ? 1 : 0),
      failedPages: websiteCrawl?.failedPages ?? 0,
      excludedPages:
        (selectiveAi?.coverage.excludedUtilityPages ?? 0) +
        (selectiveAi?.coverage.duplicateRepresentatives ?? 0),
      crawlLimit: websiteCrawl?.crawlLimitUsed ?? (website ? 1 : 0),
      crawlLimitReached: websiteCrawl?.crawlLimitReached ?? false,
      status: crawlStatus,
      explanation: crawlExplanation(crawlStatus, websiteCrawl),
    },
    technical: {
      pagesAnalyzed: websiteCrawl?.successfulPages ?? (website ? 1 : 0),
      status: !website
        ? "NOT_APPLICABLE"
        : (websiteCrawl?.failedPages ?? 0) > 0
          ? "PARTIAL"
          : "COMPLETE",
      explanation: !website
        ? "No website was provided, so technical website analysis was not applicable."
        : `${websiteCrawl?.successfulPages ?? 1} fetched page${(websiteCrawl?.successfulPages ?? 1) === 1 ? " was" : "s were"} analyzed with deterministic checks.`,
    },
    aiContent: {
      selectedPages,
      completedPages,
      failedPages: failedAiPages,
      deterministicOnlyPages:
        selectiveAi?.coverage.deterministicOnlyPages ?? 0,
      status: aiStatus,
      explanation:
        aiStatus === "COMPLETE_FOR_SELECTED_PAGES"
          ? `${completedPages} of ${selectedPages} selected pages completed AI content review.`
          : aiStatus === "PARTIAL_FOR_SELECTED_PAGES"
            ? `${completedPages} of ${selectedPages} selected pages completed AI content review; ${failedAiPages} failed.`
            : aiStatus === "NOT_ENABLED"
              ? "Selective AI content review was not enabled; deterministic analysis remains available."
              : "No pages were selected for AI content review.",
    },
    socialProfiles: {
      userConfirmed: confirmedSocialProfiles,
      publiclyDetected: detectedSocialProfiles,
      pending: pendingSocialProfiles,
      contentAnalyzed: socialContentAnalyzed,
      status:
        socialContentAnalyzed > 0
          ? "CONTENT_ANALYZED"
          : confirmedSocialProfiles > 0 || detectedSocialProfiles > 0
            ? "PROFILE_ONLY"
            : "NOT_CONFIGURED",
      explanation:
        socialContentAnalyzed > 0
          ? `${socialContentAnalyzed} social profile${socialContentAnalyzed === 1 ? " was" : "s were"} analyzed beyond profile presence.`
          : "Profile presence and confirmation were assessed; posts, engagement, activity, and performance were not analyzed.",
    },
    reviews: {
      listingConfirmed: reviews.googleBusinessStatus === "confirmed",
      ratingAvailable: typeof reviews.googleRating === "number",
      countAvailable: typeof reviews.googleReviewCount === "number",
      status:
        reviews.googleBusinessStatus === "missing"
          ? "NOT_CONFIGURED"
          : reviews.dataRequirementsMet
            ? "SCORABLE"
            : "LIMITED",
      explanation: reviews.reviewScoreExplanation,
    },
    competitors: {
      configured: competitorConfigured,
      analyzed: competitorAnalyzed,
      status: competitorAnalyzed
        ? "ANALYZED"
        : competitorConfigured
          ? "SAVED_NOT_ANALYZED"
          : "NOT_CONFIGURED",
      explanation: competitorAnalyzed
        ? "At least one saved competitor has a usable public comparison snapshot."
        : competitorConfigured
          ? "Competitors are saved, but no usable public comparison snapshot was available."
          : "No competitors were configured for this audit.",
    },
  };
}

function crawlExplanation(
  status: AuditCoverageV2["crawl"]["status"],
  crawl: WebsiteCrawlResult | null,
) {
  if (status === "NOT_APPLICABLE") return "No website was provided.";
  if (status === "HOMEPAGE_ONLY") return "Only the homepage was analyzed.";
  if (status === "PARTIAL_FAILURES") {
    return `${crawl?.successfulPages ?? 0} pages loaded and ${crawl?.failedPages ?? 0} failed.`;
  }
  if (status === "LIMITED_TO_CRAWL_SCOPE") {
    return `${crawl?.successfulPages ?? 0} eligible pages were analyzed before the ${crawl?.crawlLimitUsed ?? 0}-page crawl limit was reached. This is not a claim of full-site discovery.`;
  }
  return `${crawl?.successfulPages ?? 0} eligible canonical pages discovered within the crawl scope were analyzed successfully. This does not claim every page on the website was discovered.`;
}

function findHomepagePage(
  website: WebsiteAnalysis | null,
  crawl: WebsiteCrawlResult | null,
) {
  if (!crawl) return null;
  const analyzed = crawl.pageResults.filter(
    (page) => page.analysisStatus !== "FAILED",
  );
  if (website) {
    const websiteUrl = normalizeComparableUrl(website.normalizedUrl);
    const exact = analyzed.find(
      (page) => normalizeComparableUrl(page.url) === websiteUrl,
    );
    if (exact) return exact;
  }
  return (
    analyzed.find((page) => page.pageTypes.includes("Homepage")) ??
    analyzed.at(0) ??
    null
  );
}

function detectedSocialPlatforms({
  website,
  websiteCrawl,
  pendingSocialPlatforms,
}: {
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  pendingSocialPlatforms: string[];
}) {
  return unique([
    ...pendingSocialPlatforms,
    ...(website?.detectedSocialLinks ?? []).map(platformFromUrl).filter(Boolean),
    ...(websiteCrawl?.pageResults ?? []).flatMap((page) =>
      (page.actionSummary.socialLinks ?? []).map((value) =>
        platformFromUrl(value) || value,
      ),
    ),
  ] as string[]);
}

function platformFromUrl(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("instagram")) return "Instagram";
  if (normalized.includes("facebook")) return "Facebook";
  if (normalized.includes("tiktok")) return "TikTok";
  if (normalized.includes("youtube")) return "YouTube";
  if (normalized.includes("linkedin")) return "LinkedIn";
  if (normalized.includes("pinterest")) return "Pinterest";
  if (normalized.includes("twitter") || normalized.includes("x.com")) return "X";
  return "";
}

function normalizeTextStatus(status: unknown, value: string | null) {
  const normalized = typeof status === "string" ? status.toLowerCase() : "";
  if (!value || normalized === "missing") return "MISSING" as const;
  if (normalized === "too_short") return "TOO_SHORT" as const;
  if (normalized === "too_long") return "TOO_LONG" as const;
  if (normalized === "good" || normalized === "present") return "GOOD" as const;
  return "UNKNOWN" as const;
}

function isSocialPlatform(platform: ProfilePlatform) {
  const socialPlatforms: ProfilePlatform[] = [
    ProfilePlatform.INSTAGRAM,
    ProfilePlatform.FACEBOOK,
    ProfilePlatform.TIKTOK,
    ProfilePlatform.YOUTUBE,
    ProfilePlatform.LINKEDIN,
    ProfilePlatform.X,
    ProfilePlatform.PINTEREST,
  ];
  return socialPlatforms.includes(platform);
}

function platformLabel(platform: ProfilePlatform) {
  return platform
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeComparableUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/(?:index(?:\.html?)?|home)\/?$/i, "/");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return `${url.hostname.replace(/^www\./, "")}${url.pathname}`;
  } catch {
    return value.toLowerCase().replace(/\/+$/, "");
  }
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

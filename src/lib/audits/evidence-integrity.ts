import {
  BusinessProfileStatus,
  ProfilePlatform,
  RecommendationPriority,
  ScoreCategory,
} from "@prisma/client";

import { getPrimaryCtaAssessment } from "@/lib/analyzers/action-classifier";
import {
  contactSignalEvidenceId,
  type ContactEvidenceSummary,
  type ExtractedInteractionEvidence,
} from "@/lib/analyzers/interaction-evidence";
import type { ReviewAnalysis } from "@/lib/analyzers/review-analyzer";
import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import type { SocialAnalysis } from "@/lib/analyzers/social-analyzer";
import type {
  CrawledPageResult,
  WebsiteCrawlResult,
} from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import {
  buildEvidenceValidationWarnings,
  validateAuditClaims,
} from "@/lib/audits/claim-validator";
import { detectAuditDataConflicts } from "@/lib/audits/data-conflicts";
import {
  EVIDENCE_CONTRACT_VERSION,
  stableEvidenceId,
  type AuditClaim,
  type AuditEvidenceIntegritySnapshot,
  type AuditEvidenceRecord,
  type ScoreBreakdown,
} from "@/lib/audits/evidence-contracts";
import { normalizeFindingCopy } from "@/lib/audits/finding-copy";
import type { CompetitorComparisonResult } from "@/lib/competitors/competitor-types";
import {
  aggregateCompetitorProfileCounts,
  aggregateProfileCounts,
} from "@/lib/profiles/profile-counts";
import {
  canonicalizeRecommendations,
  type FindingCandidate,
  type RecommendationCandidate,
} from "@/lib/recommendations/recommendation-deduplication";

export const EVIDENCE_INTEGRITY_BUILDER_VERSION =
  "evidence-integrity-builder-v2-normalized-interactions";

export function buildAuditEvidenceIntegrity<
  T extends RecommendationCandidate,
  F extends FindingCandidate,
>({
  website,
  websiteCrawl,
  seo,
  social,
  reviews,
  businessContext,
  businessProfiles,
  competitors,
  competitorComparison,
  recommendations,
  findings,
  scoreBreakdowns,
  observedAt,
  sourceVersions,
}: {
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  seo: SeoAnalysis | null;
  social: SocialAnalysis;
  reviews: ReviewAnalysis;
  businessContext: {
    description?: string | null;
    targetAudience?: string | null;
    mainOffer?: string | null;
    industry?: string | null;
    businessType?: string | null;
    primaryConversionGoal?: string | null;
  };
  businessProfiles: Array<{
    id: string;
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
  }>;
  competitors: Array<{
    id: string;
    name: string;
    profiles: Array<{
      id: string;
      platform: ProfilePlatform;
      status: BusinessProfileStatus;
    }>;
  }>;
  competitorComparison: CompetitorComparisonResult | null;
  recommendations: T[];
  findings: F[];
  scoreBreakdowns: ScoreBreakdown[];
  observedAt: Date | string;
  sourceVersions: Record<string, string>;
}) {
  const generatedAt = dateString(observedAt);
  const dataConflicts = detectAuditDataConflicts({
    website,
    websiteCrawl,
    businessContextDescription: businessContext.description,
  });
  const businessCountInput = [...businessProfiles];
  if (
    reviews.googleBusinessStatus === "confirmed" &&
    !businessCountInput.some(
      (profile) => profile.platform === ProfilePlatform.GOOGLE_BUSINESS,
    )
  ) {
    businessCountInput.push({
      id: "current-google-business",
      platform: ProfilePlatform.GOOGLE_BUSINESS,
      status: BusinessProfileStatus.CONFIRMED,
    });
  }
  const businessProfileCounts = aggregateProfileCounts(businessCountInput);
  const competitorCounts = aggregateCompetitorProfileCounts(competitors);
  const observedEvidence = buildEvidenceRecords({
    website,
    websiteCrawl,
    seo,
    social,
    reviews,
    businessContext,
    businessProfiles: businessCountInput,
    competitors,
    competitorComparison,
    dataConflicts,
    observedAt: generatedAt,
    sourceVersions,
  });
  const documentedScoreBreakdowns = attachScoreEvidence(
    scoreBreakdowns,
    observedEvidence,
  );
  const evidence = dedupeEvidence([
    ...observedEvidence,
    ...scoreComponentEvidence(documentedScoreBreakdowns),
  ]);
  const normalizedFindings = findings.map(normalizeFindingCopy);
  const recommendationsWithConflicts = [
    ...recommendations,
    ...dataConflicts
      .filter((conflict) => conflict.field === "operatingHours")
      .map(
        (conflict) =>
          ({
            title: "Align operating-hours wording across the website",
            description: conflict.action,
            category: ScoreCategory.SEO,
            priority: RecommendationPriority.MEDIUM,
            estimatedEffort: "Low",
            expectedImpact: "Medium",
          }) as T,
      ),
  ];
  const canonicalRecommendations = canonicalizeRecommendations({
    recommendations: recommendationsWithConflicts,
    findings: normalizedFindings,
    evidence,
    generatedAt,
  });
  const claims = buildClaims({
    website,
    websiteCrawl,
    evidence,
    businessProfileCounts,
    competitorProfileCounts: competitorCounts.totals,
  });
  const validatedClaims = validateAuditClaims(claims, evidence);
  const validationWarnings = [
    ...buildEvidenceValidationWarnings({
      evidence,
      recommendations: canonicalRecommendations,
      businessProfileCounts,
      competitorProfileCounts: competitorCounts.totals,
    }),
    ...dataConflicts.map((conflict) => ({
      code: "DATA_CONFLICT_REQUIRES_REVIEW" as const,
      severity: "WARNING" as const,
      message: conflict.explanation,
      relatedIds: [conflict.id],
      safeFallback: conflict.action,
    })),
    ...validatedClaims
      .filter((claim) => !claim.valid)
      .map((claim) => ({
        code:
          claim.kind === "CLEAR_PRIMARY_CTA_PAGE_COUNT"
            ? ("CLEAR_CTA_CLAIM_LACKS_PAGE_EVIDENCE" as const)
            : ("STALE_FINDING_CONTRADICTS_LIVE_STATE" as const),
        severity: "ERROR" as const,
        message: `${claim.text} was rejected: ${claim.reasons.join(" ")}`,
        relatedIds: [claim.id, ...claim.requiredEvidenceIds],
        safeFallback: claim.correctedClaim,
      })),
  ];
  const snapshot: AuditEvidenceIntegritySnapshot = {
    contractVersion: EVIDENCE_CONTRACT_VERSION,
    generatedAt,
    evidence,
    validatedClaims,
    scoreBreakdowns: documentedScoreBreakdowns,
    canonicalRecommendations: canonicalRecommendations.map((item) => ({
      issueKey: item.issueKey,
      rootCauseKey: item.rootCauseKey,
      sourceFindingId: item.sourceFindingId,
      sourceFindingIds: item.sourceFindingIds,
      sourceEvidenceIds: item.sourceEvidenceIds,
      affectedUrls: item.affectedUrls,
      sourceTypes: item.sourceTypes,
      findingType: item.findingType,
      sourceCategory: item.sourceCategory,
      recommendationType: item.recommendationType,
      fullEvidence: item.fullEvidence,
      reportEvidence: item.reportEvidence,
      evidenceConfidence: item.evidenceConfidence,
      generatedAt: item.generatedAt,
      generatorVersion: item.generatorVersion,
      title: item.title,
      description: item.description,
      category: item.category,
      priority: item.priority,
      estimatedEffort: item.estimatedEffort,
      expectedImpact: item.expectedImpact,
    })),
    dataConflicts,
    profileCounts: {
      business: businessProfileCounts,
      competitors: competitorCounts.competitors,
      totals: competitorCounts.totals,
    },
    validationWarnings,
    sourceVersions: {
      ...sourceVersions,
      evidenceIntegrity: EVIDENCE_INTEGRITY_BUILDER_VERSION,
    },
  };

  return {
    snapshot,
    findings: normalizedFindings,
    recommendations: canonicalRecommendations,
  };
}

function attachScoreEvidence(
  scoreBreakdowns: ScoreBreakdown[],
  evidence: AuditEvidenceRecord[],
) {
  return scoreBreakdowns.map((breakdown) => ({
    ...breakdown,
    components: breakdown.components.map((component) => ({
      ...component,
      evidenceIds: relevantScoreEvidence(
        breakdown.category,
        component.key,
        evidence,
      ).map((item) => item.id),
    })),
  }));
}

function relevantScoreEvidence(
  category: ScoreCategory,
  key: string,
  evidence: AuditEvidenceRecord[],
) {
  if (category === ScoreCategory.OVERALL) {
    const componentCategory = key.split(":").at(1)?.toUpperCase();
    return evidence.filter((item) => item.category === componentCategory);
  }
  if (key.includes("multi-page") || key.includes("important-page")) {
    return evidence.filter((item) =>
      item.sourcePath.startsWith("websiteCrawl.pages."),
    );
  }
  if (key.includes("homepage") || key.includes("technical")) {
    return evidence.filter(
      (item) =>
        item.category === category &&
        (item.sourcePath.startsWith("website.homepage") ||
          item.source === "seo_analyzer"),
    );
  }
  if (category === ScoreCategory.SOCIAL) {
    return evidence.filter(
      (item) =>
        item.category === ScoreCategory.SOCIAL &&
        item.sourcePath.startsWith("profiles.business"),
    );
  }
  if (category === ScoreCategory.REVIEWS) {
    return evidence.filter((item) => item.category === ScoreCategory.REVIEWS);
  }
  if (category === ScoreCategory.COMPETITORS) {
    return evidence.filter(
      (item) =>
        item.type === "COMPETITOR_SNAPSHOT" ||
        item.sourcePath.startsWith("profiles.competitor"),
    );
  }
  return evidence.filter((item) => item.category === category);
}

function scoreComponentEvidence(scoreBreakdowns: ScoreBreakdown[]) {
  return scoreBreakdowns.flatMap((breakdown) =>
    breakdown.components.map<AuditEvidenceRecord>((component) => ({
      id: stableEvidenceId(
        "score",
        breakdown.category,
        component.key,
        breakdown.calculatedAt,
      ),
      type: "SCORE_COMPONENT",
      category: breakdown.category,
      source: "scoring_engine",
      sourceUrl: null,
      sourcePage: null,
      sourcePath: `scoring.${breakdown.category.toLowerCase()}.${component.key}`,
      observedValue: component.value,
      interpretedValue: {
        contribution: component.contribution,
        weight: component.weight,
      },
      confidence: component.confidence,
      applicability: breakdown.applicable ? "APPLICABLE" : "NOT_APPLICABLE",
      observedAt: breakdown.calculatedAt,
      analyzerVersion: breakdown.engineVersion,
      explanation: component.explanation,
      issueKeys: [],
    })),
  );
}

function buildEvidenceRecords({
  website,
  websiteCrawl,
  seo,
  social,
  reviews,
  businessContext,
  businessProfiles,
  competitors,
  competitorComparison,
  dataConflicts,
  observedAt,
  sourceVersions,
}: {
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  seo: SeoAnalysis | null;
  social: SocialAnalysis;
  reviews: ReviewAnalysis;
  businessContext: Record<string, string | null | undefined>;
  businessProfiles: Array<{
    id: string;
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
  }>;
  competitors: Array<{
    id: string;
    name: string;
    profiles: Array<{
      id: string;
      platform: ProfilePlatform;
      status: BusinessProfileStatus;
    }>;
  }>;
  competitorComparison: CompetitorComparisonResult | null;
  dataConflicts: ReturnType<typeof detectAuditDataConflicts>;
  observedAt: string;
  sourceVersions: Record<string, string>;
}) {
  const records: AuditEvidenceRecord[] = [];

  if (website) {
    records.push(
      titleEvidence({
        url: website.normalizedUrl,
        page: "Homepage",
        path: "website.homepage.titleLength",
        title: website.pageTitle,
        status: seo?.titleStatus ?? "unknown",
        observedAt,
        analyzerVersion: sourceVersions.seo ?? "unknown",
      }),
      h1Evidence({
        url: website.normalizedUrl,
        page: "Homepage",
        path: "website.homepage.h1Count",
        count: website.h1Count,
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
      actionLinkEvidence({
        url: website.normalizedUrl,
        page: "Homepage",
        path: "website.homepage.actionLinks",
        summary: website.actionSummary,
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
      ctaAssessmentEvidence({
        url: website.normalizedUrl,
        page: "Homepage",
        path: "website.homepage.primaryCtaAssessment",
        summary: website.actionSummary,
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
      {
        id: stableEvidenceId("website", "homepage", "meta-description-length"),
        type: "META_DESCRIPTION_LENGTH",
        category: ScoreCategory.SEO,
        source: "website_analyzer",
        sourceUrl: website.normalizedUrl,
        sourcePage: "Homepage",
        sourcePath: "website.homepage.metaDescriptionLength",
        observedValue: website.metaDescription?.length ?? 0,
        interpretedValue: seo?.metaDescriptionStatus ?? "unknown",
        confidence: "HIGH",
        applicability: "APPLICABLE",
        observedAt,
        analyzerVersion: sourceVersions.seo ?? "unknown",
        explanation: `The homepage meta description is ${website.metaDescription?.length ?? 0} characters long.`,
        issueKeys:
          seo?.metaDescriptionStatus === "too_long"
            ? ["homepage:meta-description:too-long"]
            : seo?.metaDescriptionStatus === "missing"
              ? ["sitewide:meta-description:missing"]
              : [],
      },
      {
        id: stableEvidenceId("website", "homepage", "canonical"),
        type: "CANONICAL_STATUS",
        category: ScoreCategory.SEO,
        source: "website_analyzer",
        sourceUrl: website.normalizedUrl,
        sourcePage: "Homepage",
        sourcePath: "website.homepage.hasCanonical",
        observedValue: website.hasCanonical,
        interpretedValue: website.hasCanonical ? "PRESENT" : "MISSING",
        confidence: "HIGH",
        applicability: "APPLICABLE",
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
        explanation: `The homepage canonical tag is ${website.hasCanonical ? "present" : "missing"}.`,
        issueKeys: website.hasCanonical ? [] : ["homepage:canonical:missing"],
      },
      {
        id: stableEvidenceId("website", "homepage", "viewport"),
        type: "VIEWPORT_STATUS",
        category: ScoreCategory.SEO,
        source: "website_analyzer",
        sourceUrl: website.normalizedUrl,
        sourcePage: "Homepage",
        sourcePath: "website.homepage.hasViewportMeta",
        observedValue: website.hasViewportMeta,
        interpretedValue:
          seo?.viewportStatus ?? (website.hasViewportMeta ? "good" : "missing"),
        confidence: "HIGH",
        applicability: "APPLICABLE",
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
        explanation: `The homepage viewport meta tag is ${website.hasViewportMeta ? "present" : "missing"}.`,
        issueKeys: website.hasViewportMeta ? [] : ["homepage:viewport:missing"],
      },
      {
        id: stableEvidenceId("website", "homepage", "image-alt-coverage"),
        type: "IMAGE_ALT_COVERAGE",
        category: ScoreCategory.SEO,
        source: "website_analyzer",
        sourceUrl: website.normalizedUrl,
        sourcePage: "Homepage",
        sourcePath: "website.homepage.imageAltCoverage",
        observedValue: {
          imageCount: website.imageCount,
          imagesMissingAltCount: website.imagesMissingAltCount,
        },
        interpretedValue:
          website.imagesMissingAltCount > 0 ? "NEEDS_IMPROVEMENT" : "GOOD",
        confidence: "HIGH",
        applicability: "APPLICABLE",
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
        explanation: `The homepage has ${website.imageCount} images; ${website.imagesMissingAltCount} are missing alt text.`,
        issueKeys:
          website.imagesMissingAltCount > 0
            ? ["sitewide:image-alt:missing"]
            : [],
      },
    );
    records.push(
      ...interactionEvidenceRecords({
        interactions: website.interactionEvidence ?? [],
        page: "Homepage",
        path: "website.homepage.interactions",
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
      ...contactEvidenceRecords({
        url: website.finalUrl ?? website.normalizedUrl,
        page: "Homepage",
        path: "website.homepage.contact",
        contact: website.contactEvidence,
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
    );
  } else {
    records.push({
      id: stableEvidenceId("website", "unavailable"),
      type: "DATA_UNAVAILABLE",
      category: ScoreCategory.WEBSITE,
      source: "website_analyzer",
      sourceUrl: null,
      sourcePage: null,
      sourcePath: "website",
      observedValue: null,
      interpretedValue: "NOT_APPLICABLE",
      confidence: "HIGH",
      applicability: "NOT_APPLICABLE",
      observedAt,
      analyzerVersion: sourceVersions.website ?? "unknown",
      explanation: "No confirmed website was provided, so website CTA evidence is not applicable.",
      issueKeys: [],
    });
  }

  if (seo) {
    records.push(
      seoStatusEvidence({
        type: "ROBOTS_TXT_STATUS",
        path: "seo.robotsTxtStatus",
        label: "robots.txt",
        status: seo.robotsTxtStatus,
        url: website
          ? new URL("/robots.txt", website.normalizedUrl).toString()
          : null,
        issueKey:
          seo.robotsTxtStatus === "found" ? null : "seo:robots:status",
        observedAt,
        analyzerVersion: sourceVersions.seo ?? "unknown",
      }),
      seoStatusEvidence({
        type: "SITEMAP_STATUS",
        path: "seo.sitemapStatus",
        label: "sitemap.xml",
        status: seo.sitemapStatus,
        url: website
          ? new URL("/sitemap.xml", website.normalizedUrl).toString()
          : null,
        issueKey:
          seo.sitemapStatus === "found" ? null : "seo:sitemap:status",
        observedAt,
        analyzerVersion: sourceVersions.seo ?? "unknown",
      }),
    );
  }

  for (const page of websiteCrawl?.pageResults ?? []) {
    records.push(
      titleEvidence({
        url: page.url,
        page: pageLabel(page.url, page.pageTypes),
        path: `websiteCrawl.pages.${page.url}.titleLength`,
        title: page.title,
        status: page.title ? "present" : "missing",
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
      metaDescriptionEvidence({
        url: page.url,
        page: pageLabel(page.url, page.pageTypes),
        path: `websiteCrawl.pages.${page.url}.metaDescriptionLength`,
        description: page.metaDescription,
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
      h1Evidence({
        url: page.url,
        page: pageLabel(page.url, page.pageTypes),
        path: `websiteCrawl.pages.${page.url}.h1Count`,
        count: page.h1Count,
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
      actionLinkEvidence({
        url: page.url,
        page: pageLabel(page.url, page.pageTypes),
        path: `websiteCrawl.pages.${page.url}.actionLinks`,
        summary: page.actionSummary,
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
      ctaAssessmentEvidence({
        url: page.url,
        page: pageLabel(page.url, page.pageTypes),
        path: `websiteCrawl.pages.${page.url}.primaryCtaAssessment`,
        summary: page.actionSummary,
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
      {
        id: stableEvidenceId("website", page.url, "page-types"),
        type: "PAGE_TYPE_DETECTED",
        category: ScoreCategory.WEBSITE,
        source: "website_crawler",
        sourceUrl: page.url,
        sourcePage: pageLabel(page.url, page.pageTypes),
        sourcePath: `websiteCrawl.pages.${page.url}.pageTypes`,
        observedValue: page.pageTypes,
        interpretedValue: null,
        confidence: "MEDIUM",
        applicability: "APPLICABLE",
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
        explanation: `Detected page types: ${page.pageTypes.join(", ") || "none"}.`,
        issueKeys: [],
      },
      {
        id: stableEvidenceId("website", page.url, "image-alt-coverage"),
        type: "IMAGE_ALT_COVERAGE",
        category: ScoreCategory.SEO,
        source: "website_crawler",
        sourceUrl: page.url,
        sourcePage: pageLabel(page.url, page.pageTypes),
        sourcePath: `websiteCrawl.pages.${page.url}.imageAltCoverage`,
        observedValue: {
          imageCount: page.imageCount,
          imagesMissingAltCount: page.imagesMissingAltCount,
        },
        interpretedValue:
          page.imagesMissingAltCount > 0 ? "NEEDS_IMPROVEMENT" : "GOOD",
        confidence: "HIGH",
        applicability: "APPLICABLE",
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
        explanation: `${pageLabel(page.url, page.pageTypes)} has ${page.imageCount} images; ${page.imagesMissingAltCount} are missing alt text.`,
        issueKeys:
          page.imagesMissingAltCount > 0
            ? ["sitewide:image-alt:missing"]
            : [],
      },
    );
    records.push(
      fetchQualityEvidence({
        page,
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
      ...interactionEvidenceRecords({
        interactions: page.interactionEvidence ?? [],
        page: pageLabel(page.url, page.pageTypes),
        path: `websiteCrawl.pages.${page.url}.interactions`,
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
      ...contactEvidenceRecords({
        url: page.url,
        page: pageLabel(page.url, page.pageTypes),
        path: `websiteCrawl.pages.${page.url}.contact`,
        contact: page.contactEvidence,
        observedAt,
        analyzerVersion: sourceVersions.website ?? "unknown",
      }),
    );
  }

  records.push({
    id: stableEvidenceId("business-context", "current"),
    type: "BUSINESS_CONTEXT",
    category: ScoreCategory.BRANDING,
    source: "business_context",
    sourceUrl: null,
    sourcePage: null,
    sourcePath: "business.context",
    observedValue: businessContext,
    interpretedValue: null,
    confidence: "MEDIUM",
    applicability: "APPLICABLE",
    observedAt,
    analyzerVersion: "business-context-v1",
    explanation:
      "Business Context supplies the saved audience, offer, business type, and conversion goal used for personalization.",
    issueKeys: ["homepage:primary-cta:unclear"],
  });

  records.push({
    id: stableEvidenceId("social", "coverage", observedAt),
    type: "SOCIAL_COVERAGE",
    category: ScoreCategory.SOCIAL,
    source: "social_analyzer",
    sourceUrl: null,
    sourcePage: null,
    sourcePath: "social.platformCoverage",
    observedValue: {
      confirmedProfilesCount: social.confirmedProfilesCount,
      pendingProfilesCount: social.pendingProfilesCount,
      removedProfilesCount: social.removedProfilesCount,
      confirmedPlatforms: social.confirmedPlatforms,
      pendingPlatforms: social.pendingPlatforms,
    },
    interpretedValue: {
      coverageLevel: social.platformCoverageLevel,
      score: social.score,
    },
    confidence: "HIGH",
    applicability: "APPLICABLE",
    observedAt,
    analyzerVersion: sourceVersions.social ?? "unknown",
    explanation: `Social coverage is ${social.platformCoverageLevel}; ${social.confirmedProfilesCount} profiles are confirmed and ${social.pendingProfilesCount} are pending.`,
    issueKeys: [
      "social:content-plan:weekly",
      ...(social.pendingProfilesCount > 0 ? ["social:profiles:pending"] : []),
      ...(social.confirmedProfilesCount === 0
        ? ["social:profiles:missing"]
        : []),
    ],
  });

  for (const profile of businessProfiles) {
    records.push(profileEvidence(profile, "business", null, observedAt));
  }
  for (const competitor of competitors) {
    for (const profile of competitor.profiles) {
      records.push(
        profileEvidence(
          profile,
          `competitor.${competitor.id}`,
          competitor.name,
          observedAt,
        ),
      );
    }
  }

  if (reviews.googleBusinessStatus === "confirmed") {
    records.push({
      id: stableEvidenceId("reviews", "google-business", "confirmed"),
      type: "GOOGLE_LISTING_CONFIRMED",
      category: ScoreCategory.REVIEWS,
      source: "review_analyzer",
      sourceUrl: reviews.googleMapsUri,
      sourcePage: reviews.googleBusinessListingName,
      sourcePath: "reviews.googleBusinessStatus",
      observedValue: "confirmed",
      interpretedValue: "CONFIRMED",
      confidence: "HIGH",
      applicability: "APPLICABLE",
      observedAt,
      analyzerVersion: sourceVersions.reviews ?? "unknown",
      explanation: "A current Google Business listing is confirmed.",
      issueKeys: ["reviews:proof:not-featured", "reviews:request-process:missing"],
    });
    records.push({
      id: stableEvidenceId("reviews", "google-business", "metrics"),
      type: "REVIEW_METRICS",
      category: ScoreCategory.REVIEWS,
      source: "review_analyzer",
      sourceUrl: reviews.googleMapsUri,
      sourcePage: reviews.googleBusinessListingName,
      sourcePath: "reviews.googleMetrics",
      observedValue: {
        rating: reviews.googleRating,
        reviewCount: reviews.googleReviewCount,
      },
      interpretedValue: null,
      confidence: "HIGH",
      applicability: "APPLICABLE",
      observedAt,
      analyzerVersion: sourceVersions.reviews ?? "unknown",
      explanation: `Google rating: ${reviews.googleRating ?? "unavailable"}; review count: ${reviews.googleReviewCount ?? "unavailable"}.`,
      issueKeys: ["reviews:proof:not-featured", "reviews:request-process:missing"],
    });
  }

  for (const freshness of competitorComparison?.freshness ?? []) {
    records.push({
      id: stableEvidenceId("competitor", freshness.competitorId, "snapshot"),
      type: "COMPETITOR_SNAPSHOT",
      category: ScoreCategory.COMPETITORS,
      source: "competitor_analyzer",
      sourceUrl: null,
      sourcePage: freshness.competitorName,
      sourcePath: `competitors.${freshness.competitorId}.snapshot`,
      observedValue: {
        snapshotId: freshness.snapshotId,
        scannedAt: freshness.scannedAt,
        status: freshness.status,
      },
      interpretedValue: null,
      confidence: freshness.status === "current" ? "HIGH" : "MEDIUM",
      applicability: freshness.snapshotId ? "APPLICABLE" : "UNAVAILABLE",
      observedAt,
      analyzerVersion: sourceVersions.competitors ?? "unknown",
      explanation: `${freshness.competitorName} competitor evidence status is ${freshness.status}.`,
      issueKeys: ["competitors:positioning:response"],
    });
  }

  for (const conflict of dataConflicts) {
    records.push({
      id: conflict.id,
      type: "DATA_CONFLICT",
      category: ScoreCategory.SEO,
      source: "website_analyzer",
      sourceUrl: conflict.sources[0]?.sourceUrl ?? null,
      sourcePage: null,
      sourcePath: `conflicts.${conflict.field}`,
      observedValue: conflict.sources,
      interpretedValue: {
        preferredSource: conflict.preferredSource,
        preferredValue: conflict.preferredValue,
      },
      confidence: conflict.confidence,
      applicability: "APPLICABLE",
      observedAt,
      analyzerVersion: EVIDENCE_INTEGRITY_BUILDER_VERSION,
      explanation: conflict.explanation,
      issueKeys:
        conflict.field === "operatingHours"
          ? ["website:content:operating-hours-conflict"]
          : [],
    });
  }

  return dedupeEvidence(records);
}

function interactionEvidenceRecords({
  interactions,
  page,
  path,
  observedAt,
  analyzerVersion,
}: {
  interactions: ExtractedInteractionEvidence[];
  page: string;
  path: string;
  observedAt: string;
  analyzerVersion: string;
}) {
  return [...interactions]
    .sort(
      (left, right) =>
        Number(right.destinationPurpose !== "OTHER") -
          Number(left.destinationPurpose !== "OTHER") ||
        Number(right.visibility === "VISIBLE") -
          Number(left.visibility === "VISIBLE") ||
        right.relativeProminence - left.relativeProminence,
    )
    .filter(
      (interaction, index) =>
        index < 40 &&
        (interaction.destinationPurpose !== "OTHER" ||
          interaction.elementType === "form" ||
          /^(?:mailto|tel):/i.test(interaction.destinationUrl ?? "")),
    )
    .map<AuditEvidenceRecord>((interaction) => {
      const contactIntent = [
        "CONTACT",
        "ORDER",
        "BOOKING",
        "QUOTE",
        "PURCHASE",
        "APPLICATION",
        "CHAT",
      ].includes(interaction.destinationPurpose);
      return {
        id: interaction.id,
        type: "INTERACTION_ELEMENT",
        category: ScoreCategory.WEBSITE,
        source: path.startsWith("websiteCrawl")
          ? "website_crawler"
          : "website_analyzer",
        sourceUrl: interaction.sourceUrl,
        sourcePage: page,
        sourcePath: `${path}.${interaction.id}`,
        observedValue: {
          visibleText: interaction.visibleText,
          accessibleName: interaction.accessibleName,
          elementType: interaction.elementType,
          destinationUrl: interaction.destinationUrl,
          domRegion: interaction.domRegion,
          visibility: interaction.visibility,
          surroundingText: interaction.surroundingText,
          repeated: interaction.repeated,
        },
        interpretedValue: {
          purpose: interaction.destinationPurpose,
          destinationStatus: interaction.destinationStatus ?? "NOT_CRAWLED",
          intentSignals: interaction.intentSignals,
          relativeProminence: interaction.relativeProminence,
        },
        confidence: confidenceFromNumber(interaction.intentConfidence),
        applicability:
          interaction.visibility === "HIDDEN" ? "NOT_APPLICABLE" : "APPLICABLE",
        observedAt,
        analyzerVersion: interaction.analyzerVersion || analyzerVersion,
        explanation: `${page} contains a ${interaction.elementType} interpreted as ${interaction.destinationPurpose.toLowerCase().replaceAll("_", " ")}.`,
        issueKeys: [
          ...(contactIntent ? ["website:contact-path:missing"] : []),
          ...(contactIntent && interaction.destinationStatus === "FAILED"
            ? ["website:contact-path:broken-destination"]
            : []),
          ...(interaction.destinationPurpose !== "OTHER"
            ? ["homepage:primary-cta:unclear"]
            : []),
        ],
      };
    });
}

function contactEvidenceRecords({
  url,
  page,
  path,
  contact,
  observedAt,
  analyzerVersion,
}: {
  url: string;
  page: string;
  path: string;
  contact?: ContactEvidenceSummary;
  observedAt: string;
  analyzerVersion: string;
}) {
  if (!contact) return [];

  const records: AuditEvidenceRecord[] = [
    {
      id: stableEvidenceId("contact-summary", url),
      type: "CONTACT_SIGNAL",
      category: ScoreCategory.WEBSITE,
      source: path.startsWith("websiteCrawl")
        ? "website_crawler"
        : "website_analyzer",
      sourceUrl: url,
      sourcePage: page,
      sourcePath: `${path}.summary`,
      observedValue: {
        hasAnyContactPath: contact.hasAnyContactPath,
        contactPathCount: contact.contactPathEvidenceIds.length,
        contactSectionCount: contact.contactSectionHeadings.length,
        visibleEmailCount: contact.visibleEmailAddresses.length,
        visiblePhoneCount: contact.visiblePhoneNumbers.length,
        hasContactForm: contact.hasContactForm,
      },
      interpretedValue: {
        purposes: contact.detectedPurposes,
        usablePathCount:
          contact.usableContactPathEvidenceIds?.length ??
          contact.contactPathEvidenceIds.length,
        brokenPathCount: contact.brokenContactPathEvidenceIds?.length ?? 0,
      },
      confidence: contact.confidence,
      applicability: "APPLICABLE",
      observedAt,
      analyzerVersion,
      explanation: contact.hasAnyContactPath
        ? `${page} contains customer contact or conversion evidence.`
        : `${page} did not contain a verified customer contact or conversion path in the extracted evidence.`,
      issueKeys: [
        "website:contact-path:missing",
        ...((contact.brokenContactPathEvidenceIds?.length ?? 0) > 0
          ? ["website:contact-path:broken-destination"]
          : []),
      ],
    },
  ];

  const signalRecords = <T extends "heading" | "email" | "phone">(
    kind: T,
    values: string[],
    ids: string[] | undefined,
  ) =>
    values.map<AuditEvidenceRecord>((value, index) => ({
      id: ids?.[index] ?? contactSignalEvidenceId(url, kind, value),
      type: "CONTACT_SIGNAL",
      category: ScoreCategory.WEBSITE,
      source: path.startsWith("websiteCrawl")
        ? "website_crawler"
        : "website_analyzer",
      sourceUrl: url,
      sourcePage: page,
      sourcePath: `${path}.${kind}.${index}`,
      observedValue: value,
      interpretedValue: kind.toUpperCase(),
      confidence: "HIGH",
      applicability: "APPLICABLE",
      observedAt,
      analyzerVersion,
      explanation: `${page} contains a visible contact ${kind}.`,
      issueKeys: ["website:contact-path:missing"],
    }));

  records.push(
    ...signalRecords(
      "heading",
      contact.contactSectionHeadings,
      contact.contactSectionEvidenceIds,
    ),
    ...signalRecords(
      "email",
      contact.visibleEmailAddresses,
      contact.visibleEmailEvidenceIds,
    ),
    ...signalRecords(
      "phone",
      contact.visiblePhoneNumbers,
      contact.visiblePhoneEvidenceIds,
    ),
  );
  return records;
}

function fetchQualityEvidence({
  page,
  observedAt,
  analyzerVersion,
}: {
  page: CrawledPageResult;
  observedAt: string;
  analyzerVersion: string;
}): AuditEvidenceRecord {
  const quality = page.fetchQuality;
  const completeness =
    quality?.extractionCompleteness ??
    (page.analysisStatus === "FAILED" ? "INCOMPLETE" : "PARTIAL");
  return {
    id: stableEvidenceId(
      "page-fetch",
      page.requestedUrl ?? page.url,
      page.url,
    ),
    type: "PAGE_FETCH_QUALITY",
    category: ScoreCategory.WEBSITE,
    source: "website_crawler",
    sourceUrl: page.url,
    sourcePage: pageLabel(page.url, page.pageTypes),
    sourcePath: `websiteCrawl.pages.${page.url}.fetchQuality`,
    observedValue: {
      requestedUrl: page.requestedUrl ?? page.url,
      finalUrl: page.finalUrl ?? page.url,
      canonicalUrl: page.canonicalUrl ?? null,
      statusCode: page.statusCode,
      redirectHistory: quality?.redirectHistory ?? [],
      contentType: quality?.contentType ?? null,
      rawHtmlBytes: quality?.rawHtmlBytes ?? null,
      extractedTextBytes: quality?.extractedTextBytes ?? null,
      renderedTextBytes: quality?.renderedTextBytes ?? null,
      fetchDurationMs: quality?.fetchDurationMs ?? null,
      retryCount: quality?.retryCount ?? 0,
      timeout: quality?.timeout ?? false,
    },
    interpretedValue: {
      extractionCompleteness: completeness,
      renderingStatus: quality?.renderingStatus ?? "NOT_ENABLED",
      method: quality?.method ?? "STATIC_HTML",
      errorClassification: quality?.errorClassification ?? null,
    },
    confidence: completeness === "COMPLETE" ? "HIGH" : "LOW",
    applicability: completeness === "INCOMPLETE" ? "UNAVAILABLE" : "APPLICABLE",
    observedAt,
    analyzerVersion,
    explanation:
      completeness === "COMPLETE"
        ? `${pageLabel(page.url, page.pageTypes)} was fetched and extracted completely.`
        : `${pageLabel(page.url, page.pageTypes)} extraction was ${completeness.toLowerCase()}, so absence-based claims require caution.`,
    issueKeys: [],
  };
}

function confidenceFromNumber(value: number) {
  if (value >= 0.85) return "HIGH" as const;
  if (value >= 0.6) return "MEDIUM" as const;
  return "LOW" as const;
}

function buildClaims({
  website,
  websiteCrawl,
  evidence,
  businessProfileCounts,
  competitorProfileCounts,
}: {
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  evidence: AuditEvidenceRecord[];
  businessProfileCounts: ReturnType<typeof aggregateProfileCounts>;
  competitorProfileCounts: ReturnType<typeof aggregateProfileCounts>;
}) {
  const claims: AuditClaim[] = [];
  const pageActionEvidence = evidence.filter(
    (item) =>
      item.type === "ACTION_LINK_DETECTED" &&
      item.sourcePath.startsWith("websiteCrawl.pages."),
  );
  const pageCtaEvidence = evidence.filter(
    (item) =>
      item.type === "PRIMARY_CTA_ASSESSED" &&
      item.sourcePath.startsWith("websiteCrawl.pages."),
  );
  const pagesWithActions = pageActionEvidence.filter(
    (item) =>
      isRecord(item.observedValue) &&
      item.observedValue.hasDetectedActionLinks === true,
  ).length;
  const pagesWithClearCta = pageCtaEvidence.filter(
    (item) =>
      isRecord(item.interpretedValue) &&
      item.interpretedValue.clarity === "CLEAR" &&
      item.interpretedValue.assessed === true,
  ).length;

  if (websiteCrawl) {
    claims.push(
      {
        id: "claim:pages-with-detected-action-links",
        kind: "DETECTED_ACTION_LINK_PAGE_COUNT",
        category: ScoreCategory.WEBSITE,
        text: `${pagesWithActions} of ${websiteCrawl.successfulPages} pages have detected action links.`,
        value: { count: pagesWithActions, total: websiteCrawl.successfulPages },
        requiredEvidenceIds: pageActionEvidence.map((item) => item.id),
        confidence: "HIGH",
      },
      {
        id: "claim:pages-with-clear-primary-cta",
        kind: "CLEAR_PRIMARY_CTA_PAGE_COUNT",
        category: ScoreCategory.WEBSITE,
        text: `${pagesWithClearCta} of ${websiteCrawl.successfulPages} pages have a structurally assessed clear primary CTA.`,
        value: { count: pagesWithClearCta, total: websiteCrawl.successfulPages },
        requiredEvidenceIds: pageCtaEvidence.map((item) => item.id),
        confidence: "MEDIUM",
      },
    );
  }

  if (website) {
    const homepageCta = evidence.find(
      (item) =>
        item.type === "PRIMARY_CTA_ASSESSED" &&
        item.sourcePath === "website.homepage.primaryCtaAssessment",
    );
    if (homepageCta) {
      claims.push({
        id: "claim:homepage-primary-cta",
        kind: "PRIMARY_CTA_CLARITY",
        category: ScoreCategory.WEBSITE,
        text: `Homepage primary CTA clarity is ${getPrimaryCtaAssessment(website.actionSummary).clarity.replaceAll("_", " ").toLowerCase()}.`,
        value: getPrimaryCtaAssessment(website.actionSummary),
        requiredEvidenceIds: [homepageCta.id],
        confidence: getPrimaryCtaAssessment(website.actionSummary).confidence,
      });
    }
  }

  const crawlH1Evidence = evidence.filter(
    (item) =>
      item.type === "H1_COUNT" &&
      item.sourcePath.startsWith("websiteCrawl.pages."),
  );
  const h1Evidence = (crawlH1Evidence.length > 0
    ? crawlH1Evidence
    : evidence.filter(
        (item) =>
          item.type === "H1_COUNT" &&
          item.sourcePath === "website.homepage.h1Count",
      )
  ).filter((item) => item.observedValue === 0);
  if (h1Evidence.length > 0) {
    claims.push({
      id: "claim:h1-missing",
      kind: "H1_ISSUE",
      category: ScoreCategory.SEO,
      text: `${h1Evidence.length} assessed page${h1Evidence.length === 1 ? " has" : "s have"} no H1 heading.`,
      value: h1Evidence.length,
      requiredEvidenceIds: h1Evidence.map((item) => item.id),
      confidence: "HIGH",
    });
  }

  claims.push(
    profileCountClaim(
      "business",
      businessProfileCounts,
      evidence.filter(
        (item) =>
          item.sourcePath.startsWith("profiles.business") &&
          (item.type === "PROFILE_CONFIRMED" || item.type === "PROFILE_DETECTED"),
      ),
    ),
    profileCountClaim(
      "competitors",
      competitorProfileCounts,
      evidence.filter(
        (item) =>
          item.sourcePath.startsWith("profiles.competitor") &&
          (item.type === "PROFILE_CONFIRMED" || item.type === "PROFILE_DETECTED"),
      ),
    ),
  );

  return claims;
}

function titleEvidence({
  url,
  page,
  path,
  title,
  status,
  observedAt,
  analyzerVersion,
}: {
  url: string;
  page: string;
  path: string;
  title: string | null;
  status: string;
  observedAt: string;
  analyzerVersion: string;
}): AuditEvidenceRecord {
  const normalizedStatus = status.toLowerCase();
  const issueKey =
    normalizedStatus === "missing"
      ? path.startsWith("websiteCrawl")
        ? "sitewide:title:missing"
        : "homepage:title:quality"
      : normalizedStatus === "too_short" || normalizedStatus === "too_long"
        ? "homepage:title:quality"
        : null;

  return {
    id: stableEvidenceId("website", path, url, "title-length"),
    type: "PAGE_TITLE_LENGTH",
    category: ScoreCategory.SEO,
    source: path.startsWith("websiteCrawl")
      ? "website_crawler"
      : "seo_analyzer",
    sourceUrl: url,
    sourcePage: page,
    sourcePath: path,
    observedValue: title?.length ?? 0,
    interpretedValue: status,
    confidence: "HIGH",
    applicability: "APPLICABLE",
    observedAt,
    analyzerVersion,
    explanation: `${page} title length: ${title?.length ?? 0} characters; status: ${status.replaceAll("_", " ")}.`,
    issueKeys: issueKey ? [issueKey] : [],
  };
}

function metaDescriptionEvidence({
  url,
  page,
  path,
  description,
  observedAt,
  analyzerVersion,
}: {
  url: string;
  page: string;
  path: string;
  description: string | null;
  observedAt: string;
  analyzerVersion: string;
}): AuditEvidenceRecord {
  return {
    id: stableEvidenceId("website", path, url, "meta-description-length"),
    type: "META_DESCRIPTION_LENGTH",
    category: ScoreCategory.SEO,
    source: "website_crawler",
    sourceUrl: url,
    sourcePage: page,
    sourcePath: path,
    observedValue: description?.length ?? 0,
    interpretedValue: description ? "PRESENT" : "MISSING",
    confidence: "HIGH",
    applicability: "APPLICABLE",
    observedAt,
    analyzerVersion,
    explanation: `${page} meta description length: ${description?.length ?? 0} characters.`,
    issueKeys: description ? [] : ["sitewide:meta-description:missing"],
  };
}

function seoStatusEvidence({
  type,
  path,
  label,
  status,
  url,
  issueKey,
  observedAt,
  analyzerVersion,
}: {
  type: "ROBOTS_TXT_STATUS" | "SITEMAP_STATUS";
  path: string;
  label: string;
  status: string;
  url: string | null;
  issueKey: string | null;
  observedAt: string;
  analyzerVersion: string;
}): AuditEvidenceRecord {
  return {
    id: stableEvidenceId("seo", path, status),
    type,
    category: ScoreCategory.SEO,
    source: "seo_analyzer",
    sourceUrl: url,
    sourcePage: label,
    sourcePath: path,
    observedValue: status,
    interpretedValue: status === "found" ? "AVAILABLE" : "NEEDS_REVIEW",
    confidence: status === "unknown" || status === "error" ? "LOW" : "HIGH",
    applicability: status === "unknown" ? "UNAVAILABLE" : "APPLICABLE",
    observedAt,
    analyzerVersion,
    explanation: `${label} status: ${status.replaceAll("_", " ")}.`,
    issueKeys: issueKey ? [issueKey] : [],
  };
}

function h1Evidence({
  url,
  page,
  path,
  count,
  observedAt,
  analyzerVersion,
}: {
  url: string;
  page: string;
  path: string;
  count: number;
  observedAt: string;
  analyzerVersion: string;
}): AuditEvidenceRecord {
  return {
    id: stableEvidenceId("website", path, url, "h1-count"),
    type: "H1_COUNT",
    category: ScoreCategory.SEO,
    source: path.startsWith("websiteCrawl")
      ? "website_crawler"
      : "website_analyzer",
    sourceUrl: url,
    sourcePage: page,
    sourcePath: path,
    observedValue: count,
    interpretedValue:
      count === 1 ? "GOOD" : count === 0 ? "MISSING" : "MULTIPLE",
    confidence: "HIGH",
    applicability: "APPLICABLE",
    observedAt,
    analyzerVersion,
    explanation: `${page} H1 count: ${count}.`,
    issueKeys:
      count === 0
        ? ["sitewide:h1:missing"]
        : count > 1
          ? ["sitewide:h1:multiple"]
          : [],
  };
}

function actionLinkEvidence({
  url,
  page,
  path,
  summary,
  observedAt,
  analyzerVersion,
}: {
  url: string;
  page: string;
  path: string;
  summary: WebsiteAnalysis["actionSummary"];
  observedAt: string;
  analyzerVersion: string;
}): AuditEvidenceRecord {
  const detectedActionTypes =
    summary.detectedActionTypes ?? summary.primaryActions ?? [];
  const detectedActionLinkCount =
    summary.detectedActionLinkCount ?? summary.rawCandidates?.length ?? 0;
  return {
    id: stableEvidenceId("website", path, url, "action-links"),
    type: "ACTION_LINK_DETECTED",
    category: ScoreCategory.WEBSITE,
    source: path.startsWith("websiteCrawl")
      ? "website_crawler"
      : "website_analyzer",
    sourceUrl: url,
    sourcePage: page,
    sourcePath: path,
    observedValue: {
      hasDetectedActionLinks: detectedActionTypes.length > 0,
      detectedActionLinkCount,
      detectedActionTypes,
      detectedActionLinks: summary.detectedActionLinks ?? [],
    },
    interpretedValue: null,
    confidence: "HIGH",
    applicability: "APPLICABLE",
    observedAt,
    analyzerVersion,
    explanation: `${page} has ${detectedActionLinkCount} detected action-link candidate${detectedActionLinkCount === 1 ? "" : "s"} across ${detectedActionTypes.join(", ") || "no classified customer actions"}.`,
    issueKeys: page === "Homepage" ? ["homepage:primary-cta:unclear"] : [],
  };
}

function ctaAssessmentEvidence({
  url,
  page,
  path,
  summary,
  observedAt,
  analyzerVersion,
}: {
  url: string;
  page: string;
  path: string;
  summary: WebsiteAnalysis["actionSummary"];
  observedAt: string;
  analyzerVersion: string;
}): AuditEvidenceRecord {
  const assessment = getPrimaryCtaAssessment(summary);
  return {
    id: stableEvidenceId("website", path, url, "primary-cta-assessment"),
    type: "PRIMARY_CTA_ASSESSED",
    category: ScoreCategory.WEBSITE,
    source: path.startsWith("websiteCrawl")
      ? "website_crawler"
      : "website_analyzer",
    sourceUrl: url,
    sourcePage: page,
    sourcePath: path,
    observedValue: {
      actionTypes: summary.detectedActionTypes ?? summary.primaryActions ?? [],
      actionLinks: summary.detectedActionLinks ?? [],
    },
    interpretedValue: assessment,
    confidence: assessment.confidence,
    applicability:
      assessment.clarity === "NOT_APPLICABLE"
        ? "NOT_APPLICABLE"
        : assessment.clarity === "NOT_ASSESSED"
          ? "UNAVAILABLE"
          : "APPLICABLE",
    observedAt,
    analyzerVersion,
    explanation: `${page} primary CTA clarity is ${assessment.clarity.replaceAll("_", " ").toLowerCase()}. ${assessment.evidence.join(" ")}`,
    issueKeys:
      assessment.clarity === "NEEDS_IMPROVEMENT" ||
      assessment.clarity === "UNCERTAIN"
        ? page === "Homepage"
          ? ["homepage:primary-cta:unclear"]
          : []
        : [],
  };
}

function profileEvidence(
  profile: {
    id: string;
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
  },
  ownerPath: string,
  sourcePage: string | null,
  observedAt: string,
): AuditEvidenceRecord {
  const confirmed = profile.status === BusinessProfileStatus.CONFIRMED;
  return {
    id: stableEvidenceId("profile", ownerPath, profile.id),
    type: confirmed ? "PROFILE_CONFIRMED" : "PROFILE_DETECTED",
    category: ScoreCategory.SOCIAL,
    source: "live_profile",
    sourceUrl: null,
    sourcePage,
    sourcePath: `profiles.${ownerPath}.${profile.id}`,
    observedValue: {
      platform: profile.platform,
      status: profile.status,
    },
    interpretedValue: null,
    confidence: confirmed ? "HIGH" : "MEDIUM",
    applicability:
      profile.status === BusinessProfileStatus.REMOVED
        ? "NOT_APPLICABLE"
        : "APPLICABLE",
    observedAt,
    analyzerVersion: "profile-state-v1",
    explanation: `${profile.platform.replaceAll("_", " ")} profile status is ${profile.status.toLowerCase()}.`,
    issueKeys:
      profile.status === BusinessProfileStatus.PENDING
        ? ownerPath === "business"
          ? ["social:profiles:pending"]
          : ["competitors:profiles:pending"]
        : [],
  };
}

function profileCountClaim(
  owner: string,
  counts: ReturnType<typeof aggregateProfileCounts>,
  evidence: AuditEvidenceRecord[],
): AuditClaim {
  return {
    id: `claim:${owner}:profile-counts`,
    kind: "PROFILE_COUNT",
    category: ScoreCategory.SOCIAL,
    text: `${owner === "business" ? "Business" : "Competitors"}: ${counts.confirmedPublicProfiles} confirmed public profiles including ${counts.confirmedWebsiteProfiles} website profile${counts.confirmedWebsiteProfiles === 1 ? "" : "s"}; ${counts.confirmedSocialProfiles} confirmed social profiles; ${counts.pendingSocialProfiles} pending social links.`,
    value: counts,
    requiredEvidenceIds: evidence.map((item) => item.id),
    confidence: "HIGH",
  };
}

function pageLabel(url: string, pageTypes: string[]) {
  if (pageTypes.includes("Homepage")) return "Homepage";
  if (pageTypes.length > 0) return pageTypes.join(" / ");
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function dedupeEvidence(records: AuditEvidenceRecord[]) {
  const byId = new Map<string, AuditEvidenceRecord>();
  for (const record of records) byId.set(record.id, record);
  return [...byId.values()];
}

function dateString(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

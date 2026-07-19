import "server-only";

import {
  AuditStatus,
  BusinessGoal,
  BusinessProfileStatus,
  CompetitorStatus,
  FindingSeverity,
  ProfilePlatform,
  RecommendationPriority,
  RecommendationStatus,
  ScoreCategory,
  type Prisma,
} from "@prisma/client";

import type { ReviewAnalysis } from "@/lib/analyzers/review-analyzer";
import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import type { SocialAnalysis } from "@/lib/analyzers/social-analyzer";
import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import { getPrimaryCtaAssessment } from "@/lib/analyzers/action-classifier";
import { generateDeterministicSocialStrategy } from "@/lib/ai/social-strategy-generator";
import { buildDeterministicSummary } from "@/lib/ai/competitor-intelligence-generator";
import {
  categoryScore,
  getAuditAssessment,
  type AuditAssessment,
} from "@/lib/audits/audit-applicability";
import {
  compareAudits,
  type AuditComparison,
} from "@/lib/audits/audit-comparison";
import {
  readEvidenceIntegrity,
  type AuditEvidenceIntegritySnapshot,
  type PrimaryCtaAssessment,
  type ProfileCountSummary,
} from "@/lib/audits/evidence-contracts";
import { buildAuditEvidenceIntegrity } from "@/lib/audits/evidence-integrity";
import {
  completeEvidenceSummary,
  normalizeFindingDescription,
  normalizeFindingTitle,
} from "@/lib/audits/finding-copy";
import {
  contextConfidenceLabel,
  contextSourceLabel,
  hasBusinessContext,
} from "@/lib/business-context";
import { buildCurrentCompetitorComparison } from "@/lib/competitors/current-comparison";
import type {
  AuditCompetitorIntelligence,
  CompetitorComparisonResult,
} from "@/lib/competitors/competitor-types";
import { businessGoalLabels } from "@/lib/goals";
import { cleanReportCopy } from "@/lib/pdf/text-sanitize";
import { prisma } from "@/lib/prisma";
import {
  aggregateCompetitorProfileCounts,
  aggregateProfileCounts,
} from "@/lib/profiles/profile-counts";
import {
  canonicalRecommendationIssueKey,
} from "@/lib/recommendations/recommendation-deduplication";
import {
  classifyReportBusiness,
  deterministicSocialRecommendation,
  filterBusinessCompatibleContent,
  publicCompetitorMonitoringCopy,
  validateBusinessCompatibleContent,
  type ReportBusinessArchetype,
  type ReportBusinessContext,
} from "@/lib/reports/content-compatibility";
import {
  assessDerivedFreshness,
  buildCompetitorComparisonDependencyFingerprint,
  buildSocialStrategyDependencyFingerprint,
  COMPETITOR_COMPARISON_VERSION,
  latestDate,
  REPORT_VIEW_MODEL_VERSION,
  SEO_ANALYZER_VERSION,
  SOCIAL_STRATEGY_GENERATOR_VERSION,
  WEBSITE_ANALYZER_VERSION,
  type DerivedFreshness,
  type DerivedFreshnessStatus,
} from "@/lib/reports/report-freshness";
import {
  selectReportCrawlPages,
  type CrawledPageSelection,
} from "@/lib/reports/page-summary";
import {
  parseSocialStrategy,
  type SocialStrategyData,
  type SocialStrategyRecord,
} from "@/lib/social-strategy";

export type ReportScoreItem = {
  category: ScoreCategory;
  label: string;
  score: number | null;
  status:
    | "scored"
    | "not_provided"
    | "not_applicable"
    | "not_configured"
    | "saved_not_analyzed"
    | "partial";
  note?: string;
};

export type ReportRecommendation = {
  id: string;
  title: string;
  description: string;
  category: ScoreCategory;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  estimatedEffort: string;
  expectedImpact: string;
  sourceCategory: string;
  sourceFindingId: string | null;
  evidenceSummary: string;
  businessRelevance: string;
  confidence: "High" | "Medium" | "Low";
  freshness: "Current audit" | "Current live state" | "General best practice";
  technical: boolean;
};

export type ReportNextMove = {
  title: string;
  whyItMatters: string;
  expectedOutcome: string;
  evidence: string;
  implementationAction: string;
  category: ScoreCategory;
  effort: string;
  impact: string;
};

export type ReportFinding = {
  id: string;
  title: string;
  description: string;
  category: ScoreCategory;
  severity: FindingSeverity;
  source: "selected_audit" | "current_live_state" | "current_comparison";
};

export type ReportScoringMetadata = {
  scoringEngineVersion: string;
  reportViewModelVersion: string;
  analyzerVersions: Record<string, string>;
  categoryWeights: Partial<Record<ScoreCategory, number>>;
  applicableCategories: ScoreCategory[];
  pagesScanned: number;
  crawlLimit: number;
  crawlStatus: "full" | "partial" | "homepage_only" | "not_applicable";
  competitorSnapshotIds: string[];
  generatedAt: string;
};

export type AuditReportViewModel = {
  business: {
    id: string;
    name: string;
    initialInput: string;
    archetype: ReportBusinessArchetype;
    selectedGoals: BusinessGoal[];
    primaryGoal: BusinessGoal | null;
    context: {
      description: string | null;
      targetAudience: string | null;
      mainOffer: string | null;
      industry: string | null;
      businessType: string | null;
      observedPrimaryConversionGoal: string | null;
      brandTone: string | null;
      confidenceLabel: string;
      sourceLabel: string;
      confirmed: boolean;
      needsReview: boolean;
      reviewNote: string | null;
    };
    userSelectedGrowthGoal: string;
    secondaryGoals: string[];
    profileSummary: {
      confirmed: number;
      pending: number;
      removed: number;
      confirmedPlatforms: string[];
      counts: ProfileCountSummary;
    };
  };
  audit: {
    id: string;
    date: Date;
    completedAt: Date | null;
    overallScore: number;
    healthLabel: string;
    executiveSummary: string;
  };
  assessment: AuditAssessment;
  scores: ReportScoreItem[];
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  seo: SeoAnalysis | null;
  social: SocialAnalysis;
  reviews: ReviewAnalysis;
  socialStrategy: {
    data: SocialStrategyData;
    source: "ai_generated" | "deterministic_fallback";
    sourceLabel: "AI generated" | "Deterministic fallback";
    freshness: DerivedFreshness;
    scopeNote: string;
  };
  competitors: {
    status:
      | "not_configured"
      | "saved_not_analyzed"
      | "partial"
      | "current";
    score: number | null;
    label: string;
    activeCount: number;
    confirmedProfilesCount: number;
    profileCounts: ProfileCountSummary;
    profilesByCompetitor: AuditEvidenceIntegritySnapshot["profileCounts"]["competitors"];
    names: string[];
    intelligence: AuditCompetitorIntelligence | null;
    comparison: CompetitorComparisonResult | null;
    methodologyNote: string;
    snapshotDate: Date | null;
    businessAuditDate: Date;
    freshness: DerivedFreshness;
  };
  findings: {
    strengths: ReportFinding[];
    warnings: ReportFinding[];
    opportunities: ReportFinding[];
    all: ReportFinding[];
  };
  recommendations: {
    primary: ReportRecommendation[];
    technical: ReportRecommendation[];
    all: ReportRecommendation[];
    completed: number;
    total: number;
  };
  nextMoves: ReportNextMove[];
  progress: {
    comparison: AuditComparison;
    previousScore: number | null;
    currentScore: number;
    note: string;
  };
  freshness: {
    businessContext: DerivedFreshnessStatus;
    socialStrategy: DerivedFreshnessStatus;
    competitorComparison: DerivedFreshnessStatus;
    reviews: DerivedFreshnessStatus;
  };
  confidence: {
    pagesScanned: number;
    crawlLimit: number;
    crawlStatus: string;
    importantPagesIncluded: string[];
    googleBusinessStatus: string;
    businessContextStatus: string;
    socialStrategyStatus: string;
    competitorComparisonStatus: string;
    limitations: string[];
  };
  scoringMetadata: ReportScoringMetadata;
  evidenceIntegrity: AuditEvidenceIntegritySnapshot;
  dataNotes: string[];
  technicalAppendix: {
    detectedActionLinks: string[];
    pagesWithNoDetectedActionLinks: number | null;
    pagesWithDetectedActionLinks: number | null;
    pagesWithAssessedPrimaryCta: number | null;
    pagesWithStructurallyClearPrimaryCta: number | null;
    homepagePrimaryCtaAssessment: PrimaryCtaAssessment | null;
    duplicateUrlVariantsSkipped: number | null;
    pageResults: WebsiteCrawlResult["pageResults"];
    pageSelection: CrawledPageSelection;
    findings: ReportFinding[];
  };
};

type ReportBusinessRecord = Prisma.BusinessGetPayload<{
  include: {
    profiles: true;
    googleBusinessProfiles: true;
    socialStrategies: true;
    competitors: {
      include: {
        discoveredProfiles: true;
        snapshots: true;
      };
    };
  };
}>;

export async function buildAuditReportViewModel({
  businessId,
  auditId,
  ownerId,
}: {
  businessId: string;
  auditId: string;
  ownerId: string;
}): Promise<AuditReportViewModel | null> {
  const audit = await prisma.audit.findFirst({
    where: {
      id: auditId,
      businessId,
      status: AuditStatus.COMPLETED,
      business: { ownerId },
    },
    include: {
      scores: true,
      findings: { orderBy: { createdAt: "asc" } },
      recommendations: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      business: {
        include: {
          profiles: {
            orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
          },
          googleBusinessProfiles: {
            where: { status: { not: "removed" } },
            orderBy: [
              { status: "asc" },
              { matchConfidence: "desc" },
              { updatedAt: "desc" },
            ],
          },
          socialStrategies: {
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
          competitors: {
            where: { status: CompetitorStatus.ACTIVE },
            orderBy: { name: "asc" },
            include: {
              discoveredProfiles: {
                orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
              },
              snapshots: {
                orderBy: { createdAt: "desc" },
                take: 8,
              },
            },
          },
        },
      },
    },
  });

  if (!audit) return null;

  const previousAudit = await prisma.audit.findFirst({
    where: {
      businessId,
      status: AuditStatus.COMPLETED,
      createdAt: { lt: audit.createdAt },
    },
    orderBy: { createdAt: "desc" },
    include: {
      scores: true,
      findings: { orderBy: { createdAt: "asc" } },
      recommendations: true,
    },
  });
  const currentState = await buildCurrentCompetitorComparison({
    businessId,
    ownerId,
    auditId,
  });

  if (!currentState) return null;

  const business = audit.business;
  const assessment = getAuditAssessment(audit.analysisSnapshot);
  const website = getSnapshotValue<WebsiteAnalysis>(
    audit.analysisSnapshot,
    "website",
    (value) => typeof value.normalizedUrl === "string" && typeof value.score === "number",
  );
  const websiteCrawl = getSnapshotValue<WebsiteCrawlResult>(
    audit.analysisSnapshot,
    "websiteCrawl",
    (value) => Array.isArray(value.pageResults) && typeof value.pagesScanned === "number",
  );
  const seo = getSnapshotValue<SeoAnalysis>(
    audit.analysisSnapshot,
    "seo",
    (value) => typeof value.score === "number",
  );
  const social = currentState.currentSocial;
  const reviews = currentState.currentReviews;
  const currentComparison = currentState.comparison;
  const competitorSummary = currentComparison
    ? buildDeterministicSummary(business.name, currentComparison)
    : null;
  const competitorIntelligence: AuditCompetitorIntelligence | null =
    currentComparison && competitorSummary
      ? {
          snapshotIds: currentComparison.freshness
            .map((item) => item.snapshotId)
            .filter((id): id is string => Boolean(id)),
          competitorNames: business.competitors.map((item) => item.name),
          comparison: currentComparison,
          summary: competitorSummary,
          generatedAt: currentComparison.generatedAt,
          limitations: currentComparison.limitations,
        }
      : null;
  const contextNormalization = normalizeBusinessContext({
    business,
    website,
    websiteCrawl,
  });
  const compatibilityContext: ReportBusinessContext = {
    name: business.name,
    description: contextNormalization.description,
    targetAudience: business.targetAudience,
    mainOffer: business.mainOffer,
    industry: business.industry,
    businessType: business.businessType,
    primaryConversionGoal: business.primaryConversionGoal,
    brandTone: business.brandTone,
  };
  const archetype = classifyReportBusiness(compatibilityContext);
  const comparison = compareAudits({
    currentAudit: audit,
    previousAudit,
  });
  const competitorStatus = getCompetitorStatus({
    activeCount: business.competitors.length,
    comparison: currentComparison,
  });
  const competitorDependencyFingerprint =
    buildCompetitorComparisonDependencyFingerprint({
      businessAuditId: audit.id,
      competitors: business.competitors.map((competitor) => ({
        id: competitor.id,
        profiles: competitor.discoveredProfiles,
        snapshots: competitor.snapshots,
      })),
    });
  const competitorFreshness: DerivedFreshness = {
    status:
      competitorStatus === "current"
        ? "CURRENT"
        : competitorStatus === "partial"
          ? "PARTIAL"
          : "UNAVAILABLE",
    generatedAt: dateFromUnknown(currentComparison?.generatedAt),
    sourceAuditId: audit.id,
    dependencyFingerprint: competitorDependencyFingerprint,
    storedDependencyFingerprint: stringFromUnknown(
      getSnapshotRecord(audit.analysisSnapshot, "reportCompetitorComparison")
        ?.dependencyFingerprint,
    ),
    generatorVersion: COMPETITOR_COMPARISON_VERSION,
    reason:
      competitorStatus === "current"
        ? "The comparison was rebuilt from current active competitors, profile confirmations, and latest usable snapshots."
        : competitorStatus === "partial"
          ? "The comparison uses current records, but one or more competitor snapshots are stale, partial, or unavailable."
          : competitorStatus === "not_configured"
            ? "No active competitors are configured."
            : "No completed comparable competitor snapshot is available.",
  };
  const scores = buildScoreItems({
    auditScores: audit.scores,
    assessment,
    social,
    reviews,
    competitorStatus,
  });
  const overallScore =
    audit.overallScore ??
    categoryScore(audit.scores, ScoreCategory.OVERALL) ??
    0;
  const sourceEvidence = buildSourceEvidence({
    context: compatibilityContext,
    website,
    websiteCrawl,
  });
  const scoringMetadata = buildScoringMetadata({
    snapshot: audit.analysisSnapshot,
    assessment,
    website,
    websiteCrawl,
    currentComparison,
  });
  const businessProfilesForCounts = business.profiles.map((profile) => ({
    platform: profile.platform,
    status: profile.status,
  }));
  if (
    reviews.googleBusinessStatus === "confirmed" &&
    !businessProfilesForCounts.some(
      (profile) => profile.platform === ProfilePlatform.GOOGLE_BUSINESS,
    )
  ) {
    businessProfilesForCounts.push({
      platform: ProfilePlatform.GOOGLE_BUSINESS,
      status: BusinessProfileStatus.CONFIRMED,
    });
  }
  const businessProfileCounts = aggregateProfileCounts(
    businessProfilesForCounts,
  );
  const competitorProfileCounts = aggregateCompetitorProfileCounts(
    business.competitors.map((competitor) => ({
      id: competitor.id,
      name: competitor.name,
      profiles: competitor.discoveredProfiles,
    })),
  );
  const storedEvidenceIntegrity = readEvidenceIntegrity(audit.analysisSnapshot);
  const evidenceIntegrity =
    storedEvidenceIntegrity ??
    buildAuditEvidenceIntegrity({
      website,
      websiteCrawl,
      seo,
      social,
      reviews,
      businessContext: compatibilityContext,
      businessProfiles: business.profiles.map((profile) => ({
        id: profile.id,
        platform: profile.platform,
        status: profile.status,
      })),
      competitors: business.competitors.map((competitor) => ({
        id: competitor.id,
        name: competitor.name,
        profiles: competitor.discoveredProfiles.map((profile) => ({
          id: profile.id,
          platform: profile.platform,
          status: profile.status,
        })),
      })),
      competitorComparison: currentComparison,
      recommendations: audit.recommendations,
      findings: audit.findings,
      scoreBreakdowns: [],
      observedAt: audit.completedAt ?? audit.createdAt,
      sourceVersions: {
        ...scoringMetadata.analyzerVersions,
        scoring: scoringMetadata.scoringEngineVersion,
      },
    }).snapshot;
  const allFindings = buildCurrentFindings({
    auditFindings: audit.findings,
    reviews,
    social,
    currentComparison,
    sourceEvidence,
    context: compatibilityContext,
  });
  const recommendationSet = buildCurrentRecommendations({
    auditRecommendations: audit.recommendations,
    auditFindings: audit.findings,
    business,
    context: compatibilityContext,
    sourceEvidence,
    assessment,
    reviews,
    social,
    website,
    websiteCrawl,
    currentComparison,
    evidenceIntegrity,
  });
  const socialStrategy = buildCurrentSocialStrategy({
    auditId: audit.id,
    auditSnapshot: audit.analysisSnapshot,
    auditCreatedAt: audit.createdAt,
    business,
    social,
    reviews,
    website,
    recommendations: recommendationSet.all,
    context: compatibilityContext,
    sourceEvidence,
  });
  const nextMoves = buildNextMoves({
    assessment,
    context: compatibilityContext,
    website,
    websiteCrawl,
    reviews,
    social,
    recommendations: recommendationSet.primary,
  });
  const executiveSummary = buildExecutiveSummary({
    businessName: business.name,
    overallScore,
    scores,
    reviews,
    website,
    websiteCrawl,
    currentComparison,
    nextMoves,
  });
  const snapshotDate = latestDate(
    currentComparison?.freshness.map((item) => item.scannedAt) ?? [],
  );
  return {
    business: {
      id: business.id,
      name: business.name,
      initialInput: business.initialInput,
      archetype,
      selectedGoals: business.goals,
      primaryGoal: business.primaryGoal,
      context: {
        description: contextNormalization.description,
        targetAudience: business.targetAudience,
        mainOffer: business.mainOffer,
        industry: business.industry,
        businessType: business.businessType,
        observedPrimaryConversionGoal: business.primaryConversionGoal,
        brandTone: business.brandTone,
        confidenceLabel: contextConfidenceLabel(business.contextConfidence),
        sourceLabel: contextSourceLabel(business.contextSource),
        confirmed: Boolean(business.contextConfirmedAt),
        needsReview: contextNormalization.needsReview,
        reviewNote: contextNormalization.reviewNote,
      },
      userSelectedGrowthGoal: business.primaryGoal
        ? businessGoalLabels[business.primaryGoal]
        : "Not selected",
      secondaryGoals: business.goals
        .filter((goal) => goal !== business.primaryGoal)
        .map((goal) => businessGoalLabels[goal]),
      profileSummary: {
        confirmed: business.profiles.filter(
          (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
        ).length,
        pending: business.profiles.filter(
          (profile) => profile.status === BusinessProfileStatus.PENDING,
        ).length,
        removed: business.profiles.filter(
          (profile) => profile.status === BusinessProfileStatus.REMOVED,
        ).length,
        confirmedPlatforms: business.profiles
          .filter(
            (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
          )
          .map((profile) => platformLabel(profile.platform)),
        counts: businessProfileCounts,
      },
    },
    audit: {
      id: audit.id,
      date: audit.createdAt,
      completedAt: audit.completedAt,
      overallScore,
      healthLabel: healthLabel(overallScore),
      executiveSummary,
    },
    assessment,
    scores,
    website,
    websiteCrawl,
    seo,
    social,
    reviews,
    socialStrategy,
    competitors: {
      status: competitorStatus,
      score:
        competitorStatus === "current" || competitorStatus === "partial"
          ? categoryScore(audit.scores, ScoreCategory.COMPETITORS)
          : null,
      label: competitorStatusLabel(competitorStatus),
      activeCount: business.competitors.length,
      confirmedProfilesCount: business.competitors.reduce(
        (total, competitor) =>
          total +
          competitor.discoveredProfiles.filter(
            (profile) =>
              profile.status === BusinessProfileStatus.CONFIRMED,
          ).length,
        0,
      ),
      profileCounts: competitorProfileCounts.totals,
      profilesByCompetitor: competitorProfileCounts.competitors,
      names: business.competitors.map((competitor) => competitor.name),
      intelligence: competitorIntelligence,
      comparison: currentComparison,
      methodologyNote:
        "Competitive Position reflects comparable public website, SEO, confirmed profile-coverage, review, and messaging signals. Missing data is not scored as a loss.",
      snapshotDate,
      businessAuditDate: audit.createdAt,
      freshness: competitorFreshness,
    },
    findings: groupFindings(allFindings),
    recommendations: recommendationSet,
    nextMoves,
    progress: {
      comparison,
      previousScore: previousAudit?.overallScore ?? null,
      currentScore: overallScore,
      note:
        "Audit scores change only when new analysis detects different evidence or the scoring or data coverage changes. Marking an Action Plan task complete does not directly change audit scores.",
    },
    freshness: {
      businessContext: hasBusinessContext(business)
        ? contextNormalization.needsReview
          ? "PARTIAL"
          : "CURRENT"
        : "UNAVAILABLE",
      socialStrategy: socialStrategy.freshness.status,
      competitorComparison: competitorFreshness.status,
      reviews: "CURRENT",
    },
    confidence: {
      pagesScanned: websiteCrawl?.pagesScanned ?? (website ? 1 : 0),
      crawlLimit: websiteCrawl?.crawlLimitUsed ?? (website ? 1 : 0),
      crawlStatus: scoringMetadata.crawlStatus.replaceAll("_", " "),
      importantPagesIncluded: websiteCrawl?.importantPagesFound ?? [],
      googleBusinessStatus: reviews.googleBusinessStatus,
      businessContextStatus: !hasBusinessContext(business)
        ? "Not generated"
        : contextNormalization.needsReview
          ? "Confirmed, but current evidence suggests review"
          : business.contextConfirmedAt
            ? "Confirmed"
            : "Generated and awaiting confirmation",
      socialStrategyStatus: `${socialStrategy.freshness.status} - ${socialStrategy.sourceLabel}`,
      competitorComparisonStatus: competitorStatusLabel(competitorStatus),
      limitations: uniqueStrings([
        ...assessment.limitations,
        ...(currentComparison?.limitations ?? []),
        "Individual social posts, engagement, posting frequency, reach, impressions, and content performance were not analyzed.",
        "Competitor positioning is inferred from publicly observable messaging and is not private market or revenue data.",
      ]),
    },
    scoringMetadata,
    evidenceIntegrity,
    dataNotes: evidenceIntegrity.dataConflicts.map(
      (conflict) => `${conflict.explanation} ${conflict.action}`,
    ),
    technicalAppendix: {
      detectedActionLinks:
        website?.actionSummary?.detectedActionLinks?.map(
          (action) => `${action.label} (${action.actionType})`,
        ) ?? website?.actionSummary?.rawCandidates ?? website?.ctaCandidates ?? [],
      pagesWithNoDetectedActionLinks: websiteCrawl?.pagesWithNoCTA ?? null,
      pagesWithDetectedActionLinks: websiteCrawl
        ? websiteCrawl.pagesWithDetectedActionLinks ??
          websiteCrawl.pageResults.filter(
            (page) =>
              page.actionSummary?.hasDetectedActionLinks ??
              (page.actionSummary?.primaryActions?.length ?? 0) > 0,
          ).length
        : website
          ? website.actionSummary?.hasDetectedActionLinks ??
            (website.actionSummary?.primaryActions?.length ?? 0) > 0
            ? 1
            : 0
          : null,
      pagesWithAssessedPrimaryCta: websiteCrawl
        ? websiteCrawl.pageResults.filter(
            (page) => getPrimaryCtaAssessment(page.actionSummary).assessed,
          ).length
        : website
          ? getPrimaryCtaAssessment(website.actionSummary).assessed
            ? 1
            : 0
          : null,
      pagesWithStructurallyClearPrimaryCta: websiteCrawl
        ? websiteCrawl.pageResults.filter((page) => {
            const cta = getPrimaryCtaAssessment(page.actionSummary);
            return cta.assessed && cta.clarity === "CLEAR";
          }).length
        : website
          ? getPrimaryCtaAssessment(website.actionSummary).assessed &&
            getPrimaryCtaAssessment(website.actionSummary).clarity === "CLEAR"
            ? 1
            : 0
          : null,
      homepagePrimaryCtaAssessment: website
        ? getPrimaryCtaAssessment(website.actionSummary)
        : null,
      duplicateUrlVariantsSkipped:
        websiteCrawl?.duplicateUrlsSkipped ?? null,
      pageResults: websiteCrawl?.pageResults ?? [],
      pageSelection: selectReportCrawlPages(
        websiteCrawl?.pageResults ?? [],
      ),
      findings: allFindings,
    },
  };
}

function buildCurrentSocialStrategy({
  auditId,
  auditSnapshot,
  auditCreatedAt,
  business,
  social,
  reviews,
  website,
  recommendations,
  context,
  sourceEvidence,
}: {
  auditId: string;
  auditSnapshot: unknown;
  auditCreatedAt: Date;
  business: ReportBusinessRecord;
  social: SocialAnalysis;
  reviews: ReviewAnalysis;
  website: WebsiteAnalysis | null;
  recommendations: ReportRecommendation[];
  context: ReportBusinessContext;
  sourceEvidence: string;
}): AuditReportViewModel["socialStrategy"] {
  const currentFingerprint = buildSocialStrategyDependencyFingerprint({
    auditId,
    businessContext: {
      ...context,
      contextConfidence: business.contextConfidence,
      contextSource: business.contextSource,
      contextConfirmedAt: business.contextConfirmedAt,
    },
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    profiles: business.profiles,
    googleBusinessProfiles: business.googleBusinessProfiles,
    competitors: business.competitors.map((competitor) => ({
      id: competitor.id,
      profiles: competitor.discoveredProfiles,
      snapshotIds: competitor.snapshots.map((snapshot) => snapshot.id),
    })),
  });
  const latestDependencyAt = latestDate([
    business.contextUpdatedAt,
    business.updatedAt,
    ...business.profiles.map((profile) => profile.updatedAt),
    ...business.googleBusinessProfiles.map((profile) => profile.updatedAt),
    ...business.competitors.flatMap((competitor) => [
      competitor.updatedAt,
      ...competitor.discoveredProfiles.map((profile) => profile.updatedAt),
      ...competitor.snapshots.map((snapshot) => snapshot.updatedAt),
    ]),
  ]);
  const snapshotStrategy = getSnapshotRecord(auditSnapshot, "reportSocialStrategy");
  const snapshotData = snapshotStrategy
    ? parseSnapshotSocialStrategy(snapshotStrategy.data)
    : null;
  const snapshotCompatible = snapshotData
    ? validateSocialStrategy(snapshotData, context, sourceEvidence)
    : false;
  const snapshotFreshness = assessDerivedFreshness({
    generatedAt: dateFromUnknown(snapshotStrategy?.generatedAt),
    sourceAuditId: stringFromUnknown(snapshotStrategy?.sourceAuditId),
    dependencyFingerprint: currentFingerprint,
    storedDependencyFingerprint: stringFromUnknown(
      snapshotStrategy?.dependencyFingerprint,
    ),
    generatorVersion: SOCIAL_STRATEGY_GENERATOR_VERSION,
    storedGeneratorVersion: stringFromUnknown(snapshotStrategy?.generatorVersion),
    latestDependencyAt,
    contentValid: snapshotCompatible,
  });

  if (snapshotData && snapshotFreshness.status === "CURRENT") {
    return {
      data: snapshotData,
      source:
        snapshotData && snapshotStrategy?.source === "ai_generated"
          ? "ai_generated"
          : "deterministic_fallback",
      sourceLabel:
        snapshotStrategy?.source === "ai_generated"
          ? "AI generated"
          : "Deterministic fallback",
      freshness: snapshotFreshness,
      scopeNote: socialScopeNote(),
    };
  }

  const legacyRecord = business.socialStrategies.at(0) as
    | (SocialStrategyRecord & {
        dependencyFingerprint?: string | null;
        sourceAuditId?: string | null;
        generatorVersion?: string | null;
      })
    | undefined;
  const legacyData = parseSocialStrategy(legacyRecord);
  const legacyCompatible = legacyData
    ? validateSocialStrategy(legacyData, context, sourceEvidence)
    : false;
  const legacyFreshness = assessDerivedFreshness({
    generatedAt: legacyRecord?.updatedAt,
    sourceAuditId: legacyRecord?.sourceAuditId,
    dependencyFingerprint: currentFingerprint,
    storedDependencyFingerprint: legacyRecord?.dependencyFingerprint,
    generatorVersion: SOCIAL_STRATEGY_GENERATOR_VERSION,
    storedGeneratorVersion: legacyRecord?.generatorVersion,
    latestDependencyAt,
    contentValid: legacyCompatible,
  });

  if (legacyData && legacyFreshness.status === "CURRENT") {
    return {
      data: legacyData,
      source:
        legacyRecord?.source === "ai_generated"
          ? "ai_generated"
          : "deterministic_fallback",
      sourceLabel:
        legacyRecord?.source === "ai_generated"
          ? "AI generated"
          : "Deterministic fallback",
      freshness: legacyFreshness,
      scopeNote: socialScopeNote(),
    };
  }

  const fallback = generateDeterministicSocialStrategy({
    businessName: business.name,
    initialInput: business.initialInput,
    businessContext: {
      ...context,
      contextConfidence: business.contextConfidence,
      contextSource: business.contextSource,
      contextConfirmedAt: business.contextConfirmedAt,
    },
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    profiles: business.profiles,
    competitors: business.competitors,
    socialAnalysis: social,
    reviewAnalysis: reviews,
    websiteAnalysis: website,
    recommendations: recommendations.map((recommendation) => ({
      title: recommendation.title,
      description: recommendation.description,
      category: recommendation.category,
      priority: recommendation.priority,
      status: recommendation.status,
    })),
  });

  return {
    data: fallback,
    source: "deterministic_fallback",
    sourceLabel: "Deterministic fallback",
    freshness: {
      status: "CURRENT",
      generatedAt: new Date(),
      sourceAuditId: auditId,
      dependencyFingerprint: currentFingerprint,
      storedDependencyFingerprint: null,
      generatorVersion: SOCIAL_STRATEGY_GENERATOR_VERSION,
      reason:
        snapshotData || legacyData
          ? "Saved Social Strategy was stale or incompatible, so the report regenerated a deterministic strategy from current evidence."
          : `No current saved strategy was available for the ${formatDate(auditCreatedAt)} audit, so the report generated a deterministic strategy from current evidence.`,
    },
    scopeNote: socialScopeNote(),
  };
}

function buildCurrentRecommendations({
  auditRecommendations,
  auditFindings,
  business,
  context,
  sourceEvidence,
  assessment,
  reviews,
  social,
  website,
  websiteCrawl,
  currentComparison,
  evidenceIntegrity,
}: {
  auditRecommendations: Array<{
    id: string;
    title: string;
    description: string;
    category: ScoreCategory;
    priority: RecommendationPriority;
    status: RecommendationStatus;
    effort: string | null;
    impact: string | null;
    estimatedEffort: string | null;
    expectedImpact: string | null;
    sourceType: string | null;
    sourceReferenceId: string | null;
    evidence: unknown;
  }>;
  auditFindings: Array<{
    id: string;
    title: string;
    description: string;
    category: ScoreCategory;
  }>;
  business: ReportBusinessRecord;
  context: ReportBusinessContext;
  sourceEvidence: string;
  assessment: AuditAssessment;
  reviews: ReviewAnalysis;
  social: SocialAnalysis;
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  currentComparison: CompetitorComparisonResult | null;
  evidenceIntegrity: AuditEvidenceIntegritySnapshot;
}): AuditReportViewModel["recommendations"] {
  const pendingBusinessProfiles = business.profiles.filter(
    (profile) => profile.status === BusinessProfileStatus.PENDING,
  ).length;
  const confirmedGoogle = reviews.googleBusinessStatus === "confirmed";
  const hasCurrentComparison =
    (currentComparison?.analyzedCompetitorCount ?? 0) > 0;
  const canonicalAuditRecommendations: typeof auditRecommendations =
    evidenceIntegrity.canonicalRecommendations.map((canonical, index) => {
      const matching = auditRecommendations.find(
        (recommendation) =>
          recommendationIssueKey(recommendation) === canonical.issueKey,
      );
      return {
        id: matching?.id ?? `canonical-${index}-${canonical.issueKey}`,
        title: canonical.title,
        description: canonical.description,
        category: canonical.category,
        priority: canonical.priority,
        status: matching?.status ?? RecommendationStatus.TODO,
        effort: matching?.effort ?? canonical.estimatedEffort,
        impact: matching?.impact ?? canonical.expectedImpact,
        estimatedEffort: canonical.estimatedEffort,
        expectedImpact: canonical.expectedImpact,
        sourceType: matching?.sourceType ?? "audit_evidence",
        sourceReferenceId:
          canonical.sourceFindingId ?? matching?.sourceReferenceId ?? null,
        evidence: canonical,
      };
    });
  const normalized = canonicalAuditRecommendations
    .map((recommendation) => {
      let description = recommendation.description;
      let title = recommendation.title;
      const text = `${title} ${description}`;

      if (/content cadence|posting frequency|engagement|top-performing content/i.test(text)) {
        title = "Review public competitor positioning periodically";
        description = publicCompetitorMonitoringCopy(
          business.competitors.map((competitor) => competitor.name),
        );
      }

      return { ...recommendation, title, description };
    })
    .filter((recommendation) => {
      const text = `${recommendation.title} ${recommendation.description}`;

      if (
        !assessment.hasWebsite &&
        (recommendation.category === ScoreCategory.WEBSITE ||
          recommendation.category === ScoreCategory.SEO)
      ) {
        return false;
      }

      if (
        confirmedGoogle &&
        /\b(add|confirm|confirmation|claim|verify)\b.{0,70}\bgoogle business\b|\bgoogle business\b.{0,70}\b(confirm|confirmation|missing|pending|unconfirmed)\b/i.test(
          text,
        )
      ) {
        return false;
      }

      if (
        hasCurrentComparison &&
        /future analysis can compare|competitor analysis has not|comparison unavailable|add competitors? to improve/i.test(
          text,
        )
      ) {
        return false;
      }

      if (
        pendingBusinessProfiles === 0 &&
        /confirm or remove uncertain social profiles|pending social profiles?/i.test(
          text,
        )
      ) {
        return false;
      }

      return true;
    });
  let compatible = filterBusinessCompatibleContent({
    items: normalized,
    context,
    sourceEvidence,
    diagnosticLabel: `pdf:${business.id}`,
  });
  const socialRec = deterministicSocialRecommendation(context);

  if (
    (business.goals.includes(BusinessGoal.GROW_SOCIAL_MEDIA) ||
      compatible.some((item) => item.category === ScoreCategory.SOCIAL)) &&
    !compatible.some((item) =>
      /visual hospitality content|product value into repeatable|local proof|product-led content|focused weekly content/i.test(
        `${item.title} ${item.description}`,
      ),
    )
  ) {
    compatible = [
      ...compatible,
      {
        id: "current-social-strategy",
        title: socialRec.title,
        description: socialRec.description,
        category: ScoreCategory.SOCIAL,
        priority: RecommendationPriority.MEDIUM,
        status: RecommendationStatus.TODO,
        effort: "Medium",
        impact: "Medium",
        estimatedEffort: "Medium",
        expectedImpact: "Medium",
        sourceType: "current_live_state",
        sourceReferenceId: null,
        evidence: null,
      },
    ];
  }

  if (
    reviews.googleBusinessStatus === "confirmed" &&
    ((reviews.googleRating ?? 0) >= 4.3 ||
      (reviews.googleReviewCount ?? 0) >= 100) &&
    !compatible.some((item) =>
      /customer proof|selected google reviews|testimonial/i.test(
        `${item.title} ${item.description}`,
      ),
    )
  ) {
    compatible.push({
      id: "current-review-proof",
      title: assessment.hasWebsite
        ? "Feature customer proof near important decision points"
        : "Feature customer proof across confirmed profiles",
      description: assessment.hasWebsite
        ? "Place selected, authentic review excerpts or testimonials near the homepage and primary conversion path. Do not invent quotes; use customer-approved or publicly verifiable proof."
        : "Use authentic review proof in a pinned post, profile highlights, and the primary social conversion path. Do not invent quotes.",
      category: ScoreCategory.REVIEWS,
      priority: RecommendationPriority.HIGH,
      status: RecommendationStatus.TODO,
      effort: "Low",
      impact: "High",
      estimatedEffort: "Low",
      expectedImpact: "High",
      sourceType: "current_live_state",
      sourceReferenceId: null,
      evidence: null,
    });
  }

  const deduped: ReportRecommendation[] = dedupeRecommendations(compatible).map((recommendation) => {
    const canonicalEvidence = readCanonicalRecommendationEvidence(
      recommendation.evidence,
    );
    const relatedFinding =
      auditFindings.find(
        (finding) =>
          finding.id ===
          (canonicalEvidence?.sourceFindingId ??
            recommendation.sourceReferenceId),
      );
    const technical = isTechnicalRecommendation(recommendation);
    const evidenceSummary = canonicalEvidence?.reportEvidence ??
      relatedFinding?.description ??
      evidenceForCategory({
        category: recommendation.category,
        website,
        websiteCrawl,
        reviews,
        social,
        currentComparison,
      });

    return {
      id: recommendation.id,
      title: cleanReportCopy(recommendation.title.replace(/[.]+$/, "")),
      description: cleanReportCopy(recommendation.description),
      category: recommendation.category,
      priority: recommendation.priority,
      status: recommendation.status,
      estimatedEffort:
        recommendation.estimatedEffort ?? recommendation.effort ?? "Medium",
      expectedImpact:
        recommendation.expectedImpact ?? recommendation.impact ?? "Medium",
      sourceCategory: categoryLabel(recommendation.category),
      sourceFindingId:
        canonicalEvidence?.sourceFindingId ??
        recommendation.sourceReferenceId ??
        relatedFinding?.id ??
        null,
      evidenceSummary: completeEvidenceSummary(evidenceSummary),
      businessRelevance: businessRelevance(
        recommendation.category,
        context,
      ),
      confidence: canonicalEvidence
        ? evidenceConfidenceLabel(canonicalEvidence.evidenceConfidence)
        : relatedFinding || recommendation.sourceType
          ? "High" as const
          : "Medium" as const,
      freshness:
        recommendation.sourceType === "current_live_state"
          ? "Current live state" as const
          : canonicalEvidence || relatedFinding
            ? "Current audit" as const
            : "General best practice" as const,
      technical,
    };
  });
  const sorted = deduped.sort(recommendationSort);

  return {
    primary: sorted.filter((item) => !item.technical).slice(0, 3),
    technical: sorted.filter((item) => item.technical).slice(0, 5),
    all: sorted,
    completed: sorted.filter(
      (item) => item.status === RecommendationStatus.COMPLETED,
    ).length,
    total: sorted.length,
  };
}

function buildNextMoves({
  assessment,
  context,
  website,
  websiteCrawl,
  reviews,
  social,
  recommendations,
}: {
  assessment: AuditAssessment;
  context: ReportBusinessContext;
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  reviews: ReviewAnalysis;
  social: SocialAnalysis;
  recommendations: ReportRecommendation[];
}) {
  const moves: ReportNextMove[] = [];

  if (!assessment.hasWebsite) {
    moves.push(
      {
        title: "Make every confirmed profile explain the offer clearly",
        whyItMatters:
          "A social-first visitor should understand who the business serves, what it offers, and what to do next without needing a website.",
        expectedOutcome:
          "A clearer profile conversion path for DMs, bookings, calls, email, storefront visits, subscriptions, or link-in-bio actions.",
        evidence: `${social.confirmedProfilesCount} confirmed social profile${social.confirmedProfilesCount === 1 ? "" : "s"}; detected conversion paths: ${social.detectedConversionPaths.join(", ") || "none saved"}.`,
        implementationAction:
          "Rewrite each confirmed profile bio around the audience, main offer, proof, and one primary action. Add a prioritized link-in-bio path where appropriate.",
        category: ScoreCategory.SOCIAL,
        effort: "Low",
        impact: "High",
      },
      {
        title: "Create three pinned posts for new profile visitors",
        whyItMatters:
          "Pinned content can explain the offer, show proof, and direct a next step before a visitor explores the full feed.",
        expectedOutcome:
          "A more complete social storefront using only confirmed profile and Business Context evidence.",
        evidence:
          "Post-level engagement and performance were not analyzed; this is conversion-path guidance for a social-first presence.",
        implementationAction:
          "Pin one offer explainer, one trust or proof post, and one clear next-step post.",
        category: ScoreCategory.SOCIAL,
        effort: "Medium",
        impact: "High",
      },
    );
  } else {
    const primaryActions =
      website?.actionSummary?.detectedActionTypes ??
      website?.actionSummary?.primaryActions ??
      website?.ctaCandidates ??
      [];
    const ctaAssessment = getPrimaryCtaAssessment(website?.actionSummary);
    const unclearCta =
      ctaAssessment.clarity === "NEEDS_IMPROVEMENT" ||
      ctaAssessment.clarity === "UNCERTAIN";

    if (unclearCta) {
      moves.push({
        title: "Make primary visitor actions more prominent",
        whyItMatters:
          "Detected links can include navigation, utility, social, and secondary actions; their presence does not guarantee that the main next step is clear.",
        expectedOutcome:
          "Visitors can identify the most important next step faster and with less searching.",
        evidence: primaryActions.length
          ? `Detected homepage action types: ${primaryActions.slice(0, 6).join(", ")}. Primary CTA clarity: ${ctaAssessment.clarity.replaceAll("_", " ").toLowerCase()}. Link presence alone does not verify prominence.`
          : `No customer action link was detected on the homepage. Primary CTA clarity: ${ctaAssessment.clarity.replaceAll("_", " ").toLowerCase()}.`,
        implementationAction: `Choose one primary action that matches the observed conversion goal${context.primaryConversionGoal ? ` (${context.primaryConversionGoal})` : ""}, then give it stronger wording and visual prominence.`,
        category: ScoreCategory.WEBSITE,
        effort: "Low",
        impact: "High",
      });
    }

    const h1Issues =
      (websiteCrawl?.pagesWithNoH1 ?? 0) +
      (websiteCrawl?.pagesWithMultipleH1 ?? 0);
    if (website?.h1Count !== 1 || h1Issues > 0) {
      moves.push({
        title: "Give important pages a clear main headline",
        whyItMatters:
          "A descriptive main headline helps visitors understand the page and gives search engines a cleaner content signal.",
        expectedOutcome:
          "Faster page comprehension and a more consistent heading structure.",
        evidence: websiteCrawl
          ? `${websiteCrawl.pagesWithNoH1} scanned page(s) have no H1 and ${websiteCrawl.pagesWithMultipleH1} have multiple H1s.`
          : `Homepage H1 count: ${website?.h1Count ?? "not available"}.`,
        implementationAction:
          "Write one descriptive H1 for each important page, starting with the homepage and highest-value customer paths.",
        category: ScoreCategory.SEO,
        effort: "Medium",
        impact: "High",
      });
    }
  }

  if (
    reviews.googleBusinessStatus === "confirmed" &&
    ((reviews.googleReviewCount ?? 0) > 0 || reviews.googleRating !== null)
  ) {
    moves.push({
      title: assessment.hasWebsite
        ? "Feature customer proof near decision points"
        : "Turn current review proof into social trust signals",
      whyItMatters:
        "Current Google Business data provides verifiable trust evidence without requiring invented customer quotes.",
      expectedOutcome:
        "Potential customers see credible proof closer to the moment they decide whether to visit, contact, book, or buy.",
      evidence: googleListingSummary(reviews),
      implementationAction: assessment.hasWebsite
        ? "Select authentic review excerpts or approved testimonials and place them near the homepage and primary conversion path."
        : "Use authentic review proof in a pinned post, highlight, and profile conversion path.",
      category: ScoreCategory.REVIEWS,
      effort: "Low",
      impact: "High",
    });
  }

  for (const recommendation of recommendations) {
    if (moves.length >= 5) break;
    if (moves.some((move) => sharesMeaningfulTerm(move.title, recommendation.title))) {
      continue;
    }

    moves.push({
      title: recommendation.title,
      whyItMatters: recommendation.businessRelevance,
      expectedOutcome: expectedOutcomeForCategory(recommendation.category),
      evidence: recommendation.evidenceSummary,
      implementationAction: recommendation.description,
      category: recommendation.category,
      effort: recommendation.estimatedEffort,
      impact: recommendation.expectedImpact,
    });
  }

  return moves.slice(0, 3);
}

function buildExecutiveSummary({
  businessName,
  overallScore,
  scores,
  reviews,
  website,
  websiteCrawl,
  currentComparison,
  nextMoves,
}: {
  businessName: string;
  overallScore: number;
  scores: ReportScoreItem[];
  reviews: ReviewAnalysis;
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  currentComparison: CompetitorComparisonResult | null;
  nextMoves: ReportNextMove[];
}) {
  const scored = scores.filter(
    (item): item is ReportScoreItem & { score: number } =>
      typeof item.score === "number",
  );
  const strongest = [...scored]
    .filter((item) => item.category !== ScoreCategory.OVERALL)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.label);
  const weakest = [...scored]
    .filter((item) => item.category !== ScoreCategory.OVERALL)
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((item) => item.label);
  const parts = [
    `${businessName} has a ${healthLabel(overallScore).toLowerCase()} online foundation with an overall score of ${overallScore}/100.`,
    strongest.length
      ? `The strongest current areas are ${joinNaturally(strongest)}.`
      : null,
    reviews.googleBusinessStatus === "confirmed"
      ? `${googleListingSummary(reviews)} provides a verified local trust signal.`
      : null,
    website
      ? `${websiteCrawl?.pagesScanned ?? 1} website page${(websiteCrawl?.pagesScanned ?? 1) === 1 ? " was" : "s were"} analyzed; ${website.h1Count === 1 ? "the homepage has one H1" : `the homepage has ${website.h1Count} H1 headings`}${website.hasCanonical ? " and a canonical tag is present" : " and the canonical tag is missing"}.`
      : "Website and SEO were not scored because no confirmed website was provided.",
    currentComparison?.competitorAdvantages.at(0)
      ? `The current public competitor benchmark identifies this response: ${currentComparison.opportunities.at(0)?.title ?? currentComparison.competitorAdvantages[0].title}.`
      : null,
    weakest.length
      ? `The clearest attention areas are ${joinNaturally(weakest)}.`
      : null,
    nextMoves.at(0)
      ? `Start with: ${nextMoves[0].title}.`
      : null,
    "Individual social posts, engagement, posting frequency, and content performance were not analyzed.",
  ];

  return cleanReportCopy(parts.filter(Boolean).join(" "));
}

function buildCurrentFindings({
  auditFindings,
  reviews,
  social,
  currentComparison,
  sourceEvidence,
  context,
}: {
  auditFindings: Array<{
    id: string;
    title: string;
    description: string;
    category: ScoreCategory;
    severity: FindingSeverity;
  }>;
  reviews: ReviewAnalysis;
  social: SocialAnalysis;
  currentComparison: CompetitorComparisonResult | null;
  sourceEvidence: string;
  context: ReportBusinessContext;
}) {
  const hasCurrentComparison =
    (currentComparison?.analyzedCompetitorCount ?? 0) > 0;
  const filtered = auditFindings
    .filter((finding) => {
      const text = `${finding.title} ${finding.description}`;

      if (
        hasCurrentComparison &&
        /future analysis can compare|competitor analysis (?:is|has) not|competitor data needs|saved competitor only|comparison unavailable/i.test(
          text,
        )
      ) {
        return false;
      }

      if (
        reviews.googleBusinessStatus === "confirmed" &&
        /google business.{0,60}(missing|pending|unconfirmed|needs confirmation)|(?:add|confirm|claim).{0,60}google business/i.test(
          text,
        )
      ) {
        return false;
      }

      return true;
    });
  const compatible = filterBusinessCompatibleContent({
    items: filtered,
    context,
    sourceEvidence,
    diagnosticLabel: "report-findings",
  }).map<ReportFinding>((finding) => ({
    id: finding.id,
    title: normalizeFindingTitle(finding.title),
    description: normalizeFindingDescription(finding.description),
    category: finding.category,
    severity: finding.severity,
    source: "selected_audit",
  }));

  if (
    reviews.googleBusinessStatus === "confirmed" &&
    !compatible.some((finding) =>
      /google business profile is confirmed/i.test(finding.title),
    )
  ) {
    compatible.push({
      id: "current-google-business",
      title: "Google Business profile is confirmed",
      description: `${googleListingSummary(reviews)} is current live trust evidence.`,
      category: ScoreCategory.REVIEWS,
      severity: FindingSeverity.INFO,
      source: "current_live_state",
    });
  }

  if (hasCurrentComparison && currentComparison) {
    compatible.push({
      id: "current-competitor-comparison",
      title: "Public competitor comparison is available",
      description: buildDeterministicSummary("The business", currentComparison)
        .executiveSummary,
      category: ScoreCategory.COMPETITORS,
      severity: FindingSeverity.INFO,
      source: "current_comparison",
    });
  }

  if (
    social.pendingProfilesCount > 0 &&
    !compatible.some((finding) => /pending social/i.test(finding.title))
  ) {
    compatible.push({
      id: "current-pending-social",
      title: `${social.pendingProfilesCount} social profile${social.pendingProfilesCount === 1 ? " needs" : "s need"} confirmation`,
      description:
        "Pending profiles are shown separately and are not counted as confirmed coverage.",
      category: ScoreCategory.SOCIAL,
      severity: FindingSeverity.MEDIUM,
      source: "current_live_state",
    });
  }

  return dedupeFindings(compatible);
}

function groupFindings(findings: ReportFinding[]) {
  const strengths = findings.filter(
    (finding) =>
      finding.severity === FindingSeverity.INFO &&
      !/could|needs?|missing|unclear|pending|opportunit/i.test(
        `${finding.title} ${finding.description}`,
      ),
  );
  const warnings = findings.filter(
    (finding) =>
      finding.severity === FindingSeverity.HIGH ||
      finding.severity === FindingSeverity.CRITICAL ||
      /missing|failed|blocked|no h1|multiple pages/i.test(
        `${finding.title} ${finding.description}`,
      ),
  );
  const assigned = new Set([...strengths, ...warnings].map((item) => item.id));
  const opportunities = findings.filter((finding) => !assigned.has(finding.id));

  return { strengths, warnings, opportunities, all: findings };
}

function buildScoreItems({
  auditScores,
  assessment,
  social,
  reviews,
  competitorStatus,
}: {
  auditScores: Array<{
    category: ScoreCategory;
    platform: ProfilePlatform | null;
    score: number;
  }>;
  assessment: AuditAssessment;
  social: SocialAnalysis;
  reviews: ReviewAnalysis;
  competitorStatus: AuditReportViewModel["competitors"]["status"];
}) {
  const categories = [
    ScoreCategory.WEBSITE,
    ScoreCategory.SEO,
    ScoreCategory.BRANDING,
    ScoreCategory.SOCIAL,
    ScoreCategory.REVIEWS,
    ScoreCategory.COMPETITORS,
  ];

  return categories.map<ReportScoreItem>((category) => {
    if (
      !assessment.applicableCategories.includes(category) &&
      (category === ScoreCategory.WEBSITE || category === ScoreCategory.SEO)
    ) {
      return {
        category,
        label: categoryLabel(category),
        score: null,
        status:
          category === ScoreCategory.WEBSITE
            ? "not_provided"
            : "not_applicable",
        note:
          "Adding and confirming a website later will unlock website and SEO analysis.",
      };
    }

    if (category === ScoreCategory.COMPETITORS) {
      return {
        category,
        label: categoryLabel(category),
        score:
          competitorStatus === "current" || competitorStatus === "partial"
            ? categoryScore(auditScores, category)
            : null,
        status:
          competitorStatus === "not_configured"
            ? "not_configured"
            : competitorStatus === "saved_not_analyzed"
              ? "saved_not_analyzed"
              : competitorStatus === "partial"
                ? "partial"
                : "scored",
      };
    }

    return {
      category,
      label: categoryLabel(category),
      score:
        category === ScoreCategory.SOCIAL
          ? social.score
          : category === ScoreCategory.REVIEWS
            ? reviews.score
            : categoryScore(auditScores, category),
      status: "scored",
    };
  });
}

function buildScoringMetadata({
  snapshot,
  assessment,
  website,
  websiteCrawl,
  currentComparison,
}: {
  snapshot: unknown;
  assessment: AuditAssessment;
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  currentComparison: CompetitorComparisonResult | null;
}): ReportScoringMetadata {
  const saved = getSnapshotRecord(snapshot, "scoringMetadata");
  const savedAnalyzers = isRecord(saved?.analyzerVersions)
    ? saved?.analyzerVersions
    : {};

  return {
    scoringEngineVersion:
      stringFromUnknown(saved?.scoringEngineVersion) ??
      "legacy-growth-score",
    reportViewModelVersion: REPORT_VIEW_MODEL_VERSION,
    analyzerVersions: {
      website:
        stringFromUnknown(savedAnalyzers.website) ?? WEBSITE_ANALYZER_VERSION,
      seo: stringFromUnknown(savedAnalyzers.seo) ?? SEO_ANALYZER_VERSION,
      social:
        stringFromUnknown(savedAnalyzers.social) ?? "social-analyzer-v2",
      reviews:
        stringFromUnknown(savedAnalyzers.reviews) ?? "review-analyzer-v2",
      competitors:
        stringFromUnknown(savedAnalyzers.competitors) ??
        COMPETITOR_COMPARISON_VERSION,
    },
    categoryWeights: assessment.scoreWeights,
    applicableCategories: assessment.applicableCategories,
    pagesScanned: websiteCrawl?.pagesScanned ?? (website ? 1 : 0),
    crawlLimit: websiteCrawl?.crawlLimitUsed ?? (website ? 1 : 0),
    crawlStatus: !website
      ? "not_applicable"
      : !websiteCrawl
        ? "homepage_only"
        : websiteCrawl.failedPages > 0
          ? "partial"
          : "full",
    competitorSnapshotIds:
      currentComparison?.freshness
        .map((item) => item.snapshotId)
        .filter((id): id is string => Boolean(id)) ?? [],
    generatedAt:
      stringFromUnknown(saved?.generatedAt) ?? new Date().toISOString(),
  };
}

function getCompetitorStatus({
  activeCount,
  comparison,
}: {
  activeCount: number;
  comparison: CompetitorComparisonResult | null;
}): AuditReportViewModel["competitors"]["status"] {
  if (activeCount === 0) return "not_configured";
  if (!comparison || comparison.analyzedCompetitorCount === 0) {
    return "saved_not_analyzed";
  }
  if (comparison.staleCompetitorCount > 0 || comparison.failedCompetitorCount > 0) {
    return "partial";
  }
  return "current";
}

function normalizeBusinessContext({
  business,
  website,
  websiteCrawl,
}: {
  business: ReportBusinessRecord;
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
}) {
  const description = business.description;
  if (!description) {
    return { description: null, needsReview: false, reviewNote: null };
  }

  const observableText = [
    website?.pageTitle,
    website?.metaDescription,
    ...(website?.h1Text ?? []),
    ...(websiteCrawl?.pageResults.flatMap((page) => [
      page.title,
      ...page.h1Text,
    ]) ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  const claimsLateNight = /\blate[- ]night\b/i.test(description);
  const supportsLateNight =
    /\b(?:10|11|12|1|2|3|4|5)\s*(?:p\.?m\.?|am)\b/i.test(observableText) ||
    /\b(late[- ]night|open late|after midnight)\b/i.test(observableText);

  if (!claimsLateNight || supportsLateNight) {
    return { description, needsReview: false, reviewNote: null };
  }

  const restaurant =
    classifyReportBusiness({
      ...business,
      name: business.name,
    }) === "restaurant_hospitality";
  const normalized = description
    .replace(
      /\b(?:open|offering [^.]*?)?\s*daily from late morning to late[- ]night\b/gi,
      restaurant ? "open daily for lunch and dinner" : "open daily",
    )
    .replace(/\blate[- ]night\b/gi, restaurant ? "dinner" : "evening")
    .replace(/\s+/g, " ")
    .trim();

  return {
    description: normalized,
    needsReview: true,
    reviewNote:
      "Business Context may need review because current website evidence does not support the saved operating-hours wording. The confirmed record was not changed.",
  };
}

function buildSourceEvidence({
  context,
  website,
  websiteCrawl,
}: {
  context: ReportBusinessContext;
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
}) {
  return [
    ...Object.values(context),
    website?.pageTitle,
    website?.metaDescription,
    ...(website?.h1Text ?? []),
    ...(website?.ctaCandidates ?? []),
    ...(websiteCrawl?.importantPagesFound ?? []),
    ...(websiteCrawl?.pageResults.flatMap((page) => [
      page.title,
      ...page.h1Text,
      ...page.ctaCandidates,
    ]) ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

function validateSocialStrategy(
  strategy: SocialStrategyData,
  context: ReportBusinessContext,
  sourceEvidence: string,
) {
  const content = [
    strategy.reasoningSummary,
    ...strategy.recommendedPlatforms.flatMap((item) => [
      item.platform,
      item.reason,
      item.contentFit,
    ]),
    ...strategy.contentPillars.flatMap((item) => [
      item.title,
      item.description,
      ...item.exampleTopics,
    ]),
    ...strategy.weeklyPlan.flatMap((item) => [item.idea, item.goal]),
    ...strategy.suggestedPosts.flatMap((item) => [
      item.hook,
      item.postConcept,
      item.captionDraft,
      item.callToAction,
    ]),
    ...strategy.conversionTips.flatMap((item) => [item.tip, item.reason]),
    ...strategy.competitorOpportunities.flatMap((item) => [
      item.opportunity,
      item.reason,
    ]),
  ].join(" ");

  return validateBusinessCompatibleContent({
    item: { title: "Social Strategy", description: content },
    context,
    sourceEvidence,
  }).compatible &&
    !/adding competitor data|absence of a google business|google business profile.{0,40}(missing|unconfirmed)/i.test(
      content,
    );
}

function parseSnapshotSocialStrategy(value: unknown) {
  if (!isRecord(value)) return null;

  const strategy = {
    platformRecommendations: value.recommendedPlatforms,
    contentPillars: value.contentPillars,
    weeklyPlan: value.weeklyPlan,
    suggestedPosts: value.suggestedPosts,
    conversionTips: value.conversionTips,
    competitorOpportunities: value.competitorOpportunities,
    confidence: value.confidence,
    reasoningSummary: value.reasoningSummary,
    id: "snapshot",
    source: "fallback",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as SocialStrategyRecord;

  return parseSocialStrategy(strategy);
}

function getSnapshotValue<T>(
  snapshot: unknown,
  key: string,
  validate: (value: Record<string, unknown>) => boolean,
) {
  const value = getSnapshotRecord(snapshot, key);
  return value && validate(value) ? (value as T) : null;
}

function getSnapshotRecord(snapshot: unknown, key: string) {
  if (!isRecord(snapshot) || !isRecord(snapshot[key])) return null;
  return snapshot[key];
}

function evidenceForCategory({
  category,
  website,
  websiteCrawl,
  reviews,
  social,
  currentComparison,
}: {
  category: ScoreCategory;
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  reviews: ReviewAnalysis;
  social: SocialAnalysis;
  currentComparison: CompetitorComparisonResult | null;
}) {
  switch (category) {
    case ScoreCategory.WEBSITE:
      return websiteCrawl
        ? `${websiteCrawl.pagesScanned} pages scanned; ${websiteCrawl.pagesWithNoCTA} have no detected action links.`
        : website
          ? `Homepage analyzed at ${website.normalizedUrl}.`
          : "No website was provided.";
    case ScoreCategory.SEO:
      return websiteCrawl
        ? `${websiteCrawl.pagesMissingMetaDescription} pages are missing meta descriptions and ${websiteCrawl.pagesWithNoH1} have no H1.`
        : "Homepage SEO evidence from the selected audit.";
    case ScoreCategory.SOCIAL:
      return `${social.confirmedProfilesCount} confirmed and ${social.pendingProfilesCount} pending social profiles; post performance was not analyzed.`;
    case ScoreCategory.REVIEWS:
      return googleListingSummary(reviews);
    case ScoreCategory.COMPETITORS:
      return currentComparison
        ? `${currentComparison.analyzedCompetitorCount} timestamped public competitor comparison(s) are available.`
        : "No completed public competitor comparison is available.";
    case ScoreCategory.BRANDING:
      return "Branding guidance uses confirmed profile coverage, Business Context, and observable website messaging.";
    default:
      return "Saved audit evidence.";
  }
}

function businessRelevance(
  category: ScoreCategory,
  context: ReportBusinessContext,
) {
  const offer = context.mainOffer
    ? ` for ${shortText(context.mainOffer, 110)}`
    : "";
  switch (category) {
    case ScoreCategory.WEBSITE:
      return `Website clarity helps visitors understand the offer and take the observed conversion step${offer}.`;
    case ScoreCategory.SEO:
      return "Search structure helps important pages communicate clearly to both potential customers and search engines.";
    case ScoreCategory.SOCIAL:
      return "Social recommendations support confirmed channels, platform fit, and a clearer path from attention to action.";
    case ScoreCategory.REVIEWS:
      return "Verified trust signals can reduce uncertainty when a customer decides whether to visit, contact, book, or buy.";
    case ScoreCategory.COMPETITORS:
      return "Public competitor evidence helps prioritize a response without guessing about private performance.";
    case ScoreCategory.BRANDING:
      return "Consistent public messaging makes the business easier to recognize and trust.";
    default:
      return "This action supports the current business goals and audit evidence.";
  }
}

function expectedOutcomeForCategory(category: ScoreCategory) {
  switch (category) {
    case ScoreCategory.WEBSITE:
      return "A clearer visitor path and stronger conversion clarity.";
    case ScoreCategory.SEO:
      return "Cleaner search signals and easier page comprehension.";
    case ScoreCategory.SOCIAL:
      return "A more focused platform and content direction tied to a real next step.";
    case ScoreCategory.REVIEWS:
      return "More visible, credible trust at decision points.";
    case ScoreCategory.COMPETITORS:
      return "A sharper response to publicly observable competitor strengths.";
    case ScoreCategory.BRANDING:
      return "More consistent and recognizable public messaging.";
    default:
      return "A stronger online growth foundation.";
  }
}

function recommendationSort(a: ReportRecommendation, b: ReportRecommendation) {
  const statusWeight: Record<RecommendationStatus, number> = {
    TODO: 0,
    IN_PROGRESS: 0,
    COMPLETED: 3,
    DISMISSED: 4,
  };
  const priorityWeight: Record<RecommendationPriority, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };
  const impactWeight: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const effortWeight: Record<string, number> = { Low: 0, Medium: 1, High: 2 };

  return (
    statusWeight[a.status] - statusWeight[b.status] ||
    priorityWeight[a.priority] - priorityWeight[b.priority] ||
    (impactWeight[a.expectedImpact] ?? 1) -
      (impactWeight[b.expectedImpact] ?? 1) ||
    (effortWeight[a.estimatedEffort] ?? 1) -
      (effortWeight[b.estimatedEffort] ?? 1)
  );
}

function isTechnicalRecommendation(item: {
  title: string;
  description: string;
}) {
  return /\bH1s?\b|meta description|canonical|alt text|robots\.txt|sitemap\.xml|viewport|indexab|schema markup|structured data/i.test(
    `${item.title} ${item.description}`,
  );
}

function dedupeRecommendations<T extends { title: string; description: string }>(
  items: T[],
) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title
      .toLowerCase()
      .replace(/\b(the|a|an|your|to|for|and|or)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recommendationIssueKey(recommendation: {
  title: string;
  description: string;
  category: ScoreCategory;
  evidence: unknown;
}) {
  if (
    isRecord(recommendation.evidence) &&
    typeof recommendation.evidence.issueKey === "string"
  ) {
    return recommendation.evidence.issueKey;
  }
  return canonicalRecommendationIssueKey(recommendation);
}

function readCanonicalRecommendationEvidence(
  value: unknown,
): AuditEvidenceIntegritySnapshot["canonicalRecommendations"][number] | null {
  if (
    !isRecord(value) ||
    typeof value.issueKey !== "string" ||
    typeof value.reportEvidence !== "string" ||
    !Array.isArray(value.sourceEvidenceIds)
  ) {
    return null;
  }
  return value as AuditEvidenceIntegritySnapshot["canonicalRecommendations"][number];
}

function evidenceConfidenceLabel(
  value: "HIGH" | "MEDIUM" | "LOW",
): ReportRecommendation["confidence"] {
  return value === "HIGH" ? "High" : value === "MEDIUM" ? "Medium" : "Low";
}

function dedupeFindings(items: ReportFinding[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.category}:${item.title}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sharesMeaningfulTerm(left: string, right: string) {
  const stopWords = new Set([
    "this", "that", "with", "from", "your", "have", "will", "into",
    "more", "clear", "business", "current", "improve", "create", "review",
  ]);
  const words = left
    .toLowerCase()
    .match(/[a-z0-9]{4,}/g)
    ?.filter((word) => !stopWords.has(word)) ?? [];
  const normalizedRight = right.toLowerCase();
  return words.some((word) => normalizedRight.includes(word));
}

function googleListingSummary(reviews: ReviewAnalysis) {
  const parts = [
    reviews.googleBusinessListingName,
    typeof reviews.googleRating === "number"
      ? `${reviews.googleRating.toFixed(1)} rating`
      : null,
    typeof reviews.googleReviewCount === "number"
      ? `${reviews.googleReviewCount.toLocaleString()} reviews`
      : null,
  ].filter((value): value is string => Boolean(value));
  return parts.join(" | ") || "Google Business data is unavailable.";
}

function socialScopeNote() {
  return "Generated from Business Context, confirmed profiles, website content, goals, reviews, and competitor information. Individual posts, engagement, posting frequency, and content performance were not analyzed.";
}

function competitorStatusLabel(
  value: AuditReportViewModel["competitors"]["status"],
) {
  switch (value) {
    case "not_configured":
      return "Not configured";
    case "saved_not_analyzed":
      return "Saved but not analyzed";
    case "partial":
      return "Partial comparison";
    case "current":
      return "Current comparison";
  }
}

function categoryLabel(category: ScoreCategory) {
  const labels: Record<ScoreCategory, string> = {
    OVERALL: "Overall",
    WEBSITE: "Website",
    SEO: "SEO",
    BRANDING: "Branding",
    SOCIAL: "Social",
    REVIEWS: "Reviews & Trust",
    COMPETITORS: "Competitive Position",
  };
  return labels[category];
}

function platformLabel(platform: ProfilePlatform) {
  return platform
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function healthLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  return "Needs Attention";
}

function joinNaturally(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(cleanReportCopy).filter(Boolean))];
}

function shortText(value: string, limit: number) {
  const clean = cleanReportCopy(value);
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 3)}...`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function dateFromUnknown(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

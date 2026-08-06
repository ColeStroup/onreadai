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

import {
  analyzeReviews,
  normalizeReviewAnalysisForDisplay,
  type ReviewAnalysis,
} from "@/lib/analyzers/review-analyzer";
import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import {
  analyzeSocialProfiles,
  type SocialAnalysis,
} from "@/lib/analyzers/social-analyzer";
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
  readAiReviewedOpportunityEvidence,
  readSelectiveAiAuditSnapshot,
  type SelectiveAiAuditSnapshot,
} from "@/lib/audits/selective-ai/types";
import {
  readEvidenceIntegrity,
  type AuditEvidenceRecord,
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
  classifyAuditFindingType,
  findingTypeLabels,
  type AuditFindingType,
} from "@/lib/audits/finding-taxonomy";
import { readFindingValidationMetadata } from "@/lib/audits/quality/candidate-pipeline";
import {
  buildNormalizedAuditFacts,
  readNormalizedAuditFacts,
  type AuditCoverageV2,
  type NormalizedAuditFacts,
} from "@/lib/audits/normalized-audit-facts";
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
import { businessGoalLabels, websiteSeoBusinessGoals } from "@/lib/goals";
import { cleanReportCopy } from "@/lib/pdf/text-sanitize";
import { prisma } from "@/lib/prisma";
import {
  isWebsiteGrowthAuditSnapshot,
  LEGACY_SCORE_LABEL,
  WEBSITE_GROWTH_SCORE_LABEL,
  isWebsiteSeoCategory,
  isWebsiteSeoReportCategory,
} from "@/lib/product/website-seo-scope";
import {
  aggregateCompetitorProfileCounts,
  aggregateProfileCounts,
} from "@/lib/profiles/profile-counts";
import {
  canonicalRecommendationIssueKey,
  canonicalRecommendationRootCauseKey,
} from "@/lib/recommendations/recommendation-deduplication";
import {
  attachCompatibilityCanonicalReport,
  buildCanonicalAuditReport,
  CANONICAL_AUDIT_REPORT_VERSION,
  materializeCanonicalReport,
  readCanonicalAuditReport,
  type CanonicalAffectedPage,
  type CanonicalAuditReport,
  type CanonicalFactsSummary,
  type CanonicalReportIntegrityIssue,
  type CanonicalScoreImpact,
} from "@/lib/reports/canonical-audit-report";
import type { CanonicalPagePurpose } from "@/lib/reports/page-purpose";
import {
  classifyReportBusiness,
  filterBusinessCompatibleContent,
  publicCompetitorMonitoringCopy,
  validateBusinessCompatibleContent,
  type ReportBusinessArchetype,
  type ReportBusinessContext,
} from "@/lib/reports/content-compatibility";
import { scopeFindingEvidenceToAffectedPages } from "@/lib/reports/finding-evidence-scope";
import { shouldRecoverSelectiveAiEvidence } from "@/lib/reports/selective-ai-report-recovery";
import {
  assessDerivedFreshness,
  buildCompetitorComparisonDependencyFingerprint,
  buildSocialStrategyDependencyFingerprint,
  COMPETITOR_COMPARISON_VERSION,
  LEGACY_REPORT_VIEW_MODEL_VERSION,
  latestDate,
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
  confidence?: "High" | "Medium" | "Low";
  evidenceCompleteness?: number;
  dataRequirementsMet?: boolean;
  missingInputs?: string[];
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
  sourceLabel?: (typeof findingTypeLabels)[AuditFindingType];
  sourceUrl?: string | null;
  issueKey?: string | null;
  rootCauseKey?: string | null;
  affectedUrls?: string[];
  affectedPages?: CanonicalAffectedPage[];
  evidenceIds?: string[];
  completionCriteria?: string | null;
  verificationMethod?: string | null;
  suggestedSpecialistCategory?: string | null;
  canonicalEvidence?: unknown;
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
  findingType?: AuditFindingType;
  source:
    | "selected_audit"
    | "current_live_state"
    | "current_comparison"
    | "ai_reviewed_opportunity";
  sourceLabel?: (typeof findingTypeLabels)[AuditFindingType];
  sourceUrl?: string | null;
  evidenceSummary?: string;
  confidence?: "High" | "Medium" | "Low";
  whyItMatters?: string | null;
  suggestedAction?: string | null;
  ownerFixability?: string | null;
  whoCanHelp?: string | null;
  howOnreadWillCheck?: string | null;
  materiality?: "HIGH" | "MEDIUM" | "LOW" | null;
  validationState?: string | null;
  supportingEvidenceIds?: string[];
  issueKey?: string | null;
  stableKey?: string | null;
  rootCauseKey?: string | null;
  affectedUrls?: string[];
  affectedPages?: CanonicalAffectedPage[];
  completionCriteria?: string | null;
  verificationMethod?: string | null;
  suggestedSpecialistCategory?: string | null;
  scoreImpact?: CanonicalScoreImpact | null;
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
  productScope: "website_seo" | "legacy_presence";
  scoreLabel: string;
  legacyScoring: boolean;
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
      userConfirmedSocialProfiles?: number;
      publiclyDetectedSocialProfiles?: number;
      additionalDetectedPlatforms?: string[];
      pendingSocialProfiles?: number;
      profileContentAnalyzed?: number;
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
    source: "ai_generated" | "deterministic_fallback" | "disabled";
    sourceLabel:
      "AI generated" | "Deterministic fallback" | "Not part of this report";
    freshness: DerivedFreshness;
    scopeNote: string;
  };
  competitors: {
    status: "not_configured" | "saved_not_analyzed" | "partial" | "current";
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
  normalizedFacts?: NormalizedAuditFacts;
  coverage?: AuditCoverageV2;
  aiAnalysis?: SelectiveAiAuditSnapshot | null;
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
  canonicalReport?: CanonicalAuditReport;
  reportIntegrity?: {
    status: "READY" | "NEEDS_REVIEW";
    issues: CanonicalReportIntegrityIssue[];
  };
  canonicalFacts?: CanonicalFactsSummary;
  pagePurposes?: CanonicalPagePurpose[];
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

function disabledSocialAnalysis(): SocialAnalysis {
  const base = analyzeSocialProfiles({ businessProfiles: [] });
  return {
    ...base,
    score: 0,
    evidenceCompleteness: 0,
    dataRequirementsMet: false,
    missingRecommendedPlatforms: [],
    strengths: [],
    warnings: [],
    opportunities: [],
    recommendedFixes: [],
    dataUsed: [],
    limitations: ["Social Growth is not part of this report."],
  };
}

function disabledReviewAnalysis(): ReviewAnalysis {
  const base = analyzeReviews({ businessProfiles: [] });
  return {
    ...base,
    score: 0,
    evidenceCompleteness: 0,
    dataRequirementsMet: false,
    missingInputs: [],
    reviewScoreExplanation:
      "Local Growth and review performance are not part of this report.",
    trustStrengths: [],
    trustWarnings: [],
    opportunities: [],
    recommendedFixes: [],
    competitorReviewCoverage: [],
  };
}

function unavailableModuleFreshness(
  sourceAuditId: string,
  reason: string,
): DerivedFreshness {
  return {
    status: "UNAVAILABLE",
    generatedAt: null,
    sourceAuditId,
    dependencyFingerprint: "disabled-launch-module",
    storedDependencyFingerprint: null,
    generatorVersion: "disabled-launch-module",
    reason,
  };
}

function disabledSocialStrategy(
  auditId: string,
): AuditReportViewModel["socialStrategy"] {
  return {
    data: {
      recommendedPlatforms: [],
      contentPillars: [],
      weeklyPlan: [],
      suggestedPosts: [],
      conversionTips: [],
      competitorOpportunities: [],
      confidence: 0,
      reasoningSummary: "Social Growth is not part of this report.",
    },
    source: "disabled",
    sourceLabel: "Not part of this report",
    freshness: unavailableModuleFreshness(
      auditId,
      "Social Growth is not part of this report.",
    ),
    scopeNote:
      "Social Growth is disabled for the Website & SEO launch product.",
  };
}

export async function buildAuditReportViewModel({
  businessId,
  auditId,
  ownerId,
  attachCanonicalReport = true,
}: {
  businessId: string;
  auditId: string;
  ownerId: string;
  attachCanonicalReport?: boolean;
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

  const storedCanonicalReport = readCanonicalAuditReport(
    audit.analysisSnapshot,
  );
  const storedEvidenceIntegrity = readEvidenceIntegrity(audit.analysisSnapshot);
  const recoverLegacySelectiveAiEvidence =
    shouldRecoverSelectiveAiEvidence({
      canonicalReport: storedCanonicalReport,
      evidenceIntegrity: storedEvidenceIntegrity,
      findings: audit.findings,
    });
  if (storedCanonicalReport && !recoverLegacySelectiveAiEvidence) {
    return materializeCanonicalReport(
      storedCanonicalReport,
      audit.recommendations.map((recommendation) => ({
        id: recommendation.id,
        status: recommendation.status,
      })),
    );
  }

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
  const business = audit.business;
  const focusedWebsiteSeoReport = isWebsiteGrowthAuditSnapshot(
    audit.analysisSnapshot,
  );
  const currentState = focusedWebsiteSeoReport
    ? {
        currentSocial: analyzeSocialProfiles({ businessProfiles: [] }),
        currentReviews: analyzeReviews({ businessProfiles: [] }),
        comparison: null,
      }
    : await buildCurrentCompetitorComparison({
        businessId,
        ownerId,
        auditId,
      });

  if (!currentState) return null;

  const assessment = getAuditAssessment(audit.analysisSnapshot);
  const website = getSnapshotValue<WebsiteAnalysis>(
    audit.analysisSnapshot,
    "website",
    (value) =>
      typeof value.normalizedUrl === "string" &&
      typeof value.score === "number",
  );
  const websiteCrawl = getSnapshotValue<WebsiteCrawlResult>(
    audit.analysisSnapshot,
    "websiteCrawl",
    (value) =>
      Array.isArray(value.pageResults) &&
      typeof value.pagesScanned === "number",
  );
  const seo = getSnapshotValue<SeoAnalysis>(
    audit.analysisSnapshot,
    "seo",
    (value) => typeof value.score === "number",
  );
  const aiAnalysis = readSelectiveAiAuditSnapshot(audit.analysisSnapshot);
  const savedSocial = focusedWebsiteSeoReport
    ? null
    : getSnapshotValue<SocialAnalysis>(
        audit.analysisSnapshot,
        "social",
        (value) =>
          typeof value.score === "number" &&
          Array.isArray(value.confirmedPlatforms) &&
          Array.isArray(value.pendingPlatforms),
      );
  const savedReviews = focusedWebsiteSeoReport
    ? null
    : getSnapshotValue<ReviewAnalysis>(
        audit.analysisSnapshot,
        "reviews",
        (value) =>
          typeof value.score === "number" &&
          typeof value.googleBusinessStatus === "string" &&
          Array.isArray(value.googleBusinessProfiles),
      );
  const social = focusedWebsiteSeoReport
    ? disabledSocialAnalysis()
    : normalizeSocialAnalysisForDisplay(
        savedSocial ?? currentState.currentSocial,
      );
  const reviews = focusedWebsiteSeoReport
    ? disabledReviewAnalysis()
    : normalizeReviewAnalysisForDisplay(
        savedReviews ?? currentState.currentReviews,
      );
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
  const normalizedFacts =
    readNormalizedAuditFacts(audit.analysisSnapshot) ??
    buildNormalizedAuditFacts({
      website,
      websiteCrawl,
      seo,
      social,
      reviews,
      selectiveAi: aiAnalysis,
      businessProfiles: business.profiles.map((profile) => ({
        platform: profile.platform,
        status: profile.status,
      })),
      businessContext: compatibilityContext,
      competitorConfigured: business.competitors.length > 0,
      competitorAnalyzed:
        (currentState.comparison?.analyzedCompetitorCount ?? 0) > 0,
      scoreValues: Object.fromEntries(
        audit.scores.map((score) => [score.category, score.score]),
      ) as Partial<Record<ScoreCategory, number>>,
      generatedAt: (audit.completedAt ?? audit.createdAt).toISOString(),
    });
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
  const builtScores = buildScoreItems({
    auditScores: audit.scores,
    assessment,
    social,
    reviews,
    competitorStatus,
    normalizedFacts,
  });
  const scores = focusedWebsiteSeoReport
    ? builtScores.filter((score) => isWebsiteSeoReportCategory(score.category))
    : builtScores;
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
  const businessProfilesForCounts = business.profiles
    .filter(
      (profile) =>
        !focusedWebsiteSeoReport ||
        profile.platform === ProfilePlatform.WEBSITE,
    )
    .map((profile) => ({
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
    (focusedWebsiteSeoReport ? [] : business.competitors).map((competitor) => ({
      id: competitor.id,
      name: competitor.name,
      profiles: competitor.discoveredProfiles,
    })),
  );
  const evidenceIntegrity =
    storedEvidenceIntegrity && !recoverLegacySelectiveAiEvidence
      ? storedEvidenceIntegrity
      : buildAuditEvidenceIntegrity({
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
          scoreBreakdowns: storedEvidenceIntegrity?.scoreBreakdowns ?? [],
          observedAt: audit.completedAt ?? audit.createdAt,
          sourceVersions: {
            ...scoringMetadata.analyzerVersions,
            selectiveAi: aiAnalysis?.version ?? "selective-ai-audit-v1",
            scoring: scoringMetadata.scoringEngineVersion,
          },
        }).snapshot;
  const builtFindings = buildCurrentFindings({
    auditFindings: audit.findings,
    reviews,
    social,
    currentComparison,
    sourceEvidence,
    context: compatibilityContext,
    evidenceIntegrity,
  });
  const allFindings = focusedWebsiteSeoReport
    ? builtFindings.filter((finding) => isWebsiteSeoCategory(finding.category))
    : builtFindings;
  const builtRecommendationSet = buildCurrentRecommendations({
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
  const recommendationSet = focusedWebsiteSeoReport
    ? focusedRecommendationSet(builtRecommendationSet)
    : builtRecommendationSet;
  const socialStrategy = focusedWebsiteSeoReport
    ? disabledSocialStrategy(audit.id)
    : buildCurrentSocialStrategy({
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
    social,
    recommendations: recommendationSet.primary,
  });
  const executiveSummary = focusedWebsiteSeoReport
    ? buildWebsiteSeoExecutiveSummary({
        businessName: business.name,
        overallScore,
        scores,
        nextMoves,
      })
    : buildExecutiveSummary({
        businessName: business.name,
        overallScore,
        scores,
        reviews,
        currentComparison,
        nextMoves,
        normalizedFacts,
      });
  const snapshotDate = latestDate(
    currentComparison?.freshness.map((item) => item.scannedAt) ?? [],
  );
  const reportGoals = focusedWebsiteSeoReport
    ? business.goals.filter((goal) => websiteSeoBusinessGoals.includes(goal))
    : business.goals;
  const reportPrimaryGoal =
    business.primaryGoal && reportGoals.includes(business.primaryGoal)
      ? business.primaryGoal
      : null;
  const baseReport: AuditReportViewModel = {
    productScope: focusedWebsiteSeoReport ? "website_seo" : "legacy_presence",
    scoreLabel: focusedWebsiteSeoReport
      ? WEBSITE_GROWTH_SCORE_LABEL
      : LEGACY_SCORE_LABEL,
    legacyScoring: !focusedWebsiteSeoReport,
    business: {
      id: business.id,
      name: business.name,
      initialInput: business.initialInput,
      archetype,
      selectedGoals: reportGoals,
      primaryGoal: reportPrimaryGoal,
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
      userSelectedGrowthGoal: reportPrimaryGoal
        ? businessGoalLabels[reportPrimaryGoal]
        : "Not selected",
      secondaryGoals: reportGoals
        .filter((goal) => goal !== reportPrimaryGoal)
        .map((goal) => businessGoalLabels[goal]),
      profileSummary: {
        confirmed: business.profiles.filter(
          (profile) =>
            profile.status === BusinessProfileStatus.CONFIRMED &&
            (!focusedWebsiteSeoReport ||
              profile.platform === ProfilePlatform.WEBSITE),
        ).length,
        pending: business.profiles.filter(
          (profile) =>
            profile.status === BusinessProfileStatus.PENDING &&
            (!focusedWebsiteSeoReport ||
              profile.platform === ProfilePlatform.WEBSITE),
        ).length,
        removed: business.profiles.filter(
          (profile) =>
            profile.status === BusinessProfileStatus.REMOVED &&
            (!focusedWebsiteSeoReport ||
              profile.platform === ProfilePlatform.WEBSITE),
        ).length,
        confirmedPlatforms: business.profiles
          .filter(
            (profile) =>
              profile.status === BusinessProfileStatus.CONFIRMED &&
              (!focusedWebsiteSeoReport ||
                profile.platform === ProfilePlatform.WEBSITE),
          )
          .map((profile) => platformLabel(profile.platform)),
        counts: businessProfileCounts,
        userConfirmedSocialProfiles: focusedWebsiteSeoReport
          ? 0
          : normalizedFacts.profiles.userConfirmedSocialProfiles,
        publiclyDetectedSocialProfiles: focusedWebsiteSeoReport
          ? 0
          : normalizedFacts.profiles.publiclyDetectedSocialProfiles,
        additionalDetectedPlatforms: focusedWebsiteSeoReport
          ? []
          : normalizedFacts.profiles.additionalDetectedPlatforms,
        pendingSocialProfiles: focusedWebsiteSeoReport
          ? 0
          : normalizedFacts.profiles.pendingSocialProfiles,
        profileContentAnalyzed: focusedWebsiteSeoReport
          ? 0
          : normalizedFacts.profiles.profileContentAnalyzed,
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
      status: focusedWebsiteSeoReport ? "not_configured" : competitorStatus,
      score:
        !focusedWebsiteSeoReport &&
        (competitorStatus === "current" || competitorStatus === "partial")
          ? categoryScore(audit.scores, ScoreCategory.COMPETITORS)
          : null,
      label: focusedWebsiteSeoReport
        ? "Not part of this report"
        : competitorStatusLabel(competitorStatus),
      activeCount: focusedWebsiteSeoReport ? 0 : business.competitors.length,
      confirmedProfilesCount: focusedWebsiteSeoReport
        ? 0
        : business.competitors.reduce(
            (total, competitor) =>
              total +
              competitor.discoveredProfiles.filter(
                (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
              ).length,
            0,
          ),
      profileCounts: competitorProfileCounts.totals,
      profilesByCompetitor: competitorProfileCounts.competitors,
      names: focusedWebsiteSeoReport
        ? []
        : business.competitors.map((competitor) => competitor.name),
      intelligence: focusedWebsiteSeoReport ? null : competitorIntelligence,
      comparison: focusedWebsiteSeoReport ? null : currentComparison,
      methodologyNote: focusedWebsiteSeoReport
        ? "Competitive Intelligence is disabled for the Website & SEO launch product."
        : "Competitive Position reflects comparable public website, SEO, confirmed profile-coverage, review, and messaging signals. Missing data is not scored as a loss.",
      snapshotDate: focusedWebsiteSeoReport ? null : snapshotDate,
      businessAuditDate: audit.createdAt,
      freshness: focusedWebsiteSeoReport
        ? unavailableModuleFreshness(
            audit.id,
            "Competitive Intelligence is not part of this report.",
          )
        : competitorFreshness,
    },
    findings: groupFindings(allFindings),
    recommendations: recommendationSet,
    nextMoves,
    progress: {
      comparison,
      previousScore: previousAudit?.overallScore ?? null,
      currentScore: overallScore,
      note: "Audit scores change only when new analysis detects different evidence or the scoring or data coverage changes. Marking an Action Plan task complete does not directly change audit scores.",
    },
    freshness: {
      businessContext: hasBusinessContext(business)
        ? contextNormalization.needsReview
          ? "PARTIAL"
          : "CURRENT"
        : "UNAVAILABLE",
      socialStrategy: socialStrategy.freshness.status,
      competitorComparison: focusedWebsiteSeoReport
        ? "UNAVAILABLE"
        : competitorFreshness.status,
      reviews: focusedWebsiteSeoReport ? "UNAVAILABLE" : "CURRENT",
    },
    confidence: {
      pagesScanned: normalizedFacts.coverage.crawl.successfulPages,
      crawlLimit: normalizedFacts.coverage.crawl.crawlLimit,
      crawlStatus: normalizedFacts.coverage.crawl.explanation,
      importantPagesIncluded: websiteCrawl?.importantPagesFound ?? [],
      googleBusinessStatus: focusedWebsiteSeoReport
        ? "Not assessed"
        : reviews.googleBusinessStatus,
      businessContextStatus: !hasBusinessContext(business)
        ? "Not generated"
        : contextNormalization.needsReview
          ? "Confirmed, but current evidence suggests review"
          : business.contextConfirmedAt
            ? "Confirmed"
            : "Generated and awaiting confirmation",
      socialStrategyStatus: focusedWebsiteSeoReport
        ? "Not part of this report"
        : `${socialStrategy.freshness.status} - ${socialStrategy.sourceLabel}`,
      competitorComparisonStatus: focusedWebsiteSeoReport
        ? "Not part of this report"
        : competitorStatusLabel(competitorStatus),
      limitations: uniqueStrings([
        ...assessment.limitations,
        ...(!focusedWebsiteSeoReport
          ? [
              ...(currentComparison?.limitations ?? []),
              "Individual social posts, engagement, posting frequency, reach, impressions, and content performance were not analyzed.",
              "Competitor positioning is inferred from publicly observable messaging and is not private market or revenue data.",
            ]
          : [
              "The Website Growth Score covers Website and SEO evidence only.",
              "Pages outside the saved crawl coverage were not treated as verified issues.",
            ]),
      ]),
    },
    scoringMetadata,
    evidenceIntegrity,
    normalizedFacts,
    coverage: normalizedFacts.coverage,
    aiAnalysis,
    dataNotes: focusedWebsiteSeoReport
      ? []
      : evidenceIntegrity.dataConflicts.map(
          (conflict) => `${conflict.explanation} ${conflict.action}`,
        ),
    technicalAppendix: {
      detectedActionLinks:
        website?.actionSummary?.detectedActionLinks?.map(
          (action) => `${action.label} (${action.actionType})`,
        ) ??
        website?.actionSummary?.rawCandidates ??
        website?.ctaCandidates ??
        [],
      pagesWithNoDetectedActionLinks: websiteCrawl?.pagesWithNoCTA ?? null,
      pagesWithDetectedActionLinks: websiteCrawl
        ? (websiteCrawl.pagesWithDetectedActionLinks ??
          websiteCrawl.pageResults.filter(
            (page) =>
              page.actionSummary?.hasDetectedActionLinks ??
              (page.actionSummary?.primaryActions?.length ?? 0) > 0,
          ).length)
        : website
          ? (website.actionSummary?.hasDetectedActionLinks ??
            (website.actionSummary?.primaryActions?.length ?? 0) > 0)
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
      duplicateUrlVariantsSkipped: websiteCrawl?.duplicateUrlsSkipped ?? null,
      pageResults: websiteCrawl?.pageResults ?? [],
      pageSelection: selectReportCrawlPages(websiteCrawl?.pageResults ?? []),
      findings: allFindings,
    },
  };

  if (!attachCanonicalReport) return baseReport;
  if (recoverLegacySelectiveAiEvidence) {
    return materializeCanonicalReport(
      buildCanonicalAuditReport(baseReport, {
        strict: true,
        reportVersion: CANONICAL_AUDIT_REPORT_VERSION,
        generatedAt: audit.completedAt ?? audit.createdAt,
      }),
      audit.recommendations.map((recommendation) => ({
        id: recommendation.id,
        status: recommendation.status,
      })),
    );
  }
  return attachCompatibilityCanonicalReport(baseReport);
}

function focusedRecommendationSet(
  recommendations: AuditReportViewModel["recommendations"],
): AuditReportViewModel["recommendations"] {
  const all = recommendations.all.filter((recommendation) =>
    isWebsiteSeoCategory(recommendation.category),
  );

  return {
    primary: all
      .filter(
        (recommendation) =>
          recommendation.status !== RecommendationStatus.COMPLETED &&
          recommendation.status !== RecommendationStatus.DISMISSED,
      )
      .slice(0, 3),
    technical: all
      .filter((recommendation) => recommendation.technical)
      .slice(0, 5),
    all,
    completed: all.filter(
      (recommendation) =>
        recommendation.status === RecommendationStatus.COMPLETED,
    ).length,
    total: all.length,
  };
}

function buildWebsiteSeoExecutiveSummary({
  businessName,
  overallScore,
  scores,
  nextMoves,
}: {
  businessName: string;
  overallScore: number;
  scores: ReportScoreItem[];
  nextMoves: ReportNextMove[];
}) {
  const scoredCategories = scores
    .filter(
      (score) =>
        score.category !== ScoreCategory.OVERALL &&
        score.status === "scored" &&
        score.score !== null,
    )
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0));
  const weakest = scoredCategories.at(0);
  const nextAction = nextMoves.at(0);

  return cleanReportCopy(
    `${businessName}'s Website Growth Score is ${overallScore}/100, based on the website and SEO evidence captured in this audit.${
      weakest
        ? ` ${weakest.label} is the clearest area for improvement at ${weakest.score}/100.`
        : ""
    }${
      nextAction
        ? ` Start with: ${nextAction.title}.`
        : " Review the evidence and coverage notes before choosing the next change."
    }`,
  );
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
  const snapshotStrategy = getSnapshotRecord(
    auditSnapshot,
    "reportSocialStrategy",
  );
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
    storedGeneratorVersion: stringFromUnknown(
      snapshotStrategy?.generatorVersion,
    ),
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
    sourceUrl: string | null;
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
  const pendingBusinessProfiles = social.pendingProfilesCount;
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
        sourceUrl: matching?.sourceUrl ?? null,
        evidence: canonical,
      };
    });
  const aiAuditRecommendations = auditRecommendations.filter(
    (recommendation) =>
      recommendation.sourceType === "ai_reviewed_opportunity" &&
      !canonicalAuditRecommendations.some(
        (canonical) => canonical.id === recommendation.id,
      ),
  );
  const normalized = [
    ...canonicalAuditRecommendations,
    ...aiAuditRecommendations,
  ]
    .map((recommendation) => {
      let description = recommendation.description;
      let title = recommendation.title;
      const text = `${title} ${description}`;

      if (
        /content cadence|posting frequency|engagement|top-performing content/i.test(
          text,
        )
      ) {
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
  const compatible = filterBusinessCompatibleContent({
    items: normalized,
    context,
    sourceEvidence,
    diagnosticLabel: `pdf:${business.id}`,
  });

  const deduped: ReportRecommendation[] = dedupeRecommendations(compatible).map(
    (recommendation) => {
      const canonicalEvidence = readCanonicalRecommendationEvidence(
        recommendation.evidence,
      );
      const aiEvidence = readAiReviewedOpportunityEvidence(
        recommendation.evidence,
      );
      const relatedFinding = auditFindings.find(
        (finding) =>
          finding.id ===
          (canonicalEvidence?.sourceFindingId ??
            recommendation.sourceReferenceId),
      );
      const technical =
        recommendation.sourceType === "ai_reviewed_opportunity"
          ? false
          : isTechnicalRecommendation(recommendation);
      const evidenceSummary =
        aiEvidence?.excerpt ??
        canonicalEvidence?.reportEvidence ??
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
        businessRelevance: businessRelevance(recommendation.category, context),
        confidence: aiEvidence
          ? evidenceConfidenceLabel(aiEvidence.confidence)
          : canonicalEvidence
            ? evidenceConfidenceLabel(canonicalEvidence.evidenceConfidence)
            : relatedFinding || recommendation.sourceType
              ? ("High" as const)
              : ("Medium" as const),
        freshness:
          recommendation.sourceType === "current_live_state"
            ? ("Current live state" as const)
            : canonicalEvidence || relatedFinding
              ? ("Current audit" as const)
              : ("General best practice" as const),
        technical,
        sourceLabel: canonicalEvidence?.findingType
          ? findingTypeLabels[canonicalEvidence.findingType]
          : recommendation.sourceType === "ai_reviewed_opportunity"
            ? ("AI-reviewed opportunity" as const)
            : technical
              ? ("Verified technical issue" as const)
              : undefined,
        sourceUrl:
          canonicalEvidence?.affectedUrls?.at(0) ??
          recommendation.sourceUrl ??
          aiEvidence?.sourceUrl ??
          null,
        issueKey: canonicalEvidence?.issueKey ??
          recommendationIssueKey(recommendation),
        rootCauseKey: canonicalEvidence?.rootCauseKey ?? null,
        affectedUrls: canonicalEvidence?.affectedUrls ??
          (recommendation.sourceUrl ? [recommendation.sourceUrl] : []),
        evidenceIds: canonicalEvidence?.sourceEvidenceIds ?? [],
        completionCriteria: null,
        verificationMethod: null,
        suggestedSpecialistCategory: null,
        canonicalEvidence,
      };
    },
  );
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
  social,
  recommendations,
}: {
  assessment: AuditAssessment;
  social: SocialAnalysis;
  recommendations: ReportRecommendation[];
}) {
  const moves = recommendations
    .slice(0, 3)
    .map<ReportNextMove>((recommendation) => ({
      title: recommendation.title,
      whyItMatters: recommendation.businessRelevance,
      expectedOutcome: expectedOutcomeForCategory(recommendation.category),
      evidence: recommendation.evidenceSummary,
      implementationAction: recommendation.description,
      category: recommendation.category,
      effort: recommendation.estimatedEffort,
      impact: recommendation.expectedImpact,
    }));

  if (moves.length === 0 && !assessment.hasWebsite) {
    moves.push({
      title: "Make every confirmed profile explain the offer clearly",
      whyItMatters:
        "A social-first visitor should understand who the business serves, what it offers, and what to do next without needing a website.",
      expectedOutcome:
        "A clearer profile path for direct messages, bookings, calls, email, subscriptions, or saved conversion links.",
      evidence: `${social.confirmedProfilesCount} confirmed social profile${social.confirmedProfilesCount === 1 ? "" : "s"}; detected conversion paths: ${social.detectedConversionPaths.join(", ") || "none saved"}.`,
      implementationAction:
        "Rewrite each confirmed profile bio around the audience, main offer, proof, and one primary action.",
      category: ScoreCategory.SOCIAL,
      effort: "Low",
      impact: "High",
    });
  }

  return moves.slice(0, 3);
}

function buildExecutiveSummary({
  businessName,
  overallScore,
  scores,
  reviews,
  currentComparison,
  nextMoves,
  normalizedFacts,
}: {
  businessName: string;
  overallScore: number;
  scores: ReportScoreItem[];
  reviews: ReviewAnalysis;
  currentComparison: CompetitorComparisonResult | null;
  nextMoves: ReportNextMove[];
  normalizedFacts: NormalizedAuditFacts;
}) {
  const scored = scores.filter(
    (item): item is ReportScoreItem & { score: number } =>
      typeof item.score === "number" && item.status === "scored",
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
    `${businessName}'s measured overall growth score is ${overallScore}/100.`,
    strongest.length
      ? `The strongest fully scored areas are ${joinNaturally(strongest)}.`
      : null,
    reviews.googleBusinessStatus === "confirmed"
      ? reviews.dataRequirementsMet
        ? `${googleListingSummary(reviews)} provides measured local review evidence.`
        : "A Google Business listing is confirmed, but rating and review-count data were unavailable, so the review result is limited to listing presence."
      : null,
    normalizedFacts.homepage
      ? `${normalizedFacts.coverage.technical.pagesAnalyzed} website page${normalizedFacts.coverage.technical.pagesAnalyzed === 1 ? " was" : "s were"} checked technically; the homepage H1 count is ${normalizedFacts.homepage.h1.count}, and its meta-description length is ${normalizedFacts.homepage.metaDescription.length}.`
      : "Website and SEO were not scored because no confirmed website was provided.",
    currentComparison?.competitorAdvantages.at(0)
      ? `The current public competitor benchmark identifies this response: ${currentComparison.opportunities.at(0)?.title ?? currentComparison.competitorAdvantages[0].title}.`
      : null,
    weakest.length
      ? `The clearest attention areas are ${joinNaturally(weakest)}.`
      : null,
    nextMoves.at(0) ? `Start with: ${nextMoves[0].title}.` : null,
    normalizedFacts.profiles.profileContentAnalyzed === 0
      ? "Social profile presence was assessed, but individual posts, engagement, posting frequency, and content performance were not analyzed."
      : null,
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
  evidenceIntegrity,
}: {
  auditFindings: Array<{
    id: string;
    title: string;
    description: string;
    category: ScoreCategory;
    severity: FindingSeverity;
    evidence: unknown;
    sourceUrl: string | null;
  }>;
  reviews: ReviewAnalysis;
  social: SocialAnalysis;
  currentComparison: CompetitorComparisonResult | null;
  sourceEvidence: string;
  context: ReportBusinessContext;
  evidenceIntegrity: AuditEvidenceIntegritySnapshot;
}) {
  const hasCurrentComparison =
    (currentComparison?.analyzedCompetitorCount ?? 0) > 0;
  const filtered = auditFindings.filter((finding) => {
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
  }).map<ReportFinding>((finding) => {
    const aiEvidence = readAiReviewedOpportunityEvidence(finding.evidence);
    const validation = readFindingValidationMetadata(finding.evidence);
    const evidenceHints = findingEvidenceHints({
      finding,
      evidenceIntegrity,
    });
    const findingType = classifyAuditFindingType({
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      evidence: finding.evidence,
      sourceType: aiEvidence ? "ai_reviewed_opportunity" : null,
    });
    return {
      id: finding.id,
      title: normalizeFindingTitle(finding.title),
      description: normalizeFindingDescription(
        validation?.plainLanguage.whatThisMeans ?? finding.description,
      ),
      category: finding.category,
      severity: finding.severity,
      findingType,
      source: aiEvidence ? "ai_reviewed_opportunity" : "selected_audit",
      sourceLabel: findingTypeLabels[findingType],
      sourceUrl: finding.sourceUrl ?? aiEvidence?.sourceUrl ?? null,
      evidenceSummary: aiEvidence?.excerpt ?? finding.description,
      confidence: validation
        ? validation.confidence >= 0.85
          ? "High"
          : validation.confidence >= 0.65
            ? "Medium"
            : "Low"
        : aiEvidence
        ? evidenceConfidenceLabel(aiEvidence.confidence)
        : evidenceHints.confidence,
      whyItMatters:
        validation?.plainLanguage.whyItMatters ??
        aiEvidence?.businessImpact ??
        null,
      suggestedAction:
        validation?.plainLanguage.whatToDo ??
        aiEvidence?.suggestedAction ??
        null,
      ownerFixability:
        validation?.plainLanguage.ownerFixabilityLabel ?? null,
      whoCanHelp: validation?.plainLanguage.whoCanHelpLabel ?? null,
      howOnreadWillCheck:
        validation?.plainLanguage.howOnreadWillCheck ?? null,
      materiality: validation?.materiality ?? null,
      validationState: validation?.state ?? null,
      supportingEvidenceIds:
        validation?.supportingEvidenceIds?.length
          ? validation.supportingEvidenceIds
          : evidenceHints.evidenceIds,
      issueKey: evidenceHints.issueKey,
      stableKey:
        validation?.stableFindingKey ??
        stableFindingKeyFromEvidence(finding.evidence) ??
        finding.id,
      rootCauseKey:
        validation?.rootCauseKey ?? evidenceHints.rootCauseKey,
      affectedUrls:
        validation?.affectedUrls?.length
          ? validation.affectedUrls
          : evidenceHints.affectedUrls,
      completionCriteria:
        validation?.targetedVerification.requiredOutcome ?? null,
      verificationMethod:
        validation?.specialistReadiness.verificationMethod ??
        validation?.plainLanguage.howOnreadWillCheck ??
        null,
      suggestedSpecialistCategory:
        validation?.specialistReadiness.suggestedSpecialist ?? null,
    };
  });

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
      findingType: "VERIFIED_STRENGTH",
      source: "selected_audit",
      sourceLabel: "Verified strength",
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
      findingType: "OBSERVATION",
      source: "current_comparison",
      sourceLabel: "Observation",
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
      findingType: "LIMITATION",
      source: "selected_audit",
      sourceLabel: "Limitation",
    });
  }

  return dedupeFindings(compatible);
}

function findingEvidenceHints({
  finding,
  evidenceIntegrity,
}: {
  finding: {
    title: string;
    description: string;
    category: ScoreCategory;
    sourceUrl: string | null;
    evidence: unknown;
  };
  evidenceIntegrity: AuditEvidenceIntegritySnapshot;
}) {
  const stored = isRecord(finding.evidence) ? finding.evidence : {};
  const text = `${finding.title} ${finding.description}`.toLowerCase();
  const storedFindingType = stringFromUnknown(stored.findingType);
  let issueKey = stringFromUnknown(stored.issueKey);

  if (!issueKey && storedFindingType === "VERIFIED_STRENGTH" && stored.h1Count === 1) {
    issueKey = "homepage:h1:present";
  } else if (!issueKey && typeof stored.pagesScanned === "number") {
    issueKey = "website:coverage:pages-scanned";
  } else if (!issueKey && /indexability checks/.test(text)) {
    issueKey = "seo:indexability:coverage";
  } else if (
    !issueKey &&
    /homepage seo signals|seo metadata needs improvement/.test(text)
  ) {
    issueKey = "seo:aggregate:coverage";
  } else if (!issueKey && typeof stored.pagesWithNoCTA === "number") {
    issueKey = "website:action-link:coverage";
  } else if (!issueKey && /visitor actions?.*clearer|primary cta/.test(text)) {
    issueKey = "homepage:primary-cta:unclear";
  } else if (!issueKey && /contact/.test(text)) {
    issueKey = "website:contact-path:missing";
  }

  const issueRoot = issueKey
    ? canonicalRecommendationRootCauseKey({
        title: finding.title,
        description: finding.description,
        category: finding.category,
        evidence: null,
        issueKey,
      })
    : null;
  const evidenceTypes = inferredFindingEvidenceTypes(stored, text);
  const affectedUrls = findingAffectedUrls(stored, finding.sourceUrl);
  const rootCandidates = evidenceIntegrity.evidence.filter((evidence) => {
    const sharesRoot =
      issueRoot !== null &&
      evidence.issueKeys.some(
        (candidateIssueKey) =>
          canonicalRecommendationRootCauseKey({
            title: "",
            description: "",
            category: evidence.category,
            evidence: null,
            issueKey: candidateIssueKey,
          }) === issueRoot,
      );
    return sharesRoot;
  });
  const typeCandidates = evidenceIntegrity.evidence.filter((evidence) =>
    evidenceTypes.has(evidence.type),
  );
  const candidates = scopeFindingEvidenceToAffectedPages(
    rootCandidates.length > 0 ? rootCandidates : typeCandidates,
    affectedUrls,
  );
  const evidenceIds = uniqueStrings(candidates.map((item) => item.id));

  return {
    issueKey,
    rootCauseKey: issueRoot,
    evidenceIds,
    affectedUrls,
    confidence: evidenceConfidenceFromRecords(candidates),
  };
}

function inferredFindingEvidenceTypes(
  stored: Record<string, unknown>,
  text: string,
) {
  const types = new Set<AuditEvidenceRecord["type"]>();
  if (typeof stored.h1Count === "number" || /\bh1\b|main headline/.test(text)) {
    types.add("H1_COUNT");
  }
  if (typeof stored.pagesScanned === "number") {
    types.add("PAGE_FETCH_QUALITY");
  }
  if (
    Array.isArray(stored.pages) ||
    /thin|little unique content|nearly empty/.test(text)
  ) {
    types.add("CONTENT_DEPTH");
  }
  if (/duplicate content|near-duplicate/.test(text)) {
    types.add("DUPLICATE_CONTENT");
  }
  if (/copy error|spelling|grammar|placeholder copy/.test(text)) {
    types.add("COPY_QUALITY");
  }
  if (/order inquiry|ordering process|conversion friction/.test(text)) {
    types.add("CONVERSION_FRICTION");
  }
  if (
    typeof stored.pagesWithNoCTA === "number" ||
    /customer action|visitor action|primary cta/.test(text)
  ) {
    types.add("ACTION_LINK_DETECTED");
    types.add("PRIMARY_CTA_ASSESSED");
  }
  if (/contact/.test(text)) types.add("CONTACT_SIGNAL");
  if (
    typeof stored.titleLength === "number" ||
    /page title|title tag/.test(text)
  ) {
    types.add("PAGE_TITLE_LENGTH");
  }
  if (
    typeof stored.metaDescriptionLength === "number" ||
    /meta description|meta summary|\bmetadata\b/.test(text)
  ) {
    types.add("META_DESCRIPTION_LENGTH");
  }
  if ("canonicalStatus" in stored || /canonical tag/.test(text)) {
    types.add("CANONICAL_STATUS");
  }
  if ("viewportStatus" in stored || /viewport/.test(text)) {
    types.add("VIEWPORT_STATUS");
  }
  if ("robotsTxtStatus" in stored || /robots\.txt/.test(text)) {
    types.add("ROBOTS_TXT_STATUS");
  }
  if ("sitemapStatus" in stored || /sitemap\.xml/.test(text)) {
    types.add("SITEMAP_STATUS");
  }
  if (/alt text/.test(text)) types.add("IMAGE_ALT_COVERAGE");
  if (stored.findingType === "AI_REVIEWED_OPPORTUNITY") {
    types.add("AI_REVIEWED_PAGE_OPPORTUNITY");
  }
  return types;
}

function findingAffectedUrls(
  stored: Record<string, unknown>,
  sourceUrl: string | null,
) {
  const fromValue = (value: unknown): string[] => {
    if (typeof value === "string") {
      return /^https?:\/\//i.test(value) ? [value] : [];
    }
    if (Array.isArray(value)) return value.flatMap(fromValue);
    if (!isRecord(value)) return [];
    return [value.url, value.sourceUrl, value.normalizedUrl]
      .flatMap(fromValue)
      .concat(
        [value.affectedPages, value.affectedUrls, value.pages].flatMap(
          fromValue,
        ),
      );
  };

  return uniqueStrings([
    ...fromValue(stored.affectedPages),
    ...fromValue(stored.affectedUrls),
    ...fromValue(stored.pages),
    ...fromValue(stored.evidence),
    ...fromValue(stored.normalizedUrl),
    ...(sourceUrl ? [sourceUrl] : []),
  ]);
}

function evidenceConfidenceFromRecords(records: AuditEvidenceRecord[]) {
  if (records.length === 0) return "Low" as const;
  if (records.some((item) => item.confidence === "LOW")) return "Low" as const;
  if (records.some((item) => item.confidence === "MEDIUM")) {
    return "Medium" as const;
  }
  return "High" as const;
}

function groupFindings(findings: ReportFinding[]) {
  const strengths = findings.filter(
    (finding) => reportFindingType(finding) === "VERIFIED_STRENGTH",
  );
  const warnings = findings.filter(
    (finding) =>
      reportFindingType(finding) === "VERIFIED_TECHNICAL_ISSUE" ||
      reportFindingType(finding) === "LIMITATION",
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
  normalizedFacts,
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
  normalizedFacts: NormalizedAuditFacts;
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
    const categoryEvidence =
      normalizedFacts.scoreEvidence.categories?.[category];
    const evidenceDetails = categoryEvidence
      ? {
          confidence: evidenceConfidenceLabel(categoryEvidence.confidence),
          evidenceCompleteness: categoryEvidence.evidenceCompleteness,
          dataRequirementsMet: categoryEvidence.dataRequirementsMet,
          missingInputs: categoryEvidence.missingInputs,
        }
      : {};

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
        note: "Adding and confirming a website later will unlock website and SEO analysis.",
        ...evidenceDetails,
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
        ...evidenceDetails,
      };
    }

    if (category === ScoreCategory.SOCIAL) {
      return {
        category,
        label: "Social profile coverage",
        score: normalizedFacts.scoreEvidence.social.score,
        status: "partial",
        note: "This score measures confirmed platform coverage only. Posts, activity, engagement, and performance were not analyzed.",
        confidence: evidenceConfidenceLabel(
          normalizedFacts.scoreEvidence.social.confidence,
        ),
        evidenceCompleteness: social.evidenceCompleteness,
        dataRequirementsMet: social.dataRequirementsMet,
        missingInputs: [
          "Profile content",
          "Posting activity",
          "Engagement and performance",
        ],
      };
    }

    if (category === ScoreCategory.REVIEWS) {
      return {
        category,
        label:
          normalizedFacts.scoreEvidence.reviews.scope === "LISTING_PRESENCE"
            ? "Reviews / listing presence"
            : "Reviews",
        score: normalizedFacts.scoreEvidence.reviews.score,
        status: normalizedFacts.scoreEvidence.reviews.dataRequirementsMet
          ? "scored"
          : "partial",
        note: reviews.reviewScoreExplanation,
        confidence: evidenceConfidenceLabel(
          normalizedFacts.scoreEvidence.reviews.confidence,
        ),
        evidenceCompleteness:
          normalizedFacts.scoreEvidence.reviews.evidenceCompleteness,
        dataRequirementsMet:
          normalizedFacts.scoreEvidence.reviews.dataRequirementsMet,
        missingInputs: normalizedFacts.scoreEvidence.reviews.missingInputs,
      };
    }

    return {
      category,
      label: categoryLabel(category),
      score: categoryScore(auditScores, category),
      status: "scored",
      ...evidenceDetails,
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
      stringFromUnknown(saved?.scoringEngineVersion) ?? "legacy-growth-score",
    reportViewModelVersion:
      stringFromUnknown(saved?.reportViewModelVersion) ??
      LEGACY_REPORT_VIEW_MODEL_VERSION,
    analyzerVersions: {
      website:
        stringFromUnknown(savedAnalyzers.website) ?? WEBSITE_ANALYZER_VERSION,
      seo: stringFromUnknown(savedAnalyzers.seo) ?? SEO_ANALYZER_VERSION,
      social: stringFromUnknown(savedAnalyzers.social) ?? "social-analyzer-v2",
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
  if (
    comparison.staleCompetitorCount > 0 ||
    comparison.failedCompetitorCount > 0
  ) {
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

  return (
    validateBusinessCompatibleContent({
      item: { title: "Social Strategy", description: content },
      context,
      sourceEvidence,
    }).compatible &&
    !/adding competitor data|absence of a google business|google business profile.{0,40}(missing|unconfirmed)/i.test(
      content,
    )
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

function dedupeRecommendations<
  T extends { title: string; description: string },
>(items: T[]) {
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

function normalizeSocialAnalysisForDisplay(
  social: SocialAnalysis,
): SocialAnalysis {
  return {
    ...social,
    scoreScope: social.scoreScope ?? "PROFILE_COVERAGE",
    scoreConfidence:
      social.scoreConfidence ??
      (social.confirmedProfilesCount > 0 && social.pendingProfilesCount === 0
        ? "MEDIUM"
        : "LOW"),
    scoreStatus: social.scoreStatus ?? "COVERAGE_ONLY",
    evidenceCompleteness:
      social.evidenceCompleteness ??
      Math.round(
        (social.confirmedProfilesCount /
          Math.max(
            1,
            social.confirmedProfilesCount + social.pendingProfilesCount,
          )) *
          70,
      ),
    dataRequirementsMet:
      social.dataRequirementsMet ?? social.confirmedProfilesCount > 0,
    contentAnalyzedProfilesCount: social.contentAnalyzedProfilesCount ?? 0,
    performanceStatus: social.performanceStatus ?? "NOT_ANALYZED",
  };
}

function reportFindingType(finding: ReportFinding): AuditFindingType {
  if (finding.findingType) return finding.findingType;
  const stored = Object.entries(findingTypeLabels).find(
    ([, label]) => label === finding.sourceLabel,
  )?.[0] as AuditFindingType | undefined;
  return (
    stored ??
    classifyAuditFindingType({
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      sourceType:
        finding.source === "ai_reviewed_opportunity"
          ? "ai_reviewed_opportunity"
          : null,
    })
  );
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

function stableFindingKeyFromEvidence(value: unknown) {
  if (!isRecord(value)) return null;
  return stringFromUnknown(value.stableFindingKey);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

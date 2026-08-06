import {
  BusinessGoal,
  BusinessProfileStatus,
  ChatRole,
  FindingSeverity,
  ProfilePlatform,
  RecommendationPriority,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";

import {
  normalizeReviewAnalysisForDisplay,
  type ReviewAnalysis,
} from "@/lib/analyzers/review-analyzer";
import {
  classifyWebsiteActions,
  getPrimaryCtaAssessment,
} from "@/lib/analyzers/action-classifier";
import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import type { SocialAnalysis } from "@/lib/analyzers/social-analyzer";
import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import {
  categoryLabel,
  formatDelta,
  type AuditComparison,
} from "@/lib/audits/audit-comparison";
import { getAuditAssessment } from "@/lib/audits/audit-applicability";
import { readEvidenceIntegrity } from "@/lib/audits/evidence-contracts";
import { completeEvidenceSummary } from "@/lib/audits/finding-copy";
import { readFindingValidationMetadata } from "@/lib/audits/quality/candidate-pipeline";
import { readNormalizedAuditFacts } from "@/lib/audits/normalized-audit-facts";
import {
  readAiReviewedOpportunityEvidence,
  readSelectiveAiAuditSnapshot,
  type SelectiveAiAuditSnapshot,
} from "@/lib/audits/selective-ai/types";
import { businessGoalLabels, websiteSeoBusinessGoals } from "@/lib/goals";
import { isWebsiteSeoLaunchScope } from "@/lib/features/feature-flags";
import { prisma } from "@/lib/prisma";
import { aggregateProfileCounts } from "@/lib/profiles/profile-counts";
import {
  buildCurrentReviewAnalysis,
  getReviewFreshnessSummary,
} from "@/lib/reviews/current-review-analysis";
import {
  compactCompetitorConsultantContext,
  type CompetitorConsultantContext,
} from "@/lib/ai/competitor-consultant-context";
import { getAuditCompetitorIntelligence } from "@/lib/competitors/competitor-types";
import type { SocialStrategyData } from "@/lib/social-strategy";
import {
  isWebsiteGrowthAuditSnapshot,
  isWebsiteSeoCategory,
  isWebsiteSeoReportCategory,
  WEBSITE_GROWTH_SCORE_LABEL,
} from "@/lib/product/website-seo-scope";

type ConsultantContextBusiness = {
  id?: string;
  name: string;
  initialInput: string;
  goals: BusinessGoal[];
  primaryGoal: BusinessGoal | null;
  description?: string | null;
  targetAudience?: string | null;
  mainOffer?: string | null;
  industry?: string | null;
  businessType?: string | null;
  primaryConversionGoal?: string | null;
  brandTone?: string | null;
  contextConfidence?: number | null;
  contextSource?: string | null;
  contextConfirmedAt?: Date | null;
};

type ConsultantContextAudit = {
  overallScore: number | null;
  summary: string | null;
  createdAt: Date;
  analysisSnapshot: unknown;
};

type ConsultantContextScore = {
  category: ScoreCategory;
  platform: ProfilePlatform | null;
  label: string | null;
  score: number;
};

type ConsultantContextFinding = {
  category: ScoreCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  sourceUrl?: string | null;
  evidence?: unknown;
};

type ConsultantContextRecommendation = {
  title: string;
  description: string;
  category: ScoreCategory;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  expectedImpact: string | null;
  estimatedEffort: string | null;
  impact: string | null;
  effort: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  evidence?: unknown;
};

type ConsultantContextProfile = {
  platform: ProfilePlatform;
  status: BusinessProfileStatus;
  url: string | null;
  handle: string | null;
};

type ConsultantContextGoogleBusinessProfile = {
  id?: string;
  googlePlaceId?: string | null;
  displayName: string | null;
  formattedAddress: string | null;
  phoneNumber: string | null;
  websiteUri: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  matchConfidence: number | null;
  status: string;
  source: string;
  confirmedAt?: Date | null;
  updatedAt?: Date | null;
  businessStatus?: string | null;
  primaryType?: string | null;
  types?: unknown;
  matchReasons?: unknown;
};

type ConsultantContextCompetitor = {
  name: string;
  websiteUrl: string | null;
  notes: string | null;
  discoveredProfiles: Array<{
    platform: ProfilePlatform;
    label: string;
    status: BusinessProfileStatus;
  }>;
};

type ConsultantContextChatMessage = {
  role: ChatRole;
  content: string;
};

export type BuildConsultantContextInput = {
  question: string;
  business: ConsultantContextBusiness;
  latestAudit: ConsultantContextAudit;
  scores: ConsultantContextScore[];
  findings: ConsultantContextFinding[];
  recommendations: ConsultantContextRecommendation[];
  profiles: ConsultantContextProfile[];
  googleBusinessProfiles?: ConsultantContextGoogleBusinessProfile[];
  reviewAnalysis?: ReviewAnalysis | null;
  competitors: ConsultantContextCompetitor[];
  auditComparison?: AuditComparison | null;
  recentChatHistory?: ConsultantContextChatMessage[];
  socialStrategy?: SocialStrategyData | null;
  competitorContext?: CompetitorConsultantContext | null;
};

const categoryLabels: Record<ScoreCategory, string> = {
  OVERALL: "Overall",
  WEBSITE: "Website",
  SOCIAL: "Social",
  SEO: "SEO",
  BRANDING: "Branding",
  REVIEWS: "Reviews",
  COMPETITORS: "Competitors",
};

const platformLabels: Record<ProfilePlatform, string> = {
  WEBSITE: "Website",
  GOOGLE_BUSINESS: "Google Business",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  LINKEDIN: "LinkedIn",
  X: "X",
  PINTEREST: "Pinterest",
  OTHER: "Other",
};

const priorityWeight: Record<RecommendationPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

const statusWeight: Record<RecommendationStatus, number> = {
  IN_PROGRESS: 0,
  TODO: 1,
  COMPLETED: 2,
  DISMISSED: 3,
};

export async function buildConsultantContext(
  input: BuildConsultantContextInput,
) {
  const assessment = getAuditAssessment(input.latestAudit.analysisSnapshot);
  const evidenceIntegrity = readEvidenceIntegrity(
    input.latestAudit.analysisSnapshot,
  );
  const selectiveAiAnalysis = readSelectiveAiAuditSnapshot(
    input.latestAudit.analysisSnapshot,
  );
  const normalizedFacts = readNormalizedAuditFacts(
    input.latestAudit.analysisSnapshot,
  );
  const relevantAiPageEvidence = selectRelevantAiPageEvidence(
    selectiveAiAnalysis,
    input.question,
  );
  const website = getWebsiteAnalysis(input.latestAudit.analysisSnapshot);
  const websiteCrawl = getWebsiteCrawl(input.latestAudit.analysisSnapshot);
  const seo = getSeoAnalysis(input.latestAudit.analysisSnapshot);
  const websiteActionSummary =
    website?.actionSummary ??
    classifyWebsiteActions({
      candidates: (website?.ctaCandidates ?? []).map((candidate) =>
        /^https?:\/\//i.test(candidate)
          ? { href: candidate, label: "" }
          : { label: candidate, href: "" },
      ),
      businessContext: {
        description: input.business.description,
        targetAudience: input.business.targetAudience,
        mainOffer: input.business.mainOffer,
        industry: input.business.industry,
        businessType: input.business.businessType,
        primaryConversionGoal: input.business.primaryConversionGoal,
      },
    });
  const homepagePrimaryCta = website
    ? getPrimaryCtaAssessment(websiteActionSummary)
    : null;
  if (
    isWebsiteSeoLaunchScope() ||
    isWebsiteGrowthAuditSnapshot(input.latestAudit.analysisSnapshot)
  ) {
    return buildWebsiteSeoConsultantContext({
      input,
      website,
      websiteCrawl,
      seo,
      homepagePrimaryCta,
      relevantAiPageEvidence,
    });
  }
  const reservationRelevant =
    /\b(reservation|reservations|reserve|book a table|table booking)\b/i.test(
      [
        input.business.description,
        input.business.targetAudience,
        input.business.mainOffer,
        input.business.industry,
        input.business.businessType,
        input.business.primaryConversionGoal,
      ]
        .filter(Boolean)
        .join(" "),
    );
  const social = getSocialAnalysis(input.latestAudit.analysisSnapshot);
  const snapshotReviews = getReviewAnalysis(input.latestAudit.analysisSnapshot);
  const googleBusinessProfiles = await getCurrentGoogleBusinessProfiles({
    businessId: input.business.id,
    fallback: input.googleBusinessProfiles ?? [],
  });
  const reviews =
    input.reviewAnalysis ??
    buildCurrentReviewAnalysis({
      businessProfiles: input.profiles,
      googleBusinessProfiles,
      competitors: input.competitors.map((competitor) => ({
        name: competitor.name,
        discoveredProfiles: competitor.discoveredProfiles.map((profile) => ({
          platform: profile.platform,
          status: profile.status,
          label: profile.label,
        })),
      })),
      goals: input.business.goals,
      primaryGoal: input.business.primaryGoal,
      businessContext: {
        description: input.business.description,
        targetAudience: input.business.targetAudience,
        mainOffer: input.business.mainOffer,
        industry: input.business.industry,
        businessType: input.business.businessType,
        primaryConversionGoal: input.business.primaryConversionGoal,
      },
      latestAuditSnapshot: input.latestAudit.analysisSnapshot,
    });
  const reviewFreshness = getReviewFreshnessSummary({
    latestAuditCreatedAt: input.latestAudit.createdAt,
    googleBusinessProfiles,
  });
  const reviewSnapshotConflict = snapshotReviews
    ? snapshotReviews.googleBusinessStatus !== reviews.googleBusinessStatus ||
      snapshotReviews.score !== reviews.score ||
      snapshotReviews.reviewPresenceLevel !== reviews.reviewPresenceLevel ||
      snapshotReviews.googleReviewCount !== reviews.googleReviewCount ||
      snapshotReviews.googleRating !== reviews.googleRating
    : false;
  const activeRecommendations = input.recommendations.filter(
    (recommendation) =>
      recommendation.status !== RecommendationStatus.DISMISSED,
  );
  const completedRecommendations = activeRecommendations.filter(
    (recommendation) =>
      recommendation.status === RecommendationStatus.COMPLETED,
  );
  const openRecommendations = activeRecommendations.filter(
    (recommendation) =>
      recommendation.status !== RecommendationStatus.COMPLETED,
  );
  const sortedRecommendations = [...openRecommendations].sort(
    (a, b) =>
      recommendationQuestionRelevance(b, input.question) -
        recommendationQuestionRelevance(a, input.question) ||
      statusWeight[a.status] - statusWeight[b.status] ||
      priorityWeight[a.priority] - priorityWeight[b.priority],
  );
  const topFindings = [...input.findings]
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .slice(0, 8);
  const confirmedProfiles = input.profiles.filter(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const pendingProfiles = input.profiles.filter(
    (profile) => profile.status === BusinessProfileStatus.PENDING,
  );
  const competitorSummary = input.competitors.slice(0, 6).map((competitor) => {
    const confirmed = competitor.discoveredProfiles.filter(
      (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
    );
    const counts = aggregateProfileCounts(competitor.discoveredProfiles);

    return [
      competitor.name,
      competitor.websiteUrl ? `website ${competitor.websiteUrl}` : null,
      `${counts.confirmedPublicProfiles} confirmed public profile(s), including ${counts.confirmedWebsiteProfiles} website profile(s)`,
      `${counts.confirmedSocialProfiles} confirmed social profile(s)`,
      `${counts.pendingSocialProfiles} pending social link(s)`,
      confirmed.length > 0
        ? `confirmed platforms: ${unique(
            confirmed.map((profile) => profile.label),
          ).join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");
  });
  const auditCompetitorIntelligence = getAuditCompetitorIntelligence(
    input.latestAudit.analysisSnapshot,
  );
  const currentCompetitorComparison =
    input.competitorContext !== undefined
      ? (input.competitorContext?.currentComparison ?? null)
      : (auditCompetitorIntelligence?.comparison ?? null);
  const history = (input.recentChatHistory ?? [])
    .slice(-8)
    .map(
      (message) =>
        `${message.role === ChatRole.USER ? "User" : "Assistant"}: ${truncate(
          message.content,
          450,
        )}`,
    );

  const context = {
    business: {
      name: input.business.name,
      originalInput: input.business.initialInput,
      businessContext: {
        description: input.business.description ?? "Not set",
        targetAudience: input.business.targetAudience ?? "Not set",
        mainOffer: input.business.mainOffer ?? "Not set",
        industry: input.business.industry ?? "Not set",
        businessType: input.business.businessType ?? "Not set",
        primaryConversionGoal:
          input.business.primaryConversionGoal ?? "Not set",
        brandTone: input.business.brandTone ?? "Not set",
        confidence:
          typeof input.business.contextConfidence === "number"
            ? `${input.business.contextConfidence}/100`
            : "Not scored",
        source: input.business.contextSource ?? "Not set",
        confirmed: input.business.contextConfirmedAt
          ? input.business.contextConfirmedAt.toISOString().slice(0, 10)
          : "Not confirmed",
        note:
          input.business.description || input.business.targetAudience
            ? "Treat Business Context as high-priority personalization input. If confidence is low or unconfirmed, mention that confirming it can improve recommendations."
            : "Business Context is missing. Avoid over-specific assumptions and recommend confirming the Context tab when advice depends on audience or offer.",
      },
      primaryGoal: input.business.primaryGoal
        ? businessGoalLabels[input.business.primaryGoal]
        : "Not selected",
      goals:
        input.business.goals.length > 0
          ? input.business.goals.map((goal) => businessGoalLabels[goal])
          : ["No goals selected"],
    },
    latestAudit: {
      date: input.latestAudit.createdAt.toISOString().slice(0, 10),
      overallScore:
        input.latestAudit.overallScore ??
        scoreFor(input.scores, ScoreCategory.OVERALL),
      summary: input.latestAudit.summary ?? "No written audit summary saved.",
      assessmentMode: assessment.mode,
      applicableCategories: assessment.applicableCategories.map(
        (category) => categoryLabels[category],
      ),
      unavailableCategories: assessment.unavailableCategories.map(
        (item) => `${categoryLabels[item.category]}: ${item.reason}`,
      ),
      dataUsed: assessment.dataUsed,
      limitations: assessment.limitations,
      scoreBreakdown: input.scores
        .filter((score) => !score.platform)
        .map((score) => {
          if (
            score.category === ScoreCategory.COMPETITORS &&
            !currentCompetitorComparison?.analyzedCompetitorCount
          ) {
            return `${categoryLabels[score.category]}: ${
              input.competitors.length > 0
                ? "Saved but not analyzed"
                : "Not configured"
            }`;
          }

          return `${categoryLabels[score.category]}: ${score.score}/100`;
        }),
      normalizedFacts: normalizedFacts
        ? {
            homepage: normalizedFacts.homepage,
            siteWide: {
              pagesMissingTitles: normalizedFacts.siteWide.pagesMissingTitles,
              pagesMissingMetaDescriptions:
                normalizedFacts.siteWide.pagesMissingMetaDescriptions,
              pagesMissingH1: normalizedFacts.siteWide.pagesMissingH1,
              pagesWithMultipleH1: normalizedFacts.siteWide.pagesWithMultipleH1,
              thinPages: normalizedFacts.siteWide.thinPages,
              duplicateContentGroups:
                normalizedFacts.siteWide.duplicateContentGroups,
              copyQualityFindings: normalizedFacts.siteWide.copyQualityFindings,
              orderingFrictionPages:
                normalizedFacts.siteWide.orderingFrictionPages,
            },
            profileCounts: normalizedFacts.profiles,
            scoreEvidence: normalizedFacts.scoreEvidence,
            coverage: normalizedFacts.coverage,
            businessModel: normalizedFacts.businessModel,
            rule: "These normalized audit-time facts take precedence over generated prose for objective claims.",
          }
        : "Legacy audit without normalized facts; use deterministic analyzer snapshots and disclose uncertainty.",
      evidenceIntegrity: evidenceIntegrity
        ? {
            contractVersion: evidenceIntegrity.contractVersion,
            validatedClaims: evidenceIntegrity.validatedClaims
              .filter((claim) => claim.valid)
              .map((claim) => claim.text),
            rejectedClaims: evidenceIntegrity.validatedClaims
              .filter((claim) => !claim.valid)
              .map((claim) => ({
                claim: claim.text,
                reason: claim.reasons.join(" "),
                safeFallback: claim.correctedClaim,
              })),
            canonicalRecommendations: evidenceIntegrity.canonicalRecommendations
              .slice(0, 8)
              .map((recommendation) => ({
                issueKey: recommendation.issueKey,
                title: recommendation.title,
                category: categoryLabels[recommendation.category],
                evidence: recommendation.reportEvidence,
                confidence: recommendation.evidenceConfidence,
              })),
            scoreComponents: evidenceIntegrity.scoreBreakdowns.map(
              (breakdown) => ({
                category: categoryLabels[breakdown.category],
                score: breakdown.score,
                applicable: breakdown.applicable,
                components: breakdown.components.map((component) => ({
                  label: component.label,
                  contribution: component.contribution,
                  explanation: component.explanation,
                })),
              }),
            ),
            dataConflicts: evidenceIntegrity.dataConflicts.map((conflict) => ({
              field: conflict.field,
              explanation: conflict.explanation,
              preferredSource: conflict.preferredSource,
              action: conflict.action,
            })),
            profileCounts: evidenceIntegrity.profileCounts,
            validationWarnings: evidenceIntegrity.validationWarnings.map(
              (warning) => `${warning.code}: ${warning.message}`,
            ),
          }
        : "Legacy audit: no saved evidence-integrity contract is available. Preserve uncertainty and use only explicit analyzer fields.",
      selectiveAiCoverage: selectiveAiAnalysis
        ? {
            status: selectiveAiAnalysis.status,
            pagesCheckedTechnically:
              selectiveAiAnalysis.coverage.pagesCheckedTechnically,
            keyPagesReviewedByAi:
              selectiveAiAnalysis.coverage.deepReviewedPages,
            additionalPagesCoveredDeterministically: Math.max(
              0,
              selectiveAiAnalysis.coverage.pagesCheckedTechnically -
                selectiveAiAnalysis.coverage.deepReviewedPages,
            ),
            failedAiPages: selectiveAiAnalysis.coverage.failedAiPages,
            limitations: selectiveAiAnalysis.coverage.limitations.slice(0, 5),
            interpretationRule:
              "Only selected key pages received AI review. All successfully crawled pages received deterministic checks. Never imply uniform AI review.",
          }
        : "This audit does not contain a selective AI coverage snapshot.",
      relevantAiPageEvidence,
    },
    actionProgress: {
      completed: completedRecommendations.length,
      total: activeRecommendations.length,
      inProgress: activeRecommendations.filter(
        (recommendation) =>
          recommendation.status === RecommendationStatus.IN_PROGRESS,
      ).length,
    },
    topFindings: topFindings.map(
      (finding) =>
        `${categoryLabels[finding.category]} | ${finding.severity}: ${
          finding.title
        } - ${completeEvidenceSummary(finding.description, 260)}`,
    ),
    topRecommendations: evidenceIntegrity
      ? [
          ...evidenceIntegrity.canonicalRecommendations
            .slice(0, 8)
            .map((recommendation) => {
              const tracked = input.recommendations.find(
                (item) => item.title === recommendation.title,
              );
              return `${recommendation.priority} | ${tracked?.status ?? "TODO"} | ${
                categoryLabels[recommendation.category]
              } | Effort ${recommendation.estimatedEffort} | Impact ${
                recommendation.expectedImpact
              }: ${recommendation.title} - ${recommendation.description} Evidence: ${recommendation.reportEvidence}`;
            }),
          ...sortedRecommendations
            .filter(
              (recommendation) =>
                recommendation.sourceType === "ai_reviewed_opportunity",
            )
            .slice(0, 4)
            .map((recommendation) => {
              const evidence = readAiReviewedOpportunityEvidence(
                recommendation.evidence,
              );
              return `${recommendation.priority} | ${recommendation.status} | ${
                categoryLabels[recommendation.category]
              } | AI-reviewed opportunity | Confidence ${
                evidence?.confidence ?? "LOW"
              }: ${recommendation.title} - ${completeEvidenceSummary(
                recommendation.description,
                220,
              )} Affected page: ${
                recommendation.sourceUrl ?? evidence?.sourceUrl ?? "not saved"
              }. Evidence: ${evidence?.excerpt ?? "No concise excerpt saved."}`;
            }),
        ].slice(0, 10)
      : sortedRecommendations
          .slice(0, 8)
          .map(
            (recommendation) =>
              `${recommendation.priority} | ${recommendation.status} | ${
                categoryLabels[recommendation.category]
              } | Effort ${displayEffort(recommendation)} | Impact ${displayImpact(
                recommendation,
              )}: ${recommendation.title} - ${completeEvidenceSummary(
                recommendation.description,
                260,
              )}`,
          ),
    completedRecommendations: completedRecommendations
      .slice(0, 6)
      .map((recommendation) => recommendation.title),
    profiles: {
      confirmed: formatProfiles(confirmedProfiles),
      pending: formatProfiles(pendingProfiles),
      explicitCounts: aggregateProfileCounts(input.profiles),
      terminology:
        "Public profiles include websites and social or review profiles. Social profile counts exclude websites. Pending links are not confirmed.",
    },
    website: website
      ? {
          url: website.normalizedUrl,
          score: website.score,
          title: website.pageTitle ?? "Missing",
          metaDescription: website.metaDescription ? "Present" : "Missing",
          h1Count: website.h1Count,
          h1Text: website.h1Text.slice(0, 3),
          detectedActionTypes:
            websiteActionSummary.detectedActionTypes ??
            websiteActionSummary.primaryActions,
          detectedActionLinkCount:
            websiteActionSummary.detectedActionLinkCount ??
            websiteActionSummary.rawCandidates.length,
          primaryCtaClarity: homepagePrimaryCta?.clarity ?? "NOT_ASSESSED",
          primaryCtaConfidence: homepagePrimaryCta?.confidence ?? "LOW",
          primaryCtaEvidence: homepagePrimaryCta?.evidence ?? [],
          ctaInterpretationRule:
            "Detected action links are not proof that one primary CTA is clear. Use the explicit clarity assessment only.",
          imagesMissingAlt: `${website.imagesMissingAltCount} of ${website.imageCount}`,
          contactLink: website.hasContactLink ? "Detected" : "Not detected",
          socialLinks: website.hasSocialLinks ? "Detected" : "Not detected",
        }
      : assessment.mode === "social_first"
        ? "Not provided. Website was excluded from this social-first audit and was not scored as a failure."
        : "No homepage website analysis snapshot.",
    websiteCrawl: websiteCrawl
      ? {
          pagesScanned: websiteCrawl.pagesScanned,
          crawlLimitUsed: websiteCrawl.crawlLimitUsed,
          crawlLimitReached: websiteCrawl.crawlLimitReached,
          successfulPages: websiteCrawl.successfulPages,
          averagePageScore: websiteCrawl.averagePageScore,
          duplicateUrlsSkipped: websiteCrawl.duplicateUrlsSkipped,
          missingTitles: websiteCrawl.pagesMissingTitle,
          missingMetaDescriptions: websiteCrawl.pagesMissingMetaDescription,
          pagesWithNoH1: websiteCrawl.pagesWithNoH1,
          pagesWithMultipleH1: websiteCrawl.pagesWithMultipleH1,
          pagesWithNoDetectedActionLinks: websiteCrawl.pagesWithNoCTA,
          pagesWithDetectedActionLinks:
            websiteCrawl.pagesWithDetectedActionLinks ??
            "Legacy snapshot unavailable",
          pagesWithCtaClarityAssessed:
            websiteCrawl.pagesWithAssessedPrimaryCta ??
            "Legacy snapshot unavailable",
          pagesWithStructurallyClearPrimaryCta:
            websiteCrawl.pagesWithClearPrimaryCta ??
            "Legacy snapshot unavailable",
          imagesMissingAlt: `${websiteCrawl.totalImagesMissingAlt} of ${websiteCrawl.totalImages}`,
          importantPagesScanned: websiteCrawl.importantPagesFound,
          importantPagesDiscoveredButSkipped:
            websiteCrawl.skippedImportantPages
              ?.slice(0, 8)
              .map((page) => `${page.type} (${page.path})`) ?? [],
          importantPageTypesNotFound: (
            websiteCrawl.missingImportantPageTypes ??
            websiteCrawl.importantPagesMissing
          )
            .filter(
              (type) =>
                reservationRelevant ||
                !type.toLowerCase().includes("reservation"),
            )
            .slice(0, 8),
          uncertaintyNote:
            "Do not claim an important page is missing if it appears in importantPagesDiscoveredButSkipped. Say it was discovered but not scanned and should be verified.",
          sampleProblemPages: websiteCrawl.pageResults
            .filter(
              (page) =>
                !page.title ||
                !page.metaDescription ||
                page.h1Count !== 1 ||
                page.ctaCandidates.length === 0,
            )
            .slice(0, 5)
            .map(
              (page) =>
                `${pathOnly(page.url)} | title ${page.title ? "present" : "missing"} | meta ${
                  page.metaDescription ? "present" : "missing"
                } | H1 count ${page.h1Count} | detected action-link count ${
                  page.actionSummary?.detectedActionLinkCount ??
                  page.ctaCandidates.length
                } | CTA clarity ${getPrimaryCtaAssessment(page.actionSummary).clarity}`,
            ),
        }
      : assessment.mode === "social_first"
        ? "Not applicable because no confirmed website was provided."
        : "No multi-page crawl snapshot.",
    seo: seo
      ? {
          score: seo.score,
          titleStatus: seo.titleStatus,
          metaDescriptionStatus: seo.metaDescriptionStatus,
          h1Status: seo.h1Status,
          canonicalStatus: seo.canonicalStatus,
          viewportStatus: seo.viewportStatus,
          robotsTxtStatus: seo.robotsTxtStatus,
          sitemapStatus: seo.sitemapStatus,
          warnings: [...seo.seoWarnings, ...seo.indexabilityWarnings].slice(
            0,
            8,
          ),
          recommendedFixes: seo.recommendedFixes.slice(0, 6),
        }
      : assessment.mode === "social_first"
        ? "Not provided. SEO requires a confirmed website and was excluded from the overall score."
        : "No SEO snapshot.",
    social: social
      ? {
          score: social.score,
          scoreScope: social.scoreScope ?? "PROFILE_COVERAGE",
          performanceStatus: social.performanceStatus ?? "NOT_ANALYZED",
          confirmedPlatforms: social.confirmedPlatforms,
          pendingPlatforms: social.pendingPlatforms,
          userConfirmedProfiles:
            normalizedFacts?.profiles.userConfirmedSocialProfiles ??
            social.confirmedProfilesCount,
          publiclyDetectedProfiles:
            normalizedFacts?.profiles.publiclyDetectedSocialProfiles ?? 0,
          additionalDetectedPlatforms:
            normalizedFacts?.profiles.additionalDetectedPlatforms ?? [],
          profileContentAnalyzed:
            normalizedFacts?.profiles.profileContentAnalyzed ?? 0,
          coverageLevel: social.platformCoverageLevel,
          detectedConversionPaths: social.detectedConversionPaths ?? [],
          warnings: social.warnings.slice(0, 5),
          opportunities: social.opportunities.slice(0, 5),
          recommendedFixes: social.recommendedFixes.slice(0, 5),
          dataUsed: social.dataUsed ?? [],
          limitations: social.limitations ?? [
            "No individual posts or engagement metrics were analyzed.",
          ],
        }
      : "No social snapshot.",
    socialStrategy: input.socialStrategy
      ? {
          confidence: `${input.socialStrategy.confidence}/100`,
          reasoningSummary: truncate(
            input.socialStrategy.reasoningSummary,
            320,
          ),
          recommendedPlatforms: input.socialStrategy.recommendedPlatforms
            .slice(0, 5)
            .map(
              (platform) =>
                `${platform.priority} | ${platform.platform} | confidence ${platform.confidence}/100 | ${truncate(
                  platform.reason,
                  180,
                )} | content fit: ${truncate(platform.contentFit, 180)}`,
            ),
          contentPillars: input.socialStrategy.contentPillars
            .slice(0, 5)
            .map(
              (pillar) =>
                `${pillar.title} - ${truncate(
                  pillar.description,
                  180,
                )} | topics: ${pillar.exampleTopics.slice(0, 4).join(", ")}`,
            ),
          weeklyPlan: input.socialStrategy.weeklyPlan
            .slice(0, 7)
            .map(
              (item) =>
                `${item.day} | ${item.platform} | ${item.contentType}: ${truncate(
                  item.idea,
                  160,
                )} | goal: ${truncate(item.goal, 120)}`,
            ),
          suggestedPosts: input.socialStrategy.suggestedPosts
            .slice(0, 6)
            .map(
              (post) =>
                `${post.platform} | hook: ${truncate(
                  post.hook,
                  120,
                )} | idea: ${truncate(
                  post.postConcept,
                  180,
                )} | CTA: ${truncate(post.callToAction, 120)}`,
            ),
          conversionTips: input.socialStrategy.conversionTips
            .slice(0, 5)
            .map((tip) => `${tip.tip} - ${truncate(tip.reason, 180)}`),
          competitorOpportunities: input.socialStrategy.competitorOpportunities
            .slice(0, 4)
            .map(
              (opportunity) =>
                `${opportunity.opportunity} - ${truncate(
                  opportunity.reason,
                  180,
                )}`,
            ),
          note: "Use saved Social Strategy for social platform, content idea, weekly plan, and social-to-conversion questions. Do not claim actual post engagement was analyzed.",
        }
      : "No saved Social Strategy yet. Use Business Context and social snapshot, and suggest generating Social Strategy when the user asks for detailed content planning.",
    reviews: {
      evidenceRule:
        "Use normalized saved audit facts when explaining the selected audit. Use current database records only when answering about the listing's current state, and label any post-audit change.",
      currentScore: reviews.score,
      savedAuditScore: snapshotReviews?.score ?? null,
      savedAuditScoreStatus:
        normalizedFacts?.scoreEvidence.reviews.status ?? "Legacy unavailable",
      savedAuditScoreScope:
        normalizedFacts?.scoreEvidence.reviews.scope ?? "Legacy unavailable",
      savedAuditScoreConfidence:
        normalizedFacts?.scoreEvidence.reviews.confidence ??
        "Legacy unavailable",
      googleBusinessStatus: reviews.googleBusinessStatus,
      savedAuditGoogleBusinessStatus:
        snapshotReviews?.googleBusinessStatus ?? null,
      googleBusinessDiscoveryStatus: reviews.googleBusinessDiscoveryStatus,
      googleBusinessApplicability: reviews.googleBusinessApplicability,
      googleBusinessListingName: reviews.googleBusinessListingName,
      googleRating: reviews.googleRating,
      googleReviewCount: reviews.googleReviewCount,
      googleMapsUri: reviews.googleMapsUri,
      reviewScoreExplanation: reviews.reviewScoreExplanation,
      reviewDataFreshness: {
        status: reviewFreshness.status,
        needsFreshAudit: reviewFreshness.needsFreshAudit,
        note: reviewFreshness.note,
        confirmedAfterAudit: reviewFreshness.confirmedAfterAudit.map(
          (profile) => ({
            name: profile.displayName,
            confirmedAt: profile.confirmedAt.toISOString(),
            updatedAt: profile.updatedAt?.toISOString() ?? null,
          }),
        ),
      },
      snapshotConflict: reviewSnapshotConflict
        ? "The saved audit reviews snapshot conflicts with current Google Business data. Use currentScore/status for answers and explain that the saved audit may be stale."
        : "No conflict detected between saved audit review snapshot and current Google Business data.",
      googleBusinessProfiles: googleBusinessProfiles
        .slice(0, 8)
        .map((profile) => ({
          id: profile.id,
          placeId: profile.googlePlaceId,
          name: profile.displayName,
          status: profile.status,
          source: profile.source,
          confidence: profile.matchConfidence,
          address: profile.formattedAddress,
          phone: profile.phoneNumber,
          website: profile.websiteUri,
          maps: profile.googleMapsUri,
          rating: profile.rating,
          reviewCount: profile.reviewCount,
          confirmedAt: profile.confirmedAt?.toISOString() ?? null,
          updatedAt: profile.updatedAt?.toISOString() ?? null,
          businessStatus: profile.businessStatus,
          primaryType: profile.primaryType,
        })),
      presenceLevel: reviews.reviewPresenceLevel,
      confirmedPlatforms: reviews.confirmedReviewPlatforms,
      pendingPlatforms: reviews.pendingReviewPlatforms,
      note: "Google Business is the review channel/platform. The listing name is separate evidence. Never describe a listing name as a review platform. Never say Google Business is pending, missing, or low-confidence when the current database status is confirmed. Do not infer review sentiment or themes without review text.",
      warnings: reviews.trustWarnings.slice(0, 5),
      opportunities: reviews.opportunities.slice(0, 5),
      recommendedFixes: reviews.recommendedFixes.slice(0, 5),
    },
    competitors:
      competitorSummary.length > 0
        ? competitorSummary
        : ["No active competitors saved."],
    competitorIntelligence: input.competitorContext
      ? {
          ...compactCompetitorConsultantContext(input.competitorContext),
          sourceNote:
            "This context is rebuilt from current live records and the latest usable public competitor snapshots for every new message. Missing data is not an advantage, pending profiles are not confirmed, and social performance was not analyzed.",
        }
      : auditCompetitorIntelligence
        ? {
            generatedAt: auditCompetitorIntelligence.generatedAt,
            executiveSummary:
              auditCompetitorIntelligence.summary.executiveSummary,
            analyzedCompetitors:
              auditCompetitorIntelligence.comparison.analyzedCompetitorCount,
            savedButUnanalyzed:
              auditCompetitorIntelligence.comparison.savedButUnanalyzedCount,
            staleCompetitors:
              auditCompetitorIntelligence.comparison.staleCompetitorCount,
            failedCompetitors:
              auditCompetitorIntelligence.comparison.failedCompetitorCount,
            freshness: auditCompetitorIntelligence.comparison.freshness,
            categoryComparisons:
              auditCompetitorIntelligence.comparison.categoryComparisons
                .slice(0, 12)
                .map((item) => ({
                  competitor: item.competitorName,
                  category: item.category,
                  businessValue: item.businessDisplay,
                  competitorValue: item.competitorDisplay,
                  result: item.status,
                  observation: item.observation,
                  evidence: item.evidence.slice(0, 3),
                })),
            businessAdvantages:
              auditCompetitorIntelligence.comparison.businessAdvantages
                .slice(0, 5)
                .map((item) => ({
                  competitor: item.competitorName,
                  category: item.category,
                  statement: item.description,
                  evidence: item.evidence.slice(0, 3),
                })),
            competitorAdvantages:
              auditCompetitorIntelligence.comparison.competitorAdvantages
                .slice(0, 5)
                .map((item) => ({
                  competitor: item.competitorName,
                  category: item.category,
                  statement: item.description,
                  evidence: item.evidence.slice(0, 3),
                })),
            opportunities: auditCompetitorIntelligence.comparison.opportunities
              .slice(0, 5)
              .map((item) => ({
                competitor: item.competitorName,
                category: item.category,
                suggestion: item.description,
                confidence: item.confidence,
                evidence: item.evidence.slice(0, 3),
              })),
            limitations: auditCompetitorIntelligence.limitations.slice(0, 8),
            sourceNote:
              "Use only these timestamped public observations. Do not infer traffic, sales, private analytics, engagement, reach, impressions, audience demographics, or post performance. A saved competitor name is not comparison evidence.",
          }
        : {
            status:
              input.competitors.length > 0
                ? "Competitors are saved, but no current or historical structured comparison is available."
                : "Competitor comparison is not configured.",
          },
    progressSincePreviousAudit: input.auditComparison?.previousAuditId
      ? {
          overallScoreChange: formatDelta(
            input.auditComparison.overallScoreChange,
          ),
          summary: input.auditComparison.summary,
          comparisonNote: input.auditComparison.comparisonNote,
          improvedCategories: input.auditComparison.improvedCategories
            .slice(0, 5)
            .map(
              (change) =>
                `${categoryLabel(change.category)} ${formatDelta(
                  change.delta,
                )}`,
            ),
          declinedCategories: input.auditComparison.declinedCategories
            .slice(0, 5)
            .map(
              (change) =>
                `${categoryLabel(change.category)} ${formatDelta(
                  change.delta,
                )}`,
            ),
          completedSincePrevious:
            input.auditComparison.completedRecommendationsSincePrevious
              .slice(0, 6)
              .map((recommendation) => recommendation.title),
        }
      : "No previous completed audit to compare.",
    recentChatHistory:
      history.length > 0 ? history : ["No prior chat history."],
    currentQuestion: input.question,
  };

  return JSON.stringify(context, null, 2);
}

function buildWebsiteSeoConsultantContext({
  input,
  website,
  websiteCrawl,
  seo,
  homepagePrimaryCta,
  relevantAiPageEvidence,
}: {
  input: BuildConsultantContextInput;
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  seo: SeoAnalysis | null;
  homepagePrimaryCta: ReturnType<typeof getPrimaryCtaAssessment> | null;
  relevantAiPageEvidence: ReturnType<typeof selectRelevantAiPageEvidence>;
}) {
  const selectedGoals = [
    ...(input.business.primaryGoal ? [input.business.primaryGoal] : []),
    ...input.business.goals,
  ].filter(
    (goal, index, goals) =>
      websiteSeoBusinessGoals.includes(goal) && goals.indexOf(goal) === index,
  );
  const relevantScores = input.scores
    .filter(
      (score) => !score.platform && isWebsiteSeoReportCategory(score.category),
    )
    .map((score) => ({
      category: categoryLabels[score.category],
      score: score.score,
    }));
  const relevantFindings = input.findings
    .filter((finding) => isWebsiteSeoCategory(finding.category))
    .sort(
      (left, right) =>
        severityWeight(right.severity) - severityWeight(left.severity),
    )
    .slice(0, 10)
    .map((finding) => {
      const validation = readFindingValidationMetadata(finding.evidence);
      return {
        category: categoryLabels[finding.category],
        severity: finding.severity,
        title: finding.title,
        classification: validation?.classification ?? "LEGACY_FINDING",
        confidence: validation?.confidence ?? null,
        whatThisMeans:
          validation?.plainLanguage.whatThisMeans ??
          completeEvidenceSummary(finding.description, 320),
        whyItMatters: validation?.plainLanguage.whyItMatters ?? null,
        recommendedAction: validation?.plainLanguage.whatToDo ?? null,
        ownerFixability:
          validation?.plainLanguage.ownerFixabilityLabel ?? null,
        specialist: validation?.plainLanguage.whoCanHelpLabel ?? null,
        verification: validation?.plainLanguage.howOnreadWillCheck ?? null,
        evidenceIds: validation?.supportingEvidenceIds.slice(0, 12) ?? [],
        affectedUrl: finding.sourceUrl ?? null,
      };
    });
  const relevantRecommendations = input.recommendations
    .filter((recommendation) => isWebsiteSeoCategory(recommendation.category))
    .sort(
      (left, right) =>
        statusWeight[left.status] - statusWeight[right.status] ||
        priorityWeight[left.priority] - priorityWeight[right.priority],
    )
    .slice(0, 10)
    .map((recommendation) => ({
      category: categoryLabels[recommendation.category],
      title: recommendation.title,
      description: completeEvidenceSummary(recommendation.description, 280),
      priority: recommendation.priority,
      status: recommendation.status,
      effort: recommendation.estimatedEffort ?? recommendation.effort,
      impact: recommendation.expectedImpact ?? recommendation.impact,
      affectedUrl: recommendation.sourceUrl ?? null,
    }));
  const comparison = input.auditComparison;
  const comparableProgress = comparison?.previousAuditId
    ? comparison.methodologyChanged
      ? {
          status: "not_comparable",
          note:
            comparison.comparisonNote ??
            "The previous audit used a different scoring methodology.",
        }
      : {
          status: "comparable",
          overallScoreChange: comparison.overallScoreChange,
          summary: comparison.summary,
          categoryChanges: comparison.categoryScoreChanges
            .filter((change) => isWebsiteSeoCategory(change.category))
            .map((change) => ({
              category: categoryLabels[change.category],
              previousScore: change.previousScore,
              currentScore: change.currentScore,
              delta: change.delta,
            })),
        }
    : { status: "first_audit" };
  const recentChatHistory = (input.recentChatHistory ?? [])
    .filter(
      (message) =>
        !/\b(social|instagram|facebook|tiktok|youtube|competitor|reviews?|google business|local growth)\b/i.test(
          message.content,
        ),
    )
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 1_200),
    }));
  const context = {
    productScope: "Website and SEO audit and growth",
    sourceOfTruth:
      "Use only the saved website, crawl, SEO, finding, recommendation, and progress evidence below. Missing evidence is unknown, not negative evidence.",
    business: {
      name: input.business.name,
      website: website?.normalizedUrl ?? input.business.initialInput,
      description: input.business.description ?? null,
      targetAudience: input.business.targetAudience ?? null,
      mainOffer: input.business.mainOffer ?? null,
      businessType:
        input.business.businessType ?? input.business.industry ?? null,
      primaryConversionGoal: input.business.primaryConversionGoal ?? null,
      selectedGoals: selectedGoals.map((goal) => businessGoalLabels[goal]),
      contextConfirmed: Boolean(input.business.contextConfirmedAt),
    },
    latestAudit: {
      date: input.latestAudit.createdAt.toISOString().slice(0, 10),
      scoreLabel: WEBSITE_GROWTH_SCORE_LABEL,
      overallScore: input.latestAudit.overallScore,
      summary: input.latestAudit.summary,
      scores: relevantScores,
    },
    websiteEvidence: website
      ? {
          url: website.normalizedUrl,
          title: website.pageTitle,
          metaDescription: website.metaDescription,
          h1Count: website.h1Count,
          h1Text: website.h1Text.slice(0, 5),
          images: website.imageCount,
          imagesMissingAlt: website.imagesMissingAltCount,
          internalLinks: website.internalLinksCount,
          externalLinks: website.externalLinksCount,
          detectedActionLinks:
            website.actionSummary?.primaryActions?.slice(0, 8) ??
            website.ctaCandidates.slice(0, 8),
          primaryCtaAssessment: homepagePrimaryCta,
          warnings: website.warnings.slice(0, 8),
        }
      : { status: "No saved website analysis." },
    crawlEvidence: websiteCrawl
      ? {
          pagesScanned: websiteCrawl.pagesScanned,
          successfulPages: websiteCrawl.successfulPages,
          failedPages: websiteCrawl.failedPages,
          crawlLimit: websiteCrawl.crawlLimitUsed,
          crawlLimitReached: websiteCrawl.crawlLimitReached,
          pagesMissingTitle: websiteCrawl.pagesMissingTitle,
          pagesMissingMetaDescription: websiteCrawl.pagesMissingMetaDescription,
          pagesWithNoH1: websiteCrawl.pagesWithNoH1,
          pagesWithMultipleH1: websiteCrawl.pagesWithMultipleH1,
          pagesWithNoDetectedActionLinks: websiteCrawl.pagesWithNoCTA,
          importantPagesFound: websiteCrawl.importantPagesFound.slice(0, 12),
          importantPagesMissing: websiteCrawl.importantPagesMissing.slice(
            0,
            12,
          ),
          thinPages: websiteCrawl.thinPages?.slice(0, 8) ?? [],
          duplicateContentGroups:
            websiteCrawl.duplicateContentGroups?.slice(0, 5) ?? [],
          warnings: websiteCrawl.warnings.slice(0, 8),
        }
      : { status: "No saved multi-page crawl." },
    seoEvidence: seo
      ? {
          score: seo.score,
          titleStatus: seo.titleStatus,
          titleLength: seo.titleLength,
          metaDescriptionStatus: seo.metaDescriptionStatus,
          metaDescriptionLength: seo.metaDescriptionLength,
          h1Status: seo.h1Status,
          canonicalStatus: seo.canonicalStatus,
          viewportStatus: seo.viewportStatus,
          robotsTxtStatus: seo.robotsTxtStatus,
          sitemapStatus: seo.sitemapStatus,
          warnings: [...seo.indexabilityWarnings, ...seo.seoWarnings].slice(
            0,
            10,
          ),
          recommendedFixes: seo.recommendedFixes.slice(0, 8),
        }
      : { status: "No saved SEO analysis." },
    relevantPageReview: relevantAiPageEvidence.slice(0, 4),
    findings: relevantFindings,
    recommendations: relevantRecommendations,
    actionProgress: {
      completed: relevantRecommendations.filter(
        (recommendation) =>
          recommendation.status === RecommendationStatus.COMPLETED,
      ).length,
      total: relevantRecommendations.length,
    },
    progressSincePreviousAudit: comparableProgress,
    recentChatHistory,
    currentQuestion: input.question,
    unavailableProductAreas:
      "Social Growth, Competitive Intelligence, and Local Growth are disabled. Do not imply their data was analyzed or offer module-specific analysis. Redirect the user to website or SEO actions when useful.",
  };

  return JSON.stringify(context, null, 2);
}

function scoreFor(scores: ConsultantContextScore[], category: ScoreCategory) {
  return (
    scores.find((score) => score.category === category && !score.platform)
      ?.score ?? null
  );
}

function selectRelevantAiPageEvidence(
  snapshot: SelectiveAiAuditSnapshot | null,
  question: string,
) {
  if (!snapshot) return [];
  const terms = meaningfulTerms(question);

  return [...snapshot.selectedPageAnalyses]
    .map((page) => {
      const searchable = [
        page.url,
        page.pageType,
        page.analysis.pageSummary,
        page.analysis.pagePurpose,
        ...page.analysis.opportunities.flatMap((item) => [
          item.category,
          item.title,
          item.description,
          item.recommendation,
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return {
        page,
        relevance: terms.reduce(
          (score, term) => score + (searchable.includes(term) ? 1 : 0),
          0,
        ),
      };
    })
    .sort(
      (left, right) =>
        right.relevance - left.relevance ||
        left.page.url.localeCompare(right.page.url),
    )
    .slice(0, terms.length > 0 ? 3 : 2)
    .map(({ page }) => ({
      url: page.url,
      pageType: page.pageType,
      pageSummary: truncate(page.analysis.pageSummary, 280),
      pagePurpose: truncate(page.analysis.pagePurpose, 180),
      strengths: page.analysis.strengths.slice(0, 2).map((item) => ({
        title: item.title,
        evidence: truncate(item.evidence, 180),
        confidence: item.confidence,
      })),
      opportunities: page.analysis.opportunities.slice(0, 3).map((item) => ({
        category: item.category,
        title: item.title,
        evidence: truncate(item.evidence, 180),
        recommendation: truncate(item.recommendation, 220),
        confidence: item.confidence,
      })),
      limitations: page.analysis.limitations.slice(0, 3),
      contentTruncated: page.contentTruncated,
    }));
}

function recommendationQuestionRelevance(
  recommendation: ConsultantContextRecommendation,
  question: string,
) {
  const searchable =
    `${recommendation.title} ${recommendation.description} ${recommendation.category}`.toLowerCase();
  return meaningfulTerms(question).reduce(
    (score, term) => score + (searchable.includes(term) ? 1 : 0),
    0,
  );
}

function meaningfulTerms(value: string) {
  return unique(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(
        (term) =>
          term.length >= 4 &&
          ![
            "what",
            "should",
            "could",
            "would",
            "about",
            "with",
            "from",
            "this",
            "that",
            "have",
            "help",
          ].includes(term),
      ),
  );
}

function severityWeight(severity: FindingSeverity) {
  return {
    INFO: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  }[severity];
}

function displayEffort(recommendation: {
  estimatedEffort: string | null;
  effort: string | null;
}) {
  return recommendation.estimatedEffort ?? recommendation.effort ?? "Medium";
}

function displayImpact(recommendation: {
  expectedImpact: string | null;
  impact: string | null;
}) {
  return recommendation.expectedImpact ?? recommendation.impact ?? "Medium";
}

function formatProfiles(profiles: ConsultantContextProfile[]) {
  return profiles.length > 0
    ? profiles.slice(0, 12).map((profile) => {
        const value = profile.url ?? profile.handle ?? "No URL or handle";
        return `${platformLabels[profile.platform]}: ${value}`;
      })
    : ["None"];
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  const suffix = " Additional context omitted.";
  const available = Math.max(20, limit - suffix.length);
  const candidate = value.slice(0, available);
  const sentence = candidate.lastIndexOf(". ");
  const word = candidate.lastIndexOf(" ");
  const boundary = sentence > available * 0.5 ? sentence + 1 : word;
  const summary = value
    .slice(0, Math.max(1, boundary))
    .trim()
    .replace(/[,;:]$/, ".");
  return `${summary}${/[.!?]$/.test(summary) ? "" : "."}${suffix}`;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function pathOnly(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return url;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getWebsiteAnalysis(snapshot: unknown): WebsiteAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.website)) {
    return null;
  }

  const website = snapshot.website;

  if (
    typeof website.normalizedUrl !== "string" ||
    typeof website.score !== "number"
  ) {
    return null;
  }

  return website as WebsiteAnalysis;
}

function getWebsiteCrawl(snapshot: unknown): WebsiteCrawlResult | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.websiteCrawl)) {
    return null;
  }

  const crawl = snapshot.websiteCrawl;

  if (
    typeof crawl.pagesScanned !== "number" ||
    !Array.isArray(crawl.pageResults)
  ) {
    return null;
  }

  return crawl as WebsiteCrawlResult;
}

function getSeoAnalysis(snapshot: unknown): SeoAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.seo)) {
    return null;
  }

  const seo = snapshot.seo;

  if (typeof seo.score !== "number" || !Array.isArray(seo.seoWarnings)) {
    return null;
  }

  return seo as SeoAnalysis;
}

function getSocialAnalysis(snapshot: unknown): SocialAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.social)) {
    return null;
  }

  const social = snapshot.social;

  if (
    typeof social.score !== "number" ||
    !Array.isArray(social.confirmedPlatforms)
  ) {
    return null;
  }

  return social as SocialAnalysis;
}

function getReviewAnalysis(snapshot: unknown): ReviewAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.reviews)) {
    return null;
  }

  const reviews = snapshot.reviews;

  if (
    typeof reviews.score !== "number" ||
    !Array.isArray(reviews.confirmedReviewPlatforms)
  ) {
    return null;
  }

  return normalizeReviewAnalysisForDisplay(reviews as ReviewAnalysis);
}

async function getCurrentGoogleBusinessProfiles({
  businessId,
  fallback,
}: {
  businessId?: string;
  fallback: ConsultantContextGoogleBusinessProfile[];
}): Promise<ConsultantContextGoogleBusinessProfile[]> {
  if (!businessId) {
    return fallback;
  }

  const profiles = await prisma.googleBusinessProfile.findMany({
    where: {
      businessId,
    },
    orderBy: [
      {
        status: "asc",
      },
      {
        matchConfidence: "desc",
      },
      {
        updatedAt: "desc",
      },
    ],
  });

  return profiles.map((profile) => ({
    id: profile.id,
    googlePlaceId: profile.googlePlaceId,
    displayName: profile.displayName,
    formattedAddress: profile.formattedAddress,
    phoneNumber: profile.phoneNumber,
    websiteUri: profile.websiteUri,
    googleMapsUri: profile.googleMapsUri,
    rating: profile.rating,
    reviewCount: profile.reviewCount,
    matchConfidence: profile.matchConfidence,
    matchReasons: profile.matchReasons,
    status: profile.status,
    source: profile.source,
    confirmedAt: profile.confirmedAt,
    updatedAt: profile.updatedAt,
    businessStatus: profile.businessStatus,
    primaryType: profile.primaryType,
    types: profile.types,
  }));
}

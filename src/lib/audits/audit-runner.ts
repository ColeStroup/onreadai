import "server-only";

import {
  AuditStatus,
  BusinessProfileStatus,
  BusinessStatus,
  CompetitorSnapshotStatus,
  CompetitorStatus,
  FindingSeverity,
  ProfilePlatform,
  RecommendationPriority,
  ScoreCategory,
  type Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { analyzeReviews } from "@/lib/analyzers/review-analyzer";
import { analyzeSeo } from "@/lib/analyzers/seo-analyzer";
import { analyzeSocialProfiles } from "@/lib/analyzers/social-analyzer";
import { crawlWebsite } from "@/lib/analyzers/website-crawler";
import { analyzeWebsite } from "@/lib/analyzers/website-analyzer";
import { generateBusinessContextDraft } from "@/lib/ai/business-context-generator";
import { generateCompetitorIntelligenceSummary } from "@/lib/ai/competitor-intelligence-generator";
import { generateDeterministicSocialStrategy } from "@/lib/ai/social-strategy-generator";
import { generateDeterministicAudit } from "@/lib/audits/deterministic-audit";
import { buildAuditEvidenceIntegrity } from "@/lib/audits/evidence-integrity";
import { getUserPlan } from "@/lib/billing/entitlements";
import { getPlanEntitlements } from "@/lib/billing/plans";
import { hasBusinessContext } from "@/lib/business-context";
import { analyzeBusinessCompetitors } from "@/lib/competitors/competitor-analysis-runner";
import { compareBusinessToCompetitors } from "@/lib/competitors/competitor-comparison";
import type { AuditCompetitorIntelligence } from "@/lib/competitors/competitor-types";
import { discoverGoogleBusinessProfiles } from "@/lib/google/google-business-discovery";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/observability/log";
import {
  COMPETITOR_COMPARISON_VERSION,
  buildCompetitorComparisonDependencyFingerprint,
  buildSocialStrategyDependencyFingerprint,
  REPORT_VIEW_MODEL_VERSION,
  SCORING_ENGINE_VERSION,
  SEO_ANALYZER_VERSION,
  SOCIAL_STRATEGY_GENERATOR_VERSION,
  WEBSITE_ANALYZER_VERSION,
} from "@/lib/reports/report-freshness";

export const activeRunWindowMs = 14 * 60 * 1000;

export type AuditRunResult = {
  auditId: string;
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
};

export async function createPendingAuditRun(businessId: string) {
  const activeSince = new Date(Date.now() - activeRunWindowMs);
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw<Array<{ lockResult: string }>>`
      SELECT pg_advisory_xact_lock(
        hashtext(${`audit-run:${businessId}`})
      )::text AS "lockResult"
    `;

    await transaction.audit.updateMany({
      where: {
        businessId,
        status: { in: [AuditStatus.PENDING, AuditStatus.QUEUED, AuditStatus.RUNNING] },
        updatedAt: { lt: activeSince },
      },
      data: {
        status: AuditStatus.FAILED,
        summary: "The audit run was interrupted before it completed. You can run it again.",
        completedAt: new Date(),
      },
    });

    const existingRun = await transaction.audit.findFirst({
      where: {
        businessId,
        status: { in: [AuditStatus.PENDING, AuditStatus.QUEUED, AuditStatus.RUNNING] },
        updatedAt: { gte: activeSince },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });

    if (existingRun) return existingRun;

    return transaction.audit.create({
      data: { businessId, status: AuditStatus.PENDING },
      select: { id: true, status: true },
    });
  });
}

export async function runAuditGeneration({
  businessId,
  auditId,
  revalidate = true,
}: {
  businessId: string;
  auditId: string;
  revalidate?: boolean;
}): Promise<AuditRunResult> {
  const audit = await prisma.audit.findFirst({
    where: {
      id: auditId,
      businessId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!audit) {
    return {
      auditId,
      status: "failed",
      error: "Audit run was not found.",
    };
  }

  if (audit.status === AuditStatus.COMPLETED) {
    return {
      auditId,
      status: "completed",
    };
  }

  if (audit.status === AuditStatus.RUNNING) {
    return {
      auditId,
      status: "running",
    };
  }

  const startedAt = new Date();
  const claimed = await prisma.audit.updateMany({
    where: {
      id: auditId,
      businessId,
      status: {
        in: [AuditStatus.PENDING, AuditStatus.QUEUED, AuditStatus.FAILED],
      },
    },
    data: {
      status: AuditStatus.RUNNING,
      startedAt,
      completedAt: null,
      summary: null,
    },
  });

  if (claimed.count === 0) {
    const currentAudit = await prisma.audit.findFirst({
      where: {
        id: auditId,
        businessId,
      },
      select: {
        status: true,
      },
    });

    return {
      auditId,
      status:
        currentAudit?.status === AuditStatus.COMPLETED
          ? "completed"
          : "running",
    };
  }

  try {
    const auditData = await buildAuditData({ businessId, auditId });
    const completedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.auditScore.deleteMany({
        where: {
          auditId,
        },
      });
      await tx.auditFinding.deleteMany({
        where: {
          auditId,
        },
      });
      await tx.recommendation.deleteMany({
        where: {
          auditId,
        },
      });

      await tx.audit.update({
        where: {
          id: auditId,
        },
        data: {
          status: AuditStatus.COMPLETED,
          overallScore: auditData.auditResult.overallScore,
          summary: auditData.auditResult.summary,
          analysisSnapshot: auditData.analysisSnapshot,
          completedAt,
          scores: {
            create: auditData.auditResult.scores.map((score) => ({
              category: score.category,
              platform: score.platform,
              label: score.label,
              score: score.score,
            })),
          },
          findings: {
            create: auditData.auditResult.findings.map((finding) => ({
              ...(finding.id ? { id: finding.id } : {}),
              category: finding.category,
              title: finding.title,
              description: finding.description,
              severity: finding.severity,
              evidence: finding.evidence,
            })),
          },
          recommendations: {
            create: auditData.auditResult.recommendations.map((recommendation, index) => ({
              business: {
                connect: {
                  id: businessId,
                },
              },
              title: recommendation.title,
              description: recommendation.description,
              category: recommendation.category,
              priority: recommendation.priority,
              effort: recommendation.estimatedEffort,
              impact: recommendation.expectedImpact,
              estimatedEffort: recommendation.estimatedEffort,
              expectedImpact: recommendation.expectedImpact,
              sourceType: recommendation.sourceType,
              sourceReferenceId: recommendation.sourceReferenceId,
              evidence: recommendation.evidence,
              sortOrder: index + 1,
            })),
          },
        },
      });

      await tx.business.update({
        where: {
          id: businessId,
        },
        data: {
          status: BusinessStatus.ACTIVE,
          ...(auditData.businessContextDraft
            ? {
                description: auditData.businessContextDraft.description,
                targetAudience: auditData.businessContextDraft.targetAudience,
                mainOffer: auditData.businessContextDraft.mainOffer,
                industry: auditData.businessContextDraft.industry,
                businessType: auditData.businessContextDraft.businessType,
                primaryConversionGoal:
                  auditData.businessContextDraft.primaryConversionGoal,
                brandTone: auditData.businessContextDraft.brandTone,
                contextConfidence: auditData.businessContextDraft.confidence,
                contextSource: "generated",
                contextConfirmedAt: null,
                contextUpdatedAt: completedAt,
              }
            : {}),
        },
      });
    });

    if (revalidate) {
      try {
        revalidateAuditPaths(businessId);
      } catch (error) {
        logWarn("audit_revalidation_failed", {
          businessId,
          auditId,
          errorType: error instanceof Error ? error.name : typeof error,
        });
      }
    }

    return {
      auditId,
      status: "completed",
    };
  } catch (error) {
    logError("audit_generation_failed", error, { businessId, auditId });
    await prisma.audit.update({
      where: {
        id: auditId,
      },
      data: {
        status: AuditStatus.FAILED,
        summary: "The audit could not be completed. You can try again safely.",
        completedAt: new Date(),
      },
    });

    if (revalidate) {
      try {
        revalidateAuditPaths(businessId);
      } catch (revalidationError) {
        logWarn("audit_failure_revalidation_failed", {
          businessId,
          auditId,
          errorType:
            revalidationError instanceof Error
              ? revalidationError.name
              : typeof revalidationError,
        });
      }
    }

    return {
      auditId,
      status: "failed",
      error: "The audit could not be completed. Please try again.",
    };
  }
}

export function revalidateAuditPaths(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}`);
  revalidatePath(`/dashboard/businesses/${businessId}/audit/run`);
  revalidatePath(`/dashboard/businesses/${businessId}/overview`);
  revalidatePath(`/dashboard/businesses/${businessId}/context`);
  revalidatePath(`/dashboard/businesses/${businessId}/setup`);
  revalidatePath(`/dashboard/businesses/${businessId}/website`);
  revalidatePath(`/dashboard/businesses/${businessId}/seo`);
  revalidatePath(`/dashboard/businesses/${businessId}/social`);
  revalidatePath(`/dashboard/businesses/${businessId}/reviews`);
  revalidatePath(`/dashboard/businesses/${businessId}/competitors`);
  revalidatePath(`/dashboard/businesses/${businessId}/history`);
  revalidatePath(`/dashboard/businesses/${businessId}/chat`);
  revalidatePath(`/dashboard/businesses/${businessId}/action-plan`);
  revalidatePath("/dashboard/businesses");
  revalidatePath("/dashboard");
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

async function buildAuditData({
  businessId,
  auditId,
}: {
  businessId: string;
  auditId: string;
}) {
  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    include: {
      profiles: {
        orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
      },
      competitors: {
        where: {
          status: CompetitorStatus.ACTIVE,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          websiteUrl: true,
          notes: true,
          discoveredProfiles: {
            select: {
              id: true,
              platform: true,
              label: true,
              status: true,
              urlOrHandle: true,
            },
          },
        },
      },
      googleBusinessProfiles: {
        where: {
          status: {
            not: "removed",
          },
        },
        orderBy: [
          {
            status: "asc",
          },
          {
            matchConfidence: "desc",
          },
        ],
      },
    },
  });

  if (!business) {
    throw new Error("Business was not found.");
  }

  const plan = await getUserPlan(business.ownerId);
  const entitlements = getPlanEntitlements(plan);
  const businessContext = {
    description: business.description,
    targetAudience: business.targetAudience,
    mainOffer: business.mainOffer,
    industry: business.industry,
    businessType: business.businessType,
    primaryConversionGoal: business.primaryConversionGoal,
  };
  const websiteProfile = business.profiles.find(
    (profile) =>
      profile.platform === ProfilePlatform.WEBSITE &&
      profile.status === BusinessProfileStatus.CONFIRMED &&
      Boolean(profile.url),
  );
  const websiteAnalysis = websiteProfile?.url
    ? await analyzeWebsite(websiteProfile.url, {
        businessContext,
      })
    : null;
  const websiteCrawl = websiteAnalysis
      ? await crawlWebsite(websiteAnalysis.normalizedUrl, {
          maxPages: entitlements.maxCrawlPages,
          timeBudgetMs: 3 * 60 * 1_000,
          businessContext,
      })
    : null;
  const seoAnalysis = websiteAnalysis
    ? await analyzeSeo(websiteAnalysis.normalizedUrl, websiteAnalysis)
    : null;
  const googleBusinessDiscovery = await discoverGoogleBusinessProfiles({
    business,
    websiteAnalysis,
    websiteCrawl,
  }).catch((error) => {
    logError("audit_google_business_discovery_failed", error, {
      businessId,
      auditId,
    });

    return {
      apiConfigured: false,
      searched: false,
      error: "Google Business discovery failed.",
      candidatesSaved: 0,
      bestConfidence: null,
      source: "none" as const,
      profileIds: [],
      detectedAddress: websiteAnalysis?.detectedAddress ?? null,
      detectedPhone: websiteAnalysis?.detectedPhone ?? null,
      detectedGoogleMapsLinks: websiteAnalysis?.detectedGoogleMapsLinks ?? [],
      detectedMapEmbeds: websiteAnalysis?.detectedMapEmbeds ?? [],
      detectedLocalBusinessSchemaCount:
        websiteAnalysis?.detectedLocalBusinessSchema.length ?? 0,
    };
  });
  const googleBusinessProfiles = await prisma.googleBusinessProfile.findMany({
    where: {
      businessId,
      status: {
        not: "removed",
      },
    },
    orderBy: [
      {
        status: "asc",
      },
      {
        matchConfidence: "desc",
      },
    ],
  });
  const socialAnalysis = analyzeSocialProfiles({
    businessProfiles: business.profiles.map((profile) => ({
      platform: profile.platform,
      status: profile.status,
      label: profile.displayName,
      urlOrHandle: profile.url ?? profile.handle,
    })),
    competitors: business.competitors.map((competitor) => ({
      competitorName: competitor.name,
      profiles: competitor.discoveredProfiles.map((profile) => ({
        platform: profile.platform,
        status: profile.status,
        label: profile.label,
      })),
    })),
    goals: business.goals,
    primaryGoal: business.primaryGoal,
  });
  const reviewAnalysis = analyzeReviews({
    businessProfiles: business.profiles.map((profile) => ({
      platform: profile.platform,
      status: profile.status,
      label: profile.displayName,
    })),
    googleBusinessProfiles: googleBusinessProfiles.map((profile) => ({
      id: profile.id,
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
    })),
    googleDiscovery: {
      apiConfigured: googleBusinessDiscovery.apiConfigured,
      searched: googleBusinessDiscovery.searched,
      error: googleBusinessDiscovery.error,
    },
    competitors: business.competitors.map((competitor) => ({
      competitorName: competitor.name,
      profiles: competitor.discoveredProfiles.map((profile) => ({
        platform: profile.platform,
        status: profile.status,
        label: profile.label,
      })),
    })),
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    businessContext,
  });
  const competitorProfileSummary = business.competitors.map((competitor) => {
    const confirmedProfiles = competitor.discoveredProfiles.filter(
      (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
    );
    const pendingProfiles = competitor.discoveredProfiles.filter(
      (profile) => profile.status === BusinessProfileStatus.PENDING,
    );

    return {
      name: competitor.name,
      websiteUrl: competitor.websiteUrl,
      confirmedProfilesCount: confirmedProfiles.length,
      pendingProfilesCount: pendingProfiles.length,
      confirmedPlatforms: confirmedProfiles.map(
        (profile) => profile.label ?? profile.platform,
      ),
    };
  });
  const competitorScanResults = await analyzeBusinessCompetitors({
    userId: business.ownerId,
    businessId,
    auditId,
    maximumFreshScans: 4,
    crawlTimeBudgetMs: 60_000,
  }).catch((error) => {
    logError("audit_competitor_analysis_failed", error, {
      businessId,
      auditId,
    });

    return [];
  });
  const comparisonCompetitors = await prisma.competitor.findMany({
    where: {
      businessId,
      status: CompetitorStatus.ACTIVE,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      discoveredProfiles: {
        select: {
          id: true,
          platform: true,
          status: true,
          urlOrHandle: true,
        },
      },
      snapshots: {
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
        select: {
          id: true,
          status: true,
          websiteUrl: true,
          websiteScore: true,
          seoScore: true,
          socialCoverageScore: true,
          reviewsScore: true,
          positioningScore: true,
          websiteSnapshot: true,
          seoSnapshot: true,
          socialSnapshot: true,
          reviewsSnapshot: true,
          positioningSnapshot: true,
          scannedAt: true,
          createdAt: true,
        },
      },
    },
  });
  const competitorAnalysisAvailable = comparisonCompetitors.some(
    (competitor) =>
      competitor.snapshots.some(
        (snapshot) =>
          snapshot.status === CompetitorSnapshotStatus.COMPLETED ||
          snapshot.status === CompetitorSnapshotStatus.PARTIAL,
      ),
  );
  const auditResult = generateDeterministicAudit({
    businessName: business.name,
    initialInput: business.initialInput,
    profiles: business.profiles.map((profile) => ({
      platform: profile.platform,
      status: profile.status,
      confidenceScore: profile.confidenceScore,
      url: profile.url,
      handle: profile.handle,
    })),
    competitors: business.competitors.map((competitor) => ({
      name: competitor.name,
      websiteUrl: competitor.websiteUrl,
      notes: competitor.notes,
      profiles: competitor.discoveredProfiles.map((profile) => ({
        platform: profile.platform,
        label: profile.label,
        status: profile.status,
      })),
    })),
    websiteAnalysis,
    websiteCrawl,
    seoAnalysis,
    socialAnalysis,
    reviewAnalysis,
    businessContext: {
      ...businessContext,
      brandTone: business.brandTone,
    },
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    competitorAnalysisAvailable,
  });
  const comparison = compareBusinessToCompetitors({
    business: {
      name: business.name,
      description: business.description,
      targetAudience: business.targetAudience,
      mainOffer: business.mainOffer,
      primaryConversionGoal: business.primaryConversionGoal,
    },
    primaryAudit: {
      createdAt: new Date(),
      completedAt: new Date(),
      analysisSnapshot: {
        ...(websiteAnalysis
          ? {
              website: websiteAnalysis,
              websiteCrawl,
              seo: seoAnalysis,
            }
          : {}),
      },
      scores: auditResult.scores,
    },
    currentReviews: reviewAnalysis,
    currentSocial: socialAnalysis,
    confirmedProfiles: business.profiles.map((profile) => ({
      platform: profile.platform,
      status: profile.status,
    })),
    competitors: comparisonCompetitors.map((competitor) => ({
      ...competitor,
      profiles: competitor.discoveredProfiles,
    })),
  });
  const scanLimitations = competitorScanResults
    .filter(
      (result) =>
        result.status === "locked" ||
        result.status === "failed" ||
        result.status === "not_analyzable",
    )
    .map(
      (result) =>
        `${result.competitorName}: ${result.error ?? "A current public snapshot was not available."}`,
    );
  comparison.limitations = [
    ...new Set([...comparison.limitations, ...scanLimitations]),
  ];
  const competitorSummary = await generateCompetitorIntelligenceSummary({
    businessName: business.name,
    comparison,
  });
  const competitorIntelligence: AuditCompetitorIntelligence = {
    snapshotIds: comparison.freshness
      .map((item) => item.snapshotId)
      .filter((id): id is string => Boolean(id)),
    competitorNames: comparisonCompetitors.map((competitor) => competitor.name),
    comparison,
    summary: competitorSummary,
    generatedAt: new Date().toISOString(),
    limitations: comparison.limitations,
  };

  if (comparison.analyzedCompetitorCount > 0) {
    auditResult.findings = auditResult.findings.filter((finding) => {
      const text = `${finding.title} ${finding.description}`;
      return !/future analysis can compare|competitor analysis (?:is|has) not|saved competitor only|comparison unavailable/i.test(
        text,
      );
    });
    auditResult.findings.push({
      category: ScoreCategory.COMPETITORS,
      title: "Public competitor comparison is available",
      description: competitorSummary.executiveSummary,
      severity: FindingSeverity.INFO,
      evidence: toJsonValue({
        snapshotDates: comparison.freshness,
        strongestBusinessAdvantage: comparison.businessAdvantages.at(0) ?? null,
        strongestCompetitorAdvantage:
          comparison.competitorAdvantages.at(0) ?? null,
      }),
    });

    const topOpportunity = comparison.opportunities.at(0);
    if (
      topOpportunity &&
      !auditResult.recommendations.some(
        (recommendation) => recommendation.title === topOpportunity.title,
      )
    ) {
      auditResult.recommendations.unshift({
        title: topOpportunity.title,
        description: topOpportunity.description,
        category: ScoreCategory.COMPETITORS,
        priority:
          topOpportunity.confidence === "high"
            ? RecommendationPriority.HIGH
            : RecommendationPriority.MEDIUM,
        estimatedEffort: "Medium",
        expectedImpact: "High",
      });
    }
  }
  const businessContextDraft = hasBusinessContext(business)
    ? null
    : await generateBusinessContextDraft({
        businessName: business.name,
        initialInput: business.initialInput,
        websiteAnalysis,
        websiteCrawl,
        profiles: business.profiles,
        goals: business.goals,
        primaryGoal: business.primaryGoal,
      });
  const effectiveBusinessContext = {
    description:
      business.description ?? businessContextDraft?.description ?? null,
    targetAudience:
      business.targetAudience ?? businessContextDraft?.targetAudience ?? null,
    mainOffer: business.mainOffer ?? businessContextDraft?.mainOffer ?? null,
    industry: business.industry ?? businessContextDraft?.industry ?? null,
    businessType:
      business.businessType ?? businessContextDraft?.businessType ?? null,
    primaryConversionGoal:
      business.primaryConversionGoal ??
      businessContextDraft?.primaryConversionGoal ??
      null,
    brandTone: business.brandTone ?? businessContextDraft?.brandTone ?? null,
    contextConfidence:
      business.contextConfidence ?? businessContextDraft?.confidence ?? null,
    contextSource: business.contextSource ?? "generated",
    contextConfirmedAt: business.contextConfirmedAt,
  };
  const socialStrategyDependencyFingerprint = buildSocialStrategyDependencyFingerprint({
    auditId,
    businessContext: effectiveBusinessContext,
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    profiles: business.profiles.map((profile) => ({
      id: profile.id,
      platform: profile.platform,
      status: profile.status,
      url: profile.url,
      handle: profile.handle,
      updatedAt: profile.updatedAt,
    })),
    googleBusinessProfiles: googleBusinessProfiles.map((profile) => ({
      id: profile.id,
      status: profile.status,
      rating: profile.rating,
      reviewCount: profile.reviewCount,
      updatedAt: profile.updatedAt,
    })),
    competitors: comparisonCompetitors.map((competitor) => ({
      id: competitor.id,
      profiles: competitor.discoveredProfiles,
      snapshotIds: competitor.snapshots.map((snapshot) => snapshot.id),
    })),
  });
  const competitorComparisonDependencyFingerprint =
    buildCompetitorComparisonDependencyFingerprint({
      businessAuditId: auditId,
      competitors: comparisonCompetitors.map((competitor) => ({
        id: competitor.id,
        profiles: competitor.discoveredProfiles,
        snapshots: competitor.snapshots,
      })),
    });
  const evidenceIntegrityResult = buildAuditEvidenceIntegrity({
    website: websiteAnalysis,
    websiteCrawl,
    seo: seoAnalysis,
    social: socialAnalysis,
    reviews: reviewAnalysis,
    businessContext: effectiveBusinessContext,
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
    competitorComparison: comparison,
    findings: auditResult.findings.map((finding) => ({
      ...finding,
      id: finding.id ?? randomUUID(),
    })),
    recommendations: auditResult.recommendations,
    scoreBreakdowns: auditResult.scoreBreakdowns,
    observedAt: new Date(),
    sourceVersions: {
      website: WEBSITE_ANALYZER_VERSION,
      seo: SEO_ANALYZER_VERSION,
      social: "social-analyzer-v2",
      reviews: "review-analyzer-v2",
      competitors: COMPETITOR_COMPARISON_VERSION,
      scoring: SCORING_ENGINE_VERSION,
    },
  });
  auditResult.findings = evidenceIntegrityResult.findings;
  auditResult.recommendations = evidenceIntegrityResult.recommendations;

  for (const warning of evidenceIntegrityResult.snapshot.validationWarnings) {
    logWarn("audit_evidence_validation_warning", {
      businessId,
      auditId,
      severity: warning.severity,
      code: warning.code,
    });
  }
  const reportSocialStrategy = generateDeterministicSocialStrategy({
    businessName: business.name,
    initialInput: business.initialInput,
    businessContext: effectiveBusinessContext,
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    profiles: business.profiles,
    competitors: business.competitors,
    socialAnalysis,
    reviewAnalysis,
    websiteAnalysis,
    recommendations: auditResult.recommendations.map((recommendation) => ({
      ...recommendation,
      status: "TODO" as const,
    })),
  });
  const scoringMetadata = {
    scoringEngineVersion: SCORING_ENGINE_VERSION,
    reportViewModelVersion: REPORT_VIEW_MODEL_VERSION,
    analyzerVersions: {
      website: WEBSITE_ANALYZER_VERSION,
      seo: SEO_ANALYZER_VERSION,
      social: "social-analyzer-v2",
      reviews: "review-analyzer-v2",
      competitors: COMPETITOR_COMPARISON_VERSION,
    },
    categoryWeights: auditResult.assessment.scoreWeights,
    applicableCategories: auditResult.assessment.applicableCategories,
    pageCoverage: {
      pagesScanned: websiteCrawl?.pagesScanned ?? 0,
      crawlLimit: websiteCrawl?.crawlLimitUsed ?? 0,
      status: websiteCrawl
        ? websiteCrawl.failedPages > 0
          ? "partial"
          : "full"
        : websiteAnalysis
          ? "homepage_only"
          : "not_applicable",
    },
    competitorSnapshotIds: competitorIntelligence.snapshotIds,
    competitorComparisonGeneratedAt: competitorIntelligence.generatedAt,
    googleBusinessStatus: reviewAnalysis.googleBusinessStatus,
    generatedAt: new Date().toISOString(),
  };

  return {
    auditResult,
    businessContextDraft,
    analysisSnapshot: toJsonValue({
      ...(websiteAnalysis
        ? {
            website: websiteAnalysis,
            websiteCrawl,
            seo: seoAnalysis,
          }
        : {}),
      social: socialAnalysis,
      reviews: reviewAnalysis,
      googleBusinessDiscovery,
      competitors: competitorProfileSummary,
      competitorIntelligence,
      reportCompetitorComparison: {
        generatedAt: competitorIntelligence.generatedAt,
        sourceAuditId: auditId,
        dependencyFingerprint: competitorComparisonDependencyFingerprint,
        generatorVersion: COMPETITOR_COMPARISON_VERSION,
        freshnessStatus:
          comparison.analyzedCompetitorCount === 0
            ? "UNAVAILABLE"
            : comparison.staleCompetitorCount > 0 ||
                comparison.failedCompetitorCount > 0
              ? "PARTIAL"
              : "CURRENT",
      },
      reportSocialStrategy: {
        data: reportSocialStrategy,
        generatedAt: new Date().toISOString(),
        sourceAuditId: auditId,
        dependencyFingerprint: socialStrategyDependencyFingerprint,
        generatorVersion: SOCIAL_STRATEGY_GENERATOR_VERSION,
        freshnessStatus: "CURRENT",
      },
      scoringMetadata,
      assessment: auditResult.assessment,
      evidenceIntegrity: evidenceIntegrityResult.snapshot,
    }),
  };
}

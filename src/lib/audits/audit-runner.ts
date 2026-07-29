import "server-only";

import {
  AuditStatus,
  BusinessProfileStatus,
  BusinessStatus,
  CompetitorSnapshotStatus,
  CompetitorStatus,
  FindingSeverity,
  ProfilePlatform,
  ProfileReviewDecision,
  RecommendationPriority,
  ScoreCategory,
  type Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { analyzeReviews } from "@/lib/analyzers/review-analyzer";
import { analyzeSeo } from "@/lib/analyzers/seo-analyzer";
import { analyzeSocialProfiles } from "@/lib/analyzers/social-analyzer";
import {
  crawlWebsite,
  websiteCrawlForAuditSnapshot,
} from "@/lib/analyzers/website-crawler";
import { analyzeWebsite } from "@/lib/analyzers/website-analyzer";
import { generateBusinessContextDraft } from "@/lib/ai/business-context-generator";
import { generateCompetitorIntelligenceSummary } from "@/lib/ai/competitor-intelligence-generator";
import { generateDeterministicSocialStrategy } from "@/lib/ai/social-strategy-generator";
import { generateDeterministicAudit } from "@/lib/audits/deterministic-audit";
import { buildAuditEvidenceIntegrity } from "@/lib/audits/evidence-integrity";
import { runSelectiveAiAuditAnalysis } from "@/lib/audits/selective-ai/selective-ai-audit";
import {
  type AuditProgressStage,
  isAuditProgressStage,
} from "@/lib/audits/audit-progress";
import { approvedBusinessProfilesForAudit } from "@/lib/audits/audit-sources";
import { getUserPlan } from "@/lib/billing/entitlements";
import { getPlanEntitlements } from "@/lib/billing/plans";
import { shouldRefreshGeneratedBusinessContext } from "@/lib/business-context";
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
  progressStage?: AuditProgressStage;
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
      select: { id: true, status: true, progressStage: true },
    });

    if (existingRun) return existingRun;

    return transaction.audit.create({
      data: {
        businessId,
        status: AuditStatus.PENDING,
        progressStage: "PREPARING_BUSINESS_INFORMATION",
      },
      select: { id: true, status: true, progressStage: true },
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
      progressStage: true,
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
      progressStage: "PREPARING_RESULTS",
    };
  }

  if (audit.status === AuditStatus.RUNNING) {
    return {
      auditId,
      status: "running",
      progressStage: isAuditProgressStage(audit.progressStage)
        ? audit.progressStage
        : "PREPARING_BUSINESS_INFORMATION",
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
      progressStage: "PREPARING_BUSINESS_INFORMATION",
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
        progressStage: true,
      },
    });

    return {
      auditId,
      status:
        currentAudit?.status === AuditStatus.COMPLETED
          ? "completed"
          : "running",
      progressStage: isAuditProgressStage(currentAudit?.progressStage)
        ? currentAudit.progressStage
        : "PREPARING_BUSINESS_INFORMATION",
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
          progressStage: "PREPARING_RESULTS",
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
              sourceUrl: finding.sourceUrl,
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
              sourceUrl: recommendation.sourceUrl,
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
      progressStage: "PREPARING_RESULTS",
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
      profileDecisions: true,
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

  await setAuditProgressStage(
    businessId,
    auditId,
    "REVIEWING_CONFIRMED_PROFILES",
  );
  const approvedProfiles = approvedBusinessProfilesForAudit(business.profiles);
  const googleBusinessDecision = business.profileDecisions.find(
    (decision) => decision.platform === ProfilePlatform.GOOGLE_BUSINESS,
  )?.decision;
  const googleDiscoveryIntentionallyDisabled =
    googleBusinessDecision === ProfileReviewDecision.SKIPPED ||
    googleBusinessDecision === ProfileReviewDecision.NOT_USED;

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
  const websiteProfile = approvedProfiles.find(
    (profile) =>
      profile.platform === ProfilePlatform.WEBSITE &&
      Boolean(profile.url),
  );
  await setAuditProgressStage(businessId, auditId, "ANALYZING_WEBSITE");
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
  await setAuditProgressStage(
    businessId,
    auditId,
    "CHECKING_TECHNICAL_ISSUES",
  );
  const seoAnalysis = websiteAnalysis
    ? await analyzeSeo(websiteAnalysis.normalizedUrl, websiteAnalysis)
    : null;
  const businessContextDraft = shouldRefreshGeneratedBusinessContext(business)
    ? await generateBusinessContextDraft({
        businessName: business.name,
        initialInput: business.initialInput,
        websiteAnalysis,
        websiteCrawl,
        profiles: approvedProfiles,
        goals: business.goals,
        primaryGoal: business.primaryGoal,
      })
    : null;
  const effectiveBusinessContext = businessContextDraft
    ? {
        description: businessContextDraft.description,
        targetAudience: businessContextDraft.targetAudience,
        mainOffer: businessContextDraft.mainOffer,
        industry: businessContextDraft.industry,
        businessType: businessContextDraft.businessType,
        primaryConversionGoal: businessContextDraft.primaryConversionGoal,
        brandTone: businessContextDraft.brandTone,
        contextConfidence: businessContextDraft.confidence,
        contextSource: "generated",
        contextConfirmedAt: null,
      }
    : {
        description: business.description,
        targetAudience: business.targetAudience,
        mainOffer: business.mainOffer,
        industry: business.industry,
        businessType: business.businessType,
        primaryConversionGoal: business.primaryConversionGoal,
        brandTone: business.brandTone,
        contextConfidence: business.contextConfidence,
        contextSource: business.contextSource ?? "generated",
        contextConfirmedAt: business.contextConfirmedAt,
      };
  await setAuditProgressStage(
    businessId,
    auditId,
    "REVIEWING_LOCAL_VISIBILITY",
  );
  const googleBusinessDiscovery = googleDiscoveryIntentionallyDisabled
    ? {
        apiConfigured: Boolean(process.env.GOOGLE_PLACES_API_KEY),
        searched: false,
        error: undefined,
        candidatesSaved: 0,
        bestConfidence: null,
        source: "none" as const,
        profileIds: [] as string[],
        detectedAddress: websiteAnalysis?.detectedAddress ?? null,
        detectedPhone: websiteAnalysis?.detectedPhone ?? null,
        detectedGoogleMapsLinks:
          websiteAnalysis?.detectedGoogleMapsLinks ?? [],
        detectedMapEmbeds: websiteAnalysis?.detectedMapEmbeds ?? [],
        detectedLocalBusinessSchemaCount:
          websiteAnalysis?.detectedLocalBusinessSchema.length ?? 0,
      }
    : await discoverGoogleBusinessProfiles({
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
          detectedGoogleMapsLinks:
            websiteAnalysis?.detectedGoogleMapsLinks ?? [],
          detectedMapEmbeds: websiteAnalysis?.detectedMapEmbeds ?? [],
          detectedLocalBusinessSchemaCount:
            websiteAnalysis?.detectedLocalBusinessSchema.length ?? 0,
        };
      });
  const googleBusinessProfiles = await prisma.googleBusinessProfile.findMany({
    where: {
      businessId,
      status: "confirmed",
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
  await setAuditProgressStage(
    businessId,
    auditId,
    "EVALUATING_SOCIAL_PRESENCE",
  );
  const socialAnalysis = analyzeSocialProfiles({
    businessProfiles: approvedProfiles.map((profile) => ({
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
    businessProfiles: approvedProfiles.map((profile) => ({
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
    businessContext: effectiveBusinessContext,
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
  await setAuditProgressStage(
    businessId,
    auditId,
    "COMPARING_COMPETITORS",
  );
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
  await setAuditProgressStage(businessId, auditId, "BUILDING_FINDINGS");
  const auditResult = generateDeterministicAudit({
    businessName: business.name,
    initialInput: business.initialInput,
    profiles: approvedProfiles.map((profile) => ({
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
      description: effectiveBusinessContext.description,
      targetAudience: effectiveBusinessContext.targetAudience,
      mainOffer: effectiveBusinessContext.mainOffer,
      industry: effectiveBusinessContext.industry,
      businessType: effectiveBusinessContext.businessType,
      primaryConversionGoal:
        effectiveBusinessContext.primaryConversionGoal,
      brandTone: effectiveBusinessContext.brandTone,
    },
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    competitorAnalysisAvailable,
  });
  const comparison = compareBusinessToCompetitors({
    business: {
      name: business.name,
      description: effectiveBusinessContext.description,
      targetAudience: effectiveBusinessContext.targetAudience,
      mainOffer: effectiveBusinessContext.mainOffer,
      primaryConversionGoal:
        effectiveBusinessContext.primaryConversionGoal,
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
    confirmedProfiles: approvedProfiles.map((profile) => ({
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
  const socialStrategyDependencyFingerprint = buildSocialStrategyDependencyFingerprint({
    auditId,
    businessContext: effectiveBusinessContext,
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    profiles: approvedProfiles.map((profile) => ({
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
    businessProfiles: approvedProfiles.map((profile) => ({
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
  const selectiveAiResult = await runSelectiveAiAuditAnalysis({
    auditId,
    businessId,
    businessName: business.name,
    planType: plan,
    websiteCrawl,
    businessContext: effectiveBusinessContext,
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    deterministicAudit: auditResult,
    socialEvidence: socialAnalysis,
    reviewEvidence: reviewAnalysis,
    competitorEvidence: competitorIntelligence,
    onProgress: (stage) => setAuditProgressStage(businessId, auditId, stage),
  });
  auditResult.findings.push(
    ...selectiveAiResult.findings.map((finding) => ({
      ...finding,
      evidence: toJsonValue(finding.evidence),
    })),
  );
  auditResult.recommendations.push(
    ...selectiveAiResult.recommendations.map((recommendation) => ({
      ...recommendation,
      evidence: toJsonValue(recommendation.evidence),
    })),
  );
  if (
    selectiveAiResult.snapshot.synthesisSource === "AI_GENERATED" &&
    selectiveAiResult.snapshot.synthesis?.executiveSummary
  ) {
    auditResult.summary =
      selectiveAiResult.snapshot.synthesis.executiveSummary;
  }
  await setAuditProgressStage(
    businessId,
    auditId,
    "PRIORITIZING_RECOMMENDATIONS",
  );
  const reportSocialStrategy = generateDeterministicSocialStrategy({
    businessName: business.name,
    initialInput: business.initialInput,
    businessContext: effectiveBusinessContext,
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    profiles: approvedProfiles,
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
    selectiveAiCoverage: selectiveAiResult.snapshot.coverage,
    selectiveAiStatus: selectiveAiResult.snapshot.status,
    competitorSnapshotIds: competitorIntelligence.snapshotIds,
    competitorComparisonGeneratedAt: competitorIntelligence.generatedAt,
    googleBusinessStatus: reviewAnalysis.googleBusinessStatus,
    generatedAt: new Date().toISOString(),
  };

  await setAuditProgressStage(businessId, auditId, "PREPARING_RESULTS");

  return {
    auditResult,
    businessContextDraft,
    analysisSnapshot: toJsonValue({
      ...(websiteAnalysis
        ? {
            website: websiteAnalysis,
            websiteCrawl: websiteCrawl
              ? websiteCrawlForAuditSnapshot(websiteCrawl)
              : null,
            seo: seoAnalysis,
          }
        : {}),
      aiAssistedAnalysis: selectiveAiResult.snapshot,
      social: socialAnalysis,
      reviews: reviewAnalysis,
      auditSources: {
        includedProfiles: approvedProfiles.map((profile) => ({
          id: profile.id,
          platform: profile.platform,
          source: profile.source,
        })),
        excludedProfiles: {
          pending: business.profiles.filter(
            (profile) => profile.status === BusinessProfileStatus.PENDING,
          ).length,
          removed: business.profiles.filter(
            (profile) => profile.status === BusinessProfileStatus.REMOVED,
          ).length,
        },
        googleBusinessDecision: googleBusinessDecision ?? null,
      },
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

async function setAuditProgressStage(
  businessId: string,
  auditId: string,
  progressStage: AuditProgressStage,
) {
  await prisma.audit.updateMany({
    where: {
      id: auditId,
      businessId,
      status: AuditStatus.RUNNING,
    },
    data: {
      progressStage,
    },
  });
}

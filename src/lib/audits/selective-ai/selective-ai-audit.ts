import "server-only";

import {
  AiOperationType,
  AiUsageStatus,
  type BusinessGoal,
  type PlanType,
} from "@prisma/client";

import { getAuditAiModelRoute } from "@/lib/ai/model-routing";
import { isOpenAIConfigured } from "@/lib/ai/openai-client";
import { requestStructuredAuditAiOutput } from "@/lib/ai/audit-analysis-provider";
import {
  emptyAiTokenUsage,
  estimateOpenAiCostMicros,
} from "@/lib/ai/usage-cost";
import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { DeterministicAuditResult } from "@/lib/audits/deterministic-audit";
import type { AuditProgressStage } from "@/lib/audits/audit-progress";
import { buildPageAnalysisCacheIdentity } from "@/lib/audits/selective-ai/cache-key";
import { consolidateAiAuditInsights } from "@/lib/audits/selective-ai/consolidation";
import {
  AUDIT_SYNTHESIS_PROMPT_VERSION,
  AUDIT_SYNTHESIS_SCHEMA_VERSION,
  PAGE_ANALYSIS_PROMPT_VERSION,
  PAGE_ANALYSIS_SCHEMA_VERSION,
  SELECTIVE_AI_AUDIT_VERSION,
  selectiveAiAuditLimits,
} from "@/lib/audits/selective-ai/config";
import { preparePageAnalysisPayload } from "@/lib/audits/selective-ai/content-preparation";
import {
  deepAnalysisLimitForPageCount,
  PAGE_SELECTION_VERSION,
  selectPagesForAiReview,
} from "@/lib/audits/selective-ai/page-selection";
import {
  deleteInvalidPageAnalysisCache,
  findPageAnalysisCache,
  savePageAnalysisCache,
} from "@/lib/audits/selective-ai/page-analysis-cache";
import {
  auditSynthesisInstructions,
  buildPageAnalysisInput,
  pageAnalysisInstructions,
} from "@/lib/audits/selective-ai/prompts";
import {
  auditSynthesisJsonSchema,
  pageAnalysisJsonSchema,
  parseAuditAiSynthesis,
  parsePageAiAnalysis,
} from "@/lib/audits/selective-ai/schemas";
import {
  buildCompactAuditSynthesisContext,
  serializeCompactSynthesisContext,
} from "@/lib/audits/selective-ai/synthesis-context";
import type {
  AuditAiSynthesis,
  PageSelectionSnapshot,
  SelectedPageAnalysisSnapshot,
  SelectiveAiAuditSnapshot,
  SelectiveAiBusinessContext,
} from "@/lib/audits/selective-ai/types";
import { recordAuditAiUsage } from "@/lib/audits/selective-ai/usage-telemetry";
import { AI_MODEL_ROUTING_VERSION } from "@/lib/ai/model-routing";
import { isAiAssistedAuditsEnabled } from "@/lib/features/feature-flags";
import { logError, logInfo, logWarn } from "@/lib/observability/log";

export type SelectiveAiAuditDependencies = {
  requestStructuredOutput: typeof requestStructuredAuditAiOutput;
  findCache: typeof findPageAnalysisCache;
  saveCache: typeof savePageAnalysisCache;
  deleteInvalidCache: typeof deleteInvalidPageAnalysisCache;
  recordUsage: typeof recordAuditAiUsage;
};

const defaultDependencies: SelectiveAiAuditDependencies = {
  requestStructuredOutput: requestStructuredAuditAiOutput,
  findCache: findPageAnalysisCache,
  saveCache: savePageAnalysisCache,
  deleteInvalidCache: deleteInvalidPageAnalysisCache,
  recordUsage: recordAuditAiUsage,
};

export async function runSelectiveAiAuditAnalysis({
  auditId,
  businessId,
  businessName,
  planType,
  websiteCrawl,
  businessContext,
  goals,
  primaryGoal,
  deterministicAudit,
  socialEvidence,
  reviewEvidence,
  competitorEvidence,
  onProgress,
  enabled = isAiAssistedAuditsEnabled(),
  openAiConfigured = isOpenAIConfigured(),
  dependencies = defaultDependencies,
}: {
  auditId: string;
  businessId: string;
  businessName: string;
  planType: PlanType;
  websiteCrawl: WebsiteCrawlResult | null;
  businessContext: SelectiveAiBusinessContext;
  goals: BusinessGoal[];
  primaryGoal: BusinessGoal | null;
  deterministicAudit: DeterministicAuditResult;
  socialEvidence: unknown;
  reviewEvidence: unknown;
  competitorEvidence: unknown;
  onProgress?: (stage: AuditProgressStage) => Promise<void>;
  enabled?: boolean;
  openAiConfigured?: boolean;
  dependencies?: SelectiveAiAuditDependencies;
}) {
  const generatedAt = new Date().toISOString();
  if (!websiteCrawl) {
    return emptyResult(
      baseSnapshot({
        enabled,
        status: "NOT_APPLICABLE",
        generatedAt,
        pages: [],
        eligiblePages: 0,
        limitations: [
          "No confirmed website crawl was available. The deterministic social-first audit remained active.",
        ],
      }),
    );
  }

  await onProgress?.("SELECTING_IMPORTANT_PAGES");
  const selection = selectPagesForAiReview({
    crawl: websiteCrawl,
    goals,
    primaryGoal,
  });

  if (!enabled) {
    return emptyResult(
      baseSnapshot({
        enabled: false,
        status: "DISABLED",
        generatedAt,
        pages: disableSelections(selection.pages),
        eligiblePages: selection.eligiblePages,
        limitations: [
          "Selective AI page review was disabled. Every crawled page still received deterministic analysis.",
        ],
      }),
    );
  }

  if (!openAiConfigured) {
    return emptyResult(
      baseSnapshot({
        enabled: true,
        status: "UNAVAILABLE",
        generatedAt,
        pages: failedSelections(selection.pages),
        eligiblePages: selection.eligiblePages,
        limitations: [
          "The AI review provider was unavailable. The saved audit contains deterministic analysis only.",
        ],
      }),
    );
  }

  if (selection.selectedPages.length === 0) {
    return emptyResult(
      baseSnapshot({
        enabled: true,
        status: "NOT_APPLICABLE",
        generatedAt,
        pages: selection.pages,
        eligiblePages: selection.eligiblePages,
        limitations: [
          "No successfully crawled business-facing pages were eligible for deep AI review.",
        ],
      }),
    );
  }

  await onProgress?.("REVIEWING_KEY_PAGES");
  const pageRoute = getAuditAiModelRoute("PAGE_ANALYSIS");
  const pageReviewStartedAt = Date.now();
  const outcomes = await mapWithConcurrency(
    selection.selectedPages,
    selectiveAiAuditLimits.maximumConcurrentPageRequests,
    async (page) => {
      try {
        if (
          Date.now() - pageReviewStartedAt >
          selectiveAiAuditLimits.maximumPageReviewBudgetMs
        ) {
          return {
            url: page.url,
            status: "FAILED" as const,
            reason: "PAGE_REVIEW_TIME_BUDGET",
            cacheHit: false,
            cacheMiss: false,
            contentTruncated: false,
            cacheId: null,
            analysis: null,
          };
        }

        const payload = preparePageAnalysisPayload({
          page,
          businessContext,
          goals,
          primaryGoal,
        });
        const identity = buildPageAnalysisCacheIdentity({
          businessId,
          page,
          payload,
          route: pageRoute,
        });
        const cacheStartedAt = Date.now();
        let cached = null;
        try {
          cached = await dependencies.findCache({
            businessId,
            cacheKey: identity.cacheKey,
          });
        } catch (error) {
          logError("audit_page_analysis_cache_read_failed", error, {
            auditId,
            businessId,
            pageUrl: page.url,
          });
        }

        if (cached) {
          const cachedAnalysis = parsePageAiAnalysis({
            value: cached.analysis,
            payload,
          });
          if (cachedAnalysis) {
            await dependencies.recordUsage({
              auditId,
              businessId,
              pageAnalysisCacheId: cached.id,
              operationType: AiOperationType.PAGE_ANALYSIS,
              pageUrl: page.url,
              modelRoute: identity.modelRoute,
              model: identity.model,
              usage: emptyAiTokenUsage(),
              estimatedCostMicros: 0,
              latencyMs: Date.now() - cacheStartedAt,
              retryCount: 0,
              status: AiUsageStatus.CACHE_HIT,
              cacheHit: true,
              promptVersion: PAGE_ANALYSIS_PROMPT_VERSION,
              planType,
              auditProduct: planType,
            });
            return {
              url: page.url,
              status: "COMPLETED" as const,
              reason: null,
              cacheHit: true,
              cacheMiss: false,
              contentTruncated: payload.contentTruncated,
              cacheId: cached.id,
              analysis: cachedAnalysis,
            };
          }

          logWarn("audit_page_analysis_cache_invalid", {
            businessId,
            cacheId: cached.id,
          });
          try {
            await dependencies.deleteInvalidCache({
              businessId,
              cacheId: cached.id,
            });
          } catch (error) {
            logError("audit_page_analysis_cache_cleanup_failed", error, {
              auditId,
              businessId,
              cacheId: cached.id,
            });
          }
        }

        const providerResult = await dependencies.requestStructuredOutput({
          route: pageRoute,
          operation: "PAGE_ANALYSIS",
          instructions: pageAnalysisInstructions,
          input: buildPageAnalysisInput(payload),
          schemaName: "audit_page_analysis",
          schema: pageAnalysisJsonSchema,
          validate: (value) => parsePageAiAnalysis({ value, payload }),
        });
        const estimatedCostMicros = estimateOpenAiCostMicros(
          pageRoute.model,
          providerResult.usage,
        );
        let cacheId: string | null = null;
        let finalAnalysis = providerResult.value;

        if (providerResult.status === "SUCCEEDED" && finalAnalysis) {
          try {
            const saved = await dependencies.saveCache({
              businessId,
              identity,
              analysis: finalAnalysis,
              usage: providerResult.usage,
              estimatedCostMicros,
              latencyMs: providerResult.latencyMs,
              retryCount: providerResult.retryCount,
              providerRequestId: providerResult.providerRequestId,
              contentTruncated: payload.contentTruncated,
            });
            cacheId = saved.id;
            const savedAnalysis = parsePageAiAnalysis({
              value: saved.analysis,
              payload,
            });
            if (savedAnalysis) finalAnalysis = savedAnalysis;
          } catch (error) {
            logError("audit_page_analysis_cache_unavailable", error, {
              auditId,
              businessId,
              pageUrl: page.url,
            });
          }
        }

        await dependencies.recordUsage({
          auditId,
          businessId,
          pageAnalysisCacheId: cacheId,
          operationType: AiOperationType.PAGE_ANALYSIS,
          pageUrl: page.url,
          modelRoute: identity.modelRoute,
          model: identity.model,
          usage: providerResult.usage,
          estimatedCostMicros,
          latencyMs: providerResult.latencyMs,
          retryCount: providerResult.retryCount,
          status:
            providerResult.status === "SUCCEEDED"
              ? AiUsageStatus.SUCCEEDED
              : providerResult.status === "VALIDATION_REJECTED"
                ? AiUsageStatus.VALIDATION_REJECTED
                : AiUsageStatus.FAILED,
          cacheHit: false,
          promptVersion: PAGE_ANALYSIS_PROMPT_VERSION,
          providerRequestId: providerResult.providerRequestId,
          failureCode: providerResult.failureCode,
          planType,
          auditProduct: planType,
        });

        return {
          url: page.url,
          status:
            providerResult.status === "SUCCEEDED" && finalAnalysis
              ? ("COMPLETED" as const)
              : ("FAILED" as const),
          reason: providerResult.failureCode,
          cacheHit: false,
          cacheMiss: true,
          contentTruncated: payload.contentTruncated,
          cacheId,
          analysis: finalAnalysis,
        };
      } catch (error) {
        logError("audit_page_ai_review_failed", error, {
          auditId,
          businessId,
          pageUrl: page.url,
          modelRoute: pageRoute.route,
        });
        try {
          await dependencies.recordUsage({
            auditId,
            businessId,
            operationType: AiOperationType.PAGE_ANALYSIS,
            pageUrl: page.url,
            modelRoute: `${pageRoute.route}:${pageRoute.routeVersion}`,
            model: pageRoute.model,
            usage: emptyAiTokenUsage(),
            estimatedCostMicros: null,
            latencyMs: Date.now() - pageReviewStartedAt,
            retryCount: 0,
            status: AiUsageStatus.FAILED,
            cacheHit: false,
            promptVersion: PAGE_ANALYSIS_PROMPT_VERSION,
            failureCode: "PAGE_REVIEW_INTERNAL_FAILURE",
            planType,
            auditProduct: planType,
          });
        } catch {
          // Usage telemetry must not make a deterministic audit fail.
        }
        return {
          url: page.url,
          status: "FAILED" as const,
          reason: "PAGE_REVIEW_INTERNAL_FAILURE",
          cacheHit: false,
          cacheMiss: false,
          contentTruncated: false,
          cacheId: null,
          analysis: null,
        };
      }
    },
  );

  const pages = applyPageOutcomes(selection.pages, outcomes);
  const selectedPageAnalyses = outcomes
    .filter(
      (
        outcome,
      ): outcome is typeof outcome & {
        status: "COMPLETED";
        analysis: NonNullable<typeof outcome.analysis>;
      } => outcome.status === "COMPLETED" && Boolean(outcome.analysis),
    )
    .map<SelectedPageAnalysisSnapshot>((outcome) => {
      const page = pages.find((item) => item.url === outcome.url)!;
      return {
        url: outcome.url,
        canonicalUrl: page.canonicalUrl,
        pageType: page.pageType,
        analysisCacheId: outcome.cacheId,
        cacheHit: outcome.cacheHit,
        contentTruncated: outcome.contentTruncated,
        analysis: outcome.analysis,
      };
    });
  const failedPageReviews = outcomes.filter(
    (outcome) => outcome.status === "FAILED",
  );
  const limitations = coverageLimitations({
    websiteCrawl,
    selectedPageAnalyses,
    failedPageReviews: failedPageReviews.length,
  });

  await onProgress?.("CONSOLIDATING_FINDINGS");
  const synthesisResult = await runSynthesis({
    auditId,
    businessId,
    businessName,
    planType,
    businessContext,
    goals,
    primaryGoal,
    deterministicAudit,
    pages,
    selectedPageAnalyses,
    socialEvidence,
    reviewEvidence,
    competitorEvidence,
    limitations,
    dependencies,
  });
  const synthesis =
    synthesisResult.synthesis ??
    buildDeterministicSynthesisFallback({
      deterministicAudit,
      selectedPageAnalyses,
      limitations,
    });
  const synthesisSource = synthesisResult.synthesis
    ? ("AI_GENERATED" as const)
    : ("DETERMINISTIC_FALLBACK" as const);
  const consolidated = consolidateAiAuditInsights({
    selectedPageAnalyses,
    deterministicFindings: deterministicAudit.findings,
    synthesis,
  });
  const snapshot = buildCompletedSnapshot({
    generatedAt,
    selectionPages: pages,
    eligiblePages: selection.eligiblePages,
    selectedPageAnalyses,
    synthesis,
    synthesisSource,
    limitations,
    synthesisFailed: !synthesisResult.synthesis,
  });

  logInfo("audit_ai_selective_analysis_completed", {
    auditId,
    businessId,
    pagesChecked: snapshot.coverage.pagesCheckedTechnically,
    pagesSelected: snapshot.coverage.selectedPages,
    pagesReviewed: snapshot.coverage.deepReviewedPages,
    cacheHits: snapshot.coverage.cacheHits,
    status: snapshot.status,
  });

  return {
    snapshot,
    findings: consolidated.findings,
    recommendations: consolidated.recommendations,
  };
}

async function runSynthesis({
  auditId,
  businessId,
  businessName,
  planType,
  businessContext,
  goals,
  primaryGoal,
  deterministicAudit,
  pages,
  selectedPageAnalyses,
  socialEvidence,
  reviewEvidence,
  competitorEvidence,
  limitations,
  dependencies,
}: {
  auditId: string;
  businessId: string;
  businessName: string;
  planType: PlanType;
  businessContext: SelectiveAiBusinessContext;
  goals: BusinessGoal[];
  primaryGoal: BusinessGoal | null;
  deterministicAudit: DeterministicAuditResult;
  pages: PageSelectionSnapshot[];
  selectedPageAnalyses: SelectedPageAnalysisSnapshot[];
  socialEvidence: unknown;
  reviewEvidence: unknown;
  competitorEvidence: unknown;
  limitations: string[];
  dependencies: SelectiveAiAuditDependencies;
}) {
  if (selectedPageAnalyses.length === 0) {
    return { synthesis: null };
  }

  const route = getAuditAiModelRoute("AUDIT_SYNTHESIS");
  const context = buildCompactAuditSynthesisContext({
    businessName,
    businessContext,
    goals,
    primaryGoal,
    overallScore: deterministicAudit.overallScore,
    scores: deterministicAudit.scores,
    findings: deterministicAudit.findings,
    recommendations: deterministicAudit.recommendations,
    pages,
    selectedPageAnalyses,
    social: socialEvidence,
    reviews: reviewEvidence,
    competitors: competitorEvidence,
    limitations,
  });
  const opportunityIds = context.selectedPageReviews.flatMap((page) =>
    page.opportunities.map((item) => item.id),
  );
  const startedAt = Date.now();

  try {
    const result = await dependencies.requestStructuredOutput({
      route,
      operation: "AUDIT_SYNTHESIS",
      instructions: auditSynthesisInstructions,
      input: `<compact_audit_evidence>\n${serializeCompactSynthesisContext(
        context,
      )}\n</compact_audit_evidence>`,
      schemaName: "audit_synthesis",
      schema: auditSynthesisJsonSchema,
      validate: (value) =>
        parseAuditAiSynthesis({
          value,
          opportunityIds,
          selectedPageUrls: selectedPageAnalyses.map((page) => page.url),
        }),
    });
    const estimatedCostMicros = estimateOpenAiCostMicros(
      route.model,
      result.usage,
    );
    await dependencies.recordUsage({
      auditId,
      businessId,
      operationType: AiOperationType.AUDIT_SYNTHESIS,
      modelRoute: `${route.route}:${route.routeVersion}`,
      model: route.model,
      usage: result.usage,
      estimatedCostMicros,
      latencyMs: result.latencyMs,
      retryCount: result.retryCount,
      status:
        result.status === "SUCCEEDED"
          ? AiUsageStatus.SUCCEEDED
          : result.status === "VALIDATION_REJECTED"
            ? AiUsageStatus.VALIDATION_REJECTED
            : AiUsageStatus.FAILED,
      cacheHit: false,
      promptVersion: AUDIT_SYNTHESIS_PROMPT_VERSION,
      providerRequestId: result.providerRequestId,
      failureCode: result.failureCode,
      planType,
      auditProduct: planType,
    });

    return { synthesis: result.value };
  } catch (error) {
    logError("audit_ai_synthesis_failed", error, {
      auditId,
      businessId,
      modelRoute: route.route,
    });
    try {
      await dependencies.recordUsage({
        auditId,
        businessId,
        operationType: AiOperationType.AUDIT_SYNTHESIS,
        modelRoute: `${route.route}:${route.routeVersion}`,
        model: route.model,
        usage: emptyAiTokenUsage(),
        estimatedCostMicros: null,
        latencyMs: Date.now() - startedAt,
        retryCount: 0,
        status: AiUsageStatus.FAILED,
        cacheHit: false,
        promptVersion: AUDIT_SYNTHESIS_PROMPT_VERSION,
        failureCode: "SYNTHESIS_INTERNAL_FAILURE",
        planType,
        auditProduct: planType,
      });
    } catch {
      // Usage telemetry must not make a deterministic audit fail.
    }
    return { synthesis: null };
  }
}

function buildDeterministicSynthesisFallback({
  deterministicAudit,
  selectedPageAnalyses,
  limitations,
}: {
  deterministicAudit: DeterministicAuditResult;
  selectedPageAnalyses: SelectedPageAnalysisSnapshot[];
  limitations: string[];
}): AuditAiSynthesis {
  const opportunities = selectedPageAnalyses
    .flatMap((page) => page.analysis.opportunities)
    .sort(
      (left, right) =>
        priorityWeight(right.priority) - priorityWeight(left.priority),
    );
  return {
    executiveSummary: deterministicAudit.summary,
    strengths: selectedPageAnalyses
      .flatMap((page) =>
        page.analysis.strengths.map((strength) => ({
          title: strength.title,
          evidenceReferences: [page.url],
          confidence: strength.confidence,
        })),
      )
      .slice(0, 5),
    highestPriorityProblems: opportunities.slice(0, 3).map((item) => ({
      opportunityId: item.id,
      rationale: item.businessImpact,
      expectedImpact: item.businessImpact,
      confidence: item.confidence,
    })),
    quickWins: opportunities
      .filter((item) => /headline|cta|copy|label|description/i.test(item.recommendation))
      .slice(0, 3)
      .map((item) => ({
        opportunityId: item.id,
        rationale: item.recommendation,
      })),
    largerStrategicImprovements: opportunities
      .filter((item) => /navigation|structure|service|trust/i.test(item.recommendation))
      .slice(0, 3)
      .map((item) => ({
        opportunityId: item.id,
        rationale: item.recommendation,
      })),
    recommendedOrder: opportunities.slice(0, 6).map((item, index) => ({
      step: index + 1,
      opportunityId: item.id,
      rationale: item.recommendation,
      expectedImpact: item.businessImpact,
    })),
    sourceLimitations: unique([
      ...limitations,
      "Final prioritization used a deterministic fallback because AI synthesis was unavailable or invalid.",
    ]),
  };
}

function buildCompletedSnapshot({
  generatedAt,
  selectionPages,
  eligiblePages,
  selectedPageAnalyses,
  synthesis,
  synthesisSource,
  limitations,
  synthesisFailed,
}: {
  generatedAt: string;
  selectionPages: PageSelectionSnapshot[];
  eligiblePages: number;
  selectedPageAnalyses: SelectedPageAnalysisSnapshot[];
  synthesis: AuditAiSynthesis;
  synthesisSource: SelectiveAiAuditSnapshot["synthesisSource"];
  limitations: string[];
  synthesisFailed: boolean;
}): SelectiveAiAuditSnapshot {
  const failedAiPages = selectionPages.filter(
    (page) => page.aiReviewStatus === "FAILED",
  ).length;
  const cacheHits = selectionPages.filter(
    (page) => page.cacheStatus === "HIT",
  ).length;
  const cacheMisses = selectionPages.filter(
    (page) => page.cacheStatus === "MISS",
  ).length;
  return {
    version: SELECTIVE_AI_AUDIT_VERSION,
    enabled: true,
    status:
      failedAiPages > 0 || synthesisFailed || selectedPageAnalyses.length === 0
        ? "PARTIAL"
        : "COMPLETED",
    generatedAt,
    selectorVersion: PAGE_SELECTION_VERSION,
    pageAnalysisPromptVersion: PAGE_ANALYSIS_PROMPT_VERSION,
    pageAnalysisSchemaVersion: PAGE_ANALYSIS_SCHEMA_VERSION,
    synthesisPromptVersion: AUDIT_SYNTHESIS_PROMPT_VERSION,
    synthesisSchemaVersion: AUDIT_SYNTHESIS_SCHEMA_VERSION,
    modelRoutingVersion: AI_MODEL_ROUTING_VERSION,
    coverage: coverageForPages({
      pages: selectionPages,
      eligiblePages,
      limitations,
      cacheHits,
      cacheMisses,
    }),
    pages: selectionPages,
    selectedPageAnalyses,
    synthesis,
    synthesisSource,
  };
}

function baseSnapshot({
  enabled,
  status,
  generatedAt,
  pages,
  eligiblePages,
  limitations,
}: {
  enabled: boolean;
  status: SelectiveAiAuditSnapshot["status"];
  generatedAt: string;
  pages: PageSelectionSnapshot[];
  eligiblePages: number;
  limitations: string[];
}): SelectiveAiAuditSnapshot {
  return {
    version: SELECTIVE_AI_AUDIT_VERSION,
    enabled,
    status,
    generatedAt,
    selectorVersion: PAGE_SELECTION_VERSION,
    pageAnalysisPromptVersion: PAGE_ANALYSIS_PROMPT_VERSION,
    pageAnalysisSchemaVersion: PAGE_ANALYSIS_SCHEMA_VERSION,
    synthesisPromptVersion: AUDIT_SYNTHESIS_PROMPT_VERSION,
    synthesisSchemaVersion: AUDIT_SYNTHESIS_SCHEMA_VERSION,
    modelRoutingVersion: AI_MODEL_ROUTING_VERSION,
    coverage: coverageForPages({
      pages,
      eligiblePages,
      limitations,
      cacheHits: 0,
      cacheMisses: 0,
    }),
    pages,
    selectedPageAnalyses: [],
    synthesis: null,
    synthesisSource: "NOT_RUN",
  };
}

function coverageForPages({
  pages,
  eligiblePages,
  limitations,
  cacheHits,
  cacheMisses,
}: {
  pages: PageSelectionSnapshot[];
  eligiblePages: number;
  limitations: string[];
  cacheHits: number;
  cacheMisses: number;
}) {
  const denominator = cacheHits + cacheMisses;
  return {
    pagesCheckedTechnically: pages.length,
    eligiblePages,
    selectedPages: pages.filter((page) => page.selected).length,
    deepReviewedPages: pages.filter(
      (page) => page.analysisCoverage === "DEEP_AI_REVIEWED",
    ).length,
    deterministicOnlyPages: pages.filter(
      (page) => page.analysisCoverage === "DETERMINISTIC_ONLY",
    ).length,
    excludedUtilityPages: pages.filter(
      (page) => page.analysisCoverage === "EXCLUDED_UTILITY_PAGE",
    ).length,
    duplicateRepresentatives: pages.filter(
      (page) => page.analysisCoverage === "DUPLICATE_REPRESENTATIVE",
    ).length,
    crawlFailedPages: pages.filter(
      (page) => page.analysisCoverage === "CRAWL_FAILED",
    ).length,
    failedAiPages: pages.filter(
      (page) => page.aiReviewStatus === "FAILED",
    ).length,
    truncatedPages: pages.filter((page) => page.contentTruncated).length,
    cacheHits,
    cacheMisses,
    cacheHitRate:
      denominator === 0 ? 0 : Math.round((cacheHits / denominator) * 100),
    limitations: unique(limitations),
  };
}

function applyPageOutcomes<
  T extends {
    url: string;
    status: "COMPLETED" | "FAILED";
    cacheHit: boolean;
    cacheMiss: boolean;
    contentTruncated: boolean;
    cacheId: string | null;
  },
>(pages: PageSelectionSnapshot[], outcomes: T[]) {
  const byUrl = new Map(outcomes.map((outcome) => [outcome.url, outcome]));
  return pages.map((page) => {
    const outcome = byUrl.get(page.url);
    if (!outcome) return page;
    const completed = outcome.status === "COMPLETED";
    return {
      ...page,
      analysisCoverage: completed
        ? ("DEEP_AI_REVIEWED" as const)
        : ("DETERMINISTIC_ONLY" as const),
      aiReviewStatus: completed
        ? outcome.cacheHit
          ? ("CACHE_HIT" as const)
          : ("COMPLETED" as const)
        : ("FAILED" as const),
      cacheStatus: outcome.cacheHit
        ? ("HIT" as const)
        : outcome.cacheMiss
          ? ("MISS" as const)
          : page.cacheStatus,
      analysisCacheId: outcome.cacheId,
      contentTruncated: outcome.contentTruncated,
    };
  });
}

function coverageLimitations({
  websiteCrawl,
  selectedPageAnalyses,
  failedPageReviews,
}: {
  websiteCrawl: WebsiteCrawlResult;
  selectedPageAnalyses: SelectedPageAnalysisSnapshot[];
  failedPageReviews: number;
}) {
  return unique([
    ...websiteCrawl.warnings,
    websiteCrawl.failedPages > 0
      ? `${websiteCrawl.failedPages} crawled page(s) could not be analyzed technically.`
      : "",
    failedPageReviews > 0
      ? `${failedPageReviews} selected page(s) could not complete deep AI review; deterministic evidence remains available.`
      : "",
    selectedPageAnalyses.some((page) => page.contentTruncated)
      ? "Some selected pages exceeded the page-content limit. Their saved analyses disclose truncation."
      : "",
    "AI review used extracted text and structured crawler evidence only. No screenshots, private analytics, or JavaScript-rendered content were analyzed.",
  ]);
}

function disableSelections(pages: PageSelectionSnapshot[]) {
  return pages.map((page) => ({
    ...page,
    selected: false,
    selectionReasons: page.selected
      ? [...page.selectionReasons, "AI assistance disabled"]
      : page.selectionReasons,
    aiReviewStatus: "NOT_SELECTED" as const,
    cacheStatus: "NOT_APPLICABLE" as const,
  }));
}

function failedSelections(pages: PageSelectionSnapshot[]) {
  return pages.map((page) =>
    page.selected
      ? {
          ...page,
          analysisCoverage: "DETERMINISTIC_ONLY" as const,
          aiReviewStatus: "FAILED" as const,
          cacheStatus: "NOT_APPLICABLE" as const,
        }
      : page,
  );
}

function emptyResult(snapshot: SelectiveAiAuditSnapshot) {
  return {
    snapshot,
    findings: [],
    recommendations: [],
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await task(values[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function priorityWeight(value: "HIGH" | "MEDIUM" | "LOW") {
  return value === "HIGH" ? 3 : value === "MEDIUM" ? 2 : 1;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export { deepAnalysisLimitForPageCount };

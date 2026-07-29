import assert from "node:assert/strict";
import test from "node:test";

import {
  AiOperationType,
  BusinessGoal,
  FindingSeverity,
  PlanType,
  RecommendationPriority,
  ScoreCategory,
  type PageAnalysisCache,
} from "@prisma/client";

import { getAuditAiModelRoute } from "@/lib/ai/model-routing";
import { emptyAiTokenUsage } from "@/lib/ai/usage-cost";
import type { DeterministicAuditResult } from "@/lib/audits/deterministic-audit";
import {
  evaluationCrawl,
} from "@/lib/audits/selective-ai/__fixtures__/evaluation-pages";
import { buildPageAnalysisCacheIdentity } from "@/lib/audits/selective-ai/cache-key";
import { preparePageAnalysisPayload } from "@/lib/audits/selective-ai/content-preparation";
import {
  runSelectiveAiAuditAnalysis,
  type SelectiveAiAuditDependencies,
} from "@/lib/audits/selective-ai/selective-ai-audit";

const businessContext = {
  description: "A growth consultancy.",
  targetAudience: "Small business owners",
  mainOffer: "Growth assessments",
  industry: "Consulting",
  businessType: "Service",
  primaryConversionGoal: "Request a consultation",
  brandTone: "Direct",
};

test("cache identity is tenant-scoped and invalidates on content, prompt, schema, and route changes", () => {
  const page = evaluationCrawl(1).pageResults[0]!;
  const payload = preparePageAnalysisPayload({
    page,
    businessContext,
    goals: [BusinessGoal.MORE_LEADS],
    primaryGoal: BusinessGoal.MORE_LEADS,
  });
  const route = getAuditAiModelRoute("PAGE_ANALYSIS", {
    OPENAI_AUDIT_PAGE_MODEL: "gpt-5.4-mini",
  });
  const base = buildPageAnalysisCacheIdentity({
    businessId: "business-a",
    page,
    payload,
    route,
  });
  const otherTenant = buildPageAnalysisCacheIdentity({
    businessId: "business-b",
    page,
    payload,
    route,
  });
  const changedPage = {
    ...page,
    contentHash: "changed-content-hash",
  };
  const changedContent = buildPageAnalysisCacheIdentity({
    businessId: "business-a",
    page: changedPage,
    payload: {
      ...payload,
      primaryVisibleContent: `${payload.primaryVisibleContent} Updated.`,
    },
    route,
  });
  const changedPrompt = buildPageAnalysisCacheIdentity({
    businessId: "business-a",
    page,
    payload,
    route,
    versions: { promptVersion: "audit-page-analysis-prompt-v2" },
  });
  const changedSchema = buildPageAnalysisCacheIdentity({
    businessId: "business-a",
    page,
    payload,
    route,
    versions: { schemaVersion: "audit-page-analysis-schema-v2" },
  });
  const changedRoute = buildPageAnalysisCacheIdentity({
    businessId: "business-a",
    page,
    payload,
    route: { ...route, routeVersion: `${route.routeVersion}-changed` },
  });

  assert.notEqual(base.cacheKey, otherTenant.cacheKey);
  assert.notEqual(base.cacheKey, changedContent.cacheKey);
  assert.notEqual(base.cacheKey, changedPrompt.cacheKey);
  assert.notEqual(base.cacheKey, changedSchema.cacheKey);
  assert.notEqual(base.cacheKey, changedRoute.cacheKey);
});

test("AI-disabled audits make no provider calls and preserve deterministic scoring", async () => {
  let calls = 0;
  const dependencies = inMemoryDependencies({
    onProviderRequest: () => {
      calls += 1;
    },
  });
  const deterministicAudit = deterministicAuditFixture();
  const originalScore = deterministicAudit.overallScore;
  const result = await runSelectiveAiAuditAnalysis({
    ...baseRunInput(deterministicAudit, evaluationCrawl(5)),
    enabled: false,
    openAiConfigured: true,
    dependencies,
  });

  assert.equal(calls, 0);
  assert.equal(result.snapshot.status, "DISABLED");
  assert.equal(deterministicAudit.overallScore, originalScore);
  assert.equal(result.findings.length, 0);
});

test("unchanged audits reuse page analysis and only rerun synthesis", async () => {
  const requestCounts = { page: 0, synthesis: 0 };
  const dependencies = inMemoryDependencies({
    onProviderRequest: (operation) => {
      if (operation === "PAGE_ANALYSIS") requestCounts.page += 1;
      else requestCounts.synthesis += 1;
    },
  });
  const crawl = evaluationCrawl(3);
  const first = await runSelectiveAiAuditAnalysis({
    ...baseRunInput(deterministicAuditFixture(), crawl),
    enabled: true,
    openAiConfigured: true,
    dependencies,
  });
  const firstPageCalls = requestCounts.page;
  const firstSynthesisCalls = requestCounts.synthesis;
  const second = await runSelectiveAiAuditAnalysis({
    ...baseRunInput(deterministicAuditFixture(), crawl, "audit-2"),
    enabled: true,
    openAiConfigured: true,
    dependencies,
  });

  assert.equal(firstPageCalls, 3);
  assert.equal(firstSynthesisCalls, 1);
  assert.equal(requestCounts.page, firstPageCalls);
  assert.equal(requestCounts.synthesis, firstSynthesisCalls + 1);
  assert.equal(first.snapshot.coverage.cacheHits, 0);
  assert.equal(second.snapshot.coverage.cacheHits, 3);
  assert.equal(second.snapshot.coverage.cacheHitRate, 100);
});

test("a partially changed audit only reanalyzes the changed selected page", async () => {
  let pageCalls = 0;
  const dependencies = inMemoryDependencies({
    onProviderRequest: (operation) => {
      if (operation === "PAGE_ANALYSIS") pageCalls += 1;
    },
  });
  const original = evaluationCrawl(3);
  await runSelectiveAiAuditAnalysis({
    ...baseRunInput(deterministicAuditFixture(), original),
    enabled: true,
    openAiConfigured: true,
    dependencies,
  });
  const changed = evaluationCrawl(3);
  changed.pageResults[1] = {
    ...changed.pageResults[1]!,
    analysisContent:
      "A revised service explanation for a different customer need. Get started today.",
    contentHash: "revised-service-content",
  };
  const initialCalls = pageCalls;
  const rerun = await runSelectiveAiAuditAnalysis({
    ...baseRunInput(deterministicAuditFixture(), changed, "audit-2"),
    enabled: true,
    openAiConfigured: true,
    dependencies,
  });

  assert.equal(pageCalls - initialCalls, 1);
  assert.equal(rerun.snapshot.coverage.cacheHits, 2);
  assert.equal(rerun.snapshot.coverage.cacheMisses, 1);
});

test("an audit with no eligible pages stays deterministic and makes no provider calls", async () => {
  let providerCalls = 0;
  const dependencies = inMemoryDependencies({
    onProviderRequest: () => {
      providerCalls += 1;
    },
  });
  const crawl = evaluationCrawl(3);
  crawl.pageResults = crawl.pageResults.map((page) => ({
    ...page,
    statusCode: null,
    analysisStatus: "FAILED" as const,
  }));
  crawl.successfulPages = 0;
  crawl.failedPages = crawl.pageResults.length;

  const result = await runSelectiveAiAuditAnalysis({
    ...baseRunInput(deterministicAuditFixture(), crawl),
    enabled: true,
    openAiConfigured: true,
    dependencies,
  });

  assert.equal(providerCalls, 0);
  assert.equal(result.snapshot.status, "NOT_APPLICABLE");
  assert.equal(result.snapshot.coverage.deepReviewedPages, 0);
  assert.equal(result.snapshot.coverage.crawlFailedPages, 3);
  assert.equal(result.findings.length, 0);
});

test("an audit where every selected page changed reanalyzes every selected page", async () => {
  let pageCalls = 0;
  const dependencies = inMemoryDependencies({
    onProviderRequest: (operation) => {
      if (operation === "PAGE_ANALYSIS") pageCalls += 1;
    },
  });
  const original = evaluationCrawl(3);
  await runSelectiveAiAuditAnalysis({
    ...baseRunInput(deterministicAuditFixture(), original),
    enabled: true,
    openAiConfigured: true,
    dependencies,
  });

  const changed = evaluationCrawl(3);
  changed.pageResults = changed.pageResults.map((page, index) => ({
    ...page,
    analysisContent: `${page.analysisContent} Revision ${index + 1}.`,
    contentHash: `changed-content-${index + 1}`,
  }));
  const initialCalls = pageCalls;
  const rerun = await runSelectiveAiAuditAnalysis({
    ...baseRunInput(deterministicAuditFixture(), changed, "audit-2"),
    enabled: true,
    openAiConfigured: true,
    dependencies,
  });

  assert.equal(pageCalls - initialCalls, 3);
  assert.equal(rerun.snapshot.coverage.cacheHits, 0);
  assert.equal(rerun.snapshot.coverage.cacheMisses, 3);
  assert.equal(rerun.snapshot.coverage.deepReviewedPages, 3);
});

test("one page provider failure yields partial coverage without changing scores", async () => {
  const deterministicAudit = deterministicAuditFixture();
  const originalScore = deterministicAudit.overallScore;
  const usage: Array<{ operationType: AiOperationType; status: string }> = [];
  const dependencies = inMemoryDependencies({
    failPagePath: "/pricing",
    onUsage: (record) => {
      usage.push({
        operationType: record.operationType,
        status: record.status,
      });
    },
  });
  const result = await runSelectiveAiAuditAnalysis({
    ...baseRunInput(deterministicAudit, evaluationCrawl(3)),
    enabled: true,
    openAiConfigured: true,
    dependencies,
  });

  assert.equal(result.snapshot.status, "PARTIAL");
  assert.equal(result.snapshot.coverage.failedAiPages, 1);
  assert.equal(result.snapshot.coverage.deepReviewedPages, 2);
  assert.equal(deterministicAudit.overallScore, originalScore);
  assert.ok(
    usage.some(
      (record) =>
        record.operationType === AiOperationType.PAGE_ANALYSIS &&
        record.status === "FAILED",
    ),
  );
});

test("cache write failure does not discard a valid page analysis", async () => {
  const dependencies = inMemoryDependencies({ failCacheWrites: true });
  const result = await runSelectiveAiAuditAnalysis({
    ...baseRunInput(deterministicAuditFixture(), evaluationCrawl(2)),
    enabled: true,
    openAiConfigured: true,
    dependencies,
  });

  assert.equal(result.snapshot.coverage.deepReviewedPages, 2);
  assert.equal(result.snapshot.coverage.cacheHits, 0);
  assert.ok(result.findings.length > 0);
});

function baseRunInput(
  deterministicAudit: DeterministicAuditResult,
  websiteCrawl: ReturnType<typeof evaluationCrawl>,
  auditId = "audit-1",
) {
  return {
    auditId,
    businessId: "business-1",
    businessName: "Example Growth Company",
    planType: PlanType.PRO,
    websiteCrawl,
    businessContext,
    goals: [BusinessGoal.MORE_LEADS],
    primaryGoal: BusinessGoal.INCREASE_CONVERSIONS,
    deterministicAudit,
    socialEvidence: { score: 64, confirmedPlatforms: ["Instagram"] },
    reviewEvidence: { score: 58, googleBusinessStatus: "pending" },
    competitorEvidence: { analyzedCompetitors: 1 },
  };
}

function deterministicAuditFixture(): DeterministicAuditResult {
  return {
    overallScore: 62,
    summary: "The deterministic audit found a workable foundation.",
    assessment: {
      version: 1,
      mode: "website_enabled",
      hasWebsite: true,
      confirmedSocialProfilesCount: 1,
      applicableCategories: [
        ScoreCategory.WEBSITE,
        ScoreCategory.SEO,
        ScoreCategory.BRANDING,
        ScoreCategory.SOCIAL,
        ScoreCategory.REVIEWS,
        ScoreCategory.COMPETITORS,
      ],
      unavailableCategories: [],
      scoreWeights: {
        WEBSITE: 0.25,
        SEO: 0.2,
        BRANDING: 0.15,
        SOCIAL: 0.15,
        REVIEWS: 0.15,
        COMPETITORS: 0.1,
      },
      dataUsed: ["Static website crawl"],
      limitations: ["No JavaScript rendering."],
    },
    scores: [
      {
        category: ScoreCategory.OVERALL,
        label: "Overall",
        score: 62,
      },
      {
        category: ScoreCategory.WEBSITE,
        label: "Website",
        score: 60,
      },
    ],
    findings: [
      {
        category: ScoreCategory.SEO,
        title: "One page is missing a meta description",
        description: "The missing description was measured by the crawler.",
        severity: FindingSeverity.MEDIUM,
      },
    ],
    recommendations: [
      {
        title: "Add the missing meta description",
        description: "Write a concise description for the affected page.",
        category: ScoreCategory.SEO,
        priority: RecommendationPriority.MEDIUM,
        estimatedEffort: "Low",
        expectedImpact: "Medium",
      },
    ],
    suggestedQuestions: [],
    recentActivity: [],
    scoreBreakdowns: [],
  };
}

function inMemoryDependencies({
  failPagePath,
  failCacheWrites = false,
  onProviderRequest,
  onUsage,
}: {
  failPagePath?: string;
  failCacheWrites?: boolean;
  onProviderRequest?: (
    operation: "PAGE_ANALYSIS" | "AUDIT_SYNTHESIS",
  ) => void;
  onUsage?: (
    record: Parameters<SelectiveAiAuditDependencies["recordUsage"]>[0],
  ) => void;
} = {}): SelectiveAiAuditDependencies {
  const cache = new Map<string, PageAnalysisCache>();
  let cacheSequence = 0;

  const requestStructuredOutput = (async (request) => {
    onProviderRequest?.(request.operation);
    if (
      request.operation === "PAGE_ANALYSIS" &&
      failPagePath &&
      request.input.includes(`https://example.test${failPagePath}`)
    ) {
      return {
        status: "FAILED",
        value: null,
        usage: emptyAiTokenUsage(),
        latencyMs: 4,
        retryCount: 0,
        providerRequestId: "request-failed",
        failureCode: "PROVIDER_UNAVAILABLE",
      };
    }

    if (request.operation === "AUDIT_SYNTHESIS") {
      return {
        status: "FAILED",
        value: null,
        usage: emptyAiTokenUsage(),
        latencyMs: 5,
        retryCount: 0,
        providerRequestId: "request-synthesis",
        failureCode: "SYNTHESIS_TEST_FALLBACK",
      };
    }

    const value = request.validate(validPageOutput());
    return {
      status: value ? "SUCCEEDED" : "VALIDATION_REJECTED",
      value,
      usage: {
        inputTokens: 120,
        cachedInputTokens: 0,
        outputTokens: 80,
        reasoningTokens: 0,
        totalTokens: 200,
      },
      latencyMs: 6,
      retryCount: 0,
      providerRequestId: "request-page",
      failureCode: value ? null : "STRUCTURED_OUTPUT_REJECTED",
    };
  }) as SelectiveAiAuditDependencies["requestStructuredOutput"];

  return {
    requestStructuredOutput,
    findCache: async ({ businessId, cacheKey }) => {
      const record = cache.get(cacheKey);
      return record?.businessId === businessId ? record : null;
    },
    saveCache: async ({
      businessId,
      identity,
      analysis,
      usage,
      estimatedCostMicros,
      latencyMs,
      retryCount,
      providerRequestId,
      contentTruncated,
    }) => {
      if (failCacheWrites) throw new Error("Simulated cache write failure.");
      cacheSequence += 1;
      const now = new Date();
      const record: PageAnalysisCache = {
        id: `cache-${cacheSequence}`,
        businessId,
        ...identity,
        analysis,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        totalTokens: usage.totalTokens,
        estimatedCostMicros,
        latencyMs,
        retryCount,
        providerRequestId,
        contentTruncated,
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      cache.set(identity.cacheKey, record);
      return record;
    },
    deleteInvalidCache: async ({ businessId, cacheId }) => {
      for (const [key, value] of cache) {
        if (value.businessId === businessId && value.id === cacheId) {
          cache.delete(key);
        }
      }
    },
    recordUsage: async (record) => {
      onUsage?.(record);
      return null;
    },
  };
}

function validPageOutput() {
  return {
    pageSummary:
      "The page explains a growth service and presents a visible next step.",
    pagePurpose: "Explain the offer and invite a consultation.",
    strengths: [
      {
        title: "Visible action",
        evidence: "Get started today",
        confidence: "HIGH",
      },
    ],
    opportunities: [
      {
        category: "CONVERSION",
        title: "Clarify the first-step commitment",
        description:
          "The current action is visible, but its wording does not explain the exact next step for a prospective customer.",
        evidence: "Get started today",
        businessImpact:
          "A more specific action may reduce uncertainty for qualified visitors.",
        recommendation:
          "Rename the action to describe the consultation request clearly.",
        priority: "HIGH",
        confidence: "HIGH",
      },
    ],
    primaryCta: {
      found: true,
      text: "Get started today",
      assessment: "The action is visible but broad.",
    },
    limitations: ["Static HTML only."],
  };
}

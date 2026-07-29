import "server-only";

import {
  AiOperationType,
  AiUsageStatus,
  type PlanType,
} from "@prisma/client";

import {
  aggregateEstimatedCostMicros,
  type AiTokenUsage,
} from "@/lib/ai/usage-cost";
import { logError } from "@/lib/observability/log";
import { prisma } from "@/lib/prisma";

export async function recordAuditAiUsage({
  auditId,
  businessId,
  pageAnalysisCacheId,
  operationType,
  pageUrl,
  provider = "openai",
  modelRoute,
  model,
  usage,
  estimatedCostMicros,
  latencyMs,
  retryCount,
  status,
  cacheHit,
  promptVersion,
  providerRequestId,
  failureCode,
  planType,
  auditProduct,
}: {
  auditId: string;
  businessId: string;
  pageAnalysisCacheId?: string | null;
  operationType: AiOperationType;
  pageUrl?: string | null;
  provider?: string;
  modelRoute: string;
  model: string;
  usage: AiTokenUsage;
  estimatedCostMicros: number | null;
  latencyMs: number;
  retryCount: number;
  status: AiUsageStatus;
  cacheHit: boolean;
  promptVersion: string;
  providerRequestId?: string | null;
  failureCode?: string | null;
  planType?: PlanType | null;
  auditProduct?: string | null;
}) {
  try {
    return await prisma.auditAiUsage.create({
      data: {
        auditId,
        businessId,
        pageAnalysisCacheId,
        operationType,
        pageUrl,
        provider,
        modelRoute,
        model,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        totalTokens: usage.totalTokens,
        estimatedCostMicros,
        latencyMs,
        retryCount,
        status,
        cacheHit,
        promptVersion,
        providerRequestId,
        failureCode,
        planType,
        auditProduct,
      },
    });
  } catch (error) {
    logError("audit_ai_usage_write_failed", error, {
      auditId,
      businessId,
      operationType,
      status,
    });
    return null;
  }
}

export async function getInternalAuditAiUsageSummary({
  auditId,
  businessId,
}: {
  auditId: string;
  businessId: string;
}) {
  const usage = await prisma.auditAiUsage.findMany({
    where: { auditId, businessId },
    select: {
      operationType: true,
      inputTokens: true,
      cachedInputTokens: true,
      outputTokens: true,
      reasoningTokens: true,
      totalTokens: true,
      estimatedCostMicros: true,
      latencyMs: true,
      retryCount: true,
      cacheHit: true,
      status: true,
      modelRoute: true,
    },
  });

  return {
    operations: usage.length,
    successful: usage.filter(
      (item) =>
        item.status === AiUsageStatus.SUCCEEDED ||
        item.status === AiUsageStatus.CACHE_HIT,
    ).length,
    failed: usage.filter((item) => item.status === AiUsageStatus.FAILED).length,
    cacheHits: usage.filter((item) => item.cacheHit).length,
    inputTokens: sum(usage.map((item) => item.inputTokens)),
    cachedInputTokens: sum(usage.map((item) => item.cachedInputTokens)),
    outputTokens: sum(usage.map((item) => item.outputTokens)),
    reasoningTokens: sum(usage.map((item) => item.reasoningTokens)),
    totalTokens: sum(usage.map((item) => item.totalTokens)),
    estimatedCostMicros: aggregateEstimatedCostMicros(usage),
    latencyMs: sum(usage.map((item) => item.latencyMs)),
    retries: sum(usage.map((item) => item.retryCount)),
    byOperation: Object.fromEntries(
      Object.values(AiOperationType).map((operationType) => {
        const records = usage.filter(
          (item) => item.operationType === operationType,
        );
        return [
          operationType,
          {
            calls: records.length,
            cacheHits: records.filter((item) => item.cacheHit).length,
            totalTokens: sum(records.map((item) => item.totalTokens)),
            estimatedCostMicros: aggregateEstimatedCostMicros(records),
          },
        ];
      }),
    ),
  };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

import "server-only";

import { Prisma, type PageAnalysisCache } from "@prisma/client";

import type { AiTokenUsage } from "@/lib/ai/usage-cost";
import type { PageAnalysisCacheIdentity } from "@/lib/audits/selective-ai/cache-key";
import type { PageAiAnalysis } from "@/lib/audits/selective-ai/types";
import { logError } from "@/lib/observability/log";
import { prisma } from "@/lib/prisma";

export async function findPageAnalysisCache({
  businessId,
  cacheKey,
}: {
  businessId: string;
  cacheKey: string;
}) {
  return prisma.pageAnalysisCache.findFirst({
    where: {
      businessId,
      cacheKey,
    },
  });
}

export async function savePageAnalysisCache({
  businessId,
  identity,
  analysis,
  usage,
  estimatedCostMicros,
  latencyMs,
  retryCount,
  providerRequestId,
  contentTruncated,
}: {
  businessId: string;
  identity: PageAnalysisCacheIdentity;
  analysis: PageAiAnalysis;
  usage: AiTokenUsage;
  estimatedCostMicros: number | null;
  latencyMs: number;
  retryCount: number;
  providerRequestId: string | null;
  contentTruncated: boolean;
}): Promise<PageAnalysisCache> {
  try {
    return await prisma.pageAnalysisCache.create({
      data: {
        businessId,
        ...identity,
        analysis: analysis as unknown as Prisma.InputJsonValue,
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
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await findPageAnalysisCache({
        businessId,
        cacheKey: identity.cacheKey,
      });
      if (existing) return existing;
    }

    logError("audit_page_analysis_cache_write_failed", error, {
      businessId,
      modelRoute: identity.modelRoute,
    });
    throw error;
  }
}

export async function deleteInvalidPageAnalysisCache({
  businessId,
  cacheId,
}: {
  businessId: string;
  cacheId: string;
}) {
  await prisma.pageAnalysisCache.deleteMany({
    where: {
      id: cacheId,
      businessId,
    },
  });
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

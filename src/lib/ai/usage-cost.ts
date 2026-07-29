import "server-only";

import { logWarn } from "@/lib/observability/log";

export type AiTokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

type ModelPricing = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

// Internal estimates only. Update this catalog when provider pricing changes.
export const AI_PRICING_CATALOG_VERSION = "openai-pricing-2026-07-v2";

const pricingCatalog: Array<{
  modelPattern: RegExp;
  pricing: ModelPricing;
}> = [
  {
    modelPattern: /^gpt-5\.4-mini(?:-\d{4}-\d{2}-\d{2})?$/i,
    pricing: {
      inputUsdPerMillion: 0.75,
      cachedInputUsdPerMillion: 0.075,
      outputUsdPerMillion: 4.5,
    },
  },
  {
    modelPattern: /^gpt-5\.4(?:-\d{4}-\d{2}-\d{2})?$/i,
    pricing: {
      inputUsdPerMillion: 2.5,
      cachedInputUsdPerMillion: 0.25,
      outputUsdPerMillion: 15,
    },
  },
  {
    modelPattern: /^gpt-4\.1-mini(?:-|$)/i,
    pricing: {
      inputUsdPerMillion: 0.4,
      cachedInputUsdPerMillion: 0.1,
      outputUsdPerMillion: 1.6,
    },
  },
  {
    modelPattern: /^gpt-4\.1(?:-|$)/i,
    pricing: {
      inputUsdPerMillion: 2,
      cachedInputUsdPerMillion: 0.5,
      outputUsdPerMillion: 8,
    },
  },
];

const warnedUnknownPricingModels = new Set<string>();

export function emptyAiTokenUsage(): AiTokenUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
}

export function addAiTokenUsage(
  left: AiTokenUsage,
  right: AiTokenUsage,
): AiTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

export function aggregateEstimatedCostMicros(
  entries: Array<{
    estimatedCostMicros: number | null;
    totalTokens: number;
  }>,
) {
  if (
    entries.some(
      (entry) =>
        entry.totalTokens > 0 && entry.estimatedCostMicros === null,
    )
  ) {
    return null;
  }

  return entries.reduce(
    (total, entry) => total + (entry.estimatedCostMicros ?? 0),
    0,
  );
}

export function estimateOpenAiCostMicros(
  model: string,
  usage: AiTokenUsage,
) {
  const pricing = pricingCatalog.find((item) =>
    item.modelPattern.test(model),
  )?.pricing;

  if (!pricing) {
    const safeModel = model.trim() || "(empty model)";
    if (!warnedUnknownPricingModels.has(safeModel)) {
      warnedUnknownPricingModels.add(safeModel);
      logWarn("audit_ai_pricing_unknown", { model: safeModel });
    }
    return null;
  }

  const cachedInputTokens = Math.min(
    usage.inputTokens,
    usage.cachedInputTokens,
  );
  const uncachedInputTokens = Math.max(
    0,
    usage.inputTokens - cachedInputTokens,
  );

  // USD per million tokens maps directly to micro-USD per token.
  return Math.max(
    0,
    Math.round(
      uncachedInputTokens * pricing.inputUsdPerMillion +
        cachedInputTokens * pricing.cachedInputUsdPerMillion +
        usage.outputTokens * pricing.outputUsdPerMillion,
    ),
  );
}

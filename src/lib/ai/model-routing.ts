import "server-only";

import { defaultOpenAIModel } from "@/lib/ai/openai-client";

export const AI_MODEL_ROUTING_VERSION = "ai-model-routing-v2";

export type AuditAiTask = "PAGE_ANALYSIS" | "AUDIT_SYNTHESIS";

export type AuditAiModelRoute = {
  task: AuditAiTask;
  route: "AUDIT_PAGE_EFFICIENT" | "AUDIT_SYNTHESIS_STRONG";
  routeVersion: string;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
  reasoningEffort: "low" | "medium" | null;
};

const routeCatalog = {
  PAGE_ANALYSIS: {
    route: "AUDIT_PAGE_EFFICIENT",
    defaultModel: defaultOpenAIModel,
    environmentVariable: "OPENAI_AUDIT_PAGE_MODEL",
    maxOutputTokens: 1_400,
    timeoutMs: 22_000,
    maxRetries: 1,
    reasoningEffort: "low",
  },
  AUDIT_SYNTHESIS: {
    route: "AUDIT_SYNTHESIS_STRONG",
    defaultModel: defaultOpenAIModel,
    environmentVariable: "OPENAI_AUDIT_SYNTHESIS_MODEL",
    maxOutputTokens: 1_800,
    timeoutMs: 28_000,
    maxRetries: 1,
    reasoningEffort: "medium",
  },
} as const;

export function getAuditAiModelRoute(
  task: AuditAiTask,
  env: Record<string, string | undefined> = process.env,
): AuditAiModelRoute {
  const config = routeCatalog[task];
  const configuredModel = env[config.environmentVariable]?.trim();
  const generalModel = env.OPENAI_MODEL?.trim();
  const model =
    configuredModel ||
    generalModel ||
    config.defaultModel;

  return {
    task,
    route: config.route,
    routeVersion: AI_MODEL_ROUTING_VERSION,
    model,
    maxOutputTokens: config.maxOutputTokens,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    reasoningEffort: supportsReasoningEffort(model)
      ? config.reasoningEffort
      : null,
  };
}

function supportsReasoningEffort(model: string) {
  return /^(?:gpt-5|o[1-9])/i.test(model);
}

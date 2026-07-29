import "server-only";

import { getOpenAIClient } from "@/lib/ai/openai-client";
import type { AuditAiModelRoute } from "@/lib/ai/model-routing";
import {
  addAiTokenUsage,
  emptyAiTokenUsage,
  type AiTokenUsage,
} from "@/lib/ai/usage-cost";
import { logError, logInfo, logWarn } from "@/lib/observability/log";

export type StructuredAuditAiResult<T> = {
  status: "SUCCEEDED" | "FAILED" | "VALIDATION_REJECTED";
  value: T | null;
  usage: AiTokenUsage;
  latencyMs: number;
  retryCount: number;
  providerRequestId: string | null;
  failureCode: string | null;
};

type AuditAiResponse = {
  output_text?: string;
  usage?: {
    input_tokens: number;
    input_tokens_details?: {
      cached_tokens?: number;
    } | null;
    output_tokens: number;
    output_tokens_details?: {
      reasoning_tokens?: number;
    } | null;
    total_tokens: number;
  } | null;
  _request_id?: string | null;
};

export type AuditAiResponseFactory = (input: {
  route: AuditAiModelRoute;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
}) => Promise<AuditAiResponse>;

export async function requestStructuredAuditAiOutput<T>({
  route,
  operation,
  instructions,
  input,
  schemaName,
  schema,
  validate,
  responseFactory = createResponse,
}: {
  route: AuditAiModelRoute;
  operation: "PAGE_ANALYSIS" | "AUDIT_SYNTHESIS";
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  validate: (value: unknown) => T | null;
  responseFactory?: AuditAiResponseFactory;
}): Promise<StructuredAuditAiResult<T>> {
  const startedAt = Date.now();
  let usage = emptyAiTokenUsage();
  let retryCount = 0;
  let providerRequestId: string | null = null;
  let lastOutput = "";

  logInfo("audit_ai_route_selected", {
    operation,
    modelRoute: route.route,
    model: route.model,
  });

  for (let providerAttempt = 0; providerAttempt <= route.maxRetries; providerAttempt += 1) {
    try {
      const response = await responseFactory({
        route,
        instructions,
        input,
        schemaName,
        schema,
      });
      usage = addAiTokenUsage(usage, responseUsage(response.usage));
      providerRequestId = requestId(response) ?? providerRequestId;
      lastOutput = response.output_text ?? "";
      const validated = validate(lastOutput);

      if (validated) {
        return {
          status: "SUCCEEDED",
          value: validated,
          usage,
          latencyMs: Date.now() - startedAt,
          retryCount,
          providerRequestId,
          failureCode: null,
        };
      }

      logWarn("audit_ai_structured_output_rejected", {
        operation,
        modelRoute: route.route,
        retryCount,
      });
      break;
    } catch (error) {
      if (providerAttempt < route.maxRetries && isTransientProviderError(error)) {
        retryCount += 1;
        logWarn("audit_ai_transient_retry", {
          operation,
          modelRoute: route.route,
          retryCount,
          errorCode: safeErrorCode(error),
        });
        await delay(350 * 2 ** providerAttempt);
        continue;
      }

      logError("audit_ai_provider_failed", error, {
        operation,
        modelRoute: route.route,
        retryCount,
      });
      return {
        status: "FAILED",
        value: null,
        usage,
        latencyMs: Date.now() - startedAt,
        retryCount,
        providerRequestId,
        failureCode: safeErrorCode(error),
      };
    }
  }

  if (lastOutput) {
    try {
      retryCount += 1;
      const repairResponse = await responseFactory({
        route,
        instructions,
        input: `${input}\n\nThe previous response matched JSON syntax but failed application evidence validation. Return a fresh response in the required schema. Do not weaken evidence, invent facts, or add findings merely to fill a quota.`,
        schemaName,
        schema,
      });
      usage = addAiTokenUsage(usage, responseUsage(repairResponse.usage));
      providerRequestId = requestId(repairResponse) ?? providerRequestId;
      const validated = validate(repairResponse.output_text ?? "");

      if (validated) {
        return {
          status: "SUCCEEDED",
          value: validated,
          usage,
          latencyMs: Date.now() - startedAt,
          retryCount,
          providerRequestId,
          failureCode: null,
        };
      }
    } catch (error) {
      logError("audit_ai_structured_repair_failed", error, {
        operation,
        modelRoute: route.route,
        retryCount,
      });
      return {
        status: "FAILED",
        value: null,
        usage,
        latencyMs: Date.now() - startedAt,
        retryCount,
        providerRequestId,
        failureCode: safeErrorCode(error),
      };
    }
  }

  return {
    status: "VALIDATION_REJECTED",
    value: null,
    usage,
    latencyMs: Date.now() - startedAt,
    retryCount,
    providerRequestId,
    failureCode: "STRUCTURED_OUTPUT_REJECTED",
  };
}

async function createResponse({
  route,
  instructions,
  input,
  schemaName,
  schema,
}: {
  route: AuditAiModelRoute;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
}) {
  const client = getOpenAIClient({
    maxRetries: 0,
    timeout: route.timeoutMs,
  });

  return client.responses.create({
    model: route.model,
    instructions,
    input,
    max_output_tokens: route.maxOutputTokens,
    store: false,
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema,
      },
    },
    ...(route.reasoningEffort
      ? { reasoning: { effort: route.reasoningEffort } }
      : {}),
  });
}

function responseUsage(
  usage: AuditAiResponse["usage"],
): AiTokenUsage {
  if (!usage) return emptyAiTokenUsage();
  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: usage.total_tokens,
  };
}

function requestId(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const id = (value as { _request_id?: unknown })._request_id;
  return typeof id === "string" ? id.slice(0, 200) : null;
}

function isTransientProviderError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status = typeof record.status === "number" ? record.status : null;
  const code =
    typeof record.code === "string" ? record.code.toLowerCase() : "";
  const name =
    typeof record.name === "string" ? record.name.toLowerCase() : "";
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    Boolean(status && status >= 500) ||
    /timeout|connection|rate_limit|server_error/.test(`${code} ${name}`)
  );
}

function safeErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "UNKNOWN_PROVIDER_ERROR";
  const record = error as Record<string, unknown>;
  const value = record.code ?? record.status ?? record.name;
  return typeof value === "string" || typeof value === "number"
    ? String(value).slice(0, 100)
    : "UNKNOWN_PROVIDER_ERROR";
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

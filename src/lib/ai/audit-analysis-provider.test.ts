import assert from "node:assert/strict";
import test from "node:test";

import {
  requestStructuredAuditAiOutput,
  type AuditAiResponseFactory,
} from "@/lib/ai/audit-analysis-provider";
import { getAuditAiModelRoute } from "@/lib/ai/model-routing";
import {
  addAiTokenUsage,
  aggregateEstimatedCostMicros,
  estimateOpenAiCostMicros,
} from "@/lib/ai/usage-cost";

const route = getAuditAiModelRoute("PAGE_ANALYSIS", {
  OPENAI_AUDIT_PAGE_MODEL: "gpt-5.4-mini-2026-03-17",
});

test("page route uses its task-specific model override", () => {
  const resolved = getAuditAiModelRoute("PAGE_ANALYSIS", {
    OPENAI_MODEL: "gpt-5.4",
    OPENAI_AUDIT_PAGE_MODEL: "gpt-5.4-mini-2026-03-17",
  });

  assert.equal(resolved.model, "gpt-5.4-mini-2026-03-17");
});

test("synthesis route uses its task-specific model override", () => {
  const resolved = getAuditAiModelRoute("AUDIT_SYNTHESIS", {
    OPENAI_MODEL: "gpt-5.4-mini",
    OPENAI_AUDIT_SYNTHESIS_MODEL: "gpt-5.4-2026-03-05",
  });

  assert.equal(resolved.model, "gpt-5.4-2026-03-05");
});

test("both audit routes inherit OPENAI_MODEL when overrides are absent", () => {
  const env = { OPENAI_MODEL: "gpt-5.4" };

  assert.equal(getAuditAiModelRoute("PAGE_ANALYSIS", env).model, "gpt-5.4");
  assert.equal(getAuditAiModelRoute("AUDIT_SYNTHESIS", env).model, "gpt-5.4");
});

test("both audit routes fall back to gpt-5.4-mini without model variables", () => {
  assert.equal(
    getAuditAiModelRoute("PAGE_ANALYSIS", {}).model,
    "gpt-5.4-mini",
  );
  assert.equal(
    getAuditAiModelRoute("AUDIT_SYNTHESIS", {}).model,
    "gpt-5.4-mini",
  );
});

test("whitespace-only audit model variables are ignored", () => {
  const generalFallback = {
    OPENAI_MODEL: " gpt-5.4-mini ",
    OPENAI_AUDIT_PAGE_MODEL: " ",
    OPENAI_AUDIT_SYNTHESIS_MODEL: "\t",
  };
  const defaultFallback = {
    OPENAI_MODEL: " ",
    OPENAI_AUDIT_PAGE_MODEL: "\n",
    OPENAI_AUDIT_SYNTHESIS_MODEL: "\t",
  };

  assert.equal(
    getAuditAiModelRoute("PAGE_ANALYSIS", generalFallback).model,
    "gpt-5.4-mini",
  );
  assert.equal(
    getAuditAiModelRoute("AUDIT_SYNTHESIS", generalFallback).model,
    "gpt-5.4-mini",
  );
  assert.equal(
    getAuditAiModelRoute("PAGE_ANALYSIS", defaultFallback).model,
    "gpt-5.4-mini",
  );
  assert.equal(
    getAuditAiModelRoute("AUDIT_SYNTHESIS", defaultFallback).model,
    "gpt-5.4-mini",
  );
});

test("structured output receives one bounded semantic repair attempt using the original task model", async () => {
  let calls = 0;
  const requestedModels: string[] = [];
  const responseFactory: AuditAiResponseFactory = async ({
    route: requestRoute,
  }) => {
    calls += 1;
    requestedModels.push(requestRoute.model);
    return response(calls === 1 ? "invalid" : '{"accepted":true}');
  };
  const result = await requestStructuredAuditAiOutput({
    route,
    operation: "PAGE_ANALYSIS",
    instructions: "Return structured output.",
    input: "Bounded evidence.",
    schemaName: "test_schema",
    schema: { type: "object" },
    validate: (value) =>
      value === '{"accepted":true}' ? { accepted: true } : null,
    responseFactory,
  });

  assert.equal(calls, 2);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.retryCount, 1);
  assert.equal(result.usage.totalTokens, 20);
  assert.deepEqual(requestedModels, [route.model, route.model]);
});

test("malformed output is rejected after the single repair attempt", async () => {
  let calls = 0;
  const result = await requestStructuredAuditAiOutput({
    route,
    operation: "PAGE_ANALYSIS",
    instructions: "Return structured output.",
    input: "Bounded evidence.",
    schemaName: "test_schema",
    schema: { type: "object" },
    validate: () => null,
    responseFactory: async () => {
      calls += 1;
      return response("still invalid");
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.status, "VALIDATION_REJECTED");
  assert.equal(result.retryCount, 1);
  assert.equal(result.failureCode, "STRUCTURED_OUTPUT_REJECTED");
});

test("transient provider failures use the configured retry cap", async () => {
  let calls = 0;
  const result = await requestStructuredAuditAiOutput({
    route,
    operation: "PAGE_ANALYSIS",
    instructions: "Return structured output.",
    input: "Bounded evidence.",
    schemaName: "test_schema",
    schema: { type: "object" },
    validate: (value) =>
      value === '{"accepted":true}' ? { accepted: true } : null,
    responseFactory: async () => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error("Temporary provider failure"), {
          status: 503,
          code: "server_error",
        });
      }
      return response('{"accepted":true}');
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.retryCount, 1);
});

test("permanent provider failures are not retried", async () => {
  let calls = 0;
  const result = await requestStructuredAuditAiOutput({
    route,
    operation: "PAGE_ANALYSIS",
    instructions: "Return structured output.",
    input: "Bounded evidence.",
    schemaName: "test_schema",
    schema: { type: "object" },
    validate: () => null,
    responseFactory: async () => {
      calls += 1;
      throw Object.assign(new Error("Invalid request"), {
        status: 400,
        code: "invalid_request_error",
      });
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.status, "FAILED");
  assert.equal(result.retryCount, 0);
  assert.equal(result.failureCode, "invalid_request_error");
});

test("task routes enforce output, timeout, and provider retry limits", () => {
  const page = getAuditAiModelRoute("PAGE_ANALYSIS", {});
  const synthesis = getAuditAiModelRoute("AUDIT_SYNTHESIS", {});

  assert.equal(page.maxOutputTokens, 1_400);
  assert.equal(page.maxRetries, 1);
  assert.ok(page.timeoutMs <= 22_000);
  assert.equal(synthesis.maxOutputTokens, 1_800);
  assert.equal(synthesis.maxRetries, 1);
  assert.ok(synthesis.timeoutMs <= 28_000);
});

test("token aggregation and cost estimates include retries and cached input", () => {
  const usage = addAiTokenUsage(
    {
      inputTokens: 1_000,
      cachedInputTokens: 0,
      outputTokens: 250,
      reasoningTokens: 0,
      totalTokens: 1_250,
    },
    {
      inputTokens: 1_000,
      cachedInputTokens: 400,
      outputTokens: 250,
      reasoningTokens: 20,
      totalTokens: 1_250,
    },
  );

  assert.deepEqual(usage, {
    inputTokens: 2_000,
    cachedInputTokens: 400,
    outputTokens: 500,
    reasoningTokens: 20,
    totalTokens: 2_500,
  });
  assert.equal(estimateOpenAiCostMicros("gpt-5.4-mini", usage), 3_480);
});

test("GPT-5.4 mini standard pricing includes input and output tokens", () => {
  assert.equal(
    estimateOpenAiCostMicros(
      "gpt-5.4-mini",
      tokenUsage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ),
    5_250_000,
  );
});

test("GPT-5.4 mini pricing applies the cached-input discount", () => {
  assert.equal(
    estimateOpenAiCostMicros(
      "gpt-5.4-mini",
      tokenUsage({
        inputTokens: 1_000_000,
        cachedInputTokens: 400_000,
      }),
    ),
    480_000,
  );
});

test("GPT-5.4 pricing includes standard cached input", () => {
  assert.equal(
    estimateOpenAiCostMicros(
      "gpt-5.4",
      tokenUsage({
        inputTokens: 1_000_000,
        cachedInputTokens: 250_000,
        outputTokens: 1_000_000,
      }),
    ),
    16_937_500,
  );
});

test("GPT-5.4 aliases and current snapshots use the matching price", () => {
  const usage = tokenUsage({
    inputTokens: 1_000,
    cachedInputTokens: 100,
    outputTokens: 500,
  });

  assert.equal(
    estimateOpenAiCostMicros("gpt-5.4-mini-2026-03-17", usage),
    estimateOpenAiCostMicros("gpt-5.4-mini", usage),
  );
  assert.equal(
    estimateOpenAiCostMicros("gpt-5.4-2026-03-05", usage),
    estimateOpenAiCostMicros("gpt-5.4", usage),
  );
});

test("unknown model pricing stays unknown and emits one internal warning", () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...values: unknown[]) => {
    warnings.push(values.map(String).join(" "));
  };

  try {
    const usage = tokenUsage({ inputTokens: 1_000, outputTokens: 500 });
    assert.equal(
      estimateOpenAiCostMicros("gpt-5.4-pro", usage),
      null,
    );
    assert.equal(
      estimateOpenAiCostMicros("gpt-5.4-pro", usage),
      null,
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /audit_ai_pricing_unknown/);
  assert.match(warnings[0]!, /gpt-5\.4-pro/);
});

test("cost rollups remain unknown when priced token usage is unknown", () => {
  assert.equal(
    aggregateEstimatedCostMicros([
      { estimatedCostMicros: 2_000, totalTokens: 500 },
      { estimatedCostMicros: null, totalTokens: 250 },
    ]),
    null,
  );
  assert.equal(
    aggregateEstimatedCostMicros([
      { estimatedCostMicros: 2_000, totalTokens: 500 },
      { estimatedCostMicros: null, totalTokens: 0 },
    ]),
    2_000,
  );
});

function response(outputText: string) {
  return {
    output_text: outputText,
    _request_id: "request-test",
    usage: {
      input_tokens: 6,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 4,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 10,
    },
  };
}

function tokenUsage({
  inputTokens = 0,
  cachedInputTokens = 0,
  outputTokens = 0,
}: {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
}) {
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens: 0,
    totalTokens: inputTokens + outputTokens,
  };
}

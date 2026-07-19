import assert from "node:assert/strict";
import test from "node:test";

import { ConsultantPipelineError } from "@/lib/ai/consultant-errors";
import { persistConsultantExchange } from "@/lib/chat/consultant-message-persistence";

test("message persistence failures keep their own error category", async () => {
  await assert.rejects(
    persistConsultantExchange(
      {
        threadId: "thread-one",
        question: "What should I do differently to compete?",
        response: {
          content: "An evidence-safe response.",
          source: "competitor_evidence_fallback",
          competitorIntent: "competitive_actions",
          providerCalled: true,
          providerResponded: true,
          evidenceValidated: true,
          fallbackReason: "EVIDENCE_VALIDATION_FAILED",
        },
      },
      {
        persist: async () => {
          throw new Error("database write failed");
        },
      },
    ),
    (error: unknown) =>
      error instanceof ConsultantPipelineError &&
      error.code === "MESSAGE_PERSISTENCE_FAILURE" &&
      error.stage === "MESSAGE_PERSISTENCE",
  );
});

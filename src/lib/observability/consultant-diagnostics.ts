import { randomUUID } from "node:crypto";

import { logError, logInfo } from "@/lib/observability/log";

export type ConsultantDiagnosticStage =
  | "COMPETITOR_LOOKUP"
  | "COMPETITOR_PROFILE_LOOKUP"
  | "COMPETITOR_CONTEXT_BUILD"
  | "PROMPT_BUILD"
  | "PROVIDER_REQUEST"
  | "PROVIDER_RESPONSE"
  | "RESPONSE_PARSE"
  | "SCHEMA_VALIDATION"
  | "EVIDENCE_VALIDATION"
  | "MESSAGE_PERSISTENCE";

type DiagnosticValue = string | number | boolean | null | undefined;
type DiagnosticContext = Record<string, DiagnosticValue>;

export type ConsultantDiagnostics = ReturnType<
  typeof createConsultantDiagnostics
>;

export function createConsultantDiagnostics() {
  const requestId = randomUUID();
  const enabled =
    process.env.NODE_ENV === "development" ||
    process.env.AI_CONSULTANT_DIAGNOSTICS === "1";

  function write(
    stage: ConsultantDiagnosticStage,
    outcome: "started" | "completed",
    context: DiagnosticContext = {},
  ) {
    if (!enabled) return;
    logInfo("ai_consultant_stage", {
      requestId,
      stage,
      outcome,
      ...context,
    });
  }

  return {
    requestId,
    started(stage: ConsultantDiagnosticStage, context?: DiagnosticContext) {
      write(stage, "started", context);
    },
    completed(stage: ConsultantDiagnosticStage, context?: DiagnosticContext) {
      write(stage, "completed", context);
    },
    failed(
      stage: ConsultantDiagnosticStage,
      error: unknown,
      context: DiagnosticContext = {},
    ) {
      if (!enabled) return;
      logError("ai_consultant_stage_failed", error, {
        requestId,
        stage,
        outcome: "failed",
        ...context,
      });
    },
  };
}

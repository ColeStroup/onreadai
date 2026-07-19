import type { ConsultantDiagnosticStage } from "@/lib/observability/consultant-diagnostics";

export type ConsultantFailureCode =
  | "CONTEXT_FAILURE"
  | "PROVIDER_TRANSIENT"
  | "PROVIDER_REJECTED"
  | "PROVIDER_RESPONSE_INVALID"
  | "EVIDENCE_VALIDATION_FAILED"
  | "MESSAGE_PERSISTENCE_FAILURE";

export class ConsultantPipelineError extends Error {
  readonly code: ConsultantFailureCode;
  readonly stage: ConsultantDiagnosticStage;
  readonly transient: boolean;

  constructor({
    code,
    stage,
    message,
    transient = false,
    cause,
  }: {
    code: ConsultantFailureCode;
    stage: ConsultantDiagnosticStage;
    message: string;
    transient?: boolean;
    cause?: unknown;
  }) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ConsultantPipelineError";
    this.code = code;
    this.stage = stage;
    this.transient = transient;
  }
}

export function isConsultantPipelineError(
  error: unknown,
): error is ConsultantPipelineError {
  return error instanceof ConsultantPipelineError;
}

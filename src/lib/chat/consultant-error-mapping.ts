import {
  isConsultantPipelineError,
  type ConsultantPipelineError,
} from "@/lib/ai/consultant-errors";

export type ConsultantClientErrorCode =
  | "CONTEXT_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_CONFIGURATION"
  | "RESPONSE_UNUSABLE"
  | "MESSAGE_PERSISTENCE"
  | "INTERNAL_ERROR";

export type ConsultantFailurePresentation = {
  mode: "ai" | "unavailable";
  error: string;
  errorCode: ConsultantClientErrorCode;
};

export function mapConsultantFailure(
  error: unknown,
): ConsultantFailurePresentation {
  if (!isConsultantPipelineError(error)) {
    return {
      mode: "ai",
      error:
        "The consultant hit an internal error while preparing this answer. Please retry your message.",
      errorCode: "INTERNAL_ERROR",
    };
  }

  return mapPipelineFailure(error);
}

function mapPipelineFailure(
  error: ConsultantPipelineError,
): ConsultantFailurePresentation {
  switch (error.code) {
    case "CONTEXT_FAILURE":
      return {
        mode: "ai",
        error:
          "Saved business or competitor data could not be prepared for this answer. Refresh the competitor analysis or retry.",
        errorCode: "CONTEXT_UNAVAILABLE",
      };
    case "PROVIDER_TRANSIENT":
      return {
        mode: "unavailable",
        error:
          "The AI Consultant could not respond right now. Please try again later.",
        errorCode: "PROVIDER_UNAVAILABLE",
      };
    case "PROVIDER_REJECTED":
      return {
        mode: "unavailable",
        error:
          "The AI service could not accept this request. Contact support if this continues.",
        errorCode: "PROVIDER_CONFIGURATION",
      };
    case "PROVIDER_RESPONSE_INVALID":
    case "EVIDENCE_VALIDATION_FAILED":
      return {
        mode: "ai",
        error:
          "The consultant could not produce an evidence-safe answer. Try a more specific question.",
        errorCode: "RESPONSE_UNUSABLE",
      };
    case "MESSAGE_PERSISTENCE_FAILURE":
      return {
        mode: "ai",
        error: "The response could not be saved. Please retry your message.",
        errorCode: "MESSAGE_PERSISTENCE",
      };
  }
}

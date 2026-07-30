export const SELECTIVE_AI_AUDIT_VERSION = "selective-ai-audit-v1";
export const PAGE_ANALYSIS_PROMPT_VERSION = "audit-page-analysis-prompt-v2";
export const PAGE_ANALYSIS_SCHEMA_VERSION = "audit-page-analysis-schema-v1";
export const AUDIT_SYNTHESIS_PROMPT_VERSION = "audit-synthesis-prompt-v2";
export const AUDIT_SYNTHESIS_SCHEMA_VERSION = "audit-synthesis-schema-v1";

export const selectiveAiAuditLimits = {
  maximumRetainedPageContentCharacters: 10_000,
  maximumPagePayloadCharacters: 16_000,
  maximumSynthesisInputCharacters: 58_000,
  maximumPageOpportunities: 5,
  maximumSiteOpportunities: 12,
  maximumConcurrentPageRequests: 3,
  maximumPageReviewBudgetMs: 105_000,
  maximumProviderRetries: 1,
  maximumStructuredRepairAttempts: 1,
} as const;

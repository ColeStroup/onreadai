export const auditProgressStages = [
  "PREPARING_BUSINESS_INFORMATION",
  "REVIEWING_CONFIRMED_PROFILES",
  "ANALYZING_WEBSITE",
  "REVIEWING_LOCAL_VISIBILITY",
  "EVALUATING_SOCIAL_PRESENCE",
  "COMPARING_COMPETITORS",
  "BUILDING_FINDINGS",
  "PRIORITIZING_RECOMMENDATIONS",
  "PREPARING_RESULTS",
] as const;

export type AuditProgressStage = (typeof auditProgressStages)[number];

export const auditProgressStageLabels: Record<AuditProgressStage, string> = {
  PREPARING_BUSINESS_INFORMATION: "Preparing business information",
  REVIEWING_CONFIRMED_PROFILES: "Reviewing confirmed profiles",
  ANALYZING_WEBSITE: "Analyzing website",
  REVIEWING_LOCAL_VISIBILITY: "Reviewing local visibility",
  EVALUATING_SOCIAL_PRESENCE: "Evaluating social presence",
  COMPARING_COMPETITORS: "Comparing competitors",
  BUILDING_FINDINGS: "Building findings",
  PRIORITIZING_RECOMMENDATIONS: "Prioritizing recommendations",
  PREPARING_RESULTS: "Preparing results",
};

export function isAuditProgressStage(
  value?: string | null,
): value is AuditProgressStage {
  return auditProgressStages.includes(value as AuditProgressStage);
}

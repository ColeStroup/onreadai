export const auditProgressStages = [
  "PREPARING_BUSINESS_INFORMATION",
  "REVIEWING_CONFIRMED_PROFILES",
  "ANALYZING_WEBSITE",
  "CHECKING_TECHNICAL_ISSUES",
  "REVIEWING_LOCAL_VISIBILITY",
  "EVALUATING_SOCIAL_PRESENCE",
  "COMPARING_COMPETITORS",
  "BUILDING_FINDINGS",
  "SELECTING_IMPORTANT_PAGES",
  "REVIEWING_KEY_PAGES",
  "CONSOLIDATING_FINDINGS",
  "PRIORITIZING_RECOMMENDATIONS",
  "PREPARING_RESULTS",
] as const;

export const websiteSeoAuditProgressStages = [
  "PREPARING_BUSINESS_INFORMATION",
  "REVIEWING_CONFIRMED_PROFILES",
  "ANALYZING_WEBSITE",
  "CHECKING_TECHNICAL_ISSUES",
  "BUILDING_FINDINGS",
  "SELECTING_IMPORTANT_PAGES",
  "REVIEWING_KEY_PAGES",
  "CONSOLIDATING_FINDINGS",
  "PRIORITIZING_RECOMMENDATIONS",
  "PREPARING_RESULTS",
] as const satisfies readonly AuditProgressStage[];

export type AuditProgressStage = (typeof auditProgressStages)[number];

export const auditProgressStageLabels: Record<AuditProgressStage, string> = {
  PREPARING_BUSINESS_INFORMATION: "Preparing business information",
  REVIEWING_CONFIRMED_PROFILES: "Reviewing confirmed profiles",
  ANALYZING_WEBSITE: "Crawling website",
  CHECKING_TECHNICAL_ISSUES: "Checking technical issues",
  SELECTING_IMPORTANT_PAGES: "Selecting important pages",
  REVIEWING_KEY_PAGES: "Reviewing key pages",
  REVIEWING_LOCAL_VISIBILITY: "Reviewing local visibility",
  EVALUATING_SOCIAL_PRESENCE: "Evaluating social presence",
  COMPARING_COMPETITORS: "Comparing competitors",
  BUILDING_FINDINGS: "Building findings",
  CONSOLIDATING_FINDINGS: "Consolidating findings",
  PRIORITIZING_RECOMMENDATIONS: "Prioritizing recommendations",
  PREPARING_RESULTS: "Preparing report",
};

export function isAuditProgressStage(
  value?: string | null,
): value is AuditProgressStage {
  return auditProgressStages.includes(value as AuditProgressStage);
}

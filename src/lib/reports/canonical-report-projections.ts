import type {
  CanonicalAuditReport,
  CanonicalFinding,
  CanonicalRecommendation,
} from "@/lib/reports/canonical-audit-report";

export type CanonicalImplementationScope = {
  recommendation: CanonicalRecommendation;
  findings: CanonicalFinding[];
};

export function buildCanonicalImplementationScope(
  report: CanonicalAuditReport,
  recommendationId: string,
): CanonicalImplementationScope | null {
  if (report.integrity.status !== "READY") return null;

  const recommendation = report.recommendations.find(
    (item) => item.recommendationId === recommendationId,
  );
  if (!recommendation) return null;

  const findingsById = new Map(
    report.findings.map((finding) => [finding.findingId, finding]),
  );
  const findings = recommendation.sourceFindingIds.flatMap((findingId) => {
    const finding = findingsById.get(findingId);
    return finding ? [finding] : [];
  });

  if (findings.length !== recommendation.sourceFindingIds.length) return null;
  return { recommendation, findings };
}

export function buildCanonicalEmailSummary(report: CanonicalAuditReport) {
  if (report.integrity.status !== "READY") return null;

  return {
    auditId: report.auditId,
    businessName: report.business.name,
    overallScore: report.view.audit.overallScore,
    executiveSummary: report.view.audit.executiveSummary,
    missingMetaDescriptions:
      report.facts.pagesMissingMetaDescriptions.length,
    priorities: report.priorities.map((item) => ({
      recommendationId: item.recommendationId,
      rootCauseKey: item.rootCauseKey,
      title: item.title,
      expectedOutcome: item.expectedOutcome,
      affectedPages: item.affectedPages.map((page) => ({
        pageId: page.pageId,
        label: page.label,
        url: page.url,
      })),
    })),
  };
}

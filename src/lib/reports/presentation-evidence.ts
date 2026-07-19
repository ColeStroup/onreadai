import type { AuditReportViewModel } from "@/lib/reports/audit-report-view-model";

export function buildPresentationEvidence(
  report: AuditReportViewModel,
) {
  const ctaAssessment =
    report.technicalAppendix.homepagePrimaryCtaAssessment;
  const detectedPages =
    report.technicalAppendix.pagesWithDetectedActionLinks;
  const assessedPages =
    report.technicalAppendix.pagesWithAssessedPrimaryCta;
  const clearPages =
    report.technicalAppendix.pagesWithStructurallyClearPrimaryCta;

  return {
    website: {
      detectedActionCount:
        (report.website?.actionSummary?.detectedActionLinkCount ??
          report.technicalAppendix.detectedActionLinks.length) ||
        null,
      primaryCtaClarity:
        ctaAssessment?.clarity.replaceAll("_", " ").toLowerCase() ??
        "not assessed",
      actionCtaCoverage:
        detectedPages === null ||
        assessedPages === null ||
        clearPages === null
          ? "Not fully assessed"
          : `${detectedPages} detected / ${assessedPages} assessed / ${clearPages} clear`,
    },
    competitorProfiles: {
      confirmedPublicProfiles:
        report.competitors.profileCounts.confirmedPublicProfiles,
      confirmedSocialProfiles:
        report.competitors.profileCounts.confirmedSocialProfiles,
      pendingSocialProfiles:
        report.competitors.profileCounts.pendingSocialProfiles,
    },
    topPriorities: report.recommendations.primary.slice(0, 3).map((item) => ({
      title: item.title,
      description: item.description,
      category: item.sourceCategory,
      priority: item.priority.toLowerCase(),
      effort: item.estimatedEffort,
      impact: item.expectedImpact,
      evidence: item.evidenceSummary,
    })),
    dataNotes: [...report.dataNotes],
    progress: report.progress.comparison.previousAuditId
      ? {
          summary: report.progress.comparison.summary,
          comparisonNote: report.progress.comparison.comparisonNote,
        }
      : null,
  };
}

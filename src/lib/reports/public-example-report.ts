import "server-only";

import type { AuditReportViewModel } from "@/lib/reports/audit-report-view-model";
import type { CanonicalAuditReport } from "@/lib/reports/canonical-audit-report";
import { createJustPieCanonicalReportFixture } from "@/lib/reports/just-pie-report-fixture.test-support";

export function getPublicExampleAuditReport(): AuditReportViewModel & {
  canonicalReport: CanonicalAuditReport;
} {
  const report = createJustPieCanonicalReportFixture();
  if (
    !report.canonicalReport ||
    report.canonicalReport.integrity.status !== "READY"
  ) {
    throw new Error("The sanitized example report did not pass integrity checks.");
  }
  return report as AuditReportViewModel & {
    canonicalReport: CanonicalAuditReport;
  };
}

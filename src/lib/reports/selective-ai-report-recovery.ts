import { readAiReviewedOpportunityEvidence } from "@/lib/audits/selective-ai/types";
import type { AuditEvidenceIntegritySnapshot } from "@/lib/audits/evidence-contracts";
import type { CanonicalAuditReport } from "@/lib/reports/canonical-audit-report";

export function shouldRecoverSelectiveAiEvidence({
  canonicalReport,
  evidenceIntegrity,
  findings,
}: {
  canonicalReport: CanonicalAuditReport | null;
  evidenceIntegrity: AuditEvidenceIntegritySnapshot | null;
  findings: Array<{ evidence: unknown }>;
}) {
  if (canonicalReport?.integrity.status !== "NEEDS_REVIEW") return false;
  if (
    evidenceIntegrity?.evidence.some(
      (item) => item.type === "AI_REVIEWED_PAGE_OPPORTUNITY",
    )
  ) {
    return false;
  }
  return findings.some(
    (finding) => readAiReviewedOpportunityEvidence(finding.evidence) !== null,
  );
}

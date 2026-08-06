import type { AuditEvidenceRecord } from "@/lib/audits/evidence-contracts";
import { canonicalReportUrl } from "@/lib/reports/report-urls";

export function scopeFindingEvidenceToAffectedPages(
  evidence: AuditEvidenceRecord[],
  affectedUrls: string[],
) {
  const affectedPageKeys = new Set(
    affectedUrls.flatMap((url) => {
      const parsed = canonicalReportUrl(url);
      return parsed ? [parsed.identityKey] : [];
    }),
  );
  if (affectedPageKeys.size === 0) return evidence;
  return evidence.filter((item) => {
    if (!item.sourceUrl) return true;
    const parsed = canonicalReportUrl(item.sourceUrl);
    return parsed ? affectedPageKeys.has(parsed.identityKey) : false;
  });
}

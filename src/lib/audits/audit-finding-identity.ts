import { createHash } from "node:crypto";

type FindingWithOptionalId = {
  id?: string | null;
};

/**
 * Converts reusable analyzer finding keys into row identities scoped to one audit.
 * The occurrence suffix also prevents duplicate source keys within the same run.
 */
export function scopeAuditFindingIdentities<
  T extends FindingWithOptionalId,
>(auditId: string, findings: readonly T[]): Array<T & { id: string }> {
  const normalizedAuditId = auditId.trim();
  if (!normalizedAuditId) {
    throw new Error("An audit ID is required to scope finding identities.");
  }

  const occurrences = new Map<string, number>();

  return findings.map((finding, index) => {
    const sourceIdentity = finding.id?.trim() || `generated:${index}`;
    const occurrence = occurrences.get(sourceIdentity) ?? 0;
    occurrences.set(sourceIdentity, occurrence + 1);
    const digest = createHash("sha256")
      .update(`${normalizedAuditId}\u0000${sourceIdentity}\u0000${occurrence}`)
      .digest("hex")
      .slice(0, 24);

    return {
      ...finding,
      id: `af_${digest}`,
    };
  });
}

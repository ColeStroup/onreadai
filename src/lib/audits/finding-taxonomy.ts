import { FindingSeverity } from "@prisma/client";

export const auditFindingTypeValues = [
  "VERIFIED_TECHNICAL_ISSUE",
  "AI_REVIEWED_OPPORTUNITY",
  "OPTIONAL_REFINEMENT",
  "VERIFIED_STRENGTH",
  "COVERAGE_INFORMATION",
  "LIMITATION",
  "OBSERVATION",
] as const;

export type AuditFindingType = (typeof auditFindingTypeValues)[number];

export const findingTypeLabels: Record<AuditFindingType, string> = {
  VERIFIED_TECHNICAL_ISSUE: "Verified technical issue",
  AI_REVIEWED_OPPORTUNITY: "AI-reviewed opportunity",
  OPTIONAL_REFINEMENT: "Optional refinement",
  VERIFIED_STRENGTH: "Verified strength",
  COVERAGE_INFORMATION: "Coverage note",
  LIMITATION: "Limitation",
  OBSERVATION: "Observation",
};

export function classifyAuditFindingType(input: {
  title: string;
  description: string;
  severity: FindingSeverity;
  evidence?: unknown;
  sourceType?: string | null;
}): AuditFindingType {
  const stored = readAuditFindingType(input.evidence);
  if (stored) return stored;
  if (input.sourceType === "ai_reviewed_opportunity") {
    return "AI_REVIEWED_OPPORTUNITY";
  }

  const text = `${input.title} ${input.description}`.toLowerCase();

  if (
    /\b(scanned|pages? (?:were|was) analyzed|crawl (?:limit|coverage)|social-first assessment|analysis used|sources? included|profiles? analyzed)\b/.test(
      text,
    )
  ) {
    return "COVERAGE_INFORMATION";
  }

  if (
    /\b(not analyzed|not inspected|not measured|unavailable|could not be (?:analyzed|verified)|not configured|not provided|insufficient data|limited evidence|crawl failed)\b/.test(
      text,
    )
  ) {
    return "LIMITATION";
  }

  if (
    input.severity === FindingSeverity.INFO &&
    /\b(clear|good|present|confirmed|found|links? to|available|strong|establish(?:es|ed)|tracking profiles?)\b/.test(
      text,
    ) &&
    !/\b(missing|unclear|pending|needs?|warning|issue|failed)\b/.test(text)
  ) {
    return "VERIFIED_STRENGTH";
  }

  if (input.severity === FindingSeverity.INFO) {
    return "OBSERVATION";
  }

  return "VERIFIED_TECHNICAL_ISSUE";
}

export function readAuditFindingType(value: unknown): AuditFindingType | null {
  if (!isRecord(value)) return null;
  const candidate = value.findingType;
  return auditFindingTypeValues.includes(candidate as AuditFindingType)
    ? (candidate as AuditFindingType)
    : null;
}

export function evidenceWithFindingType(
  evidence: unknown,
  findingType: AuditFindingType,
) {
  return {
    ...(isRecord(evidence) ? evidence : {}),
    findingType,
    findingTaxonomyVersion: "finding-taxonomy-v2",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

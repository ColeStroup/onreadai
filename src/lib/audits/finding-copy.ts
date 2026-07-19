import { cleanReportCopy } from "@/lib/pdf/text-sanitize";

export function normalizeFindingTitle(value: string) {
  return cleanReportCopy(value)
    .replace(/(?:[.!?:]\s*)+$/g, "")
    .trim();
}

export function normalizeFindingDescription(value: string) {
  const clean = cleanReportCopy(value)
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])\1+/g, "$1")
    .replace(/([.!?])\s*:/g, "$1")
    .trim();

  if (!clean) return "Evidence was unavailable for this finding.";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

export function normalizeFindingCopy<T extends {
  title: string;
  description: string;
}>(finding: T): T {
  return {
    ...finding,
    title: normalizeFindingTitle(finding.title),
    description: normalizeFindingDescription(finding.description),
  };
}

export function completeEvidenceSummary(value: string, limit = 260) {
  const clean = normalizeFindingDescription(value);
  if (clean.length <= limit) return clean;

  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [];
  const selected: string[] = [];
  for (const sentence of sentences) {
    const candidate = [...selected, sentence.trim()].join(" ");
    if (candidate.length > limit - 62) break;
    selected.push(sentence.trim());
  }

  if (selected.length > 0) {
    return `${selected.join(" ")} Additional evidence is available in the dashboard.`;
  }

  const words = clean.split(/\s+/);
  const kept: string[] = [];
  for (const word of words) {
    const candidate = [...kept, word].join(" ");
    if (candidate.length > limit - 62) break;
    kept.push(word);
  }

  const summary = kept.join(" ").replace(/[,;:]?$/, ".");
  return `${summary} Additional evidence is available in the dashboard.`;
}

export function hasUnexplainedEllipsis(value: string) {
  return /(?:\.\.\.|\u2026)(?:\s|$)/.test(value);
}

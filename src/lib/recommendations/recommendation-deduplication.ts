import {
  RecommendationPriority,
  ScoreCategory,
} from "@prisma/client";

import {
  RECOMMENDATION_EVIDENCE_VERSION,
  evidenceForIssue,
  type AuditEvidenceRecord,
  type CanonicalRecommendationEvidence,
} from "@/lib/audits/evidence-contracts";
import { completeEvidenceSummary } from "@/lib/audits/finding-copy";
import { cleanReportCopy } from "@/lib/pdf/text-sanitize";

export type RecommendationCandidate = {
  title: string;
  description: string;
  category: ScoreCategory;
  priority: RecommendationPriority;
  estimatedEffort?: string | null;
  effort?: string | null;
  expectedImpact?: string | null;
  impact?: string | null;
  sourceType?: string | null;
  sourceReferenceId?: string | null;
  evidence?: unknown;
};

export type FindingCandidate = {
  id: string;
  title: string;
  description: string;
  category: ScoreCategory;
  evidence?: unknown;
};

export type CanonicalizedRecommendation<T extends RecommendationCandidate> =
  T &
    CanonicalRecommendationEvidence & {
      mergedRecommendationCount: number;
      estimatedEffort: string;
      expectedImpact: string;
    };

const priorityRank: Record<RecommendationPriority, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const effortRank: Record<string, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
};

const impactRank: Record<string, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
};

export function canonicalizeRecommendations<T extends RecommendationCandidate>({
  recommendations,
  findings,
  evidence,
  generatedAt = new Date().toISOString(),
}: {
  recommendations: T[];
  findings: FindingCandidate[];
  evidence: AuditEvidenceRecord[];
  generatedAt?: string;
}): CanonicalizedRecommendation<T>[] {
  const groups = new Map<string, T[]>();

  for (const recommendation of recommendations) {
    const issueKey = canonicalRecommendationIssueKey(recommendation);
    const assessment = ctaAssessmentFor(evidence);
    if (
      issueKey === "homepage:primary-cta:unclear" &&
      assessment === "CLEAR"
    ) {
      continue;
    }

    groups.set(issueKey, [...(groups.get(issueKey) ?? []), recommendation]);
  }

  return [...groups.entries()].map(([issueKey, group]) => {
    const representative = chooseRepresentative(group);
    const issueEvidence = relevantEvidenceForIssue(evidence, issueKey);
    const relatedFinding = findRelatedFinding(issueKey, findings);
    const canonical = canonicalRecommendationCopy({
      issueKey,
      representative,
      evidence: issueEvidence,
    });
    const fullEvidence = evidenceSummaryForIssue({
      issueKey,
      evidence: issueEvidence,
      relatedFinding,
    });
    const sourceEvidenceIds = [...new Set(issueEvidence.map((item) => item.id))];
    const evidenceConfidence = lowestConfidence(issueEvidence);

    return {
      ...representative,
      ...canonical,
      priority: highestPriority(group),
      estimatedEffort: lowestEffort(group),
      expectedImpact: highestImpact(group),
      sourceType: "audit_evidence",
      sourceReferenceId: relatedFinding?.id ?? null,
      evidence: {
        issueKey,
        sourceFindingId: relatedFinding?.id ?? null,
        sourceEvidenceIds,
        sourceCategory: canonical.category,
        recommendationType: recommendationType(issueKey),
        fullEvidence,
        reportEvidence: completeEvidenceSummary(fullEvidence),
        evidenceConfidence,
        generatedAt,
        generatorVersion: RECOMMENDATION_EVIDENCE_VERSION,
      },
      issueKey,
      sourceFindingId: relatedFinding?.id ?? null,
      sourceEvidenceIds,
      sourceCategory: canonical.category,
      recommendationType: recommendationType(issueKey),
      fullEvidence,
      reportEvidence: completeEvidenceSummary(fullEvidence),
      evidenceConfidence,
      generatedAt,
      generatorVersion: RECOMMENDATION_EVIDENCE_VERSION,
      mergedRecommendationCount: group.length,
    };
  });
}

export function canonicalRecommendationIssueKey(
  recommendation: Pick<RecommendationCandidate, "title" | "description" | "category">,
) {
  const text = `${recommendation.title} ${recommendation.description}`
    .toLowerCase()
    .replace(/call[- ]to[- ]action/g, "cta");

  if (/\b(h1|main headline|homepage headline|descriptive headline)\b/.test(text)) {
    return "sitewide:h1:missing";
  }
  if (/meta description/.test(text)) {
    return /too long|70 and 170|shorter/.test(text)
      ? "homepage:meta-description:too-long"
      : "sitewide:meta-description:missing";
  }
  if (/robots\.txt|robots file|robots rules/.test(text)) {
    return "seo:robots:status";
  }
  if (/sitemap\.xml|sitemap file|publish a sitemap/.test(text)) {
    return "seo:sitemap:status";
  }
  if (/viewport/.test(text)) return "homepage:viewport:missing";
  if (/\bpage title\b|\btitle tag\b/.test(text)) {
    return "homepage:title:quality";
  }
  if (/canonical/.test(text)) return "homepage:canonical:missing";
  if (/alt text/.test(text)) return "sitewide:image-alt:missing";
  if (/\b(cta|primary visitor action|conversion path|main next step)\b/.test(text)) {
    return "homepage:primary-cta:unclear";
  }
  if (
    /operating[- ]hours|outdated(?: homepage)? metadata|hours.*inconsisten/.test(
      text,
    )
  ) {
    return "website:content:operating-hours-conflict";
  }
  if (
    /customer proof|trust proof|testimonial|feature selected.*review/.test(text)
  ) {
    return "reviews:proof:not-featured";
  }
  if (/review request/.test(text)) return "reviews:request-process:missing";
  if (/weekly content|content schedule/.test(text)) {
    return "social:content-plan:weekly";
  }
  if (/confirm.*social profile|uncertain social profile/.test(text)) {
    return "social:profiles:pending";
  }
  if (/confirm.*competitor profile/.test(text)) {
    return "competitors:profiles:pending";
  }
  if (/competitor positioning|competitor.*homepage|competitive/.test(text)) {
    return "competitors:positioning:response";
  }
  if (/contact page|contact option|contact.*find/.test(text)) {
    return "website:contact-path:unclear";
  }

  return `${recommendation.category.toLowerCase()}:general:${slug(
    recommendation.title,
  )}`;
}

function canonicalRecommendationCopy({
  issueKey,
  representative,
  evidence,
}: {
  issueKey: string;
  representative: RecommendationCandidate;
  evidence: AuditEvidenceRecord[];
}) {
  if (issueKey.endsWith(":h1:missing")) {
    const homepage = h1CountForPath(evidence, "website.homepage.h1Count");
    const affected = missingH1PageEvidence(evidence).length;
    return {
      title: "Give the homepage and important pages clear main headlines",
      description:
        affected > 1
          ? `Start with the homepage, then add one descriptive H1 to each affected important page. The homepage currently has ${homepage ?? 0} H1 headings and ${affected} assessed pages have no H1.`
          : "Add one descriptive H1 that states the page's main topic and customer value.",
      category: ScoreCategory.SEO,
    };
  }

  if (issueKey === "homepage:primary-cta:unclear") {
    return {
      title: "Make the primary visitor action more prominent",
      description:
        "Choose one customer action that best matches the conversion goal and give it stronger structural prominence than navigation and secondary actions. Keep useful links available without presenting them as equally primary.",
      category: ScoreCategory.WEBSITE,
    };
  }

  if (issueKey === "website:content:operating-hours-conflict") {
    return {
      title: "Align operating-hours wording across the website",
      description:
        "Confirm the current hours, keep the dedicated hours page as the operational source, and update conflicting homepage metadata or saved copy.",
      category: ScoreCategory.SEO,
    };
  }

  return {
    title: cleanReportCopy(representative.title).replace(/[.!?]+$/, ""),
    description: cleanReportCopy(representative.description),
    category: representative.category,
  };
}

function evidenceSummaryForIssue({
  issueKey,
  evidence,
  relatedFinding,
}: {
  issueKey: string;
  evidence: AuditEvidenceRecord[];
  relatedFinding?: FindingCandidate;
}) {
  if (issueKey.endsWith(":h1:missing")) {
    const homepage = h1CountForPath(evidence, "website.homepage.h1Count");
    const missingPages = missingH1PageEvidence(evidence);
    const examples = missingPages
      .map((item) => item.sourceUrl)
      .filter((value): value is string => Boolean(value))
      .slice(0, 4);
    return `Homepage H1 count: ${homepage ?? "unavailable"}. ${missingPages.length} assessed page${missingPages.length === 1 ? " has" : "s have"} no H1.${examples.length > 0 ? ` Example affected pages: ${examples.join(", ")}.` : ""}`;
  }

  if (issueKey === "homepage:primary-cta:unclear") {
    const action = evidence.find(
      (item) => item.type === "ACTION_LINK_DETECTED" && item.sourcePage === "Homepage",
    );
    const assessment = evidence.find(
      (item) => item.type === "PRIMARY_CTA_ASSESSED" && item.sourcePage === "Homepage",
    );
    const types = isRecord(action?.observedValue)
      ? readStringArray(action.observedValue.detectedActionTypes)
      : [];
    const clarity = isRecord(assessment?.interpretedValue)
      ? String(assessment.interpretedValue.clarity ?? "UNCERTAIN")
      : "UNCERTAIN";
    return `Detected homepage customer actions: ${types.join(", ") || "none"}. Primary CTA clarity: ${clarity.replaceAll("_", " ").toLowerCase()}. Link presence alone is not evidence that one action is visually or semantically primary.`;
  }

  if (issueKey === "homepage:meta-description:too-long") {
    const item = evidence.find(
      (entry) => entry.type === "META_DESCRIPTION_LENGTH",
    );
    return `Homepage meta description length: ${typeof item?.observedValue === "number" ? item.observedValue : "unavailable"} characters. The configured healthy range is 70 to 170 characters.`;
  }

  if (issueKey === "homepage:canonical:missing") {
    const item = evidence.find((entry) => entry.type === "CANONICAL_STATUS");
    return `Homepage canonical status: ${item?.observedValue === true ? "present" : "missing"}. This is a technical best-practice signal, not an emergency.`;
  }

  if (issueKey === "homepage:title:quality") {
    const item = evidence.find((entry) => entry.type === "PAGE_TITLE_LENGTH");
    return `Homepage title length: ${typeof item?.observedValue === "number" ? item.observedValue : "unavailable"} characters; measured status: ${String(item?.interpretedValue ?? "unknown").replaceAll("_", " ")}.`;
  }

  if (issueKey === "homepage:viewport:missing") {
    const item = evidence.find((entry) => entry.type === "VIEWPORT_STATUS");
    return item?.explanation ?? "Homepage viewport status is unavailable.";
  }

  if (issueKey === "seo:robots:status") {
    const item = evidence.find((entry) => entry.type === "ROBOTS_TXT_STATUS");
    return item?.explanation ?? "robots.txt status is unavailable.";
  }

  if (issueKey === "seo:sitemap:status") {
    const item = evidence.find((entry) => entry.type === "SITEMAP_STATUS");
    return item?.explanation ?? "sitemap.xml status is unavailable.";
  }

  if (issueKey === "website:content:operating-hours-conflict") {
    return (
      evidence.find((item) => item.type === "DATA_CONFLICT")?.explanation ??
      "Dedicated operating-hours content and homepage metadata use inconsistent wording."
    );
  }

  if (evidence.length > 0) {
    return evidence.map((item) => item.explanation).join(" ");
  }

  return relatedFinding?.description ??
    "This is a clearly labeled general best practice; no claim about unobserved performance is being made.";
}

function relevantEvidenceForIssue(
  evidence: AuditEvidenceRecord[],
  issueKey: string,
) {
  const direct = evidenceForIssue(evidence, issueKey);
  if (!issueKey.endsWith(":h1:missing")) return direct;
  return direct.filter((item) => item.type === "H1_COUNT");
}

function findRelatedFinding(issueKey: string, findings: FindingCandidate[]) {
  return findings.find(
    (finding) => canonicalFindingIssueKey(finding) === issueKey,
  );
}

function canonicalFindingIssueKey(finding: FindingCandidate) {
  return canonicalRecommendationIssueKey({
    title: finding.title,
    description: finding.description,
    category: finding.category,
  });
}

function chooseRepresentative<T extends RecommendationCandidate>(group: T[]) {
  return [...group].sort(
    (left, right) =>
      priorityRank[right.priority] - priorityRank[left.priority] ||
      (impactRank[displayImpact(right)] ?? 2) -
        (impactRank[displayImpact(left)] ?? 2) ||
      (effortRank[displayEffort(left)] ?? 2) -
        (effortRank[displayEffort(right)] ?? 2),
  )[0];
}

function highestPriority(group: RecommendationCandidate[]) {
  return [...group].sort(
    (left, right) => priorityRank[right.priority] - priorityRank[left.priority],
  )[0].priority;
}

function lowestEffort(group: RecommendationCandidate[]) {
  return group
    .map(displayEffort)
    .sort((left, right) =>
      (effortRank[left] ?? 2) - (effortRank[right] ?? 2),
    )[0];
}

function highestImpact(group: RecommendationCandidate[]) {
  return group
    .map(displayImpact)
    .sort((left, right) =>
      (impactRank[right] ?? 2) - (impactRank[left] ?? 2),
    )[0];
}

function displayEffort(item: RecommendationCandidate) {
  return item.estimatedEffort ?? item.effort ?? "Medium";
}

function displayImpact(item: RecommendationCandidate) {
  return item.expectedImpact ?? item.impact ?? "Medium";
}

function lowestConfidence(evidence: AuditEvidenceRecord[]) {
  if (evidence.length === 0) return "LOW" as const;
  if (evidence.some((item) => item.confidence === "LOW")) return "LOW" as const;
  if (evidence.some((item) => item.confidence === "MEDIUM")) {
    return "MEDIUM" as const;
  }
  return "HIGH" as const;
}

function ctaAssessmentFor(evidence: AuditEvidenceRecord[]) {
  const item = evidence.find(
    (entry) =>
      entry.type === "PRIMARY_CTA_ASSESSED" &&
      entry.sourcePath === "website.homepage.primaryCtaAssessment",
  );
  return isRecord(item?.interpretedValue)
    ? item.interpretedValue.clarity
    : null;
}

function h1CountForPath(evidence: AuditEvidenceRecord[], path: string) {
  const value = evidence.find(
    (item) => item.type === "H1_COUNT" && item.sourcePath === path,
  )?.observedValue;
  return typeof value === "number" ? value : null;
}

function missingH1PageEvidence(evidence: AuditEvidenceRecord[]) {
  const crawl = evidence.filter(
    (item) =>
      item.type === "H1_COUNT" &&
      item.sourcePath.startsWith("websiteCrawl.pages."),
  );
  return (crawl.length > 0
    ? crawl
    : evidence.filter(
        (item) =>
          item.type === "H1_COUNT" &&
          item.sourcePath === "website.homepage.h1Count",
      )
  ).filter((item) => item.observedValue === 0);
}

function recommendationType(issueKey: string) {
  return issueKey.split(":").slice(1).join("_").toUpperCase();
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

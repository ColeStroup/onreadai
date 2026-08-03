import { FindingSeverity, ScoreCategory } from "@prisma/client";

import {
  classifyAuditFindingType,
  evidenceWithFindingType,
} from "@/lib/audits/finding-taxonomy";
import type { NormalizedAuditFacts } from "@/lib/audits/normalized-audit-facts";
import { supportsCustomerVisitLanguage } from "@/lib/business-model";
import { canonicalRecommendationIssueKey } from "@/lib/recommendations/recommendation-deduplication";

export const AUDIT_CONSISTENCY_VALIDATOR_VERSION =
  "audit-consistency-validator-v3";

export type AuditConsistencyIssueCode =
  | "KNOWN_VALUE_RESTORED"
  | "H1_CONTRADICTION_REJECTED"
  | "META_CONTRADICTION_REJECTED"
  | "UNSUPPORTED_SOURCE_URL_REJECTED"
  | "DUPLICATE_ROOT_CAUSE_REJECTED"
  | "FINDING_TAXONOMY_NORMALIZED"
  | "SOCIAL_PERFORMANCE_CLAIM_REJECTED"
  | "BUSINESS_MODEL_MISMATCH_REJECTED"
  | "REVIEW_SCORE_CONFIDENCE_VIOLATION"
  | "COVERAGE_TOTAL_MISMATCH"
  | "SAFE_SUMMARY_FALLBACK";

export type AuditConsistencyIssue = {
  code: AuditConsistencyIssueCode;
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
  sourceId: string | null;
};

type FindingLike = {
  id?: string | null;
  title: string;
  description: string;
  category: ScoreCategory;
  severity: FindingSeverity;
  sourceUrl?: string | null;
  sourceType?: string | null;
  evidence?: unknown;
};

type RecommendationLike = {
  title: string;
  description: string;
  category: ScoreCategory;
  sourceUrl?: string | null;
  issueKey?: string | null;
  rootCauseKey?: string | null;
  sourceType?: string | null;
  evidence?: unknown;
};

export type AuditConsistencySnapshot = {
  validatorVersion: typeof AUDIT_CONSISTENCY_VALIDATOR_VERSION;
  validatedAt: string;
  passed: boolean;
  publishable: boolean;
  rejectedFindingCount: number;
  rejectedRecommendationCount: number;
  normalizedFindingCount: number;
  restoredKnownValueCount: number;
  duplicateRootCauseCount: number;
  fallbackSummaryUsed: boolean;
  issues: AuditConsistencyIssue[];
};

export function validateAuditConsistency<
  F extends FindingLike,
  R extends RecommendationLike,
>({
  facts,
  findings,
  recommendations,
  summary,
  businessName,
  generatedAt = new Date().toISOString(),
}: {
  facts: NormalizedAuditFacts;
  findings: F[];
  recommendations: R[];
  summary: string;
  businessName: string;
  generatedAt?: string;
}) {
  const issues: AuditConsistencyIssue[] = [];
  let normalizedFindingCount = 0;
  let restoredKnownValueCount = 0;
  let rejectedFindingCount = 0;
  let rejectedRecommendationCount = 0;
  let duplicateRootCauseCount = 0;

  const knownUrls = new Set(
    [
      facts.homepage?.url,
      ...facts.siteWide.analyzedPages.map((item) => item.url),
      ...facts.siteWide.pagesMissingTitles.map((item) => item.url),
      ...facts.siteWide.pagesMissingMetaDescriptions.map((item) => item.url),
      ...facts.siteWide.pagesMissingH1.map((item) => item.url),
      ...facts.siteWide.pagesWithMultipleH1.map((item) => item.url),
      ...facts.siteWide.thinPages.map((item) => item.url),
      ...facts.siteWide.copyQualityFindings.map((item) => item.url),
      ...facts.siteWide.orderingFrictionPages.map((item) => item.url),
      ...facts.siteWide.duplicateContentGroups.flatMap((item) => item.urls),
      ...auditedTechnicalSeoUrls(facts.homepage?.url),
    ]
      .filter(isString)
      .map(normalizeComparableUrl),
  );
  const missingH1Urls = new Set(
    facts.siteWide.pagesMissingH1.map((item) =>
      normalizeComparableUrl(item.url),
    ),
  );
  const missingMetaUrls = new Set(
    facts.siteWide.pagesMissingMetaDescriptions.map((item) =>
      normalizeComparableUrl(item.url),
    ),
  );

  const normalizedFindings = findings.flatMap((finding) => {
    const contradiction = findingContradiction({
      finding,
      facts,
      missingH1Urls,
      missingMetaUrls,
      knownUrls,
    });
    if (contradiction) {
      rejectedFindingCount += 1;
      issues.push({
        code: contradiction.code,
        severity: "ERROR",
        message: contradiction.message,
        sourceId: finding.id ?? null,
      });
      return [];
    }

    const title = restoreKnownValues(finding.title, facts);
    const description = restoreKnownValues(finding.description, facts);
    if (title !== finding.title || description !== finding.description) {
      restoredKnownValueCount += 1;
      issues.push({
        code: "KNOWN_VALUE_RESTORED",
        severity: "WARNING",
        message: `Known deterministic evidence replaced an unavailable value in finding "${finding.title}".`,
        sourceId: finding.id ?? null,
      });
    }

    const findingType = classifyAuditFindingType({
      title,
      description,
      severity: finding.severity,
      evidence: finding.evidence,
      sourceType: finding.sourceType,
    });
    if (readFindingType(finding.evidence) !== findingType) {
      normalizedFindingCount += 1;
      issues.push({
        code: "FINDING_TAXONOMY_NORMALIZED",
        severity: "INFO",
        message: `Finding "${finding.title}" was labeled ${findingType}.`,
        sourceId: finding.id ?? null,
      });
    }

    return [
      {
        ...finding,
        title,
        description,
        evidence: evidenceWithFindingType(finding.evidence, findingType),
      } as F,
    ];
  });

  const seenRoots = new Set<string>();
  const normalizedRecommendations = recommendations.flatMap(
    (recommendation) => {
      const issueKey = canonicalRecommendationIssueKey(recommendation);
      const root = recommendation.rootCauseKey ?? rootCauseFromIssue(issueKey);
      const affectedUrls = recommendationUrls(recommendation);
      const scopedRoot =
        root === "PAGE_H1_MISSING" && affectedUrls.length > 0
          ? `${root}:${affectedUrls.join("|")}`
          : root;
      const contradiction = recommendationContradiction({
        recommendation,
        issueKey,
        affectedUrls,
        facts,
        missingH1Urls,
        missingMetaUrls,
        knownUrls,
      });
      if (contradiction) {
        rejectedRecommendationCount += 1;
        issues.push({
          code: contradiction.code,
          severity: "ERROR",
          message: contradiction.message,
          sourceId: stringFromEvidence(recommendation.evidence, "sourceFindingId"),
        });
        return [];
      }

      if (seenRoots.has(scopedRoot)) {
        rejectedRecommendationCount += 1;
        duplicateRootCauseCount += 1;
        issues.push({
          code: "DUPLICATE_ROOT_CAUSE_REJECTED",
          severity: "WARNING",
          message: `A lower-quality duplicate recommendation for ${scopedRoot} was removed.`,
          sourceId: stringFromEvidence(recommendation.evidence, "sourceFindingId"),
        });
        return [];
      }
      seenRoots.add(scopedRoot);

      const title = restoreKnownValues(recommendation.title, facts);
      const description = restoreKnownValues(recommendation.description, facts);
      if (
        title !== recommendation.title ||
        description !== recommendation.description
      ) {
        restoredKnownValueCount += 1;
        issues.push({
          code: "KNOWN_VALUE_RESTORED",
          severity: "WARNING",
          message: `Known deterministic evidence replaced an unavailable value in recommendation "${recommendation.title}".`,
          sourceId: stringFromEvidence(recommendation.evidence, "sourceFindingId"),
        });
      }

      return [
        {
          ...recommendation,
          title,
          description,
          issueKey,
          rootCauseKey: root,
        } as R,
      ];
    },
  );

  if (
    !facts.scoreEvidence.reviews.dataRequirementsMet &&
    facts.scoreEvidence.reviews.score > 60
  ) {
    issues.push({
      code: "REVIEW_SCORE_CONFIDENCE_VIOLATION",
      severity: "ERROR",
      message:
        "The review score exceeded the limited-evidence ceiling without rating and review-count requirements.",
      sourceId: null,
    });
  }

  const coverage = facts.coverage;
  if (
    coverage.aiContent.completedPages + coverage.aiContent.failedPages >
      coverage.aiContent.selectedPages ||
    coverage.technical.pagesAnalyzed > coverage.crawl.successfulPages
  ) {
    issues.push({
      code: "COVERAGE_TOTAL_MISMATCH",
      severity: "ERROR",
      message:
        "Coverage totals did not reconcile across crawl, technical, and selected AI analysis layers.",
      sourceId: null,
    });
  }

  const safeSummary = buildSafeSummary({
    summary,
    businessName,
    facts,
    recommendations: normalizedRecommendations,
  });
  const fallbackSummaryUsed = safeSummary !== summary;
  if (fallbackSummaryUsed) {
    issues.push({
      code: "SAFE_SUMMARY_FALLBACK",
      severity: "WARNING",
      message:
        "The generated executive summary was replaced with deterministic-safe wording.",
      sourceId: null,
    });
  }

  const hasMaterialError = issues.some(
    (issue) =>
      issue.severity === "ERROR" &&
      issue.code !== "H1_CONTRADICTION_REJECTED" &&
      issue.code !== "META_CONTRADICTION_REJECTED" &&
      issue.code !== "UNSUPPORTED_SOURCE_URL_REJECTED",
  );
  const snapshot: AuditConsistencySnapshot = {
    validatorVersion: AUDIT_CONSISTENCY_VALIDATOR_VERSION,
    validatedAt: generatedAt,
    passed: issues.every((issue) => issue.severity !== "ERROR"),
    publishable: !hasMaterialError,
    rejectedFindingCount,
    rejectedRecommendationCount,
    normalizedFindingCount,
    restoredKnownValueCount,
    duplicateRootCauseCount,
    fallbackSummaryUsed,
    issues,
  };

  return {
    findings: normalizedFindings,
    recommendations: normalizedRecommendations,
    summary: safeSummary,
    snapshot,
  };
}

function auditedTechnicalSeoUrls(homepageUrl?: string | null) {
  if (!homepageUrl) return [];
  try {
    const origin = new URL(homepageUrl).origin;
    return [`${origin}/robots.txt`, `${origin}/sitemap.xml`];
  } catch {
    return [];
  }
}

function findingContradiction({
  finding,
  facts,
  missingH1Urls,
  missingMetaUrls,
  knownUrls,
}: {
  finding: FindingLike;
  facts: NormalizedAuditFacts;
  missingH1Urls: Set<string>;
  missingMetaUrls: Set<string>;
  knownUrls: Set<string>;
}) {
  const text = `${finding.title} ${finding.description}`.toLowerCase();
  const sourceUrl = finding.sourceUrl
    ? normalizeComparableUrl(finding.sourceUrl)
    : null;
  if (
    /\bhomepage\b.*\b(?:missing|no)\b.*\bh1\b|\bhomepage\b.*\bh1\b.*\b(?:missing|no)\b/.test(
      text,
    ) &&
    facts.homepage?.h1.status === "GOOD"
  ) {
    return {
      code: "H1_CONTRADICTION_REJECTED" as const,
      message: `Finding "${finding.title}" contradicted the measured homepage H1 count of ${facts.homepage.h1.count}.`,
    };
  }
  if (
    /\bhomepage\b.*\bmeta description\b.*\bmissing\b/.test(text) &&
    facts.homepage?.metaDescription.status !== "MISSING"
  ) {
    return {
      code: "META_CONTRADICTION_REJECTED" as const,
      message: `Finding "${finding.title}" contradicted the measured homepage meta-description status.`,
    };
  }
  if (sourceUrl && knownUrls.size > 0 && !knownUrls.has(sourceUrl)) {
    if (
      finding.sourceType === "ai_reviewed_opportunity" ||
      readFindingType(finding.evidence) === "AI_REVIEWED_OPPORTUNITY"
    ) {
      return {
        code: "UNSUPPORTED_SOURCE_URL_REJECTED" as const,
        message: `AI finding "${finding.title}" cited a URL outside the audited source set.`,
      };
    }
  }
  if (sourceUrl && /\bh1\b.*\b(?:missing|no)\b/.test(text)) {
    if (!missingH1Urls.has(sourceUrl)) {
      return {
        code: "H1_CONTRADICTION_REJECTED" as const,
        message: `Finding "${finding.title}" cited a page whose measured H1 count was not zero.`,
      };
    }
  }
  if (sourceUrl && /\bmeta description\b.*\bmissing\b/.test(text)) {
    if (!missingMetaUrls.has(sourceUrl)) {
      return {
        code: "META_CONTRADICTION_REJECTED" as const,
        message: `Finding "${finding.title}" cited a page with a measured meta description.`,
      };
    }
  }
  return null;
}

function recommendationContradiction({
  recommendation,
  issueKey,
  affectedUrls,
  facts,
  missingH1Urls,
  missingMetaUrls,
  knownUrls,
}: {
  recommendation: RecommendationLike;
  issueKey: string;
  affectedUrls: string[];
  facts: NormalizedAuditFacts;
  missingH1Urls: Set<string>;
  missingMetaUrls: Set<string>;
  knownUrls: Set<string>;
}) {
  const text = `${recommendation.title} ${recommendation.description}`.toLowerCase();
  if (
    issueKey.endsWith(":h1:missing") ||
    /\b(?:add|create|write)\b.*\bh1\b/.test(text)
  ) {
    if (
      affectedUrls.length === 0 &&
      /\bhomepage\b/.test(text) &&
      facts.homepage?.h1.status === "GOOD"
    ) {
      return {
        code: "H1_CONTRADICTION_REJECTED" as const,
        message: `Recommendation "${recommendation.title}" contradicted the measured homepage H1 count of ${facts.homepage.h1.count}.`,
      };
    }
    if (
      affectedUrls.length > 0 &&
      affectedUrls.some((url) => !missingH1Urls.has(url))
    ) {
      return {
        code: "H1_CONTRADICTION_REJECTED" as const,
        message: `Recommendation "${recommendation.title}" was not supported by page-level missing-H1 evidence.`,
      };
    }
    if (
      affectedUrls.length === 0 &&
      missingH1Urls.size === 0 &&
      facts.homepage?.h1.status !== "MISSING"
    ) {
      return {
        code: "H1_CONTRADICTION_REJECTED" as const,
        message: `Recommendation "${recommendation.title}" had no measured missing-H1 page.`,
      };
    }
  }

  if (issueKey.includes("meta-description:missing")) {
    if (
      affectedUrls.length > 0 &&
      affectedUrls.some((url) => !missingMetaUrls.has(url))
    ) {
      return {
        code: "META_CONTRADICTION_REJECTED" as const,
        message: `Recommendation "${recommendation.title}" was not supported by page-level missing-description evidence.`,
      };
    }
    if (
      affectedUrls.length === 0 &&
      missingMetaUrls.size === 0 &&
      facts.homepage?.metaDescription.status !== "MISSING"
    ) {
      return {
        code: "META_CONTRADICTION_REJECTED" as const,
        message: `Recommendation "${recommendation.title}" had no measured missing meta description.`,
      };
    }
  }

  if (
    affectedUrls.length > 0 &&
    knownUrls.size > 0 &&
    affectedUrls.some((url) => !knownUrls.has(url))
  ) {
    return {
      code: "UNSUPPORTED_SOURCE_URL_REJECTED" as const,
      message: `Recommendation "${recommendation.title}" cited a URL outside the audited source set.`,
    };
  }

  if (
    !supportsCustomerVisitLanguage(facts.businessModel) &&
    /\b(visit us|dine[- ]?in|guest atmosphere|guest experience|check (?:our )?directions|store hours|walk[- ]?in)\b/i.test(
      text,
    )
  ) {
    return {
      code: "BUSINESS_MODEL_MISMATCH_REJECTED" as const,
      message: `Recommendation "${recommendation.title}" assumed a public customer-facing location that was not confirmed.`,
    };
  }

  if (
    facts.profiles.profileContentAnalyzed === 0 &&
    /\b(engagement (?:is|was)|posting frequency (?:is|was)|posts? (?:perform|performed)|inactive account|content performance)\b/i.test(
      text,
    )
  ) {
    return {
      code: "SOCIAL_PERFORMANCE_CLAIM_REJECTED" as const,
      message: `Recommendation "${recommendation.title}" relied on social-post performance data that was not analyzed.`,
    };
  }

  return null;
}

function restoreKnownValues(value: string, facts: NormalizedAuditFacts) {
  let result = value;
  if (facts.homepage) {
    result = result.replace(
      /(homepage\s+h1\s+count\s*:\s*)unavailable/gi,
      `$1${facts.homepage.h1.count}`,
    );
    result = result.replace(
      /(homepage\s+meta(?:\s+description)?\s+length\s*:\s*)unavailable/gi,
      `$1${facts.homepage.metaDescription.length}`,
    );
    result = result.replace(
      /(homepage\s+title\s+length\s*:\s*)unavailable/gi,
      `$1${facts.homepage.title.length}`,
    );
  }
  return result;
}

function buildSafeSummary<R extends RecommendationLike>({
  summary,
  businessName,
  facts,
  recommendations,
}: {
  summary: string;
  businessName: string;
  facts: NormalizedAuditFacts;
  recommendations: R[];
}) {
  const unsupportedSocialClaim =
    facts.profiles.profileContentAnalyzed === 0 &&
    /\b(strong|weak|effective|poor)\s+(?:social strategy|social performance|content performance)\b/i.test(
      summary,
    );
  const h1Contradiction =
    facts.homepage?.h1.status === "GOOD" &&
    /\bhomepage\b.{0,45}\b(?:missing|no)\b.{0,20}\bh1\b|\bhomepage\b.{0,45}\bh1\b.{0,20}\b(?:missing|no)\b/i.test(
      summary,
    );
  const locationMismatch =
    !supportsCustomerVisitLanguage(facts.businessModel) &&
    /\b(dine[- ]?in|guest atmosphere|guest experience|visit us|walk[- ]?in)\b/i.test(
      summary,
    );

  if (!unsupportedSocialClaim && !h1Contradiction && !locationMismatch) {
    return restoreKnownValues(summary, facts);
  }

  const verifiedStrength = facts.homepage?.h1.status === "GOOD"
    ? `The homepage has one verified main heading: "${facts.homepage.h1.values.at(0) ?? "present"}".`
    : facts.coverage.technical.pagesAnalyzed > 0
      ? `${facts.coverage.technical.pagesAnalyzed} website page${facts.coverage.technical.pagesAnalyzed === 1 ? " was" : "s were"} assessed with deterministic checks.`
      : "The assessment used confirmed business context and available public profiles.";
  const firstAction = recommendations.at(0)?.title;
  const limitation =
    facts.profiles.profileContentAnalyzed === 0
      ? "Social profile presence was assessed, but posts and performance were not analyzed."
      : facts.coverage.aiContent.status === "PARTIAL_FOR_SELECTED_PAGES"
        ? facts.coverage.aiContent.explanation
        : "";
  return [
    `${businessName}'s report is based on measured public evidence and the confirmed business context.`,
    verifiedStrength,
    firstAction ? `The clearest first action is to ${lowerFirst(firstAction)}.` : "",
    limitation,
  ]
    .filter(Boolean)
    .join(" ");
}

function recommendationUrls(recommendation: RecommendationLike) {
  return uniqueStrings(
    [
      recommendation.sourceUrl,
      ...urlsFromUnknown(recommendation.evidence),
    ]
      .filter(isString)
      .map(normalizeComparableUrl),
  );
}

function urlsFromUnknown(value: unknown): string[] {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? [value] : [];
  }
  if (Array.isArray(value)) return value.flatMap(urlsFromUnknown);
  if (!isRecord(value)) return [];
  return [
    value.url,
    value.sourceUrl,
    value.affectedUrl,
    value.pageUrl,
    value.affectedUrls,
    value.affectedPages,
    value.urls,
    value.pages,
    value.groups,
  ].flatMap(urlsFromUnknown);
}

function rootCauseFromIssue(issueKey: string) {
  if (issueKey.endsWith(":h1:missing")) return "PAGE_H1_MISSING";
  if (issueKey.includes("meta-description:missing")) {
    return "HOMEPAGE_META_DESCRIPTION_MISSING";
  }
  if (issueKey === "homepage:primary-cta:unclear") {
    return "HOMEPAGE_PRIMARY_CTA_CLARITY";
  }
  return issueKey.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function readFindingType(value: unknown) {
  return isRecord(value) && typeof value.findingType === "string"
    ? value.findingType
    : null;
}

function stringFromEvidence(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === "string"
    ? String(value[key])
    : null;
}

function normalizeComparableUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (
      (url.protocol === "https:" && url.port === "443") ||
      (url.protocol === "http:" && url.port === "80")
    ) {
      url.port = "";
    }
    url.protocol = "https:";
    url.pathname =
      url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    return `${url.hostname}${url.pathname}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function lowerFirst(value: string) {
  return value.length > 0 ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

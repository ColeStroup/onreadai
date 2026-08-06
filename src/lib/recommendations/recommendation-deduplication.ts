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
import type { AuditFindingType } from "@/lib/audits/finding-taxonomy";
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
  sourceUrl?: string | null;
  issueKey?: string | null;
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
      rootCauseKey: string;
      sourceFindingIds: string[];
      affectedUrls: string[];
      sourceTypes: string[];
      findingType: AuditFindingType;
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
    const groupKey = recommendationGroupKey(recommendation, issueKey);
    const assessment = ctaAssessmentFor(evidence);
    if (
      issueKey === "homepage:primary-cta:unclear" &&
      assessment === "CLEAR"
    ) {
      continue;
    }

    groups.set(groupKey, [...(groups.get(groupKey) ?? []), recommendation]);
  }

  return [...groups.values()].map((group) => {
    const representative = chooseRepresentative(group);
    const issueKey = canonicalRecommendationIssueKey(representative);
    const allIssueEvidence = relevantEvidenceForIssue(evidence, issueKey);
    const candidateUrls = recommendationAffectedUrls(group, []);
    const issueEvidence =
      rootCauseKey(issueKey) === "PAGE_H1_MISSING" &&
      candidateUrls.length > 0
        ? allIssueEvidence.filter(
            (item) =>
              item.sourceUrl === null ||
              candidateUrls.includes(normalizeUrl(item.sourceUrl)),
          )
        : allIssueEvidence;
    const affectedUrls = recommendationAffectedUrls(group, issueEvidence);
    const relatedFindings = findRelatedFindings(
      issueKey,
      findings,
      affectedUrls,
    );
    const relatedFinding = relatedFindings.at(0);
    const canonical = canonicalRecommendationCopy({
      issueKey,
      representative,
      evidence: issueEvidence,
      affectedUrls,
    });
    const fullEvidence = evidenceSummaryForIssue({
      issueKey,
      evidence: issueEvidence,
      relatedFinding,
      affectedUrls,
    });
    const sourceEvidenceIds = [...new Set(issueEvidence.map((item) => item.id))];
    const evidenceConfidence = lowestConfidence(issueEvidence);
    const sourceFindingIds = relatedFindings.map((finding) => finding.id);
    const sourceTypes = uniqueStrings(
      group.map((item) => item.sourceType).filter(isString),
    );
    const findingType: AuditFindingType = group.some(
      (item) => item.sourceType === "ai_reviewed_opportunity",
    )
      ? "AI_REVIEWED_OPPORTUNITY"
      : "VERIFIED_TECHNICAL_ISSUE";
    const rootCause = rootCauseKey(issueKey);

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
        rootCauseKey: rootCause,
        sourceFindingId: relatedFinding?.id ?? null,
        sourceFindingIds,
        sourceEvidenceIds,
        affectedUrls,
        sourceTypes,
        findingType,
        sourceCategory: canonical.category,
        recommendationType: recommendationType(issueKey),
        fullEvidence,
        reportEvidence: completeEvidenceSummary(fullEvidence),
        evidenceConfidence,
        generatedAt,
        generatorVersion: RECOMMENDATION_EVIDENCE_VERSION,
      },
      issueKey,
      rootCauseKey: rootCause,
      sourceFindingId: relatedFinding?.id ?? null,
      sourceFindingIds,
      sourceEvidenceIds,
      affectedUrls,
      sourceTypes,
      findingType,
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
  recommendation: Pick<
    RecommendationCandidate,
    "title" | "description" | "category" | "evidence" | "issueKey"
  >,
) {
  if (recommendation.issueKey?.trim()) {
    return recommendation.issueKey.trim();
  }
  if (
    isRecord(recommendation.evidence) &&
    typeof recommendation.evidence.issueKey === "string"
  ) {
    return recommendation.evidence.issueKey;
  }
  const text = `${recommendation.title} ${recommendation.description}`
    .toLowerCase()
    .replace(/call[- ]to[- ]action/g, "cta");

  if (/\b(h1|main headline|homepage headline|descriptive headline)\b/.test(text)) {
    return /multiple h1/i.test(text)
      ? "sitewide:h1:multiple"
      : "sitewide:h1:missing";
  }
  if (
    /operating[- ]hours|outdated(?: homepage)? metadata|hours.*inconsisten/.test(
      text,
    )
  ) {
    return "website:content:operating-hours-conflict";
  }
  if (/meta (?:description|summary)|\bmetadata\b/.test(text)) {
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
  if (
    /contact page|contact option|contact path|way to contact|contact.*find/.test(
      text,
    )
  ) {
    return "website:contact-path:unclear";
  }
  if (/order(?:ing)? (?:process|inquir)|manual order|invoice|pre[- ]?order/.test(text)) {
    return "website:ordering-process:friction";
  }
  if (/copy error|spelling|grammar|proofread|visible copy/.test(text)) {
    return "website:copy:professionalism";
  }
  if (/duplicate content|near[- ]duplicate/.test(text)) {
    return "website:content:duplicate";
  }
  if (
    /thin(?:\s+\w+){0,2}\s+pages?|thin content|empty page|little meaningful content/.test(
      text,
    )
  ) {
    return "website:content:thin";
  }

  return `${recommendation.category.toLowerCase()}:general:${slug(
    recommendation.title,
  )}`;
}

export function canonicalRecommendationRootCauseKey(
  recommendation: Pick<
    RecommendationCandidate,
    "title" | "description" | "category" | "evidence" | "issueKey"
  >,
) {
  return rootCauseKey(canonicalRecommendationIssueKey(recommendation));
}

function canonicalRecommendationCopy({
  issueKey,
  representative,
  evidence,
  affectedUrls,
}: {
  issueKey: string;
  representative: RecommendationCandidate;
  evidence: AuditEvidenceRecord[];
  affectedUrls: string[];
}) {
  if (issueKey.endsWith(":h1:missing")) {
    const pageLabel =
      affectedUrls.length === 1 ? pageName(affectedUrls[0]) : "affected pages";
    return {
      title:
        affectedUrls.length === 1
          ? `Add a clear main headline to ${pageLabel}`
          : "Add clear main headlines to affected pages",
      description:
        affectedUrls.length > 0
          ? `Add one descriptive H1 that states the page's main topic and customer value on ${affectedUrls.join(", ")}.`
          : "Add one descriptive H1 to each measured page with no main heading.",
      category: ScoreCategory.SEO,
    };
  }

  if (issueKey === "homepage:primary-cta:unclear") {
    const orderAction = evidence
      .filter((item) => item.type === "ACTION_LINK_DETECTED")
      .map((item) => item.observedValue)
      .find(
        (value) =>
          isRecord(value) &&
          readStringArray(value.detectedActionTypes).some((type) =>
            /order/i.test(type),
          ),
      );
    const orderUrl =
      isRecord(orderAction) && typeof orderAction.href === "string"
        ? orderAction.href
        : null;
    return {
      title: orderAction
        ? "Make ordering the clear primary action"
        : "Make the primary visitor action more prominent",
      description:
        orderAction && orderUrl
          ? `Give the confirmed ordering path stronger structural prominence near the top of the homepage and repeat it after the primary offer. Link the action directly to ${orderUrl}.`
          : "Choose one confirmed customer action that best matches the conversion goal and give it stronger structural prominence than navigation and secondary actions.",
      category: ScoreCategory.WEBSITE,
    };
  }

  if (
    issueKey === "sitewide:meta-description:missing" ||
    issueKey === "homepage:meta-description:missing"
  ) {
    const homepageOnly =
      affectedUrls.length === 1 && isHomepageLikeUrl(affectedUrls[0]);
    return {
      title: homepageOnly
        ? "Write a useful homepage meta description"
        : "Write descriptive metadata for affected pages",
      description:
        "Summarize the page's offer, audience, and relevant market in concise, descriptive language. Treat length ranges as editorial guidelines because search engines may truncate or rewrite the description.",
      category: ScoreCategory.SEO,
    };
  }

  if (issueKey === "website:ordering-process:friction") {
    return {
      title: "Simplify the order inquiry process",
      description:
        "Keep the existing manual ordering model, but reduce avoidable steps by collecting the required order details in one clear form or guided inquiry and explaining payment, confirmation, pickup, and delivery expectations up front.",
      category: ScoreCategory.WEBSITE,
    };
  }

  if (issueKey === "website:contact-path:unclear") {
    return {
      title: "Make the contact path easier to find",
      description:
        "Keep the confirmed contact options, but give the best customer contact action a clear label and stronger placement near decision points.",
      category: ScoreCategory.WEBSITE,
    };
  }

  if (issueKey === "website:copy:professionalism") {
    return {
      title: "Correct visible copy errors across key customer pages",
      description:
        "Review the cited excerpts, correct high-confidence spelling or formatting issues, and preserve intentional product names and brand language.",
      category: ScoreCategory.BRANDING,
    };
  }

  if (issueKey === "website:content:duplicate") {
    return {
      title: "Differentiate near-duplicate customer pages",
      description:
        "Give each affected page a distinct purpose, title, main copy, and next step. Consolidate or redirect pages only after confirming they do not serve separate customer needs.",
      category: ScoreCategory.SEO,
    };
  }

  if (issueKey === "website:content:thin") {
    return {
      title: "Resolve thin public pages",
      description:
        "Add useful page-specific content, redirect the page to a stronger destination, remove it from navigation, or noindex it after confirming its intended purpose.",
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
  affectedUrls,
}: {
  issueKey: string;
  evidence: AuditEvidenceRecord[];
  relatedFinding?: FindingCandidate;
  affectedUrls: string[];
}) {
  if (issueKey.endsWith(":h1:missing")) {
    const homepage = h1CountForPath(evidence, "website.homepage.h1Count");
    const missingPages = missingH1PageEvidence(evidence);
    const examples = missingPages
      .map((item) => item.sourceUrl)
      .filter((value): value is string => Boolean(value))
      .slice(0, 4);
    const homepageEvidence =
      homepage === null ? "" : ` Homepage H1 count: ${homepage}.`;
    const scopedPages =
      affectedUrls.length > 0 ? affectedUrls : examples;
    return `${missingPages.length} assessed page${missingPages.length === 1 ? " has" : "s have"} a measured H1 count of 0.${scopedPages.length > 0 ? ` Affected pages: ${scopedPages.join(", ")}.` : ""}${homepageEvidence}`;
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
    return `Homepage meta description length: ${typeof item?.observedValue === "number" ? item.observedValue : "unavailable"} characters. This falls outside the product's editorial guideline; search engines may truncate or rewrite descriptions depending on the query and presentation.`;
  }

  if (
    issueKey === "sitewide:meta-description:missing" ||
    issueKey === "homepage:meta-description:missing"
  ) {
    const measured = evidence.filter(
      (entry) =>
        entry.type === "META_DESCRIPTION_LENGTH" &&
        entry.observedValue === 0,
    );
    const homepage = measured.find(
      (entry) => entry.sourcePath === "website.homepage.metaDescriptionLength",
    );
    const urls = uniqueStrings([
      ...affectedUrls,
      ...measured.map((entry) => entry.sourceUrl).filter(isString),
    ]);
    return `${homepage ? "Homepage meta description length: 0 characters. " : ""}${measured.length} measured page${measured.length === 1 ? " is" : "s are"} missing a meta description.${urls.length > 0 ? ` Affected pages: ${urls.join(", ")}.` : ""}`;
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

function findRelatedFindings(
  issueKey: string,
  findings: FindingCandidate[],
  affectedUrls: string[],
) {
  const issueRootCause = rootCauseKey(issueKey);
  return findings.filter((finding) => {
    const findingIssueKey = canonicalFindingIssueKey(finding);
    if (rootCauseKey(findingIssueKey) !== issueRootCause) return false;
    if (affectedUrls.length === 0) return true;

    const findingUrls = urlsFromUnknown(finding.evidence);
    return (
      findingUrls.length === 0 ||
      findingUrls.some((url) => affectedUrls.includes(normalizeUrl(url)))
    );
  });
}

function canonicalFindingIssueKey(finding: FindingCandidate) {
  return canonicalRecommendationIssueKey({
    title: finding.title,
    description: finding.description,
    category: finding.category,
    evidence: finding.evidence,
  });
}

function recommendationGroupKey(
  recommendation: RecommendationCandidate,
  issueKey: string,
) {
  const rootCause = rootCauseKey(issueKey);
  const urls = recommendationAffectedUrls([recommendation], []);

  if (rootCause === "PAGE_H1_MISSING" && urls.length > 0) {
    return `${rootCause}:${urls.join("|")}`;
  }

  return rootCause;
}

function recommendationAffectedUrls(
  recommendations: RecommendationCandidate[],
  evidence: AuditEvidenceRecord[],
) {
  return uniqueStrings(
    [
      ...recommendations
        .map((item) => item.sourceUrl)
        .filter(isString),
      ...recommendations.flatMap((item) => urlsFromUnknown(item.evidence)),
      ...evidence.map((item) => item.sourceUrl).filter(isString),
    ].map(normalizeUrl),
  );
}

function urlsFromUnknown(value: unknown): string[] {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? [value] : [];
  }
  if (Array.isArray(value)) return value.flatMap(urlsFromUnknown);
  if (!isRecord(value)) return [];

  const direct = [
    value.url,
    value.sourceUrl,
    value.affectedUrl,
    value.pageUrl,
  ].filter(isString);
  const nested = [
    value.affectedUrls,
    value.urls,
    value.sources,
    value.pages,
    value.evidence,
  ].flatMap(urlsFromUnknown);
  return uniqueStrings([...direct, ...nested].map(normalizeUrl));
}

function rootCauseKey(issueKey: string) {
  if (issueKey.endsWith(":h1:missing")) return "PAGE_H1_MISSING";
  if (issueKey.endsWith(":h1:multiple")) return "PAGE_H1_MULTIPLE";
  if (issueKey.includes("meta-description:missing")) {
    return "HOMEPAGE_META_DESCRIPTION_MISSING";
  }
  if (issueKey.includes("meta-description:too-long")) {
    return "META_DESCRIPTION_QUALITY";
  }
  if (issueKey === "homepage:primary-cta:unclear") {
    return "HOMEPAGE_PRIMARY_CTA_CLARITY";
  }
  if (issueKey === "homepage:title:quality") return "TITLE_QUALITY";
  if (issueKey === "website:ordering-process:friction") {
    return "ORDERING_PROCESS_FRICTION";
  }
  if (issueKey === "website:contact-path:unclear") {
    return "CONTACT_ACTION_WEAK";
  }
  if (issueKey === "social:profiles:pending") {
    return "SOCIAL_PROFILE_INCOMPLETE";
  }
  if (
    issueKey === "reviews:metrics:unavailable" ||
    issueKey === "reviews:listing:missing"
  ) {
    return "REVIEW_DATA_UNAVAILABLE";
  }
  if (issueKey === "website:copy:professionalism") {
    return "COPY_PROFESSIONALISM";
  }
  if (issueKey === "website:content:duplicate") {
    return "DUPLICATE_CONTENT";
  }
  if (issueKey === "website:content:thin") return "THIN_CONTENT";
  return issueKey.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function pageName(url: string) {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    if (!pathname || isHomepageLikePath(pathname)) return "the homepage";
    const segment = pathname.split("/").filter(Boolean).at(-1) ?? "the page";
    return `the ${segment.replace(/[-_]+/g, " ")} page`;
  } catch {
    return "the affected page";
  }
}

function isHomepageLikeUrl(url: string) {
  try {
    return isHomepageLikePath(new URL(url).pathname);
  } catch {
    return false;
  }
}

function isHomepageLikePath(pathname: string) {
  const normalized = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  return ["/", "/home", "/index", "/index.html", "/index.htm"].includes(
    normalized,
  );
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === "https:" && url.port === "443") ||
      (url.protocol === "http:" && url.port === "80")
    ) {
      url.port = "";
    }
    url.pathname =
      url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

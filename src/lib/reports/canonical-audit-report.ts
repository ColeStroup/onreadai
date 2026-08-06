import {
  FindingSeverity,
  RecommendationPriority,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";

import type { CrawledPageResult } from "@/lib/analyzers/website-crawler";
import type {
  AuditEvidenceRecord,
  ScoreBreakdown,
} from "@/lib/audits/evidence-contracts";
import { stableEvidenceId } from "@/lib/audits/evidence-contracts";
import {
  findingTypeLabels,
  type AuditFindingType,
} from "@/lib/audits/finding-taxonomy";
import { cleanReportCopy } from "@/lib/pdf/text-sanitize";
import {
  canonicalRecommendationIssueKey,
  canonicalRecommendationRootCauseKey,
} from "@/lib/recommendations/recommendation-deduplication";
import type {
  AuditReportViewModel,
  ReportFinding,
  ReportRecommendation,
} from "@/lib/reports/audit-report-view-model";
import {
  buildPagePurposeCoverage,
  type CanonicalPagePurpose,
} from "@/lib/reports/page-purpose";
import {
  canonicalReportUrl,
  isReportHomepagePath,
  isAuditedWebsiteUrl,
  reportPageLabel,
} from "@/lib/reports/report-urls";

export const CANONICAL_AUDIT_REPORT_VERSION =
  "audit-report-v4-canonical-integrity";

export type CanonicalReportIntegrityStatus = "READY" | "NEEDS_REVIEW";

export type CanonicalReportIntegrityIssueCode =
  | "COUNT_MISMATCH"
  | "DUPLICATE_PAGE_IDENTITY"
  | "BROKEN_URL"
  | "UNKNOWN_AFFECTED_PAGE"
  | "UNKNOWN_EVIDENCE_ID"
  | "MISSING_EVIDENCE"
  | "EVIDENCE_PAGE_MISMATCH"
  | "DUPLICATE_ROOT_CAUSE"
  | "INVALID_CLASSIFICATION"
  | "INVALID_SCORE_IMPACT"
  | "MISSING_REFERENCED_FINDING";

export type CanonicalReportIntegrityIssue = {
  code: CanonicalReportIntegrityIssueCode;
  severity: "WARNING" | "ERROR";
  sourceId: string | null;
  message: string;
};

export type CanonicalAffectedPage = {
  pageId: string;
  url: string;
  path: string;
  label: string;
  evidenceIds: string[];
};

export type CanonicalPage = {
  pageId: string;
  url: string;
  identityKey: string;
  path: string;
  label: string;
  pageTypes: string[];
  statusCode: number | null;
  analysisStatus: "ANALYZED" | "FAILED";
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  h1Text: string[];
  imageCount: number;
  imagesMissingAltCount: number;
  detectedActionLinkCount: number;
  primaryCtaClarity: string;
  contentExcerpt: string | null;
  contactSignals: string[];
};

export type CanonicalFactPage = Pick<
  CanonicalPage,
  "pageId" | "url" | "path" | "label"
>;

export type CanonicalFactsSummary = {
  pagesScanned: number;
  successfulPages: number;
  failedPages: number;
  pagesMissingTitles: CanonicalFactPage[];
  pagesMissingMetaDescriptions: CanonicalFactPage[];
  pagesWithNoH1: CanonicalFactPage[];
  pagesWithMultipleH1: Array<CanonicalFactPage & { h1Count: number }>;
  pagesWithMissingAltText: Array<
    CanonicalFactPage & { imageCount: number; imagesMissingAltCount: number }
  >;
  totalImages: number;
  totalImagesMissingAlt: number;
  pagesWithNoDetectedActionLinks: CanonicalFactPage[];
  pagesWithDetectedActionLinks: CanonicalFactPage[];
  pagesWithAssessedPrimaryCta: CanonicalFactPage[];
};

export type CanonicalFindingClassification =
  | "VERIFIED_TECHNICAL_ISSUE"
  | "AI_REVIEWED_OPPORTUNITY"
  | "OPTIONAL_REFINEMENT"
  | "VERIFIED_STRENGTH"
  | "COVERAGE_NOTE"
  | "LIMITATION";

export type CanonicalScoreImpact = {
  category: ScoreCategory;
  deduction: number;
  cap: number;
  explanation: string;
};

export type CanonicalFinding = {
  findingId: string;
  stableKey: string;
  rootCauseKey: string;
  category: ScoreCategory;
  classification: CanonicalFindingClassification;
  severity: FindingSeverity | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  simpleExplanation: string;
  whyItMatters: string;
  recommendedAction: string | null;
  affectedPages: CanonicalAffectedPage[];
  evidenceIds: string[];
  completionCriteria: string | null;
  verificationMethod: string | null;
  suggestedSpecialistCategory: string | null;
  scoreImpact: CanonicalScoreImpact | null;
};

export type CanonicalRecommendation = {
  recommendationId: string;
  rootCauseKey: string;
  sourceFindingIds: string[];
  title: string;
  description: string;
  category: ScoreCategory;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  estimatedEffort: string;
  expectedImpact: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  classification: CanonicalFindingClassification;
  affectedPages: CanonicalAffectedPage[];
  evidenceIds: string[];
  evidenceSummary: string;
  whyItMatters: string;
  expectedOutcome: string;
  completionCriteria: string | null;
  verificationMethod: string | null;
  suggestedSpecialistCategory: string | null;
};

type CanonicalViewSnapshot = Omit<
  AuditReportViewModel,
  "canonicalReport" | "reportIntegrity" | "canonicalFacts" | "pagePurposes"
>;

export type CanonicalAuditReport = {
  auditId: string;
  reportVersion: string;
  scoringVersion: string;
  generatedAt: string;
  compatibilityMode: "CANONICAL_V4" | "LEGACY_ADAPTER";
  integrity: {
    status: CanonicalReportIntegrityStatus;
    issues: CanonicalReportIntegrityIssue[];
  };
  business: {
    id: string;
    name: string;
    primaryGoal: string | null;
    secondaryGoals: string[];
  };
  pages: CanonicalPage[];
  pagePurposes: CanonicalPagePurpose[];
  facts: CanonicalFactsSummary;
  scores: AuditReportViewModel["scores"];
  strengths: CanonicalFinding[];
  findings: CanonicalFinding[];
  recommendations: CanonicalRecommendation[];
  priorities: CanonicalRecommendation[];
  progress: AuditReportViewModel["progress"];
  limitations: string[];
  appendix: {
    scoreTrace: Array<{
      findingId: string | null;
      rootCauseKey: string;
      category: ScoreCategory;
      classification: CanonicalFindingClassification | null;
      deduction: number;
      cap: number;
      evidenceIds: string[];
      explanation: string;
    }>;
    evidenceIds: string[];
  };
  view: CanonicalViewSnapshot;
};

export type CanonicalReportBuildOptions = {
  strict?: boolean;
  reportVersion?: string;
  generatedAt?: Date | string;
};

export class CanonicalReportNotReadyError extends Error {
  constructor(public readonly issues: CanonicalReportIntegrityIssue[]) {
    super("The audit report requires an internal quality review.");
    this.name = "CanonicalReportNotReadyError";
  }
}

export function buildCanonicalAuditReport(
  source: AuditReportViewModel,
  options: CanonicalReportBuildOptions = {},
): CanonicalAuditReport {
  const strict = options.strict ?? false;
  const issues: CanonicalReportIntegrityIssue[] = [];
  const pages = buildCanonicalPages(source, issues);
  const pageIndex = new Map(pages.map((page) => [page.identityKey, page]));
  const facts = buildCanonicalFacts({ source, pages, strict, issues });
  const evidenceIndex = new Map(
    source.evidenceIntegrity.evidence.map((item) => [item.id, item]),
  );
  const sourceFindings = buildCanonicalFindings({
    source,
    pages,
    pageIndex,
    evidenceIndex,
    strict,
    issues,
  });
  const findings = addEvidenceBackedRecommendationFindings({
    source,
    findings: sourceFindings,
    pageIndex,
    evidenceIndex,
    strict,
    issues,
  });
  const scoreResult = buildCanonicalScores({ source, findings, issues });
  const recommendations = buildCanonicalRecommendations({
    source,
    findings,
    pageIndex,
    evidenceIndex,
    strict,
    issues,
  });
  const priorities = recommendations
    .filter(
      (item) =>
        item.status !== RecommendationStatus.COMPLETED &&
        item.status !== RecommendationStatus.DISMISSED &&
        item.classification !== "OPTIONAL_REFINEMENT" &&
        item.classification !== "COVERAGE_NOTE" &&
        item.classification !== "LIMITATION" &&
        item.confidence !== "LOW" &&
        (item.affectedPages.length > 0 || item.evidenceIds.length > 0),
    )
    .sort(recommendationSort)
    .slice(0, 3);
  const priorityRoots = priorities.map((item) => item.rootCauseKey);
  if (new Set(priorityRoots).size !== priorityRoots.length) {
    issues.push({
      code: "DUPLICATE_ROOT_CAUSE",
      severity: "ERROR",
      sourceId: null,
      message: "The final priority list contains a repeated root cause.",
    });
  }
  const businessName = canonicalBusinessName(source);
  const businessModel = source.normalizedFacts?.businessModel ?? {
    model: "OTHER" as const,
    locationStatus: "UNKNOWN" as const,
    confidence: "LOW" as const,
    evidence: [],
  };
  const pagePurposes = buildPagePurposeCoverage({
    pages,
    website: source.website,
    crawl: source.websiteCrawl,
    businessModel,
  });
  const view = buildCanonicalView({
    source,
    businessName,
    facts,
    findings,
    recommendations,
    priorities,
    scores: scoreResult.scores,
    score: scoreResult.overall,
    pagePurposes,
    reportVersion:
      options.reportVersion ?? source.scoringMetadata.reportViewModelVersion,
  });
  const status = issues.some((issue) => issue.severity === "ERROR")
    ? "NEEDS_REVIEW"
    : "READY";
  const report: CanonicalAuditReport = {
    auditId: source.audit.id,
    reportVersion:
      options.reportVersion ?? source.scoringMetadata.reportViewModelVersion,
    scoringVersion: source.scoringMetadata.scoringEngineVersion,
    generatedAt: dateString(options.generatedAt ?? new Date()),
    compatibilityMode:
      options.reportVersion === CANONICAL_AUDIT_REPORT_VERSION
        ? "CANONICAL_V4"
        : "LEGACY_ADAPTER",
    integrity: { status, issues },
    business: {
      id: source.business.id,
      name: businessName,
      primaryGoal: source.business.primaryGoal,
      secondaryGoals: source.business.secondaryGoals,
    },
    pages,
    pagePurposes,
    facts,
    scores: scoreResult.scores,
    strengths: findings.filter(
      (finding) => finding.classification === "VERIFIED_STRENGTH",
    ),
    findings,
    recommendations,
    priorities,
    progress: view.progress,
    limitations: unique(source.confidence.limitations.map(customerCopy)),
    appendix: {
      scoreTrace: scoreResult.trace,
      evidenceIds: [...evidenceIndex.keys()].sort(),
    },
    view,
  };

  return report;
}

export function readCanonicalAuditReport(value: unknown) {
  if (!isRecord(value)) return null;
  const report = isRecord(value.canonicalAuditReport)
    ? value.canonicalAuditReport
    : value;
  if (
    report.reportVersion !== CANONICAL_AUDIT_REPORT_VERSION ||
    typeof report.auditId !== "string" ||
    !isRecord(report.integrity) ||
    !["READY", "NEEDS_REVIEW"].includes(String(report.integrity.status)) ||
    !Array.isArray(report.integrity.issues) ||
    !Array.isArray(report.pages) ||
    !Array.isArray(report.findings) ||
    !Array.isArray(report.recommendations) ||
    !Array.isArray(report.priorities) ||
    !isRecord(report.facts) ||
    !isRecord(report.view)
  ) {
    return null;
  }
  return report as unknown as CanonicalAuditReport;
}

export function materializeCanonicalReport(
  report: CanonicalAuditReport,
  operationalRecommendations: Array<{
    id: string;
    status: RecommendationStatus;
  }> = [],
): AuditReportViewModel {
  const view = structuredClone(report.view) as AuditReportViewModel;
  reviveViewDates(view);
  const statuses = new Map(
    operationalRecommendations.map((item) => [item.id, item.status]),
  );
  view.recommendations.all = view.recommendations.all.map((item) => ({
    ...item,
    status: statuses.get(item.id) ?? item.status,
  }));
  const primaryIds = new Set(report.priorities.map((item) => item.recommendationId));
  view.recommendations.primary = view.recommendations.all.filter((item) =>
    primaryIds.has(item.id),
  );
  view.recommendations.technical = view.recommendations.all.filter(
    (item) => item.technical && !primaryIds.has(item.id),
  );
  view.recommendations.completed = view.recommendations.all.filter(
    (item) => item.status === RecommendationStatus.COMPLETED,
  ).length;
  view.recommendations.total = view.recommendations.all.length;
  view.canonicalReport = report;
  view.reportIntegrity = report.integrity;
  view.canonicalFacts = report.facts;
  view.pagePurposes = report.pagePurposes;
  return view;
}

export function attachCompatibilityCanonicalReport(
  report: AuditReportViewModel,
) {
  const canonical = buildCanonicalAuditReport(report, {
    strict: false,
    reportVersion: report.scoringMetadata.reportViewModelVersion,
    generatedAt: report.audit.completedAt ?? report.audit.date,
  });
  if (canonical.reportVersion !== CANONICAL_AUDIT_REPORT_VERSION) {
    canonical.integrity = {
      status: "READY",
      issues: canonical.integrity.issues.map((issue) => ({
        ...issue,
        severity: "WARNING",
      })),
    };
  }
  return materializeCanonicalReport(canonical);
}

export function assertCanonicalReportReady(report: AuditReportViewModel) {
  if (report.reportIntegrity?.status === "NEEDS_REVIEW") {
    throw new CanonicalReportNotReadyError(report.reportIntegrity.issues);
  }
}

function buildCanonicalPages(
  source: AuditReportViewModel,
  issues: CanonicalReportIntegrityIssue[],
) {
  const rawPages = [...(source.websiteCrawl?.pageResults ?? [])];
  if (rawPages.length === 0 && source.website) {
    rawPages.push(homepageFromWebsite(source));
  }
  const pages: CanonicalPage[] = [];
  const identities = new Set<string>();

  for (const raw of rawPages) {
    const finalUrl = raw.finalUrl ?? raw.url;
    const parsed = canonicalReportUrl(finalUrl);
    if (!parsed) {
      issues.push({
        code: "BROKEN_URL",
        severity: "ERROR",
        sourceId: raw.url,
        message: "A crawled page has an invalid or incomplete URL.",
      });
      continue;
    }
    if (
      source.website?.normalizedUrl &&
      !isAuditedWebsiteUrl(parsed.url, source.website.normalizedUrl)
    ) {
      issues.push({
        code: "UNKNOWN_AFFECTED_PAGE",
        severity: "ERROR",
        sourceId: raw.url,
        message: "An external page appeared in the audited website page set.",
      });
      continue;
    }
    if (identities.has(parsed.identityKey)) {
      issues.push({
        code: "DUPLICATE_PAGE_IDENTITY",
        severity: "WARNING",
        sourceId: parsed.url,
        message: "A submitted and redirected URL represented the same final page.",
      });
      continue;
    }
    identities.add(parsed.identityKey);
    const label = reportPageLabel({
      url: parsed.url,
      pageTypes: raw.pageTypes,
    });
    pages.push({
      pageId: stableEvidenceId("page", parsed.identityKey),
      url: parsed.url,
      identityKey: parsed.identityKey,
      path: parsed.path,
      label,
      pageTypes: unique([
        ...(isReportHomepagePath(parsed.path.split("?")[0])
          ? ["Homepage"]
          : []),
        ...raw.pageTypes,
      ]),
      statusCode: raw.statusCode,
      analysisStatus:
        raw.analysisStatus ??
        (raw.statusCode !== null && raw.statusCode < 400
          ? "ANALYZED"
          : "FAILED"),
      title: raw.title,
      metaDescription: raw.metaDescription,
      h1Count: raw.h1Count,
      h1Text: raw.h1Text,
      imageCount: raw.imageCount,
      imagesMissingAltCount: raw.imagesMissingAltCount,
      detectedActionLinkCount:
        raw.actionSummary?.detectedActionLinkCount ?? raw.ctaCandidates.length,
      primaryCtaClarity:
        raw.actionSummary?.primaryCtaAssessment?.clarity ?? "NOT_ASSESSED",
      contentExcerpt: raw.contentExcerpt ?? null,
      contactSignals: raw.contactSignals ?? [],
    });
  }

  return pages.sort(
    (left, right) =>
      Number(right.path === "/") - Number(left.path === "/") ||
      left.path.localeCompare(right.path),
  );
}

function buildCanonicalFacts({
  source,
  pages,
  strict,
  issues,
}: {
  source: AuditReportViewModel;
  pages: CanonicalPage[];
  strict: boolean;
  issues: CanonicalReportIntegrityIssue[];
}): CanonicalFactsSummary {
  const successful = pages.filter((page) => page.analysisStatus === "ANALYZED");
  const facts = source.normalizedFacts?.siteWide;
  const factPages = (matches: (page: CanonicalPage) => boolean) =>
    successful.filter(matches).map(canonicalFactPage);
  const pagesMissingTitles = factPages((page) => !page.title);
  const pagesMissingMetaDescriptions = factPages(
    (page) => !page.metaDescription,
  );
  const pagesWithNoH1 = factPages((page) => page.h1Count === 0);
  const multiplePages = factPages((page) => page.h1Count > 1);
  const pagesWithMultipleH1 = multiplePages.map((page) => ({
    ...page,
    h1Count: pages.find((item) => item.pageId === page.pageId)?.h1Count ?? 0,
  }));
  const pagesWithMissingAltText = successful
    .filter((page) => page.imagesMissingAltCount > 0)
    .map((page) => ({
      ...canonicalFactPage(page),
      imageCount: page.imageCount,
      imagesMissingAltCount: page.imagesMissingAltCount,
    }));
  const pagesWithNoDetectedActionLinks = successful
    .filter((page) => page.detectedActionLinkCount === 0)
    .map(canonicalFactPage);
  const pagesWithDetectedActionLinks = successful
    .filter((page) => page.detectedActionLinkCount > 0)
    .map(canonicalFactPage);
  const pagesWithAssessedPrimaryCta = successful
    .filter((page) => page.primaryCtaClarity !== "NOT_ASSESSED")
    .map(canonicalFactPage);

  const checks: Array<[string, number | undefined, number]> = [
    ["pages missing titles", source.websiteCrawl?.pagesMissingTitle, pagesMissingTitles.length],
    [
      "pages missing meta descriptions",
      source.websiteCrawl?.pagesMissingMetaDescription,
      pagesMissingMetaDescriptions.length,
    ],
    ["pages with no H1", source.websiteCrawl?.pagesWithNoH1, pagesWithNoH1.length],
    [
      "pages with multiple H1s",
      source.websiteCrawl?.pagesWithMultipleH1,
      pagesWithMultipleH1.length,
    ],
  ];
  const normalizedChecks: Array<[string, number | undefined, number]> = [
    ["normalized pages missing titles", facts?.pagesMissingTitles.length, pagesMissingTitles.length],
    [
      "normalized pages missing meta descriptions",
      facts?.pagesMissingMetaDescriptions.length,
      pagesMissingMetaDescriptions.length,
    ],
    ["normalized pages with no H1", facts?.pagesMissingH1.length, pagesWithNoH1.length],
    [
      "normalized pages with multiple H1s",
      facts?.pagesWithMultipleH1.length,
      pagesWithMultipleH1.length,
    ],
  ];
  for (const [label, savedCount, canonicalCount] of [
    ...checks,
    ...normalizedChecks,
  ]) {
    if (savedCount !== undefined && savedCount !== canonicalCount) {
      issues.push({
        code: "COUNT_MISMATCH",
        severity: strict ? "ERROR" : "WARNING",
        sourceId: label,
        message: `Saved ${label} count (${savedCount}) does not match the canonical page records (${canonicalCount}).`,
      });
    }
  }

  return {
    pagesScanned: pages.length,
    successfulPages: successful.length,
    failedPages: pages.length - successful.length,
    pagesMissingTitles,
    pagesMissingMetaDescriptions,
    pagesWithNoH1,
    pagesWithMultipleH1,
    pagesWithMissingAltText,
    totalImages: successful.reduce((total, page) => total + page.imageCount, 0),
    totalImagesMissingAlt: successful.reduce(
      (total, page) => total + page.imagesMissingAltCount,
      0,
    ),
    pagesWithNoDetectedActionLinks,
    pagesWithDetectedActionLinks,
    pagesWithAssessedPrimaryCta,
  };
}

function buildCanonicalFindings({
  source,
  pages,
  pageIndex,
  evidenceIndex,
  strict,
  issues,
}: {
  source: AuditReportViewModel;
  pages: CanonicalPage[];
  pageIndex: Map<string, CanonicalPage>;
  evidenceIndex: Map<string, AuditEvidenceRecord>;
  strict: boolean;
  issues: CanonicalReportIntegrityIssue[];
}) {
  return source.findings.all.flatMap((finding) => {
    const rootCauseKey =
      finding.rootCauseKey ??
      (finding.issueKey
        ? canonicalRecommendationRootCauseKey({
            title: finding.title,
            description: finding.description,
            category: finding.category,
            evidence: null,
            issueKey: finding.issueKey,
          })
        : rootCauseForFinding(finding));
    const explicitEvidenceIds = unique(finding.supportingEvidenceIds ?? []);
    const rawEvidenceIds = unique(
      finding.supportingEvidenceIds !== undefined
        ? explicitEvidenceIds
        : evidenceForRoot(
            source.evidenceIntegrity.evidence,
            rootCauseKey,
          ).map((item) => item.id),
    );
    const unknownEvidence = rawEvidenceIds.filter(
      (id) => !evidenceIndex.has(id),
    );
    if (unknownEvidence.length > 0) {
      issues.push({
        code: "UNKNOWN_EVIDENCE_ID",
        severity: strict ? "ERROR" : "WARNING",
        sourceId: finding.id,
        message: "A finding references evidence that is not in this audit.",
      });
      if (strict) return [];
    }
    const evidence = rawEvidenceIds
      .map((id) => evidenceIndex.get(id))
      .filter((item): item is AuditEvidenceRecord => Boolean(item));
    const classification = correctedClassification({
      finding,
      rootCauseKey,
      pages,
      source,
    });
    const publishableIssue =
      classification === "VERIFIED_TECHNICAL_ISSUE" ||
      classification === "AI_REVIEWED_OPPORTUNITY";
    const confidence = confidenceValue(finding.confidence);
    if (publishableIssue && evidence.length === 0 && confidence === "LOW") {
      return [];
    }
    const technicalSupportOnly =
      evidence.length > 0 && evidence.every(isTechnicalSupportEvidence);
    const claimedUrls = technicalSupportOnly
      ? []
      : unique(finding.affectedUrls ?? []).filter(
          (url) => !isTechnicalSupportUrl(url, evidence),
        );
    const evidenceUrls = evidence.flatMap((item) =>
      item.sourceUrl && !isTechnicalSupportEvidence(item)
        ? [item.sourceUrl]
        : [],
    );
    const rawUrls = unique([
      ...claimedUrls,
      ...evidenceUrls,
      ...(claimedUrls.length === 0 && evidenceUrls.length === 0 &&
      finding.sourceUrl &&
      !technicalSupportOnly
        ? [finding.sourceUrl]
        : []),
    ]);
    const affectedPages = affectedPagesForUrls({
      urls: rawUrls,
      evidence,
      pageIndex,
      category: finding.category,
      sourceId: finding.id,
      strict,
      issues,
    });
    if (
      strict &&
      publishableIssue &&
      rawEvidenceIds.filter((id) => evidenceIndex.has(id)).length === 0 &&
      confidence !== "LOW"
    ) {
      issues.push({
        code: "MISSING_EVIDENCE",
        severity: "ERROR",
        sourceId: finding.id,
        message: "A publishable finding has no saved supporting evidence.",
      });
    }
    if (
      strict &&
      (finding.category === ScoreCategory.WEBSITE ||
        finding.category === ScoreCategory.SEO) &&
      rawUrls.length > 0 &&
      affectedPages.length === 0
    ) {
      return [];
    }
    return [
      {
        findingId: finding.id,
        stableKey: finding.stableKey ?? finding.id,
        rootCauseKey,
        category: finding.category,
        classification,
        severity:
          classification === "VERIFIED_STRENGTH" ||
          classification === "COVERAGE_NOTE" ||
          classification === "LIMITATION"
            ? null
            : finding.severity,
        confidence,
        title: customerCopy(finding.title),
        simpleExplanation: customerCopy(finding.description),
        whyItMatters: customerCopy(
          finding.whyItMatters ?? whyCategoryMatters(finding.category),
        ),
        recommendedAction: finding.suggestedAction
          ? customerCopy(finding.suggestedAction)
          : null,
        affectedPages,
        evidenceIds: rawEvidenceIds.filter((id) => evidenceIndex.has(id)),
        completionCriteria: finding.completionCriteria ?? null,
        verificationMethod:
          finding.verificationMethod ?? finding.howOnreadWillCheck ?? null,
        suggestedSpecialistCategory:
          finding.suggestedSpecialistCategory ?? finding.whoCanHelp ?? null,
        scoreImpact: null,
      } satisfies CanonicalFinding,
    ];
  });
}

function addEvidenceBackedRecommendationFindings({
  source,
  findings,
  pageIndex,
  evidenceIndex,
  strict,
  issues,
}: {
  source: AuditReportViewModel;
  findings: CanonicalFinding[];
  pageIndex: Map<string, CanonicalPage>;
  evidenceIndex: Map<string, AuditEvidenceRecord>;
  strict: boolean;
  issues: CanonicalReportIntegrityIssue[];
}) {
  const result = [...findings];

  for (const recommendation of source.recommendations.all) {
    const rootCauseKey =
      recommendation.rootCauseKey ??
      canonicalRecommendationRootCauseKey({
        ...recommendation,
        evidence: recommendation.canonicalEvidence,
        issueKey: recommendation.issueKey,
      });
    if (result.some((finding) => finding.rootCauseKey === rootCauseKey)) {
      continue;
    }
    const rawEvidenceIds = unique(recommendation.evidenceIds ?? []);
    if (rawEvidenceIds.length === 0) continue;
    const unknownEvidenceIds = rawEvidenceIds.filter(
      (id) => !evidenceIndex.has(id),
    );
    if (unknownEvidenceIds.length > 0) {
      issues.push({
        code: "UNKNOWN_EVIDENCE_ID",
        severity: strict ? "ERROR" : "WARNING",
        sourceId: recommendation.id,
        message:
          "An evidence-backed recommendation references evidence that is not in this audit.",
      });
      continue;
    }
    const evidence = rawEvidenceIds
      .map((id) => evidenceIndex.get(id))
      .filter((item): item is AuditEvidenceRecord => Boolean(item));
    const confidence = confidenceValue(recommendation.confidence);
    if (evidence.length === 0 || confidence === "LOW") continue;
    const technicalSupportOnly =
      evidence.length > 0 && evidence.every(isTechnicalSupportEvidence);
    const claimedUrls = technicalSupportOnly
      ? []
      : unique(recommendation.affectedUrls ?? []).filter(
          (url) => !isTechnicalSupportUrl(url, evidence),
        );
    const evidenceUrls = evidence.flatMap((item) =>
      item.sourceUrl && !isTechnicalSupportEvidence(item)
        ? [item.sourceUrl]
        : [],
    );
    const affectedPages = affectedPagesForUrls({
      urls: unique([...claimedUrls, ...evidenceUrls]),
      evidence,
      pageIndex,
      category: recommendation.category,
      sourceId: recommendation.id,
      strict,
      issues,
    });
    if (
      strict &&
      (recommendation.category === ScoreCategory.WEBSITE ||
        recommendation.category === ScoreCategory.SEO) &&
      evidenceUrls.length > 0 &&
      affectedPages.length === 0
    ) {
      continue;
    }
    const classification = correctedRecommendationClassification({
      recommendation,
      rootCauseKey,
      source,
    });
    const findingId = stableEvidenceId(
      "finding",
      source.audit.id,
      rootCauseKey,
    );
    result.push({
      findingId,
      stableKey: findingId,
      rootCauseKey,
      category: recommendation.category,
      classification,
      severity:
        classification === "OPTIONAL_REFINEMENT"
          ? FindingSeverity.LOW
          : recommendation.priority === RecommendationPriority.HIGH
            ? FindingSeverity.HIGH
            : FindingSeverity.MEDIUM,
      confidence,
      title: derivedFindingTitle(rootCauseKey, recommendation.title),
      simpleExplanation: customerCopy(recommendation.evidenceSummary),
      whyItMatters: customerCopy(recommendation.businessRelevance),
      recommendedAction: customerCopy(recommendation.description),
      affectedPages,
      evidenceIds: rawEvidenceIds,
      completionCriteria: recommendation.completionCriteria ?? null,
      verificationMethod: recommendation.verificationMethod ?? null,
      suggestedSpecialistCategory:
        recommendation.suggestedSpecialistCategory ?? null,
      scoreImpact: null,
    });
  }

  return result;
}

function correctedRecommendationClassification({
  recommendation,
  rootCauseKey,
  source,
}: {
  recommendation: ReportRecommendation;
  rootCauseKey: string;
  source: AuditReportViewModel;
}) {
  if (
    rootCauseKey === "TITLE_QUALITY" &&
    source.normalizedFacts?.homepage?.title.value
  ) {
    return "OPTIONAL_REFINEMENT" as const;
  }
  if (
    rootCauseKey === "HOMEPAGE_PRIMARY_CTA_CLARITY" &&
    source.website?.actionSummary?.hasDetectedActionLinks
  ) {
    return "AI_REVIEWED_OPPORTUNITY" as const;
  }
  return classificationFromRecommendation(recommendation);
}

function derivedFindingTitle(rootCauseKey: string, actionTitle: string) {
  const titles: Record<string, string> = {
    SEO_ROBOTS_STATUS: "robots.txt was not found",
    SEO_SITEMAP_STATUS: "sitemap.xml was not found",
    TITLE_QUALITY: "The homepage title may need clearer wording",
    HOMEPAGE_CANONICAL_MISSING: "The homepage is missing a canonical tag",
    HOMEPAGE_VIEWPORT_MISSING:
      "The homepage is missing a mobile viewport setting",
    HOMEPAGE_META_DESCRIPTION_MISSING:
      "One or more pages are missing a meta description",
    PAGE_H1_MISSING: "One or more pages are missing a main heading",
    SITEWIDE_IMAGE_ALT_MISSING:
      "One or more images are missing alternative text",
    HOMEPAGE_PRIMARY_CTA_CLARITY:
      "The homepage action path needs attention",
  };
  return customerCopy(
    titles[rootCauseKey] ?? `Improvement opportunity: ${actionTitle}`,
  );
}

function buildCanonicalScores({
  source,
  findings,
  issues,
}: {
  source: AuditReportViewModel;
  findings: CanonicalFinding[];
  issues: CanonicalReportIntegrityIssue[];
}) {
  if (source.productScope !== "website_seo") {
    return {
      overall: source.audit.overallScore,
      scores: source.scores,
      trace: scoreTraceFromBreakdowns(source.evidenceIntegrity.scoreBreakdowns, findings),
    };
  }
  const seen = new Set<string>();
  const invalidFindingIds = new Set(
    issues
      .filter(
        (issue) =>
          issue.severity === "ERROR" &&
          [
            "BROKEN_URL",
            "UNKNOWN_AFFECTED_PAGE",
            "UNKNOWN_EVIDENCE_ID",
            "MISSING_EVIDENCE",
            "EVIDENCE_PAGE_MISMATCH",
          ].includes(issue.code) &&
          issue.sourceId,
      )
      .map((issue) => issue.sourceId as string),
  );
  const trace: CanonicalAuditReport["appendix"]["scoreTrace"] = [];
  for (const finding of findings) {
    if (
      (finding.category !== ScoreCategory.WEBSITE &&
        finding.category !== ScoreCategory.SEO) ||
      ![
        "VERIFIED_TECHNICAL_ISSUE",
        "AI_REVIEWED_OPPORTUNITY",
      ].includes(finding.classification) ||
      finding.confidence === "LOW"
      || invalidFindingIds.has(finding.findingId)
    ) {
      continue;
    }
    const key = `${finding.category}:${finding.rootCauseKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cap =
      finding.classification === "VERIFIED_TECHNICAL_ISSUE" ? 18 : 8;
    const deduction = Math.min(cap, findingDeduction(finding));
    if (deduction <= 0) continue;
    finding.scoreImpact = {
      category: finding.category,
      deduction,
      cap,
      explanation: `${deduction} points for one validated root cause. Repeated evidence is counted once.`,
    };
    trace.push({
      findingId: finding.findingId,
      rootCauseKey: finding.rootCauseKey,
      category: finding.category,
      classification: finding.classification,
      deduction,
      cap,
      evidenceIds: finding.evidenceIds,
      explanation: finding.scoreImpact.explanation,
    });
  }
  const categoryScore = (category: ScoreCategory) =>
    Math.max(
      10,
      100 -
        trace
          .filter((item) => item.category === category)
          .reduce((total, item) => total + item.deduction, 0),
    );
  const website = categoryScore(ScoreCategory.WEBSITE);
  const seo = categoryScore(ScoreCategory.SEO);
  const overall = Math.round(website * 0.55 + seo * 0.45);
  const scores = source.scores.map((item) => ({
    ...item,
    score:
      item.category === ScoreCategory.WEBSITE
        ? website
        : item.category === ScoreCategory.SEO
          ? seo
          : item.score,
  }));
  if (!scores.some((item) => item.category === ScoreCategory.WEBSITE)) {
    issues.push({
      code: "INVALID_SCORE_IMPACT",
      severity: "ERROR",
      sourceId: ScoreCategory.WEBSITE,
      message: "The canonical report is missing the Website score row.",
    });
  }
  return { overall, scores, trace };
}

function buildCanonicalRecommendations({
  source,
  findings,
  pageIndex,
  evidenceIndex,
  strict,
  issues,
}: {
  source: AuditReportViewModel;
  findings: CanonicalFinding[];
  pageIndex: Map<string, CanonicalPage>;
  evidenceIndex: Map<string, AuditEvidenceRecord>;
  strict: boolean;
  issues: CanonicalReportIntegrityIssue[];
}) {
  const groups = new Map<string, ReportRecommendation[]>();
  for (const recommendation of source.recommendations.all) {
    const root =
      recommendation.rootCauseKey ??
      canonicalRecommendationRootCauseKey({
        ...recommendation,
        evidence: recommendation.canonicalEvidence,
        issueKey: recommendation.issueKey,
      });
    groups.set(root, [...(groups.get(root) ?? []), recommendation]);
  }

  return [...groups.entries()]
    .flatMap(([rootCauseKey, group]) => {
      const representative = [...group].sort(reportRecommendationSort)[0];
      const declaredEvidenceIds = unique(
        group.flatMap((item) => item.evidenceIds ?? []),
      );
      if (
        confidenceValue(representative.confidence) === "LOW" &&
        declaredEvidenceIds.length === 0
      ) {
        return [];
      }
      const sourceFindings = unique(
        group.flatMap((item) =>
          item.sourceFindingId ? [item.sourceFindingId] : [],
        ),
      );
      const linkedFindings = findings
        .filter(
          (finding) =>
            finding.rootCauseKey === rootCauseKey ||
            sourceFindings.includes(finding.findingId),
        )
        .sort(
          (left, right) =>
            Number(right.rootCauseKey === rootCauseKey) -
            Number(left.rootCauseKey === rootCauseKey),
        );
      if (sourceFindings.some((id) => !findings.some((item) => item.findingId === id))) {
        issues.push({
          code: "MISSING_REFERENCED_FINDING",
          severity: strict ? "ERROR" : "WARNING",
          sourceId: representative.id,
          message: "A recommendation references a finding that was not published.",
        });
        if (strict) return [];
      }
      const rawEvidenceIds = unique([
        ...group.flatMap((item) => item.evidenceIds ?? []),
        ...linkedFindings.flatMap((finding) => finding.evidenceIds),
      ]);
      const unknownEvidenceIds = rawEvidenceIds.filter(
        (id) => !evidenceIndex.has(id),
      );
      if (unknownEvidenceIds.length > 0) {
        issues.push({
          code: "UNKNOWN_EVIDENCE_ID",
          severity: strict ? "ERROR" : "WARNING",
          sourceId: representative.id,
          message: "A recommendation references evidence that is not in this audit.",
        });
        if (strict) return [];
      }
      const evidenceIds = rawEvidenceIds.filter((id) => evidenceIndex.has(id));
      const evidence = evidenceIds
        .map((id) => evidenceIndex.get(id))
        .filter((item): item is AuditEvidenceRecord => Boolean(item));
      const technicalSupportOnly =
        evidence.length > 0 && evidence.every(isTechnicalSupportEvidence);
      const urls = (
        technicalSupportOnly
          ? []
          : unique([
              ...group.flatMap((item) => item.affectedUrls ?? []),
              ...group.flatMap((item) =>
                item.sourceUrl ? [item.sourceUrl] : [],
              ),
              ...linkedFindings.flatMap((finding) =>
                finding.affectedPages.map((page) => page.url),
              ),
            ])
      ).filter((url) => !isTechnicalSupportUrl(url, evidence));
      const affectedPages = affectedPagesForUrls({
        urls,
        evidence,
        pageIndex,
        category: representative.category,
        sourceId: representative.id,
        strict,
        issues,
      });
      const classification =
        linkedFindings[0]?.classification ??
        classificationFromRecommendation(representative);
      if (
        strict &&
        (representative.category === ScoreCategory.WEBSITE ||
          representative.category === ScoreCategory.SEO) &&
        linkedFindings.length === 0
      ) {
        issues.push({
          code: "MISSING_REFERENCED_FINDING",
          severity: "ERROR",
          sourceId: representative.id,
          message: "A website or SEO recommendation is not linked to a published finding.",
        });
        return [];
      }
      return [
        {
          recommendationId: representative.id,
          rootCauseKey,
          sourceFindingIds: linkedFindings.map((item) => item.findingId),
          title: customerCopy(representative.title),
          description: customerCopy(representative.description),
          category: representative.category,
          priority: highestPriority(group),
          status: representative.status,
          estimatedEffort: representative.estimatedEffort,
          expectedImpact: representative.expectedImpact,
          confidence: confidenceValue(representative.confidence),
          classification,
          affectedPages: uniqueBy(
            [
              ...affectedPages,
              ...linkedFindings.flatMap((finding) => finding.affectedPages),
            ],
            (page) => page.pageId,
          ),
          evidenceIds,
          evidenceSummary: customerCopy(
            linkedFindings[0]?.simpleExplanation ??
              representative.evidenceSummary,
          ),
          whyItMatters: customerCopy(representative.businessRelevance),
          expectedOutcome: expectedOutcomeFor(representative.category),
          completionCriteria:
            representative.completionCriteria ??
            linkedFindings[0]?.completionCriteria ??
            null,
          verificationMethod:
            representative.verificationMethod ??
            linkedFindings[0]?.verificationMethod ??
            null,
          suggestedSpecialistCategory:
            representative.suggestedSpecialistCategory ??
            linkedFindings[0]?.suggestedSpecialistCategory ??
            null,
        } satisfies CanonicalRecommendation,
      ];
    })
    .sort(recommendationSort);
}

function buildCanonicalView({
  source,
  businessName,
  facts,
  findings,
  recommendations,
  priorities,
  scores,
  score,
  pagePurposes,
  reportVersion,
}: {
  source: AuditReportViewModel;
  businessName: string;
  facts: CanonicalFactsSummary;
  findings: CanonicalFinding[];
  recommendations: CanonicalRecommendation[];
  priorities: CanonicalRecommendation[];
  scores: AuditReportViewModel["scores"];
  score: number;
  pagePurposes: CanonicalPagePurpose[];
  reportVersion: string;
}) {
  const view = structuredClone(source) as AuditReportViewModel;
  delete view.canonicalReport;
  delete view.reportIntegrity;
  delete view.canonicalFacts;
  delete view.pagePurposes;
  view.business.name = businessName;
  view.audit.overallScore = score;
  view.audit.healthLabel = healthLabel(score);
  view.audit.executiveSummary = executiveSummary({
    businessName,
    score,
    findings,
    priorities,
  });
  view.scores = scores;
  const reportFindings = findings.map((finding) =>
    reportFindingFromCanonical(finding, source.findings.all),
  );
  view.findings = groupReportFindings(reportFindings);
  view.technicalAppendix.findings = reportFindings;
  const reportRecommendations = recommendations.map((item) =>
    reportRecommendationFromCanonical(item, source.recommendations.all),
  );
  const priorityIds = new Set(
    priorities.map((item) => item.recommendationId),
  );
  view.recommendations = {
    primary: reportRecommendations.filter((item) => priorityIds.has(item.id)),
    technical: reportRecommendations.filter(
      (item) => item.technical && !priorityIds.has(item.id),
    ),
    all: reportRecommendations,
    completed: reportRecommendations.filter(
      (item) => item.status === RecommendationStatus.COMPLETED,
    ).length,
    total: reportRecommendations.length,
  };
  view.nextMoves = priorities.map((item) => ({
    title: item.title,
    whyItMatters: item.whyItMatters,
    expectedOutcome: item.expectedOutcome,
    evidence: item.evidenceSummary,
    implementationAction: item.description,
    category: item.category,
    effort: item.estimatedEffort,
    impact: item.expectedImpact,
  }));
  view.progress.comparison.summary = customerProgressCopy(
    view.progress.comparison.summary,
  );
  view.progress.note = customerProgressCopy(view.progress.note);
  view.confidence.crawlStatus = customerCopy(view.confidence.crawlStatus);
  view.confidence.limitations = view.confidence.limitations.map(customerCopy);
  view.dataNotes = view.dataNotes.map(customerCopy);
  if (view.coverage) {
    view.coverage = {
      ...view.coverage,
      crawl: {
        ...view.coverage.crawl,
        explanation: customerCopy(view.coverage.crawl.explanation),
      },
      technical: {
        ...view.coverage.technical,
        explanation: customerCopy(view.coverage.technical.explanation),
      },
      aiContent: {
        ...view.coverage.aiContent,
        explanation: customerCopy(view.coverage.aiContent.explanation),
      },
      socialProfiles: {
        ...view.coverage.socialProfiles,
        explanation: customerCopy(view.coverage.socialProfiles.explanation),
      },
      reviews: {
        ...view.coverage.reviews,
        explanation: customerCopy(view.coverage.reviews.explanation),
      },
      competitors: {
        ...view.coverage.competitors,
        explanation: customerCopy(view.coverage.competitors.explanation),
      },
    };
  }
  view.scoringMetadata.reportViewModelVersion = reportVersion;
  if (view.websiteCrawl) {
    view.websiteCrawl.pagesScanned = facts.pagesScanned;
    view.websiteCrawl.successfulPages = facts.successfulPages;
    view.websiteCrawl.failedPages = facts.failedPages;
    view.websiteCrawl.pagesMissingTitle = facts.pagesMissingTitles.length;
    view.websiteCrawl.pagesMissingMetaDescription =
      facts.pagesMissingMetaDescriptions.length;
    view.websiteCrawl.pagesWithNoH1 = facts.pagesWithNoH1.length;
    view.websiteCrawl.pagesWithMultipleH1 = facts.pagesWithMultipleH1.length;
    view.websiteCrawl.totalImages = facts.totalImages;
    view.websiteCrawl.totalImagesMissingAlt = facts.totalImagesMissingAlt;
    view.websiteCrawl.pagesWithNoCTA =
      facts.pagesWithNoDetectedActionLinks.length;
    view.websiteCrawl.pagesWithDetectedActionLinks =
      facts.pagesWithDetectedActionLinks.length;
    view.websiteCrawl.pagesWithAssessedPrimaryCta =
      facts.pagesWithAssessedPrimaryCta.length;
  }
  view.technicalAppendix.pagesWithNoDetectedActionLinks =
    facts.pagesWithNoDetectedActionLinks.length;
  view.technicalAppendix.pagesWithDetectedActionLinks =
    facts.pagesWithDetectedActionLinks.length;
  view.technicalAppendix.pagesWithAssessedPrimaryCta =
    facts.pagesWithAssessedPrimaryCta.length;
  view.confidence.pagesScanned = facts.successfulPages;
  view.confidence.importantPagesIncluded = pagePurposes
    .filter((item) =>
      [
        "DEDICATED_PAGE",
        "EQUIVALENT_SECTION",
        "EQUIVALENT_CONVERSION_PATH",
      ].includes(item.status),
    )
    .map((item) => item.purpose);
  return view as CanonicalViewSnapshot;
}

function affectedPagesForUrls({
  urls,
  evidence,
  pageIndex,
  category,
  sourceId,
  strict,
  issues,
}: {
  urls: string[];
  evidence: AuditEvidenceRecord[];
  pageIndex: Map<string, CanonicalPage>;
  category: ScoreCategory;
  sourceId: string;
  strict: boolean;
  issues: CanonicalReportIntegrityIssue[];
}) {
  const result: CanonicalAffectedPage[] = [];
  const requestedKeys = new Set<string>();
  let evidenceMismatch = false;
  for (const value of urls) {
    const parsed = canonicalReportUrl(value);
    if (!parsed) {
      issues.push({
        code: "BROKEN_URL",
        severity: strict ? "ERROR" : "WARNING",
        sourceId,
        message: "A finding or recommendation contains an invalid URL.",
      });
      continue;
    }
    requestedKeys.add(parsed.identityKey);
    const page = pageIndex.get(parsed.identityKey);
    if (!page) {
      if (category === ScoreCategory.WEBSITE || category === ScoreCategory.SEO) {
        issues.push({
          code: "UNKNOWN_AFFECTED_PAGE",
          severity: strict ? "ERROR" : "WARNING",
          sourceId,
          message: "An affected page is not part of the saved audit page set.",
        });
      }
      continue;
    }
    const pageEvidence = evidence.filter((item) => {
      if (!item.sourceUrl) return false;
      return canonicalReportUrl(item.sourceUrl)?.identityKey === page.identityKey;
    });
    result.push({
      ...canonicalFactPage(page),
      evidenceIds: pageEvidence.map((item) => item.id),
    });
  }
  for (const item of evidence) {
    if (!item.sourceUrl || requestedKeys.size === 0) continue;
    const evidenceKey = canonicalReportUrl(item.sourceUrl)?.identityKey;
    if (evidenceKey && !requestedKeys.has(evidenceKey)) {
      evidenceMismatch = true;
      issues.push({
        code: "EVIDENCE_PAGE_MISMATCH",
        severity: strict ? "ERROR" : "WARNING",
        sourceId,
        message: "Evidence belongs to a different page than the finding claims.",
      });
    }
  }
  if (
    strict &&
    (category === ScoreCategory.WEBSITE || category === ScoreCategory.SEO) &&
    result.some((page) => page.evidenceIds.length === 0)
  ) {
    evidenceMismatch = true;
    issues.push({
      code: "EVIDENCE_PAGE_MISMATCH",
      severity: "ERROR",
      sourceId,
      message: "At least one affected page has no evidence linked to that page.",
    });
  }
  if (strict && evidenceMismatch) return [];
  return uniqueBy(result, (page) => page.pageId);
}

function isTechnicalSupportEvidence(evidence: AuditEvidenceRecord) {
  return (
    evidence.type === "ROBOTS_TXT_STATUS" ||
    evidence.type === "SITEMAP_STATUS"
  );
}

function isTechnicalSupportUrl(
  value: string,
  evidence: AuditEvidenceRecord[],
) {
  const identity = canonicalReportUrl(value)?.identityKey;
  if (!identity) return false;
  return evidence.some(
    (item) =>
      isTechnicalSupportEvidence(item) &&
      item.sourceUrl &&
      canonicalReportUrl(item.sourceUrl)?.identityKey === identity,
  );
}

function correctedClassification({
  finding,
  rootCauseKey,
  pages,
  source,
}: {
  finding: ReportFinding;
  rootCauseKey: string;
  pages: CanonicalPage[];
  source: AuditReportViewModel;
}): CanonicalFindingClassification {
  const initial = classificationFromFindingType(finding.findingType);
  const text = `${finding.title} ${finding.description}`.toLowerCase();
  if (
    /SEO_INDEXABILITY_COVERAGE|SEO_AGGREGATE_COVERAGE/.test(rootCauseKey) ||
    /indexability checks found issues|homepage seo signals need cleanup|seo metadata needs improvement/.test(
      text,
    )
  ) {
    return "COVERAGE_NOTE";
  }
  if (
    initial === "VERIFIED_TECHNICAL_ISSUE" &&
    confidenceValue(finding.confidence) === "LOW"
  ) {
    return "LIMITATION";
  }
  if (
    /TITLE_QUALITY/.test(rootCauseKey) &&
    source.normalizedFacts?.homepage?.title.value
  ) {
    return /length|characters?|too short|too long/.test(text)
      ? "OPTIONAL_REFINEMENT"
      : "AI_REVIEWED_OPPORTUNITY";
  }
  if (
    /PRIMARY_CTA_CLARITY/.test(rootCauseKey) &&
    pages.some((page) => page.detectedActionLinkCount > 0)
  ) {
    return "AI_REVIEWED_OPPORTUNITY";
  }
  if (
    initial === "VERIFIED_TECHNICAL_ISSUE" &&
    /could be clearer|more descriptive|more prominent|improve wording/.test(text)
  ) {
    return "AI_REVIEWED_OPPORTUNITY";
  }
  return initial;
}

function scoreTraceFromBreakdowns(
  breakdowns: ScoreBreakdown[],
  findings: CanonicalFinding[],
) {
  return breakdowns.flatMap((breakdown) =>
    breakdown.components.flatMap((component) => {
      if (component.contribution >= 0) return [];
      const rootCauseKey = component.key;
      const finding = findings.find(
        (item) => item.rootCauseKey === rootCauseKey,
      );
      return [
        {
          findingId: finding?.findingId ?? null,
          rootCauseKey,
          category: breakdown.category,
          classification: finding?.classification ?? null,
          deduction: Math.abs(component.contribution),
          cap: Math.abs(component.contribution),
          evidenceIds: component.evidenceIds,
          explanation: customerCopy(component.explanation),
        },
      ];
    }),
  );
}

function reportFindingFromCanonical(
  finding: CanonicalFinding,
  sourceFindings: ReportFinding[],
): ReportFinding {
  const original = sourceFindings.find((item) => item.id === finding.findingId);
  const findingType = findingTypeFromClassification(finding.classification);
  return {
    ...(original ?? {
      id: finding.findingId,
      category: finding.category,
      severity: finding.severity ?? FindingSeverity.INFO,
      source: "selected_audit" as const,
    }),
    id: finding.findingId,
    title: finding.title,
    description: finding.simpleExplanation,
    category: finding.category,
    severity: finding.severity ?? FindingSeverity.INFO,
    findingType,
    source:
      finding.classification === "AI_REVIEWED_OPPORTUNITY"
        ? "ai_reviewed_opportunity"
        : (original?.source ?? "selected_audit"),
    sourceLabel: findingTypeLabels[findingType],
    sourceUrl: finding.affectedPages.at(0)?.url ?? null,
    evidenceSummary: finding.simpleExplanation,
    confidence: displayConfidence(finding.confidence),
    whyItMatters: finding.whyItMatters,
    suggestedAction: finding.recommendedAction,
    whoCanHelp: finding.suggestedSpecialistCategory,
    howOnreadWillCheck: finding.verificationMethod,
    supportingEvidenceIds: finding.evidenceIds,
    stableKey: finding.stableKey,
    rootCauseKey: finding.rootCauseKey,
    affectedUrls: finding.affectedPages.map((page) => page.url),
    affectedPages: finding.affectedPages,
    completionCriteria: finding.completionCriteria,
    verificationMethod: finding.verificationMethod,
    suggestedSpecialistCategory: finding.suggestedSpecialistCategory,
    scoreImpact: finding.scoreImpact,
  };
}

function reportRecommendationFromCanonical(
  item: CanonicalRecommendation,
  sourceRecommendations: ReportRecommendation[],
): ReportRecommendation {
  const original = sourceRecommendations.find(
    (recommendation) => recommendation.id === item.recommendationId,
  );
  return {
    ...(original ?? {
      id: item.recommendationId,
      sourceCategory: item.category,
      sourceFindingId: item.sourceFindingIds[0] ?? null,
      freshness: "Current audit" as const,
      technical: item.classification === "VERIFIED_TECHNICAL_ISSUE",
    }),
    id: item.recommendationId,
    title: item.title,
    description: item.description,
    category: item.category,
    priority: item.priority,
    status: item.status,
    estimatedEffort: item.estimatedEffort,
    expectedImpact: item.expectedImpact,
    evidenceSummary: item.evidenceSummary,
    businessRelevance: item.whyItMatters,
    confidence: displayConfidence(item.confidence),
    sourceUrl: item.affectedPages.at(0)?.url ?? null,
    sourceFindingId: item.sourceFindingIds.at(0) ?? null,
    technical: item.classification === "VERIFIED_TECHNICAL_ISSUE",
    sourceLabel:
      findingTypeLabels[findingTypeFromClassification(item.classification)],
    rootCauseKey: item.rootCauseKey,
    issueKey:
      original?.issueKey ??
      canonicalRecommendationIssueKey({
        title: item.title,
        description: item.description,
        category: item.category,
        evidence: original?.canonicalEvidence,
      }),
    affectedUrls: item.affectedPages.map((page) => page.url),
    affectedPages: item.affectedPages,
    evidenceIds: item.evidenceIds,
    completionCriteria: item.completionCriteria,
    verificationMethod: item.verificationMethod,
    suggestedSpecialistCategory: item.suggestedSpecialistCategory,
  };
}

function groupReportFindings(findings: ReportFinding[]) {
  const strengths = findings.filter(
    (item) => item.findingType === "VERIFIED_STRENGTH",
  );
  const warnings = findings.filter(
    (item) =>
      item.findingType === "VERIFIED_TECHNICAL_ISSUE" ||
      item.findingType === "LIMITATION",
  );
  const assigned = new Set([...strengths, ...warnings].map((item) => item.id));
  return {
    strengths,
    warnings,
    opportunities: findings.filter((item) => !assigned.has(item.id)),
    all: findings,
  };
}

function canonicalBusinessName(source: AuditReportViewModel) {
  const saved = cleanReportCopy(source.business.name);
  const hostname = canonicalReportUrl(
    source.website?.normalizedUrl ?? source.business.initialInput,
  )?.hostname.replace(/\.[a-z]{2,}$/i, "");
  const compactSaved = saved.toLowerCase().replace(/[^a-z0-9]/g, "");
  const compactHost = hostname?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const looksDomainDerived =
    Boolean(compactHost) && compactSaved === compactHost && !/\s/.test(saved);
  if (!looksDomainDerived) return saved;

  const titleCandidate = source.website?.pageTitle
    ?.split(/\s+[|\-:–]\s+/)[0]
    ?.trim();
  if (
    titleCandidate &&
    titleCandidate.split(/\s+/).length <= 8 &&
    titleCandidate.replace(/[^a-z0-9]/gi, "").length >= saved.length * 0.7
  ) {
    return cleanReportCopy(titleCandidate);
  }
  return saved;
}

function executiveSummary({
  businessName,
  score,
  findings,
  priorities,
}: {
  businessName: string;
  score: number;
  findings: CanonicalFinding[];
  priorities: CanonicalRecommendation[];
}) {
  const issues = findings.filter(
    (item) =>
      item.classification === "VERIFIED_TECHNICAL_ISSUE" ||
      item.classification === "AI_REVIEWED_OPPORTUNITY",
  );
  const strengths = findings.filter(
    (item) => item.classification === "VERIFIED_STRENGTH",
  );
  return customerCopy(
    [
      `${businessName} has a ${score}/100 Website Growth Score based on the pages and signals saved in this audit.`,
      strengths[0]
        ? `What is working: ${sentenceFragment(strengths[0].title)}.`
        : null,
      issues[0]
        ? `Main opportunity: ${sentenceFragment(issues[0].title)}.`
        : "No high-confidence issue was published from the available evidence.",
      priorities[0]
        ? `Start here: ${sentenceFragment(priorities[0].title)}.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function customerCopy(value: string) {
  return cleanReportCopy(value)
    .replace(
      /\bdeterministic (?:analyzer|analysis|fallback|checks?)\b/gi,
      "saved analysis",
    )
    .replace(/\bnormalized facts?\b/gi, "saved audit evidence")
    .replace(/\beligible canonical pages?\b/gi, "pages included in this audit")
    .replace(/\baudit-report-v\d+[\w-]*\b/gi, "")
    .replace(/\bcomparable with disclosed coverage differences\b/gi, "comparison available with coverage notes")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function customerReportCopy(value: string) {
  return customerCopy(value);
}

function customerProgressCopy(value: string) {
  return customerCopy(value).replace(
    /the analyzer found a different set of saved findings(?: in this category)?\.?(?: review the new and resolved findings for the observable evidence\.)?/gi,
    "This audit captured different website evidence. Review the new and resolved findings before treating the score change as an intentional improvement.",
  );
}

function evidenceForRoot(evidence: AuditEvidenceRecord[], root: string) {
  const normalized = root.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return evidence.filter((item) =>
    item.issueKeys.some(
      (key) => {
        const evidenceRoot = canonicalRecommendationRootCauseKey({
          title: "",
          description: "",
          category: ScoreCategory.WEBSITE,
          evidence: null,
          issueKey: key,
        });
        const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
        return (
          evidenceRoot === root ||
          normalizedKey.includes(normalized) ||
          normalized.includes(normalizedKey)
        );
      },
    ),
  );
}

function rootCauseForFinding(finding: ReportFinding) {
  return canonicalRecommendationRootCauseKey({
    title: finding.title,
    description: finding.description,
    category: finding.category,
    evidence: null,
  });
}

function classificationFromFindingType(
  value: AuditFindingType | undefined,
): CanonicalFindingClassification {
  if (value === "COVERAGE_INFORMATION" || value === "OBSERVATION") {
    return "COVERAGE_NOTE";
  }
  return value ?? "LIMITATION";
}

function classificationFromRecommendation(
  recommendation: ReportRecommendation,
): CanonicalFindingClassification {
  if (recommendation.sourceLabel === "AI-reviewed opportunity") {
    return "AI_REVIEWED_OPPORTUNITY";
  }
  if (recommendation.sourceLabel === "Optional refinement") {
    return "OPTIONAL_REFINEMENT";
  }
  return recommendation.technical
    ? "VERIFIED_TECHNICAL_ISSUE"
    : "AI_REVIEWED_OPPORTUNITY";
}

function findingTypeFromClassification(
  value: CanonicalFindingClassification,
): AuditFindingType {
  return value === "COVERAGE_NOTE" ? "COVERAGE_INFORMATION" : value;
}

function findingDeduction(finding: CanonicalFinding) {
  const severity: Record<FindingSeverity, number> = {
    CRITICAL: 18,
    HIGH: 14,
    MEDIUM: 8,
    LOW: 3,
    INFO: 0,
  };
  const base = finding.severity ? severity[finding.severity] : 0;
  const classificationMultiplier =
    finding.classification === "VERIFIED_TECHNICAL_ISSUE" ? 1 : 0.55;
  const confidenceMultiplier = finding.confidence === "HIGH" ? 1 : 0.75;
  const pageMultiplier = Math.min(
    1.45,
    1 + Math.max(0, finding.affectedPages.length - 1) * 0.1,
  );
  return Math.max(
    0,
    Math.round(
      base * classificationMultiplier * confidenceMultiplier * pageMultiplier,
    ),
  );
}

function canonicalFactPage(page: CanonicalPage): CanonicalFactPage {
  return {
    pageId: page.pageId,
    url: page.url,
    path: page.path,
    label: page.label,
  };
}

function homepageFromWebsite(source: AuditReportViewModel): CrawledPageResult {
  const website = source.website!;
  return {
    url: website.finalUrl ?? website.normalizedUrl,
    requestedUrl: website.requestedUrl,
    finalUrl: website.finalUrl,
    statusCode: website.statusCode ?? 200,
    analysisStatus: website.fetchStatus === "failed" ? "FAILED" : "ANALYZED",
    title: website.pageTitle,
    metaDescription: website.metaDescription,
    h1Count: website.h1Count,
    h1Text: website.h1Text,
    hasCanonical: website.hasCanonical,
    hasViewportMeta: website.hasViewportMeta,
    imageCount: website.imageCount,
    imagesMissingAltCount: website.imagesMissingAltCount,
    internalLinksCount: website.internalLinksCount,
    externalLinksCount: website.externalLinksCount,
    ctaCandidates: website.ctaCandidates,
    actionSummary: website.actionSummary,
    interactionEvidence: website.interactionEvidence,
    contactEvidence: website.contactEvidence,
    wordCount: 0,
    warnings: website.warnings,
    score: website.score,
    pageTypes: ["Homepage"],
    hasContactInfo: website.hasContactLink,
    contactSignals: [],
    detectedAddress: website.detectedAddress,
    detectedPhone: website.detectedPhone,
    detectedGoogleMapsLinks: website.detectedGoogleMapsLinks,
    detectedMapEmbeds: website.detectedMapEmbeds,
    detectedLocalBusinessSchema: website.detectedLocalBusinessSchema,
    operatingHoursSignals: website.operatingHoursSignals,
    contentExcerpt: website.contentExcerpt,
  };
}

function reviveViewDates(view: AuditReportViewModel) {
  view.audit.date = new Date(view.audit.date);
  view.audit.completedAt = view.audit.completedAt
    ? new Date(view.audit.completedAt)
    : null;
  view.competitors.snapshotDate = view.competitors.snapshotDate
    ? new Date(view.competitors.snapshotDate)
    : null;
  view.competitors.businessAuditDate = new Date(
    view.competitors.businessAuditDate,
  );
  view.competitors.freshness.generatedAt = view.competitors.freshness.generatedAt
    ? new Date(view.competitors.freshness.generatedAt)
    : null;
  view.socialStrategy.freshness.generatedAt =
    view.socialStrategy.freshness.generatedAt
      ? new Date(view.socialStrategy.freshness.generatedAt)
      : null;
}

function recommendationSort(
  left: CanonicalRecommendation,
  right: CanonicalRecommendation,
) {
  const priority = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const impact: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const effort: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
  return (
    priority[left.priority] - priority[right.priority] ||
    (impact[left.expectedImpact] ?? 1) - (impact[right.expectedImpact] ?? 1) ||
    (effort[left.estimatedEffort] ?? 1) - (effort[right.estimatedEffort] ?? 1) ||
    left.title.localeCompare(right.title)
  );
}

function reportRecommendationSort(
  left: ReportRecommendation,
  right: ReportRecommendation,
) {
  const priority = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return (
    priority[left.priority] - priority[right.priority] ||
    left.title.localeCompare(right.title)
  );
}

function highestPriority(items: ReportRecommendation[]) {
  const priority = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...items].sort(
    (left, right) => priority[right.priority] - priority[left.priority],
  )[0].priority;
}

function confidenceValue(value: "High" | "Medium" | "Low" | undefined) {
  return value === "High" ? "HIGH" : value === "Medium" ? "MEDIUM" : "LOW";
}

function displayConfidence(value: "HIGH" | "MEDIUM" | "LOW") {
  return value === "HIGH" ? "High" : value === "MEDIUM" ? "Medium" : "Low";
}

function expectedOutcomeFor(category: ScoreCategory) {
  const outcomes: Record<ScoreCategory, string> = {
    OVERALL: "A clearer, evidence-based next step.",
    WEBSITE: "A clearer visitor journey and easier next step.",
    SEO: "Clearer page information for people and search engines.",
    BRANDING: "More consistent and recognizable public messaging.",
    SOCIAL: "A more focused public profile and content direction.",
    REVIEWS: "Stronger visible trust at customer decision points.",
    COMPETITORS: "A clearer response to observed competitor strengths.",
  };
  return outcomes[category];
}

function whyCategoryMatters(category: ScoreCategory) {
  const values: Record<ScoreCategory, string> = {
    OVERALL: "It affects the order in which the business should improve its online presence.",
    WEBSITE: "It can affect how quickly visitors understand the offer and take action.",
    SEO: "It can affect how clearly people and search engines understand the page.",
    BRANDING: "It can affect whether the business feels consistent and trustworthy.",
    SOCIAL: "It can affect whether profile visitors understand what to do next.",
    REVIEWS: "It can affect whether potential customers see enough trust to act.",
    COMPETITORS: "It can help the business respond to public differences without guessing.",
  };
  return values[category];
}

function healthLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Fair";
  return "Needs Attention";
}

function dateString(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function sentenceFragment(value: string) {
  return value.trim().replace(/[.!?]+$/, "");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

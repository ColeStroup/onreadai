import { BusinessGoal } from "@prisma/client";
import { createHash } from "node:crypto";

import type {
  CrawledPageResult,
  WebsiteCrawlResult,
} from "@/lib/analyzers/website-crawler";
import type { PageSelectionSnapshot } from "@/lib/audits/selective-ai/types";

export const PAGE_SELECTION_VERSION = "selective-page-selection-v1";

export const deepAnalysisPageLimits = [
  { maximumCrawledPages: 10, maximumSelectedPages: 10 },
  { maximumCrawledPages: 25, maximumSelectedPages: 12 },
  { maximumCrawledPages: 50, maximumSelectedPages: 18 },
  { maximumCrawledPages: Number.POSITIVE_INFINITY, maximumSelectedPages: 24 },
] as const;

export type PageSelectionResult = {
  maximumSelectedPages: number;
  eligiblePages: number;
  selectedPages: CrawledPageResult[];
  pages: PageSelectionSnapshot[];
};

type RankedPage = {
  page: CrawledPageResult;
  pageType: string;
  score: number;
  reasons: string[];
  utility: boolean;
  duplicateCanonical: boolean;
  eligible: boolean;
  templateGroup: string;
  diversityGroup: string;
};

const utilityPathPattern =
  /(?:^|\/)(?:privacy|terms|terms-of-service|cookie|cookies|accessibility|legal|login|log-in|signin|sign-in|account|cart|checkout|search|feed|rss|author|tag|print|printer|printer-friendly|page\/\d+)(?:\/|$)/i;
const utilityTitlePattern =
  /\b(?:privacy policy|terms (?:of service|and conditions)|cookie policy|accessibility statement|sign in|log in|shopping cart|search results)\b/i;

export function deepAnalysisLimitForPageCount(pageCount: number) {
  const normalizedCount = Math.max(0, Math.round(pageCount));
  return deepAnalysisPageLimits.find(
    (item) => normalizedCount <= item.maximumCrawledPages,
  )!.maximumSelectedPages;
}

export function selectPagesForAiReview({
  crawl,
  goals = [],
  primaryGoal = null,
}: {
  crawl: WebsiteCrawlResult;
  goals?: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
}): PageSelectionResult {
  const maximumSelectedPages = deepAnalysisLimitForPageCount(
    crawl.pageResults.length,
  );
  const initiallyRanked = crawl.pageResults.map((page) =>
    rankPage({ page, goals, primaryGoal }),
  );
  const canonicalRepresentatives = selectCanonicalRepresentatives(
    initiallyRanked,
  );
  const ranked = initiallyRanked.map((item) => {
    const canonicalKey = sameSiteCanonicalKey(item.page);
    const representativeUrl = canonicalKey
      ? canonicalRepresentatives.get(canonicalKey)
      : null;
    const duplicateCanonical = Boolean(
      representativeUrl && representativeUrl !== pageKey(item.page),
    );

    return {
      ...item,
      duplicateCanonical,
      eligible: item.eligible && !duplicateCanonical,
    };
  });
  const eligible = ranked.filter((item) => item.eligible);
  const selected = new Set<string>();
  const groupCounts = new Map<string, number>();

  const add = (item?: RankedPage) => {
    if (!item || selected.size >= maximumSelectedPages) return;
    const key = pageKey(item.page);
    if (selected.has(key)) return;
    selected.add(key);
    groupCounts.set(
      item.templateGroup,
      (groupCounts.get(item.templateGroup) ?? 0) + 1,
    );
  };

  const sorted = [...eligible].sort(
    (left, right) =>
      right.score - left.score ||
      pageKey(left.page).localeCompare(pageKey(right.page)),
  );

  if (crawl.pageResults.length <= 10) {
    for (const item of sorted) add(item);
  } else {
    add(sorted.find((item) => item.pageType === "Homepage"));

    for (const diversityGroup of [
      "PRIMARY_OFFER",
      "CONVERSION",
      "TRUST",
      "LOCAL",
      "CONTENT",
      "ANOMALY",
    ]) {
      add(sorted.find((item) => item.diversityGroup === diversityGroup));
    }

    for (const item of sorted) {
      if (selected.size >= maximumSelectedPages) break;
      const selectedFromGroup = groupCounts.get(item.templateGroup) ?? 0;
      const isHighValue =
        item.pageType === "Homepage" ||
        item.diversityGroup === "CONVERSION" ||
        item.diversityGroup === "ANOMALY";

      if (selectedFromGroup >= (isHighValue ? 2 : 1)) continue;
      add(item);
    }
  }

  const selectedGroups = new Set(
    ranked
      .filter((item) => selected.has(pageKey(item.page)))
      .map((item) => item.templateGroup),
  );
  const pages = ranked.map<PageSelectionSnapshot>((item) => {
    const isSelected = selected.has(pageKey(item.page));
    const duplicateRepresentative =
      item.duplicateCanonical ||
      (item.eligible && !isSelected && selectedGroups.has(item.templateGroup));
    const analysisCoverage = item.page.analysisStatus !== "ANALYZED"
      ? "CRAWL_FAILED"
      : item.utility
        ? "EXCLUDED_UTILITY_PAGE"
        : duplicateRepresentative
          ? "DUPLICATE_REPRESENTATIVE"
          : "DETERMINISTIC_ONLY";
    const reasons = [...item.reasons];

    if (item.utility) reasons.push("Utility or policy page");
    if (item.duplicateCanonical) {
      reasons.push(
        "Shares a same-site canonical URL with a higher-priority representative",
      );
    }
    if (duplicateRepresentative) {
      reasons.push("A representative page from this template group was selected");
    }
    if (isSelected) reasons.push("Selected for deep AI review");

    return {
      url: item.page.url,
      canonicalUrl: item.page.canonicalUrl ?? null,
      pageType: item.pageType,
      selected: isSelected,
      importanceScore: item.score,
      selectionReasons: unique(reasons),
      analysisCoverage,
      aiReviewStatus: isSelected ? "PENDING" : "NOT_SELECTED",
      cacheStatus: isSelected ? "PENDING" : "NOT_APPLICABLE",
      contentHash: item.page.contentHash ?? fallbackContentHash(item.page),
      metadataHash: item.page.metadataHash ?? fallbackMetadataHash(item.page),
      templateGroup: item.templateGroup,
      title: item.page.title,
      h1Text: item.page.h1Text.slice(0, 2),
      wordCount: item.page.wordCount,
      primaryCtaText:
        item.page.actionSummary?.primaryCtaAssessment?.primaryCtaText ?? null,
      indexable:
        item.page.analysisStatus === "ANALYZED"
          ? item.page.indexable ?? null
          : null,
      canonicalStatus:
        item.page.analysisStatus !== "ANALYZED"
          ? "UNKNOWN"
          : item.page.hasCanonical
            ? "PRESENT"
            : "MISSING",
      technicalFindingCount: technicalFindingCount(item.page),
      majorTechnicalCategories: technicalCategories(item.page),
      contentExcerpt: item.page.contentExcerpt?.slice(0, 320) ?? null,
      analysisCacheId: null,
      contentTruncated: false,
    };
  });

  return {
    maximumSelectedPages,
    eligiblePages: eligible.length,
    selectedPages: sorted
      .filter((item) => selected.has(pageKey(item.page)))
      .map((item) => item.page),
    pages,
  };
}

function rankPage({
  page,
  goals,
  primaryGoal,
}: {
  page: CrawledPageResult;
  goals: BusinessGoal[];
  primaryGoal: BusinessGoal | null;
}): RankedPage {
  const pageType = primaryPageType(page);
  const utility = isUtilityPage(page);
  const analyzed = page.analysisStatus === "ANALYZED";
  const hasContent = Boolean(page.analysisContent || page.contentExcerpt);
  const reasons: string[] = [];
  let score = 0;

  const typeScore = pageTypeImportance(pageType);
  score += typeScore;
  if (typeScore >= 35) reasons.push(`${pageType} is a high-value business page`);
  else if (typeScore >= 20) reasons.push(`${pageType} supports customer decisions`);

  if (page.inPrimaryNavigation) {
    score += 18;
    reasons.push("Linked from primary navigation");
  }

  const prominence = Math.min(15, Math.max(0, page.internalLinkProminence ?? 0));
  if (prominence > 1) {
    score += prominence;
    reasons.push(`Linked internally from ${prominence} observed page locations`);
  }

  const goalScore = goalRelevanceScore(page, goals, primaryGoal);
  if (goalScore > 0) {
    score += goalScore;
    reasons.push("Relevant to selected business goals");
  }

  const conversionSignals =
    page.actionSummary?.detectedActionLinkCount ?? page.ctaCandidates.length;
  if (
    conversionSignals > 0 ||
    /Pricing|Contact|Demo|Reservations|Order|Store|Products/i.test(pageType)
  ) {
    score += 14;
    reasons.push("Supports a customer conversion path");
  }

  const anomalyScore = deterministicAnomalyScore(page);
  if (anomalyScore > 0) {
    score += anomalyScore;
    reasons.push("Deterministic checks found content or conversion anomalies");
  }

  if (page.wordCount >= 1_800) {
    score += 8;
    reasons.push("Unusually content-heavy page");
  }

  if (page.contentHash) score += 3;
  if (utility) score -= 100;
  if (!analyzed) score -= 200;
  if (!hasContent) score -= 50;

  return {
    page,
    pageType,
    score: Math.max(0, Math.round(score)),
    reasons,
    utility,
    duplicateCanonical: false,
    eligible: analyzed && hasContent && !utility,
    templateGroup: templateGroup(page, pageType),
    diversityGroup: diversityGroup(page, pageType, anomalyScore),
  };
}

function selectCanonicalRepresentatives(items: RankedPage[]) {
  const representatives = new Map<string, RankedPage>();

  for (const item of items) {
    const canonicalKey = sameSiteCanonicalKey(item.page);
    if (!canonicalKey || !item.eligible) continue;

    const current = representatives.get(canonicalKey);
    if (
      !current ||
      item.score > current.score ||
      (item.score === current.score &&
        pageKey(item.page).localeCompare(pageKey(current.page)) < 0)
    ) {
      representatives.set(canonicalKey, item);
    }
  }

  return new Map(
    [...representatives].map(([canonicalKey, item]) => [
      canonicalKey,
      pageKey(item.page),
    ]),
  );
}

function sameSiteCanonicalKey(page: CrawledPageResult) {
  if (!page.canonicalUrl) return null;

  try {
    const pageUrl = new URL(page.url);
    const canonicalUrl = new URL(page.canonicalUrl, pageUrl);
    if (normalizedHostname(pageUrl.hostname) !== normalizedHostname(canonicalUrl.hostname)) {
      return null;
    }

    canonicalUrl.hash = "";
    canonicalUrl.hostname = normalizedHostname(canonicalUrl.hostname);
    if (
      (canonicalUrl.protocol === "https:" && canonicalUrl.port === "443") ||
      (canonicalUrl.protocol === "http:" && canonicalUrl.port === "80")
    ) {
      canonicalUrl.port = "";
    }
    return canonicalUrl.toString();
  } catch {
    return null;
  }
}

function normalizedHostname(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}

function primaryPageType(page: CrawledPageResult) {
  return (
    page.pageTypes.find((type) => type === "Homepage") ??
    page.pageTypes.find((type) =>
      /Pricing|Services|Products|Demo|Reservations|Order|Contact/i.test(type),
    ) ??
    page.pageTypes.at(0) ??
    "General"
  );
}

function pageTypeImportance(pageType: string) {
  if (pageType === "Homepage") return 70;
  if (/Services|Products|Features|Use Cases|Menu/i.test(pageType)) return 46;
  if (/Pricing|Demo|Reservations|Order|Store/i.test(pageType)) return 44;
  if (/Contact|Location|Hours|Map/i.test(pageType)) return 34;
  if (/About|Testimonials|Reviews|Gallery/i.test(pageType)) return 28;
  if (/Blog|Resources|FAQ|Docs|Help|Events/i.test(pageType)) return 20;
  return 12;
}

function deterministicAnomalyScore(page: CrawledPageResult) {
  let score = 0;
  if (!page.title || !page.metaDescription) score += 8;
  if (page.h1Count !== 1) score += 9;
  if (!page.actionSummary?.hasDetectedActionLinks) score += 8;
  if (page.wordCount < 120) score += 12;
  if (page.wordCount > 3_000) score += 6;
  if (page.warnings.length > 0) score += Math.min(10, page.warnings.length * 3);
  return score;
}

function goalRelevanceScore(
  page: CrawledPageResult,
  goals: BusinessGoal[],
  primaryGoal: BusinessGoal | null,
) {
  const selected = new Set(primaryGoal ? [primaryGoal, ...goals] : goals);
  const pageText = `${page.pageTypes.join(" ")} ${page.url}`.toLowerCase();
  let score = 0;

  if (
    selected.has(BusinessGoal.IMPROVE_WEBSITE) ||
    selected.has(BusinessGoal.INCREASE_CONVERSIONS) ||
    selected.has(BusinessGoal.MORE_LEADS) ||
    selected.has(BusinessGoal.INCREASE_SALES)
  ) {
    if (/home|service|product|pricing|contact|demo|book|order/.test(pageText)) {
      score += 12;
    }
  }
  if (selected.has(BusinessGoal.IMPROVE_SEO)) {
    if (!page.metaDescription || page.h1Count !== 1 || /blog|service/.test(pageText)) {
      score += 10;
    }
  }
  if (selected.has(BusinessGoal.IMPROVE_LOCAL_VISIBILITY)) {
    if (/location|contact|hours|map|service/.test(pageText)) score += 10;
  }
  if (selected.has(BusinessGoal.IMPROVE_BRANDING)) {
    if (/home|about|testimonial|review|gallery/.test(pageText)) score += 10;
  }

  return primaryGoal && selected.has(primaryGoal) ? score + Math.min(5, score) : score;
}

function isUtilityPage(page: CrawledPageResult) {
  try {
    const url = new URL(page.url);
    return (
      utilityPathPattern.test(url.pathname) ||
      utilityTitlePattern.test(page.title ?? "") ||
      page.pageTypes.some((type) => /Store Policies/i.test(type))
    );
  } catch {
    return true;
  }
}

function diversityGroup(
  page: CrawledPageResult,
  pageType: string,
  anomalyScore: number,
) {
  if (anomalyScore >= 18) return "ANOMALY";
  if (/Services|Products|Features|Use Cases|Menu/i.test(pageType)) {
    return "PRIMARY_OFFER";
  }
  if (/Pricing|Demo|Reservations|Order|Contact|Store/i.test(pageType)) {
    return "CONVERSION";
  }
  if (/About|Testimonials|Reviews|Gallery/i.test(pageType)) return "TRUST";
  if (/Location|Hours|Map/i.test(pageType)) return "LOCAL";
  if (/Blog|Resources|FAQ|Docs|Help|Events/i.test(pageType)) return "CONTENT";
  if (page.pageTypes.includes("Homepage")) return "HOMEPAGE";
  return "GENERAL";
}

function templateGroup(page: CrawledPageResult, pageType: string) {
  if (page.templateGroup) return page.templateGroup;
  if (/Blog|Resources/i.test(pageType)) return "blog-resource";
  if (/Products/i.test(pageType)) return "product";
  if (/Services/i.test(pageType)) return "service";
  if (/Location/i.test(pageType)) return "location";

  try {
    const segments = new URL(page.url).pathname.split("/").filter(Boolean);
    return segments.at(0)?.toLowerCase() ?? "homepage";
  } catch {
    return "unknown";
  }
}

function pageKey(page: CrawledPageResult) {
  return page.url.trim().toLowerCase();
}

function fallbackContentHash(page: CrawledPageResult) {
  return hash(
    JSON.stringify({
      url: page.url,
      title: page.title,
      h1Text: page.h1Text,
      contentExcerpt: page.contentExcerpt ?? null,
      wordCount: page.wordCount,
    }),
  );
}

function fallbackMetadataHash(page: CrawledPageResult) {
  return hash(
    JSON.stringify({
      title: page.title,
      metaDescription: page.metaDescription,
      h1Text: page.h1Text,
      canonicalUrl: page.canonicalUrl ?? null,
      ctaCandidates: page.ctaCandidates,
    }),
  );
}

function technicalFindingCount(page: CrawledPageResult) {
  if (page.analysisStatus !== "ANALYZED") return page.warnings.length || 1;
  return [
    !page.title,
    !page.metaDescription,
    page.h1Count !== 1,
    !page.hasCanonical,
    !page.hasViewportMeta,
    page.imagesMissingAltCount > 0,
    page.indexable === false,
    ...page.warnings.map(() => true),
  ].filter(Boolean).length;
}

function technicalCategories(page: CrawledPageResult) {
  const categories: string[] = [];
  if (!page.title || !page.metaDescription) categories.push("Metadata");
  if (page.h1Count !== 1) categories.push("Headings");
  if (!page.hasCanonical || page.indexable === false) categories.push("Indexability");
  if (!page.hasViewportMeta) categories.push("Mobile");
  if (page.imagesMissingAltCount > 0) categories.push("Image alt text");
  if (!page.actionSummary?.hasDetectedActionLinks) categories.push("Conversion path");
  if (page.analysisStatus !== "ANALYZED") categories.push("Crawl failure");
  return unique(categories);
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

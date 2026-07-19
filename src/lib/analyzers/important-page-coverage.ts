import type {
  CrawledPageResult,
  ImportantPageRecord,
  WebsiteCrawlResult,
} from "@/lib/analyzers/website-crawler";
import {
  crawlUrlKey,
  urlsShareWebsite,
} from "@/lib/analyzers/website-url";

export type ImportantPageCoverageStatus =
  | "Scanned"
  | "Discovered but skipped"
  | "Not detected";

const failedAnalysisWarning =
  /non-html|request returned http|request failed|request timed out|response could not be read|invalid website url/i;

export function wasCrawlPageAnalyzed(page: CrawledPageResult) {
  if (page.analysisStatus) {
    return page.analysisStatus === "ANALYZED";
  }

  return (
    page.statusCode !== null &&
    page.statusCode >= 200 &&
    page.statusCode < 300 &&
    !page.warnings.some((warning) => failedAnalysisWarning.test(warning))
  );
}

function displayPath(url: string) {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function recordKey(record: ImportantPageRecord) {
  if (record.type === "Homepage") {
    return "Homepage";
  }

  try {
    return `${record.type}:${crawlUrlKey(record.url)}`;
  } catch {
    return `${record.type}:${record.url}`;
  }
}

function dedupeRecords(records: ImportantPageRecord[]) {
  const unique = new Map<string, ImportantPageRecord>();

  for (const record of records) {
    const key = recordKey(record);
    if (!unique.has(key)) {
      unique.set(key, record);
    }
  }

  return [...unique.values()];
}

function legacyHomepageRecord(
  crawl: WebsiteCrawlResult,
): ImportantPageRecord | null {
  const entryPage = crawl.pageResults?.[0];

  if (
    !entryPage ||
    !wasCrawlPageAnalyzed(entryPage) ||
    !urlsShareWebsite(crawl.normalizedUrl, entryPage.url)
  ) {
    return null;
  }

  return {
    type: "Homepage",
    url: entryPage.url,
    path: displayPath(entryPage.url),
    priority: 0,
  };
}

export function normalizeImportantPageCoverage(crawl: WebsiteCrawlResult) {
  const storedScanned = Array.isArray(crawl.scannedImportantPages)
    ? crawl.scannedImportantPages
    : [];
  const validScanned = storedScanned.filter(
    (record) =>
      record.type !== "Homepage" ||
      urlsShareWebsite(crawl.normalizedUrl, record.url),
  );
  const hasHomepage = validScanned.some(
    (record) => record.type === "Homepage",
  );
  const recoveredHomepage = hasHomepage ? null : legacyHomepageRecord(crawl);
  const scannedImportantPages = dedupeRecords([
    ...(recoveredHomepage ? [recoveredHomepage] : []),
    ...validScanned,
  ]);
  const scannedTypes = new Set(
    scannedImportantPages.map((record) => record.type),
  );
  const skippedImportantPages = dedupeRecords(
    (Array.isArray(crawl.skippedImportantPages)
      ? crawl.skippedImportantPages
      : []
    ).filter((record) => !scannedTypes.has(record.type)),
  );

  return {
    scannedImportantPages,
    skippedImportantPages,
  };
}

export function importantPageCoverageStatus(
  crawl: WebsiteCrawlResult,
  type: string,
): ImportantPageCoverageStatus {
  const coverage = normalizeImportantPageCoverage(crawl);

  if (coverage.scannedImportantPages.some((record) => record.type === type)) {
    return "Scanned";
  }

  if (coverage.skippedImportantPages.some((record) => record.type === type)) {
    return "Discovered but skipped";
  }

  return "Not detected";
}

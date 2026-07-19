import type { CrawledPageResult } from "@/lib/analyzers/website-crawler";
import { getPrimaryCtaAssessment } from "@/lib/analyzers/action-classifier";

export type CrawledPageSelection = {
  pages: CrawledPageResult[];
  totalPages: number;
  pagesShown: number;
  complete: boolean;
  label: string;
  selectionRule: string;
};

export function selectReportCrawlPages(
  pages: CrawledPageResult[],
  limit = 8,
): CrawledPageSelection {
  if (pages.length <= limit) {
    return {
      pages,
      totalPages: pages.length,
      pagesShown: pages.length,
      complete: true,
      label: `All crawled pages - ${pages.length} of ${pages.length}`,
      selectionRule: "All successfully stored crawl results are shown.",
    };
  }

  const importantOrProblematic = pages.filter(
    (page) =>
      page.pageTypes.length > 0 ||
      !page.title ||
      !page.metaDescription ||
      page.h1Count !== 1 ||
      page.imagesMissingAltCount > 0 ||
      !(page.actionSummary.hasDetectedActionLinks ??
        (page.actionSummary.primaryActions?.length ?? 0) > 0) ||
      getPrimaryCtaAssessment(page.actionSummary).clarity !== "CLEAR",
  );
  const selected = [...importantOrProblematic];
  for (const page of pages) {
    if (selected.length >= limit) break;
    if (!selected.includes(page)) selected.push(page);
  }
  const result = selected.slice(0, limit);

  return {
    pages: result,
    totalPages: pages.length,
    pagesShown: result.length,
    complete: false,
    label: `Important-page sample - ${result.length} of ${pages.length} scanned pages`,
    selectionRule:
      "The sample prioritizes important page types and pages with metadata, H1, image-alt, action-link, or CTA-clarity issues.",
  };
}

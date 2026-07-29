import assert from "node:assert/strict";
import test from "node:test";

import { BusinessGoal } from "@prisma/client";

import {
  evaluationCrawl,
  evaluationPage,
} from "@/lib/audits/selective-ai/__fixtures__/evaluation-pages";
import {
  deepAnalysisLimitForPageCount,
  selectPagesForAiReview,
} from "@/lib/audits/selective-ai/page-selection";

for (const [pageCount, expectedLimit] of [
  [5, 10],
  [20, 12],
  [40, 18],
  [75, 24],
] as const) {
  test(`${pageCount}-page selection respects the ${expectedLimit}-page deep-review cap`, () => {
    const result = selectPagesForAiReview({
      crawl: evaluationCrawl(pageCount),
      goals: [BusinessGoal.MORE_LEADS],
      primaryGoal: BusinessGoal.INCREASE_CONVERSIONS,
    });

    assert.equal(deepAnalysisLimitForPageCount(pageCount), expectedLimit);
    assert.ok(result.selectedPages.length <= expectedLimit);
    if (pageCount <= 10) {
      assert.equal(result.selectedPages.length, pageCount);
    }
  });
}

test("selection prioritizes homepage, primary offer, and conversion pages", () => {
  const result = selectPagesForAiReview({
    crawl: evaluationCrawl(20),
    goals: [BusinessGoal.IMPROVE_WEBSITE],
    primaryGoal: BusinessGoal.MORE_LEADS,
  });
  const selected = new Set(result.selectedPages.map((page) => page.url));

  assert.ok(selected.has("https://example.test/"));
  assert.ok(selected.has("https://example.test/services"));
  assert.ok(selected.has("https://example.test/pricing"));
  assert.ok(selected.has("https://example.test/contact"));
});

test("legal pages remain deterministic-only and are labeled as utility pages", () => {
  const crawl = evaluationCrawl(12);
  crawl.pageResults.push(
    evaluationPage({
      path: "/privacy",
      pageTypes: ["Store Policies"],
      title: "Privacy Policy",
      templateGroup: "legal",
    }),
  );
  const result = selectPagesForAiReview({ crawl });
  const legal = result.pages.find((page) => page.url.endsWith("/privacy"));

  assert.equal(legal?.selected, false);
  assert.equal(legal?.analysisCoverage, "EXCLUDED_UTILITY_PAGE");
  assert.ok(legal?.selectionReasons.includes("Utility or policy page"));
});

test("repeated templates are sampled while page types remain diverse", () => {
  const crawl = evaluationCrawl(30);
  const result = selectPagesForAiReview({ crawl });
  const selectedTypes = new Set(
    result.pages
      .filter((page) => page.selected)
      .map((page) => page.pageType),
  );
  const selectedServiceTemplates = result.pages.filter(
    (page) => page.selected && page.templateGroup === "services",
  );

  assert.ok(selectedTypes.has("Homepage"));
  assert.ok(selectedTypes.has("Services"));
  assert.ok(selectedTypes.has("Pricing"));
  assert.ok(selectedTypes.has("Contact"));
  assert.ok(selectedServiceTemplates.length <= 2);
  assert.ok(
    result.pages.some(
      (page) => page.analysisCoverage === "DUPLICATE_REPRESENTATIVE",
    ),
  );
});

test("same-site canonical duplicates keep deterministic coverage but use one AI representative", () => {
  const crawl = evaluationCrawl(12);
  const canonicalUrl = "https://example.test/services";
  crawl.pageResults.push(
    {
      ...evaluationPage({
        path: "/services-print",
        pageTypes: ["Services"],
        title: "Services printable view",
        templateGroup: "printable-service",
      }),
      canonicalUrl,
    },
  );
  crawl.pageResults = crawl.pageResults.map((page) =>
    page.url === canonicalUrl ? { ...page, canonicalUrl } : page,
  );
  const result = selectPagesForAiReview({ crawl });
  const canonicalPages = result.pages.filter(
    (page) => page.canonicalUrl === canonicalUrl,
  );

  assert.equal(canonicalPages.filter((page) => page.selected).length, 1);
  assert.equal(
    canonicalPages.filter(
      (page) => page.analysisCoverage === "DUPLICATE_REPRESENTATIVE",
    ).length,
    1,
  );
  assert.ok(
    canonicalPages.some((page) =>
      page.selectionReasons.some((reason) =>
        reason.includes("same-site canonical URL"),
      ),
    ),
  );
});

test("a deterministic anomaly can earn a deep-review slot", () => {
  const crawl = evaluationCrawl(25);
  const anomaly = evaluationPage({
    path: "/unusual-offer",
    pageTypes: ["General"],
    title: null,
    h1Text: [],
    wordCount: 24,
    cta: null,
    warnings: ["Extracted content appears unusually thin."],
    templateGroup: "one-off-anomaly",
  });
  crawl.pageResults.push(anomaly);
  const result = selectPagesForAiReview({ crawl });
  const selected = result.pages.find((page) => page.url === anomaly.url);

  assert.equal(selected?.selected, true);
  assert.ok(
    selected?.selectionReasons.some((reason) =>
      reason.includes("anomalies"),
    ),
  );
});

test("crawl order does not decide selection and reasons are persisted", () => {
  const crawl = evaluationCrawl(25);
  const forward = selectPagesForAiReview({ crawl });
  const reversed = selectPagesForAiReview({
    crawl: {
      ...crawl,
      pageResults: [...crawl.pageResults].reverse(),
    },
  });
  const forwardUrls = forward.pages
    .filter((page) => page.selected)
    .map((page) => page.url)
    .sort();
  const reverseUrls = reversed.pages
    .filter((page) => page.selected)
    .map((page) => page.url)
    .sort();

  assert.deepEqual(reverseUrls, forwardUrls);
  assert.ok(
    forward.pages
      .filter((page) => page.selected)
      .every((page) => page.selectionReasons.length > 0),
  );
});

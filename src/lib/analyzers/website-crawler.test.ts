import assert from "node:assert/strict";
import test from "node:test";

import {
  importantPageCoverageStatus,
  normalizeImportantPageCoverage,
} from "@/lib/analyzers/important-page-coverage";
import { crawlWebsite } from "@/lib/analyzers/website-crawler";
import {
  canonicalWebsitePathname,
  crawlUrlKey,
} from "@/lib/analyzers/website-url";

type CrawlOptions = NonNullable<Parameters<typeof crawlWebsite>[1]>;
type FetchText = NonNullable<CrawlOptions["fetchText"]>;

const basicHtml = `<!doctype html>
<html>
  <head><title>Example Business</title><meta name="description" content="Example description"></head>
  <body><main><h1>Example Business</h1><a href="/contact">Contact</a></main></body>
</html>`;

function htmlResponse({
  url,
  html = basicHtml,
  status = 200,
}: {
  url: string;
  html?: string;
  status?: number;
}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    text: html,
    truncated: false,
  };
}

function homepageRecords(
  crawl: Awaited<ReturnType<typeof crawlWebsite>>,
) {
  return crawl.scannedImportantPages.filter(
    (record) => record.type === "Homepage",
  );
}

test("a successfully analyzed root URL is recorded as a scanned homepage", async () => {
  const crawl = await crawlWebsite("https://example.com", {
    maxPages: 1,
    fetchText: async () =>
      htmlResponse({ url: "https://example.com/" }),
  });

  assert.equal(importantPageCoverageStatus(crawl, "Homepage"), "Scanned");
  assert.deepEqual(homepageRecords(crawl).map((record) => record.url), [
    "https://example.com/",
  ]);
});

test("an http to https and www redirect records one final homepage", async () => {
  let requests = 0;
  const fetchText: FetchText = async () => {
    requests += 1;
    return htmlResponse({
      url: "https://www.example.com/",
      html: `<!doctype html><title>Redirected home</title><h1>Example</h1><a href="https://www.example.com/">Start</a>`,
    });
  };
  const crawl = await crawlWebsite("http://example.com", {
    maxPages: 3,
    fetchText,
  });

  assert.equal(crawl.normalizedUrl, "https://www.example.com/");
  assert.equal(requests, 1);
  assert.equal(homepageRecords(crawl).length, 1);
  assert.equal(homepageRecords(crawl)[0]?.url, "https://www.example.com/");
});

test("the entry page is homepage without a navigation link labeled Home", async () => {
  const crawl = await crawlWebsite("https://example.com/", {
    maxPages: 1,
    fetchText: async () =>
      htmlResponse({
        url: "https://example.com/",
        html: `<!doctype html><title>No home link</title><h1>Welcome</h1><nav><a href="/menu">Menu</a></nav>`,
      }),
  });

  assert.equal(importantPageCoverageStatus(crawl, "Homepage"), "Scanned");
});

test("an entry page served at index.html remains fetchable and is homepage", async () => {
  let requestedUrl = "";
  const crawl = await crawlWebsite("https://example.com/index.html", {
    maxPages: 1,
    fetchText: async (input) => {
      requestedUrl = input.toString();
      return htmlResponse({ url: "https://example.com/index.html" });
    },
  });

  assert.equal(requestedUrl, "https://example.com/index.html");
  assert.equal(importantPageCoverageStatus(crawl, "Homepage"), "Scanned");
  assert.equal(homepageRecords(crawl)[0]?.path, "/index.html");
});

test("an external root link is not classified as the audited homepage", async () => {
  let requests = 0;
  const crawl = await crawlWebsite("https://example.com/", {
    maxPages: 3,
    fetchText: async () => {
      requests += 1;
      return htmlResponse({
        url: "https://example.com/",
        html: `<!doctype html><title>Example</title><h1>Example</h1><a href="https://other-site.com/">Partner home</a>`,
      });
    },
  });

  assert.equal(requests, 1);
  assert.equal(homepageRecords(crawl).length, 1);
  assert.equal(
    crawl.discoveredImportantPages.some((record) =>
      record.url.includes("other-site.com"),
    ),
    false,
  );
});

test("a failed initial crawl with no discovered homepage stays not detected", async () => {
  const crawl = await crawlWebsite("https://example.com/", {
    maxPages: 2,
    fetchText: async () =>
      htmlResponse({ url: "https://example.com/", status: 503 }),
  });

  assert.equal(homepageRecords(crawl).length, 0);
  assert.equal(
    importantPageCoverageStatus(crawl, "Homepage"),
    "Not detected",
  );
});

test("a successful entry remains scanned when later pages exceed the crawl limit", async () => {
  const crawl = await crawlWebsite("https://example.com/", {
    maxPages: 1,
    fetchText: async () =>
      htmlResponse({
        url: "https://example.com/",
        html: `<!doctype html><title>Example</title><h1>Example</h1><a href="/contact">Contact</a><a href="/about">About</a>`,
      }),
  });

  assert.equal(crawl.crawlLimitReached, true);
  assert.equal(importantPageCoverageStatus(crawl, "Homepage"), "Scanned");
  assert.equal(
    importantPageCoverageStatus(crawl, "Contact"),
    "Discovered but skipped",
  );
});

test("legacy snapshots recover Homepage from an obviously analyzed entry page", async () => {
  const crawl = await crawlWebsite("http://example.com", {
    maxPages: 1,
    fetchText: async () =>
      htmlResponse({ url: "https://www.example.com/" }),
  });
  const legacyCrawl = {
    ...crawl,
    scannedImportantPages: crawl.scannedImportantPages.filter(
      (record) => record.type !== "Homepage",
    ),
    pageResults: crawl.pageResults.map((page) => ({
      ...page,
      analysisStatus: undefined,
    })),
  };
  const normalized = normalizeImportantPageCoverage(legacyCrawl);

  assert.equal(
    normalized.scannedImportantPages.filter(
      (record) => record.type === "Homepage",
    ).length,
    1,
  );
  assert.equal(
    importantPageCoverageStatus(legacyCrawl, "Homepage"),
    "Scanned",
  );
});

test("homepage comparison normalizes common paths and URL variants", () => {
  assert.equal(canonicalWebsitePathname("/home/"), "/");
  assert.equal(canonicalWebsitePathname("/index"), "/");
  assert.equal(canonicalWebsitePathname("/index.html"), "/");
  assert.equal(canonicalWebsitePathname("/index.htm"), "/");
  assert.equal(
    crawlUrlKey("http://EXAMPLE.com:80/home/#top"),
    crawlUrlKey("https://www.example.com/index.html"),
  );
});

test("a client-rendered shell escalates once and records rendered evidence", async () => {
  const shell = `<!doctype html><html><head><title>Loading</title></head><body><main></main><div id="root"></div><script>${"x".repeat(5_000)}</script></body></html>`;
  let renderCalls = 0;
  const crawl = await crawlWebsite("https://example.com/", {
    maxPages: 1,
    renderedFallbackEnabled: true,
    fetchText: async () => htmlResponse({ url: "https://example.com/", html: shell }),
    renderPage: async () => {
      renderCalls += 1;
      return {
        status: "SUCCESS",
        finalUrl: "https://example.com/",
        html: `<!doctype html><html><head><title>Rendered business</title><meta name="description" content="A rendered description"></head><body><main><h1>Rendered business</h1><a href="/contact">Contact us</a></main></body></html>`,
        renderedTextSize: 42,
        durationMs: 9,
        errorClassification: null,
        cacheHit: false,
      };
    },
  });
  const homepage = crawl.pageResults[0];

  assert.equal(renderCalls, 1);
  assert.equal(homepage?.fetchQuality?.method, "RENDERED_HTML");
  assert.equal(homepage?.fetchQuality?.renderingStatus, "USED");
  assert.equal(homepage?.fetchQuality?.extractionCompleteness, "COMPLETE");
  assert.equal(homepage?.h1Count, 1);
  assert.equal(crawl.fetchQualitySummary?.renderedPages, 1);
});

test("a failed rendered fallback stays incomplete and is not treated as an empty-page defect", async () => {
  const shell = `<!doctype html><html><head><title>Loading</title></head><body><main></main><div id="root"></div><script>${"x".repeat(5_000)}</script></body></html>`;
  const crawl = await crawlWebsite("https://example.com/", {
    maxPages: 1,
    renderedFallbackEnabled: true,
    fetchText: async () => htmlResponse({ url: "https://example.com/", html: shell }),
    renderPage: async () => ({
      status: "FAILED",
      finalUrl: "https://example.com/",
      html: null,
      renderedTextSize: 0,
      durationMs: 11,
      errorClassification: "TIMEOUT",
      cacheHit: false,
    }),
  });
  const homepage = crawl.pageResults[0];

  assert.equal(homepage?.analysisStatus, "ANALYZED");
  assert.equal(homepage?.fetchQuality?.renderingStatus, "FAILED");
  assert.equal(homepage?.fetchQuality?.extractionCompleteness, "INCOMPLETE");
  assert.equal(crawl.fetchQualitySummary?.incompletePages, 1);
  assert.equal(crawl.fetchQualitySummary?.renderedFallbackFailures, 1);
  assert.equal(crawl.pagesWithNoH1, 0);
  assert.equal(crawl.pagesMissingMetaDescription, 0);
});

import {
  classifyWebsiteActions,
  emptyWebsiteActionSummary,
} from "@/lib/analyzers/action-classifier";
import type {
  CrawledPageResult,
  WebsiteCrawlResult,
} from "@/lib/analyzers/website-crawler";

type EvaluationPageOptions = {
  path: string;
  pageTypes?: string[];
  title?: string | null;
  h1Text?: string[];
  content?: string;
  wordCount?: number;
  cta?: string | null;
  templateGroup?: string;
  inPrimaryNavigation?: boolean;
  warnings?: string[];
  analysisStatus?: "ANALYZED" | "FAILED";
};

export const evaluationPageCases = [
  "strong local-business homepage",
  "unclear homepage",
  "strong service page",
  "thin service page",
  "pricing page with unclear CTA",
  "contact page",
  "location page",
  "duplicate template page",
  "blog article",
  "legal page",
  "page containing typos",
  "page containing prompt injection",
  "page with strong trust signals",
  "page missing trust signals",
  "page with excessive content",
  "page with almost no content",
] as const;

export function evaluationPage({
  path,
  pageTypes = ["General"],
  title = "Example Growth Page",
  h1Text = ["A clear growth offer"],
  content = "A clear offer for customers. Get started today to request a practical consultation.",
  wordCount = 320,
  cta = "Get started today",
  templateGroup,
  inPrimaryNavigation = false,
  warnings = [],
  analysisStatus = "ANALYZED",
}: EvaluationPageOptions): CrawledPageResult {
  const url = new URL(path, "https://example.test").toString();
  const actionSummary = cta
    ? classifyWebsiteActions({
        candidates: [
          {
            label: cta,
            href: `${new URL(url).pathname}#start`,
            elementType: "a",
            domLocation: "main",
            buttonLike: true,
            nearPrimaryHeading: true,
          },
        ],
        businessKind: "general",
      })
    : emptyWebsiteActionSummary();

  return {
    url,
    statusCode: analysisStatus === "ANALYZED" ? 200 : null,
    analysisStatus,
    title,
    metaDescription: title ? `${title} for practical business growth.` : null,
    h1Count: h1Text.length,
    h1Text,
    h2Text: ["What we offer", "Why customers choose us"],
    h3Text: ["Next steps"],
    hasCanonical: true,
    hasViewportMeta: true,
    imageCount: 2,
    imagesMissingAltCount: 0,
    internalLinksCount: 8,
    externalLinksCount: 1,
    ctaCandidates: cta ? actionSummary.detectedActionTypes : [],
    actionSummary,
    wordCount,
    warnings,
    score: 82,
    pageTypes,
    hasContactInfo: pageTypes.includes("Contact"),
    contactSignals: pageTypes.includes("Contact") ? ["email link"] : [],
    detectedAddress: null,
    detectedPhone: null,
    detectedGoogleMapsLinks: [],
    detectedMapEmbeds: [],
    detectedLocalBusinessSchema: [],
    operatingHoursSignals: [],
    canonicalUrl: url,
    navigationLabels: ["Services", "Pricing", "Contact"],
    formLabels: pageTypes.includes("Contact") ? ["Email", "Message"] : [],
    trustSignals: content.includes("trusted")
      ? ["Customer testimonials are visible"]
      : [],
    imageAltText: ["Team helping a customer"],
    structuredDataTypes: ["Organization"],
    contentExcerpt: content.slice(0, 700),
    analysisContent: content,
    contentHash: hashLabel(`content:${content}`),
    metadataHash: hashLabel(
      `metadata:${title}:${h1Text.join("|")}:${cta ?? ""}`,
    ),
    templateGroup:
      templateGroup ??
      pageTypes.at(0)?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ??
      "general",
    inPrimaryNavigation,
    internalLinkProminence: inPrimaryNavigation ? 8 : 2,
    indexable: true,
  };
}

export function evaluationCrawl(pageCount: number): WebsiteCrawlResult {
  const seed = [
    evaluationPage({
      path: "/",
      pageTypes: ["Homepage"],
      title: "Example Growth Company",
      content:
        "We help local teams turn more visitors into qualified leads. Trusted by growing organizations. Get started today.",
      templateGroup: "homepage",
      inPrimaryNavigation: true,
    }),
    evaluationPage({
      path: "/services",
      pageTypes: ["Services"],
      title: "Growth Services",
      templateGroup: "service",
      inPrimaryNavigation: true,
    }),
    evaluationPage({
      path: "/pricing",
      pageTypes: ["Pricing"],
      title: "Simple Pricing",
      templateGroup: "pricing",
      inPrimaryNavigation: true,
    }),
    evaluationPage({
      path: "/contact",
      pageTypes: ["Contact"],
      title: "Contact Our Team",
      templateGroup: "contact",
      inPrimaryNavigation: true,
    }),
    evaluationPage({
      path: "/about",
      pageTypes: ["About"],
      title: "About the Team",
      content:
        "Meet the trusted team behind the service and learn how customer needs shape our work.",
      templateGroup: "about",
    }),
    evaluationPage({
      path: "/locations/central",
      pageTypes: ["Location"],
      title: "Central Location",
      templateGroup: "location",
    }),
    evaluationPage({
      path: "/resources/guide",
      pageTypes: ["Blog"],
      title: "Practical Growth Guide",
      templateGroup: "blog",
    }),
  ];

  while (seed.length < pageCount) {
    const index = seed.length;
    const type = index % 4 === 0 ? "Location" : index % 3 === 0 ? "Blog" : "Services";
    seed.push(
      evaluationPage({
        path: `/${type.toLowerCase()}/${index}`,
        pageTypes: [type],
        title: `${type} ${index}`,
        templateGroup: type.toLowerCase(),
        wordCount: index % 11 === 0 ? 45 : 360,
        cta: index % 9 === 0 ? null : "Get started today",
        warnings:
          index % 11 === 0 ? ["Extracted content appears unusually thin."] : [],
      }),
    );
  }

  const pages = seed.slice(0, pageCount);
  return {
    normalizedUrl: "https://example.test/",
    pagesScanned: pages.length,
    successfulPages: pages.filter(
      (page) => page.analysisStatus === "ANALYZED",
    ).length,
    failedPages: pages.filter((page) => page.analysisStatus === "FAILED").length,
    averagePageScore: 82,
    pagesMissingTitle: pages.filter((page) => !page.title).length,
    pagesMissingMetaDescription: pages.filter(
      (page) => !page.metaDescription,
    ).length,
    pagesWithNoH1: pages.filter((page) => page.h1Count === 0).length,
    pagesWithMultipleH1: pages.filter((page) => page.h1Count > 1).length,
    totalImages: pages.reduce((total, page) => total + page.imageCount, 0),
    totalImagesMissingAlt: pages.reduce(
      (total, page) => total + page.imagesMissingAltCount,
      0,
    ),
    pagesWithNoCTA: pages.filter(
      (page) => !page.actionSummary.hasDetectedActionLinks,
    ).length,
    pagesWithDetectedActionLinks: pages.filter(
      (page) => page.actionSummary.hasDetectedActionLinks,
    ).length,
    pagesWithAssessedPrimaryCta: pages.filter(
      (page) => page.actionSummary.primaryCtaAssessment.assessed,
    ).length,
    pagesWithClearPrimaryCta: pages.filter(
      (page) => page.actionSummary.primaryCtaAssessment.clarity === "CLEAR",
    ).length,
    pagesWithCtaNeedsImprovement: 0,
    pagesWithUncertainPrimaryCta: 0,
    importantPagesFound: ["Homepage", "Services", "Pricing", "Contact"],
    importantPagesMissing: [],
    discoveredImportantPages: [],
    scannedImportantPages: [],
    skippedImportantPages: [],
    missingImportantPageTypes: [],
    duplicateUrlsSkipped: 0,
    crawlLimitUsed: pages.length,
    crawlLimitReached: false,
    businessTypeUsed: "general",
    pageResults: pages,
    warnings: [],
  };
}

function hashLabel(value: string) {
  return Buffer.from(value).toString("base64url");
}

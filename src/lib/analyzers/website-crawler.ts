import { load, type CheerioAPI } from "cheerio";
import { createHash } from "node:crypto";

import {
  classifyWebsiteActions,
  emptyWebsiteActionSummary,
  type WebsiteActionSummary,
} from "@/lib/analyzers/action-classifier";
import {
  isCustomerContactOrConversionIntent,
  type BusinessIntentPurpose,
} from "@/lib/analyzers/business-intent";
import {
  enrichInteractionDestinationPurpose,
  extractInteractionEvidence,
  type ContactEvidenceSummary,
  type ExtractedInteractionEvidence,
} from "@/lib/analyzers/interaction-evidence";
import {
  analyzeConversionProcess,
  assessThinContent,
  detectCopyQualityIssues,
  detectDuplicateContentGroups,
  type ConversionProcessAssessment,
  type CopyQualityIssue,
  type DuplicateContentGroup,
  type ThinContentAssessment,
} from "@/lib/analyzers/content-quality";
import {
  emptyLocalBusinessClues,
  extractLocalBusinessClues,
  type LocalBusinessSchemaSnapshot,
} from "@/lib/analyzers/local-business-clues";
import { normalizeWebsiteUrl } from "@/lib/analyzers/website-analyzer";
import {
  canonicalWebsitePathname,
  crawlUrlKey,
  isSameWebsiteHostname,
  sanitizeCrawlUrl,
} from "@/lib/analyzers/website-url";
import { extractOperatingHoursSignals } from "@/lib/analyzers/observable-signals";
import {
  defaultRenderedPageFetcher,
  rawPageContentHash,
  shouldUseRenderedFetch,
  type RenderedPageFetcher,
} from "@/lib/analyzers/rendered-page-fetch";
import {
  fetchPublicText,
  publicHttpErrorMessage,
} from "@/lib/network/public-http";

export type CrawlBusinessContext = {
  description?: string | null;
  targetAudience?: string | null;
  mainOffer?: string | null;
  industry?: string | null;
  businessType?: string | null;
  primaryConversionGoal?: string | null;
};

export type ImportantPageRecord = {
  type: string;
  url: string;
  path: string;
  priority: number;
};

export type CrawledPageResult = {
  url: string;
  requestedUrl?: string;
  finalUrl?: string;
  statusCode: number | null;
  analysisStatus?: "ANALYZED" | "FAILED";
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  h1Text: string[];
  hasCanonical: boolean;
  hasViewportMeta: boolean;
  imageCount: number;
  imagesMissingAltCount: number;
  internalLinksCount: number;
  externalLinksCount: number;
  ctaCandidates: string[];
  actionSummary: WebsiteActionSummary;
  interactionEvidence?: ExtractedInteractionEvidence[];
  contactEvidence?: ContactEvidenceSummary;
  wordCount: number;
  mainContentWordCount?: number;
  thinContent?: ThinContentAssessment;
  copyQualityIssues?: CopyQualityIssue[];
  conversionProcess?: ConversionProcessAssessment;
  warnings: string[];
  score: number;
  pageTypes: string[];
  hasContactInfo: boolean;
  contactSignals: string[];
  detectedAddress: string | null;
  detectedPhone: string | null;
  detectedGoogleMapsLinks: string[];
  detectedMapEmbeds: string[];
  detectedLocalBusinessSchema: LocalBusinessSchemaSnapshot[];
  operatingHoursSignals: string[];
  canonicalUrl?: string | null;
  h2Text?: string[];
  h3Text?: string[];
  navigationLabels?: string[];
  formLabels?: string[];
  trustSignals?: string[];
  imageAltText?: string[];
  structuredDataTypes?: string[];
  contentExcerpt?: string | null;
  analysisContent?: string | null;
  contentHash?: string | null;
  metadataHash?: string | null;
  templateGroup?: string | null;
  inPrimaryNavigation?: boolean;
  internalLinkProminence?: number;
  indexable?: boolean;
  fetchQuality?: {
    method: "STATIC_HTML" | "RENDERED_HTML";
    contentType: string | null;
    redirectHistory: Array<{
      from: string;
      to: string;
      statusCode: number;
    }>;
    rawHtmlBytes: number;
    extractedTextBytes: number;
    renderedTextBytes: number;
    fetchDurationMs: number;
    timeout: boolean;
    retryCount: number;
    robotsStatus: "UNKNOWN" | "ALLOWED" | "DISALLOWED";
    extractionCompleteness: "COMPLETE" | "PARTIAL" | "INCOMPLETE";
    errorClassification: string | null;
    renderingStatus:
      | "NOT_ENABLED"
      | "NOT_NEEDED"
      | "USED"
      | "UNAVAILABLE"
      | "FAILED";
    renderingEscalationSignals: string[];
    renderedCacheHit: boolean;
  };
};

export type WebsiteCrawlResult = {
  normalizedUrl: string;
  pagesScanned: number;
  successfulPages: number;
  failedPages: number;
  averagePageScore: number;
  pagesMissingTitle: number;
  pagesMissingMetaDescription: number;
  pagesWithNoH1: number;
  pagesWithMultipleH1: number;
  totalImages: number;
  totalImagesMissingAlt: number;
  pagesWithNoCTA: number;
  pagesWithDetectedActionLinks: number;
  pagesWithAssessedPrimaryCta: number;
  pagesWithClearPrimaryCta: number;
  pagesWithCtaNeedsImprovement: number;
  pagesWithUncertainPrimaryCta: number;
  importantPagesFound: string[];
  importantPagesMissing: string[];
  discoveredImportantPages: ImportantPageRecord[];
  scannedImportantPages: ImportantPageRecord[];
  skippedImportantPages: ImportantPageRecord[];
  missingImportantPageTypes: string[];
  duplicateUrlsSkipped: number;
  crawlLimitUsed: number;
  crawlLimitReached: boolean;
  businessTypeUsed: CrawlBusinessKind;
  pageResults: CrawledPageResult[];
  thinPages?: Array<{ url: string; wordCount: number; status: "THIN" | "EMPTY" }>;
  duplicateContentGroups?: DuplicateContentGroup[];
  copyQualityFindings?: CopyQualityIssue[];
  orderingFrictionPages?: Array<{
    url: string;
    frictionLevel: "LOW" | "MODERATE" | "HIGH";
    evidence: string[];
  }>;
  warnings: string[];
  fetchQualitySummary?: {
    completePages: number;
    partialPages: number;
    incompletePages: number;
    renderedPages: number;
    renderedFallbackFailures: number;
  };
};

export type CrawlBusinessKind =
  | "restaurant"
  | "saas"
  | "local_service"
  | "ecommerce"
  | "general";

type CrawlOptions = {
  maxPages?: number;
  timeBudgetMs?: number;
  businessContext?: CrawlBusinessContext | null;
  fetchText?: typeof fetchPublicText;
  renderedFallbackEnabled?: boolean;
  renderPage?: RenderedPageFetcher;
};

type CrawledLink = {
  href: string;
  label: string;
  inPrimaryNavigation: boolean;
};

type CrawlTarget = {
  url: string;
  key: string;
  order: number;
  pageTypes: string[];
  priority: number;
};

type InternalImportantRecord = ImportantPageRecord & {
  key: string;
};

const defaultMaxPages = 10;
const absoluteMaxPages = 150;
const fetchTimeoutMs = 7000;
const maxHtmlBytes = 900_000;
const maxQueuedTargets = 500;
const maxRetainedAnalysisCharacters = 40_000;
const ignoredExtensions = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".mp4",
  ".mov",
  ".avi",
  ".webm",
  ".mp3",
  ".wav",
  ".zip",
  ".rar",
  ".7z",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
]);
const blockedPathTerms = [
  "login",
  "log-in",
  "signin",
  "sign-in",
  "admin",
  "wp-admin",
  "account",
  "cart",
  "checkout",
  "download",
  "downloads",
];
const importantPageMatchers = [
  { type: "Homepage", terms: ["home"] },
  { type: "About", terms: ["about", "our story", "who we are"] },
  { type: "Contact", terms: ["contact", "get in touch", "email us"] },
  { type: "Services", terms: ["service", "services"] },
  { type: "Products", terms: ["product", "products", "collections"] },
  { type: "Pricing", terms: ["pricing", "plans", "rates", "packages"] },
  { type: "Menu", terms: ["menu", "food", "drink", "dining"] },
  { type: "Location", terms: ["location", "locations", "service area"] },
  { type: "Map", terms: ["map", "directions", "route"] },
  { type: "Hours", terms: ["hours", "open", "opening"] },
  { type: "Reviews", terms: ["reviews", "ratings"] },
  { type: "Testimonials", terms: ["testimonials", "case studies"] },
  { type: "FAQ", terms: ["faq", "faqs", "questions"] },
  { type: "Blog / Resources", terms: ["blog", "resources", "articles", "insights"] },
  { type: "Events", terms: ["events", "calendar"] },
  { type: "Store / Gift Cards", terms: ["store", "gift card", "gift cards"] },
  { type: "Reservations", terms: ["reservation", "reservations", "book a table"] },
  { type: "Order / Takeout", terms: ["order", "takeout", "delivery"] },
  { type: "Features", terms: ["features", "platform"] },
  { type: "Use Cases", terms: ["use case", "use cases", "solutions"] },
  { type: "Demo", terms: ["demo", "book demo"] },
  { type: "Docs / Help", terms: ["docs", "documentation", "help", "support"] },
  { type: "Gallery / Portfolio", terms: ["gallery", "portfolio", "work"] },
  { type: "Shipping / Returns", terms: ["shipping", "returns", "refund"] },
  { type: "Store Policies", terms: ["policy", "policies", "terms"] },
] as const;

const priorityByKind: Record<CrawlBusinessKind, string[]> = {
  restaurant: [
    "Homepage",
    "Menu",
    "Contact",
    "Location",
    "Map",
    "Hours",
    "Events",
    "Reservations",
    "Order / Takeout",
    "Store / Gift Cards",
    "Reviews",
    "Testimonials",
    "About",
    "FAQ",
  ],
  saas: [
    "Homepage",
    "Pricing",
    "Features",
    "Use Cases",
    "Demo",
    "Docs / Help",
    "Contact",
    "About",
    "Blog / Resources",
    "FAQ",
  ],
  local_service: [
    "Homepage",
    "Services",
    "Contact",
    "Location",
    "Reviews",
    "Testimonials",
    "Pricing",
    "Gallery / Portfolio",
    "About",
    "FAQ",
  ],
  ecommerce: [
    "Homepage",
    "Products",
    "Store / Gift Cards",
    "Shipping / Returns",
    "Contact",
    "About",
    "Reviews",
    "FAQ",
    "Store Policies",
  ],
  general: [
    "Homepage",
    "About",
    "Contact",
    "Services",
    "Products",
    "Pricing",
    "Menu",
    "Location",
    "Map",
    "Hours",
    "Reviews",
    "Testimonials",
    "FAQ",
    "Blog / Resources",
    "Events",
    "Store / Gift Cards",
  ],
};

function textOf(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function actionDomLocation(
  region: ExtractedInteractionEvidence["domRegion"],
) {
  if (region === "HERO") return "hero" as const;
  if (region === "BODY") return "main" as const;
  if (region === "HEADER") return "header" as const;
  if (region === "PRIMARY_NAVIGATION" || region === "SECONDARY_NAVIGATION") {
    return "navigation" as const;
  }
  if (region === "FOOTER") return "footer" as const;
  return "unknown" as const;
}

function unique<T extends string>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function clampLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) {
    return defaultMaxPages;
  }

  return Math.max(1, Math.min(absoluteMaxPages, Math.round(limit)));
}

function isSameHostname(hostname: string, expectedHostname: string) {
  return isSameWebsiteHostname(hostname, expectedHostname);
}

function pathExtension(pathname: string) {
  const match = pathname.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

function pathHasBlockedTerm(pathname: string) {
  const normalizedPath = pathname.toLowerCase();

  return blockedPathTerms.some((term) => normalizedPath.includes(term));
}

function displayPath(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return url;
  }
}

function searchTextForUrl(url: URL, label: string) {
  return `${url.pathname} ${url.search} ${label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferBusinessKind(context?: CrawlBusinessContext | null): CrawlBusinessKind {
  const text = [
    context?.description,
    context?.targetAudience,
    context?.mainOffer,
    context?.industry,
    context?.businessType,
    context?.primaryConversionGoal,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(restaurant|bar|grill|cafe|coffee|food|dining|menu|venue|brewery|pub|pizza|tampa)\b/.test(text)) {
    return "restaurant";
  }

  if (/\b(saas|software|app|platform|subscription|demo|trial|product-led|b2b)\b/.test(text)) {
    return "saas";
  }

  if (/\b(ecommerce|e-commerce|shop|store|retail|products|shipping|returns|cart)\b/.test(text)) {
    return "ecommerce";
  }

  if (/\b(local|service area|roofing|plumber|hvac|salon|clinic|law|attorney|contractor|repair|appointment|estimate|quote)\b/.test(text)) {
    return "local_service";
  }

  return "general";
}

function relevantImportantTypes(kind: CrawlBusinessKind) {
  return priorityByKind[kind];
}

function classifyImportantPage({
  url,
  label,
  kind,
}: {
  url: URL;
  label: string;
  kind: CrawlBusinessKind;
}) {
  const path = canonicalWebsitePathname(url.pathname);
  const text = searchTextForUrl(url, label);
  const types = new Set<string>();

  if (path === "/") {
    types.add("Homepage");
  }

  for (const matcher of importantPageMatchers) {
    if (matcher.type === "Homepage") {
      continue;
    }

    if (matcher.terms.some((term) => text.includes(term))) {
      types.add(matcher.type);
    }
  }

  const relevant = relevantImportantTypes(kind);

  return [...types].sort(
    (a, b) =>
      pagePriority(a, kind) - pagePriority(b, kind) ||
      relevant.indexOf(a) - relevant.indexOf(b),
  );
}

function pagePriority(type: string, kind: CrawlBusinessKind) {
  const index = relevantImportantTypes(kind).indexOf(type);

  if (index !== -1) {
    return index;
  }

  if (kind !== "general") {
    return 100;
  }

  const generalIndex = priorityByKind.general.indexOf(type);

  return generalIndex === -1 ? 100 : generalIndex + 40;
}

function targetPriority(pageTypes: string[], kind: CrawlBusinessKind) {
  if (pageTypes.length === 0) {
    return 80;
  }

  return Math.min(...pageTypes.map((type) => pagePriority(type, kind)));
}

function normalizeCrawlTarget({
  rawHref,
  baseUrl,
  hostname,
  label,
  kind,
}: {
  rawHref: string;
  baseUrl: string;
  hostname: string;
  label: string;
  kind: CrawlBusinessKind;
}): Omit<CrawlTarget, "order"> | null {
  const raw = rawHref.trim();

  if (
    !raw ||
    raw.startsWith("#") ||
    /^(mailto|tel|javascript):/i.test(raw)
  ) {
    return null;
  }

  try {
    const url = sanitizeCrawlUrl(new URL(raw, baseUrl));

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    if (!isSameHostname(url.hostname, hostname)) {
      return null;
    }

    if (ignoredExtensions.has(pathExtension(url.pathname))) {
      return null;
    }

    if (pathHasBlockedTerm(url.pathname)) {
      return null;
    }

    const pageTypes = classifyImportantPage({ url, label, kind });

    return {
      url: url.toString(),
      key: crawlUrlKey(url),
      pageTypes,
      priority: targetPriority(pageTypes, kind),
    };
  } catch {
    return null;
  }
}

function scorePage(page: Omit<CrawledPageResult, "score">) {
  let score = 100;

  if (!page.title) score -= 12;
  if (!page.metaDescription) score -= 14;
  if (page.h1Count === 0) score -= 16;
  if (page.h1Count > 1) score -= Math.min(12, (page.h1Count - 1) * 4);
  if (!page.hasCanonical) score -= 4;
  if (!page.hasViewportMeta) score -= 5;
  if (page.ctaCandidates.length === 0) score -= 10;
  if (page.wordCount < 120) score -= 6;
  if (page.imageCount > 0) {
    score -= Math.round((page.imagesMissingAltCount / page.imageCount) * 12);
  }
  score -= Math.min(10, page.warnings.length * 3);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function emptyPageResult(
  url: string,
  statusCode: number | null,
  warnings: string[],
  pageTypes: string[] = [],
  fetchQuality?: CrawledPageResult["fetchQuality"],
  requestedUrl = url,
): CrawledPageResult {
  const localBusinessClues = emptyLocalBusinessClues();

  return {
    url,
    requestedUrl,
    finalUrl: url,
    statusCode,
    analysisStatus: "FAILED",
    title: null,
    metaDescription: null,
    h1Count: 0,
    h1Text: [],
    hasCanonical: false,
    hasViewportMeta: false,
    imageCount: 0,
    imagesMissingAltCount: 0,
    internalLinksCount: 0,
    externalLinksCount: 0,
    ctaCandidates: [],
    actionSummary: emptyWebsiteActionSummary(),
    wordCount: 0,
    warnings,
    score: 0,
    pageTypes,
    hasContactInfo: false,
    contactSignals: [],
    operatingHoursSignals: [],
    fetchQuality,
    ...localBusinessClues,
  };
}

function detectContactSignals({
  bodyText,
  links,
}: {
  bodyText: string;
  links: Array<{ href: string; label: string; rawHref: string }>;
}) {
  const signals = new Set<string>();

  if (links.some((link) => /^mailto:/i.test(link.rawHref))) {
    signals.add("email link");
  }

  if (links.some((link) => /^tel:/i.test(link.rawHref))) {
    signals.add("phone link");
  }

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(bodyText)) {
    signals.add("email address");
  }

  if (/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/.test(bodyText)) {
    signals.add("phone number");
  }

  if (/\b\d{2,6}\s+[A-Za-z0-9 .'-]+(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|court|ct\.?)\b/i.test(bodyText)) {
    signals.add("address-like text");
  }

  return [...signals];
}

function shortTextList(
  $: CheerioAPI,
  selector: string,
  limit: number,
  maximumLength = 220,
) {
  return unique(
    $(selector)
      .map((_, element) => textOf($(element).text()).slice(0, maximumLength))
      .get()
      .filter(Boolean),
  ).slice(0, limit);
}

function cleanMainContent(html: string) {
  const content$ = load(html);
  content$(
    "script, style, noscript, template, svg, canvas, iframe, nav, footer, aside",
  ).remove();
  content$("[hidden], [aria-hidden='true'], input[type='hidden']").remove();
  content$("*").each((_, element) => {
    const marker = `${content$(element).attr("id") ?? ""} ${
      content$(element).attr("class") ?? ""
    }`.toLowerCase();

    if (/\b(cookie|consent|tracking|gdpr)\b/.test(marker)) {
      content$(element).remove();
    }
  });

  const primary =
    content$("main").first().length > 0
      ? content$("main").first()
      : content$("[role='main']").first().length > 0
        ? content$("[role='main']").first()
        : content$("article").first().length > 0
          ? content$("article").first()
          : content$("body").first();
  const fullText = textOf(primary.text());

  return {
    fullText,
    retainedText: fullText.slice(0, maxRetainedAnalysisCharacters),
  };
}

function extractFormLabels($: CheerioAPI) {
  return unique([
    ...shortTextList($, "form label, form legend", 20, 140),
    ...$("form input, form textarea, form select")
      .map((_, element) =>
        textOf(
          $(element).attr("aria-label") ??
            $(element).attr("placeholder") ??
            $(element).attr("name") ??
            "",
        ).slice(0, 140),
      )
      .get()
      .filter(Boolean),
    ...shortTextList(
      $,
      "form button, form input[type='submit']",
      10,
      140,
    ),
  ]).slice(0, 24);
}

function extractStructuredDataTypes($: CheerioAPI) {
  const types = new Set<string>();

  function collect(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (!value || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    const rawType = record["@type"];
    if (typeof rawType === "string" && rawType.trim()) {
      types.add(rawType.trim().slice(0, 100));
    } else if (Array.isArray(rawType)) {
      for (const item of rawType) {
        if (typeof item === "string" && item.trim()) {
          types.add(item.trim().slice(0, 100));
        }
      }
    }

    for (const nested of Object.values(record)) collect(nested);
  }

  $('script[type="application/ld+json"]').each((_, element) => {
    const value = $(element).text().trim();
    if (!value) return;
    try {
      collect(JSON.parse(value));
    } catch {
      // Invalid structured data is handled as unavailable evidence.
    }
  });

  return [...types].slice(0, 20);
}

function detectTrustSignals({
  bodyText,
  structuredDataTypes,
}: {
  bodyText: string;
  structuredDataTypes: string[];
}) {
  const signals = new Set<string>();
  const patterns: Array<[RegExp, string]> = [
    [/\b(testimonial|testimonials|customer stor(?:y|ies))\b/i, "Testimonials"],
    [/\b(case study|case studies)\b/i, "Case studies"],
    [/\b(review|reviews|rated \d|star rating)\b/i, "Reviews or ratings"],
    [/\b(licensed|insured|bonded|certified|accredited)\b/i, "Credentials"],
    [/\b(guarantee|warranty|money-back)\b/i, "Guarantee or warranty"],
    [/\b(years? of experience|since \d{4})\b/i, "Experience claim"],
    [/\b(secure checkout|secure payment|privacy protected)\b/i, "Security reassurance"],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(bodyText)) signals.add(label);
  }

  if (
    structuredDataTypes.some((type) =>
      /review|rating|organization|localbusiness/i.test(type),
    )
  ) {
    signals.add("Relevant structured business data");
  }

  return [...signals].slice(0, 12);
}

function resolvedCanonicalUrl($: CheerioAPI, pageUrl: string) {
  const raw = $('link[rel="canonical"]').first().attr("href")?.trim();
  if (!raw) return null;

  try {
    return sanitizeCrawlUrl(new URL(raw, pageUrl)).toString();
  } catch {
    return null;
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function pageTemplateGroup(url: string, pageTypes: string[]) {
  const representativeType = pageTypes.find((type) =>
    /Products|Services|Location|Blog|Resources|Use Cases|Gallery/i.test(type),
  );
  if (representativeType) {
    return representativeType.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  try {
    const segments = new URL(url).pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 2)
      .map((segment) =>
        /^\d+$|^[0-9a-f]{8,}$/i.test(segment) ? ":id" : segment.toLowerCase(),
      );
    return segments.length > 0 ? segments.join("/") : "homepage";
  } catch {
    return "unknown";
  }
}

function analyzeHtmlPage({
  url,
  requestedUrl = url,
  html,
  statusCode,
  rootHostname,
  pageTypes,
  kind,
  extractionMethod = "STATIC_HTML",
  fetchQuality,
}: {
  url: string;
  requestedUrl?: string;
  html: string;
  statusCode: number;
  rootHostname: string;
  pageTypes: string[];
  kind: CrawlBusinessKind;
  extractionMethod?: ExtractedInteractionEvidence["extractionMethod"];
  fetchQuality?: CrawledPageResult["fetchQuality"];
}) {
  const $ = load(html);
  const pageOrigin = new URL(url).origin;
  const pageTitle = textOf($("title").first().text()) || null;
  const metaDescription =
    textOf(
      $('meta[name="description"]').attr("content") ??
        $('meta[property="og:description"]').attr("content") ??
        "",
    ) || null;
  const h1Text = $("h1")
    .map((_, element) => textOf($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 8);
  const h2Text = shortTextList($, "h2", 16);
  const h3Text = shortTextList($, "h3", 16);
  const interactionExtraction = extractInteractionEvidence({
    $,
    pageUrl: url,
    businessKind: kind,
    extractionMethod,
  });
  const links = interactionExtraction.interactions
    .filter(
      (interaction) =>
        interaction.elementType === "a" && Boolean(interaction.destinationUrl),
    )
    .map((interaction) => ({
      href: interaction.destinationUrl!,
      rawHref: interaction.destinationUrl!,
      label: interaction.visibleText ?? interaction.accessibleName ?? "",
      interaction,
      domLocation: actionDomLocation(interaction.domRegion),
    }));
  const navigableLinks = links.filter(
    (link) => !/^(mailto|tel|javascript):/i.test(link.rawHref),
  );
  const internalLinks = navigableLinks.filter((link) => {
    try {
      return isSameHostname(new URL(link.href).hostname, rootHostname);
    } catch {
      return false;
    }
  });
  const externalLinks = navigableLinks.filter((link) => {
    try {
      const linkUrl = new URL(link.href);
      return (
        linkUrl.origin !== pageOrigin &&
        !isSameHostname(linkUrl.hostname, rootHostname)
      );
    } catch {
      return false;
    }
  });
  const rawActionCandidates = interactionExtraction.interactions
    .filter((interaction) => interaction.visibility !== "HIDDEN")
    .map((interaction) => ({
      evidenceId: interaction.id,
      label: interaction.visibleText,
      accessibleName: interaction.accessibleName,
      href: interaction.destinationUrl,
      surroundingText: interaction.surroundingText,
      destinationPurpose: interaction.destinationPurpose,
      intentConfidence: interaction.intentConfidence,
      elementType: interaction.elementType,
      domLocation: actionDomLocation(interaction.domRegion),
      buttonLike:
        interaction.elementType === "button" ||
        interaction.elementType === "input" ||
        interaction.relativeProminence >= 5,
      nearPrimaryHeading:
        interaction.domRegion === "HERO" &&
        interaction.relativeProminence >= 4,
      navigationLike: [
        "HEADER",
        "PRIMARY_NAVIGATION",
        "SECONDARY_NAVIGATION",
        "FOOTER",
      ].includes(interaction.domRegion),
    }))
    .slice(0, 180);
  const actionSummary = classifyWebsiteActions({
    candidates: rawActionCandidates,
    businessKind: kind,
  });
  const ctaCandidates = actionSummary.detectedActionTypes;
  const images = $("img");
  const imageCount = images.length;
  const imagesMissingAltCount = images
    .filter((_, element) => !textOf($(element).attr("alt") ?? ""))
    .length;
  const bodyText = textOf($("body").text());
  const cleanContent = cleanMainContent(html);
  const canonicalUrl = resolvedCanonicalUrl($, url);
  const navigationLabels = unique(
    links
      .filter(
        (link) =>
          link.domLocation === "navigation" || link.domLocation === "header",
      )
      .map((link) => link.label)
      .filter(Boolean),
  ).slice(0, 30);
  const formLabels = extractFormLabels($);
  const structuredDataTypes = extractStructuredDataTypes($);
  const trustSignals = detectTrustSignals({
    bodyText: cleanContent.fullText,
    structuredDataTypes,
  });
  const imageAltText = unique(
    images
      .map((_, element) => textOf($(element).attr("alt") ?? "").slice(0, 180))
      .get()
      .filter(Boolean),
  ).slice(0, 30);
  const localBusinessClues = extractLocalBusinessClues({
    $,
    baseUrl: url,
    bodyText,
    linkUrls: links.map((link) => link.href),
  });
  const contactSignals = detectContactSignals({ bodyText, links });
  const warnings: string[] = [];
  const finalTypes = unique([
    ...pageTypes,
    ...classifyImportantPage({
      url: new URL(url),
      label: `${pageTitle ?? ""} ${h1Text.join(" ")}`,
      kind,
    }),
  ]);
  const mainContentWordCount = cleanContent.fullText
    ? cleanContent.fullText.split(/\s+/).length
    : 0;
  const thinContent = assessThinContent({
    mainContentWordCount,
    pageTypes: finalTypes,
  });
  const copyQualityIssues = detectCopyQualityIssues({
    url,
    text: cleanContent.fullText,
  });
  const conversionProcess = analyzeConversionProcess({
    text: cleanContent.fullText,
    formLabels,
    actionTypes: actionSummary.detectedActionTypes,
  });
  const contentHash = sha256(cleanContent.fullText);
  const metadataHash = sha256(
    JSON.stringify({
      pageTitle,
      metaDescription,
      h1Text,
      h2Text,
      h3Text,
      canonicalUrl,
      ctaCandidates,
      formLabels,
      trustSignals,
      structuredDataTypes,
    }),
  );

  if (html.length >= maxHtmlBytes) {
    warnings.push("Page HTML was large, so analysis used the first 900KB.");
  }

  const pageWithoutScore = {
    url,
    requestedUrl,
    finalUrl: url,
    statusCode,
    analysisStatus: "ANALYZED" as const,
    title: pageTitle,
    metaDescription,
    h1Count: $("h1").length,
    h1Text,
    hasCanonical: $('link[rel="canonical"]').length > 0,
    hasViewportMeta: $('meta[name="viewport"]').length > 0,
    imageCount,
    imagesMissingAltCount,
    internalLinksCount: internalLinks.length,
    externalLinksCount: externalLinks.length,
    ctaCandidates,
    actionSummary,
    interactionEvidence: interactionExtraction.interactions,
    contactEvidence: interactionExtraction.contact,
    wordCount: bodyText ? bodyText.split(/\s+/).length : 0,
    mainContentWordCount,
    thinContent,
    copyQualityIssues,
    conversionProcess,
    warnings,
    pageTypes: finalTypes,
    hasContactInfo:
      contactSignals.length > 0 || interactionExtraction.contact.hasAnyContactPath,
    contactSignals,
    operatingHoursSignals: extractOperatingHoursSignals(
      `${bodyText} ${metaDescription ?? ""}`,
    ),
    canonicalUrl,
    h2Text,
    h3Text,
    navigationLabels,
    formLabels,
    trustSignals,
    imageAltText,
    structuredDataTypes,
    contentExcerpt: cleanContent.fullText.slice(0, 700) || null,
    analysisContent: cleanContent.retainedText || null,
    contentHash,
    metadataHash,
    templateGroup: pageTemplateGroup(url, finalTypes),
    inPrimaryNavigation: finalTypes.includes("Homepage"),
    internalLinkProminence: finalTypes.includes("Homepage") ? 1 : 0,
    indexable: !/\bnoindex\b/i.test(
      $('meta[name="robots"]').attr("content") ?? "",
    ),
    fetchQuality,
    ...localBusinessClues,
  };

  return {
    page: {
      ...pageWithoutScore,
      score: scorePage(pageWithoutScore),
    },
    internalLinks: internalLinks.map((link) => ({
      href: link.href,
      label: link.label,
      inPrimaryNavigation:
        link.domLocation === "navigation" || link.domLocation === "header",
    })),
  };
}

async function fetchAndAnalyzePage({
  target,
  rootHostname,
  kind,
  fetchText,
  timeoutMs,
  renderedFallbackEnabled,
  renderPage,
}: {
  target: CrawlTarget;
  rootHostname: string;
  kind: CrawlBusinessKind;
  fetchText: typeof fetchPublicText;
  timeoutMs: number;
  renderedFallbackEnabled: boolean;
  renderPage: RenderedPageFetcher;
}): Promise<{
  page: CrawledPageResult;
  internalLinks: CrawledLink[];
}> {
  try {
    const response = await fetchText(target.url, {
      timeoutMs,
      maxBytes: maxHtmlBytes,
      accept: "text/html,application/xhtml+xml",
      userAgent:
        "Onread AI Website Crawler/1.0 (+https://onread.ai)",
      allowedHostname: rootHostname,
    });

    const finalUrl = response.url;
    const contentType = response.headers.get("content-type") ?? "";

    const baseQuality: NonNullable<CrawledPageResult["fetchQuality"]> = {
      method: "STATIC_HTML",
      contentType: contentType || null,
      redirectHistory: response.redirectHistory ?? [],
      rawHtmlBytes: Buffer.byteLength(response.text, "utf8"),
      extractedTextBytes: 0,
      renderedTextBytes: 0,
      fetchDurationMs: response.fetchDurationMs ?? 0,
      timeout: false,
      retryCount: 0,
      robotsStatus: "UNKNOWN",
      extractionCompleteness: response.truncated ? "PARTIAL" : "COMPLETE",
      errorClassification: null,
      renderingStatus: renderedFallbackEnabled ? "NOT_NEEDED" : "NOT_ENABLED",
      renderingEscalationSignals: [],
      renderedCacheHit: false,
    };

    if (!response.ok) {
      return {
        page: emptyPageResult(finalUrl, response.status, [
          `Request returned HTTP ${response.status}.`,
        ], target.pageTypes, {
          ...baseQuality,
          extractionCompleteness: "INCOMPLETE",
          errorClassification: `HTTP_${response.status}`,
        }, target.url),
        internalLinks: [],
      };
    }

    if (!contentType.toLowerCase().includes("html")) {
      return {
        page: emptyPageResult(finalUrl, response.status, [
          `Page returned non-HTML content: ${contentType || "unknown"}.`,
        ], target.pageTypes, {
          ...baseQuality,
          extractionCompleteness: "INCOMPLETE",
          errorClassification: "NON_HTML_RESPONSE",
        }, target.url),
        internalLinks: [],
      };
    }

    const staticText = textOf(load(response.text)("body").text());
    const escalation = shouldUseRenderedFetch({
      html: response.text,
      extractedText: staticText,
    });
    baseQuality.extractedTextBytes = Buffer.byteLength(staticText, "utf8");
    baseQuality.renderingEscalationSignals = escalation.signals;
    if (escalation.shouldRender) {
      baseQuality.extractionCompleteness = "INCOMPLETE";
    }

    let result = analyzeHtmlPage({
      url: finalUrl,
      requestedUrl: target.url,
      html: response.text,
      statusCode: response.status,
      rootHostname,
      pageTypes: target.pageTypes,
      kind,
      fetchQuality: baseQuality,
    });

    if (renderedFallbackEnabled && escalation.shouldRender) {
      const rendered = await renderPage({
        url: finalUrl,
        allowedHostname: rootHostname,
        timeoutMs: Math.min(12_000, Math.max(2_000, timeoutMs)),
        maxBytes: maxHtmlBytes,
        rawContentHash: rawPageContentHash(response.text),
      });
      const renderingStatus =
        rendered.status === "SUCCESS"
          ? "USED"
          : rendered.status === "UNAVAILABLE"
            ? "UNAVAILABLE"
            : "FAILED";
      const renderedQuality: NonNullable<CrawledPageResult["fetchQuality"]> = {
        ...baseQuality,
        method: rendered.status === "SUCCESS" ? "RENDERED_HTML" : "STATIC_HTML",
        renderedTextBytes: rendered.renderedTextSize,
        fetchDurationMs: baseQuality.fetchDurationMs + rendered.durationMs,
        renderingStatus,
        renderedCacheHit: rendered.cacheHit,
        errorClassification: rendered.errorClassification,
        extractionCompleteness:
          rendered.status === "SUCCESS" ? "COMPLETE" : "INCOMPLETE",
      };

      if (rendered.status === "SUCCESS" && rendered.html) {
        result = analyzeHtmlPage({
          url: rendered.finalUrl,
          requestedUrl: target.url,
          html: rendered.html,
          statusCode: response.status,
          rootHostname,
          pageTypes: target.pageTypes,
          kind,
          extractionMethod: "RENDERED_HTML",
          fetchQuality: renderedQuality,
        });
      } else {
        result.page.fetchQuality = renderedQuality;
        result.page.warnings.push(
          "Static extraction looked incomplete and rendered-page verification was unavailable. This page is treated as a coverage limitation, not an empty-page defect.",
        );
      }
    }

    if (response.truncated) {
      result.page.warnings.push(
        "Page HTML exceeded the response limit, so only the first portion was analyzed.",
      );
    }

    return result;
  } catch (error) {
    const message = publicHttpErrorMessage(error, "Page request failed.");
    return {
      page: emptyPageResult(
        target.url,
        null,
        [message],
        target.pageTypes,
        {
          method: "STATIC_HTML",
          contentType: null,
          redirectHistory: [],
          rawHtmlBytes: 0,
          extractedTextBytes: 0,
          renderedTextBytes: 0,
          fetchDurationMs: 0,
          timeout: /timed out/i.test(message),
          retryCount: 0,
          robotsStatus: "UNKNOWN",
          extractionCompleteness: "INCOMPLETE",
          errorClassification: /timed out/i.test(message)
            ? "TIMEOUT"
            : "FETCH_FAILED",
          renderingStatus: renderedFallbackEnabled
            ? "NOT_NEEDED"
            : "NOT_ENABLED",
          renderingEscalationSignals: [],
          renderedCacheHit: false,
        },
      ),
      internalLinks: [],
    };
  }
}

function enrichCrawledInteractionDestinations(
  pages: CrawledPageResult[],
  kind: CrawlBusinessKind,
  rootHostname: string,
) {
  const destinations = new Map<string, CrawledPageResult>();
  for (const page of pages) {
    try {
      destinations.set(crawlUrlKey(page.url), page);
    } catch {
      // Invalid failed-page URLs cannot provide destination evidence.
    }
  }

  for (const page of pages) {
    if (page.analysisStatus !== "ANALYZED" || !page.interactionEvidence) {
      continue;
    }

    const enriched = page.interactionEvidence.map((interaction) => {
      if (!interaction.destinationUrl) return interaction;
      if (/^(?:mailto|tel):/i.test(interaction.destinationUrl)) {
        return { ...interaction, destinationStatus: "NON_HTTP" as const };
      }

      let destination: CrawledPageResult | undefined;
      let destinationStatus: ExtractedInteractionEvidence["destinationStatus"] =
        "NOT_CRAWLED";
      try {
        const url = new URL(interaction.destinationUrl);
        if (!isSameWebsiteHostname(url.hostname, rootHostname)) {
          return { ...interaction, destinationStatus: "EXTERNAL" as const };
        }
        destination = destinations.get(crawlUrlKey(url));
        if (destination) {
          destinationStatus =
            destination.analysisStatus === "ANALYZED" ? "ANALYZED" : "FAILED";
        }
      } catch {
        return interaction;
      }

      return enrichInteractionDestinationPurpose({
        interaction,
        destinationTitle: destination?.title,
        destinationH1: destination?.h1Text,
        destinationText: destination?.contentExcerpt,
        destinationStatus,
        businessKind: kind,
      });
    });
    const actionSummary = classifyWebsiteActions({
      candidates: enriched
        .filter((interaction) => interaction.visibility !== "HIDDEN")
        .map((interaction) => ({
          evidenceId: interaction.id,
          label: interaction.visibleText,
          accessibleName: interaction.accessibleName,
          href: interaction.destinationUrl,
          surroundingText: interaction.surroundingText,
          destinationPurpose: interaction.destinationPurpose,
          intentConfidence: interaction.intentConfidence,
          elementType: interaction.elementType,
          domLocation: actionDomLocation(interaction.domRegion),
          buttonLike:
            interaction.elementType === "button" ||
            interaction.relativeProminence >= 5,
          nearPrimaryHeading:
            interaction.domRegion === "HERO" &&
            interaction.relativeProminence >= 4,
          navigationLike: [
            "HEADER",
            "PRIMARY_NAVIGATION",
            "SECONDARY_NAVIGATION",
            "FOOTER",
          ].includes(interaction.domRegion),
        })),
      businessKind: kind,
    });
    const contactCandidates = enriched.filter(
      (interaction) =>
        interaction.visibility !== "HIDDEN" &&
        interaction.intentConfidence >= 0.7 &&
        isCustomerContactOrConversionIntent(interaction.destinationPurpose),
    );
    const brokenContactPathEvidenceIds = contactCandidates
      .filter((interaction) => interaction.destinationStatus === "FAILED")
      .map((interaction) => interaction.id);
    const usableContactPathEvidenceIds = contactCandidates
      .filter((interaction) => interaction.destinationStatus !== "FAILED")
      .map((interaction) => interaction.id);
    const existingContact = page.contactEvidence;

    page.interactionEvidence = enriched;
    page.actionSummary = actionSummary;
    page.ctaCandidates = actionSummary.detectedActionTypes;
    page.contactEvidence = existingContact
      ? {
          ...existingContact,
          contactPathEvidenceIds: contactCandidates.map(
            (interaction) => interaction.id,
          ),
          allContactEvidenceIds: unique([
            ...contactCandidates.map((interaction) => interaction.id),
            ...(existingContact.contactFormEvidenceIds ?? []),
            ...(existingContact.contactSectionEvidenceIds ?? []),
            ...(existingContact.visibleEmailEvidenceIds ?? []),
            ...(existingContact.visiblePhoneEvidenceIds ?? []),
          ]),
          usableContactPathEvidenceIds,
          brokenContactPathEvidenceIds,
          hasAnyContactPath:
            usableContactPathEvidenceIds.length > 0 ||
            existingContact.contactSectionHeadings.length > 0 ||
            existingContact.visibleEmailAddresses.length > 0 ||
            existingContact.visiblePhoneNumbers.length > 0 ||
            existingContact.hasContactForm,
          detectedPurposes: unique<BusinessIntentPurpose>(
            contactCandidates.map((interaction) => interaction.destinationPurpose),
          ),
        }
      : existingContact;
    page.hasContactInfo =
      page.contactSignals.length > 0 ||
      Boolean(page.contactEvidence?.hasAnyContactPath);
  }
}

function publicImportantRecord(record: InternalImportantRecord): ImportantPageRecord {
  return {
    type: record.type,
    url: record.url,
    path: record.path,
    priority: record.priority,
  };
}

function summarizeCrawl({
  normalizedUrl,
  pageResults,
  warnings,
  crawlLimitUsed,
  crawlLimitReached,
  duplicateUrlsSkipped,
  businessTypeUsed,
  businessContext,
  discoveredImportantPages,
  scannedKeys,
  auditedHostname,
}: {
  normalizedUrl: string;
  pageResults: CrawledPageResult[];
  warnings: string[];
  crawlLimitUsed: number;
  crawlLimitReached: boolean;
  duplicateUrlsSkipped: number;
  businessTypeUsed: CrawlBusinessKind;
  businessContext?: CrawlBusinessContext | null;
  discoveredImportantPages: InternalImportantRecord[];
  scannedKeys: Set<string>;
  auditedHostname: string | null;
}): WebsiteCrawlResult {
  const belongsToAuditedWebsite = (page: CrawledPageResult) => {
    if (!auditedHostname) {
      return false;
    }

    try {
      return isSameWebsiteHostname(new URL(page.url).hostname, auditedHostname);
    } catch {
      return false;
    }
  };
  const successfulPages = pageResults.filter(
    (page) =>
      page.analysisStatus === "ANALYZED" && belongsToAuditedWebsite(page),
  );
  const evidenceReadyPages = successfulPages.filter(
    (page) => page.fetchQuality?.extractionCompleteness !== "INCOMPLETE",
  );
  const averagePageScore =
    evidenceReadyPages.length > 0
      ? Math.round(
          evidenceReadyPages.reduce((total, page) => total + page.score, 0) /
            evidenceReadyPages.length,
        )
      : 0;
  const scannedImportantMap = new Map<string, InternalImportantRecord>();
  const entryPage = pageResults[0];
  const entryPageWasAnalyzed = entryPage?.analysisStatus === "ANALYZED";
  const entryPageIsAuditedHomepage = Boolean(
    entryPage && entryPageWasAnalyzed && belongsToAuditedWebsite(entryPage),
  );

  if (entryPage && entryPageIsAuditedHomepage) {
    let key: string;

    try {
      key = crawlUrlKey(entryPage.url);
    } catch {
      key = entryPage.url;
    }

    scannedImportantMap.set("Homepage", {
      type: "Homepage",
      url: entryPage.url,
      path: displayPath(entryPage.url),
      priority: pagePriority("Homepage", businessTypeUsed),
      key,
    });
  }

  for (const page of pageResults) {
    if (
      page.analysisStatus !== "ANALYZED" ||
      !belongsToAuditedWebsite(page)
    ) {
      continue;
    }

    let key = "";

    try {
      key = crawlUrlKey(page.url);
    } catch {
      key = page.url;
    }

    for (const type of page.pageTypes) {
      if (type === "Homepage" && entryPageIsAuditedHomepage) {
        continue;
      }

      const recordKey = type === "Homepage" ? "Homepage" : `${type}:${key}`;
      if (!scannedImportantMap.has(recordKey)) {
        scannedImportantMap.set(recordKey, {
          type,
          url: page.url,
          path: displayPath(page.url),
          priority: pagePriority(type, businessTypeUsed),
          key,
        });
      }
    }
  }

  const context = [
    businessContext?.description,
    businessContext?.targetAudience,
    businessContext?.mainOffer,
    businessContext?.industry,
    businessContext?.businessType,
    businessContext?.primaryConversionGoal,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const reservationRelevant =
    /\b(reservation|reservations|reserve|book a table|table booking)\b/.test(
      context,
    ) ||
    discoveredImportantPages.some((record) => record.type === "Reservations");
  const reportableTypes = relevantImportantTypes(businessTypeUsed).filter(
    (type) => type !== "Reservations" || reservationRelevant,
  );
  const relevantTypes = new Set(reportableTypes);
  const scannedImportant = [...scannedImportantMap.values()]
    .filter((record) => relevantTypes.has(record.type))
    .sort(
      (a, b) => a.priority - b.priority || a.path.localeCompare(b.path),
    );
  const skippedImportant = discoveredImportantPages
    .filter(
      (record) =>
        (record.type !== "Homepage" || !entryPageIsAuditedHomepage) &&
        relevantTypes.has(record.type) &&
        !scannedKeys.has(record.key) &&
        !scannedImportant.some(
          (scanned) => scanned.type === record.type && scanned.key === record.key,
        ),
    )
    .sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path));
  const discoveredTypes = new Set(
    discoveredImportantPages
      .filter((record) => relevantTypes.has(record.type))
      .map((record) => record.type),
  );
  const scannedTypes = unique(
    scannedImportant
      .filter((record) => record.type !== "Homepage")
      .map((record) => record.type),
  );
  const missingImportantPageTypes = reportableTypes
    .filter((type) => type !== "Homepage")
    .filter((type) => !discoveredTypes.has(type));
  const thinPages = evidenceReadyPages
    .filter(
      (page) =>
        page.thinContent?.status === "THIN" ||
        page.thinContent?.status === "EMPTY",
    )
    .map((page) => ({
      url: page.url,
      wordCount: page.mainContentWordCount ?? page.wordCount,
      status: page.thinContent!.status as "THIN" | "EMPTY",
    }));
  const duplicateContentGroups = detectDuplicateContentGroups(
    evidenceReadyPages.map((page) => ({
      url: page.url,
      content: page.analysisContent ?? null,
      contentHash: page.contentHash,
      mainContentWordCount: page.mainContentWordCount ?? page.wordCount,
    })),
  );
  const copyQualityFindings = evidenceReadyPages
    .flatMap((page) => page.copyQualityIssues ?? [])
    .slice(0, 10);
  const orderingFrictionPages = evidenceReadyPages
    .filter(
      (page) =>
        page.conversionProcess?.frictionLevel === "LOW" ||
        page.conversionProcess?.frictionLevel === "MODERATE" ||
        page.conversionProcess?.frictionLevel === "HIGH",
    )
    .map((page) => ({
      url: page.url,
      frictionLevel: page.conversionProcess!.frictionLevel as
        | "LOW"
        | "MODERATE"
        | "HIGH",
      evidence: page.conversionProcess!.evidence,
    }));

  return {
    normalizedUrl,
    pagesScanned: pageResults.length,
    successfulPages: successfulPages.length,
    failedPages: pageResults.length - successfulPages.length,
    averagePageScore,
    pagesMissingTitle: evidenceReadyPages.filter((page) => !page.title).length,
    pagesMissingMetaDescription: evidenceReadyPages.filter(
      (page) => !page.metaDescription,
    ).length,
    pagesWithNoH1: evidenceReadyPages.filter((page) => page.h1Count === 0).length,
    pagesWithMultipleH1: evidenceReadyPages.filter((page) => page.h1Count > 1)
      .length,
    totalImages: evidenceReadyPages.reduce(
      (total, page) => total + page.imageCount,
      0,
    ),
    totalImagesMissingAlt: evidenceReadyPages.reduce(
      (total, page) => total + page.imagesMissingAltCount,
      0,
    ),
    pagesWithNoCTA: evidenceReadyPages.filter(
      (page) => !page.actionSummary.hasDetectedActionLinks,
    ).length,
    pagesWithDetectedActionLinks: evidenceReadyPages.filter(
      (page) => page.actionSummary.hasDetectedActionLinks,
    ).length,
    pagesWithAssessedPrimaryCta: evidenceReadyPages.filter(
      (page) => page.actionSummary.primaryCtaAssessment.assessed,
    ).length,
    pagesWithClearPrimaryCta: evidenceReadyPages.filter(
      (page) => page.actionSummary.primaryCtaAssessment.clarity === "CLEAR",
    ).length,
    pagesWithCtaNeedsImprovement: evidenceReadyPages.filter(
      (page) =>
        page.actionSummary.primaryCtaAssessment.clarity ===
        "NEEDS_IMPROVEMENT",
    ).length,
    pagesWithUncertainPrimaryCta: evidenceReadyPages.filter(
      (page) => page.actionSummary.primaryCtaAssessment.clarity === "UNCERTAIN",
    ).length,
    importantPagesFound: scannedTypes,
    importantPagesMissing: missingImportantPageTypes,
    discoveredImportantPages: discoveredImportantPages
      .filter(
        (record) =>
          relevantTypes.has(record.type) &&
          (record.type !== "Homepage" || !entryPageIsAuditedHomepage),
      )
      .sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path))
      .map(publicImportantRecord),
    scannedImportantPages: scannedImportant.map(publicImportantRecord),
    skippedImportantPages: skippedImportant.map(publicImportantRecord),
    missingImportantPageTypes,
    duplicateUrlsSkipped,
    crawlLimitUsed,
    crawlLimitReached,
    businessTypeUsed,
    pageResults,
    thinPages,
    duplicateContentGroups,
    copyQualityFindings,
    orderingFrictionPages,
    warnings,
    fetchQualitySummary: {
      completePages: pageResults.filter(
        (page) => page.fetchQuality?.extractionCompleteness === "COMPLETE",
      ).length,
      partialPages: pageResults.filter(
        (page) => page.fetchQuality?.extractionCompleteness === "PARTIAL",
      ).length,
      incompletePages: pageResults.filter(
        (page) => page.fetchQuality?.extractionCompleteness === "INCOMPLETE",
      ).length,
      renderedPages: pageResults.filter(
        (page) => page.fetchQuality?.renderingStatus === "USED",
      ).length,
      renderedFallbackFailures: pageResults.filter((page) =>
        ["FAILED", "UNAVAILABLE"].includes(
          page.fetchQuality?.renderingStatus ?? "",
        ),
      ).length,
    },
  };
}

export async function crawlWebsite(
  input: string,
  options: CrawlOptions = {},
): Promise<WebsiteCrawlResult> {
  const crawlLimitUsed = clampLimit(options.maxPages);
  const businessTypeUsed = inferBusinessKind(options.businessContext);
  const fetchText = options.fetchText ?? fetchPublicText;
  const renderedFallbackEnabled = options.renderedFallbackEnabled === true;
  const renderPage = options.renderPage ?? defaultRenderedPageFetcher;
  const startedAt = Date.now();
  const timeBudgetMs = Math.max(
    fetchTimeoutMs,
    Math.min(options.timeBudgetMs ?? 5 * 60 * 1_000, 10 * 60 * 1_000),
  );
  let normalizedUrl: string;

  try {
    normalizedUrl = normalizeWebsiteUrl(input);
  } catch (error) {
    const warning = publicHttpErrorMessage(error, "Invalid website URL.");

    return summarizeCrawl({
      normalizedUrl: input,
      pageResults: [emptyPageResult(input, null, [warning])],
      warnings: [warning],
      crawlLimitUsed,
      crawlLimitReached: false,
      duplicateUrlsSkipped: 0,
      businessTypeUsed,
      businessContext: options.businessContext,
      discoveredImportantPages: [],
      scannedKeys: new Set(),
      auditedHostname: null,
    });
  }

  const rootUrl = sanitizeCrawlUrl(normalizedUrl);
  const rootHostname = rootUrl.hostname;
  const rootPageTypes = classifyImportantPage({
    url: rootUrl,
    label: "",
    kind: businessTypeUsed,
  });
  const rootTarget: CrawlTarget = {
    url: rootUrl.toString(),
    key: crawlUrlKey(rootUrl),
    order: 0,
    pageTypes: unique(["Homepage", ...rootPageTypes]),
    priority: 0,
  };
  const visited = new Set<string>();
  const queued = new Set<string>([rootTarget.key]);
  const scannedKeys = new Set<string>();
  const queue: CrawlTarget[] = [rootTarget];
  const pageResults: CrawledPageResult[] = [];
  const warnings: string[] = [];
  const discoveredImportantMap = new Map<string, InternalImportantRecord>();
  const incomingLinkCounts = new Map<string, number>([[rootTarget.key, 1]]);
  const primaryNavigationKeys = new Set<string>([rootTarget.key]);
  let duplicateUrlsSkipped = 0;
  let order = 1;
  let stoppedForTimeBudget = false;

  while (queue.length > 0 && pageResults.length < crawlLimitUsed) {
    const remainingMs = timeBudgetMs - (Date.now() - startedAt);
    if (remainingMs < 1_000) {
      stoppedForTimeBudget = true;
      break;
    }
    queue.sort(
      (a, b) =>
        a.priority - b.priority ||
        a.order - b.order ||
        a.url.localeCompare(b.url),
    );

    const next = queue.shift();

    if (!next) {
      continue;
    }

    queued.delete(next.key);

    if (visited.has(next.key)) {
      duplicateUrlsSkipped += 1;
      continue;
    }

    visited.add(next.key);

    const result = await fetchAndAnalyzePage({
      target: next,
      rootHostname,
      kind: businessTypeUsed,
      fetchText,
      timeoutMs: Math.max(500, Math.min(fetchTimeoutMs, remainingMs)),
      renderedFallbackEnabled,
      renderPage,
    });

    pageResults.push(result.page);

    let resultKey = next.key;
    let resultMatchesAuditedWebsite = false;

    try {
      resultKey = crawlUrlKey(result.page.url);
      resultMatchesAuditedWebsite = isSameWebsiteHostname(
        new URL(result.page.url).hostname,
        rootHostname,
      );
    } catch {
      // Keep the requested key when a failed response has an invalid URL.
    }

    visited.add(resultKey);

    if (
      result.page.analysisStatus === "ANALYZED" &&
      resultMatchesAuditedWebsite
    ) {
      scannedKeys.add(next.key);
      scannedKeys.add(resultKey);
    }

    if (
      result.page.analysisStatus === "ANALYZED" &&
      resultMatchesAuditedWebsite
    ) {
      for (const type of result.page.pageTypes) {
        discoveredImportantMap.set(`${type}:${resultKey}`, {
          type,
          url: result.page.url,
          path: displayPath(result.page.url),
          priority: pagePriority(type, businessTypeUsed),
          key: resultKey,
        });
      }
    }

    for (const link of result.internalLinks) {
      const target = normalizeCrawlTarget({
        rawHref: link.href,
        baseUrl: result.page.url,
        hostname: rootHostname,
        label: link.label,
        kind: businessTypeUsed,
      });

      if (!target) {
        continue;
      }

      incomingLinkCounts.set(
        target.key,
        (incomingLinkCounts.get(target.key) ?? 0) + 1,
      );
      if (link.inPrimaryNavigation) {
        primaryNavigationKeys.add(target.key);
      }

      for (const type of target.pageTypes) {
        discoveredImportantMap.set(`${type}:${target.key}`, {
          type,
          url: target.url,
          path: displayPath(target.url),
          priority: pagePriority(type, businessTypeUsed),
          key: target.key,
        });
      }

      if (visited.has(target.key) || queued.has(target.key)) {
        duplicateUrlsSkipped += 1;
        continue;
      }

      if (queue.length >= maxQueuedTargets) {
        continue;
      }

      queued.add(target.key);
      queue.push({
        ...target,
        order,
      });
      order += 1;
    }
  }

  enrichCrawledInteractionDestinations(
    pageResults,
    businessTypeUsed,
    rootHostname,
  );
  const incompleteExtractionCount = pageResults.filter(
    (page) => page.fetchQuality?.extractionCompleteness === "INCOMPLETE",
  ).length;
  if (incompleteExtractionCount > 0) {
    warnings.push(
      `${incompleteExtractionCount} page${incompleteExtractionCount === 1 ? " had" : "s had"} incomplete extraction and was excluded from missing-element issue counts.`,
    );
  }

  for (const page of pageResults) {
    if (page.analysisStatus !== "ANALYZED") continue;

    try {
      const key = crawlUrlKey(page.url);
      page.internalLinkProminence = Math.max(
        page.internalLinkProminence ?? 0,
        incomingLinkCounts.get(key) ?? 0,
      );
      page.inPrimaryNavigation =
        page.pageTypes.includes("Homepage") ||
        primaryNavigationKeys.has(key);
    } catch {
      // Failed URL normalization does not invalidate the deterministic page result.
    }
  }

  const crawlLimitReached = queue.some((target) => !visited.has(target.key));

  if (stoppedForTimeBudget) {
    warnings.push(
      "Crawl stopped at its execution time budget; saved results include only completed page requests.",
    );
  } else if (crawlLimitReached) {
    warnings.push(`Crawl stopped at the ${crawlLimitUsed} page plan limit.`);
  }

  const entryPage = pageResults[0];
  const resolvedEntryUrl =
    entryPage &&
    (() => {
      try {
        return isSameWebsiteHostname(
          new URL(entryPage.url).hostname,
          rootHostname,
        );
      } catch {
        return false;
      }
    })()
      ? entryPage.url
      : rootTarget.url;

  return summarizeCrawl({
    normalizedUrl: resolvedEntryUrl,
    pageResults,
    warnings,
    crawlLimitUsed,
    crawlLimitReached,
    duplicateUrlsSkipped,
    businessTypeUsed,
    businessContext: options.businessContext,
    discoveredImportantPages: [...discoveredImportantMap.values()],
    scannedKeys,
    auditedHostname: rootHostname,
  });
}

export function websiteCrawlForAuditSnapshot(
  crawl: WebsiteCrawlResult,
): WebsiteCrawlResult {
  return {
    ...crawl,
    pageResults: crawl.pageResults.map((page) => {
      const snapshotPage = { ...page };
      delete snapshotPage.analysisContent;
      return snapshotPage;
    }),
  };
}

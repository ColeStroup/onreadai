import { load, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";

import {
  classifyWebsiteActions,
  emptyWebsiteActionSummary,
  matchesActionCandidate,
  type WebsiteActionSummary,
} from "@/lib/analyzers/action-classifier";
import {
  emptyLocalBusinessClues,
  extractLocalBusinessClues,
  type LocalBusinessSchemaSnapshot,
} from "@/lib/analyzers/local-business-clues";
import {
  fetchPublicText,
  publicHttpErrorMessage,
} from "@/lib/network/public-http";
import { extractOperatingHoursSignals } from "@/lib/analyzers/observable-signals";

export type WebsiteAnalysis = {
  normalizedUrl: string;
  pageTitle: string | null;
  metaDescription: string | null;
  contentExcerpt?: string | null;
  h1Count: number;
  h1Text: string[];
  hasViewportMeta: boolean;
  hasCanonical: boolean;
  internalLinksCount: number;
  externalLinksCount: number;
  imageCount: number;
  imagesMissingAltCount: number;
  hasContactLink: boolean;
  hasPricingLink: boolean;
  hasBlogLink: boolean;
  hasSocialLinks: boolean;
  detectedSocialLinks: string[];
  detectedAddress: string | null;
  detectedPhone: string | null;
  detectedGoogleMapsLinks: string[];
  detectedMapEmbeds: string[];
  detectedLocalBusinessSchema: LocalBusinessSchemaSnapshot[];
  operatingHoursSignals: string[];
  ctaCandidates: string[];
  actionSummary: WebsiteActionSummary;
  warnings: string[];
  score: number;
};

type WebsiteAnalyzerOptions = {
  businessContext?: {
    description?: string | null;
    targetAudience?: string | null;
    mainOffer?: string | null;
    industry?: string | null;
    businessType?: string | null;
    primaryConversionGoal?: string | null;
  } | null;
};

type BusinessKind =
  | "restaurant"
  | "saas"
  | "local_service"
  | "ecommerce"
  | "general";

const fetchTimeoutMs = 8000;
const maxHtmlBytes = 1_000_000;
const maxBusinessContentExcerptChars = 4_500;
const maxBusinessContentBlockChars = 700;
const socialHosts = [
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "youtube.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "pinterest.com",
];
const ctaTerms = [
  "get started",
  "book",
  "contact",
  "schedule",
  "buy",
  "sign up",
  "start",
  "request quote",
  "learn more",
  "call now",
];
const ctaTermsByKind: Record<BusinessKind, string[]> = {
  restaurant: [
    "view menu",
    "menu",
    "get directions",
    "directions",
    "hours",
    "order online",
    "order",
    "takeout",
    "reservation",
    "reservations",
    "events",
    "gift cards",
  ],
  saas: [
    "start free trial",
    "free trial",
    "book demo",
    "request demo",
    "view pricing",
    "pricing",
    "contact sales",
    "sign up",
  ],
  local_service: [
    "get quote",
    "request quote",
    "book appointment",
    "schedule service",
    "request estimate",
    "free estimate",
  ],
  ecommerce: [
    "shop now",
    "shop",
    "view products",
    "products",
    "add to cart",
    "subscribe",
    "buy now",
  ],
  general: [],
};

function emptyAnalysis(normalizedUrl: string, warnings: string[]): WebsiteAnalysis {
  const localBusinessClues = emptyLocalBusinessClues();

  return {
    normalizedUrl,
    pageTitle: null,
    metaDescription: null,
    contentExcerpt: null,
    h1Count: 0,
    h1Text: [],
    hasViewportMeta: false,
    hasCanonical: false,
    internalLinksCount: 0,
    externalLinksCount: 0,
    imageCount: 0,
    imagesMissingAltCount: 0,
    hasContactLink: false,
    hasPricingLink: false,
    hasBlogLink: false,
    hasSocialLinks: false,
    detectedSocialLinks: [],
    ...localBusinessClues,
    ctaCandidates: [],
    actionSummary: emptyWebsiteActionSummary(),
    operatingHoursSignals: [],
    warnings,
    score: 0,
  };
}

export function normalizeWebsiteUrl(input: string) {
  const value = input.trim();

  if (!value) {
    throw new Error("Website URL is empty.");
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs can be analyzed.");
  }

  url.hash = "";
  return url.toString();
}

function textOf(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function extractBusinessContentExcerpt($: CheerioAPI) {
  const preferred = $("main, [role='main'], article").find(
    "h1, h2, h3, h4, p, li, dt, dd",
  );
  const candidates =
    preferred.length > 0
      ? preferred
      : $("body").find("h1, h2, h3, h4, p, li, dt, dd");
  const blocks: string[] = [];
  const seen = new Set<string>();
  let length = 0;

  candidates.each((_, element) => {
    if (length >= maxBusinessContentExcerptChars) {
      return false;
    }

    const node = $(element);
    if (
      node.closest("script, style, noscript, template, svg, nav, footer").length >
        0 ||
      node.attr("aria-hidden") === "true"
    ) {
      return;
    }

    const text = textOf(node.text()).slice(0, maxBusinessContentBlockChars);
    const key = text.toLowerCase();

    if (text.length < 3 || seen.has(key)) {
      return;
    }

    const remaining = maxBusinessContentExcerptChars - length;
    const block = text.slice(0, remaining);
    blocks.push(block);
    seen.add(key);
    length += block.length + 1;
  });

  if (blocks.length > 0) {
    return blocks.join("\n").slice(0, maxBusinessContentExcerptChars);
  }

  const body = $("body").clone();
  body.find("script, style, noscript, template, svg, nav, footer").remove();
  return (
    textOf(body.text()).slice(0, maxBusinessContentExcerptChars) || null
  );
}

function scoreAnalysis(analysis: Omit<WebsiteAnalysis, "score">) {
  let score = 100;

  if (!analysis.pageTitle) score -= 12;
  if (!analysis.metaDescription) score -= 14;
  if (analysis.h1Count === 0) score -= 16;
  if (analysis.h1Count > 1) score -= Math.min(12, (analysis.h1Count - 1) * 4);
  if (!analysis.hasViewportMeta) score -= 8;
  if (!analysis.hasCanonical) score -= 4;
  if (analysis.imageCount > 0) {
    const missingAltRatio = analysis.imagesMissingAltCount / analysis.imageCount;
    score -= Math.round(missingAltRatio * 14);
  }
  if (analysis.ctaCandidates.length === 0) score -= 12;
  if (!analysis.hasContactLink) score -= 8;
  if (!analysis.hasSocialLinks) score -= 4;
  score -= Math.min(12, analysis.warnings.length * 4);

  return Math.max(0, Math.min(100, score));
}

function isSocialUrl(href: string) {
  const lowerHref = href.toLowerCase();

  return socialHosts.some((host) => lowerHref.includes(host));
}

function uniqueLimited(values: string[], limit: number) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function inferBusinessKind(context?: WebsiteAnalyzerOptions["businessContext"]) {
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

function ctaTermsForContext(context?: WebsiteAnalyzerOptions["businessContext"]) {
  const businessKind = inferBusinessKind(context);

  return [...new Set([...ctaTerms, ...ctaTermsByKind[businessKind]])];
}

export async function analyzeWebsite(
  input: string,
  options: WebsiteAnalyzerOptions = {},
): Promise<WebsiteAnalysis> {
  let normalizedUrl: string;

  try {
    normalizedUrl = normalizeWebsiteUrl(input);
  } catch (error) {
    return emptyAnalysis(input, [
      publicHttpErrorMessage(error, "Invalid website URL."),
    ]);
  }

  try {
    const response = await fetchPublicText(normalizedUrl, {
      timeoutMs: fetchTimeoutMs,
      maxBytes: maxHtmlBytes,
      accept: "text/html,application/xhtml+xml",
      userAgent:
        "Onread AI Website Analyzer/1.0 (+https://onread.ai)",
    });

    const finalUrl = response.url;
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      return emptyAnalysis(finalUrl, [
        `Homepage request returned HTTP ${response.status}.`,
      ]);
    }

    if (!contentType.toLowerCase().includes("html")) {
      return emptyAnalysis(finalUrl, [
        `Homepage returned non-HTML content: ${contentType || "unknown"}.`,
      ]);
    }

    const html = response.text;
    const $ = load(html);
    const finalOrigin = new URL(finalUrl).origin;
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
    const links = $("a[href]")
      .map((_, element) => {
        const rawHref = $(element).attr("href") ?? "";
        const label = textOf($(element).text());

        try {
          return {
            href: new URL(rawHref, finalUrl).toString(),
            label,
            ...elementActionSignals($, element),
          };
        } catch {
          return null;
        }
      })
    .get()
    .filter(
        (link): link is {
          href: string;
          label: string;
          elementType: string;
          domLocation:
            | "hero"
            | "main"
            | "header"
            | "navigation"
            | "footer"
            | "unknown";
          buttonLike: boolean;
          nearPrimaryHeading: boolean;
          navigationLike: boolean;
        } => Boolean(link?.href) && !link.href.startsWith("mailto:"),
      );
    const internalLinks = links.filter(
      (link) => new URL(link.href).origin === finalOrigin,
    );
    const externalLinks = links.filter(
      (link) => new URL(link.href).origin !== finalOrigin,
    );
    const detectedSocialLinks = uniqueLimited(
      links.filter((link) => isSocialUrl(link.href)).map((link) => link.href),
      12,
    );
    const contextCtaTerms = ctaTermsForContext(options.businessContext);
    const buttonCandidates = $("button, [role='button']")
      .map((_, element) => ({
        label: textOf($(element).text()),
        href: $(element).attr("data-href") ?? "",
        ...elementActionSignals($, element),
      }))
      .get()
      .filter((button) => Boolean(button.label));
    const rawActionCandidates = [
      ...links.filter((link) =>
        matchesActionCandidate({
          label: link.label,
          href: link.href,
          terms: contextCtaTerms,
        }),
      ),
      ...buttonCandidates.filter((button) =>
        matchesActionCandidate({
          label: button.label,
          href: button.href,
          terms: contextCtaTerms,
        }),
      ),
    ].slice(0, 40);
    const actionSummary = classifyWebsiteActions({
      candidates: rawActionCandidates,
      businessContext: options.businessContext,
    });
    const ctaCandidates = actionSummary.detectedActionTypes;
    const images = $("img");
    const imageCount = images.length;
    const imagesMissingAltCount = images
      .filter((_, element) => !textOf($(element).attr("alt") ?? ""))
      .length;
    const allLinkText = links
      .map((link) => `${link.label} ${link.href}`)
      .join(" ")
      .toLowerCase();
    const bodyText = textOf($("body").text());
    const contentExcerpt = extractBusinessContentExcerpt($);
    const localBusinessClues = extractLocalBusinessClues({
      $,
      baseUrl: finalUrl,
      bodyText,
      linkUrls: links.map((link) => link.href),
    });
    const warnings: string[] = [];

    if (response.truncated) {
      warnings.push("Homepage HTML was large, so analysis used the first 1MB.");
    }

    const analysisWithoutScore = {
      normalizedUrl: finalUrl,
      pageTitle,
      metaDescription,
      contentExcerpt,
      h1Count: $("h1").length,
      h1Text,
      hasViewportMeta: $('meta[name="viewport"]').length > 0,
      hasCanonical: $('link[rel="canonical"]').length > 0,
      internalLinksCount: internalLinks.length,
      externalLinksCount: externalLinks.length,
      imageCount,
      imagesMissingAltCount,
      hasContactLink: /contact|call|email|get-in-touch/.test(allLinkText),
      hasPricingLink: /pricing|plans|rates|packages/.test(allLinkText),
      hasBlogLink: /blog|articles|resources|insights/.test(allLinkText),
      hasSocialLinks: detectedSocialLinks.length > 0,
      detectedSocialLinks,
      ...localBusinessClues,
      operatingHoursSignals: extractOperatingHoursSignals(
        `${bodyText} ${metaDescription ?? ""}`,
      ),
      ctaCandidates,
      actionSummary,
      warnings,
    };

    return {
      ...analysisWithoutScore,
      score: scoreAnalysis(analysisWithoutScore),
    };
  } catch (error) {
    return emptyAnalysis(normalizedUrl, [
      publicHttpErrorMessage(error, "Homepage request failed."),
    ]);
  }
}

function elementActionSignals($: CheerioAPI, element: Element) {
  const node = $(element);
  const className = node.attr("class") ?? "";
  const role = node.attr("role") ?? "";
  const hero = node.closest(
    "[class*='hero'], [class*='Hero'], [id*='hero'], [id*='Hero'], [class*='banner'], [class*='Banner']",
  );
  const inNavigation = node.closest("nav").length > 0;
  const inHeader = node.closest("header").length > 0;
  const inFooter = node.closest("footer").length > 0;
  const inMain = node.closest("main").length > 0;
  const domLocation = hero.length
    ? "hero"
    : inNavigation
      ? "navigation"
      : inHeader
        ? "header"
        : inFooter
          ? "footer"
          : inMain
            ? "main"
            : "unknown";

  return {
    elementType: element.tagName ?? "unknown",
    domLocation: domLocation as
      | "hero"
      | "main"
      | "header"
      | "navigation"
      | "footer"
      | "unknown",
    buttonLike:
      element.tagName === "button" ||
      role.toLowerCase() === "button" ||
      /(?:^|\s)(?:btn|button|cta)(?:\s|$|-|_)/i.test(className),
    nearPrimaryHeading:
      hero.find("h1").length > 0 ||
      node.parent().find("h1").length > 0 ||
      node.siblings("h1").length > 0,
    navigationLike: inNavigation || inHeader || inFooter,
  };
}

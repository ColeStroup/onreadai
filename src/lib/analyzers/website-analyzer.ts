import { load, type CheerioAPI } from "cheerio";

import {
  classifyWebsiteActions,
  emptyWebsiteActionSummary,
  inferActionBusinessKind,
  type WebsiteActionSummary,
} from "@/lib/analyzers/action-classifier";
import {
  extractInteractionEvidence,
  type ContactEvidenceSummary,
  type ExtractedInteractionEvidence,
} from "@/lib/analyzers/interaction-evidence";
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
  requestedUrl?: string;
  finalUrl?: string;
  canonicalUrl?: string | null;
  fetchStatus?: "success" | "failed";
  statusCode?: number | null;
  contentType?: string | null;
  rawHtmlBytes?: number;
  extractedTextBytes?: number;
  fetchDurationMs?: number;
  redirectHistory?: Array<{
    from: string;
    to: string;
    statusCode: number;
  }>;
  extractionCompleteness?: "COMPLETE" | "PARTIAL" | "INCOMPLETE";
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
  interactionEvidence?: ExtractedInteractionEvidence[];
  contactEvidence?: ContactEvidenceSummary;
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
  fetchText?: typeof fetchPublicText;
};

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
function emptyAnalysis(
  normalizedUrl: string,
  warnings: string[],
): WebsiteAnalysis {
  const localBusinessClues = emptyLocalBusinessClues();

  return {
    normalizedUrl,
    requestedUrl: normalizedUrl,
    finalUrl: normalizedUrl,
    fetchStatus: "failed",
    statusCode: null,
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
    interactionEvidence: [],
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
      node.closest("script, style, noscript, template, svg, nav, footer")
        .length > 0 ||
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
  return textOf(body.text()).slice(0, maxBusinessContentExcerptChars) || null;
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
    const missingAltRatio =
      analysis.imagesMissingAltCount / analysis.imageCount;
    score -= Math.round(missingAltRatio * 14);
  }
  if (analysis.ctaCandidates.length === 0) score -= 12;
  if (!analysis.hasContactLink) score -= 8;
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
    const response = await (options.fetchText ?? fetchPublicText)(normalizedUrl, {
      timeoutMs: fetchTimeoutMs,
      maxBytes: maxHtmlBytes,
      accept: "text/html,application/xhtml+xml",
      userAgent: "Onread AI Website Analyzer/1.0 (+https://onread.ai)",
    });

    const finalUrl = response.url;
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      return {
        ...emptyAnalysis(finalUrl, [
          `Homepage request returned HTTP ${response.status}.`,
        ]),
        statusCode: response.status,
      };
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
    const businessKind = inferActionBusinessKind(options.businessContext);
    const interactionExtraction = extractInteractionEvidence({
      $,
      pageUrl: finalUrl,
      businessKind,
    });
    const links = interactionExtraction.interactions
      .filter(
        (interaction) =>
          interaction.elementType === "a" && Boolean(interaction.destinationUrl),
      )
      .map((interaction) => ({
        href: interaction.destinationUrl!,
        label:
          interaction.visibleText ?? interaction.accessibleName ?? "",
        interaction,
      }));
    const navigableLinks = links.filter((link) => /^https?:/i.test(link.href));
    const internalLinks = navigableLinks.filter(
      (link) => new URL(link.href).origin === finalOrigin,
    );
    const externalLinks = navigableLinks.filter(
      (link) => new URL(link.href).origin !== finalOrigin,
    );
    const detectedSocialLinks = uniqueLimited(
      links.filter((link) => isSocialUrl(link.href)).map((link) => link.href),
      12,
    );
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
      .slice(0, 140);
    const actionSummary = classifyWebsiteActions({
      candidates: rawActionCandidates,
      businessContext: options.businessContext,
      businessKind,
    });
    const ctaCandidates = actionSummary.detectedActionTypes;
    const images = $("img");
    const imageCount = images.length;
    const imagesMissingAltCount = images.filter(
      (_, element) => !textOf($(element).attr("alt") ?? ""),
    ).length;
    const allLinkText = links
      .map((link) => `${link.label} ${link.href}`)
      .join(" ")
      .toLowerCase();
    const bodyText = textOf($("body").text());
    const contentExcerpt = extractBusinessContentExcerpt($);
    const canonicalHref = $('link[rel="canonical"]').first().attr("href")?.trim();
    const canonicalUrl = canonicalHref
      ? (() => {
          try {
            const value = new URL(canonicalHref, finalUrl);
            value.hash = "";
            return value.toString();
          } catch {
            return null;
          }
        })()
      : null;
    const localBusinessClues = extractLocalBusinessClues({
      $,
      baseUrl: finalUrl,
      bodyText,
      linkUrls: links.map((link) => link.href),
    });
    const warnings: string[] = [];
    const rawHtmlBytes = Buffer.byteLength(html, "utf8");
    const extractedTextBytes = Buffer.byteLength(bodyText, "utf8");
    const extractionCompleteness = response.truncated
      ? ("PARTIAL" as const)
      : bodyText.length < 80 && html.length > 4_000
        ? ("INCOMPLETE" as const)
        : ("COMPLETE" as const);

    if (response.truncated) {
      warnings.push("Homepage HTML was large, so analysis used the first 1MB.");
    }
    if (extractionCompleteness === "INCOMPLETE") {
      warnings.push(
        "The static homepage response contained very little readable content, so some client-rendered elements may be unavailable.",
      );
    }

    const analysisWithoutScore = {
      normalizedUrl: finalUrl,
      requestedUrl: normalizedUrl,
      finalUrl,
      canonicalUrl,
      fetchStatus: "success" as const,
      statusCode: response.status,
      contentType,
      rawHtmlBytes,
      extractedTextBytes,
      fetchDurationMs: response.fetchDurationMs,
      redirectHistory: response.redirectHistory,
      extractionCompleteness,
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
      hasContactLink: interactionExtraction.contact.hasAnyContactPath,
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
      interactionEvidence: interactionExtraction.interactions,
      contactEvidence: interactionExtraction.contact,
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

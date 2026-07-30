import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import { fetchPublicText, PublicHttpError } from "@/lib/network/public-http";

export type SeoQualityStatus =
  | "good"
  | "missing"
  | "too_short"
  | "too_long"
  | "multiple"
  | "unknown";

export type SeoFileStatus =
  | "found"
  | "missing"
  | "blocked"
  | "timeout"
  | "unreachable"
  | "unknown";

export type SeoAnalysis = {
  score: number;
  titleStatus: SeoQualityStatus;
  titleLength: number;
  metaDescriptionStatus: SeoQualityStatus;
  metaDescriptionLength: number;
  h1Status: SeoQualityStatus;
  canonicalStatus: SeoQualityStatus;
  viewportStatus: SeoQualityStatus;
  robotsTxtStatus: SeoFileStatus;
  sitemapStatus: SeoFileStatus;
  indexabilityWarnings: string[];
  seoWarnings: string[];
  seoStrengths: string[];
  recommendedFixes: string[];
};

const fetchTimeoutMs = 5000;
const maxSeoFileBytes = 250_000;

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getOrigin(url: string) {
  return new URL(url).origin;
}

function titleStatus(length: number, exists: boolean): SeoQualityStatus {
  if (!exists) return "missing";
  if (length < 30) return "too_short";
  if (length > 65) return "too_long";
  return "good";
}

function titleIsVague(value?: string | null) {
  if (!value) return false;
  return /^(?:home|welcome|untitled|homepage|index)(?:\s*[|:\-]\s*.+)?$/i.test(
    value.trim(),
  );
}

function metaDescriptionStatus(
  length: number,
  exists: boolean,
): SeoQualityStatus {
  if (!exists) return "missing";
  if (length < 70) return "too_short";
  if (length > 170) return "too_long";
  return "good";
}

function h1Status(h1Count: number): SeoQualityStatus {
  if (h1Count === 0) return "missing";
  if (h1Count > 1) return "multiple";
  return "good";
}

async function fetchTextStatus(url: string): Promise<{
  status: SeoFileStatus;
  body: string;
}> {
  try {
    const response = await fetchPublicText(url, {
      timeoutMs: fetchTimeoutMs,
      maxBytes: maxSeoFileBytes,
      accept: "text/plain,application/xml,text/xml,*/*",
      userAgent: "Onread AI SEO Analyzer/1.0 (+https://onread.ai)",
      allowedHostname: new URL(url).hostname,
    });

    if (response.status === 404) {
      return { status: "missing", body: "" };
    }

    if (response.status === 401 || response.status === 403) {
      return { status: "blocked", body: "" };
    }

    if (!response.ok) {
      return { status: "unreachable", body: "" };
    }

    return {
      status: "found",
      body: response.text,
    };
  } catch (error) {
    return {
      status:
        error instanceof PublicHttpError && error.code === "TIMEOUT"
          ? "timeout"
          : "unreachable",
      body: "",
    };
  }
}

function robotsBlocksHomepage(robotsTxt: string) {
  const lines = robotsTxt
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith("#"));
  let appliesToAllBots = false;

  for (const line of lines) {
    if (line.startsWith("user-agent:")) {
      appliesToAllBots = line.replace("user-agent:", "").trim() === "*";
      continue;
    }

    if (!appliesToAllBots) {
      continue;
    }

    if (line === "disallow: /" || line === "disallow:/") {
      return true;
    }
  }

  return false;
}

function statusLabel(status: SeoQualityStatus | SeoFileStatus) {
  return status.replaceAll("_", " ");
}

export async function analyzeSeo(
  normalizedWebsiteUrl: string,
  website?: WebsiteAnalysis | null,
): Promise<SeoAnalysis> {
  let origin: string;

  try {
    origin = getOrigin(normalizedWebsiteUrl);
  } catch {
    return {
      score: 0,
      titleStatus: "unknown",
      titleLength: 0,
      metaDescriptionStatus: "unknown",
      metaDescriptionLength: 0,
      h1Status: "unknown",
      canonicalStatus: "unknown",
      viewportStatus: "unknown",
      robotsTxtStatus: "unknown",
      sitemapStatus: "unknown",
      indexabilityWarnings: ["Website URL could not be parsed for SEO checks."],
      seoWarnings: ["SEO checks could not run because the URL is invalid."],
      seoStrengths: [],
      recommendedFixes: ["Confirm the website URL and rerun the audit."],
    };
  }

  const [robotsResult, sitemapResult] = await Promise.all([
    fetchTextStatus(`${origin}/robots.txt`),
    fetchTextStatus(`${origin}/sitemap.xml`),
  ]);
  const titleLength = website?.pageTitle?.length ?? 0;
  const vagueTitle = titleIsVague(website?.pageTitle);
  const descriptionLength = website?.metaDescription?.length ?? 0;
  const result: Omit<SeoAnalysis, "score"> = {
    titleStatus: titleStatus(titleLength, Boolean(website?.pageTitle)),
    titleLength,
    metaDescriptionStatus: metaDescriptionStatus(
      descriptionLength,
      Boolean(website?.metaDescription),
    ),
    metaDescriptionLength: descriptionLength,
    h1Status: h1Status(website?.h1Count ?? 0),
    canonicalStatus: website?.hasCanonical ? "good" : "missing",
    viewportStatus: website?.hasViewportMeta ? "good" : "missing",
    robotsTxtStatus: robotsResult.status,
    sitemapStatus: sitemapResult.status,
    indexabilityWarnings: [],
    seoWarnings: [],
    seoStrengths: [],
    recommendedFixes: [],
  };

  if (robotsResult.status !== "found") {
    result.indexabilityWarnings.push(
      `robots.txt status is ${statusLabel(robotsResult.status)}.`,
    );
    result.recommendedFixes.push("Add a readable robots.txt file.");
  } else if (robotsBlocksHomepage(robotsResult.body)) {
    result.indexabilityWarnings.push(
      "robots.txt appears to disallow crawling from the homepage path.",
    );
    result.recommendedFixes.push(
      "Review robots.txt rules so important pages are crawlable.",
    );
  } else {
    result.seoStrengths.push("robots.txt is reachable.");
  }

  if (sitemapResult.status !== "found") {
    result.indexabilityWarnings.push(
      `sitemap.xml status is ${statusLabel(sitemapResult.status)}.`,
    );
    result.recommendedFixes.push("Publish a sitemap.xml file.");
  } else {
    result.seoStrengths.push("sitemap.xml is reachable.");
  }

  if (result.titleStatus !== "good") {
    result.seoWarnings.push(
      `Page title falls outside the product's typical length guideline (${titleLength} characters). Length alone does not determine search quality.`,
    );
    result.recommendedFixes.push(
      "Write a concise, descriptive page title that explains the offer and relevant market; use the length range as a guideline, not a strict rule.",
    );
  } else if (vagueTitle) {
    result.seoWarnings.push(
      `Page title "${website?.pageTitle}" is too vague to explain the page topic or offer.`,
    );
    result.recommendedFixes.push(
      "Rewrite the page title to describe the primary offer and relevant market.",
    );
  } else {
    result.seoStrengths.push(
      "Page title is present and falls within the product's typical editorial guideline.",
    );
  }

  if (result.metaDescriptionStatus !== "good") {
    result.seoWarnings.push(
      `Meta description falls outside the product's typical length guideline (${descriptionLength} characters). Search engines may truncate or rewrite descriptions.`,
    );
    result.recommendedFixes.push(
      "Write a concise, descriptive meta summary of the offer, audience, and relevant next step; use the length range as a guideline rather than a guarantee.",
    );
  } else {
    result.seoStrengths.push(
      "Meta description is present and falls within the product's typical editorial guideline.",
    );
  }

  if (result.h1Status !== "good") {
    result.seoWarnings.push(
      result.h1Status === "multiple"
        ? `Homepage has ${website?.h1Count ?? 0} H1 headings.`
        : "Homepage is missing an H1 heading.",
    );
    result.recommendedFixes.push("Use exactly one descriptive H1 on the homepage.");
  } else {
    result.seoStrengths.push("Homepage has exactly one H1.");
  }

  if (result.canonicalStatus !== "good") {
    result.seoWarnings.push(
      "Canonical tag is missing. This is a best-practice improvement, not an emergency.",
    );
    result.recommendedFixes.push(
      "Add a canonical link tag to the homepage as a technical SEO best practice.",
    );
  } else {
    result.seoStrengths.push("Canonical tag is present.");
  }

  if (result.viewportStatus !== "good") {
    result.seoWarnings.push("Viewport meta tag is missing.");
    result.recommendedFixes.push("Add a viewport meta tag for mobile rendering.");
  } else {
    result.seoStrengths.push("Viewport meta tag is present.");
  }

  let score = 100;
  if (result.titleStatus === "missing") score -= 16;
  if (result.titleStatus === "too_short" || result.titleStatus === "too_long") {
    score -= 7;
  }
  if (vagueTitle) score -= 8;
  if (result.metaDescriptionStatus === "missing") score -= 18;
  if (
    result.metaDescriptionStatus === "too_short" ||
    result.metaDescriptionStatus === "too_long"
  ) {
    score -= 8;
  }
  if (result.h1Status === "missing") score -= 14;
  if (result.h1Status === "multiple") score -= 8;
  if (result.canonicalStatus !== "good") score -= 7;
  if (result.viewportStatus !== "good") score -= 6;
  if (result.robotsTxtStatus !== "found") score -= 7;
  if (result.sitemapStatus !== "found") score -= 8;
  if (result.indexabilityWarnings.length > 0) {
    score -= Math.min(10, result.indexabilityWarnings.length * 4);
  }

  return {
    ...result,
    score: clampScore(score),
  };
}

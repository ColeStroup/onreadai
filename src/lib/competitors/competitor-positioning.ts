import { getPrimaryCtaAssessment } from "@/lib/analyzers/action-classifier";
import type { CompetitorReviewSnapshot, CompetitorSocialSnapshot } from "@/lib/competitors/competitor-types";
import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import type { CompetitorPositioningSnapshot } from "@/lib/competitors/competitor-types";

export function buildCompetitorPositioning({
  competitorName,
  website,
  crawl,
  social,
  reviews,
}: {
  competitorName: string;
  website: WebsiteAnalysis;
  crawl: WebsiteCrawlResult;
  social: CompetitorSocialSnapshot;
  reviews: CompetitorReviewSnapshot;
}): CompetitorPositioningSnapshot {
  const headline = clean(website.h1Text.at(0));
  const description = clean(website.metaDescription) ?? clean(website.pageTitle);
  const primaryCtaAssessment = getPrimaryCtaAssessment(website.actionSummary);
  const detectedActionTypes = [
    ...new Set(
      website.actionSummary.detectedActionTypes ??
        website.actionSummary.primaryActions,
    ),
  ];
  const primaryCTA =
    primaryCtaAssessment.clarity === "CLEAR"
      ? primaryCtaAssessment.primaryCtaText
      : null;
  const secondaryCTAs = detectedActionTypes
    .filter((action) => action !== primaryCTA)
    .slice(0, 5);
  const apparentTargetAudience = extractAudience(
    [headline, description].filter(Boolean).join(" "),
  );
  const keyDifferentiators = extractDifferentiators([
    headline,
    website.metaDescription,
    website.pageTitle,
  ]);
  const evidence = [
    headline
      ? { label: "Homepage H1", value: headline, sourceUrl: website.normalizedUrl }
      : null,
    website.metaDescription
      ? {
          label: "Meta description",
          value: clean(website.metaDescription) ?? website.metaDescription,
          sourceUrl: website.normalizedUrl,
        }
      : null,
    primaryCtaAssessment.assessed
      ? {
          label: "Homepage primary CTA clarity",
          value: primaryCtaAssessment.clarity.replaceAll("_", " "),
          sourceUrl: website.normalizedUrl,
        }
      : null,
    crawl.importantPagesFound.length > 0
      ? {
          label: "Important public pages",
          value: crawl.importantPagesFound.slice(0, 10).join(", "),
          sourceUrl: website.normalizedUrl,
        }
      : null,
    social.platformCount > 0
      ? {
          label: "Detected public channels",
          value: [...new Set([...social.confirmedPlatforms, ...social.detectedPlatforms])]
            .slice(0, 8)
            .join(", "),
          sourceUrl: website.normalizedUrl,
        }
      : null,
    reviews.primaryType
      ? {
          label: "Google category",
          value: reviews.primaryType,
          sourceUrl: reviews.googleMapsUri,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  let score = 20;

  if (headline) score += 22;
  if (description) score += 18;
  if (primaryCTA) score += 18;
  else if (detectedActionTypes.length > 0) score += 6;
  if (crawl.importantPagesFound.length >= 3) score += 10;
  if (apparentTargetAudience) score += 7;
  if (keyDifferentiators.length > 0) score += 5;
  const confidence = Math.min(92, 30 + evidence.length * 10);

  return {
    apparentBusinessDescription: description,
    apparentTargetAudience,
    mainOffer: headline ?? description,
    positioningStatement:
      headline && description
        ? `${headline} ${description}`.slice(0, 420)
        : headline ?? description,
    primaryConversionGoal: primaryCTA,
    primaryCTA,
    primaryCtaClarity: primaryCtaAssessment.clarity,
    detectedActionTypes,
    secondaryCTAs,
    keyDifferentiators,
    detectedBusinessType: crawl.businessTypeUsed,
    confidence,
    score: Math.min(100, score),
    methodologyVersion: "competitor-positioning-v2-cta-evidence",
    evidence,
    limitations: [
      `Positioning is inferred from publicly observable homepage metadata, headings, detected actions, and site structure for ${competitorName}.`,
      "Detected action links are not proof that one primary CTA is clear; static structural CTA clarity is reported separately.",
      "The scan does not reveal private strategy, conversion rates, sales, traffic, or customer demographics.",
    ],
  };
}

function extractAudience(value: string) {
  const match = value.match(/\b(?:for|helping|built for|designed for)\s+([^.!?|]{3,90})/i);
  return clean(match?.[1] ?? null);
}

function extractDifferentiators(values: Array<string | null | undefined>) {
  const signals = /\b(oceanfront|waterfront|family-owned|locally owned|award-winning|since \d{4}|original|exclusive|specializ(?:e|es|ing)|only|signature|fresh|handmade)\b/i;

  return values
    .map(clean)
    .filter((value): value is string => Boolean(value))
    .filter((value) => signals.test(value))
    .slice(0, 4);
}

function clean(value?: string | null) {
  const result = value?.replace(/\s+/g, " ").trim().slice(0, 420) ?? "";
  return result || null;
}

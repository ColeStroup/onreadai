import type { SocialStrategy as PrismaSocialStrategy } from "@prisma/client";

export type SocialStrategyPriority = "high" | "medium" | "low";

export type SocialPlatformRecommendation = {
  platform: string;
  priority: SocialStrategyPriority;
  reason: string;
  contentFit: string;
  confidence: number;
};

export type SocialContentPillar = {
  title: string;
  description: string;
  exampleTopics: string[];
};

export type SocialWeeklyPlanItem = {
  day: string;
  platform: string;
  contentType: string;
  idea: string;
  goal: string;
};

export type SocialSuggestedPost = {
  platform: string;
  hook: string;
  postConcept: string;
  captionDraft: string;
  callToAction: string;
};

export type SocialConversionTip = {
  tip: string;
  reason: string;
};

export type SocialCompetitorOpportunity = {
  opportunity: string;
  reason: string;
};

export type SocialStrategyData = {
  recommendedPlatforms: SocialPlatformRecommendation[];
  contentPillars: SocialContentPillar[];
  weeklyPlan: SocialWeeklyPlanItem[];
  suggestedPosts: SocialSuggestedPost[];
  conversionTips: SocialConversionTip[];
  competitorOpportunities: SocialCompetitorOpportunity[];
  confidence: number;
  reasoningSummary: string;
};

export type SocialStrategyRecord = Pick<
  PrismaSocialStrategy,
  | "id"
  | "platformRecommendations"
  | "contentPillars"
  | "weeklyPlan"
  | "suggestedPosts"
  | "conversionTips"
  | "competitorOpportunities"
  | "confidence"
  | "source"
  | "reasoningSummary"
  | "createdAt"
  | "updatedAt"
>;

export const socialStrategySourceLabels: Record<string, string> = {
  ai_generated: "AI generated",
  fallback: "Deterministic fallback",
  manual: "Manual",
};

export function parseSocialStrategy(
  strategy?: SocialStrategyRecord | null,
): SocialStrategyData | null {
  if (!strategy) {
    return null;
  }

  return {
    recommendedPlatforms: parsePlatformRecommendations(
      strategy.platformRecommendations,
    ),
    contentPillars: parseContentPillars(strategy.contentPillars),
    weeklyPlan: parseWeeklyPlan(strategy.weeklyPlan),
    suggestedPosts: parseSuggestedPosts(strategy.suggestedPosts),
    conversionTips: parseConversionTips(strategy.conversionTips),
    competitorOpportunities: parseCompetitorOpportunities(
      strategy.competitorOpportunities,
    ),
    confidence: normalizeConfidence(strategy.confidence) ?? 45,
    reasoningSummary:
      cleanString(strategy.reasoningSummary) ||
      "Generated from saved Business Context, profiles, goals, competitors, and audit data.",
  };
}

export function normalizeSocialStrategyData(
  value: Partial<SocialStrategyData>,
): SocialStrategyData {
  return {
    recommendedPlatforms: parsePlatformRecommendations(
      value.recommendedPlatforms,
    ),
    contentPillars: parseContentPillars(value.contentPillars),
    weeklyPlan: parseWeeklyPlan(value.weeklyPlan),
    suggestedPosts: parseSuggestedPosts(value.suggestedPosts),
    conversionTips: parseConversionTips(value.conversionTips),
    competitorOpportunities: parseCompetitorOpportunities(
      value.competitorOpportunities,
    ),
    confidence: normalizeConfidence(value.confidence) ?? 45,
    reasoningSummary:
      cleanString(value.reasoningSummary) ||
      "Generated from saved Business Context, profiles, goals, competitors, and audit data.",
  };
}

export function normalizeConfidence(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function socialStrategySourceLabel(source?: string | null) {
  if (!source) {
    return "Not set";
  }

  return socialStrategySourceLabels[source] ?? source.replaceAll("_", " ");
}

export function socialStrategyPriorityClass(priority: string) {
  if (priority === "high") {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100";
  }

  if (priority === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
  }

  return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100";
}

function parsePlatformRecommendations(value: unknown) {
  return arrayFromUnknown(value)
    .map((item) => {
      if (!isRecord(item)) return null;

      return {
        platform: cleanString(item.platform) || "Platform",
        priority: parsePriority(item.priority),
        reason: cleanString(item.reason) || "Audience fit needs review.",
        contentFit:
          cleanString(item.contentFit) ||
          "Use this platform for clear, useful content tied to the offer.",
        confidence: normalizeConfidence(Number(item.confidence)) ?? 50,
      };
    })
    .filter(Boolean) as SocialPlatformRecommendation[];
}

function parseContentPillars(value: unknown) {
  return arrayFromUnknown(value)
    .map((item) => {
      if (!isRecord(item)) return null;

      return {
        title: cleanString(item.title) || "Content pillar",
        description:
          cleanString(item.description) ||
          "A repeatable theme for consistent social content.",
        exampleTopics: arrayFromUnknown(item.exampleTopics)
          .map(cleanString)
          .filter(Boolean)
          .slice(0, 8),
      };
    })
    .filter(Boolean) as SocialContentPillar[];
}

function parseWeeklyPlan(value: unknown) {
  return arrayFromUnknown(value)
    .map((item) => {
      if (!isRecord(item)) return null;

      return {
        day: cleanString(item.day) || "This week",
        platform: cleanString(item.platform) || "Best-fit platform",
        contentType: cleanString(item.contentType) || "Post",
        idea: cleanString(item.idea) || "Share one useful idea for the audience.",
        goal: cleanString(item.goal) || "Build awareness and drive a next step.",
      };
    })
    .filter(Boolean) as SocialWeeklyPlanItem[];
}

function parseSuggestedPosts(value: unknown) {
  return arrayFromUnknown(value)
    .map((item) => {
      if (!isRecord(item)) return null;

      return {
        platform: cleanString(item.platform) || "Best-fit platform",
        hook: cleanString(item.hook) || "Start with the audience pain point.",
        postConcept:
          cleanString(item.postConcept) || "Explain a useful idea clearly.",
        captionDraft:
          cleanString(item.captionDraft) ||
          "Use a concise caption that connects the idea to the offer.",
        callToAction:
          cleanString(item.callToAction) || "Point viewers to the next step.",
      };
    })
    .filter(Boolean) as SocialSuggestedPost[];
}

function parseConversionTips(value: unknown) {
  return arrayFromUnknown(value)
    .map((item) => {
      if (!isRecord(item)) return null;

      return {
        tip: cleanString(item.tip) || "Make the next step obvious.",
        reason:
          cleanString(item.reason) ||
          "Social content should connect attention to a business result.",
      };
    })
    .filter(Boolean) as SocialConversionTip[];
}

function parseCompetitorOpportunities(value: unknown) {
  return arrayFromUnknown(value)
    .map((item) => {
      if (!isRecord(item)) return null;

      return {
        opportunity:
          cleanString(item.opportunity) ||
          "Add competitor profile data for sharper comparison.",
        reason:
          cleanString(item.reason) ||
          "Competitor coverage is limited until profiles are confirmed.",
      };
    })
    .filter(Boolean) as SocialCompetitorOpportunity[];
}

function parsePriority(value: unknown): SocialStrategyPriority {
  const normalized = cleanString(value).toLowerCase();

  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }

  return "medium";
}

function arrayFromUnknown(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 900) : "";
}

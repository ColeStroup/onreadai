import "server-only";

import type {
  CompetitorComparisonResult,
  CompetitorIntelligenceSummary,
  ComparisonStatement,
} from "@/lib/competitors/competitor-types";
import {
  getOpenAIClient,
  getOpenAIModel,
  isOpenAIConfigured,
} from "@/lib/ai/openai-client";
import { logError } from "@/lib/observability/log";

export async function generateCompetitorIntelligenceSummary({
  businessName,
  comparison,
}: {
  businessName: string;
  comparison: CompetitorComparisonResult;
}): Promise<CompetitorIntelligenceSummary> {
  const fallback = buildDeterministicSummary(businessName, comparison);
  if (!isOpenAIConfigured() || comparison.analyzedCompetitorCount === 0) {
    return fallback;
  }

  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getOpenAIModel(),
      instructions: `You summarize structured, publicly observable competitor comparisons for a business owner.

Rules:
- Use only the supplied evidence. Never invent competitor actions, strategy, traffic, sales, conversions, revenue, audience demographics, social engagement, reach, impressions, or post performance.
- Distinguish observable facts from suggested responses.
- Compare confirmed social profiles only with confirmed profiles. Keep pending and detected links separate, and never call them confirmed or say a competitor performs better socially.
- Missing, unavailable, not-comparable, or not-applicable data is not an advantage for either business.
- Treat positioning as a heuristic interpretation of public messaging and use qualitative wording rather than presenting its score as objective truth.
- Preserve uncertainty, partial data, stale dates, and limitations.
- Keep each item concise, specific, and business-friendly.
- Return only valid JSON with these keys: executiveSummary, topBusinessAdvantages, topCompetitorAdvantages, topOpportunities, recommendedResponses, questionsToInvestigate, limitations.
- All list values must be arrays of strings with no more than three items, except limitations may contain up to five.`,
      input: JSON.stringify(compactComparison(businessName, comparison)),
      max_output_tokens: 900,
      store: false,
    });
    const parsed = parseSummary(response.output_text);

    return parsed
      ? {
          ...parsed,
          limitations: unique([
            ...parsed.limitations,
            ...comparison.limitations,
          ]).slice(0, 6),
          source: "ai_generated",
        }
      : fallback;
  } catch (error) {
    logError("competitor_intelligence_ai_failed", error, {
      analyzedCompetitors: comparison.analyzedCompetitorCount,
    });

    return fallback;
  }
}

export function buildDeterministicSummary(
  businessName: string,
  comparison: CompetitorComparisonResult,
): CompetitorIntelligenceSummary {
  if (comparison.analyzedCompetitorCount === 0) {
    const saved = comparison.savedButUnanalyzedCount;
    return {
      executiveSummary:
        saved > 0
          ? `${saved} competitor${saved === 1 ? " is" : "s are"} saved, but a comparable public snapshot is not available yet.`
          : "Competitor comparison is not configured yet.",
      topBusinessAdvantages: [],
      topCompetitorAdvantages: [],
      topOpportunities: [],
      recommendedResponses:
        saved > 0
          ? ["Analyze a saved competitor to create an evidence-based comparison."]
          : ["Add a relevant competitor with a public website when comparison would be useful."],
      questionsToInvestigate: [],
      limitations: comparison.limitations,
      source: "deterministic_fallback",
    };
  }

  const advantage = comparison.businessAdvantages.at(0);
  const competitorEdge = comparison.competitorAdvantages.at(0);
  const opportunity = comparison.opportunities.at(0);
  const executiveParts = [
    `${comparison.analyzedCompetitorCount} competitor${comparison.analyzedCompetitorCount === 1 ? " was" : "s were"} compared with ${businessName} using timestamped public data.`,
    advantage ? `Visible advantage: ${advantage.title}.` : null,
    competitorEdge
      ? `Competitor edge: ${competitorEdge.title.replace(/[.!?]+$/, "")}.`
      : null,
    opportunity ? `Best next response: ${opportunity.title}.` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    executiveSummary: executiveParts.join(" "),
    topBusinessAdvantages: descriptions(comparison.businessAdvantages),
    topCompetitorAdvantages: descriptions(comparison.competitorAdvantages),
    topOpportunities: descriptions(comparison.opportunities),
    recommendedResponses: comparison.opportunities
      .slice(0, 3)
      .map((item) => item.description),
    questionsToInvestigate: comparison.freshness
      .filter((item) => item.status !== "current")
      .slice(0, 3)
      .map(
        (item) =>
          `Refresh or complete ${item.competitorName}'s public snapshot before relying on missing sections.`,
      ),
    limitations: comparison.limitations,
    source: "deterministic_fallback",
  };
}

function compactComparison(
  businessName: string,
  comparison: CompetitorComparisonResult,
) {
  return {
    businessName,
    generatedAt: comparison.generatedAt,
    counts: {
      analyzed: comparison.analyzedCompetitorCount,
      stale: comparison.staleCompetitorCount,
      failed: comparison.failedCompetitorCount,
      savedButUnanalyzed: comparison.savedButUnanalyzedCount,
    },
    freshness: comparison.freshness,
    categoryComparisons: comparison.categoryComparisons.map((item) => ({
      competitorName: item.competitorName,
      category: item.category,
      businessDisplay: item.businessDisplay,
      competitorDisplay: item.competitorDisplay,
      status: item.status,
      observation: item.observation,
      evidence: item.evidence,
    })),
    businessAdvantages: compactStatements(comparison.businessAdvantages),
    competitorAdvantages: compactStatements(comparison.competitorAdvantages),
    opportunities: compactStatements(comparison.opportunities),
    risks: compactStatements(comparison.risks),
    limitations: comparison.limitations,
  };
}

function compactStatements(items: ComparisonStatement[]) {
  return items.slice(0, 5).map((item) => ({
    competitorName: item.competitorName,
    category: item.category,
    title: item.title,
    description: item.description,
    confidence: item.confidence,
    evidence: item.evidence,
  }));
}

function parseSummary(value?: string | null) {
  if (!value) return null;

  const cleaned = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const executiveSummary = cleanText(parsed.executiveSummary);

    if (!executiveSummary) return null;

    return {
      executiveSummary,
      topBusinessAdvantages: stringList(parsed.topBusinessAdvantages),
      topCompetitorAdvantages: stringList(parsed.topCompetitorAdvantages),
      topOpportunities: stringList(parsed.topOpportunities),
      recommendedResponses: stringList(parsed.recommendedResponses),
      questionsToInvestigate: stringList(parsed.questionsToInvestigate),
      limitations: stringList(parsed.limitations),
    };
  } catch {
    return null;
  }
}

function descriptions(items: ComparisonStatement[]) {
  return items.slice(0, 3).map((item) => item.description);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(cleanText)
        .filter((item): item is string => Boolean(item))
        .slice(0, 5)
    : [];
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

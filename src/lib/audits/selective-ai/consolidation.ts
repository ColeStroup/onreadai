import {
  FindingSeverity,
  RecommendationPriority,
  ScoreCategory,
} from "@prisma/client";
import { createHash } from "node:crypto";

import { selectiveAiAuditLimits } from "@/lib/audits/selective-ai/config";
import type {
  AuditAiSynthesis,
  ConsolidatedAiFinding,
  ConsolidatedAiRecommendation,
  PageAiOpportunity,
  SelectedPageAnalysisSnapshot,
} from "@/lib/audits/selective-ai/types";
import { logWarn } from "@/lib/observability/log";

type DeterministicFinding = {
  title: string;
  description: string;
  category: ScoreCategory;
};

type OpportunityWithPage = {
  opportunity: PageAiOpportunity;
  url: string;
  analysisCacheId: string | null;
};

export function consolidateAiAuditInsights({
  selectedPageAnalyses,
  deterministicFindings,
  synthesis,
}: {
  selectedPageAnalyses: SelectedPageAnalysisSnapshot[];
  deterministicFindings: DeterministicFinding[];
  synthesis: AuditAiSynthesis | null;
}) {
  const orderedIds = synthesis?.recommendedOrder.map(
    (item) => item.opportunityId,
  ) ?? [];
  const flattened = selectedPageAnalyses.flatMap<OpportunityWithPage>((page) =>
    page.analysis.opportunities.map((opportunity) => ({
      opportunity,
      url: page.url,
      analysisCacheId: page.analysisCacheId,
    })),
  );
  const deterministic = deterministicFindings.map((finding) => ({
    ...finding,
    normalized: normalize(`${finding.title} ${finding.description}`),
  }));
  const nonConflicting = flattened.filter((item) => {
    const normalized = normalize(
      `${item.opportunity.title} ${item.opportunity.description}`,
    );
    const conflicts = deterministic.some(
      (finding) =>
        finding.category === categoryForOpportunity(item.opportunity.category) &&
        similarity(normalized, finding.normalized) >= 0.62,
    );

    if (conflicts) {
      logWarn("audit_ai_opportunity_conflicts_with_deterministic_finding", {
        category: item.opportunity.category,
        opportunityId: item.opportunity.id,
      });
    }
    return !conflicts;
  });
  const groups = new Map<string, OpportunityWithPage[]>();

  for (const item of nonConflicting) {
    const key = `${categoryForOpportunity(item.opportunity.category)}:${themeFor(
      item.opportunity,
    )}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const consolidated = [...groups.values()]
    .map((items) => combineGroup(items, orderedIds))
    .sort(
      (left, right) =>
        orderIndex(left.primary.opportunity.id, orderedIds) -
          orderIndex(right.primary.opportunity.id, orderedIds) ||
        priorityWeight(right.primary.opportunity.priority) -
          priorityWeight(left.primary.opportunity.priority) ||
        confidenceWeight(right.primary.opportunity.confidence) -
          confidenceWeight(left.primary.opportunity.confidence) ||
        left.primary.opportunity.title.localeCompare(
          right.primary.opportunity.title,
        ),
    )
    .slice(0, selectiveAiAuditLimits.maximumSiteOpportunities);
  const findings: ConsolidatedAiFinding[] = [];
  const recommendations: ConsolidatedAiRecommendation[] = [];

  for (const group of consolidated) {
    const { primary, evidenceItems } = group;
    const category = categoryForOpportunity(primary.opportunity.category);
    const issueKey = `selective-ai:${category.toLowerCase()}:${themeFor(
      primary.opportunity,
    )}`;
    const findingId = stableFindingId(
      category,
      primary.opportunity.title,
      evidenceItems.map((item) => item.url),
    );
    const evidence = {
      contractVersion: "ai-reviewed-opportunity-v1",
      findingType: "AI_REVIEWED_OPPORTUNITY",
      stableFindingKey: findingId,
      issueKey,
      affectedUrls: evidenceItems.map((item) => item.url),
      opportunityIds: evidenceItems.map((item) => item.opportunity.id),
      confidence: primary.opportunity.confidence,
      evidence: evidenceItems.map((item) => ({
        sourceUrl: item.url,
        excerpt: item.opportunity.evidence,
        pageAnalysisCacheId: item.analysisCacheId,
      })),
      businessImpact: primary.opportunity.businessImpact,
      suggestedAction: primary.opportunity.recommendation,
      sourceLabel: "AI-reviewed opportunity",
    };

    findings.push({
      id: findingId,
      category,
      title: primary.opportunity.title,
      description: [
        primary.opportunity.description,
        evidenceItems.length > 1
          ? `This pattern appeared across ${evidenceItems.length} reviewed pages.`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
      severity: severityForPriority(primary.opportunity.priority),
      sourceUrl: primary.url,
      evidence,
    });
    recommendations.push({
      title: primary.opportunity.recommendation.replace(/[.]+$/, ""),
      description: `${primary.opportunity.businessImpact} Start with ${primary.opportunity.recommendation}`,
      category,
      priority: priorityForOpportunity(primary.opportunity.priority),
      estimatedEffort: effortForOpportunity(primary.opportunity),
      expectedImpact:
        primary.opportunity.priority === "HIGH" ? "High" : "Medium",
      sourceType: "ai_reviewed_opportunity",
      sourceReferenceId: findingId,
      sourceUrl: primary.url,
      evidence,
    });
  }

  return { findings, recommendations };
}

function combineGroup(items: OpportunityWithPage[], orderedIds: string[]) {
  const sorted = [...items].sort(
    (left, right) =>
      orderIndex(left.opportunity.id, orderedIds) -
        orderIndex(right.opportunity.id, orderedIds) ||
      priorityWeight(right.opportunity.priority) -
        priorityWeight(left.opportunity.priority) ||
      confidenceWeight(right.opportunity.confidence) -
        confidenceWeight(left.opportunity.confidence),
  );
  return {
    primary: sorted[0]!,
    evidenceItems: uniqueByUrl(sorted).slice(0, 3),
  };
}

function themeFor(opportunity: PageAiOpportunity) {
  const text = normalize(
    `${opportunity.title} ${opportunity.description} ${opportunity.recommendation}`,
  );
  if (/\bcta\b|call to action|next step|book|contact|order|buy/.test(text)) {
    return "conversion-action";
  }
  if (/trust|testimonial|review|proof|credential|guarantee/.test(text)) {
    return "trust";
  }
  if (/headline|value proposition|message|position|offer|audience/.test(text)) {
    return "messaging";
  }
  if (/navigation|menu|structure|find|discover/.test(text)) return "navigation";
  if (/local|location|service area/.test(text)) return "local";
  if (/search intent|query|keyword/.test(text)) return "search-intent";
  if (/alt text|accessib/.test(text)) return "accessibility-content";
  return normalize(opportunity.title).split(" ").slice(0, 5).join("-");
}

function categoryForOpportunity(
  category: PageAiOpportunity["category"],
): ScoreCategory {
  if (category === "LOCAL_SEO" || category === "SEARCH_INTENT") {
    return ScoreCategory.SEO;
  }
  if (
    category === "MESSAGING" ||
    category === "PROFESSIONALISM" ||
    category === "CONTENT"
  ) {
    return ScoreCategory.BRANDING;
  }
  if (category === "TRUST") return ScoreCategory.BRANDING;
  return ScoreCategory.WEBSITE;
}

function severityForPriority(priority: PageAiOpportunity["priority"]) {
  if (priority === "HIGH") return FindingSeverity.HIGH;
  if (priority === "MEDIUM") return FindingSeverity.MEDIUM;
  return FindingSeverity.LOW;
}

function priorityForOpportunity(priority: PageAiOpportunity["priority"]) {
  if (priority === "HIGH") return RecommendationPriority.HIGH;
  if (priority === "MEDIUM") return RecommendationPriority.MEDIUM;
  return RecommendationPriority.LOW;
}

function effortForOpportunity(opportunity: PageAiOpportunity) {
  const text = normalize(
    `${opportunity.title} ${opportunity.recommendation}`,
  );
  if (/headline|cta|call to action|label|copy|bio/.test(text)) return "Low";
  if (/navigation|rewrite|service description|trust section/.test(text)) {
    return "Medium";
  }
  return opportunity.priority === "LOW" ? "Low" : "Medium";
}

function stableFindingId(
  category: ScoreCategory,
  title: string,
  urls: string[],
) {
  return `aif_${createHash("sha256")
    .update(JSON.stringify({ category, title, urls: [...urls].sort() }))
    .digest("hex")
    .slice(0, 20)}`;
}

function similarity(left: string, right: string) {
  const leftWords = new Set(left.split(" ").filter((word) => word.length > 3));
  const rightWords = new Set(right.split(" ").filter((word) => word.length > 3));
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return intersection / union;
}

function orderIndex(id: string, orderedIds: string[]) {
  const index = orderedIds.indexOf(id);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function priorityWeight(value: PageAiOpportunity["priority"]) {
  return value === "HIGH" ? 3 : value === "MEDIUM" ? 2 : 1;
}

function confidenceWeight(value: PageAiOpportunity["confidence"]) {
  return value === "HIGH" ? 3 : value === "MEDIUM" ? 2 : 1;
}

function uniqueByUrl(items: OpportunityWithPage[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

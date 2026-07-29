import type {
  BusinessGoal,
  FindingSeverity,
  RecommendationPriority,
  ScoreCategory,
} from "@prisma/client";

import { selectiveAiAuditLimits } from "@/lib/audits/selective-ai/config";
import type {
  PageSelectionSnapshot,
  SelectedPageAnalysisSnapshot,
  SelectiveAiBusinessContext,
} from "@/lib/audits/selective-ai/types";

export type CompactAuditSynthesisContext = {
  business: {
    name: string;
    context: SelectiveAiBusinessContext;
    primaryGoal: BusinessGoal | null;
    selectedGoals: BusinessGoal[];
  };
  deterministicAudit: {
    overallScore: number;
    scores: Array<{ category: ScoreCategory; score: number }>;
    findings: Array<{
      id: string | null;
      category: ScoreCategory;
      severity: FindingSeverity;
      title: string;
      evidence: string;
    }>;
    recommendations: Array<{
      category: ScoreCategory;
      priority: RecommendationPriority;
      title: string;
      action: string;
    }>;
  };
  pageCoverage: {
    pagesCheckedTechnically: number;
    pagesSelectedForAi: number;
    pages: Array<{
      url: string;
      pageType: string;
      title: string | null;
      h1: string | null;
      wordCount: number;
      primaryCta: string | null;
      indexable: boolean | null;
      canonicalStatus: string;
      technicalFindingCount: number;
      majorTechnicalCategories: string[];
      selected: boolean;
      selectionReasons: string[];
      coverage: string;
      templateGroup: string;
      excerpt: string | null;
    }>;
  };
  selectedPageReviews: Array<{
    url: string;
    pageType: string;
    pageSummary: string;
    pagePurpose: string;
    strengths: SelectedPageAnalysisSnapshot["analysis"]["strengths"];
    opportunities: SelectedPageAnalysisSnapshot["analysis"]["opportunities"];
    limitations: string[];
  }>;
  supportingEvidence: {
    social: unknown;
    reviews: unknown;
    competitors: unknown;
  };
  limitations: string[];
};

export function buildCompactAuditSynthesisContext({
  businessName,
  businessContext,
  goals,
  primaryGoal,
  overallScore,
  scores,
  findings,
  recommendations,
  pages,
  selectedPageAnalyses,
  social,
  reviews,
  competitors,
  limitations,
}: {
  businessName: string;
  businessContext: SelectiveAiBusinessContext;
  goals: BusinessGoal[];
  primaryGoal: BusinessGoal | null;
  overallScore: number;
  scores: Array<{ category: ScoreCategory; score: number }>;
  findings: Array<{
    id?: string;
    category: ScoreCategory;
    severity: FindingSeverity;
    title: string;
    description: string;
  }>;
  recommendations: Array<{
    category: ScoreCategory;
    priority: RecommendationPriority;
    title: string;
    description: string;
  }>;
  pages: PageSelectionSnapshot[];
  selectedPageAnalyses: SelectedPageAnalysisSnapshot[];
  social: unknown;
  reviews: unknown;
  competitors: unknown;
  limitations: string[];
}): CompactAuditSynthesisContext {
  const includedOpportunityIds = new Set(
    selectedPageAnalyses
      .flatMap((page) =>
        page.analysis.opportunities.map((opportunity) => ({
          opportunity,
          url: page.url,
        })),
      )
      .sort(
        (left, right) =>
          priorityWeight(right.opportunity.priority) -
            priorityWeight(left.opportunity.priority) ||
          confidenceWeight(right.opportunity.confidence) -
            confidenceWeight(left.opportunity.confidence) ||
          left.url.localeCompare(right.url) ||
          left.opportunity.id.localeCompare(right.opportunity.id),
      )
      .slice(0, 30)
      .map((item) => item.opportunity.id),
  );
  const context: CompactAuditSynthesisContext = {
    business: {
      name: businessName,
      context: businessContext,
      primaryGoal,
      selectedGoals: goals,
    },
    deterministicAudit: {
      overallScore,
      scores: scores
        .filter((score) => score.category !== "OVERALL")
        .map((score) => ({ category: score.category, score: score.score })),
      findings: findings.slice(0, 20).map((finding) => ({
        id: finding.id ?? null,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        evidence: finding.description.slice(0, 420),
      })),
      recommendations: recommendations.slice(0, 14).map((recommendation) => ({
        category: recommendation.category,
        priority: recommendation.priority,
        title: recommendation.title,
        action: recommendation.description.slice(0, 420),
      })),
    },
    pageCoverage: {
      pagesCheckedTechnically: pages.length,
      pagesSelectedForAi: pages.filter((page) => page.selected).length,
      pages: pages.map((page) => ({
        url: page.url,
        pageType: page.pageType,
        title: page.title,
        h1: page.h1Text.at(0) ?? null,
        wordCount: page.wordCount,
        primaryCta: page.primaryCtaText,
        indexable: page.indexable,
        canonicalStatus: page.canonicalStatus,
        technicalFindingCount: page.technicalFindingCount,
        majorTechnicalCategories: page.majorTechnicalCategories,
        selected: page.selected,
        selectionReasons: page.selectionReasons.slice(0, 4),
        coverage: page.analysisCoverage,
        templateGroup: page.templateGroup,
        excerpt: page.contentExcerpt?.slice(0, 260) ?? null,
      })),
    },
    selectedPageReviews: selectedPageAnalyses.map((item) => ({
      url: item.url,
      pageType: item.pageType,
      pageSummary: item.analysis.pageSummary.slice(0, 360),
      pagePurpose: item.analysis.pagePurpose.slice(0, 200),
      strengths: item.analysis.strengths.slice(0, 2).map((strength) => ({
        ...strength,
        title: strength.title.slice(0, 140),
        evidence: strength.evidence.slice(0, 180),
      })),
      opportunities: item.analysis.opportunities
        .filter((opportunity) => includedOpportunityIds.has(opportunity.id))
        .map((opportunity) => ({
          ...opportunity,
          title: opportunity.title.slice(0, 150),
          description: opportunity.description.slice(0, 240),
          evidence: opportunity.evidence.slice(0, 180),
          businessImpact: opportunity.businessImpact.slice(0, 220),
          recommendation: opportunity.recommendation.slice(0, 240),
        })),
      limitations: item.analysis.limitations
        .slice(0, 3)
        .map((limitation) => limitation.slice(0, 220)),
    })),
    supportingEvidence: {
      social: compactUnknown(social, 3_000),
      reviews: compactUnknown(reviews, 3_000),
      competitors: compactUnknown(competitors, 4_000),
    },
    limitations:
      includedOpportunityIds.size <
      selectedPageAnalyses.reduce(
        (total, page) => total + page.analysis.opportunities.length,
        0,
      )
        ? [
            ...limitations,
            "Final synthesis received the 30 highest-priority grounded page opportunities; additional saved opportunities remain available in the audit snapshot.",
          ]
        : limitations,
  };

  return enforceSynthesisInputLimit(context);
}

export function serializeCompactSynthesisContext(
  context: CompactAuditSynthesisContext,
) {
  return JSON.stringify(context, null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function enforceSynthesisInputLimit(context: CompactAuditSynthesisContext) {
  const maximum = selectiveAiAuditLimits.maximumSynthesisInputCharacters;
  if (serializedCharacterLength(context) <= maximum) return context;

  const withoutExcerpts = {
    ...context,
    pageCoverage: {
      ...context.pageCoverage,
      pages: context.pageCoverage.pages.map((page) => ({
        ...page,
        excerpt: null,
        selectionReasons: page.selectionReasons.slice(0, 3),
      })),
    },
  };
  if (serializedCharacterLength(withoutExcerpts) <= maximum) {
    withoutExcerpts.limitations = [
      ...withoutExcerpts.limitations,
      "Deterministic page excerpts were omitted from final synthesis to stay within the input limit.",
    ];
    return withoutExcerpts;
  }

  const orderedPages = [...withoutExcerpts.pageCoverage.pages].sort(
    (left, right) =>
      Number(right.selected) - Number(left.selected) ||
      right.technicalFindingCount - left.technicalFindingCount ||
      left.url.localeCompare(right.url),
  );
  const limited: CompactAuditSynthesisContext = {
    ...withoutExcerpts,
    pageCoverage: {
      ...withoutExcerpts.pageCoverage,
      pages: orderedPages.slice(0, 60),
    },
    limitations: [
      ...withoutExcerpts.limitations,
      `${Math.max(0, orderedPages.length - 60)} compact page summaries were omitted from final synthesis because of the server-side input cap. They remain in the audit selection snapshot.`,
    ],
  };
  if (serializedCharacterLength(limited) <= maximum) return limited;

  limited.supportingEvidence = {
    social: compactUnknown(limited.supportingEvidence.social, 1_200),
    reviews: compactUnknown(limited.supportingEvidence.reviews, 1_200),
    competitors: compactUnknown(
      limited.supportingEvidence.competitors,
      1_600,
    ),
  };

  while (
    serializedCharacterLength(limited) > maximum &&
    limited.pageCoverage.pages.length > 18
  ) {
    limited.pageCoverage.pages.pop();
  }
  while (
    serializedCharacterLength(limited) > maximum &&
    limited.selectedPageReviews.length > 8
  ) {
    limited.selectedPageReviews.pop();
  }
  while (
    serializedCharacterLength(limited) > maximum &&
    limited.deterministicAudit.findings.length > 8
  ) {
    limited.deterministicAudit.findings.pop();
  }
  while (
    serializedCharacterLength(limited) > maximum &&
    limited.deterministicAudit.recommendations.length > 6
  ) {
    limited.deterministicAudit.recommendations.pop();
  }
  let opportunitiesRemovedForLimit = 0;
  while (serializedCharacterLength(limited) > maximum) {
    const pageWithExtraOpportunity = [...limited.selectedPageReviews]
      .sort(
        (left, right) =>
          right.opportunities.length - left.opportunities.length ||
          right.url.localeCompare(left.url),
      )
      .find((page) => page.opportunities.length > 1);
    if (!pageWithExtraOpportunity) break;
    pageWithExtraOpportunity.opportunities.pop();
    opportunitiesRemovedForLimit += 1;
  }
  while (
    serializedCharacterLength(limited) > maximum &&
    limited.selectedPageReviews.length > 4
  ) {
    limited.selectedPageReviews.pop();
  }
  while (
    serializedCharacterLength(limited) > maximum &&
    limited.pageCoverage.pages.length > 12
  ) {
    limited.pageCoverage.pages.pop();
  }
  if (opportunitiesRemovedForLimit > 0) {
    limited.limitations.push(
      `${opportunitiesRemovedForLimit} lower-priority opportunity summaries were omitted from final synthesis to enforce the server-side input cap. The saved page analyses remain available.`,
    );
  }
  while (
    serializedCharacterLength(limited) > maximum &&
    limited.pageCoverage.pages.length > 8
  ) {
    limited.pageCoverage.pages.pop();
  }
  while (
    serializedCharacterLength(limited) > maximum &&
    limited.selectedPageReviews.length > 3
  ) {
    limited.selectedPageReviews.pop();
  }

  return limited;
}

function compactUnknown(value: unknown, maximumCharacters: number) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= maximumCharacters) return value;
    return {
      summary: serialized.slice(0, maximumCharacters),
      truncated: true,
    };
  } catch {
    return { available: false };
  }
}

function serializedCharacterLength(value: unknown) {
  return JSON.stringify(value, null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026").length;
}

function priorityWeight(value: "HIGH" | "MEDIUM" | "LOW") {
  return value === "HIGH" ? 3 : value === "MEDIUM" ? 2 : 1;
}

function confidenceWeight(value: "HIGH" | "MEDIUM" | "LOW") {
  return value === "HIGH" ? 3 : value === "MEDIUM" ? 2 : 1;
}

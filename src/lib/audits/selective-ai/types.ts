import type {
  BusinessGoal,
  FindingSeverity,
  RecommendationPriority,
  ScoreCategory,
} from "@prisma/client";

export const pageAnalysisConfidenceValues = ["HIGH", "MEDIUM", "LOW"] as const;
export type PageAnalysisConfidence =
  (typeof pageAnalysisConfidenceValues)[number];

export const pageOpportunityCategoryValues = [
  "MESSAGING",
  "CONVERSION",
  "TRUST",
  "CONTENT",
  "NAVIGATION",
  "LOCAL_SEO",
  "SEARCH_INTENT",
  "PROFESSIONALISM",
  "ACCESSIBILITY_CONTENT",
  "OTHER",
] as const;
export type PageOpportunityCategory =
  (typeof pageOpportunityCategoryValues)[number];

export const pageAnalysisCoverageValues = [
  "DEEP_AI_REVIEWED",
  "DETERMINISTIC_ONLY",
  "EXCLUDED_UTILITY_PAGE",
  "DUPLICATE_REPRESENTATIVE",
  "CRAWL_FAILED",
] as const;
export type PageAnalysisCoverage =
  (typeof pageAnalysisCoverageValues)[number];

export type PageAnalysisStrength = {
  title: string;
  evidence: string;
  confidence: PageAnalysisConfidence;
};

export type PageAiOpportunity = {
  id: string;
  category: PageOpportunityCategory;
  title: string;
  description: string;
  evidence: string;
  businessImpact: string;
  recommendation: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  confidence: PageAnalysisConfidence;
};

export type PageAiAnalysis = {
  pageSummary: string;
  pagePurpose: string;
  strengths: PageAnalysisStrength[];
  opportunities: PageAiOpportunity[];
  primaryCta: {
    found: boolean;
    text: string | null;
    assessment: string;
  };
  limitations: string[];
};

export type PageAnalysisPayload = {
  normalizedUrl: string;
  canonicalUrl: string | null;
  pageTypes: string[];
  title: string | null;
  metaDescription: string | null;
  h1Text: string[];
  h2Text: string[];
  h3Text: string[];
  primaryVisibleContent: string;
  prominentCtas: string[];
  navigationLabels: string[];
  formLabels: string[];
  trustSignals: string[];
  contactSignals: string[];
  visibleImageAltText: string[];
  structuredDataTypes: string[];
  wordCount: number;
  internalLinksCount: number;
  deterministicFindings: string[];
  businessContext: {
    description: string | null;
    targetAudience: string | null;
    mainOffer: string | null;
    industry: string | null;
    businessType: string | null;
    primaryConversionGoal: string | null;
    brandTone: string | null;
  };
  goals: {
    primary: BusinessGoal | null;
    selected: BusinessGoal[];
  };
  contentTruncated: boolean;
  retainedCharacters: number;
  availableCharacters: number;
};

export type PageSelectionSnapshot = {
  url: string;
  canonicalUrl: string | null;
  pageType: string;
  selected: boolean;
  importanceScore: number;
  selectionReasons: string[];
  analysisCoverage: PageAnalysisCoverage;
  aiReviewStatus:
    | "NOT_SELECTED"
    | "PENDING"
    | "CACHE_HIT"
    | "COMPLETED"
    | "FAILED";
  cacheStatus: "NOT_APPLICABLE" | "PENDING" | "HIT" | "MISS";
  contentHash: string | null;
  metadataHash: string | null;
  templateGroup: string;
  title: string | null;
  h1Text: string[];
  wordCount: number;
  primaryCtaText: string | null;
  indexable: boolean | null;
  canonicalStatus: "PRESENT" | "MISSING" | "UNKNOWN";
  technicalFindingCount: number;
  majorTechnicalCategories: string[];
  contentExcerpt: string | null;
  analysisCacheId: string | null;
  contentTruncated: boolean;
};

export type SelectedPageAnalysisSnapshot = {
  url: string;
  canonicalUrl: string | null;
  pageType: string;
  analysisCacheId: string | null;
  cacheHit: boolean;
  contentTruncated: boolean;
  analysis: PageAiAnalysis;
};

export type AuditAiSynthesis = {
  executiveSummary: string;
  strengths: Array<{
    title: string;
    evidenceReferences: string[];
    confidence: PageAnalysisConfidence;
  }>;
  highestPriorityProblems: Array<{
    opportunityId: string;
    rationale: string;
    expectedImpact: string;
    confidence: PageAnalysisConfidence;
  }>;
  quickWins: Array<{
    opportunityId: string;
    rationale: string;
  }>;
  largerStrategicImprovements: Array<{
    opportunityId: string;
    rationale: string;
  }>;
  recommendedOrder: Array<{
    step: number;
    opportunityId: string;
    rationale: string;
    expectedImpact: string;
  }>;
  sourceLimitations: string[];
};

export type SelectiveAiAuditSnapshot = {
  version: "selective-ai-audit-v1";
  enabled: boolean;
  status:
    | "DISABLED"
    | "NOT_APPLICABLE"
    | "COMPLETED"
    | "PARTIAL"
    | "UNAVAILABLE";
  generatedAt: string;
  selectorVersion: string;
  pageAnalysisPromptVersion: string;
  pageAnalysisSchemaVersion: string;
  synthesisPromptVersion: string;
  synthesisSchemaVersion: string;
  modelRoutingVersion: string;
  coverage: {
    pagesCheckedTechnically: number;
    eligiblePages: number;
    selectedPages: number;
    deepReviewedPages: number;
    deterministicOnlyPages: number;
    excludedUtilityPages: number;
    duplicateRepresentatives: number;
    crawlFailedPages: number;
    failedAiPages: number;
    truncatedPages: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    limitations: string[];
  };
  pages: PageSelectionSnapshot[];
  selectedPageAnalyses: SelectedPageAnalysisSnapshot[];
  synthesis: AuditAiSynthesis | null;
  synthesisSource: "AI_GENERATED" | "DETERMINISTIC_FALLBACK" | "NOT_RUN";
};

export type ConsolidatedAiFinding = {
  id: string;
  category: ScoreCategory;
  title: string;
  description: string;
  severity: FindingSeverity;
  sourceUrl: string | null;
  evidence: Record<string, unknown>;
};

export type ConsolidatedAiRecommendation = {
  title: string;
  description: string;
  category: ScoreCategory;
  priority: RecommendationPriority;
  estimatedEffort: "Low" | "Medium" | "High";
  expectedImpact: "Low" | "Medium" | "High";
  sourceType: "ai_reviewed_opportunity";
  sourceReferenceId: string;
  sourceUrl: string | null;
  evidence: Record<string, unknown>;
};

export type SelectiveAiBusinessContext = {
  description: string | null;
  targetAudience: string | null;
  mainOffer: string | null;
  industry: string | null;
  businessType: string | null;
  primaryConversionGoal: string | null;
  brandTone: string | null;
};

export function readSelectiveAiAuditSnapshot(
  analysisSnapshot: unknown,
): SelectiveAiAuditSnapshot | null {
  const root = asRecord(analysisSnapshot);
  const value = asRecord(root?.aiAssistedAnalysis);
  const coverage = asRecord(value?.coverage);

  if (
    value?.version !== "selective-ai-audit-v1" ||
    typeof value.enabled !== "boolean" ||
    typeof value.status !== "string" ||
    !coverage ||
    !Array.isArray(value.pages) ||
    !Array.isArray(value.selectedPageAnalyses)
  ) {
    return null;
  }

  const requiredCoverageValues = [
    "pagesCheckedTechnically",
    "eligiblePages",
    "selectedPages",
    "deepReviewedPages",
    "deterministicOnlyPages",
    "excludedUtilityPages",
    "duplicateRepresentatives",
    "crawlFailedPages",
    "failedAiPages",
    "truncatedPages",
    "cacheHits",
    "cacheMisses",
    "cacheHitRate",
  ];
  if (
    requiredCoverageValues.some(
      (key) => typeof coverage[key] !== "number",
    ) ||
    !Array.isArray(coverage.limitations)
  ) {
    return null;
  }

  return value as SelectiveAiAuditSnapshot;
}

export type AiReviewedOpportunityEvidence = {
  confidence: PageAnalysisConfidence;
  sourceUrl: string | null;
  excerpt: string | null;
  businessImpact: string | null;
  suggestedAction: string | null;
};

export function readAiReviewedOpportunityEvidence(
  value: unknown,
): AiReviewedOpportunityEvidence | null {
  const record = asRecord(value);
  if (record?.findingType !== "AI_REVIEWED_OPPORTUNITY") return null;

  const evidenceItems = Array.isArray(record.evidence)
    ? record.evidence.map(asRecord).filter(Boolean)
    : [];
  const primaryEvidence = evidenceItems.at(0);
  const confidence = pageAnalysisConfidenceValues.includes(
    record.confidence as PageAnalysisConfidence,
  )
    ? (record.confidence as PageAnalysisConfidence)
    : "LOW";

  return {
    confidence,
    sourceUrl:
      typeof primaryEvidence?.sourceUrl === "string"
        ? primaryEvidence.sourceUrl
        : null,
    excerpt:
      typeof primaryEvidence?.excerpt === "string"
        ? primaryEvidence.excerpt
        : null,
    businessImpact:
      typeof record.businessImpact === "string"
        ? record.businessImpact
        : null,
    suggestedAction:
      typeof record.suggestedAction === "string"
        ? record.suggestedAction
        : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

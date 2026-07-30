export type PresentationDensity = "spacious" | "standard" | "compact";

export type PresentationTone =
  | "positive"
  | "warning"
  | "critical"
  | "neutral";

export type PresentationScore = {
  label: string;
  score: number | null;
  displayValue: string;
};

export type PresentationStatus = {
  label: string;
  value: string;
  tone: PresentationTone;
  detail?: string;
};

export type PresentationRecommendation = {
  title: string;
  description: string;
  category: string;
  priority: string;
  effort: string;
  impact: string;
  confidence: string;
  evidence: string;
};

export type PresentationComparisonRow = {
  area: string;
  businessValue: string;
  competitorValue: string;
  result: string;
  tone: PresentationTone;
};

export type PresentationOpportunity = {
  title: string;
  category: string;
  evidence: string;
  response: string;
};

export type PresentationDeckData = {
  businessId: string;
  auditId: string;
  businessName: string;
  auditDate: string;
  assessmentMode: "website_enabled" | "social_first";
  overallScore: number;
  healthLabel: string;
  summary: {
    working: string[];
    attention: string[];
    startHere: string[];
    progressNote: string | null;
  };
  businessContext: {
    available: boolean;
    description: string;
    targetAudience: string;
    mainOffer: string;
    conversionGoal: string;
    brandTone: string;
    conflictNote: string | null;
  };
  scores: PresentationScore[];
  website: {
    available: boolean;
    score: number | null;
    pagesScanned: string;
    h1Status: string;
    primaryCtaClarity: string;
    assessmentNote: string;
    detectedActionTypes: string[];
    importantPagesFound: string[];
    keyAction: string;
  };
  seo: {
    available: boolean;
    score: number | null;
    checks: PresentationStatus[];
    warningCount: number;
    recommendedFixes: string[];
  };
  reviews: {
    score: number;
    scoreLabel: string;
    scoreDetail: string;
    googleStatus: string;
    listingName: string | null;
    rating: string;
    reviewCount: string;
    confirmedPlatforms: string[];
    keyOpportunity: string;
    recommendedActions: string[];
    sourceLabel: string;
  };
  social: {
    score: number;
    brandingScore: number | null;
    confirmedCount: number;
    detectedCount: number;
    pendingCount: number;
    contentAnalyzedCount: number;
    confirmedPlatforms: string[];
    recommendedChannels: string[];
    coverageNote: string;
  };
  socialStrategy: {
    available: boolean;
    sourceLabel: string;
    scopeNote: string;
    contentPillars: Array<{ title: string; description: string }>;
    contentIdeas: Array<{
      platform: string;
      hook: string;
      concept: string;
      callToAction: string;
    }>;
    conversionTip: string;
  };
  competitor: {
    available: boolean;
    competitorName: string | null;
    rows: PresentationComparisonRow[];
    highlightedOpportunity: string;
    snapshotLabel: string | null;
    confirmedSocialSummary: string;
    pendingSocialSummary: string | null;
    opportunities: PresentationOpportunity[];
    limitationsNote: string;
  };
  topPriorities: PresentationRecommendation[];
  actionPlan: Array<{ week: string; outcome: string; bullets: string[] }>;
  consultant: {
    lead: string;
    prompts: string[];
  };
};

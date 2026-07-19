import type {
  RecommendationPriority,
  ScoreCategory,
} from "@prisma/client";

export const EVIDENCE_CONTRACT_VERSION = "audit-evidence-v1";
export const CLAIM_VALIDATOR_VERSION = "claim-validator-v1";
export const RECOMMENDATION_EVIDENCE_VERSION =
  "recommendation-evidence-v1";

export type EvidenceConfidence = "HIGH" | "MEDIUM" | "LOW";

export type EvidenceApplicability =
  | "APPLICABLE"
  | "NOT_APPLICABLE"
  | "UNAVAILABLE";

export type AuditEvidenceType =
  | "RAW_LINK_DETECTED"
  | "ACTION_LINK_DETECTED"
  | "PRIMARY_CTA_ASSESSED"
  | "PAGE_TITLE_LENGTH"
  | "H1_COUNT"
  | "META_DESCRIPTION_LENGTH"
  | "CANONICAL_STATUS"
  | "VIEWPORT_STATUS"
  | "ROBOTS_TXT_STATUS"
  | "SITEMAP_STATUS"
  | "IMAGE_ALT_COVERAGE"
  | "PAGE_TYPE_DETECTED"
  | "PROFILE_DETECTED"
  | "PROFILE_CONFIRMED"
  | "SOCIAL_COVERAGE"
  | "GOOGLE_LISTING_CONFIRMED"
  | "REVIEW_METRICS"
  | "COMPETITOR_SNAPSHOT"
  | "POSITIONING_INFERENCE"
  | "BUSINESS_CONTEXT"
  | "SCORE_COMPONENT"
  | "DATA_UNAVAILABLE"
  | "DATA_CONFLICT";

export type EvidenceSource =
  | "website_crawler"
  | "website_analyzer"
  | "seo_analyzer"
  | "social_analyzer"
  | "review_analyzer"
  | "competitor_analyzer"
  | "business_context"
  | "live_profile"
  | "scoring_engine";

export type AuditEvidenceRecord = {
  id: string;
  type: AuditEvidenceType;
  category: ScoreCategory;
  source: EvidenceSource;
  sourceUrl: string | null;
  sourcePage: string | null;
  sourcePath: string;
  observedValue: unknown;
  interpretedValue: unknown;
  confidence: EvidenceConfidence;
  applicability: EvidenceApplicability;
  observedAt: string;
  analyzerVersion: string;
  explanation: string;
  issueKeys: string[];
};

export type PrimaryCtaClarity =
  | "CLEAR"
  | "NEEDS_IMPROVEMENT"
  | "UNCERTAIN"
  | "NOT_ASSESSED"
  | "NOT_APPLICABLE";

export type PrimaryCtaAssessmentMethod =
  | "STATIC_HTML_STRUCTURE"
  | "LEGACY_ACTION_LINKS_ONLY"
  | "NOT_ASSESSED";

export type PrimaryCtaAssessment = {
  clarity: PrimaryCtaClarity;
  primaryCtaText: string | null;
  primaryCtaType: string | null;
  evidence: string[];
  confidence: EvidenceConfidence;
  assessmentMethod: PrimaryCtaAssessmentMethod;
  assessed: boolean;
};

export type DetectedActionLink = {
  label: string;
  href: string | null;
  actionType: string;
  elementType: string;
  domLocation: "hero" | "main" | "header" | "navigation" | "footer" | "unknown";
  buttonLike: boolean;
  nearPrimaryHeading: boolean;
  navigationLike: boolean;
  prominenceScore: number;
};

export type ProfileCountSummary = {
  confirmedPublicProfiles: number;
  confirmedWebsiteProfiles: number;
  confirmedSocialProfiles: number;
  confirmedReviewProfiles: number;
  detectedSocialProfiles: number;
  pendingSocialProfiles: number;
  confirmedPublicPlatforms: string[];
  confirmedSocialPlatforms: string[];
  confirmedReviewPlatforms: string[];
  pendingSocialPlatforms: string[];
};

export type CompetitorProfileCountSummary = ProfileCountSummary & {
  competitorId: string;
  competitorName: string;
};

export type AuditDataConflict = {
  id: string;
  type: "DATA_CONFLICT";
  field: string;
  sources: Array<{
    source: string;
    sourceUrl: string | null;
    value: string;
    evidenceId: string | null;
  }>;
  preferredSource: string;
  preferredValue: string;
  confidence: EvidenceConfidence;
  action: string;
  explanation: string;
};

export type ScoreComponent = {
  key: string;
  label: string;
  value: string | number | boolean | null;
  weight: number | null;
  contribution: number;
  evidenceIds: string[];
  confidence: EvidenceConfidence;
  explanation: string;
};

export type ScoreBreakdown = {
  category: ScoreCategory;
  score: number | null;
  applicable: boolean;
  components: ScoreComponent[];
  engineVersion: string;
  calculatedAt: string;
  calculationNote: string;
};

export type AuditClaimKind =
  | "DETECTED_ACTION_LINK_PAGE_COUNT"
  | "PRIMARY_CTA_CLARITY"
  | "CLEAR_PRIMARY_CTA_PAGE_COUNT"
  | "H1_ISSUE"
  | "PROFILE_COUNT"
  | "REVIEW_COMPARISON"
  | "SCORE_CHANGE"
  | "PAGE_SAMPLE";

export type AuditClaim = {
  id: string;
  kind: AuditClaimKind;
  category: ScoreCategory;
  text: string;
  value: unknown;
  requiredEvidenceIds: string[];
  confidence: EvidenceConfidence;
};

export type ValidatedAuditClaim = AuditClaim & {
  valid: boolean;
  reasons: string[];
  correctedClaim: string | null;
  requiredEvidenceMissing: string[];
};

export type EvidenceValidationWarningCode =
  | "CTA_RECOMMENDATION_CONTRADICTS_CLEAR_ASSESSMENT"
  | "CLEAR_CTA_CLAIM_LACKS_PAGE_EVIDENCE"
  | "H1_RECOMMENDATION_LACKS_H1_EVIDENCE"
  | "RECOMMENDATION_EVIDENCE_CATEGORY_MISMATCH"
  | "DUPLICATE_CANONICAL_ISSUE_KEY"
  | "SOCIAL_COUNT_EXCEEDS_PUBLIC_COUNT"
  | "UNAVAILABLE_REVIEWS_COMPARED"
  | "SCORE_CHANGE_LACKS_COMPONENT_CHANGE"
  | "ZERO_DELTA_DESCRIBED_AS_CHANGE"
  | "PAGE_SAMPLE_MISLABELED"
  | "STALE_FINDING_CONTRADICTS_LIVE_STATE"
  | "DATA_CONFLICT_REQUIRES_REVIEW";

export type EvidenceValidationWarning = {
  code: EvidenceValidationWarningCode;
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
  relatedIds: string[];
  safeFallback: string | null;
};

export type CanonicalRecommendationEvidence = {
  issueKey: string;
  sourceFindingId: string | null;
  sourceEvidenceIds: string[];
  sourceCategory: ScoreCategory;
  recommendationType: string;
  fullEvidence: string;
  reportEvidence: string;
  evidenceConfidence: EvidenceConfidence;
  generatedAt: string;
  generatorVersion: string;
};

export type CanonicalRecommendationSnapshot =
  CanonicalRecommendationEvidence & {
    title: string;
    description: string;
    category: ScoreCategory;
    priority: RecommendationPriority;
    estimatedEffort: string;
    expectedImpact: string;
  };

export type AuditEvidenceIntegritySnapshot = {
  contractVersion: string;
  generatedAt: string;
  evidence: AuditEvidenceRecord[];
  validatedClaims: ValidatedAuditClaim[];
  scoreBreakdowns: ScoreBreakdown[];
  canonicalRecommendations: CanonicalRecommendationSnapshot[];
  dataConflicts: AuditDataConflict[];
  profileCounts: {
    business: ProfileCountSummary;
    competitors: CompetitorProfileCountSummary[];
    totals: ProfileCountSummary;
  };
  validationWarnings: EvidenceValidationWarning[];
  sourceVersions: Record<string, string>;
};

export function stableEvidenceId(...parts: Array<string | number | null | undefined>) {
  const normalized = parts
    .filter((part): part is string | number => part !== null && part !== undefined)
    .map((part) => String(part).trim().toLowerCase())
    .join(":")
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);

  return normalized || "evidence-unavailable";
}

export function readEvidenceIntegrity(
  snapshot: unknown,
): AuditEvidenceIntegritySnapshot | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.evidenceIntegrity)) {
    return null;
  }

  const value = snapshot.evidenceIntegrity;
  if (
    value.contractVersion !== EVIDENCE_CONTRACT_VERSION ||
    !Array.isArray(value.evidence) ||
    !Array.isArray(value.validatedClaims) ||
    !Array.isArray(value.scoreBreakdowns) ||
    !Array.isArray(value.canonicalRecommendations) ||
    !Array.isArray(value.dataConflicts) ||
    !Array.isArray(value.validationWarnings) ||
    !isRecord(value.profileCounts)
  ) {
    return null;
  }

  return value as AuditEvidenceIntegritySnapshot;
}

export function evidenceForIssue(
  evidence: AuditEvidenceRecord[],
  issueKey: string,
) {
  return evidence.filter((item) => item.issueKeys.includes(issueKey));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

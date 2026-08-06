import type {
  FindingSeverity,
  ScoreCategory,
} from "@prisma/client";

export const AUDIT_VALIDATION_PIPELINE_VERSION =
  "audit-validation-pipeline-v2";
export const AUDIT_FINDING_VERSION = "audit-finding-v2";

export type CandidateClassification =
  | "TECHNICAL_DEFECT"
  | "MEANINGFUL_OPPORTUNITY"
  | "OPTIONAL_REFINEMENT"
  | "VERIFIED_STRENGTH"
  | "COVERAGE_NOTE"
  | "LIMITATION";

export type CandidateMateriality = "HIGH" | "MEDIUM" | "LOW";

export type CandidateVerificationType =
  | "DETERMINISTIC"
  | "AI_STRUCTURED_REVIEW"
  | "OWNER_REVIEW";

export type CandidateFinding = {
  candidateId: string;
  stableFindingKey: string;
  ruleId: string;
  ruleVersion: string;
  rootCauseKey: string;
  category: ScoreCategory;
  severity: FindingSeverity;
  classification: CandidateClassification;
  claim: string;
  description: string;
  affectedUrls: string[];
  supportingEvidenceIds: string[];
  expectedContradictionTypes: string[];
  materiality: CandidateMateriality;
  initialConfidence: number;
  verificationType: CandidateVerificationType;
  verificationRule: Record<string, unknown>;
  dataCompletenessRequirements: Record<string, unknown>;
  sourceFindingId: string | null;
  sourceEvidence: unknown;
};

export type CandidateDecisionState =
  | "CONFIRMED"
  | "REFRAMED"
  | "SUPPRESSED_CONTRADICTION"
  | "SUPPRESSED_INSUFFICIENT_DATA"
  | "SUPPRESSED_IMMATERIAL"
  | "NEEDS_AI_REVIEW"
  | "LIMITATION_ONLY";

export type CandidateDecision = {
  candidateId: string;
  stableFindingKey: string;
  ruleId: string;
  rootCauseKey: string;
  claim: string;
  affectedUrls: string[];
  state: CandidateDecisionState;
  reasonCode: string;
  reason: string;
  supportingEvidenceIds: string[];
  contradictoryEvidenceIds: string[];
  finalClassification: CandidateClassification;
  finalClaim: string | null;
  confidence: number;
  materiality: CandidateMateriality;
  scoreEligible: boolean;
};

export type FindingAiValidationResult = {
  decision: "CONFIRM" | "REFRAME" | "SUPPRESS" | "LIMITATION";
  finalClassification:
    | "VERIFIED_TECHNICAL_ISSUE"
    | "AI_REVIEWED_OPPORTUNITY"
    | "OPTIONAL_REFINEMENT"
    | "COVERAGE_NOTE"
    | "LIMITATION";
  revisedClaim: string | null;
  explanation: string;
  supportingEvidenceIds: string[];
  contradictoryEvidenceIds: string[];
  confidence: number;
  materiality: CandidateMateriality;
  reasonCode: string;
};

export type OwnerFixability =
  | "EASY_TO_DO_YOURSELF"
  | "MAY_REQUIRE_WEBSITE_ACCESS"
  | "BETTER_HANDLED_BY_SPECIALIST"
  | "REQUIRES_TECHNICAL_REVIEW";

export type SpecialistCategory =
  | "WEBSITE_DEVELOPER"
  | "WORDPRESS_DEVELOPER"
  | "SHOPIFY_DEVELOPER"
  | "WIX_SPECIALIST"
  | "SQUARESPACE_SPECIALIST"
  | "TECHNICAL_SEO_SPECIALIST"
  | "SEO_CONTENT_SPECIALIST"
  | "COPYWRITER"
  | "UX_CONVERSION_SPECIALIST"
  | "ACCESSIBILITY_SPECIALIST"
  | "ECOMMERCE_SPECIALIST";

export type PlainLanguageFinding = {
  whatThisMeans: string;
  whyItMatters: string;
  whatToDo: string;
  ownerFixability: OwnerFixability;
  ownerFixabilityLabel: string;
  whoCanHelp: SpecialistCategory;
  whoCanHelpLabel: string;
  howOnreadWillCheck: string;
};

export type SpecialistReadiness = {
  suggestedSpecialist: SpecialistCategory;
  supportedPlatform: string | null;
  requiredAccessLevel:
    | "CONTENT_EDITOR"
    | "SEO_SETTINGS"
    | "THEME_OR_TEMPLATE"
    | "SERVER_OR_DNS"
    | "UNKNOWN";
  estimatedComplexity: "LOW" | "MEDIUM" | "HIGH";
  verificationMethod: string;
  objectivelyVerifiable: boolean;
  ownerApprovalRequired: boolean;
  requiredCompletionCriteria: string[];
  explicitExclusions: string[];
};

export type FrozenVerificationContract = {
  contractVersion: "targeted-verification-v1";
  originalFindingId: string;
  stableFindingKey: string;
  rootCauseKey: string;
  originalEvidenceIds: string[];
  originalUrls: string[];
  ruleId: string;
  ruleVersion: string;
  promptVersion: string | null;
  modelVersion: string | null;
  requiredOutcome: string;
  tolerance: Record<string, unknown>;
  explicitExclusions: string[];
  verificationMethod: string;
  frozenAt: string;
};

export type FindingValidationMetadata = {
  pipelineVersion: typeof AUDIT_VALIDATION_PIPELINE_VERSION;
  findingVersion: typeof AUDIT_FINDING_VERSION;
  candidateId: string;
  stableFindingKey: string;
  ruleId: string;
  ruleVersion: string;
  rootCauseKey: string;
  state: CandidateDecisionState;
  reasonCode: string;
  reason: string;
  classification: CandidateClassification;
  materiality: CandidateMateriality;
  confidence: number;
  scoreEligible: boolean;
  supportingEvidenceIds: string[];
  contradictoryEvidenceIds: string[];
  affectedUrls: string[];
  verificationRule: Record<string, unknown>;
  dataCompletenessRequirements: Record<string, unknown>;
  plainLanguage: PlainLanguageFinding;
  specialistReadiness: SpecialistReadiness;
  targetedVerification: FrozenVerificationContract;
};

export type AuditValidationSnapshot = {
  pipelineVersion: typeof AUDIT_VALIDATION_PIPELINE_VERSION;
  generatedAt: string;
  mode: "SHADOW" | "APPLIED";
  currentFindingCount: number;
  validatedFindingCount: number;
  candidateCount: number;
  confirmedCount: number;
  reframedCount: number;
  suppressedCount: number;
  limitationCount: number;
  aiReviewCount: number;
  contradictionCount: number;
  candidates: Array<{
    candidateId: string;
    stableFindingKey: string;
    ruleId: string;
    ruleVersion: string;
    rootCauseKey: string;
    category: ScoreCategory;
    classification: CandidateClassification;
    claim: string;
    affectedUrls: string[];
    supportingEvidenceIds: string[];
    expectedContradictionTypes: string[];
    materiality: CandidateMateriality;
    initialConfidence: number;
    verificationType: CandidateVerificationType;
    verificationRule: Record<string, unknown>;
    dataCompletenessRequirements: Record<string, unknown>;
  }>;
  decisions: CandidateDecision[];
  disagreementStableKeys: string[];
  scoreShadow: {
    overall: number;
    website: number;
    seo: number;
  } | null;
};

export type ValidationFindingInput = {
  id?: string | null;
  category: ScoreCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  sourceUrl?: string | null;
  sourceType?: string | null;
  evidence?: unknown;
};

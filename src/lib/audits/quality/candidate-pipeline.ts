import { createHash } from "node:crypto";

import {
  FindingSeverity,
  ScoreCategory,
} from "@prisma/client";

import type {
  AuditEvidenceIntegritySnapshot,
  AuditEvidenceRecord,
} from "@/lib/audits/evidence-contracts";
import type { NormalizedAuditFacts } from "@/lib/audits/normalized-audit-facts";
import {
  buildPlainLanguageFinding,
  buildSpecialistReadiness,
} from "@/lib/audits/quality/plain-language";
import { freezeVerificationContract } from "@/lib/audits/quality/targeted-verification";
import {
  AUDIT_FINDING_VERSION,
  AUDIT_VALIDATION_PIPELINE_VERSION,
  type AuditValidationSnapshot,
  type CandidateClassification,
  type CandidateDecision,
  type CandidateFinding,
  type CandidateMateriality,
  type FindingAiValidationResult,
  type FindingValidationMetadata,
  type ValidationFindingInput,
} from "@/lib/audits/quality/types";

export const AUDIT_FINDING_RULESET_VERSION = "audit-finding-rules-v2";

type RecommendationInput = {
  title: string;
  description: string;
  category: ScoreCategory;
  sourceUrl?: string | null;
  issueKey?: string | null;
  rootCauseKey?: string | null;
  sourceType?: string | null;
  sourceReferenceId?: string | null;
  evidence?: unknown;
  [key: string]: unknown;
};

export type FindingAiValidator = (input: {
  candidate: CandidateFinding;
  allowedEvidenceIds: Set<string>;
  relevantEvidence: AuditEvidenceRecord[];
}) => Promise<FindingAiValidationResult | null>;

export async function runAuditValidationPipeline<
  F extends ValidationFindingInput,
  R extends RecommendationInput,
>({
  findings,
  recommendations,
  facts,
  evidenceIntegrity,
  apply,
  applyPlainLanguage,
  aiValidator,
  generatedAt = new Date().toISOString(),
}: {
  findings: F[];
  recommendations: R[];
  facts: NormalizedAuditFacts;
  evidenceIntegrity: AuditEvidenceIntegritySnapshot;
  apply: boolean;
  applyPlainLanguage: boolean;
  aiValidator?: FindingAiValidator | null;
  generatedAt?: string;
}) {
  const candidates = findings.map((finding) =>
    candidateFromFinding({ finding, facts, evidenceIntegrity }),
  );
  const allowedEvidenceIds = collectAllowedEvidenceIds(
    facts,
    evidenceIntegrity,
  );
  const decisions: CandidateDecision[] = [];
  const published: F[] = [];
  const publishedRootCauses = new Set<string>();
  const publishedRootRecords = new Map<
    string,
    { decisionIndex: number; findingIndex: number }
  >();

  for (const candidate of candidates) {
    let decision = deterministicDecision({
      candidate,
      facts,
      allowedEvidenceIds,
    });

    if (decision.state === "NEEDS_AI_REVIEW") {
      const relevantEvidence = evidenceIntegrity.evidence.filter(
        (evidence) =>
          candidate.supportingEvidenceIds.includes(evidence.id) ||
          evidence.issueKeys.includes(candidate.ruleId) ||
          evidence.issueKeys.includes(issueKeyFromEvidence(candidate.sourceEvidence)),
      );
      const reviewed = aiValidator
        ? await aiValidator({ candidate, allowedEvidenceIds, relevantEvidence })
        : null;
      decision = reviewed
        ? decisionFromAi(candidate, reviewed, allowedEvidenceIds)
        : {
            ...decision,
            state: "LIMITATION_ONLY",
            reasonCode: aiValidator
              ? "AI_VALIDATION_UNAVAILABLE"
              : "AI_VALIDATION_NOT_ENABLED",
            reason:
              "The evidence requires semantic review, so this candidate is not published as a confirmed problem.",
            finalClassification: "LIMITATION",
            finalClaim:
              "Onread could not verify this subjective page-quality concern with enough confidence.",
            confidence: Math.min(decision.confidence, 0.49),
            materiality: "LOW",
            scoreEligible: false,
          };
    }

    if (
      isPublishableDecision(decision) &&
      publishedRootCauses.has(decision.rootCauseKey)
    ) {
      const existing = publishedRootRecords.get(decision.rootCauseKey);
      if (existing) {
        mergePublishedRootEvidence({
          candidate,
          duplicateDecision: decision,
          existing,
          decisions,
          published,
        });
      }
      decision = {
        ...decision,
        state: "SUPPRESSED_IMMATERIAL",
        reasonCode: "DUPLICATE_ROOT_CAUSE_CONSOLIDATED",
        reason:
          "A previously validated finding already represents this root cause.",
        finalClaim: null,
        scoreEligible: false,
      };
    }
    decisions.push(decision);
    if (!isPublishableDecision(decision)) continue;
    publishedRootCauses.add(decision.rootCauseKey);

    const source = findings[candidates.indexOf(candidate)]!;
    const plainLanguage = buildPlainLanguageFinding(candidate);
    const specialistReadiness = buildSpecialistReadiness(
      candidate,
      plainLanguage,
    );
    const targetedVerification = freezeVerificationContract({
      candidate,
      readiness: specialistReadiness,
      generatedAt,
    });
    const metadata: FindingValidationMetadata = {
      pipelineVersion: AUDIT_VALIDATION_PIPELINE_VERSION,
      findingVersion: AUDIT_FINDING_VERSION,
      candidateId: candidate.candidateId,
      stableFindingKey: candidate.stableFindingKey,
      ruleId: candidate.ruleId,
      ruleVersion: candidate.ruleVersion,
      rootCauseKey: candidate.rootCauseKey,
      state: decision.state,
      reasonCode: decision.reasonCode,
      reason: decision.reason,
      classification: decision.finalClassification,
      materiality: decision.materiality,
      confidence: decision.confidence,
      scoreEligible: decision.scoreEligible,
      supportingEvidenceIds: decision.supportingEvidenceIds,
      contradictoryEvidenceIds: decision.contradictoryEvidenceIds,
      affectedUrls: candidate.affectedUrls,
      verificationRule: candidate.verificationRule,
      dataCompletenessRequirements: candidate.dataCompletenessRequirements,
      plainLanguage,
      specialistReadiness,
      targetedVerification,
    };
    const evidence = mergeEvidence(source.evidence, {
      issueKey: candidate.ruleId,
      rootCauseKey: candidate.rootCauseKey,
      findingType: findingTypeForClassification(decision.finalClassification),
      validationV2: metadata,
    });

    published.push({
      ...source,
      title:
        applyPlainLanguage && decision.finalClaim
          ? plainTitle(decision.finalClaim)
          : decision.finalClaim ?? source.title,
      description:
        applyPlainLanguage && decision.state !== "LIMITATION_ONLY"
          ? plainLanguage.whatThisMeans
          : decision.state === "LIMITATION_ONLY" && decision.finalClaim
            ? decision.finalClaim
            : source.description,
      severity:
        decision.state === "LIMITATION_ONLY"
          ? FindingSeverity.LOW
          : source.severity,
      evidence,
    } as F);
    publishedRootRecords.set(decision.rootCauseKey, {
      decisionIndex: decisions.length - 1,
      findingIndex: published.length - 1,
    });
  }

  const suppressedRoots = new Set(
    decisions
      .filter((decision) => !isPublishableDecision(decision))
      .map((decision) => decision.rootCauseKey),
  );
  const retainedRoots = new Set(
    decisions
      .filter(isPublishableDecision)
      .map((decision) => decision.rootCauseKey),
  );
  const validatedRecommendations = recommendations.flatMap((recommendation) => {
    const ruleId = recommendationIssueKey(recommendation);
    const rootCauseKey =
      recommendation.rootCauseKey ?? rootCauseFromRule(ruleId);
    if (suppressedRoots.has(rootCauseKey) && !retainedRoots.has(rootCauseKey)) {
      return [];
    }
    const matchingDecision = decisions.find(
      (decision) => decision.rootCauseKey === rootCauseKey,
    );
    if (!matchingDecision) return [recommendation];
    return [
      {
        ...recommendation,
        issueKey: ruleId,
        rootCauseKey,
        evidence: mergeEvidence(recommendation.evidence, {
          issueKey: ruleId,
          rootCauseKey,
          validationV2: {
            stableFindingKey: matchingDecision.stableFindingKey,
            candidateId: matchingDecision.candidateId,
            state: matchingDecision.state,
            scoreEligible: matchingDecision.scoreEligible,
            supportingEvidenceIds: matchingDecision.supportingEvidenceIds,
          },
        }),
      } as R,
    ];
  });

  const snapshot: AuditValidationSnapshot = {
    pipelineVersion: AUDIT_VALIDATION_PIPELINE_VERSION,
    generatedAt,
    mode: apply ? "APPLIED" : "SHADOW",
    currentFindingCount: findings.length,
    validatedFindingCount: published.length,
    candidateCount: candidates.length,
    confirmedCount: decisions.filter((item) => item.state === "CONFIRMED").length,
    reframedCount: decisions.filter((item) => item.state === "REFRAMED").length,
    suppressedCount: decisions.filter((item) =>
      item.state.startsWith("SUPPRESSED_"),
    ).length,
    limitationCount: decisions.filter((item) => item.state === "LIMITATION_ONLY")
      .length,
    aiReviewCount: decisions.filter(
      (item) => item.reasonCode.startsWith("AI_") || item.state === "NEEDS_AI_REVIEW",
    ).length,
    contradictionCount: decisions.filter(
      (item) => item.state === "SUPPRESSED_CONTRADICTION",
    ).length,
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      stableFindingKey: candidate.stableFindingKey,
      ruleId: candidate.ruleId,
      ruleVersion: candidate.ruleVersion,
      rootCauseKey: candidate.rootCauseKey,
      category: candidate.category,
      classification: candidate.classification,
      claim: candidate.claim,
      affectedUrls: candidate.affectedUrls,
      supportingEvidenceIds: candidate.supportingEvidenceIds,
      expectedContradictionTypes: candidate.expectedContradictionTypes,
      materiality: candidate.materiality,
      initialConfidence: candidate.initialConfidence,
      verificationType: candidate.verificationType,
      verificationRule: candidate.verificationRule,
      dataCompletenessRequirements: candidate.dataCompletenessRequirements,
    })),
    decisions,
    disagreementStableKeys: decisions
      .filter((item) => !isPublishableDecision(item) || item.state === "REFRAMED")
      .map((item) => item.stableFindingKey),
    scoreShadow: null,
  };

  return {
    findings: apply ? published : findings,
    recommendations: apply ? validatedRecommendations : recommendations,
    shadowFindings: published,
    shadowRecommendations: validatedRecommendations,
    candidates,
    decisions,
    snapshot,
  };
}

function mergePublishedRootEvidence<
  F extends ValidationFindingInput,
>({
  candidate,
  duplicateDecision,
  existing,
  decisions,
  published,
}: {
  candidate: CandidateFinding;
  duplicateDecision: CandidateDecision;
  existing: { decisionIndex: number; findingIndex: number };
  decisions: CandidateDecision[];
  published: F[];
}) {
  const originalDecision = decisions[existing.decisionIndex];
  const originalFinding = published[existing.findingIndex];
  if (!originalDecision || !originalFinding || !isRecord(originalFinding.evidence)) {
    return;
  }

  const affectedUrls = unique([
    ...originalDecision.affectedUrls,
    ...duplicateDecision.affectedUrls,
    ...candidate.affectedUrls,
  ]);
  const supportingEvidenceIds = unique([
    ...originalDecision.supportingEvidenceIds,
    ...duplicateDecision.supportingEvidenceIds,
    ...candidate.supportingEvidenceIds,
  ]);
  decisions[existing.decisionIndex] = {
    ...originalDecision,
    affectedUrls,
    supportingEvidenceIds,
  };

  const currentValidation = originalFinding.evidence.validationV2;
  if (!isRecord(currentValidation)) return;
  const targetedVerification = isRecord(currentValidation.targetedVerification)
    ? {
        ...currentValidation.targetedVerification,
        originalUrls: affectedUrls,
        originalEvidenceIds: supportingEvidenceIds,
      }
    : currentValidation.targetedVerification;
  published[existing.findingIndex] = {
    ...originalFinding,
    evidence: {
      ...originalFinding.evidence,
      validationV2: {
        ...currentValidation,
        affectedUrls,
        supportingEvidenceIds,
        consolidatedCandidateIds: unique([
          ...stringsFromEvidence(
            currentValidation,
            /^consolidatedCandidateIds$/i,
          ),
          String(currentValidation.candidateId ?? ""),
          candidate.candidateId,
        ]),
        targetedVerification,
      },
    },
  } as F;
}

export function readFindingValidationMetadata(
  evidence: unknown,
): FindingValidationMetadata | null {
  if (!isRecord(evidence) || !isRecord(evidence.validationV2)) return null;
  const value = evidence.validationV2;
  if (
    value.pipelineVersion !== AUDIT_VALIDATION_PIPELINE_VERSION ||
    typeof value.stableFindingKey !== "string" ||
    typeof value.ruleId !== "string" ||
    !isRecord(value.plainLanguage) ||
    !isRecord(value.specialistReadiness) ||
    !isRecord(value.targetedVerification)
  ) {
    return null;
  }
  return value as unknown as FindingValidationMetadata;
}

function candidateFromFinding({
  finding,
  facts,
  evidenceIntegrity,
}: {
  finding: ValidationFindingInput;
  facts: NormalizedAuditFacts;
  evidenceIntegrity: AuditEvidenceIntegritySnapshot;
}): CandidateFinding {
  const ruleId = findingRuleId(finding);
  const rootCauseKey = rootCauseFromRule(ruleId);
  const affectedUrls = affectedFindingUrls(finding);
  const classification = initialClassification(finding, ruleId);
  const materiality = initialMateriality(finding, classification);
  const supportingEvidenceIds = supportingEvidenceIdsForFinding({
    finding,
    ruleId,
    facts,
    evidenceIntegrity,
  });
  const logicalPage = affectedUrls.map(normalizeComparableUrl).sort().join("|") ||
    "sitewide";
  const stableFindingKey = stableHash(
    `${AUDIT_FINDING_RULESET_VERSION}|${ruleId}|${rootCauseKey}|${logicalPage}|${classification}`,
  );
  const subjective = isSubjectiveRule(ruleId, finding);

  return {
    candidateId: `candidate-${stableFindingKey}`,
    stableFindingKey: `finding-${stableFindingKey}`,
    ruleId,
    ruleVersion: AUDIT_FINDING_RULESET_VERSION,
    rootCauseKey,
    category: finding.category,
    severity: finding.severity,
    classification,
    claim: finding.title,
    description: finding.description,
    affectedUrls,
    supportingEvidenceIds,
    expectedContradictionTypes: contradictionTypes(ruleId),
    materiality,
    initialConfidence: initialConfidence(finding, facts, affectedUrls),
    verificationType: subjective
      ? "AI_STRUCTURED_REVIEW"
      : classification === "OPTIONAL_REFINEMENT"
        ? "OWNER_REVIEW"
        : "DETERMINISTIC",
    verificationRule: verificationRule(ruleId),
    dataCompletenessRequirements: {
      affectedPagesMustBeFetched: Boolean(affectedUrls.length),
      minimumExtractionCompleteness: "PARTIAL",
      supportingEvidenceRequired: true,
    },
    sourceFindingId: finding.id ?? null,
    sourceEvidence: finding.evidence,
  };
}

function deterministicDecision({
  candidate,
  facts,
  allowedEvidenceIds,
}: {
  candidate: CandidateFinding;
  facts: NormalizedAuditFacts;
  allowedEvidenceIds: Set<string>;
}): CandidateDecision {
  const validSupportingEvidence = candidate.supportingEvidenceIds.filter((id) =>
    allowedEvidenceIds.has(id),
  );
  const base = {
    candidateId: candidate.candidateId,
    stableFindingKey: candidate.stableFindingKey,
    ruleId: candidate.ruleId,
    rootCauseKey: candidate.rootCauseKey,
    claim: candidate.claim,
    affectedUrls: candidate.affectedUrls,
    supportingEvidenceIds: validSupportingEvidence,
    contradictoryEvidenceIds: [] as string[],
    finalClassification: candidate.classification,
    finalClaim: candidate.claim as string | null,
    confidence: candidate.initialConfidence,
    materiality: candidate.materiality,
    scoreEligible: scoreEligible(candidate.classification, candidate.initialConfidence),
  };

  const incompletePages = incompleteAffectedPages(candidate, facts);
  if (incompletePages.length > 0 && requiresCompletePage(candidate.ruleId)) {
    return {
      ...base,
      state: "SUPPRESSED_INSUFFICIENT_DATA",
      reasonCode: "AFFECTED_PAGE_EXTRACTION_INCOMPLETE",
      reason: `The required page evidence was incomplete for ${incompletePages.length} affected page(s).`,
      finalClaim: null,
      confidence: 0.2,
      scoreEligible: false,
    };
  }

  const contradiction = deterministicContradiction(candidate, facts);
  if (contradiction) {
    return {
      ...base,
      state: "SUPPRESSED_CONTRADICTION",
      reasonCode: contradiction.reasonCode,
      reason: contradiction.reason,
      contradictoryEvidenceIds: unique(
        contradiction.evidenceIds.filter((id) => allowedEvidenceIds.has(id)),
      ),
      finalClaim: null,
      scoreEligible: false,
    };
  }

  if (
    validSupportingEvidence.length === 0 &&
    !["COVERAGE_NOTE", "LIMITATION"].includes(candidate.classification)
  ) {
    return {
      ...base,
      state: "SUPPRESSED_INSUFFICIENT_DATA",
      reasonCode: "NO_VALID_SUPPORTING_EVIDENCE",
      reason: "No saved evidence ID could support this candidate.",
      finalClaim: null,
      confidence: 0.1,
      scoreEligible: false,
    };
  }

  if (
    candidate.classification === "OPTIONAL_REFINEMENT" &&
    candidate.materiality === "LOW" &&
    isHypotheticalPreference(candidate)
  ) {
    return {
      ...base,
      state: "SUPPRESSED_IMMATERIAL",
      reasonCode: "HYPOTHETICAL_PREFERENCE_ONLY",
      reason:
        "The candidate describes a possible preference without evidence of a material problem.",
      finalClaim: null,
      scoreEligible: false,
    };
  }

  if (candidate.verificationType === "AI_STRUCTURED_REVIEW") {
    return {
      ...base,
      state: "NEEDS_AI_REVIEW",
      reasonCode: "SEMANTIC_OR_SUBJECTIVE_REVIEW_REQUIRED",
      reason:
        "Objective facts exist, but semantic quality or business context must be reviewed before publication.",
      scoreEligible: false,
    };
  }

  if (candidate.classification === "OPTIONAL_REFINEMENT") {
    return {
      ...base,
      state: "REFRAMED",
      reasonCode: "PREFERENCE_REFRAMED_AS_OPTIONAL",
      reason: "The evidence supports guidance, not a technical defect.",
      finalClassification: "OPTIONAL_REFINEMENT",
      finalClaim: optionalClaim(candidate),
      scoreEligible: false,
    };
  }

  return {
    ...base,
    state: "CONFIRMED",
    reasonCode: "OBJECTIVE_EVIDENCE_CONFIRMED",
    reason:
      "Required evidence is available, no contradiction was found, and the claim meets the materiality rule.",
  };
}

function deterministicContradiction(
  candidate: CandidateFinding,
  facts: NormalizedAuditFacts,
) {
  const rule = candidate.ruleId;
  if (rule.includes("contact-path:missing") && facts.homepage?.contact?.hasAnyContactPath) {
    return {
      reasonCode: "CONTACT_OR_CONVERSION_PATH_PRESENT",
      reason:
        "The homepage contains a usable customer path or equivalent contact evidence.",
      evidenceIds: [
        ...(facts.homepage.contact.allContactEvidenceIds ?? []),
        ...facts.homepage.contact.usableContactPathEvidenceIds,
        ...facts.homepage.contact.contactPathEvidenceIds,
      ],
    };
  }
  if (rule.includes("meta-description:missing")) {
    const unsupported = candidate.affectedUrls.filter(
      (url) => !isMissingMetaUrl(url, facts),
    );
    if (unsupported.length > 0 ||
      (candidate.affectedUrls.length === 0 && facts.homepage?.metaDescription.status !== "MISSING")) {
      return {
        reasonCode: "META_DESCRIPTION_PRESENT",
        reason: "A measured meta description exists on at least one claimed page.",
        evidenceIds: facts.homepage?.metaDescription.provenance?.evidenceId
          ? [facts.homepage.metaDescription.provenance.evidenceId]
          : [],
      };
    }
  }
  if (rule.includes("h1:missing")) {
    const unsupported = candidate.affectedUrls.filter(
      (url) => !isMissingH1Url(url, facts),
    );
    if (unsupported.length > 0 ||
      (candidate.affectedUrls.length === 0 && facts.homepage?.h1.status !== "MISSING")) {
      return {
        reasonCode: "VISIBLE_H1_PRESENT",
        reason: "A measured top-level heading exists on at least one claimed page.",
        evidenceIds: facts.homepage?.h1.provenance?.evidenceId
          ? [facts.homepage.h1.provenance.evidenceId]
          : [],
      };
    }
  }
  if (rule.includes("primary-cta:unclear") &&
      facts.homepage?.actions.primaryCtaClarity === "CLEAR") {
    return {
      reasonCode: "PRIMARY_CTA_STRUCTURALLY_CLEAR",
      reason: "The saved structural assessment identifies one clear primary action.",
      evidenceIds: facts.homepage.actions.interactionEvidenceIds ?? [],
    };
  }
  return null;
}

function decisionFromAi(
  candidate: CandidateFinding,
  reviewed: FindingAiValidationResult,
  allowedEvidenceIds: Set<string>,
): CandidateDecision {
  const referenced = [
    ...reviewed.supportingEvidenceIds,
    ...reviewed.contradictoryEvidenceIds,
  ];
  if (referenced.some((id) => !allowedEvidenceIds.has(id))) {
    return {
      candidateId: candidate.candidateId,
      stableFindingKey: candidate.stableFindingKey,
      ruleId: candidate.ruleId,
      rootCauseKey: candidate.rootCauseKey,
      claim: candidate.claim,
      affectedUrls: candidate.affectedUrls,
      state: "LIMITATION_ONLY",
      reasonCode: "AI_REFERENCED_UNKNOWN_EVIDENCE",
      reason:
        "The structured review cited evidence that is not part of the saved audit contract.",
      supportingEvidenceIds: candidate.supportingEvidenceIds,
      contradictoryEvidenceIds: [],
      finalClassification: "LIMITATION",
      finalClaim:
        "Onread could not verify this subjective concern with the saved evidence.",
      confidence: 0.2,
      materiality: "LOW",
      scoreEligible: false,
    };
  }
  const classification = classificationFromAi(reviewed.finalClassification);
  const state =
    reviewed.decision === "CONFIRM"
      ? "CONFIRMED"
      : reviewed.decision === "REFRAME"
        ? "REFRAMED"
        : reviewed.decision === "SUPPRESS"
          ? "SUPPRESSED_CONTRADICTION"
          : "LIMITATION_ONLY";
  return {
    candidateId: candidate.candidateId,
    stableFindingKey: candidate.stableFindingKey,
    ruleId: candidate.ruleId,
    rootCauseKey: candidate.rootCauseKey,
    claim: candidate.claim,
    affectedUrls: candidate.affectedUrls,
    state,
    reasonCode: `AI_${reviewed.reasonCode}`,
    reason: reviewed.explanation,
    supportingEvidenceIds: reviewed.supportingEvidenceIds,
    contradictoryEvidenceIds: reviewed.contradictoryEvidenceIds,
    finalClassification: classification,
    finalClaim:
      state.startsWith("SUPPRESSED_")
        ? null
        : reviewed.revisedClaim ?? candidate.claim,
    confidence: Math.max(0, Math.min(1, reviewed.confidence)),
    materiality: reviewed.materiality,
    scoreEligible:
      !state.startsWith("SUPPRESSED_") &&
      state !== "LIMITATION_ONLY" &&
      scoreEligible(classification, reviewed.confidence),
  };
}

function collectAllowedEvidenceIds(
  facts: NormalizedAuditFacts,
  evidenceIntegrity: AuditEvidenceIntegritySnapshot,
) {
  const values = new Set(evidenceIntegrity.evidence.map((item) => item.id));
  for (const id of [
    facts.homepage?.title.provenance?.evidenceId,
    facts.homepage?.metaDescription.provenance?.evidenceId,
    facts.homepage?.h1.provenance?.evidenceId,
    ...(facts.homepage?.actions.interactionEvidenceIds ?? []),
    ...(facts.homepage?.contact?.contactPathEvidenceIds ?? []),
    ...(facts.homepage?.contact?.allContactEvidenceIds ?? []),
    ...(facts.homepage?.contact?.usableContactPathEvidenceIds ?? []),
    ...(facts.homepage?.contact?.brokenContactPathEvidenceIds ?? []),
    ...(facts.siteWide.pageFetchFacts ?? []).map((item) => item.evidenceId),
  ]) {
    if (id) values.add(id);
  }
  return values;
}

function supportingEvidenceIdsForFinding({
  finding,
  ruleId,
  facts,
  evidenceIntegrity,
}: {
  finding: ValidationFindingInput;
  ruleId: string;
  facts: NormalizedAuditFacts;
  evidenceIntegrity: AuditEvidenceIntegritySnapshot;
}) {
  const direct = stringsFromEvidence(finding.evidence, /evidenceids?|sourceevidenceids?/i);
  const issueRecords = evidenceIntegrity.evidence.filter(
    (item) =>
      item.issueKeys.includes(ruleId) ||
      item.issueKeys.includes(issueKeyFromEvidence(finding.evidence)),
  );
  const sourceRecords = evidenceIntegrity.evidence.filter(
    (item) =>
      item.category === finding.category &&
      (!finding.sourceUrl ||
        normalizeComparableUrl(item.sourceUrl ?? "") ===
          normalizeComparableUrl(finding.sourceUrl)),
  );
  const normalized: string[] = [];
  if (ruleId.includes("meta-description")) {
    if (facts.homepage?.metaDescription.provenance?.evidenceId) {
      normalized.push(facts.homepage.metaDescription.provenance.evidenceId);
    }
  }
  if (ruleId.includes("h1")) {
    if (facts.homepage?.h1.provenance?.evidenceId) {
      normalized.push(facts.homepage.h1.provenance.evidenceId);
    }
  }
  if (ruleId.includes("contact-path")) {
    normalized.push(
      ...(facts.homepage?.contact?.contactPathEvidenceIds ?? []),
      ...(facts.homepage?.contact?.allContactEvidenceIds ?? []),
      ...(facts.homepage?.contact?.brokenContactPathEvidenceIds ?? []),
    );
  }
  if (ruleId.includes("primary-cta")) {
    normalized.push(...(facts.homepage?.actions.interactionEvidenceIds ?? []));
  }
  return unique([
    ...direct,
    ...normalized,
    ...issueRecords.map((item) => item.id),
    ...sourceRecords.slice(0, 6).map((item) => item.id),
  ]);
}

function findingRuleId(finding: ValidationFindingInput) {
  const evidenceKey = issueKeyFromEvidence(finding.evidence);
  if (evidenceKey) return evidenceKey;
  const text = `${finding.title} ${finding.description}`.toLowerCase();
  if (/contact|email|phone|order|booking/.test(text) && /did not load|broken/.test(text)) {
    return "website:contact-path:broken-destination";
  }
  if (/contact path|contact the business|get in touch/.test(text) && /missing|no |not (?:obvious|found|detected)|could not/.test(text)) {
    return "website:contact-path:missing";
  }
  if (/meta description/.test(text) && /missing|no meta/.test(text)) {
    return finding.sourceUrl ? "page:meta-description:missing" : "sitewide:meta-description:missing";
  }
  if (/\bh1\b/.test(text) && /missing|no h1|0 h1/.test(text)) {
    return "page:h1:missing";
  }
  if (/\bh1\b/.test(text) && /multiple|more than one/.test(text)) {
    return "page:h1:multiple";
  }
  if (/primary cta|primary visitor action/.test(text)) {
    return "homepage:primary-cta:unclear";
  }
  if (/alt text/.test(text)) return "page:image-alt:missing";
  if (/canonical/.test(text)) return "page:canonical:status";
  if (/robots\.txt/.test(text)) return "seo:robots:status";
  if (/sitemap/.test(text)) return "seo:sitemap:status";
  if (/title/.test(text) && /missing|empty/.test(text)) return "page:title:missing";
  if (/title/.test(text) && /short|long|length/.test(text)) return "page:title:length-guidance";
  if (finding.sourceType === "ai_reviewed_opportunity") {
    return `ai:opportunity:${slug(finding.title)}`;
  }
  return `finding:${slug(finding.title)}`;
}

function initialClassification(
  finding: ValidationFindingInput,
  ruleId: string,
): CandidateClassification {
  const findingType = stringFromRecord(finding.evidence, "findingType");
  if (findingType === "VERIFIED_STRENGTH") return "VERIFIED_STRENGTH";
  if (findingType === "COVERAGE_INFORMATION") return "COVERAGE_NOTE";
  if (findingType === "LIMITATION") return "LIMITATION";
  if (findingType === "OPTIONAL_REFINEMENT") return "OPTIONAL_REFINEMENT";
  if (
    finding.sourceType === "ai_reviewed_opportunity" ||
    findingType === "AI_REVIEWED_OPPORTUNITY"
  ) {
    return "MEANINGFUL_OPPORTUNITY";
  }
  if (
    ruleId.includes("multiple") ||
    ruleId.includes("length-guidance") ||
    /could be|consider|ideal length|slightly/i.test(
      `${finding.title} ${finding.description}`,
    )
  ) {
    return "OPTIONAL_REFINEMENT";
  }
  if (finding.severity === FindingSeverity.INFO) {
    return /scanned|coverage|included|analyzed/i.test(finding.title)
      ? "COVERAGE_NOTE"
      : "VERIFIED_STRENGTH";
  }
  if (isSubjectiveRule(ruleId, finding)) return "MEANINGFUL_OPPORTUNITY";
  return "TECHNICAL_DEFECT";
}

function initialMateriality(
  finding: ValidationFindingInput,
  classification: CandidateClassification,
): CandidateMateriality {
  if (["OPTIONAL_REFINEMENT", "COVERAGE_NOTE", "LIMITATION", "VERIFIED_STRENGTH"].includes(classification)) {
    return "LOW";
  }
  if (
    finding.severity === FindingSeverity.CRITICAL ||
    finding.severity === FindingSeverity.HIGH
  ) {
    return "HIGH";
  }
  return finding.severity === FindingSeverity.MEDIUM ? "MEDIUM" : "LOW";
}

function initialConfidence(
  finding: ValidationFindingInput,
  facts: NormalizedAuditFacts,
  affectedUrls: string[],
) {
  const evidenceConfidence = stringFromRecord(finding.evidence, "confidence");
  if (evidenceConfidence === "HIGH") return 0.95;
  if (evidenceConfidence === "MEDIUM") return 0.75;
  if (evidenceConfidence === "LOW") return 0.45;
  if (incompleteAffectedPages({ affectedUrls } as CandidateFinding, facts).length > 0) {
    return 0.25;
  }
  return finding.sourceType === "ai_reviewed_opportunity" ? 0.72 : 0.9;
}

function affectedFindingUrls(finding: ValidationFindingInput) {
  return unique([
    ...(finding.sourceUrl ? [finding.sourceUrl] : []),
    ...urlsFromUnknown(finding.evidence),
  ]).map((url) => normalizedDisplayUrl(url));
}

function incompleteAffectedPages(
  candidate: Pick<CandidateFinding, "affectedUrls">,
  facts: NormalizedAuditFacts,
) {
  const incomplete = new Set(
    (facts.siteWide.pageFetchFacts ?? [])
      .filter((item) => item.extractionCompleteness === "INCOMPLETE")
      .flatMap((item) => [
        normalizeComparableUrl(item.url),
        normalizeComparableUrl(item.requestedUrl),
      ]),
  );
  return candidate.affectedUrls.filter((url) =>
    incomplete.has(normalizeComparableUrl(url)),
  );
}

function requiresCompletePage(ruleId: string) {
  return /(?:title|meta-description|h1|primary-cta|contact-path|image-alt|content)/.test(
    ruleId,
  );
}

function isSubjectiveRule(
  ruleId: string,
  finding: Pick<ValidationFindingInput, "title" | "description">,
) {
  return (
    /primary-cta:unclear|content-clarity|thin-content|copy|positioning/.test(ruleId) ||
    /unclear|could be clearer|more prominent|thin content|copy quality/i.test(
      `${finding.title} ${finding.description}`,
    )
  );
}

function isHypotheticalPreference(candidate: CandidateFinding) {
  return /could|consider|may benefit|ideal|preferred|might|alternative/i.test(
    `${candidate.claim} ${candidate.description}`,
  );
}

function optionalClaim(candidate: CandidateFinding) {
  if (candidate.ruleId.includes("h1:multiple")) {
    return "Optional: review the page's heading structure.";
  }
  if (candidate.ruleId.includes("length-guidance")) {
    return "Optional: review the search title for clarity.";
  }
  return `Optional: ${candidate.claim.replace(/[.]+$/, "")}.`;
}

function contradictionTypes(ruleId: string) {
  if (ruleId.includes("contact-path")) {
    return [
      "CONTACT_SECTION",
      "VISIBLE_EMAIL",
      "VISIBLE_PHONE",
      "CONTACT_FORM",
      "SEMANTIC_CONVERSION_PATH",
      "DESTINATION_PURPOSE",
    ];
  }
  if (ruleId.includes("h1")) return ["STATIC_H1", "RENDERED_H1", "ARIA_HEADING"];
  if (ruleId.includes("meta-description")) return ["SERVER_META_DESCRIPTION", "RENDERED_META_DESCRIPTION"];
  if (ruleId.includes("primary-cta")) return ["VISIBLE_CONVERSION_ACTION", "BOOKING_WIDGET", "FORM_ACTION"];
  return ["OBJECTIVE_NORMALIZED_FACT"];
}

function verificationRule(ruleId: string) {
  if (ruleId.includes("meta-description:missing")) {
    return { type: "NONEMPTY_META_DESCRIPTION_EXISTS", minimumCharacters: 1 };
  }
  if (ruleId.includes("h1:missing")) {
    return { type: "VISIBLE_TOP_LEVEL_HEADING_EXISTS", minimumCount: 1 };
  }
  if (ruleId.includes("contact-path:broken")) {
    return { type: "INTERACTION_DESTINATION_LOADS", acceptedStatus: "ANALYZED" };
  }
  if (ruleId.includes("contact-path:missing")) {
    return {
      type: "USABLE_CUSTOMER_PATH_EXISTS",
      acceptedPurposes: ["CONTACT", "ORDER", "BOOKING", "QUOTE", "PURCHASE", "APPLICATION", "CHAT"],
    };
  }
  return { type: "ORIGINAL_CONDITION_NO_LONGER_DETECTED", ruleId };
}

function rootCauseFromRule(ruleId: string) {
  if (ruleId.includes("meta-description:missing")) return "META_DESCRIPTION_MISSING";
  if (ruleId.includes("h1:missing")) return "PAGE_H1_MISSING";
  if (ruleId.includes("h1:multiple")) return "PAGE_HEADING_STRUCTURE";
  if (ruleId.includes("primary-cta")) return "HOMEPAGE_PRIMARY_CTA_CLARITY";
  if (ruleId.includes("contact-path:broken")) return "CUSTOMER_PATH_BROKEN";
  if (ruleId.includes("contact-path")) return "CUSTOMER_PATH_MISSING";
  if (ruleId.includes("image-alt")) return "IMAGE_ALT_COVERAGE";
  return ruleId.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function recommendationIssueKey(recommendation: RecommendationInput) {
  return (
    recommendation.issueKey ??
    stringFromRecord(recommendation.evidence, "issueKey") ??
    `recommendation:${slug(recommendation.title)}`
  );
}

function findingTypeForClassification(classification: CandidateClassification) {
  if (classification === "TECHNICAL_DEFECT") return "VERIFIED_TECHNICAL_ISSUE";
  if (classification === "MEANINGFUL_OPPORTUNITY") return "AI_REVIEWED_OPPORTUNITY";
  if (classification === "OPTIONAL_REFINEMENT") return "OPTIONAL_REFINEMENT";
  if (classification === "VERIFIED_STRENGTH") return "VERIFIED_STRENGTH";
  if (classification === "COVERAGE_NOTE") return "COVERAGE_INFORMATION";
  return "LIMITATION";
}

function classificationFromAi(
  value: FindingAiValidationResult["finalClassification"],
): CandidateClassification {
  if (value === "VERIFIED_TECHNICAL_ISSUE") return "TECHNICAL_DEFECT";
  if (value === "AI_REVIEWED_OPPORTUNITY") return "MEANINGFUL_OPPORTUNITY";
  if (value === "OPTIONAL_REFINEMENT") return "OPTIONAL_REFINEMENT";
  if (value === "COVERAGE_NOTE") return "COVERAGE_NOTE";
  return "LIMITATION";
}

function scoreEligible(classification: CandidateClassification, confidence: number) {
  return (
    confidence >= 0.65 &&
    ["TECHNICAL_DEFECT", "MEANINGFUL_OPPORTUNITY"].includes(classification)
  );
}

function isPublishableDecision(decision: CandidateDecision) {
  return ["CONFIRMED", "REFRAMED", "LIMITATION_ONLY"].includes(decision.state);
}

function isMissingMetaUrl(url: string, facts: NormalizedAuditFacts) {
  const key = normalizeComparableUrl(url);
  return facts.siteWide.pagesMissingMetaDescriptions.some(
    (item) => normalizeComparableUrl(item.url) === key,
  ) ||
    (facts.homepage?.metaDescription.status === "MISSING" &&
      normalizeComparableUrl(facts.homepage.url) === key);
}

function isMissingH1Url(url: string, facts: NormalizedAuditFacts) {
  const key = normalizeComparableUrl(url);
  return facts.siteWide.pagesMissingH1.some(
    (item) => normalizeComparableUrl(item.url) === key,
  ) ||
    (facts.homepage?.h1.status === "MISSING" &&
      normalizeComparableUrl(facts.homepage.url) === key);
}

function issueKeyFromEvidence(value: unknown) {
  return stringFromRecord(value, "issueKey") ?? "";
}

function stringsFromEvidence(value: unknown, keyPattern: RegExp): string[] {
  if (!isRecord(value)) return [];
  const values: string[] = [];
  for (const [key, nested] of Object.entries(value)) {
    if (keyPattern.test(key)) {
      if (typeof nested === "string") values.push(nested);
      if (Array.isArray(nested)) {
        values.push(...nested.filter((item): item is string => typeof item === "string"));
      }
    }
    if (isRecord(nested)) values.push(...stringsFromEvidence(nested, keyPattern));
  }
  return unique(values);
}

function urlsFromUnknown(value: unknown): string[] {
  if (typeof value === "string") return /^https?:\/\//i.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(urlsFromUnknown);
  if (!isRecord(value)) return [];
  return [
    value.url,
    value.sourceUrl,
    value.normalizedUrl,
    value.affectedUrl,
    value.affectedUrls,
    value.affectedPages,
    value.urls,
  ].flatMap(urlsFromUnknown);
}

function mergeEvidence(current: unknown, extra: Record<string, unknown>) {
  return { ...(isRecord(current) ? current : {}), ...extra };
}

function normalizeComparableUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/(?:index(?:\.html?)?|home)\/?$/i, "/");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return `${url.hostname}${url.pathname}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizedDisplayUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function plainTitle(value: string) {
  return value
    .replace(/^Optional:\s*/i, "Optional: ")
    .replace(/[.]+$/, "");
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unclassified";
}

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function stringFromRecord(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === "string"
    ? String(value[key])
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

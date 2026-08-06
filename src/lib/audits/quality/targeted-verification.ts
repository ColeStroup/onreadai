import type {
  CandidateFinding,
  FrozenVerificationContract,
  SpecialistReadiness,
} from "@/lib/audits/quality/types";

export type TargetedVerificationOutcome =
  | "VERIFIED_FIXED"
  | "FIXED_WITH_OPTIONAL_ENHANCEMENT"
  | "PARTIALLY_FIXED"
  | "STILL_DETECTED"
  | "UNABLE_TO_VERIFY"
  | "OWNER_REVIEW_REQUIRED"
  | "NO_LONGER_APPLICABLE";

export type CurrentVerificationEvidence = {
  available: boolean;
  applicable?: boolean;
  ownerReviewRequired?: boolean;
  metaDescription?: string | null;
  h1Count?: number | null;
  contactPathExists?: boolean | null;
  destinationLoads?: boolean | null;
  originalConditionDetected?: boolean | null;
  optionalEnhancementAvailable?: boolean;
  evidenceIds?: string[];
};

export function freezeVerificationContract({
  candidate,
  readiness,
  generatedAt,
  promptVersion = null,
  modelVersion = null,
}: {
  candidate: CandidateFinding;
  readiness: SpecialistReadiness;
  generatedAt: string;
  promptVersion?: string | null;
  modelVersion?: string | null;
}): FrozenVerificationContract {
  return {
    contractVersion: "targeted-verification-v1",
    originalFindingId: candidate.sourceFindingId ?? candidate.candidateId,
    stableFindingKey: candidate.stableFindingKey,
    rootCauseKey: candidate.rootCauseKey,
    originalEvidenceIds: candidate.supportingEvidenceIds,
    originalUrls: candidate.affectedUrls,
    ruleId: candidate.ruleId,
    ruleVersion: candidate.ruleVersion,
    promptVersion,
    modelVersion,
    requiredOutcome: readiness.requiredCompletionCriteria[0] ??
      "The original evidence condition is no longer detected.",
    tolerance: verificationTolerance(candidate),
    explicitExclusions: readiness.explicitExclusions,
    verificationMethod: readiness.verificationMethod,
    frozenAt: generatedAt,
  };
}

export function verifyFrozenFinding({
  contract,
  current,
}: {
  contract: FrozenVerificationContract;
  current: CurrentVerificationEvidence;
}): {
  outcome: TargetedVerificationOutcome;
  explanation: string;
  evidenceIds: string[];
} {
  if (current.applicable === false) {
    return result(
      "NO_LONGER_APPLICABLE",
      "The original page or condition is no longer part of the current website scope.",
      current,
    );
  }
  if (!current.available) {
    return result(
      "UNABLE_TO_VERIFY",
      "Onread could not collect the evidence required by the original check.",
      current,
    );
  }
  if (current.ownerReviewRequired) {
    return result(
      "OWNER_REVIEW_REQUIRED",
      "The original check depends on a business decision that the owner must confirm.",
      current,
    );
  }

  const fixed = fixedByFrozenRule(contract, current);
  if (fixed && current.optionalEnhancementAvailable) {
    return result(
      "FIXED_WITH_OPTIONAL_ENHANCEMENT",
      "The original requirement is fixed. A separate optional improvement may still be available, but it does not reopen the completed scope.",
      current,
    );
  }
  if (fixed) {
    return result(
      "VERIFIED_FIXED",
      "The current evidence meets the original frozen completion rule.",
      current,
    );
  }

  if (
    contract.ruleId.includes("contact-path:broken") &&
    current.contactPathExists === true &&
    current.destinationLoads !== true
  ) {
    return result(
      "PARTIALLY_FIXED",
      "The customer action is present, but its saved destination still did not load.",
      current,
    );
  }

  return result(
    "STILL_DETECTED",
    "The original evidence condition is still present under the frozen rule.",
    current,
  );
}

function fixedByFrozenRule(
  contract: FrozenVerificationContract,
  current: CurrentVerificationEvidence,
) {
  const rule = contract.ruleId.toLowerCase();
  if (rule.includes("meta-description:missing")) {
    return Boolean(current.metaDescription?.trim());
  }
  if (rule.includes("h1:missing")) {
    return typeof current.h1Count === "number" && current.h1Count >= 1;
  }
  if (rule.includes("contact-path:broken")) {
    return current.contactPathExists === true && current.destinationLoads === true;
  }
  if (rule.includes("contact-path:missing")) {
    return current.contactPathExists === true;
  }
  return current.originalConditionDetected === false;
}

function verificationTolerance(candidate: CandidateFinding) {
  const rule = candidate.ruleId.toLowerCase();
  if (rule.includes("meta-description:missing")) {
    return { minimumNonWhitespaceCharacters: 1, preferredLengthIsRequired: false };
  }
  if (rule.includes("h1:missing")) {
    return { minimumVisibleTopLevelHeadings: 1 };
  }
  if (rule.includes("contact-path")) {
    return {
      acceptedPurposes: [
        "CONTACT",
        "ORDER",
        "BOOKING",
        "QUOTE",
        "PURCHASE",
        "APPLICATION",
        "CHAT",
      ],
    };
  }
  return { exactOriginalConditionOnly: true };
}

function result(
  outcome: TargetedVerificationOutcome,
  explanation: string,
  current: CurrentVerificationEvidence,
) {
  return {
    outcome,
    explanation,
    evidenceIds: current.evidenceIds ?? [],
  };
}


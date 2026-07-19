import type { ScoreCategory } from "@prisma/client";

import {
  type AuditClaim,
  type AuditEvidenceRecord,
  type CanonicalRecommendationSnapshot,
  type EvidenceValidationWarning,
  type ProfileCountSummary,
  type ValidatedAuditClaim,
} from "@/lib/audits/evidence-contracts";

export function validateAuditClaim({
  claim,
  evidence,
}: {
  claim: AuditClaim;
  evidence: AuditEvidenceRecord[];
}): ValidatedAuditClaim {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const missing = claim.requiredEvidenceIds.filter(
    (id) => !evidenceById.has(id),
  );
  const selected = claim.requiredEvidenceIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is AuditEvidenceRecord => Boolean(item));
  const reasons: string[] = [];
  let valid = missing.length === 0;
  let correctedClaim: string | null = null;

  if (missing.length > 0) {
    reasons.push(`Missing ${missing.length} required evidence record(s).`);
  }

  switch (claim.kind) {
    case "DETECTED_ACTION_LINK_PAGE_COUNT": {
      const observedCount = selected.filter(
        (item) =>
          item.type === "ACTION_LINK_DETECTED" &&
          isRecord(item.observedValue) &&
          item.observedValue.hasDetectedActionLinks === true,
      ).length;
      const claimedCount = numberFromClaim(claim.value, "count");
      if (claimedCount !== observedCount) {
        valid = false;
        reasons.push(
          `The claim says ${claimedCount ?? "an unknown number of"} pages, but ${observedCount} page-level action-link records support it.`,
        );
        correctedClaim = `${observedCount} page${observedCount === 1 ? " has" : "s have"} detected action links.`;
      }
      break;
    }
    case "PRIMARY_CTA_CLARITY": {
      const assessment = selected.find(
        (item) => item.type === "PRIMARY_CTA_ASSESSED",
      );
      if (!assessment || !isRecord(assessment.interpretedValue)) {
        valid = false;
        reasons.push("No primary CTA assessment supports this claim.");
        correctedClaim =
          "Primary CTA clarity was not assessed from the available evidence.";
      }
      break;
    }
    case "CLEAR_PRIMARY_CTA_PAGE_COUNT": {
      const clearAssessments = selected.filter(
        (item) =>
          item.type === "PRIMARY_CTA_ASSESSED" &&
          isRecord(item.interpretedValue) &&
          item.interpretedValue.clarity === "CLEAR" &&
          item.interpretedValue.assessed === true,
      );
      const claimedCount = numberFromClaim(claim.value, "count");
      if (claimedCount !== clearAssessments.length) {
        valid = false;
        reasons.push(
          `Only ${clearAssessments.length} page-level CTA assessments are CLEAR; detected links cannot substitute for clarity evidence.`,
        );
        correctedClaim = `${clearAssessments.length} page${clearAssessments.length === 1 ? " has" : "s have"} a structurally assessed clear primary CTA.`;
      }
      break;
    }
    case "H1_ISSUE": {
      if (!selected.some((item) => item.type === "H1_COUNT")) {
        valid = false;
        reasons.push("H1 claims require H1 count evidence.");
      }
      if (
        selected.some(
          (item) =>
            item.type === "CANONICAL_STATUS" ||
            item.sourcePath.includes("robots") ||
            item.sourcePath.includes("sitemap"),
        )
      ) {
        valid = false;
        reasons.push(
          "Canonical, robots.txt, or sitemap evidence cannot justify an H1 recommendation.",
        );
      }
      break;
    }
    case "PROFILE_COUNT": {
      const countFields = [
        "confirmedPublicProfiles",
        "confirmedWebsiteProfiles",
        "confirmedSocialProfiles",
        "confirmedReviewProfiles",
        "detectedSocialProfiles",
        "pendingSocialProfiles",
      ];
      const profileCounts = isRecord(claim.value) ? claim.value : null;
      const reportsProfiles = Boolean(
        profileCounts &&
        countFields.some((field) => {
          const count = numberValue(profileCounts[field]);
          return count !== null && count > 0;
        }),
      );
      if (
        reportsProfiles &&
        !selected.some(
          (item) =>
            item.type === "PROFILE_CONFIRMED" ||
            item.type === "PROFILE_DETECTED",
        )
      ) {
        valid = false;
        reasons.push("Profile-count claims require profile status evidence.");
      }
      break;
    }
    case "REVIEW_COMPARISON": {
      const comparableReviewRecords = selected.filter(
        (item) => item.type === "REVIEW_METRICS",
      );
      if (comparableReviewRecords.length < 2) {
        valid = false;
        reasons.push(
          "A review winner requires comparable confirmed review metrics for both businesses.",
        );
        correctedClaim = "Reviews are not currently comparable.";
      }
      break;
    }
    case "SCORE_CHANGE": {
      if (!selected.some((item) => item.type === "SCORE_COMPONENT")) {
        valid = false;
        reasons.push("Score-change claims require score-component evidence.");
      }
      break;
    }
    case "PAGE_SAMPLE": {
      if (isRecord(claim.value)) {
        const shown = numberValue(claim.value.shown);
        const total = numberValue(claim.value.total);
        const labeledComplete = claim.value.complete === true;
        if (shown !== null && total !== null && shown < total && labeledComplete) {
          valid = false;
          reasons.push(
            "A subset of crawled pages cannot be labeled as the complete crawl inventory.",
          );
          correctedClaim = `Important-page sample - ${shown} of ${total} scanned pages.`;
        }
      }
      break;
    }
  }

  return {
    ...claim,
    valid,
    reasons,
    correctedClaim,
    requiredEvidenceMissing: missing,
  };
}

export function validateAuditClaims(
  claims: AuditClaim[],
  evidence: AuditEvidenceRecord[],
) {
  return claims.map((claim) => validateAuditClaim({ claim, evidence }));
}

export function buildEvidenceValidationWarnings({
  evidence,
  recommendations,
  businessProfileCounts,
  competitorProfileCounts,
}: {
  evidence: AuditEvidenceRecord[];
  recommendations: CanonicalRecommendationSnapshot[];
  businessProfileCounts: ProfileCountSummary;
  competitorProfileCounts: ProfileCountSummary;
}) {
  const warnings: EvidenceValidationWarning[] = [];
  const homepageCta = evidence.find(
    (item) =>
      item.type === "PRIMARY_CTA_ASSESSED" &&
      item.sourcePath === "website.homepage.primaryCtaAssessment",
  );
  const ctaIsClear =
    homepageCta &&
    isRecord(homepageCta.interpretedValue) &&
    homepageCta.interpretedValue.clarity === "CLEAR";
  const ctaRecommendation = recommendations.find(
    (item) => item.issueKey === "homepage:primary-cta:unclear",
  );
  if (ctaIsClear && ctaRecommendation) {
    warnings.push({
      code: "CTA_RECOMMENDATION_CONTRADICTS_CLEAR_ASSESSMENT",
      severity: "ERROR",
      message:
        "A CTA-clarity recommendation was excluded because the validated homepage assessment is CLEAR.",
      relatedIds: [homepageCta.id, ctaRecommendation.issueKey],
      safeFallback: null,
    });
  }

  for (const recommendation of recommendations) {
    const attached = recommendation.sourceEvidenceIds
      .map((id) => evidence.find((item) => item.id === id))
      .filter((item): item is AuditEvidenceRecord => Boolean(item));

    if (
      recommendation.issueKey.includes(":h1:") &&
      !attached.some((item) => item.type === "H1_COUNT")
    ) {
      warnings.push({
        code: "H1_RECOMMENDATION_LACKS_H1_EVIDENCE",
        severity: "ERROR",
        message: `H1 recommendation “${recommendation.title}” has no H1 count evidence.`,
        relatedIds: [recommendation.issueKey],
        safeFallback: "Do not publish this recommendation until H1 evidence is available.",
      });
    }

    if (
      attached.some(
        (item) =>
          item.category !== recommendation.category &&
          !isCrossCategoryEvidenceAllowed(recommendation.issueKey, item.category),
      )
    ) {
      warnings.push({
        code: "RECOMMENDATION_EVIDENCE_CATEGORY_MISMATCH",
        severity: "WARNING",
        message: `Recommendation “${recommendation.title}” includes evidence outside its allowed issue category.`,
        relatedIds: [
          recommendation.issueKey,
          ...attached.map((item) => item.id),
        ],
        safeFallback: "Use only evidence attached to the canonical issue key.",
      });
    }
  }

  const duplicateKeys = duplicateValues(
    recommendations.map((item) => item.issueKey),
  );
  for (const key of duplicateKeys) {
    warnings.push({
      code: "DUPLICATE_CANONICAL_ISSUE_KEY",
      severity: "ERROR",
      message: `Multiple recommendations use canonical issue key ${key}.`,
      relatedIds: [key],
      safeFallback: "Merge the recommendations before publishing the report.",
    });
  }

  for (const [label, counts] of [
    ["business", businessProfileCounts],
    ["competitors", competitorProfileCounts],
  ] as const) {
    if (counts.confirmedSocialProfiles > counts.confirmedPublicProfiles) {
      warnings.push({
        code: "SOCIAL_COUNT_EXCEEDS_PUBLIC_COUNT",
        severity: "ERROR",
        message: `Confirmed social profile count exceeds confirmed public profile count for ${label}.`,
        relatedIds: [],
        safeFallback: "Recalculate profile counts from explicit platform types.",
      });
    }
  }

  return warnings;
}

function isCrossCategoryEvidenceAllowed(
  issueKey: string,
  evidenceCategory: ScoreCategory,
) {
  return (
    (issueKey === "homepage:primary-cta:unclear" &&
      ["WEBSITE", "BRANDING", "COMPETITORS"].includes(evidenceCategory)) ||
    (issueKey === "reviews:proof:not-featured" &&
      ["REVIEWS", "WEBSITE"].includes(evidenceCategory))
  );
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function numberFromClaim(value: unknown, key: string) {
  return isRecord(value) ? numberValue(value[key]) : numberValue(value);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

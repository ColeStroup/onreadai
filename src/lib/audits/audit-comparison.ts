import {
  FindingSeverity,
  RecommendationStatus,
  ScoreCategory,
  type ProfilePlatform,
} from "@prisma/client";

import { readNormalizedAuditFacts } from "@/lib/audits/normalized-audit-facts";
import { readFindingValidationMetadata } from "@/lib/audits/quality/candidate-pipeline";
import { readCanonicalAuditReport } from "@/lib/reports/canonical-audit-report";

export type AuditComparisonScore = {
  category: ScoreCategory;
  previousScore: number;
  currentScore: number;
  delta: number;
  reason: string;
  changeType:
    | "observable_business_change"
    | "coverage_change"
    | "scoring_method_change"
    | "temporary_data_difference"
    | "unknown";
  underlyingBusinessChanged: boolean | null;
  confidence: "high" | "medium" | "low";
  directlyComparable: boolean;
};

export type AuditComparisonFinding = {
  title: string;
  description: string;
  category: ScoreCategory;
  severity: FindingSeverity;
  evidence?: unknown;
  stableKey?: string | null;
  rootCauseKey?: string | null;
};

export type AuditComparisonRecommendation = {
  id: string;
  title: string;
  description: string;
  category: ScoreCategory;
  status: RecommendationStatus;
  completedAt: Date | null;
  rootCauseKey?: string | null;
};

export type AuditComparisonInput = {
  id: string;
  createdAt: Date;
  overallScore: number | null;
  scores: Array<{
    category: ScoreCategory;
    platform: ProfilePlatform | null;
    score: number;
  }>;
  findings: AuditComparisonFinding[];
  recommendations: AuditComparisonRecommendation[];
  analysisSnapshot?: unknown;
};

export type AuditComparison = {
  previousAuditId: string | null;
  currentAuditId: string;
  overallScoreChange: number | null;
  categoryScoreChanges: AuditComparisonScore[];
  improvedCategories: AuditComparisonScore[];
  declinedCategories: AuditComparisonScore[];
  unchangedCategories: AuditComparisonScore[];
  newFindings: AuditComparisonFinding[];
  resolvedFindings: AuditComparisonFinding[];
  newRecommendations: AuditComparisonRecommendation[];
  completedRecommendationsSincePrevious: AuditComparisonRecommendation[];
  summary: string;
  methodologyChanged: boolean;
  comparisonNote: string | null;
};

const categoryLabels: Record<ScoreCategory, string> = {
  OVERALL: "Overall",
  WEBSITE: "Website",
  SOCIAL: "Social",
  SEO: "SEO",
  BRANDING: "Branding",
  REVIEWS: "Reviews",
  COMPETITORS: "Competitive Position",
};

const trackedScoreCategories = [
  ScoreCategory.WEBSITE,
  ScoreCategory.SEO,
  ScoreCategory.BRANDING,
  ScoreCategory.SOCIAL,
  ScoreCategory.REVIEWS,
  ScoreCategory.COMPETITORS,
];

export function compareAudits({
  currentAudit,
  previousAudit,
}: {
  currentAudit: AuditComparisonInput;
  previousAudit?: AuditComparisonInput | null;
}): AuditComparison {
  currentAudit = canonicalComparisonInput(currentAudit);
  previousAudit = previousAudit
    ? canonicalComparisonInput(previousAudit)
    : previousAudit;
  if (!previousAudit) {
    return {
      previousAuditId: null,
      currentAuditId: currentAudit.id,
      overallScoreChange: null,
      categoryScoreChanges: [],
      improvedCategories: [],
      declinedCategories: [],
      unchangedCategories: [],
      newFindings: currentAudit.findings,
      resolvedFindings: [],
      newRecommendations: currentAudit.recommendations,
      completedRecommendationsSincePrevious: currentAudit.recommendations.filter(
        (recommendation) =>
          recommendation.status === RecommendationStatus.COMPLETED,
      ),
      summary:
        "This is your first audit. Future audits will show progress over time.",
      methodologyChanged: false,
      comparisonNote: null,
    };
  }

  const currentOverall = scoreFor(currentAudit, ScoreCategory.OVERALL);
  const previousOverall = scoreFor(previousAudit, ScoreCategory.OVERALL);
  const overallScoreChange =
    currentOverall !== null && previousOverall !== null
      ? currentOverall - previousOverall
      : null;
  const currentMetadata = getComparisonMetadata(currentAudit.analysisSnapshot);
  const previousMetadata = getComparisonMetadata(previousAudit.analysisSnapshot);
  const methodologyChanged =
    currentMetadata.scoringEngineVersion !==
    previousMetadata.scoringEngineVersion;
  const categoryScoreChanges = trackedScoreCategories.flatMap((category) => {
    const previousScore = scoreFor(previousAudit, category);
    const currentScore = scoreFor(currentAudit, category);

    if (previousScore === null || currentScore === null) {
      return [];
    }

    const delta = currentScore - previousScore;
    const explanation = explainCategoryScoreChange({
      category,
      delta,
      currentAudit,
      previousAudit,
      currentMetadata,
      previousMetadata,
      methodologyChanged,
    });
    if (
      delta === 0 &&
      (explanation.changeType === "unknown" || methodologyChanged)
    ) {
      return [];
    }
    return [{
      category,
      previousScore,
      currentScore,
      delta,
      ...explanation,
    }];
  });
  const improvedCategories = categoryScoreChanges.filter(
    (change) => change.delta > 0,
  );
  const declinedCategories = categoryScoreChanges.filter(
    (change) => change.delta < 0,
  );
  const unchangedCategories = categoryScoreChanges.filter(
    (change) => change.delta === 0,
  );
  const previousFindingKeys = new Set(previousAudit.findings.map(findingKey));
  const currentFindingKeys = new Set(currentAudit.findings.map(findingKey));
  const previousRecommendationKeys = new Set(
    previousAudit.recommendations.map(recommendationKey),
  );
  const completedRecommendationKeys = new Set<string>();
  const completedRecommendationsSincePrevious = [
    ...previousAudit.recommendations,
    ...currentAudit.recommendations,
  ].filter((recommendation) => {
    if (
      recommendation.status !== RecommendationStatus.COMPLETED ||
      !recommendation.completedAt ||
      recommendation.completedAt < previousAudit.createdAt
    ) {
      return false;
    }

    const key = recommendationKey(recommendation);

    if (completedRecommendationKeys.has(key)) {
      return false;
    }

    completedRecommendationKeys.add(key);
    return true;
  });

  const comparisonNote = methodologyChanged
    ? `The scoring engine changed from ${previousMetadata.scoringEngineVersion} to ${currentMetadata.scoringEngineVersion}, so direct historical comparison is limited.`
    : null;

  return {
    previousAuditId: previousAudit.id,
    currentAuditId: currentAudit.id,
    overallScoreChange,
    categoryScoreChanges,
    improvedCategories,
    declinedCategories,
    unchangedCategories,
    newFindings: currentAudit.findings.filter(
      (finding) => !previousFindingKeys.has(findingKey(finding)),
    ),
    resolvedFindings: previousAudit.findings.filter(
      (finding) => !currentFindingKeys.has(findingKey(finding)),
    ),
    newRecommendations: currentAudit.recommendations.filter(
      (recommendation) =>
        !previousRecommendationKeys.has(recommendationKey(recommendation)),
    ),
    completedRecommendationsSincePrevious,
    summary: buildSummary({
      overallScoreChange,
      improvedCategories,
      declinedCategories,
      completedRecommendationsSincePrevious,
      categoryScoreChanges,
    }),
    methodologyChanged,
    comparisonNote,
  };
}

export function formatDelta(delta: number | null) {
  if (delta === null) return "First audit";
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function categoryLabel(category: ScoreCategory) {
  return categoryLabels[category];
}

function scoreFor(audit: AuditComparisonInput, category: ScoreCategory) {
  if (category === ScoreCategory.OVERALL) {
    return (
      audit.overallScore ??
      audit.scores.find(
        (score) => score.category === category && !score.platform,
      )?.score ??
      0
    );
  }

  return (
    audit.scores.find(
      (score) => score.category === category && !score.platform,
    )?.score ?? null
  );
}

function findingKey(finding: AuditComparisonFinding) {
  if (finding.rootCauseKey) return finding.rootCauseKey;
  if (finding.stableKey) return finding.stableKey;
  const stableFindingKey = readFindingValidationMetadata(
    finding.evidence,
  )?.stableFindingKey;
  if (stableFindingKey) return stableFindingKey;
  return `${finding.category}:${normalizeText(finding.title)}`;
}

function recommendationKey(recommendation: {
  title: string;
  category: ScoreCategory;
  rootCauseKey?: string | null;
}) {
  if (recommendation.rootCauseKey) return recommendation.rootCauseKey;
  return `${recommendation.category}:${normalizeText(recommendation.title)}`;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildSummary({
  overallScoreChange,
  improvedCategories,
  declinedCategories,
  completedRecommendationsSincePrevious,
  categoryScoreChanges,
}: {
  overallScoreChange: number | null;
  improvedCategories: AuditComparisonScore[];
  declinedCategories: AuditComparisonScore[];
  completedRecommendationsSincePrevious: AuditComparisonRecommendation[];
  categoryScoreChanges: AuditComparisonScore[];
}) {
  const strongestImprovement = [...improvedCategories].sort(
    (a, b) => b.delta - a.delta,
  )[0];
  const biggestDecline = [...declinedCategories].sort(
    (a, b) => a.delta - b.delta,
  )[0];
  const resultText =
    overallScoreChange === null
      ? "The overall scores could not be compared because one audit is missing an overall score."
      : overallScoreChange > 0
        ? `The overall score increased by ${overallScoreChange} point${overallScoreChange === 1 ? "" : "s"}.`
        : overallScoreChange < 0
          ? `The overall score decreased by ${Math.abs(overallScoreChange)} point${overallScoreChange === -1 ? "" : "s"}.`
          : "No overall score change was detected.";
  const improvementText = strongestImprovement
    ? ` Largest score increase: ${categoryLabels[strongestImprovement.category]} (+${strongestImprovement.delta}).`
    : "";
  const declineText = biggestDecline
    ? ` Largest score decrease: ${categoryLabels[biggestDecline.category]} (${biggestDecline.delta}).`
    : "";
  const completedText =
    completedRecommendationsSincePrevious.length > 0
      ? ` ${completedRecommendationsSincePrevious.length} recommendation${
          completedRecommendationsSincePrevious.length === 1 ? "" : "s"
        } marked completed since the previous audit.`
      : "";
  const reason = strongestImprovement?.reason ?? biggestDecline?.reason;
  const reasonText =
    overallScoreChange !== null && overallScoreChange !== 0
      ? reason
        ? ` ${reason}`
        : " No reliable cause was identified from the saved evidence."
      : "";
  const coverageChanges = categoryScoreChanges.filter(
    (change) => change.changeType === "coverage_change",
  );
  const coverageText =
    coverageChanges.length > 0
      ? ` Analysis coverage changed in ${coverageChanges
          .slice(0, 3)
          .map((change) => categoryLabels[change.category])
          .join(", ")}.`
      : "";

  return `${resultText}${improvementText}${declineText}${reasonText}${coverageText}${completedText}`;
}

type ComparisonMetadata = {
  scoringEngineVersion: string;
  pagesScanned: number | null;
  crawlPartial: boolean;
  hasWebsite: boolean;
  googleBusinessStatus: string | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  confirmedSocialProfiles: number | null;
  analyzedCompetitors: number;
  competitorSnapshotIds: string[];
};

function explainCategoryScoreChange({
  category,
  delta,
  currentAudit,
  previousAudit,
  currentMetadata,
  previousMetadata,
  methodologyChanged,
}: {
  category: ScoreCategory;
  delta: number;
  currentAudit: AuditComparisonInput;
  previousAudit: AuditComparisonInput;
  currentMetadata: ComparisonMetadata;
  previousMetadata: ComparisonMetadata;
  methodologyChanged: boolean;
}): Pick<
  AuditComparisonScore,
  | "reason"
  | "changeType"
  | "underlyingBusinessChanged"
  | "confidence"
  | "directlyComparable"
> {
  if (methodologyChanged) {
    return {
      reason:
        "The scoring method changed between these audits, so the score movement does not prove the website changed.",
      changeType: "scoring_method_change",
      underlyingBusinessChanged: null,
      confidence: "high",
      directlyComparable: false,
    };
  }

  if (category === ScoreCategory.COMPETITORS) {
    if (
      previousMetadata.analyzedCompetitors === 0 &&
      currentMetadata.analyzedCompetitors > 0
    ) {
      return {
        reason: `Competitive Position changed because the latest audit added a completed public comparison against ${currentMetadata.analyzedCompetitors} competitor${currentMetadata.analyzedCompetitors === 1 ? "" : "s"}. This reflects a more complete benchmark, not evidence that the business deteriorated.`,
        changeType: "coverage_change",
        underlyingBusinessChanged: false,
        confidence: "high",
        directlyComparable: false,
      };
    }

    if (
      currentMetadata.competitorSnapshotIds.join("|") !==
      previousMetadata.competitorSnapshotIds.join("|")
    ) {
      return {
        reason:
          "Competitive Position used a different timestamped competitor snapshot, so the benchmark evidence changed.",
        changeType: "coverage_change",
        underlyingBusinessChanged: null,
        confidence: "medium",
        directlyComparable: true,
      };
    }
  }

  if (
    (category === ScoreCategory.WEBSITE || category === ScoreCategory.SEO) &&
    currentMetadata.pagesScanned !== previousMetadata.pagesScanned
  ) {
    return {
      reason: `The crawl covered ${previousMetadata.pagesScanned ?? "an unknown number of"} page(s) previously and ${currentMetadata.pagesScanned ?? "an unknown number of"} page(s) in the latest audit, so the evidence base changed.`,
      changeType: "coverage_change",
      underlyingBusinessChanged: null,
      confidence: "high",
      directlyComparable: false,
    };
  }

  if (
    (category === ScoreCategory.WEBSITE || category === ScoreCategory.SEO) &&
    currentMetadata.crawlPartial !== previousMetadata.crawlPartial
  ) {
    return {
      reason:
        "One audit used partial crawl results, so this change may reflect temporary data coverage rather than a site change.",
      changeType: "temporary_data_difference",
      underlyingBusinessChanged: null,
      confidence: "high",
      directlyComparable: false,
    };
  }

  if (category === ScoreCategory.REVIEWS) {
    if (
      currentMetadata.googleBusinessStatus !==
      previousMetadata.googleBusinessStatus
    ) {
      return {
        reason: `Google Business status changed from ${previousMetadata.googleBusinessStatus ?? "unavailable"} to ${currentMetadata.googleBusinessStatus ?? "unavailable"}.`,
        changeType: "coverage_change",
        underlyingBusinessChanged: null,
        confidence: "high",
        directlyComparable: false,
      };
    }

    if (
      currentMetadata.googleRating !== previousMetadata.googleRating ||
      currentMetadata.googleReviewCount !== previousMetadata.googleReviewCount
    ) {
      return {
        reason: `Current Google evidence changed from ${formatReviewEvidence(previousMetadata)} to ${formatReviewEvidence(currentMetadata)}.`,
        changeType: "observable_business_change",
        underlyingBusinessChanged: true,
        confidence: "high",
        directlyComparable: true,
      };
    }
  }

  if (
    category === ScoreCategory.SOCIAL &&
    currentMetadata.confirmedSocialProfiles !==
      previousMetadata.confirmedSocialProfiles
  ) {
    return {
      reason: `Confirmed social-profile coverage changed from ${previousMetadata.confirmedSocialProfiles ?? "unavailable"} to ${currentMetadata.confirmedSocialProfiles ?? "unavailable"}.`,
      changeType: "observable_business_change",
      underlyingBusinessChanged: true,
      confidence: "high",
      directlyComparable: true,
    };
  }

  const currentKeys = new Set(
    currentAudit.findings
      .filter((finding) => finding.category === category)
      .map(findingKey),
  );
  const previousKeys = new Set(
    previousAudit.findings
      .filter((finding) => finding.category === category)
      .map(findingKey),
  );
  const evidenceChanged =
    [...currentKeys].some((key) => !previousKeys.has(key)) ||
    [...previousKeys].some((key) => !currentKeys.has(key));

  if (evidenceChanged) {
    const newlyPresent = [...currentKeys].filter(
      (key) => !previousKeys.has(key),
    ).length;
    const noLongerPresent = [...previousKeys].filter(
      (key) => !currentKeys.has(key),
    ).length;
    return {
      reason: `${newlyPresent} finding${newlyPresent === 1 ? " is" : "s are"} newly present and ${noLongerPresent} finding${noLongerPresent === 1 ? " is" : "s are"} no longer present in the saved evidence. This may reflect a website change or a difference in audit coverage.`,
      changeType: "unknown",
      underlyingBusinessChanged: null,
      confidence: "low",
      directlyComparable: false,
    };
  }

  return {
      reason:
        delta === 0
          ? "No category score change was detected."
        : "No reliable cause was identified from the saved evidence and coverage details.",
    changeType: "unknown",
    underlyingBusinessChanged: null,
    confidence: "low",
    directlyComparable: true,
  };
}

function canonicalComparisonInput(
  input: AuditComparisonInput,
): AuditComparisonInput {
  const report = readCanonicalAuditReport(input.analysisSnapshot);
  if (!report || report.integrity.status !== "READY") return input;
  const operationalRecommendations = new Map(
    input.recommendations.map((item) => [item.id, item]),
  );

  return {
    ...input,
    overallScore: report.view.audit.overallScore,
    scores: report.scores.flatMap((score) =>
      score.score === null
        ? []
        : [
            {
              category: score.category,
              platform: null,
              score: score.score,
            },
          ],
    ),
    findings: report.findings.map((finding) => ({
      title: finding.title,
      description: finding.simpleExplanation,
      category: finding.category,
      severity: finding.severity ?? FindingSeverity.INFO,
      stableKey: finding.stableKey,
      rootCauseKey: finding.rootCauseKey,
      evidence: {
        canonical: true,
        evidenceIds: finding.evidenceIds,
        affectedPageIds: finding.affectedPages.map((page) => page.pageId),
      },
    })),
    recommendations: report.recommendations.map((recommendation) => {
      const operational = operationalRecommendations.get(
        recommendation.recommendationId,
      );
      return {
        id: recommendation.recommendationId,
        title: recommendation.title,
        description: recommendation.description,
        category: recommendation.category,
        status: operational?.status ?? recommendation.status,
        completedAt: operational?.completedAt ?? null,
        rootCauseKey: recommendation.rootCauseKey,
      };
    }),
  };
}

function getComparisonMetadata(snapshot: unknown): ComparisonMetadata {
  const root = isRecord(snapshot) ? snapshot : {};
  const facts = readNormalizedAuditFacts(snapshot);
  const scoring = isRecord(root.scoringMetadata) ? root.scoringMetadata : {};
  const crawl = isRecord(root.websiteCrawl) ? root.websiteCrawl : {};
  const assessment = isRecord(root.assessment) ? root.assessment : {};
  const reviews = isRecord(root.reviews) ? root.reviews : {};
  const social = isRecord(root.social) ? root.social : {};
  const intelligence = isRecord(root.competitorIntelligence)
    ? root.competitorIntelligence
    : {};
  const competitorComparison = isRecord(intelligence.comparison)
    ? intelligence.comparison
    : {};

  return {
    scoringEngineVersion:
      stringValue(scoring.scoringEngineVersion) ?? "legacy-growth-score",
    pagesScanned:
      facts?.coverage.technical.pagesAnalyzed ??
      numberValue(crawl.pagesScanned),
    crawlPartial: facts
      ? facts.coverage.crawl.status === "PARTIAL_FAILURES"
      : Boolean(crawl.failedPages) ||
        (Array.isArray(crawl.warnings) && crawl.warnings.length > 0),
    hasWebsite: facts
      ? Boolean(facts.homepage)
      : Boolean(assessment.hasWebsite ?? root.website),
    googleBusinessStatus: stringValue(reviews.googleBusinessStatus),
    googleRating: numberValue(reviews.googleRating),
    googleReviewCount: numberValue(reviews.googleReviewCount),
    confirmedSocialProfiles:
      facts?.profiles.userConfirmedSocialProfiles ??
      numberValue(social.confirmedProfilesCount),
    analyzedCompetitors:
      facts?.coverage.competitors.analyzed
        ? numberValue(competitorComparison.analyzedCompetitorCount) ?? 1
        : numberValue(competitorComparison.analyzedCompetitorCount) ?? 0,
    competitorSnapshotIds: Array.isArray(intelligence.snapshotIds)
      ? intelligence.snapshotIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  };
}

function formatReviewEvidence(metadata: ComparisonMetadata) {
  const rating =
    metadata.googleRating === null
      ? "rating unavailable"
      : `${metadata.googleRating.toFixed(1)} rating`;
  const count =
    metadata.googleReviewCount === null
      ? "review count unavailable"
      : `${metadata.googleReviewCount.toLocaleString()} reviews`;
  return `${rating} and ${count}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

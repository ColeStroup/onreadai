import { ScoreCategory } from "@prisma/client";

import type { AuditAssessment } from "@/lib/audits/audit-applicability";
import type {
  EvidenceConfidence,
  ScoreBreakdown,
  ScoreComponent,
} from "@/lib/audits/evidence-contracts";

export type ScoreTrace = {
  category: ScoreCategory;
  score: number;
  components: ScoreComponent[];
};

export function createScoreTrace({
  category,
  score,
  key,
  label,
  value,
  explanation,
  confidence = "MEDIUM",
}: {
  category: ScoreCategory;
  score: number;
  key: string;
  label: string;
  value: ScoreComponent["value"];
  explanation: string;
  confidence?: EvidenceConfidence;
}): ScoreTrace {
  return {
    category,
    score,
    components: [
      {
        key,
        label,
        value,
        weight: null,
        contribution: score,
        evidenceIds: [],
        confidence,
        explanation,
      },
    ],
  };
}

export function updateScoreTrace(
  trace: ScoreTrace,
  {
    score,
    key,
    label,
    value,
    explanation,
    confidence = "HIGH",
  }: {
    score: number;
    key: string;
    label: string;
    value: ScoreComponent["value"];
    explanation: string;
    confidence?: EvidenceConfidence;
  },
) {
  const contribution = score - trace.score;
  trace.components.push({
    key,
    label,
    value,
    weight: null,
    contribution,
    evidenceIds: [],
    confidence,
    explanation,
  });
  trace.score = score;
  return score;
}

export function scoreTraceBreakdown({
  trace,
  applicable,
  engineVersion,
  calculatedAt,
}: {
  trace: ScoreTrace;
  applicable: boolean;
  engineVersion: string;
  calculatedAt: string;
}): ScoreBreakdown {
  return {
    category: trace.category,
    score: applicable ? trace.score : null,
    applicable,
    components: applicable ? trace.components : [],
    engineVersion,
    calculatedAt,
    calculationNote: applicable
      ? "Contributions are sequential score changes and sum to the saved category score."
      : "This category was excluded because comparable evidence was unavailable.",
  };
}

export function buildOverallScoreBreakdown({
  categoryScores,
  assessment,
  overallScore,
  engineVersion,
  calculatedAt,
}: {
  categoryScores: Partial<Record<ScoreCategory, number>>;
  assessment: AuditAssessment;
  overallScore: number;
  engineVersion: string;
  calculatedAt: string;
}): ScoreBreakdown {
  const applicable = assessment.applicableCategories.filter(
    (category) =>
      typeof categoryScores[category] === "number" &&
      (assessment.scoreWeights[category] ?? 0) > 0,
  );
  const totalWeight = applicable.reduce(
    (total, category) => total + (assessment.scoreWeights[category] ?? 0),
    0,
  );
  const components: ScoreComponent[] = applicable.map((category) => {
    const score = categoryScores[category] ?? 0;
    const weight = assessment.scoreWeights[category] ?? 0;
    return {
      key: `overall:${category.toLowerCase()}`,
      label: `${categoryLabel(category)} weighted score`,
      value: score,
      weight,
      contribution: totalWeight > 0 ? (score * weight) / totalWeight : 0,
      evidenceIds: [],
      confidence: "HIGH",
      explanation: `${categoryLabel(category)} contributes ${weight}% of the applicable score mix.`,
    };
  });
  const unrounded = components.reduce(
    (total, component) => total + component.contribution,
    0,
  );
  const rounding = overallScore - unrounded;
  if (Math.abs(rounding) > 0.0001) {
    components.push({
      key: "overall:rounding",
      label: "Whole-number rounding",
      value: overallScore,
      weight: null,
      contribution: rounding,
      evidenceIds: [],
      confidence: "HIGH",
      explanation: "The weighted result is rounded to the nearest whole number.",
    });
  }

  return {
    category: ScoreCategory.OVERALL,
    score: overallScore,
    applicable: true,
    components,
    engineVersion,
    calculatedAt,
    calculationNote:
      "The overall score is the weighted average of applicable categories only. Unavailable categories do not count as zero.",
  };
}

function categoryLabel(category: ScoreCategory) {
  return category.charAt(0) + category.slice(1).toLowerCase();
}

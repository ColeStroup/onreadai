import {
  FindingSeverity,
  ScoreCategory,
} from "@prisma/client";

import type { ScoreBreakdown, ScoreComponent } from "@/lib/audits/evidence-contracts";
import { readFindingValidationMetadata } from "@/lib/audits/quality/candidate-pipeline";
import type { ValidationFindingInput } from "@/lib/audits/quality/types";

export const VALIDATED_SCORING_ENGINE_VERSION = "website-growth-score-v2-validated";

export type ValidatedScoreResult = {
  overall: number;
  website: number;
  seo: number;
  breakdowns: ScoreBreakdown[];
  ignoredFindingCount: number;
  countedRootCauseCount: number;
};

export function calculateValidatedWebsiteSeoScores({
  findings,
  calculatedAt = new Date().toISOString(),
}: {
  findings: ValidationFindingInput[];
  calculatedAt?: string;
}): ValidatedScoreResult {
  const byCategory = new Map<ScoreCategory, ScoreComponent[]>([
    [ScoreCategory.WEBSITE, []],
    [ScoreCategory.SEO, []],
  ]);
  const seenRoots = new Set<string>();
  let ignoredFindingCount = 0;

  for (const finding of findings) {
    if (
      finding.category !== ScoreCategory.WEBSITE &&
      finding.category !== ScoreCategory.SEO
    ) {
      ignoredFindingCount += 1;
      continue;
    }
    const validation = readFindingValidationMetadata(finding.evidence);
    if (
      !validation ||
      !validation.scoreEligible ||
      validation.confidence < 0.65 ||
      validation.materiality === "LOW" ||
      !["TECHNICAL_DEFECT", "MEANINGFUL_OPPORTUNITY"].includes(
        validation.classification,
      )
    ) {
      ignoredFindingCount += 1;
      continue;
    }
    const scopedRoot = `${finding.category}:${validation.rootCauseKey}`;
    if (seenRoots.has(scopedRoot)) {
      ignoredFindingCount += 1;
      continue;
    }
    seenRoots.add(scopedRoot);
    const baseDeduction = deductionFor({
      severity: finding.severity,
      classification: validation.classification,
      materiality: validation.materiality,
    });
    const pageMultiplier = Math.min(
      1.6,
      1 + Math.max(0, validation.affectedUrls.length - 1) * 0.12,
    );
    const confidenceMultiplier = Math.max(0.65, validation.confidence);
    const rootCap =
      validation.classification === "TECHNICAL_DEFECT" ? 18 : 10;
    const deduction = Math.min(
      rootCap,
      Math.max(1, Math.round(baseDeduction * pageMultiplier * confidenceMultiplier)),
    );
    byCategory.get(finding.category)?.push({
      key: validation.rootCauseKey,
      label: finding.title,
      value: `${validation.affectedUrls.length || 1} affected page${validation.affectedUrls.length === 1 ? "" : "s"}`,
      weight: null,
      contribution: -deduction,
      evidenceIds: validation.supportingEvidenceIds,
      confidence:
        validation.confidence >= 0.85
          ? "HIGH"
          : validation.confidence >= 0.65
            ? "MEDIUM"
            : "LOW",
      explanation: `${deduction} point deduction for one validated ${validation.classification === "TECHNICAL_DEFECT" ? "technical root cause" : "material opportunity"}. Repeated page evidence is bounded by a ${rootCap}-point root-cause cap.`,
    });
  }

  const websiteComponents = byCategory.get(ScoreCategory.WEBSITE) ?? [];
  const seoComponents = byCategory.get(ScoreCategory.SEO) ?? [];
  const website = finalScore(websiteComponents);
  const seo = finalScore(seoComponents);
  const overall = Math.round(website * 0.55 + seo * 0.45);
  const breakdowns: ScoreBreakdown[] = [
    categoryBreakdown(ScoreCategory.WEBSITE, website, websiteComponents, calculatedAt),
    categoryBreakdown(ScoreCategory.SEO, seo, seoComponents, calculatedAt),
    {
      category: ScoreCategory.OVERALL,
      score: overall,
      applicable: true,
      components: [
        {
          key: "website-weight",
          label: "Website",
          value: website,
          weight: 0.55,
          contribution: website * 0.55,
          evidenceIds: unique(websiteComponents.flatMap((item) => item.evidenceIds)),
          confidence: categoryConfidence(websiteComponents),
          explanation: "Website contributes 55% of the Website Growth Score.",
        },
        {
          key: "seo-weight",
          label: "SEO",
          value: seo,
          weight: 0.45,
          contribution: seo * 0.45,
          evidenceIds: unique(seoComponents.flatMap((item) => item.evidenceIds)),
          confidence: categoryConfidence(seoComponents),
          explanation: "SEO contributes 45% of the Website Growth Score.",
        },
      ],
      engineVersion: VALIDATED_SCORING_ENGINE_VERSION,
      calculatedAt,
      calculationNote:
        "Only validated material root causes with medium or high confidence affect this score. Suppressed findings, missing data, limitations, strengths, and optional refinements have no deduction.",
    },
  ];

  return {
    overall,
    website,
    seo,
    breakdowns,
    ignoredFindingCount,
    countedRootCauseCount: seenRoots.size,
  };
}

function deductionFor({
  severity,
  classification,
  materiality,
}: {
  severity: FindingSeverity;
  classification: string;
  materiality: "HIGH" | "MEDIUM" | "LOW";
}) {
  const severityValue: Record<FindingSeverity, number> = {
    CRITICAL: 18,
    HIGH: 14,
    MEDIUM: 8,
    LOW: 3,
    INFO: 0,
  };
  const classMultiplier = classification === "TECHNICAL_DEFECT" ? 1 : 0.65;
  const materialityMultiplier = materiality === "HIGH" ? 1 : materiality === "MEDIUM" ? 0.75 : 0;
  return severityValue[severity] * classMultiplier * materialityMultiplier;
}

function finalScore(components: ScoreComponent[]) {
  const deduction = components.reduce(
    (total, component) => total + Math.abs(Math.min(0, component.contribution)),
    0,
  );
  return Math.max(10, Math.min(100, 100 - deduction));
}

function categoryBreakdown(
  category: ScoreCategory,
  score: number,
  components: ScoreComponent[],
  calculatedAt: string,
): ScoreBreakdown {
  return {
    category,
    score,
    applicable: true,
    components: [
      {
        key: `${category.toLowerCase()}:starting-score`,
        label: "Starting score",
        value: 100,
        weight: null,
        contribution: 100,
        evidenceIds: [],
        confidence: "HIGH",
        explanation:
          "The category starts at 100. Only validated material root causes create bounded deductions.",
      },
      ...components,
    ],
    engineVersion: VALIDATED_SCORING_ENGINE_VERSION,
    calculatedAt,
    calculationNote:
      "Duplicate root causes count once. Optional refinements, low-confidence claims, limitations, and unavailable data do not lower the score.",
  };
}

function categoryConfidence(components: ScoreComponent[]) {
  if (components.some((component) => component.confidence === "LOW")) return "LOW" as const;
  if (components.some((component) => component.confidence === "MEDIUM")) {
    return "MEDIUM" as const;
  }
  return "HIGH" as const;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

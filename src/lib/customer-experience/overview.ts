import type { ScoreCategory } from "@prisma/client";

import type { AuditFindingType } from "@/lib/audits/finding-taxonomy";
import type { AuditCoverageV2 } from "@/lib/audits/normalized-audit-facts";

export function plainHealthLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Needs attention";
}

export function plainScoreInterpretation(score: number | null) {
  if (score === null) return "Not provided";
  if (score >= 85) return "Strong";
  if (score >= 70) return "Healthy";
  if (score >= 50) return "Worth improving";
  return "Needs attention";
}

export function plainCoverageLabel(evidenceCompleteness?: number | null) {
  if (evidenceCompleteness === null || evidenceCompleteness === undefined) {
    return "Coverage available";
  }
  if (evidenceCompleteness >= 75) return "Strong coverage";
  if (evidenceCompleteness >= 45) return "Good coverage";
  return "Limited coverage";
}

export function strongestScoredCategory(
  scores: Array<{ category: ScoreCategory; score: number | null }>,
) {
  return (
    scores
      .filter((item) => item.category !== "OVERALL" && item.score !== null)
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
      .at(0) ?? null
  );
}

export function compactCoverageSummary(coverage: AuditCoverageV2) {
  const parts: string[] = [];

  if (coverage.crawl.status !== "NOT_APPLICABLE") {
    parts.push(`${coverage.crawl.successfulPages} pages checked`);
  }
  if (
    coverage.aiContent.status !== "NOT_APPLICABLE" &&
    coverage.aiContent.status !== "NOT_ENABLED"
  ) {
    parts.push(`${coverage.aiContent.completedPages} reviewed by AI`);
  }

  const socialProfiles =
    coverage.socialProfiles.userConfirmed +
    coverage.socialProfiles.publiclyDetected;
  if (socialProfiles > 0) {
    parts.push(`${socialProfiles} social profiles found`);
  } else {
    parts.push("No social profiles confirmed");
  }

  parts.push(
    coverage.reviews.status === "SCORABLE"
      ? "Review data available"
      : coverage.reviews.status === "LIMITED"
        ? "Review data limited"
        : "Reviews not configured",
  );

  return parts.join(" \u00b7 ");
}

export function compactWebsiteSeoCoverageSummary(coverage: AuditCoverageV2) {
  const parts: string[] = [];

  if (coverage.crawl.status !== "NOT_APPLICABLE") {
    parts.push(`${coverage.crawl.successfulPages} pages checked`);
  }
  if (
    coverage.aiContent.status !== "NOT_APPLICABLE" &&
    coverage.aiContent.status !== "NOT_ENABLED"
  ) {
    parts.push(`${coverage.aiContent.completedPages} reviewed by AI`);
  }

  parts.push("Website and SEO evidence only");
  return parts.join(" \u00b7 ");
}

export function summarizeFindingTypes(
  findings: Array<{ findingType?: AuditFindingType }>,
) {
  const verifiedIssues = findings.filter(
    (finding) => finding.findingType === "VERIFIED_TECHNICAL_ISSUE",
  ).length;
  const opportunities = findings.filter(
    (finding) => finding.findingType === "AI_REVIEWED_OPPORTUNITY",
  ).length;
  const strengths = findings.filter(
    (finding) => finding.findingType === "VERIFIED_STRENGTH",
  ).length;
  const limitations = findings.filter(
    (finding) =>
      finding.findingType === "LIMITATION" ||
      finding.findingType === "COVERAGE_INFORMATION",
  ).length;

  return {
    total: findings.length,
    verifiedIssues,
    opportunities,
    strengths,
    limitations,
    label: [
      `${verifiedIssues} verified issue${verifiedIssues === 1 ? "" : "s"}`,
      `${opportunities} opportunit${opportunities === 1 ? "y" : "ies"}`,
      limitations > 0
        ? `${limitations} limitation${limitations === 1 ? "" : "s"}`
        : `${strengths} strength${strengths === 1 ? "" : "s"}`,
    ].join(" \u00b7 "),
  };
}

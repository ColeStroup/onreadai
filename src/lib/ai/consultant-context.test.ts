import assert from "node:assert/strict";
import test from "node:test";

import { loadEnvConfig } from "@next/env";
import {
  BusinessProfileStatus,
  ProfilePlatform,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";

import { createReportFixture } from "@/lib/reports/report-fixtures.test-support";

test("AI Consultant context consumes canonical evidence without CTA or profile coercion", async () => {
  loadEnvConfig(process.cwd());
  const { buildConsultantContext } = await import(
    "@/lib/ai/consultant-context"
  );
  const report = createReportFixture("hospitality");
  assert(report.website);
  assert(report.websiteCrawl);

  const assessment = {
    clarity: "NEEDS_IMPROVEMENT" as const,
    primaryCtaText: null,
    primaryCtaType: null,
    evidence: [
      "Several customer actions were detected without one structurally dominant action.",
    ],
    confidence: "MEDIUM" as const,
    assessmentMethod: "STATIC_HTML_STRUCTURE" as const,
    assessed: true,
  };
  report.website.actionSummary.primaryCtaAssessment = assessment;
  report.websiteCrawl.pagesWithDetectedActionLinks = 34;
  report.websiteCrawl.pagesWithAssessedPrimaryCta = 34;
  report.websiteCrawl.pagesWithClearPrimaryCta = 0;
  report.evidenceIntegrity.canonicalRecommendations = [
    {
      issueKey: "sitewide:h1:missing",
      sourceFindingId: "finding-h1",
      sourceEvidenceIds: ["h1-homepage", "h1-page-2"],
      sourceCategory: ScoreCategory.SEO,
      recommendationType: "H1_MISSING",
      fullEvidence: "Homepage H1 count: 0. Two assessed pages have no H1.",
      reportEvidence: "Homepage H1 count: 0. Two assessed pages have no H1.",
      evidenceConfidence: "HIGH",
      generatedAt: report.audit.date.toISOString(),
      generatorVersion: "recommendation-evidence-v1",
      title: "Give important pages clear main headlines",
      description: "Add one descriptive H1 to each affected page.",
      category: ScoreCategory.SEO,
      priority: report.recommendations.primary[0].priority,
      estimatedEffort: "Low",
      expectedImpact: "High",
    },
  ];
  report.evidenceIntegrity.dataConflicts = [
    {
      id: "conflict-hours",
      type: "DATA_CONFLICT",
      field: "operatingHours",
      sources: [],
      preferredSource: "Dedicated hours page",
      preferredValue: "Lunch and dinner",
      confidence: "MEDIUM",
      action: "Confirm current hours and update stale metadata.",
      explanation:
        "Displayed operating hours and homepage metadata appear inconsistent.",
    },
  ];

  const profiles = [
    {
      platform: ProfilePlatform.WEBSITE,
      status: BusinessProfileStatus.CONFIRMED,
      url: report.business.initialInput,
      handle: null,
    },
    {
      platform: ProfilePlatform.INSTAGRAM,
      status: BusinessProfileStatus.CONFIRMED,
      url: "https://instagram.com/example",
      handle: null,
    },
    {
      platform: ProfilePlatform.FACEBOOK,
      status: BusinessProfileStatus.CONFIRMED,
      url: "https://facebook.com/example",
      handle: null,
    },
  ];
  const contextJson = await buildConsultantContext({
    question: "What should I fix first?",
    business: {
      name: report.business.name,
      initialInput: report.business.initialInput,
      goals: report.business.selectedGoals,
      primaryGoal: report.business.primaryGoal,
      description: report.business.context.description,
      targetAudience: report.business.context.targetAudience,
      mainOffer: report.business.context.mainOffer,
      industry: report.business.context.industry,
      businessType: report.business.context.businessType,
      primaryConversionGoal:
        report.business.context.observedPrimaryConversionGoal,
    },
    latestAudit: {
      overallScore: report.audit.overallScore,
      summary: report.audit.executiveSummary,
      createdAt: report.audit.date,
      analysisSnapshot: {
        assessment: report.assessment,
        website: report.website,
        websiteCrawl: report.websiteCrawl,
        seo: report.seo,
        social: report.social,
        reviews: report.reviews,
        evidenceIntegrity: report.evidenceIntegrity,
      },
    },
    scores: report.scores.flatMap((score) =>
      score.score === null
        ? []
        : [
            {
              category: score.category,
              platform: null,
              label: score.label,
              score: score.score,
            },
          ],
    ),
    findings: report.findings.all,
    recommendations: report.recommendations.all.map((recommendation) => ({
      title: recommendation.title,
      description: recommendation.description,
      category: recommendation.category,
      priority: recommendation.priority,
      status: recommendation.status ?? RecommendationStatus.TODO,
      expectedImpact: recommendation.expectedImpact,
      estimatedEffort: recommendation.estimatedEffort,
      impact: recommendation.expectedImpact,
      effort: recommendation.estimatedEffort,
    })),
    profiles,
    reviewAnalysis: report.reviews,
    competitors: [],
    auditComparison: report.progress.comparison,
  });
  const context = JSON.parse(contextJson);

  assert.equal(context.website.primaryCtaClarity, "NEEDS_IMPROVEMENT");
  assert.equal(context.websiteCrawl.pagesWithDetectedActionLinks, 34);
  assert.equal(context.websiteCrawl.pagesWithStructurallyClearPrimaryCta, 0);
  assert.equal(context.profiles.explicitCounts.confirmedPublicProfiles, 3);
  assert.equal(context.profiles.explicitCounts.confirmedSocialProfiles, 2);
  assert.match(context.profiles.terminology, /Social profile counts exclude websites/i);
  assert.deepEqual(
    context.latestAudit.evidenceIntegrity.canonicalRecommendations[0],
    {
      issueKey: "sitewide:h1:missing",
      title: "Give important pages clear main headlines",
      category: ScoreCategory.SEO,
      evidence: "Homepage H1 count: 0. Two assessed pages have no H1.",
      confidence: "HIGH",
    },
  );
  assert.equal(
    context.latestAudit.evidenceIntegrity.dataConflicts[0].preferredSource,
    "Dedicated hours page",
  );
});

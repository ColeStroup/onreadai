import assert from "node:assert/strict";
import test from "node:test";

import { RecommendationStatus, ScoreCategory } from "@prisma/client";

import { compareAudits } from "@/lib/audits/audit-comparison";
import { sanitizePdfText } from "@/lib/pdf/text-sanitize";
import {
  containsUnsupportedObservedClaim,
  publicCompetitorMonitoringCopy,
  validateBusinessCompatibleContent,
} from "@/lib/reports/content-compatibility";
import { createReportFixture } from "@/lib/reports/report-fixtures.test-support";
import { buildPresentationEvidence } from "@/lib/reports/presentation-evidence";

const incompatibleHospitalityTerms = [
  "discord",
  "gaming audience",
  "developer community",
  "free trial",
  "software demo",
  "saas",
];

test("hospitality report stays specific and free of creator/software leakage", () => {
  const report = createReportFixture("hospitality");
  const text = normalizedReportText(report);

  assert.equal(report.business.archetype, "restaurant_hospitality");
  assert.match(text, /beachfront|atmosphere|food|menu|guest experience/i);
  assert.equal(report.competitors.comparison, null);
  assert.equal(report.competitors.label, "Not part of this report");
  for (const term of incompatibleHospitalityTerms) {
    assert.doesNotMatch(text, new RegExp(escapeRegex(term), "i"));
  }
  assertNoContradictoryStates(text);
});

test("every report score carries normalized confidence and sufficiency metadata", () => {
  const report = createReportFixture("hospitality");

  for (const score of report.scores) {
    assert(score.confidence);
    assert.equal(typeof score.evidenceCompleteness, "number");
    assert.equal(typeof score.dataRequirementsMet, "boolean");
    assert(Array.isArray(score.missingInputs));
  }
});

test("SaaS report uses software conversion language without hospitality leakage", () => {
  const text = normalizedReportText(createReportFixture("saas"));

  assert.match(text, /free trial|product demo/i);
  assert.doesNotMatch(text, /linkedin|youtube shorts/i);
  assert.doesNotMatch(
    text,
    /menu specials|table reservations|happy hour|beach atmosphere/i,
  );
});

test("local-service report prioritizes calls, estimates, service area, and trust", () => {
  const text = normalizedReportText(createReportFixture("local_service"));

  assert.match(text, /call|estimate/i);
  assert.match(text, /service area|local trust|homeowners/i);
  assert.doesNotMatch(
    text,
    /free trial|software demo|menu specials|table reservations/i,
  );
});

test("ecommerce report uses product and checkout language without local-service leakage", () => {
  const report = createReportFixture("ecommerce");
  const text = normalizedReportText(report);

  assert.equal(report.business.archetype, "ecommerce");
  assert.match(text, /product|catalog|checkout|online store/i);
  assert.doesNotMatch(
    text,
    /roof inspection|service area|table reservation|restaurant|free trial/i,
  );
});

test("professional-services report uses consultation language without retail leakage", () => {
  const report = createReportFixture("no_competitor");
  const text = normalizedReportText(report);

  assert.equal(report.business.archetype, "professional_service");
  assert.match(text, /consultancy|advisory|consultation|service firms/i);
  assert.doesNotMatch(
    text,
    /checkout|menu specials|table reservation|roof replacement|free trial/i,
  );
});

test("social-only report excludes unavailable website categories from scoring", () => {
  const report = createReportFixture("social_only");
  const websiteScore = report.scores.find(
    (item) => item.category === ScoreCategory.WEBSITE,
  );
  const seoScore = report.scores.find(
    (item) => item.category === ScoreCategory.SEO,
  );
  const text = normalizedReportText(report);

  assert.equal(report.assessment.mode, "social_first");
  assert.equal(websiteScore?.score, null);
  assert.equal(websiteScore?.status, "not_provided");
  assert.equal(seoScore?.score, null);
  assert.equal(seoScore?.status, "not_applicable");
  assert(
    !report.assessment.applicableCategories.includes(ScoreCategory.WEBSITE),
  );
  assert(!report.assessment.applicableCategories.includes(ScoreCategory.SEO));
  assert(
    report.recommendations.all.every(
      (item) => item.category !== ScoreCategory.WEBSITE,
    ),
  );
  assert.match(text, /profile bio|link in bio|pinned posts|send a dm/i);
  assert.match(
    text,
    /post performance was not analyzed|posting frequency.*not analyzed/i,
  );
});

test("cottage regression report keeps facts, strategy, review scope, and actions consistent", () => {
  const report = createReportFixture("cottage_regression");
  const facts = report.normalizedFacts;
  const text = normalizedReportText(report);

  assert(facts);
  assert.equal(facts.homepage?.h1.count, 1);
  assert.equal(facts.homepage?.h1.status, "GOOD");
  assert.deepEqual(facts.siteWide.pagesMissingH1, [
    {
      url: "https://sunrise-pocket.example/menu",
      count: 0,
    },
  ]);
  assert.equal(facts.homepage?.metaDescription.length, 0);
  assert.equal(facts.profiles.userConfirmedSocialProfiles, 0);
  assert.equal(facts.profiles.publiclyDetectedSocialProfiles, 3);
  assert.equal(facts.profiles.profileContentAnalyzed, 0);
  assert.equal(report.reviews.dataRequirementsMet, false);
  assert.equal(report.reviews.scoreConfidence, "LOW");
  assert.equal(report.reviews.score, 0);
  assert.deepEqual(report.reviews.recommendedFixes, []);
  assert.equal(
    report.recommendations.all.filter((item) =>
      /meta(?: description|data)/i.test(item.title),
    ).length,
    1,
  );
  assert.equal(
    report.recommendations.all.filter((item) =>
      /primary action/i.test(item.title),
    ).length,
    1,
  );
  assert(
    report.recommendations.all.some(
      (item) =>
        item.sourceUrl === "https://sunrise-pocket.example/menu" &&
        /\bh1|headline\b/i.test(item.title),
    ),
  );
  assert(
    report.recommendations.all.every(
      (item) => !/homepage.*(?:h1|headline)/i.test(item.title),
    ),
  );
  assert.equal(facts.siteWide.thinPages.length, 1);
  assert.equal(facts.siteWide.duplicateContentGroups.length, 1);
  assert.equal(facts.siteWide.copyQualityFindings.length, 1);
  assert.equal(facts.siteWide.orderingFrictionPages.length, 1);
  assert.match(text, /preorder|pickup|delivery/i);
  assert.doesNotMatch(
    JSON.stringify(report.socialStrategy),
    /\batmosphere\b|\bdine[- ]?in\b|\bdirections\b|\bguest experience\b/i,
  );
  const homepageStrength = report.findings.all.find(
    (item) => item.id === "finding-homepage-h1-strength",
  );
  assert.equal(homepageStrength?.findingType, "VERIFIED_STRENGTH");
  assert.equal(homepageStrength?.sourceLabel, "Verified strength");
});

test("focused reports omit competitor scores and tasks", () => {
  const report = createReportFixture("no_competitor");
  const competitorScore = report.scores.find(
    (item) => item.category === ScoreCategory.COMPETITORS,
  );

  assert.equal(report.competitors.status, "not_configured");
  assert.equal(competitorScore, undefined);
  assert(
    report.recommendations.all.every(
      (item) => item.category !== ScoreCategory.COMPETITORS,
    ),
  );
});

test("new reports expose only Website and SEO categories", () => {
  const report = createReportFixture("hospitality");
  const supported = new Set<ScoreCategory>([
    ScoreCategory.WEBSITE,
    ScoreCategory.SEO,
  ]);

  assert.equal(report.productScope, "website_seo");
  assert.equal(report.scoreLabel, "Website Growth Score");
  assert.deepEqual(
    report.scores.map((item) => item.category),
    [ScoreCategory.WEBSITE, ScoreCategory.SEO],
  );
  assert(report.findings.all.every((item) => supported.has(item.category)));
  assert(
    report.recommendations.all.every((item) => supported.has(item.category)),
  );
});

test("focused reports never resurrect a saved social strategy", () => {
  const report = createReportFixture("stale_strategy");
  const text = normalizedReportText(report);

  assert.equal(report.socialStrategy.freshness.status, "UNAVAILABLE");
  assert.equal(report.socialStrategy.source, "disabled");
  assert.deepEqual(report.socialStrategy.data.recommendedPlatforms, []);
  assert.deepEqual(report.socialStrategy.data.suggestedPosts, []);
  assert.doesNotMatch(
    text,
    /add competitor data|google business.*still needs confirmation|linkedin|youtube shorts/i,
  );
  assertNoContradictoryStates(text);
});

test("Presentation Mode consumes canonical CTA, profile, evidence, and conflict fields", () => {
  const report = createReportFixture("hospitality");
  report.technicalAppendix.pagesWithDetectedActionLinks = 34;
  report.technicalAppendix.pagesWithAssessedPrimaryCta = 34;
  report.technicalAppendix.pagesWithStructurallyClearPrimaryCta = 0;
  report.technicalAppendix.homepagePrimaryCtaAssessment = {
    clarity: "NEEDS_IMPROVEMENT",
    primaryCtaText: null,
    primaryCtaType: null,
    evidence: ["Several actions were detected without one dominant action."],
    confidence: "MEDIUM",
    assessmentMethod: "STATIC_HTML_STRUCTURE",
    assessed: true,
  };
  report.competitors.profileCounts = {
    ...report.competitors.profileCounts,
    confirmedPublicProfiles: 3,
    confirmedWebsiteProfiles: 1,
    confirmedSocialProfiles: 2,
    pendingSocialProfiles: 9,
  };
  report.dataNotes = [
    "Displayed operating hours and homepage metadata appear inconsistent.",
  ];

  const presentation = buildPresentationEvidence(report);
  assert.equal(presentation.website.primaryCtaClarity, "needs improvement");
  assert.equal(
    presentation.website.actionCtaCoverage,
    "34 detected / 34 assessed / 0 clear",
  );
  assert.deepEqual(presentation.competitorProfiles, {
    confirmedPublicProfiles: 3,
    confirmedSocialProfiles: 2,
    pendingSocialProfiles: 9,
  });
  assert.equal(presentation.dataNotes.length, 1);
  assert(
    presentation.topPriorities.every(
      (item) => !/\.\.\.|\u2026/.test(item.evidence),
    ),
  );
});

test("compatibility validator rejects leakage and unsupported claims but allows limitations", () => {
  const context = {
    name: "Harbor Table",
    industry: "Hospitality",
    businessType: "Restaurant",
    mainOffer: "Lunch, dinner, and waterfront dining",
  };
  const leakage = validateBusinessCompatibleContent({
    context,
    item: {
      title: "Grow a Discord server",
      description:
        "Target gaming audiences with creator-community programming.",
    },
  });

  assert.equal(leakage.compatible, false);
  assert.equal(
    containsUnsupportedObservedClaim(
      "The competitor has a stronger content cadence and better engagement.",
    ),
    true,
  );
  assert.equal(
    containsUnsupportedObservedClaim(
      "Competitor posting frequency and engagement were not analyzed.",
    ),
    false,
  );
});

test("public competitor-monitoring copy stays within observed evidence", () => {
  const copy = publicCompetitorMonitoringCopy(["Example Co"]);
  assert.match(
    copy,
    /homepage messaging|offers|calls to action|important pages/i,
  );
  assert.doesNotMatch(
    copy,
    /content cadence|posting frequency|engagement|reach|impressions/i,
  );
});

test("score comparison explains expanded competitor coverage", () => {
  const previous = comparisonAudit({
    id: "previous",
    overall: 76,
    competitorScore: 72,
    analyzedCompetitors: 0,
  });
  const current = comparisonAudit({
    id: "current",
    overall: 75,
    competitorScore: 63,
    analyzedCompetitors: 1,
  });
  const comparison = compareAudits({
    currentAudit: current,
    previousAudit: previous,
  });
  const competitorChange = comparison.categoryScoreChanges.find(
    (item) => item.category === ScoreCategory.COMPETITORS,
  );

  assert.equal(competitorChange?.changeType, "coverage_change");
  assert.equal(competitorChange?.underlyingBusinessChanged, false);
  assert.equal(competitorChange?.directlyComparable, false);
  assert.match(competitorChange?.reason ?? "", /more complete benchmark/i);
});

test("PDF sanitization removes invisible and unsupported characters", () => {
  const sanitized = sanitizePdfText(
    "review\u00ad-count\u200b \u201cquoted\u201d \u2014 value \uFFFC \u0001",
  );
  assert.equal(sanitized, 'review-count "quoted" - value');
  assert.doesNotMatch(
    sanitized,
    /[\u0000-\u001f\u007f\u00ad\u200b-\u200d\ufeff\ufffc]/u,
  );
});

function normalizedReportText(value: unknown) {
  return JSON.stringify(value)
    .replace(/\\u[0-9a-f]{4}/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function assertNoContradictoryStates(text: string) {
  const pairs = [
    [
      /competitor analysis unavailable/i,
      /current comparison|comparison available/i,
    ],
    [/google business missing/i, /google business confirmed/i],
    [
      /social strategy current/i,
      /regenerate social strategy because current data is missing/i,
    ],
  ] as const;
  for (const [left, right] of pairs) {
    assert(
      !(left.test(text) && right.test(text)),
      `${left} conflicts with ${right}`,
    );
  }
}

function comparisonAudit({
  id,
  overall,
  competitorScore,
  analyzedCompetitors,
}: {
  id: string;
  overall: number;
  competitorScore: number;
  analyzedCompetitors: number;
}) {
  return {
    id,
    createdAt: new Date(id === "current" ? "2026-07-14" : "2026-07-01"),
    overallScore: overall,
    scores: [
      { category: ScoreCategory.OVERALL, platform: null, score: overall },
      {
        category: ScoreCategory.COMPETITORS,
        platform: null,
        score: competitorScore,
      },
    ],
    findings: [],
    recommendations: [
      {
        id: `${id}-recommendation`,
        title: "Current action",
        description: "Current action description",
        category: ScoreCategory.COMPETITORS,
        status: RecommendationStatus.TODO,
        completedAt: null,
      },
    ],
    analysisSnapshot: {
      scoringMetadata: { scoringEngineVersion: "growth-score-v2" },
      competitorIntelligence: {
        snapshotIds: analyzedCompetitors ? ["snapshot-current"] : [],
        comparison: { analyzedCompetitorCount: analyzedCompetitors },
      },
    },
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

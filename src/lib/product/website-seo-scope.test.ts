import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BusinessGoal,
  BusinessProfileStatus,
  FindingSeverity,
  ProfilePlatform,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";

import { classifyWebsiteActions } from "@/lib/analyzers/action-classifier";
import { analyzeReviews } from "@/lib/analyzers/review-analyzer";
import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import { analyzeSocialProfiles } from "@/lib/analyzers/social-analyzer";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import {
  buildAuditAssessment,
  calculateApplicableOverallScore,
  getAuditAssessment,
} from "@/lib/audits/audit-applicability";
import { compareAudits } from "@/lib/audits/audit-comparison";
import { generateDeterministicAudit } from "@/lib/audits/deterministic-audit";
import {
  isCompetitorIntelligenceEnabled,
  isLocalGrowthEnabled,
  isSocialGrowthEnabled,
} from "@/lib/features/feature-flags";
import { WEBSITE_GROWTH_SCORING_VERSION } from "@/lib/product/website-seo-scope";

const websiteProfile = {
  platform: ProfilePlatform.WEBSITE,
  status: BusinessProfileStatus.CONFIRMED,
  confidenceScore: 100,
  url: "https://example.com/",
};

test("future growth flags default off and require an explicit true value", () => {
  assert.equal(isSocialGrowthEnabled({}), false);
  assert.equal(isCompetitorIntelligenceEnabled({}), false);
  assert.equal(isLocalGrowthEnabled({}), false);
  assert.equal(isSocialGrowthEnabled({ SOCIAL_GROWTH_ENABLED: "  " }), false);
  assert.equal(
    isCompetitorIntelligenceEnabled({
      COMPETITOR_INTELLIGENCE_ENABLED: "TRUE",
    }),
    true,
  );
  assert.equal(isLocalGrowthEnabled({ LOCAL_GROWTH_ENABLED: "false" }), false);
});

test("Website Growth Score uses only Website 55% and SEO 45%", () => {
  const assessment = buildAuditAssessment({ profiles: [websiteProfile] });

  assert.deepEqual(assessment.applicableCategories, [
    ScoreCategory.WEBSITE,
    ScoreCategory.SEO,
  ]);
  assert.deepEqual(assessment.scoreWeights, {
    [ScoreCategory.WEBSITE]: 55,
    [ScoreCategory.SEO]: 45,
  });
  assert.equal(assessment.confirmedSocialProfilesCount, 0);
  assert.equal(
    calculateApplicableOverallScore(
      {
        [ScoreCategory.WEBSITE]: 80,
        [ScoreCategory.SEO]: 60,
        [ScoreCategory.SOCIAL]: 1,
        [ScoreCategory.REVIEWS]: 100,
        [ScoreCategory.COMPETITORS]: 1,
      },
      assessment,
    ),
    71,
  );
});

test("social, review, and competitor inputs cannot change focused audit output", () => {
  const baseInput = {
    businessName: "Example Co",
    initialInput: "https://example.com/",
    profiles: [websiteProfile],
    websiteAnalysis: websiteAnalysis(),
    seoAnalysis: seoAnalysis(),
    goals: [BusinessGoal.IMPROVE_WEBSITE],
    primaryGoal: BusinessGoal.IMPROVE_WEBSITE,
    calculatedAt: "2026-08-02T12:00:00.000Z",
  };
  const baseline = generateDeterministicAudit(baseInput);
  const socialProfiles = [
    websiteProfile,
    {
      platform: ProfilePlatform.INSTAGRAM,
      status: BusinessProfileStatus.CONFIRMED,
      confidenceScore: 100,
      url: "https://instagram.com/example",
    },
    {
      platform: ProfilePlatform.GOOGLE_BUSINESS,
      status: BusinessProfileStatus.CONFIRMED,
      confidenceScore: 100,
      url: "https://maps.google.com/?cid=example",
    },
  ];
  const withDisabledModules = generateDeterministicAudit({
    ...baseInput,
    profiles: socialProfiles,
    socialAnalysis: analyzeSocialProfiles({
      businessProfiles: socialProfiles,
      goals: [BusinessGoal.GROW_SOCIAL_MEDIA],
      primaryGoal: BusinessGoal.GROW_SOCIAL_MEDIA,
    }),
    reviewAnalysis: analyzeReviews({
      businessProfiles: socialProfiles,
      googleBusinessProfiles: [
        {
          status: "confirmed",
          rating: 5,
          reviewCount: 10_000,
          displayName: "Example Co",
        },
      ],
    }),
    competitors: [
      {
        name: "Saved Competitor",
        websiteUrl: "https://competitor.example/",
        profiles: [
          {
            platform: ProfilePlatform.WEBSITE,
            status: BusinessProfileStatus.CONFIRMED,
            label: "Website",
          },
        ],
      },
    ],
    competitorAnalysisAvailable: true,
  });
  const supportedCategories = new Set<ScoreCategory>([
    ScoreCategory.WEBSITE,
    ScoreCategory.SEO,
  ]);

  assert.equal(withDisabledModules.overallScore, baseline.overallScore);
  assert.deepEqual(withDisabledModules.scores, baseline.scores);
  assert(
    withDisabledModules.findings.every((item) =>
      supportedCategories.has(item.category),
    ),
  );
  assert(
    withDisabledModules.recommendations.every((item) =>
      supportedCategories.has(item.category),
    ),
  );
});

test("missing website evidence creates no applicable scored category", () => {
  const assessment = buildAuditAssessment({ profiles: [] });

  assert.deepEqual(assessment.applicableCategories, []);
  assert.deepEqual(assessment.scoreWeights, {});
  assert.equal(calculateApplicableOverallScore({}, assessment), 0);
  assert.match(
    assessment.limitations.join(" "),
    /confirmed website is required/i,
  );
});

test("legacy assessments remain broad and incompatible versions are disclosed", () => {
  const legacy = getAuditAssessment({ social: {} });
  assert.equal(legacy.version, 1);
  assert.equal(legacy.mode, "social_first");
  assert(legacy.applicableCategories.includes(ScoreCategory.SOCIAL));

  const comparison = compareAudits({
    previousAudit: comparisonAudit(
      "legacy",
      "growth-score-v4-data-sufficiency",
      64,
    ),
    currentAudit: comparisonAudit(
      "current",
      WEBSITE_GROWTH_SCORING_VERSION,
      76,
    ),
  });
  assert.equal(comparison.methodologyChanged, true);
  assert.match(
    comparison.comparisonNote ?? "",
    /direct historical comparison is limited/i,
  );
});

test("disabled customer routes and navigation are guarded beyond client hiding", async () => {
  const [navigation, socialLayout, competitorLayout, localLayout] =
    await Promise.all([
      readFile("src/components/dashboard/business-sub-navigation.tsx", "utf8"),
      readFile(
        "src/app/dashboard/businesses/[businessId]/social/layout.tsx",
        "utf8",
      ),
      readFile(
        "src/app/dashboard/businesses/[businessId]/competitors/layout.tsx",
        "utf8",
      ),
      readFile(
        "src/app/dashboard/businesses/[businessId]/reviews/layout.tsx",
        "utf8",
      ),
    ]);

  assert.match(navigation, /enabled\.social/);
  assert.match(navigation, /enabled\.competitors/);
  assert.match(navigation, /enabled\.local/);
  assert.match(socialLayout, /isSocialGrowthEnabled/);
  assert.match(competitorLayout, /isCompetitorIntelligenceEnabled/);
  assert.match(localLayout, /isLocalGrowthEnabled/);
  for (const source of [socialLayout, competitorLayout, localLayout]) {
    assert.match(source, /FutureModuleUnavailable/);
  }
});

function websiteAnalysis(): WebsiteAnalysis {
  return {
    normalizedUrl: "https://example.com/",
    fetchStatus: "success",
    statusCode: 200,
    pageTitle: "Example Co | Website growth",
    metaDescription:
      "A concise description of Example Co and the outcome its website offers customers.",
    h1Count: 1,
    h1Text: ["A clearer path to your next customer"],
    hasViewportMeta: true,
    hasCanonical: true,
    internalLinksCount: 8,
    externalLinksCount: 2,
    imageCount: 4,
    imagesMissingAltCount: 1,
    hasContactLink: true,
    hasPricingLink: true,
    hasBlogLink: false,
    hasSocialLinks: false,
    detectedSocialLinks: [],
    detectedAddress: null,
    detectedPhone: null,
    detectedGoogleMapsLinks: [],
    detectedMapEmbeds: [],
    detectedLocalBusinessSchema: [],
    operatingHoursSignals: [],
    ctaCandidates: ["Get started"],
    actionSummary: classifyWebsiteActions({
      businessKind: "general",
      candidates: [
        {
          label: "Get started",
          href: "/contact",
          buttonLike: true,
          nearPrimaryHeading: true,
        },
      ],
    }),
    warnings: ["One image is missing alt text."],
    score: 82,
  };
}

function seoAnalysis(): SeoAnalysis {
  return {
    score: 68,
    titleStatus: "good",
    titleLength: 27,
    metaDescriptionStatus: "good",
    metaDescriptionLength: 80,
    h1Status: "good",
    canonicalStatus: "good",
    viewportStatus: "good",
    robotsTxtStatus: "found",
    sitemapStatus: "found",
    indexabilityWarnings: [],
    seoWarnings: [],
    seoStrengths: ["Core homepage signals are present."],
    recommendedFixes: [],
  };
}

function comparisonAudit(id: string, scoringVersion: string, score: number) {
  return {
    id,
    createdAt: new Date(
      id === "legacy" ? "2026-07-01T00:00:00.000Z" : "2026-08-01T00:00:00.000Z",
    ),
    overallScore: score,
    scores: [
      {
        category: ScoreCategory.OVERALL,
        platform: null,
        score,
      },
      {
        category: ScoreCategory.WEBSITE,
        platform: null,
        score,
      },
    ],
    findings: [
      {
        title: "Example finding",
        description: "Measured evidence.",
        category: ScoreCategory.WEBSITE,
        severity: FindingSeverity.MEDIUM,
      },
    ],
    recommendations: [
      {
        id: `${id}-recommendation`,
        title: "Improve the page",
        description: "Use the measured evidence.",
        category: ScoreCategory.WEBSITE,
        status: RecommendationStatus.TODO,
        completedAt: null,
      },
    ],
    analysisSnapshot: {
      scoringMetadata: { scoringEngineVersion: scoringVersion },
    },
  };
}

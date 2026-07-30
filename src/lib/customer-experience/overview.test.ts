import assert from "node:assert/strict";
import test from "node:test";

import {
  compactCoverageSummary,
  plainCoverageLabel,
  plainHealthLabel,
  plainScoreInterpretation,
  strongestScoredCategory,
  summarizeFindingTypes,
} from "@/lib/customer-experience/overview";

test("overview labels translate technical scores into customer language", () => {
  assert.equal(plainHealthLabel(68), "Fair");
  assert.equal(plainScoreInterpretation(42), "Needs attention");
  assert.equal(plainScoreInterpretation(null), "Not provided");
  assert.equal(plainCoverageLabel(17), "Limited coverage");
  assert.equal(plainCoverageLabel(82), "Strong coverage");
});

test("overview chooses the strongest applicable category without duplicating overall", () => {
  assert.deepEqual(
    strongestScoredCategory([
      { category: "OVERALL", score: 92 },
      { category: "WEBSITE", score: 75 },
      { category: "SEO", score: null },
      { category: "SOCIAL", score: 81 },
    ]),
    { category: "SOCIAL", score: 81 },
  );
});

test("overview coverage and finding summaries remain compact", () => {
  const coverage = compactCoverageSummary({
    version: "audit-coverage-v2",
    crawl: {
      eligiblePages: 9,
      successfulPages: 9,
      failedPages: 0,
      excludedPages: 0,
      crawlLimit: 10,
      crawlLimitReached: false,
      status: "COMPLETE_FOR_ELIGIBLE_CRAWLED_PAGES",
      explanation: "All pages checked.",
    },
    technical: {
      pagesAnalyzed: 9,
      status: "COMPLETE",
      explanation: "Technical checks completed.",
    },
    aiContent: {
      selectedPages: 9,
      completedPages: 9,
      failedPages: 0,
      deterministicOnlyPages: 0,
      status: "COMPLETE_FOR_SELECTED_PAGES",
      explanation: "AI review completed.",
    },
    socialProfiles: {
      userConfirmed: 2,
      publiclyDetected: 1,
      pending: 0,
      contentAnalyzed: 0,
      status: "PROFILE_ONLY",
      explanation: "Profiles checked.",
    },
    reviews: {
      listingConfirmed: false,
      ratingAvailable: false,
      countAvailable: false,
      status: "LIMITED",
      explanation: "Review data limited.",
    },
    competitors: {
      configured: false,
      analyzed: false,
      status: "NOT_CONFIGURED",
      explanation: "No competitors.",
    },
  });
  assert.equal(
    coverage,
    "9 pages checked \u00b7 9 reviewed by AI \u00b7 3 social profiles found \u00b7 Review data limited",
  );

  assert.equal(
    summarizeFindingTypes([
      { findingType: "VERIFIED_TECHNICAL_ISSUE" },
      { findingType: "VERIFIED_TECHNICAL_ISSUE" },
      { findingType: "AI_REVIEWED_OPPORTUNITY" },
      { findingType: "LIMITATION" },
    ]).label,
    "2 verified issues \u00b7 1 opportunity \u00b7 1 limitation",
  );
});

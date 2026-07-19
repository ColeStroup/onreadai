import assert from "node:assert/strict";
import test from "node:test";

import {
  BusinessGoal,
  BusinessProfileStatus,
  ProfilePlatform,
  RecommendationPriority,
  ScoreCategory,
} from "@prisma/client";

import {
  classifyWebsiteActions,
  getPrimaryCtaAssessment,
  type WebsiteActionSummary,
} from "@/lib/analyzers/action-classifier";
import { analyzeReviews } from "@/lib/analyzers/review-analyzer";
import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import { analyzeSocialProfiles } from "@/lib/analyzers/social-analyzer";
import type {
  CrawledPageResult,
  WebsiteCrawlResult,
} from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import {
  compareAudits,
  type AuditComparisonInput,
} from "@/lib/audits/audit-comparison";
import {
  buildEvidenceValidationWarnings,
  validateAuditClaim,
} from "@/lib/audits/claim-validator";
import { detectAuditDataConflicts } from "@/lib/audits/data-conflicts";
import type {
  AuditClaim,
  AuditEvidenceRecord,
  CanonicalRecommendationSnapshot,
} from "@/lib/audits/evidence-contracts";
import { buildAuditEvidenceIntegrity } from "@/lib/audits/evidence-integrity";
import {
  completeEvidenceSummary,
  hasUnexplainedEllipsis,
  normalizeFindingCopy,
} from "@/lib/audits/finding-copy";
import { aggregateProfileCounts } from "@/lib/profiles/profile-counts";
import { asCompetitorPositioningSnapshot } from "@/lib/competitors/competitor-types";
import {
  canonicalizeRecommendations,
} from "@/lib/recommendations/recommendation-deduplication";
import { selectReportCrawlPages } from "@/lib/reports/page-summary";
import {
  createScoreTrace,
  scoreTraceBreakdown,
  updateScoreTrace,
} from "@/lib/scoring/score-breakdown";

const observedAt = "2026-07-14T12:00:00.000Z";

test("CTA detection stays separate from primary CTA clarity", () => {
  const saas = classifyWebsiteActions({
    businessKind: "saas",
    candidates: [
      action("Start Free", "/signup", {
        domLocation: "hero",
        buttonLike: true,
        nearPrimaryHeading: true,
      }),
      action("Book Demo", "/demo", {
        domLocation: "navigation",
        navigationLike: true,
      }),
      action("Pricing", "/pricing", {
        domLocation: "navigation",
        navigationLike: true,
      }),
      action("Login", "/login", {
        domLocation: "navigation",
        navigationLike: true,
      }),
    ],
  });

  assert.equal(saas.hasDetectedActionLinks, true);
  assert.deepEqual(saas.detectedActionTypes, [
    "Start Trial",
    "Request Demo",
    "Pricing",
  ]);
  assert.equal(saas.primaryCtaAssessment.clarity, "CLEAR");
  assert.equal(saas.primaryCtaAssessment.primaryCtaText, "Start Free");

  const restaurant = restaurantActionSummary();
  assert.equal(restaurant.hasDetectedActionLinks, true);
  assert.equal(restaurant.detectedActionTypes.length, 6);
  assert.equal(
    restaurant.primaryCtaAssessment.clarity,
    "NEEDS_IMPROVEMENT",
  );
  assert.equal(restaurant.primaryCtaAssessment.primaryCtaText, null);

  const samePageNavigation = classifyWebsiteActions({
    businessKind: "restaurant",
    candidates: [
      action("Food", "/menu/special-takeout-hours.htm#food"),
      action("Events", "/menu/special-takeout-hours.htm#events"),
      action("", "/about/hours-of-operation.htm"),
    ],
  });
  assert.deepEqual(samePageNavigation.detectedActionTypes, ["Events", "Hours"]);
  assert(!samePageNavigation.detectedActionTypes.includes("Order / Takeout"));
});

test("legacy and missing CTA states preserve uncertainty", () => {
  const legacy = getPrimaryCtaAssessment({ primaryActions: ["Menu"] });
  assert.equal(legacy.clarity, "UNCERTAIN");
  assert.equal(legacy.assessed, false);
  assert.equal(legacy.assessmentMethod, "LEGACY_ACTION_LINKS_ONLY");

  const missing = getPrimaryCtaAssessment(null);
  assert.equal(missing.clarity, "NOT_ASSESSED");
  assert.equal(missing.assessed, false);
});

test("legacy competitor action links are not promoted to a clear primary CTA", () => {
  const positioning = asCompetitorPositioningSnapshot({
    apparentBusinessDescription: "A local restaurant.",
    apparentTargetAudience: null,
    mainOffer: "Waterfront dining",
    positioningStatement: "Waterfront dining for local guests.",
    primaryConversionGoal: "Menu",
    primaryCTA: "Menu",
    secondaryCTAs: ["Hours", "Contact"],
    keyDifferentiators: [],
    detectedBusinessType: "restaurant",
    confidence: 70,
    score: 68,
    evidence: [],
    limitations: [],
  });

  assert(positioning);
  assert.equal(positioning.primaryCtaClarity, "UNCERTAIN");
  assert.equal(positioning.primaryCTA, null);
  assert.equal(positioning.primaryConversionGoal, null);
  assert.equal(positioning.score, 56);
  assert.equal(positioning.confidence, 60);
  assert.deepEqual(positioning.detectedActionTypes, [
    "Menu",
    "Hours",
    "Contact",
  ]);
  assert.match(positioning.limitations.at(-1) ?? "", /legacy snapshot/i);
});

test("claim validation rejects action links as proof of clear CTAs", () => {
  const actionEvidence = evidenceRecord({
    id: "actions-1",
    type: "ACTION_LINK_DETECTED",
    category: ScoreCategory.WEBSITE,
    sourcePath: "websiteCrawl.pages.https://example.com.actionLinks",
    observedValue: { hasDetectedActionLinks: true },
  });
  const claim: AuditClaim = {
    id: "claim-clear",
    kind: "CLEAR_PRIMARY_CTA_PAGE_COUNT",
    category: ScoreCategory.WEBSITE,
    text: "All pages have a clear CTA.",
    value: { count: 1, total: 1 },
    requiredEvidenceIds: [actionEvidence.id],
    confidence: "HIGH",
  };

  const result = validateAuditClaim({ claim, evidence: [actionEvidence] });
  assert.equal(result.valid, false);
  assert.match(result.reasons.join(" "), /cannot substitute/i);
  assert.match(result.correctedClaim ?? "", /^0 pages have/i);
});

test("semantic H1 deduplication keeps only measured H1 evidence", () => {
  const h1Homepage = evidenceRecord({
    id: "h1-homepage",
    type: "H1_COUNT",
    category: ScoreCategory.SEO,
    sourcePath: "website.homepage.h1Count",
    observedValue: 0,
    issueKeys: ["sitewide:h1:missing"],
  });
  const h1Page = evidenceRecord({
    id: "h1-menu",
    type: "H1_COUNT",
    category: ScoreCategory.SEO,
    sourcePath: "websiteCrawl.pages.https://example.com/menu.h1Count",
    observedValue: 0,
    sourceUrl: "https://example.com/menu",
    issueKeys: ["sitewide:h1:missing"],
  });
  const robots = evidenceRecord({
    id: "robots",
    type: "ROBOTS_TXT_STATUS",
    category: ScoreCategory.SEO,
    sourcePath: "seo.robotsTxtStatus",
    observedValue: "found",
  });
  const recommendations = canonicalizeRecommendations({
    recommendations: [
      recommendation("Give important pages a clear main headline"),
      recommendation("Add one clear H1 to the homepage"),
      recommendation("Use exactly one descriptive H1 on the homepage"),
    ],
    findings: [
      {
        id: "finding-h1",
        title: "Homepage has no H1 heading",
        description: "The measured homepage H1 count is zero.",
        category: ScoreCategory.SEO,
      },
    ],
    evidence: [h1Homepage, h1Page, robots],
    generatedAt: observedAt,
  });

  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].mergedRecommendationCount, 3);
  assert.deepEqual(
    recommendations[0].sourceEvidenceIds.sort(),
    [h1Homepage.id, h1Page.id].sort(),
  );
  assert.doesNotMatch(recommendations[0].fullEvidence, /robots|sitemap/i);
});

test("operating-hours recommendations retain conflict evidence", () => {
  const conflict = evidenceRecord({
    id: "conflict-operating-hours",
    type: "DATA_CONFLICT",
    category: ScoreCategory.SEO,
    sourcePath: "conflicts.operatingHours",
    explanation:
      "Displayed operating hours and homepage metadata appear inconsistent.",
    issueKeys: ["website:content:operating-hours-conflict"],
  });
  const recommendations = canonicalizeRecommendations({
    recommendations: [
      {
        title: "Align operating-hours wording across the website",
        description:
          "Confirm the current hours and update outdated homepage metadata.",
        category: ScoreCategory.SEO,
        priority: RecommendationPriority.MEDIUM,
        estimatedEffort: "Low",
        expectedImpact: "Medium",
      },
    ],
    findings: [],
    evidence: [conflict],
    generatedAt: observedAt,
  });

  assert.equal(recommendations.length, 1);
  assert.equal(
    recommendations[0].issueKey,
    "website:content:operating-hours-conflict",
  );
  assert.deepEqual(recommendations[0].sourceEvidenceIds, [conflict.id]);
  assert.equal(recommendations[0].evidenceConfidence, "HIGH");
  assert.match(recommendations[0].fullEvidence, /appear inconsistent/i);
});

test("review-proof recommendations merge around one evidence-backed issue", () => {
  const reviewEvidence = evidenceRecord({
    id: "reviews-google-business-metrics",
    type: "REVIEW_METRICS",
    category: ScoreCategory.REVIEWS,
    source: "review_analyzer",
    sourcePath: "reviews.metrics",
    observedValue: { rating: 4.6, reviewCount: 9225 },
    explanation: "Google rating: 4.6; review count: 9225.",
    issueKeys: ["reviews:proof:not-featured"],
  });
  const recommendations = canonicalizeRecommendations({
    recommendations: [
      {
        title: "Strengthen local trust proof",
        description: "Place trusted proof near customer decisions.",
        category: ScoreCategory.REVIEWS,
        priority: RecommendationPriority.HIGH,
        estimatedEffort: "Low",
        expectedImpact: "High",
      },
      {
        title: "Feature selected Google reviews on the homepage",
        description: "Show authentic customer proof near the next step.",
        category: ScoreCategory.REVIEWS,
        priority: RecommendationPriority.HIGH,
        estimatedEffort: "Low",
        expectedImpact: "High",
      },
    ],
    findings: [],
    evidence: [reviewEvidence],
    generatedAt: observedAt,
  });

  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].issueKey, "reviews:proof:not-featured");
  assert.equal(recommendations[0].mergedRecommendationCount, 2);
  assert.deepEqual(recommendations[0].sourceEvidenceIds, [reviewEvidence.id]);
});

test("evidence-category validation catches unsupported H1 links", () => {
  const robots = evidenceRecord({
    id: "robots-only",
    type: "ROBOTS_TXT_STATUS",
    category: ScoreCategory.SEO,
    sourcePath: "seo.robotsTxtStatus",
    observedValue: "found",
  });
  const counts = aggregateProfileCounts([]);
  const warnings = buildEvidenceValidationWarnings({
    evidence: [robots],
    recommendations: [
      {
        ...canonicalRecommendationSnapshot(),
        issueKey: "sitewide:h1:missing",
        sourceEvidenceIds: [robots.id],
      },
    ],
    businessProfileCounts: counts,
    competitorProfileCounts: counts,
  });

  assert(warnings.some((warning) =>
    warning.code === "H1_RECOMMENDATION_LACKS_H1_EVIDENCE"));
});

test("profile counts distinguish public, website, social, and pending", () => {
  const profiles = [
    countable(ProfilePlatform.WEBSITE, BusinessProfileStatus.CONFIRMED),
    countable(ProfilePlatform.INSTAGRAM, BusinessProfileStatus.CONFIRMED),
    countable(ProfilePlatform.FACEBOOK, BusinessProfileStatus.CONFIRMED),
    ...Array.from({ length: 9 }, (_, index) =>
      countable(
        index % 2 ? ProfilePlatform.TIKTOK : ProfilePlatform.YOUTUBE,
        BusinessProfileStatus.PENDING,
      )),
  ];
  const counts = aggregateProfileCounts(profiles);

  assert.equal(counts.confirmedPublicProfiles, 3);
  assert.equal(counts.confirmedWebsiteProfiles, 1);
  assert.equal(counts.confirmedSocialProfiles, 2);
  assert.equal(counts.pendingSocialProfiles, 9);
});

test("a truthful zero-profile count needs no fabricated evidence record", () => {
  const counts = aggregateProfileCounts([]);
  const claim: AuditClaim = {
    id: "claim:competitors:profile-counts",
    kind: "PROFILE_COUNT",
    category: ScoreCategory.SOCIAL,
    text: "Competitors: no confirmed or pending profiles.",
    value: counts,
    requiredEvidenceIds: [],
    confidence: "HIGH",
  };

  const result = validateAuditClaim({ claim, evidence: [] });

  assert.equal(result.valid, true);
  assert.deepEqual(result.reasons, []);
});

test("score traces explain exact sequential contributions", () => {
  const trace = createScoreTrace({
    category: ScoreCategory.WEBSITE,
    score: 50,
    key: "website:baseline",
    label: "Baseline",
    value: 50,
    explanation: "Documented starting score.",
  });
  updateScoreTrace(trace, {
    score: 60,
    key: "website:positive",
    label: "Positive signal",
    value: true,
    explanation: "Added ten points.",
  });
  updateScoreTrace(trace, {
    score: 55,
    key: "website:issue",
    label: "Measured issue",
    value: true,
    explanation: "Removed five points.",
  });
  const breakdown = scoreTraceBreakdown({
    trace,
    applicable: true,
    engineVersion: "test-engine",
    calculatedAt: observedAt,
  });

  assert.equal(breakdown.score, 55);
  assert.equal(
    breakdown.components.reduce((sum, item) => sum + item.contribution, 0),
    55,
  );
  assert.deepEqual(
    breakdown.components.map((item) => item.contribution),
    [50, 10, -5],
  );
});

test("zero-delta comparison uses one methodology note and no cause language", () => {
  const previous = comparisonAudit("previous", "legacy-growth-score");
  const current = comparisonAudit("current", "growth-score-v3-evidence");
  const comparison = compareAudits({
    currentAudit: current,
    previousAudit: previous,
  });

  assert.equal(comparison.overallScoreChange, 0);
  assert.match(comparison.summary, /No overall score change was detected\./);
  assert.doesNotMatch(comparison.summary, /cause.*score change/i);
  assert.equal(comparison.categoryScoreChanges.length, 0);
  assert.match(comparison.comparisonNote ?? "", /scoring engine changed/i);
  assert.doesNotMatch(comparison.summary, /methodology|scoring engine/i);
  assert.equal(
    (comparison.comparisonNote?.match(/scoring engine changed/gi) ?? []).length,
    1,
  );
});

test("report summaries do not end in unexplained ellipses", () => {
  const summary = completeEvidenceSummary(
    "Hours, Order, Menu, Contact, Events, Gift Cards, Directions, Reservations, and customer-service links were detected across the page. The analyzer assessed primary CTA clarity separately from link presence.",
    105,
  );

  assert.equal(hasUnexplainedEllipsis(summary), false);
  assert.match(summary, /Additional evidence is available in the dashboard\.$/);
});

test("page samples label a subset explicitly", () => {
  const pages = Array.from({ length: 34 }, (_, index) =>
    crawledPage(index, restaurantActionSummary()),
  );
  const selection = selectReportCrawlPages(pages, 8);

  assert.equal(selection.complete, false);
  assert.equal(selection.pagesShown, 8);
  assert.equal(selection.totalPages, 34);
  assert.equal(
    selection.label,
    "Important-page sample - 8 of 34 scanned pages",
  );
});

test("conflict detection prefers dedicated hours and contact pages", () => {
  const fixture = schoonersFixture();
  const conflicts = detectAuditDataConflicts({
    website: fixture.website,
    websiteCrawl: fixture.websiteCrawl,
    businessContextDescription:
      "A waterfront restaurant serving lunch and dinner.",
  });

  const hours = conflicts.find((conflict) =>
    conflict.field === "operatingHours");
  assert(hours);
  assert.equal(hours.preferredSource, "Dedicated hours page");
  assert.match(hours.explanation, /appear inconsistent/i);
});

test("one-off low-authority phone noise does not become a conflict", () => {
  const fixture = schoonersFixture();
  fixture.websiteCrawl.pageResults[0].detectedPhone = "850-235-3555";
  fixture.websiteCrawl.pageResults[2].detectedPhone = "850-235-3555";
  fixture.websiteCrawl.pageResults[3].detectedPhone = "7215767408";

  const conflicts = detectAuditDataConflicts({
    website: fixture.website,
    websiteCrawl: fixture.websiteCrawl,
  });
  assert.equal(
    conflicts.some((conflict) => conflict.field === "phoneNumber"),
    false,
  );

  fixture.websiteCrawl.pageResults[0].detectedPhone = "850-555-0100";
  const confirmedConflict = detectAuditDataConflicts({
    website: fixture.website,
    websiteCrawl: fixture.websiteCrawl,
  }).find((conflict) => conflict.field === "phoneNumber");
  assert(confirmedConflict);
  assert.equal(confirmedConflict.preferredSource, "Dedicated contact page");
});

test("finding copy removes duplicate punctuation and completes sentences", () => {
  const finding = normalizeFindingCopy({
    title: "Homepage has no H1 heading.:",
    description: "Some homepage images are missing alt text.:",
  });

  assert.equal(finding.title, "Homepage has no H1 heading");
  assert.equal(
    finding.description,
    "Some homepage images are missing alt text.",
  );
});

test("Schooners-style analyzer evidence stays consistent through the snapshot", () => {
  const fixture = schoonersFixture();
  const result = buildAuditEvidenceIntegrity({
    website: fixture.website,
    websiteCrawl: fixture.websiteCrawl,
    seo: fixture.seo,
    social: fixture.social,
    reviews: fixture.reviews,
    businessContext: {
      description: "Waterfront restaurant serving lunch and dinner.",
      targetAudience: "Visitors and local diners",
      mainOffer: "Waterfront dining",
      industry: "Hospitality",
      businessType: "Restaurant",
      primaryConversionGoal: "Visit the restaurant",
    },
    businessProfiles: fixture.businessProfiles,
    competitors: [fixture.competitor],
    competitorComparison: null,
    findings: [
      {
        id: "finding-homepage-h1",
        title: "Homepage has no H1 heading.",
        description: "The homepage H1 count is 0.",
        category: ScoreCategory.SEO,
      },
      {
        id: "finding-crawl-h1",
        title: "Important pages have no H1 headings.",
        description: "33 of 34 assessed pages have no H1.",
        category: ScoreCategory.SEO,
      },
      {
        id: "finding-cta",
        title: "Primary visitor action needs stronger emphasis.",
        description: "Six action types were detected without one dominant action.",
        category: ScoreCategory.WEBSITE,
      },
    ],
    recommendations: [
      recommendation("Give important pages a clear main headline"),
      recommendation("Add one clear H1 to the homepage"),
      recommendation("Use exactly one descriptive H1 on the homepage"),
      {
        title: "Make the primary visitor action clearer",
        description:
          "Choose one customer action and give it stronger structural prominence than navigation links.",
        category: ScoreCategory.WEBSITE,
        priority: RecommendationPriority.HIGH,
        estimatedEffort: "Low",
        expectedImpact: "High",
      },
    ],
    scoreBreakdowns: [
      scoreTraceBreakdown({
        trace: createScoreTrace({
          category: ScoreCategory.WEBSITE,
          score: 75,
          key: "website:measured-result",
          label: "Measured result",
          value: 75,
          explanation: "Website score from deterministic analyzer signals.",
        }),
        applicable: true,
        engineVersion: "growth-score-v3-evidence",
        calculatedAt: observedAt,
      }),
    ],
    observedAt,
    sourceVersions: {
      website: "website-analyzer-v3-cta-evidence",
      seo: "seo-analyzer-v1",
      social: "social-analyzer-v1",
      reviews: "review-analyzer-v1",
      scoring: "growth-score-v3-evidence",
    },
  });

  const { snapshot } = result;
  const actionClaim = snapshot.validatedClaims.find((claim) =>
    claim.kind === "DETECTED_ACTION_LINK_PAGE_COUNT");
  const clearClaim = snapshot.validatedClaims.find((claim) =>
    claim.kind === "CLEAR_PRIMARY_CTA_PAGE_COUNT");
  const h1Recommendations = snapshot.canonicalRecommendations.filter((item) =>
    item.issueKey.includes(":h1:"));
  const ctaRecommendation = snapshot.canonicalRecommendations.find((item) =>
    item.issueKey === "homepage:primary-cta:unclear");

  assert.equal(actionClaim?.valid, true);
  assert.deepEqual(actionClaim?.value, { count: 34, total: 34 });
  assert.equal(clearClaim?.valid, true);
  assert.deepEqual(clearClaim?.value, { count: 0, total: 34 });
  assert.equal(
    fixture.website.actionSummary.primaryCtaAssessment.clarity,
    "NEEDS_IMPROVEMENT",
  );
  assert(ctaRecommendation);
  assert.equal(h1Recommendations.length, 1);
  assert(h1Recommendations[0].sourceEvidenceIds.length >= 33);
  assert(
    h1Recommendations[0].sourceEvidenceIds.every((id) =>
      snapshot.evidence.find((item) => item.id === id)?.type === "H1_COUNT"),
  );
  assert.doesNotMatch(h1Recommendations[0].fullEvidence, /robots|sitemap/i);
  assert.equal(snapshot.profileCounts.totals.confirmedPublicProfiles, 3);
  assert.equal(snapshot.profileCounts.totals.confirmedSocialProfiles, 2);
  assert.equal(snapshot.profileCounts.totals.pendingSocialProfiles, 9);
  assert.equal(snapshot.dataConflicts[0]?.field, "operatingHours");
  assert(snapshot.evidence.some((item) =>
    item.type === "ROBOTS_TXT_STATUS" && item.source === "seo_analyzer"));
  assert(snapshot.evidence.some((item) =>
    item.type === "SITEMAP_STATUS" && item.source === "seo_analyzer"));
  assert(
    snapshot.canonicalRecommendations.every((item) =>
      !hasUnexplainedEllipsis(item.reportEvidence)),
  );
  assert.equal(
    snapshot.validationWarnings.filter((warning) =>
      warning.severity === "ERROR").length,
    0,
  );
});

function action(
  label: string,
  href: string,
  overrides: Partial<Parameters<typeof classifyWebsiteActions>[0]["candidates"][number]> = {},
) {
  return { label, href, elementType: "a", ...overrides };
}

function restaurantActionSummary() {
  return classifyWebsiteActions({
    businessKind: "restaurant",
    candidates: [
      action("Hours", "/hours", { domLocation: "navigation" }),
      action("Menu", "/menu", { domLocation: "navigation" }),
      action("Order Takeout", "/order", { domLocation: "navigation" }),
      action("Events", "/events", { domLocation: "navigation" }),
      action("Gift Cards", "/gift-cards", { domLocation: "navigation" }),
      action("Contact", "/contact", { domLocation: "navigation" }),
    ],
  });
}

function evidenceRecord(
  overrides: Partial<AuditEvidenceRecord> &
    Pick<AuditEvidenceRecord, "id" | "type" | "category" | "sourcePath">,
): AuditEvidenceRecord {
  return {
    source: "website_analyzer",
    sourceUrl: null,
    sourcePage: null,
    observedValue: null,
    interpretedValue: null,
    confidence: "HIGH",
    applicability: "APPLICABLE",
    observedAt,
    analyzerVersion: "test-analyzer",
    explanation: "Measured test evidence.",
    issueKeys: [],
    ...overrides,
  };
}

function recommendation(title: string) {
  return {
    title,
    description: `${title} using the measured H1 structure.`,
    category: ScoreCategory.SEO,
    priority: RecommendationPriority.HIGH,
    estimatedEffort: "Low",
    expectedImpact: "High",
  };
}

function canonicalRecommendationSnapshot(): CanonicalRecommendationSnapshot {
  return {
    issueKey: "sitewide:h1:missing",
    sourceFindingId: null,
    sourceEvidenceIds: [],
    sourceCategory: ScoreCategory.SEO,
    recommendationType: "H1_MISSING",
    fullEvidence: "Evidence unavailable.",
    reportEvidence: "Evidence unavailable.",
    evidenceConfidence: "LOW",
    generatedAt: observedAt,
    generatorVersion: "test-generator",
    title: "Add clear H1 headings",
    description: "Use one descriptive H1 per important page.",
    category: ScoreCategory.SEO,
    priority: RecommendationPriority.HIGH,
    estimatedEffort: "Low",
    expectedImpact: "High",
  };
}

function countable(
  platform: ProfilePlatform,
  status: BusinessProfileStatus,
) {
  return { platform, status };
}

function comparisonAudit(
  id: string,
  scoringEngineVersion: string,
): AuditComparisonInput {
  return {
    id,
    createdAt: new Date(id === "previous" ? "2026-06-01" : "2026-07-01"),
    overallScore: 75,
    scores: [
      ...[
        ScoreCategory.WEBSITE,
        ScoreCategory.SEO,
        ScoreCategory.BRANDING,
        ScoreCategory.SOCIAL,
        ScoreCategory.REVIEWS,
        ScoreCategory.COMPETITORS,
      ].map((category) => ({ category, platform: null, score: 75 })),
    ],
    findings: [],
    recommendations: [],
    analysisSnapshot: {
      scoringMetadata: { scoringEngineVersion },
      websiteCrawl: { pagesScanned: 34, failedPages: 0, warnings: [] },
    },
  };
}

function schoonersFixture() {
  const actionSummary = restaurantActionSummary();
  const metaPhrase =
    "Schooners serves lunch and dinner into the wee, wee hours of the night. ";
  const metaDescription = metaPhrase
    .repeat(Math.ceil(232 / metaPhrase.length))
    .slice(0, 232);
  const website: WebsiteAnalysis = {
    normalizedUrl: "https://schooners.com/",
    pageTitle: "Schooners - The Last Local Beach Club",
    metaDescription,
    h1Count: 0,
    h1Text: [],
    hasViewportMeta: true,
    hasCanonical: false,
    internalLinksCount: 40,
    externalLinksCount: 5,
    imageCount: 12,
    imagesMissingAltCount: 4,
    hasContactLink: true,
    hasPricingLink: false,
    hasBlogLink: false,
    hasSocialLinks: true,
    detectedSocialLinks: ["Instagram", "Facebook"],
    detectedAddress: null,
    detectedPhone: null,
    detectedGoogleMapsLinks: [],
    detectedMapEmbeds: [],
    detectedLocalBusinessSchema: [],
    operatingHoursSignals: [],
    ctaCandidates: actionSummary.detectedActionTypes,
    actionSummary,
    warnings: [],
    score: 75,
  };
  const pages = Array.from({ length: 34 }, (_, index) =>
    crawledPage(index, actionSummary));
  const websiteCrawl: WebsiteCrawlResult = {
    normalizedUrl: website.normalizedUrl,
    pagesScanned: 34,
    successfulPages: 34,
    failedPages: 0,
    averagePageScore: 74,
    pagesMissingTitle: 0,
    pagesMissingMetaDescription: 0,
    pagesWithNoH1: 33,
    pagesWithMultipleH1: 0,
    totalImages: 136,
    totalImagesMissingAlt: 18,
    pagesWithNoCTA: 0,
    pagesWithDetectedActionLinks: 34,
    pagesWithAssessedPrimaryCta: 34,
    pagesWithClearPrimaryCta: 0,
    pagesWithCtaNeedsImprovement: 34,
    pagesWithUncertainPrimaryCta: 0,
    importantPagesFound: ["Hours", "Menu", "Contact", "Events"],
    importantPagesMissing: [],
    discoveredImportantPages: [],
    scannedImportantPages: [],
    skippedImportantPages: [],
    missingImportantPageTypes: [],
    duplicateUrlsSkipped: 0,
    crawlLimitUsed: 34,
    crawlLimitReached: false,
    businessTypeUsed: "restaurant",
    pageResults: pages,
    warnings: [],
  };
  const seo: SeoAnalysis = {
    score: 61,
    titleStatus: "good",
    titleLength: website.pageTitle?.length ?? 0,
    metaDescriptionStatus: "too_long",
    metaDescriptionLength: metaDescription.length,
    h1Status: "missing",
    canonicalStatus: "missing",
    viewportStatus: "good",
    robotsTxtStatus: "found",
    sitemapStatus: "found",
    indexabilityWarnings: [],
    seoWarnings: [
      "Meta description is too long.",
      "Homepage is missing an H1 heading.",
      "Canonical tag is missing.",
    ],
    seoStrengths: ["robots.txt is reachable.", "sitemap.xml is reachable."],
    recommendedFixes: [
      "Write a shorter meta description.",
      "Use exactly one descriptive H1 on the homepage.",
      "Add a canonical link tag to the homepage.",
    ],
  };
  const businessProfiles = [
    profile("business-website", ProfilePlatform.WEBSITE, BusinessProfileStatus.CONFIRMED),
    profile("business-instagram", ProfilePlatform.INSTAGRAM, BusinessProfileStatus.CONFIRMED),
    profile("business-facebook", ProfilePlatform.FACEBOOK, BusinessProfileStatus.CONFIRMED),
    profile("business-google", ProfilePlatform.GOOGLE_BUSINESS, BusinessProfileStatus.CONFIRMED),
  ];
  const competitorProfiles = [
    profile("competitor-website", ProfilePlatform.WEBSITE, BusinessProfileStatus.CONFIRMED),
    profile("competitor-instagram", ProfilePlatform.INSTAGRAM, BusinessProfileStatus.CONFIRMED),
    profile("competitor-facebook", ProfilePlatform.FACEBOOK, BusinessProfileStatus.CONFIRMED),
    ...Array.from({ length: 9 }, (_, index) =>
      profile(
        `competitor-pending-${index}`,
        index % 2 ? ProfilePlatform.TIKTOK : ProfilePlatform.YOUTUBE,
        BusinessProfileStatus.PENDING,
      )),
  ];
  const social = analyzeSocialProfiles({
    businessProfiles,
    competitors: [
      { competitorName: "Pineapple Willy's", profiles: competitorProfiles },
    ],
    goals: [BusinessGoal.MORE_CUSTOMERS],
  });
  const reviews = analyzeReviews({
    businessProfiles,
    googleBusinessProfiles: [
      {
        id: "google-schooners",
        displayName: "Schooners",
        googleMapsUri: "https://maps.google.com/?cid=schooners",
        rating: 4.6,
        reviewCount: 9225,
        status: "confirmed",
      },
    ],
    competitors: [
      { competitorName: "Pineapple Willy's", profiles: competitorProfiles },
    ],
    goals: [BusinessGoal.MORE_CUSTOMERS],
    businessContext: { businessType: "Restaurant" },
  });

  return {
    website,
    websiteCrawl,
    seo,
    businessProfiles,
    social,
    reviews,
    competitor: {
      id: "competitor-pineapple",
      name: "Pineapple Willy's",
      profiles: competitorProfiles,
    },
  };
}

function crawledPage(
  index: number,
  actionSummary: WebsiteActionSummary,
): CrawledPageResult {
  const isHours = index === 1;
  const isContact = index === 2;
  return {
    url: index === 0
      ? "https://schooners.com/"
      : `https://schooners.com/page-${index}`,
    statusCode: 200,
    title: `Schooners page ${index}`,
    metaDescription: `Schooners page ${index} description.`,
    h1Count: index < 33 ? 0 : 1,
    h1Text: index < 33 ? [] : ["Schooners"],
    hasCanonical: false,
    hasViewportMeta: true,
    imageCount: 4,
    imagesMissingAltCount: index % 3 === 0 ? 1 : 0,
    internalLinksCount: 12,
    externalLinksCount: 2,
    ctaCandidates: actionSummary.detectedActionTypes,
    actionSummary,
    wordCount: 350,
    warnings: [],
    score: 74,
    pageTypes: index === 0
      ? ["Homepage"]
      : isHours
        ? ["Hours"]
        : isContact
          ? ["Contact"]
          : [],
    hasContactInfo: isContact,
    contactSignals: isContact ? ["Contact link"] : [],
    detectedAddress: null,
    detectedPhone: null,
    detectedGoogleMapsLinks: [],
    detectedMapEmbeds: [],
    detectedLocalBusinessSchema: [],
    operatingHoursSignals: isHours
      ? ["open 7 days a week for lunch and dinner"]
      : [],
  };
}

function profile(
  id: string,
  platform: ProfilePlatform,
  status: BusinessProfileStatus,
) {
  return { id, platform, status };
}

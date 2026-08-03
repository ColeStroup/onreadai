import assert from "node:assert/strict";
import test from "node:test";

import {
  BusinessProfileStatus,
  FindingSeverity,
  ProfilePlatform,
  RecommendationPriority,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";

import { generateDeterministicSocialStrategy } from "@/lib/ai/social-strategy-generator";
import { classifyWebsiteActions } from "@/lib/analyzers/action-classifier";
import {
  analyzeConversionProcess,
  assessThinContent,
  detectCopyQualityIssues,
  detectDuplicateContentGroups,
} from "@/lib/analyzers/content-quality";
import { analyzeReviews } from "@/lib/analyzers/review-analyzer";
import { analyzeSocialProfiles } from "@/lib/analyzers/social-analyzer";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import { compareAudits } from "@/lib/audits/audit-comparison";
import { validateAuditConsistency } from "@/lib/audits/audit-consistency";
import {
  classifyAuditFindingType,
  type AuditFindingType,
} from "@/lib/audits/finding-taxonomy";
import type {
  AuditCoverageV2,
  NormalizedAuditFacts,
} from "@/lib/audits/normalized-audit-facts";
import { buildNormalizedAuditFacts } from "@/lib/audits/normalized-audit-facts";
import {
  classifyBusinessModel,
  supportsCustomerVisitLanguage,
} from "@/lib/business-model";
import { canonicalizeRecommendations } from "@/lib/recommendations/recommendation-deduplication";
import {
  deterministicSocialRecommendation,
  validateBusinessCompatibleContent,
} from "@/lib/reports/content-compatibility";

const generatedAt = "2026-07-29T12:00:00.000Z";
const homepageUrl = "https://example.com/";
const menuUrl = "https://example.com/menu";

test("known homepage facts stay known and page-specific H1 contradictions are rejected", () => {
  const facts = normalizedFacts();
  const result = validateAuditConsistency({
    facts,
    businessName: "Sample Bakery",
    summary:
      "The homepage is missing an H1 and has strong social performance.",
    findings: [
      finding({
        id: "known-values",
        title: "Homepage evidence",
        description:
          "Homepage H1 count: unavailable. Homepage meta description length: unavailable.",
        severity: FindingSeverity.INFO,
      }),
      finding({
        id: "bad-home-h1",
        title: "Homepage is missing an H1",
        description: "Add a homepage H1.",
        sourceUrl: homepageUrl,
      }),
      finding({
        id: "menu-h1",
        title: "Menu page is missing an H1",
        description: "The measured H1 count is 0.",
        sourceUrl: menuUrl,
      }),
      finding({
        id: "clean-page-ai",
        title: "Clarify the catering process",
        description: "The catering page leaves the next step unclear.",
        sourceUrl: "https://example.com/catering",
        sourceType: "ai_reviewed_opportunity",
      }),
    ],
    recommendations: [
      recommendation({
        title: "Add an H1 to the homepage",
        description: "Give the homepage a main headline.",
        sourceUrl: homepageUrl,
        issueKey: "sitewide:h1:missing",
      }),
      recommendation({
        title: "Add an H1 to the menu",
        description: "Give the menu page a main headline.",
        sourceUrl: menuUrl,
        issueKey: "sitewide:h1:missing",
      }),
    ],
    generatedAt,
  });

  assert.equal(result.findings.some((item) => item.id === "bad-home-h1"), false);
  assert.equal(result.findings.some((item) => item.id === "menu-h1"), true);
  assert.equal(result.findings.some((item) => item.id === "clean-page-ai"), true);
  assert.match(result.findings[0]?.description ?? "", /H1 count: 1/);
  assert.match(
    result.findings[0]?.description ?? "",
    /meta description length: 0/i,
  );
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0]?.sourceUrl, menuUrl);
  assert.doesNotMatch(result.summary, /strong social performance/i);
  assert.equal(result.snapshot.fallbackSummaryUsed, true);
});

test("recommendations merge by root cause while H1 pages remain URL-scoped", () => {
  const consolidated = canonicalizeRecommendations({
    recommendations: [
      recommendation({
        title: "Make the primary visitor action more prominent",
        description: "The homepage has no dominant action.",
        issueKey: "homepage:primary-cta:unclear",
        sourceType: "deterministic",
      }),
      recommendation({
        title: "Add an Order button near the top",
        description: "Give the ordering path stronger prominence.",
        issueKey: "homepage:primary-cta:unclear",
        sourceType: "ai_reviewed_opportunity",
      }),
      recommendation({
        title: "Write metadata for key pages",
        description: "Several pages have no meta description.",
        issueKey: "sitewide:meta-description:missing",
        sourceType: "deterministic",
      }),
      recommendation({
        title: "Write concise meta descriptions",
        description: "Use useful descriptive copy.",
        issueKey: "homepage:meta-description:missing",
        sourceType: "ai_reviewed_opportunity",
      }),
      recommendation({
        title: "Add an H1 to the menu",
        description: "The menu page has no H1.",
        issueKey: "sitewide:h1:missing",
        sourceUrl: menuUrl,
      }),
      recommendation({
        title: "Add an H1 to catering",
        description: "The catering page has no H1.",
        issueKey: "sitewide:h1:missing",
        sourceUrl: "https://example.com/catering",
      }),
    ],
    findings: [
      {
        id: "cta-finding",
        title: "Primary CTA needs improvement",
        description: "No dominant homepage action was detected.",
        category: ScoreCategory.WEBSITE,
      },
      {
        id: "meta-finding",
        title: "Meta descriptions are missing",
        description: "Measured descriptions are missing.",
        category: ScoreCategory.SEO,
      },
    ],
    evidence: [],
    generatedAt,
  });

  assert.equal(
    consolidated.filter(
      (item) => item.rootCauseKey === "HOMEPAGE_PRIMARY_CTA_CLARITY",
    ).length,
    1,
  );
  assert.equal(
    consolidated.filter(
      (item) => item.rootCauseKey === "HOMEPAGE_META_DESCRIPTION_MISSING",
    ).length,
    1,
  );
  const h1Recommendations = consolidated.filter(
    (item) => item.rootCauseKey === "PAGE_H1_MISSING",
  );
  assert.equal(h1Recommendations.length, 2);
  assert.deepEqual(
    h1Recommendations.map((item) => item.affectedUrls[0]).sort(),
    ["https://example.com/catering", menuUrl],
  );
  const cta = consolidated.find(
    (item) => item.rootCauseKey === "HOMEPAGE_PRIMARY_CTA_CLARITY",
  );
  assert.equal(cta?.mergedRecommendationCount, 2);
  assert.deepEqual(cta?.sourceTypes.sort(), [
    "ai_reviewed_opportunity",
    "deterministic",
  ]);
  assert.deepEqual(cta?.sourceFindingIds, ["cta-finding"]);
});

test("audited SEO support endpoints are valid evidence while external URLs remain rejected", () => {
  const result = validateAuditConsistency({
    facts: normalizedFacts(),
    businessName: "Sample Bakery",
    summary: "The technical SEO checks identified two setup actions.",
    findings: [],
    recommendations: [
      recommendation({
        title: "Add a readable robots.txt file",
        description: "Publish a readable crawl policy.",
        sourceUrl: "https://example.com/robots.txt",
        issueKey: "seo:robots:status",
      }),
      recommendation({
        title: "Publish a sitemap.xml file",
        description: "Publish a sitemap for important pages.",
        sourceUrl: "https://example.com/sitemap.xml",
        issueKey: "seo:sitemap:status",
      }),
      recommendation({
        title: "Copy another site's crawl policy",
        description: "Use an unrelated external source.",
        sourceUrl: "https://other-site.example/robots.txt",
        issueKey: "seo:external-source",
      }),
    ],
    generatedAt,
  });

  assert.deepEqual(
    result.recommendations.map((item) => item.sourceUrl),
    [
      "https://example.com/robots.txt",
      "https://example.com/sitemap.xml",
    ],
  );
  assert.equal(
    result.snapshot.issues.filter(
      (item) => item.code === "UNSUPPORTED_SOURCE_URL_REJECTED",
    ).length,
    1,
  );
});

test("action extraction separates order, contact, email, newsletter, and social links", () => {
  const summary = classifyWebsiteActions({
    businessKind: "general",
    candidates: [
      { label: "Order Inquiries", href: "/order-inquiries" },
      { label: "Email us", href: "mailto:orders@example.com" },
      { label: "Call", href: "tel:+14075550100" },
      { label: "Join our newsletter", href: "/newsletter" },
      { label: "Instagram", href: "https://instagram.com/example" },
      { label: "Menu", href: "/menu", navigationLike: true },
    ],
  });

  assert.deepEqual(summary.orderActions, ["Order Inquiries"]);
  assert.deepEqual(summary.emailActions, ["Email us"]);
  assert.deepEqual(summary.contactActions, ["Call"]);
  assert.deepEqual(summary.newsletterActions, ["Join our newsletter"]);
  assert.deepEqual(summary.socialLinks, ["Instagram"]);
  assert.equal(summary.primaryCtaAssessment.clarity, "NEEDS_IMPROVEMENT");
});

test("listing presence without rating and count stays limited and low confidence", () => {
  const reviews = analyzeReviews({
    businessProfiles: [
      {
        platform: ProfilePlatform.GOOGLE_BUSINESS,
        status: BusinessProfileStatus.CONFIRMED,
      },
    ],
    googleBusinessProfiles: [
      {
        displayName: "Sample Bakery",
        status: "CONFIRMED",
        rating: null,
        reviewCount: null,
      },
    ],
  });

  assert.equal(reviews.scoreScope, "LISTING_PRESENCE");
  assert.equal(reviews.scoreStatus, "INSUFFICIENT_DATA");
  assert.equal(reviews.scoreConfidence, "LOW");
  assert.equal(reviews.dataRequirementsMet, false);
  assert(reviews.score <= 58);
  assert.equal(reviews.reviewPresenceLevel, "low");
  assert.match(
    reviews.reviewScoreExplanation,
    /does not measure review performance/i,
  );
});

test("social profile detection scores coverage without implying performance", () => {
  const social = analyzeSocialProfiles({
    businessProfiles: [
      {
        platform: ProfilePlatform.INSTAGRAM,
        status: BusinessProfileStatus.CONFIRMED,
      },
      {
        platform: ProfilePlatform.FACEBOOK,
        status: BusinessProfileStatus.PENDING,
      },
      {
        platform: ProfilePlatform.TIKTOK,
        status: BusinessProfileStatus.REMOVED,
      },
    ],
  });

  assert.equal(social.confirmedProfilesCount, 1);
  assert.equal(social.pendingProfilesCount, 1);
  assert.equal(social.removedProfilesCount, 1);
  assert.equal(social.scoreScope, "PROFILE_COVERAGE");
  assert.equal(social.performanceStatus, "NOT_ANALYZED");
  assert.equal(social.contentAnalyzedProfilesCount, 0);
});

test("normalized facts keep confirmed, detected, pending, and analyzed profile counts separate", () => {
  const profiles = [
    {
      platform: ProfilePlatform.WEBSITE,
      status: BusinessProfileStatus.CONFIRMED,
    },
    {
      platform: ProfilePlatform.INSTAGRAM,
      status: BusinessProfileStatus.CONFIRMED,
    },
    {
      platform: ProfilePlatform.FACEBOOK,
      status: BusinessProfileStatus.PENDING,
    },
    {
      platform: ProfilePlatform.TIKTOK,
      status: BusinessProfileStatus.REMOVED,
    },
  ];
  const social = analyzeSocialProfiles({ businessProfiles: profiles });
  const reviews = analyzeReviews({ businessProfiles: profiles });
  const facts = buildNormalizedAuditFacts({
    website: websiteAnalysis(),
    websiteCrawl: null,
    seo: null,
    social,
    reviews,
    selectiveAi: null,
    businessProfiles: profiles,
    businessContext: {
      businessType: "Cottage food business",
      description: "A home-based preorder bakery.",
    },
    competitorConfigured: false,
    competitorAnalyzed: false,
  });

  assert.equal(facts.profiles.userConfirmedSocialProfiles, 1);
  assert.equal(facts.profiles.publiclyDetectedSocialProfiles, 3);
  assert.deepEqual(facts.profiles.additionalDetectedPlatforms, [
    "Facebook",
    "TikTok",
  ]);
  assert.equal(facts.profiles.pendingSocialProfiles, 1);
  assert.equal(facts.profiles.profileContentAnalyzed, 0);
  assert.equal(
    facts.scoreEvidence.categories[ScoreCategory.SOCIAL]
      ?.coverageStatus,
    "LIMITED",
  );
  assert.equal(facts.scoreEvidence.social.performanceAnalyzed, false);
});

test("business-model-aware strategy avoids storefront advice without a confirmed location", () => {
  const cottage = generateDeterministicSocialStrategy({
    businessName: "Sample Bakery",
    initialInput: "Sample Bakery",
    businessContext: {
      businessType: "Cottage food business",
      description:
        "A home-based bakery taking preorders for local pickup or delivery.",
      targetAudience: "Local families",
      mainOffer: "Seasonal baked goods",
      primaryConversionGoal: "Email an order inquiry",
    },
  });
  const cottageText = JSON.stringify(cottage);

  assert.match(cottageText, /preorder/i);
  assert.match(cottageText, /pickup|delivery/i);
  assert.doesNotMatch(
    cottageText,
    /\batmosphere\b|\bdine[- ]?in\b|\bdirections\b|\bguest experience\b/i,
  );

  const unknownLocationRestaurant = deterministicSocialRecommendation({
    name: "Sample Kitchen",
    businessType: "Restaurant",
    description: "Prepared meals available by preorder.",
    primaryConversionGoal: "Order by email",
  });
  assert.doesNotMatch(
    unknownLocationRestaurant.description,
    /\batmosphere\b|\bdirections\b|\bvisiting\b|\bvisit\b/i,
  );

  const publicRestaurant = generateDeterministicSocialStrategy({
    businessName: "Sample Cafe",
    initialInput: "Sample Cafe",
    businessContext: {
      businessType: "Cafe",
      description:
        "A dine-in cafe with a customer-facing storefront and table service.",
      mainOffer: "Coffee and breakfast",
      primaryConversionGoal: "Visit the cafe",
    },
  });
  assert.match(JSON.stringify(publicRestaurant), /atmosphere|visit/i);
});

test("location compatibility rejects visit language for home-service businesses", () => {
  const classification = classifyBusinessModel({
    context: {
      businessType: "Home service",
      description: "A mobile HVAC team serving homes across Orlando.",
    },
  });
  assert.equal(classification.model, "HOME_SERVICE");
  assert.equal(supportsCustomerVisitLanguage(classification), false);

  const result = validateBusinessCompatibleContent({
    item: {
      title: "Plan a visit",
      description: "Check our store hours and get directions.",
    },
    context: {
      businessType: "Home service",
      description: "A mobile HVAC team serving homes across Orlando.",
    },
  });
  assert.equal(result.compatible, false);
});

test("finding taxonomy separates strengths, coverage, issues, and AI opportunities", () => {
  const cases: Array<{
    expected: AuditFindingType;
    input: Parameters<typeof classifyAuditFindingType>[0];
  }> = [
    {
      expected: "VERIFIED_STRENGTH",
      input: {
        title: "Homepage has a clear H1",
        description: "One H1 is present.",
        severity: FindingSeverity.INFO,
      },
    },
    {
      expected: "COVERAGE_INFORMATION",
      input: {
        title: "Nine pages were scanned",
        description: "Technical analysis covered nine pages.",
        severity: FindingSeverity.INFO,
      },
    },
    {
      expected: "VERIFIED_TECHNICAL_ISSUE",
      input: {
        title: "Meta description is missing",
        description: "The measured homepage description length is 0.",
        severity: FindingSeverity.MEDIUM,
      },
    },
    {
      expected: "AI_REVIEWED_OPPORTUNITY",
      input: {
        title: "Clarify the ordering process",
        description: "The customer instructions may create friction.",
        severity: FindingSeverity.MEDIUM,
        sourceType: "ai_reviewed_opportunity",
      },
    },
  ];

  for (const item of cases) {
    assert.equal(classifyAuditFindingType(item.input), item.expected);
  }
});

test("content-quality checks surface controlled copy, thin, duplicate, and ordering signals", () => {
  const copy = detectCopyQualityIssues({
    url: menuUrl,
    text: "Please recieve your your order confirmation before pickup.",
  });
  assert(copy.some((item) => item.issueType === "LIKELY_SPELLING"));
  assert(copy.some((item) => item.issueType === "DUPLICATED_WORD"));
  assert.equal(
    detectCopyQualityIssues({
      url: menuUrl,
      text: "Just Pie presents PIE POCKETS by @justpie.",
    }).length,
    0,
  );

  assert.equal(
    assessThinContent({
      mainContentWordCount: 15,
      pageTypes: ["Product"],
    }).status,
    "EMPTY",
  );

  const repeatedContent =
    "Fresh seasonal pastry pockets are prepared in small batches for preorder pickup and local delivery. ".repeat(
      8,
    );
  const duplicateGroups = detectDuplicateContentGroups([
    {
      url: "https://example.com/products/apple",
      content: repeatedContent,
      contentHash: "same",
      mainContentWordCount: 96,
    },
    {
      url: "https://example.com/products/cherry",
      content: repeatedContent,
      contentHash: "same",
      mainContentWordCount: 96,
    },
  ]);
  assert.equal(duplicateGroups.length, 1);
  assert.equal(duplicateGroups[0]?.reason, "EXACT_MAIN_CONTENT");

  const process = analyzeConversionProcess({
    text: "First email your name, phone, flavor, quantity, pickup date, and pickup time. Then wait for confirmation. We will send an invoice and payment link.",
    formLabels: [],
    actionTypes: ["Order / Inquiry"],
  });
  assert.equal(process.conversionMethod, "EMAIL");
  assert.equal(process.formAvailable, false);
  assert.equal(process.externalInvoice, true);
  assert.equal(process.delayedConfirmation, true);
  assert.match(process.frictionLevel, /MODERATE|HIGH/);
});

test("coverage reconciliation rejects impossible selected/completed totals", () => {
  const facts = normalizedFacts();
  facts.coverage.aiContent.selectedPages = 2;
  facts.coverage.aiContent.completedPages = 3;

  const result = validateAuditConsistency({
    facts,
    businessName: "Sample Bakery",
    summary: "Saved evidence was analyzed.",
    findings: [],
    recommendations: [],
    generatedAt,
  });

  assert.equal(result.snapshot.publishable, false);
  assert(
    result.snapshot.issues.some(
      (item) => item.code === "COVERAGE_TOTAL_MISMATCH",
    ),
  );
});

test("audit comparison prefers normalized profile coverage over conflicting legacy fields", () => {
  const previousFacts = normalizedFacts();
  const currentFacts = structuredClone(previousFacts);
  previousFacts.profiles.userConfirmedSocialProfiles = 1;
  currentFacts.profiles.userConfirmedSocialProfiles = 3;

  const previous = comparisonAudit({
    id: "previous",
    socialScore: 30,
    facts: previousFacts,
    legacyConfirmedSocialProfiles: 99,
  });
  const current = comparisonAudit({
    id: "current",
    socialScore: 48,
    facts: currentFacts,
    legacyConfirmedSocialProfiles: 77,
  });
  const comparison = compareAudits({
    currentAudit: current,
    previousAudit: previous,
  });
  const socialChange = comparison.categoryScoreChanges.find(
    (item) => item.category === ScoreCategory.SOCIAL,
  );

  assert.match(
    socialChange?.reason ?? "",
    /changed from 1 to 3/i,
  );
  assert.doesNotMatch(socialChange?.reason ?? "", /99|77/);
});

function normalizedFacts(): NormalizedAuditFacts {
  const coverage: AuditCoverageV2 = {
    version: "audit-coverage-v2",
    crawl: {
      eligiblePages: 3,
      successfulPages: 3,
      failedPages: 0,
      excludedPages: 0,
      crawlLimit: 10,
      crawlLimitReached: false,
      status: "COMPLETE_FOR_ELIGIBLE_CRAWLED_PAGES",
      explanation:
        "Three eligible canonical pages discovered within the crawl scope were analyzed.",
    },
    technical: {
      pagesAnalyzed: 3,
      status: "COMPLETE",
      explanation: "Three fetched pages were analyzed.",
    },
    aiContent: {
      selectedPages: 3,
      completedPages: 3,
      failedPages: 0,
      deterministicOnlyPages: 0,
      status: "COMPLETE_FOR_SELECTED_PAGES",
      explanation: "Three of three selected pages completed AI review.",
    },
    socialProfiles: {
      userConfirmed: 1,
      publiclyDetected: 3,
      pending: 2,
      contentAnalyzed: 0,
      status: "PROFILE_ONLY",
      explanation:
        "Profile presence was assessed; posts and performance were not analyzed.",
    },
    reviews: {
      listingConfirmed: true,
      ratingAvailable: false,
      countAvailable: false,
      status: "LIMITED",
      explanation:
        "Listing presence was confirmed, but rating and review count were unavailable.",
    },
    competitors: {
      configured: false,
      analyzed: false,
      status: "NOT_CONFIGURED",
      explanation: "No competitors were configured.",
    },
  };

  return {
    version: "normalized-audit-facts-v3",
    generatedAt,
    businessModel: {
      model: "COTTAGE_FOOD",
      locationStatus: "NO_PUBLIC_LOCATION",
      confidence: "HIGH",
      evidence: [
        "Business Context describes a home-based preorder business.",
      ],
    },
    homepage: {
      url: homepageUrl,
      title: {
        value: "Home | Sample Bakery",
        length: 20,
        status: "TOO_SHORT",
        confidence: "HIGH",
      },
      metaDescription: {
        value: null,
        length: 0,
        status: "MISSING",
        confidence: "HIGH",
      },
      h1: {
        count: 1,
        values: ["PIE POCKETS"],
        status: "GOOD",
        confidence: "HIGH",
      },
      actions: {
        detectedTypes: ["Order / Inquiry", "Email"],
        conversionLinks: ["Order Inquiries", "Email"],
        contactActions: [],
        emailActions: ["Email"],
        orderActions: ["Order Inquiries"],
        bookingActions: [],
        newsletterActions: [],
        socialLinks: ["Instagram", "Facebook", "TikTok"],
        primaryCtaClarity: "NEEDS_IMPROVEMENT",
      },
    },
    siteWide: {
      analyzedPages: [
        {
          url: homepageUrl,
          titleLength: 20,
          metaDescriptionLength: 0,
          h1Count: 1,
        },
        {
          url: menuUrl,
          titleLength: 11,
          metaDescriptionLength: 0,
          h1Count: 0,
        },
        {
          url: "https://example.com/catering",
          titleLength: 18,
          metaDescriptionLength: 80,
          h1Count: 1,
        },
      ],
      pagesMissingTitles: [],
      pagesMissingMetaDescriptions: [
        { url: homepageUrl, length: 0 },
        { url: menuUrl, length: 0 },
      ],
      pagesMissingH1: [{ url: menuUrl, count: 0 }],
      pagesWithMultipleH1: [],
      thinPages: [],
      duplicateContentGroups: [],
      copyQualityFindings: [],
      orderingFrictionPages: [],
    },
    profiles: {
      userConfirmedPlatforms: ["Instagram"],
      userConfirmedSocialProfiles: 1,
      publiclyDetectedPlatforms: ["Facebook", "Instagram", "TikTok"],
      publiclyDetectedSocialProfiles: 3,
      additionalDetectedPlatforms: ["Facebook", "TikTok"],
      pendingPlatforms: ["Facebook", "TikTok"],
      pendingSocialProfiles: 2,
      profileContentAnalyzed: 0,
    },
    scoreEvidence: {
      categories: {
        [ScoreCategory.OVERALL]: {
          score: 49,
          confidence: "LOW",
          coverageStatus: "PARTIAL",
          evidenceCompleteness: 55,
          dataRequirementsMet: true,
          missingInputs: ["Review rating", "Review count"],
        },
        [ScoreCategory.WEBSITE]: {
          score: 62,
          confidence: "HIGH",
          coverageStatus: "COMPLETE_FOR_AVAILABLE_SCOPE",
          evidenceCompleteness: 100,
          dataRequirementsMet: true,
          missingInputs: [],
        },
        [ScoreCategory.SEO]: {
          score: 48,
          confidence: "HIGH",
          coverageStatus: "COMPLETE_FOR_AVAILABLE_SCOPE",
          evidenceCompleteness: 100,
          dataRequirementsMet: true,
          missingInputs: [],
        },
        [ScoreCategory.BRANDING]: {
          score: 54,
          confidence: "MEDIUM",
          coverageStatus: "PARTIAL",
          evidenceCompleteness: 65,
          dataRequirementsMet: true,
          missingInputs: [],
        },
        [ScoreCategory.SOCIAL]: {
          score: 32,
          confidence: "LOW",
          coverageStatus: "LIMITED",
          evidenceCompleteness: 30,
          dataRequirementsMet: false,
          missingInputs: ["Profile content"],
        },
        [ScoreCategory.REVIEWS]: {
          score: 48,
          confidence: "LOW",
          coverageStatus: "LIMITED",
          evidenceCompleteness: 25,
          dataRequirementsMet: false,
          missingInputs: ["rating", "review count"],
        },
        [ScoreCategory.COMPETITORS]: {
          score: null,
          confidence: "LOW",
          coverageStatus: "NOT_CONFIGURED",
          evidenceCompleteness: 0,
          dataRequirementsMet: false,
          missingInputs: ["Saved competitors"],
        },
      },
      social: {
        score: 32,
        scope: "PROFILE_COVERAGE",
        confidence: "LOW",
        performanceAnalyzed: false,
      },
      reviews: {
        score: 48,
        status: "INSUFFICIENT_DATA",
        confidence: "LOW",
        scope: "LISTING_PRESENCE",
        evidenceCompleteness: 25,
        dataRequirementsMet: false,
        missingInputs: ["rating", "review count"],
      },
    },
    coverage,
    scoreValues: {
      [ScoreCategory.WEBSITE]: 62,
      [ScoreCategory.SEO]: 48,
      [ScoreCategory.SOCIAL]: 32,
      [ScoreCategory.REVIEWS]: 48,
    },
  };
}

function websiteAnalysis(): WebsiteAnalysis {
  return {
    normalizedUrl: homepageUrl,
    pageTitle: "Sample Bakery",
    metaDescription: null,
    h1Count: 1,
    h1Text: ["Sample Bakery"],
    hasViewportMeta: true,
    hasCanonical: true,
    internalLinksCount: 4,
    externalLinksCount: 3,
    imageCount: 2,
    imagesMissingAltCount: 0,
    hasContactLink: true,
    hasPricingLink: false,
    hasBlogLink: false,
    hasSocialLinks: true,
    detectedSocialLinks: [
      "https://instagram.com/sample",
      "https://facebook.com/sample",
      "https://tiktok.com/@sample",
    ],
    detectedAddress: null,
    detectedPhone: null,
    detectedGoogleMapsLinks: [],
    detectedMapEmbeds: [],
    detectedLocalBusinessSchema: [],
    operatingHoursSignals: [],
    ctaCandidates: ["Order Inquiries"],
    actionSummary: classifyWebsiteActions({
      businessKind: "general",
      candidates: [
        { label: "Order Inquiries", href: "/order-inquiries" },
        { label: "Instagram", href: "https://instagram.com/sample" },
        { label: "Facebook", href: "https://facebook.com/sample" },
        { label: "TikTok", href: "https://tiktok.com/@sample" },
      ],
    }),
    warnings: ["Meta description is missing."],
    score: 68,
  };
}

function comparisonAudit({
  id,
  socialScore,
  facts,
  legacyConfirmedSocialProfiles,
}: {
  id: string;
  socialScore: number;
  facts: NormalizedAuditFacts;
  legacyConfirmedSocialProfiles: number;
}) {
  return {
    id,
    createdAt:
      id === "previous"
        ? new Date("2026-06-01T00:00:00.000Z")
        : new Date("2026-07-01T00:00:00.000Z"),
    overallScore: 50,
    scores: [
      {
        category: ScoreCategory.SOCIAL,
        platform: null,
        score: socialScore,
      },
    ],
    findings: [],
    recommendations: [
      {
        id: `${id}-recommendation`,
        title: "Confirm social profiles",
        description: "Confirm the profiles that belong to the business.",
        category: ScoreCategory.SOCIAL,
        status: RecommendationStatus.TODO,
        completedAt: null,
      },
    ],
    analysisSnapshot: {
      normalizedFacts: facts,
      scoringMetadata: {
        scoringEngineVersion: "growth-score-v4-data-sufficiency",
      },
      social: {
        confirmedProfilesCount: legacyConfirmedSocialProfiles,
      },
    },
  };
}

function finding({
  id,
  title,
  description,
  severity = FindingSeverity.MEDIUM,
  sourceUrl = null,
  sourceType = "deterministic",
}: {
  id: string;
  title: string;
  description: string;
  severity?: FindingSeverity;
  sourceUrl?: string | null;
  sourceType?: string | null;
}) {
  return {
    id,
    title,
    description,
    category: ScoreCategory.WEBSITE,
    severity,
    sourceUrl,
    sourceType,
    evidence: {},
  };
}

function recommendation({
  title,
  description,
  sourceUrl = null,
  issueKey,
  sourceType = "deterministic",
}: {
  title: string;
  description: string;
  sourceUrl?: string | null;
  issueKey: string;
  sourceType?: string;
}) {
  return {
    title,
    description,
    category: issueKey.includes("meta") || issueKey.includes("h1")
      ? ScoreCategory.SEO
      : ScoreCategory.WEBSITE,
    priority: RecommendationPriority.HIGH,
    estimatedEffort: "Low",
    expectedImpact: "High",
    sourceUrl,
    issueKey,
    sourceType,
    evidence: {},
  };
}

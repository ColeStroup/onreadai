import { PrismaPg } from "@prisma/adapter-pg";
import {
  AuditStatus,
  BusinessGoal,
  BusinessInputType,
  BusinessProfileSource,
  BusinessProfileStatus,
  BusinessStatus,
  FindingSeverity,
  Prisma,
  PrismaClient,
  ProfilePlatform,
  RecommendationPriority,
  ScoreCategory,
} from "@prisma/client";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

import { buildAuditAssessment } from "../src/lib/audits/audit-applicability";
import {
  evaluationCrawl,
} from "../src/lib/audits/selective-ai/__fixtures__/evaluation-pages";
import {
  selectPagesForAiReview,
} from "../src/lib/audits/selective-ai/page-selection";

const databaseUrl = process.env.PRODUCTION_FLOW_TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Selective AI browser test database is unavailable.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

let ownerId = "";
let otherUserId = "";
let businessId = "";
let ownerToken = "";
let otherUserToken = "";
let selectedPagesCount = 0;
let deepReviewedPagesCount = 0;

test.beforeAll(async () => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for browser tests.");

  const suffix = randomUUID();
  const [owner, otherUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `selective-ai-owner-${suffix}@example.test`,
        name: "Selective AI Owner",
        emailVerified: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        email: `selective-ai-other-${suffix}@example.test`,
        name: "Other Tenant",
        emailVerified: new Date(),
      },
    }),
  ]);
  ownerId = owner.id;
  otherUserId = otherUser.id;
  ownerToken = await sessionToken(owner, secret);
  otherUserToken = await sessionToken(otherUser, secret);

  const crawl = evaluationCrawl(75);
  const selection = selectPagesForAiReview({
    crawl,
    goals: [BusinessGoal.MORE_LEADS, BusinessGoal.IMPROVE_WEBSITE],
    primaryGoal: BusinessGoal.INCREASE_CONVERSIONS,
  });
  expect(selection.selectedPages.length).toBeGreaterThan(0);
  expect(selection.selectedPages.length).toBeLessThanOrEqual(24);
  expect(selection.selectedPages.map((page) => page.url)).toEqual(
    expect.arrayContaining([
      "https://example.test/",
      "https://example.test/services",
      "https://example.test/pricing",
      "https://example.test/contact",
    ]),
  );
  selectedPagesCount = selection.selectedPages.length;
  deepReviewedPagesCount = selectedPagesCount - 1;

  let selectedIndex = 0;
  const pages = selection.pages.map((page) => {
    if (!page.selected) return page;
    const index = selectedIndex;
    selectedIndex += 1;
    const failed = index === 0;
    const cacheHit = !failed && index <= 6;
    return {
      ...page,
      analysisCoverage: failed
        ? ("DETERMINISTIC_ONLY" as const)
        : ("DEEP_AI_REVIEWED" as const),
      aiReviewStatus: failed
        ? ("FAILED" as const)
        : cacheHit
          ? ("CACHE_HIT" as const)
          : ("COMPLETED" as const),
      cacheStatus: failed
        ? ("MISS" as const)
        : cacheHit
          ? ("HIT" as const)
          : ("MISS" as const),
    };
  });
  const storedCrawl = {
    ...crawl,
    pageResults: crawl.pageResults.map((page) => {
      const storedPage = { ...page };
      delete storedPage.analysisContent;
      return storedPage;
    }),
  };
  const profiles = [
    {
      platform: ProfilePlatform.WEBSITE,
      status: BusinessProfileStatus.CONFIRMED,
      url: "https://example.test/",
    },
  ];
  const assessment = buildAuditAssessment({
    profiles,
    competitorComparisonAvailable: false,
  });
  const analysisSnapshot = {
    assessment,
    website: websiteSnapshot(),
    websiteCrawl: storedCrawl,
    seo: seoSnapshot(),
    aiAssistedAnalysis: {
      version: "selective-ai-audit-v1",
      enabled: true,
      status: "PARTIAL",
      generatedAt: new Date().toISOString(),
      selectorVersion: "selective-page-selection-v1",
      pageAnalysisPromptVersion: "audit-page-analysis-prompt-v1",
      pageAnalysisSchemaVersion: "audit-page-analysis-schema-v1",
      synthesisPromptVersion: "audit-synthesis-prompt-v1",
      synthesisSchemaVersion: "audit-synthesis-schema-v1",
      modelRoutingVersion: "ai-model-routing-v1",
      coverage: {
        pagesCheckedTechnically: 75,
        eligiblePages: selection.eligiblePages,
        selectedPages: selectedPagesCount,
        deepReviewedPages: deepReviewedPagesCount,
        deterministicOnlyPages: pages.filter(
          (page) => page.analysisCoverage === "DETERMINISTIC_ONLY",
        ).length,
        excludedUtilityPages: pages.filter(
          (page) => page.analysisCoverage === "EXCLUDED_UTILITY_PAGE",
        ).length,
        duplicateRepresentatives: pages.filter(
          (page) => page.analysisCoverage === "DUPLICATE_REPRESENTATIVE",
        ).length,
        crawlFailedPages: 0,
        failedAiPages: 1,
        truncatedPages: 0,
        cacheHits: Math.min(6, deepReviewedPagesCount),
        cacheMisses:
          selectedPagesCount - Math.min(6, deepReviewedPagesCount),
        cacheHitRate: Math.round(
          (Math.min(6, deepReviewedPagesCount) / selectedPagesCount) * 100,
        ),
        limitations: [
          "One selected page was unavailable for deep review; deterministic checks still completed.",
        ],
      },
      pages,
      selectedPageAnalyses: [],
      synthesis: null,
      synthesisSource: "DETERMINISTIC_FALLBACK",
    },
  } satisfies Prisma.InputJsonObject;

  const business = await prisma.business.create({
    data: {
      ownerId,
      name: "Selective AI Test Company",
      initialInput: "https://example.test/",
      inputType: BusinessInputType.WEBSITE,
      websiteUrl: "https://example.test/",
      status: BusinessStatus.ACTIVE,
      goals: [BusinessGoal.MORE_LEADS, BusinessGoal.IMPROVE_WEBSITE],
      primaryGoal: BusinessGoal.INCREASE_CONVERSIONS,
      description:
        "A practical consultancy helping small businesses improve customer conversion paths.",
      targetAudience: "Small business owners",
      mainOffer: "A focused growth consultation",
      industry: "Consulting",
      businessType: "Professional service",
      primaryConversionGoal: "Request a consultation",
      brandTone: "Clear and practical",
      contextConfidence: 94,
      contextSource: "confirmed",
      contextConfirmedAt: new Date(),
      onboardingCompletedAt: new Date(),
      profiles: {
        create: {
          platform: ProfilePlatform.WEBSITE,
          url: "https://example.test/",
          normalizedUrl: "https://example.test/",
          displayName: "Selective AI Test Company",
          confidenceScore: 100,
          status: BusinessProfileStatus.CONFIRMED,
          source: BusinessProfileSource.SUBMITTED,
          isConfirmed: true,
          confirmedAt: new Date(),
        },
      },
    },
  });
  businessId = business.id;

  const audit = await prisma.audit.create({
    data: {
      businessId,
      status: AuditStatus.COMPLETED,
      progressStage: "PREPARING_RESULTS",
      overallScore: 68,
      summary:
        "The deterministic audit found a solid base and a focused conversion opportunity.",
      analysisSnapshot,
      startedAt: new Date(),
      completedAt: new Date(),
      scores: {
        create: [
          { category: ScoreCategory.OVERALL, score: 68 },
          { category: ScoreCategory.WEBSITE, score: 64 },
          { category: ScoreCategory.SEO, score: 70 },
          { category: ScoreCategory.SOCIAL, score: 61 },
          { category: ScoreCategory.BRANDING, score: 72 },
          { category: ScoreCategory.REVIEWS, score: 58 },
        ],
      },
      findings: {
        create: [
          {
            category: ScoreCategory.SEO,
            severity: FindingSeverity.MEDIUM,
            title: "One page is missing a meta description",
            description:
              "The crawler measured one scanned page without a meta description.",
            sourceUrl: "https://example.test/services",
          },
          {
            category: ScoreCategory.WEBSITE,
            severity: FindingSeverity.HIGH,
            title: "The consultation action could be more specific",
            description:
              "The current action is visible, but its label does not explain the consultation step.",
            sourceUrl: "https://example.test/",
            evidence: aiEvidence(),
          },
        ],
      },
    },
  });

  await prisma.recommendation.createMany({
    data: [
      {
        businessId,
        auditId: audit.id,
        title: "Clarify the consultation action",
        description:
          "Rename the primary action so visitors know they are requesting a consultation.",
        category: ScoreCategory.WEBSITE,
        priority: RecommendationPriority.HIGH,
        estimatedEffort: "Low",
        expectedImpact: "High",
        sourceType: "ai_reviewed_opportunity",
        sourceReferenceId: "aiopp_browser_fixture",
        sourceUrl: "https://example.test/",
        evidence: aiEvidence(),
        sortOrder: 1,
      },
      {
        businessId,
        auditId: audit.id,
        title: "Write the missing page description",
        description:
          "Add a concise meta description to the measured service page.",
        category: ScoreCategory.SEO,
        priority: RecommendationPriority.HIGH,
        estimatedEffort: "Low",
        expectedImpact: "Medium",
        sourceType: "verified_technical_issue",
        sourceUrl: "https://example.test/services",
        sortOrder: 2,
      },
      {
        businessId,
        auditId: audit.id,
        title: "Review the primary offer path",
        description:
          "Keep the homepage and service-page next steps consistent.",
        category: ScoreCategory.BRANDING,
        priority: RecommendationPriority.MEDIUM,
        estimatedEffort: "Medium",
        expectedImpact: "Medium",
        sortOrder: 3,
      },
    ],
  });
});

test.afterAll(async () => {
  if (ownerId || otherUserId) {
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, otherUserId].filter(Boolean) } },
    });
  }
  await prisma.$disconnect();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is unavailable.");
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: ownerToken,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});

test("historical selective analysis renders accurate coverage and source labels", async ({
  page,
}) => {
  await page.goto(`/dashboard/businesses/${businessId}/overview`);

  const coverageHeading = page.getByRole("heading", {
    name: "Analysis coverage",
  });
  await expect(coverageHeading).toBeVisible();
  const coverage = coverageHeading.locator("xpath=../../..");
  await expect(
    coverage.getByText("Checked technically").locator("..").getByText("75"),
  ).toBeVisible();
  await expect(
    coverage
      .getByText("Key pages reviewed by AI")
      .locator("..")
      .getByText(String(deepReviewedPagesCount)),
  ).toBeVisible();
  await expect(
    coverage
      .getByText("Technical + site-wide only")
      .locator("..")
      .getByText(String(75 - deepReviewedPagesCount)),
  ).toBeVisible();
  await expect(
    coverage.getByText("6 unchanged page reviews were reused."),
  ).toBeVisible();
  await expect(
    coverage.getByText(
      "1 selected page was unavailable for deep review; deterministic checks still completed.",
    ),
  ).toBeVisible();

  await expect(
    page.getByText("AI-reviewed opportunity", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Verified technical issue", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("https://example.test/", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("High confidence", { exact: true }).first()).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("another tenant cannot open the selective audit report", async ({
  context,
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is unavailable.");
  await context.clearCookies();
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: otherUserToken,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const response = await page.goto(`/dashboard/businesses/${businessId}/overview`);
  expect(response?.status()).toBe(404);
});

function aiEvidence() {
  return {
    findingType: "AI_REVIEWED_OPPORTUNITY",
    confidence: "HIGH",
    evidence: [
      {
        sourceUrl: "https://example.test/",
        excerpt: "Get started today",
      },
    ],
    businessImpact:
      "A more specific action may reduce uncertainty at the decision point.",
    suggestedAction:
      "Rename the action to describe the consultation request clearly.",
  };
}

function websiteSnapshot() {
  return {
    normalizedUrl: "https://example.test/",
    pageTitle: "Selective AI Test Company",
    metaDescription:
      "Practical consultation for small businesses improving conversion paths.",
    h1Count: 1,
    h1Text: ["Build a clearer path to growth"],
    hasViewportMeta: true,
    hasCanonical: true,
    internalLinksCount: 18,
    externalLinksCount: 2,
    imageCount: 8,
    imagesMissingAltCount: 1,
    hasContactLink: true,
    hasPricingLink: true,
    hasBlogLink: true,
    hasSocialLinks: false,
    detectedSocialLinks: [],
    detectedAddress: null,
    detectedPhone: null,
    detectedGoogleMapsLinks: [],
    detectedMapEmbeds: [],
    detectedLocalBusinessSchema: [],
    operatingHoursSignals: [],
    ctaCandidates: ["Get started today"],
    actionSummary: {
      hasDetectedActionLinks: true,
      detectedActionLinkCount: 1,
      detectedActionTypes: ["Get started today"],
      detectedActionLinks: [
        {
          label: "Get started today",
          href: "/contact",
          actionType: "Get started today",
          elementType: "a",
          domLocation: "hero",
          buttonLike: true,
          nearPrimaryHeading: true,
          navigationLike: false,
          prominenceScore: 9,
        },
      ],
      primaryCtaAssessment: {
        clarity: "NEEDS_IMPROVEMENT",
        primaryCtaText: "Get started today",
        primaryCtaType: "Get started today",
        evidence: [
          "A button-like action appears near the primary heading, but its next step is broad.",
        ],
        confidence: "HIGH",
        assessmentMethod: "STATIC_HTML_STRUCTURE",
        assessed: true,
      },
      primaryActions: ["Get started today"],
      secondaryNavigation: ["Services", "About"],
      socialLinks: [],
      eventLinks: [],
      utilityLinks: [],
      rawCandidates: ["Get started today"],
    },
    warnings: ["One image is missing alt text."],
    score: 64,
  };
}

function seoSnapshot() {
  return {
    score: 70,
    titleStatus: "good",
    titleLength: 25,
    metaDescriptionStatus: "good",
    metaDescriptionLength: 76,
    h1Status: "good",
    canonicalStatus: "good",
    viewportStatus: "good",
    robotsTxtStatus: "found",
    sitemapStatus: "found",
    indexabilityWarnings: [],
    seoWarnings: ["One scanned page is missing a meta description."],
    seoStrengths: ["The homepage title and H1 are present."],
    recommendedFixes: ["Write the missing service-page description."],
  };
}

async function sessionToken(
  user: { id: string; name: string | null; email: string | null },
  secret: string,
) {
  return encode({
    secret,
    token: {
      id: user.id,
      sub: user.id,
      name: user.name,
      email: user.email,
    },
  });
}

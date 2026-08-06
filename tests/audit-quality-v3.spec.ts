import { PrismaPg } from "@prisma/adapter-pg";
import {
  AuditStatus,
  BusinessInputType,
  BusinessProfileSource,
  BusinessProfileStatus,
  BusinessStatus,
  ComplimentaryEntitlementSource,
  PlanType,
  Prisma,
  PrismaClient,
  ProfilePlatform,
} from "@prisma/client";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { encode } from "next-auth/jwt";

import { createJustPieCanonicalReportFixture } from "../src/lib/reports/just-pie-report-fixture.test-support";

const databaseUrl = process.env.PRODUCTION_FLOW_TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("Production flow test database is unavailable.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const reportFixture = createJustPieCanonicalReportFixture();
const fixtureCompletedAt =
  reportFixture.audit.completedAt ?? reportFixture.audit.date;
const runId = randomUUID();
let userId = "";
let adminId = "";
let businessId = "";
let auditId = "";
let sessionToken = "";

test.beforeAll(async () => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret)
    throw new Error("NEXTAUTH_SECRET is required for browser tests.");

  const admin = await prisma.user.create({
    data: {
      email: `audit-quality-admin-${runId}@example.test`,
      name: "Audit Quality Admin",
      emailVerified: new Date(),
      role: "ADMIN",
    },
  });
  adminId = admin.id;

  const user = await prisma.user.create({
    data: {
      email: `audit-quality-${runId}@example.test`,
      name: "Audit Quality Test",
      emailVerified: new Date(),
    },
  });
  userId = user.id;
  sessionToken = await encode({
    secret,
    token: {
      id: user.id,
      sub: user.id,
      name: user.name,
      email: user.email,
    },
  });

  await prisma.complimentaryEntitlement.create({
    data: {
      userId,
      plan: PlanType.PRO,
      source: ComplimentaryEntitlementSource.INTERNAL,
      reason: "Isolated audit-quality browser regression.",
      startsAt: new Date(Date.now() - 60_000),
      grantedByUserId: adminId,
    },
  });

  const business = await prisma.business.create({
    data: {
      id: reportFixture.business.id,
      ownerId: userId,
      name: reportFixture.business.name,
      initialInput: reportFixture.business.initialInput,
      inputType: BusinessInputType.WEBSITE,
      websiteUrl: reportFixture.business.initialInput,
      status: BusinessStatus.ACTIVE,
      goals: reportFixture.business.selectedGoals,
      primaryGoal: reportFixture.business.primaryGoal,
      description: reportFixture.business.context.description,
      targetAudience: reportFixture.business.context.targetAudience,
      mainOffer: reportFixture.business.context.mainOffer,
      industry: reportFixture.business.context.industry,
      businessType: reportFixture.business.context.businessType,
      primaryConversionGoal:
        reportFixture.business.context.observedPrimaryConversionGoal,
      brandTone: reportFixture.business.context.brandTone,
      contextConfidence: 96,
      contextSource: "user_confirmed",
      contextConfirmedAt: fixtureCompletedAt,
      onboardingCompletedAt: fixtureCompletedAt,
    },
  });
  businessId = business.id;

  await prisma.businessProfile.createMany({
    data: [
      {
        businessId,
        platform: ProfilePlatform.WEBSITE,
        url: reportFixture.business.initialInput,
        normalizedUrl: reportFixture.business.initialInput,
        confidenceScore: 100,
        status: BusinessProfileStatus.CONFIRMED,
        source: BusinessProfileSource.SUBMITTED,
        isConfirmed: true,
        confirmedAt: fixtureCompletedAt,
      },
      {
        businessId,
        platform: ProfilePlatform.INSTAGRAM,
        url: "https://instagram.com/justpieorlando",
        normalizedUrl: "https://instagram.com/justpieorlando",
        handle: "@justpieorlando",
        confidenceScore: 100,
        status: BusinessProfileStatus.CONFIRMED,
        source: BusinessProfileSource.SUBMITTED,
        isConfirmed: true,
        confirmedAt: fixtureCompletedAt,
      },
      {
        businessId,
        platform: ProfilePlatform.GOOGLE_BUSINESS,
        url: "https://maps.google.com/?cid=audit-quality-fixture",
        normalizedUrl: "https://maps.google.com/?cid=audit-quality-fixture",
        confidenceScore: 96,
        status: BusinessProfileStatus.CONFIRMED,
        source: BusinessProfileSource.DISCOVERED,
        isConfirmed: true,
        confirmedAt: fixtureCompletedAt,
      },
    ],
  });

  await prisma.googleBusinessProfile.create({
    data: {
      businessId,
      googlePlaceId: `audit-quality-${runId}`,
      displayName: reportFixture.business.name,
      googleMapsUri: "https://maps.google.com/?cid=audit-quality-fixture",
      rating: null,
      reviewCount: null,
      matchConfidence: 96,
      status: "confirmed",
      source: "places_api",
      confirmedAt: fixtureCompletedAt,
    },
  });

  await prisma.socialStrategy.create({
    data: {
      businessId,
      platformRecommendations: jsonValue(
        reportFixture.socialStrategy.data.recommendedPlatforms,
      ),
      contentPillars: jsonValue(
        reportFixture.socialStrategy.data.contentPillars,
      ),
      weeklyPlan: jsonValue(reportFixture.socialStrategy.data.weeklyPlan),
      suggestedPosts: jsonValue(
        reportFixture.socialStrategy.data.suggestedPosts,
      ),
      conversionTips: jsonValue(
        reportFixture.socialStrategy.data.conversionTips,
      ),
      competitorOpportunities: jsonValue(
        reportFixture.socialStrategy.data.competitorOpportunities,
      ),
      confidence: reportFixture.socialStrategy.data.confidence,
      source: "deterministic_fallback",
      reasoningSummary: reportFixture.socialStrategy.data.reasoningSummary,
    },
  });

  const canonicalRecommendations = reportFixture.recommendations.all.map(
    (recommendation, index) => ({
      issueKey: `audit-quality:${index}:${recommendation.title
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")}`,
      rootCauseKey: recommendation.title
        .toUpperCase()
        .replaceAll(/[^A-Z0-9]+/g, "_"),
      sourceFindingId: null,
      sourceFindingIds: [],
      sourceEvidenceIds: [],
      affectedUrls: recommendation.sourceUrl ? [recommendation.sourceUrl] : [],
      sourceTypes: ["deterministic"],
      findingType: recommendation.technical
        ? ("VERIFIED_TECHNICAL_ISSUE" as const)
        : ("AI_REVIEWED_OPPORTUNITY" as const),
      sourceCategory: recommendation.category,
      recommendationType: "audit_action",
      fullEvidence: recommendation.evidenceSummary,
      reportEvidence: recommendation.evidenceSummary,
      evidenceConfidence:
        recommendation.confidence === "High"
          ? ("HIGH" as const)
          : recommendation.confidence === "Medium"
            ? ("MEDIUM" as const)
            : ("LOW" as const),
      generatedAt: fixtureCompletedAt.toISOString(),
      generatorVersion: "audit-quality-v3-playwright-fixture",
      title: recommendation.title,
      description: recommendation.description,
      category: recommendation.category,
      priority: recommendation.priority,
      estimatedEffort: recommendation.estimatedEffort,
      expectedImpact: recommendation.expectedImpact,
    }),
  );

  const analysisSnapshot = jsonValue({
    website: reportFixture.website,
    websiteCrawl: reportFixture.websiteCrawl,
    seo: reportFixture.seo,
    social: reportFixture.social,
    reviews: reportFixture.reviews,
    assessment: reportFixture.assessment,
    normalizedFacts: reportFixture.normalizedFacts,
    coverage: reportFixture.coverage,
    scoringMetadata: reportFixture.scoringMetadata,
    evidenceIntegrity: {
      ...reportFixture.evidenceIntegrity,
      canonicalRecommendations,
    },
    canonicalAuditReport: reportFixture.canonicalReport,
  });

  const audit = await prisma.audit.create({
    data: {
      id: reportFixture.audit.id,
      businessId,
      status: AuditStatus.COMPLETED,
      overallScore: reportFixture.audit.overallScore,
      summary: reportFixture.audit.executiveSummary,
      analysisSnapshot,
      startedAt: reportFixture.audit.date,
      completedAt: fixtureCompletedAt,
      createdAt: reportFixture.audit.date,
    },
  });
  auditId = audit.id;

  await prisma.auditScore.createMany({
    data: [
      {
        auditId,
        category: "OVERALL",
        label: "Overall",
        score: reportFixture.audit.overallScore,
      },
      ...reportFixture.scores.flatMap((score) =>
        score.score === null
          ? []
          : [
              {
                auditId,
                category: score.category,
                label: score.label,
                score: score.score,
              },
            ],
      ),
    ],
  });

  await prisma.auditFinding.createMany({
    data: reportFixture.findings.all.map((finding) => ({
      id: finding.id,
      auditId,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      sourceUrl: finding.sourceUrl,
      evidence: jsonValue({
        findingType: finding.findingType,
        confidence: finding.confidence,
        evidenceSummary: finding.evidenceSummary,
      }),
    })),
  });

  await prisma.recommendation.createMany({
    data: reportFixture.recommendations.all.map((recommendation, index) => ({
      id: recommendation.id,
      businessId,
      auditId,
      title: recommendation.title,
      description: recommendation.description,
      category: recommendation.category,
      priority: recommendation.priority,
      status: recommendation.status,
      estimatedEffort: recommendation.estimatedEffort,
      expectedImpact: recommendation.expectedImpact,
      sortOrder: index,
      sourceType: "audit_evidence",
      sourceUrl: recommendation.sourceUrl,
      evidence: jsonValue(canonicalRecommendations[index]),
    })),
  });
});

test.afterAll(async () => {
  if (userId) {
    await prisma.user.delete({ where: { id: userId } });
  }
  if (adminId) {
    await prisma.user.delete({ where: { id: adminId } });
  }
  await prisma.$disconnect();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error("Playwright baseURL is unavailable.");
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: sessionToken,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});

test("Just Pie dashboard, Presentation, and PDF preserve one canonical evidence set", async ({
  page,
}) => {
  await page.goto(`/dashboard/businesses/${businessId}/overview`, {
    waitUntil: "networkidle",
  });

  await expect(
    page.getByRole("heading", { name: "Your website growth priorities" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Next two actions" }),
  ).toBeVisible();
  const savedActionTitles = [
    "Make the homepage title more descriptive",
    "Write page-specific meta descriptions",
    "Add a main heading to Menu",
    "Prioritize the preorder action",
    "Add alt text to merchandise images",
  ];
  const overviewPriorityTitles: string[] = [];
  for (const title of savedActionTitles) {
    const count = await page.getByRole("heading", { name: title }).count();
    expect(
      count,
      `${title} should appear at most once on Overview`,
    ).toBeLessThanOrEqual(1);
    if (count === 1) overviewPriorityTitles.push(title);
  }
  expect(overviewPriorityTitles).toHaveLength(3);
  expect(new Set(overviewPriorityTitles).size).toBe(3);

  await expect(
    page.locator('[aria-label^="Website Growth Score "]'),
  ).toBeVisible();
  await expect(page.getByText("Social Score", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Reviews Score", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Competitor Intelligence", { exact: true }),
  ).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page.goto(`/dashboard/businesses/${businessId}/website`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: /Technical diagnostics/i }).click();
  await expect(
    page.getByText(/Homepage H1:\s*Handcrafted pie pockets in Orlando/),
  ).toBeVisible();

  await page.goto(`/dashboard/businesses/${businessId}/action-plan`, {
    waitUntil: "networkidle",
  });
  const allActions = page.getByRole("button", { name: /All actions/i });
  await allActions.click();
  await expect(allActions).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("heading", {
      name: "Add a main heading to Menu",
    }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/Add a clear main headline to (?:the )?homepage/i),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("heading", {
        name: "Correct visible copy errors across key customer pages",
      })
      .first(),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("heading", { name: "Add alt text to merchandise images" })
      .first(),
  ).toBeVisible();

  for (const title of savedActionTitles) {
    expect(
      await prisma.recommendation.count({
        where: { businessId, auditId, title },
      }),
    ).toBe(1);
  }
  expect(
    await prisma.recommendation.count({
      where: {
        businessId,
        auditId,
        title: "Correct visible copy errors across key customer pages",
      },
    }),
  ).toBe(0);

  await page.goto(`/dashboard/businesses/${businessId}/social?view=strategy`, {
    waitUntil: "networkidle",
  });
  await expect(
    page.getByRole("heading", {
      name: "Social Growth is not part of the launch product",
    }),
  ).toBeVisible();

  await page.goto(`/dashboard/businesses/${businessId}/overview`, {
    waitUntil: "networkidle",
  });

  await page.goto(
    `/dashboard/businesses/${businessId}/audit/${auditId}/present`,
    { waitUntil: "domcontentloaded" },
  );
  const coverSlide = page.getByRole("main", {
    name: "Audit presentation: Cover",
  });
  await expect(coverSlide).toBeVisible();
  await expect(
    coverSlide.getByRole("heading", { name: "Just Pie Orlando" }),
  ).toBeVisible();
  await expect(
    page.locator("[data-presentation-canvas] > div"),
  ).toHaveCSS("opacity", "1");
  await mkdir(".artifacts/launch-flow", { recursive: true });
  await page.screenshot({
    path: ".artifacts/launch-flow/just-pie-presentation-cover.png",
  });
  await page
    .getByRole("button", { name: /Go to slide \d+: Top Priorities/ })
    .click();
  await expect(
    page.getByRole("main", { name: "Audit presentation: Top Priorities" }),
  ).toBeVisible();
  for (const title of overviewPriorityTitles) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(
    page.locator("[data-presentation-canvas] > div"),
  ).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: ".artifacts/launch-flow/just-pie-presentation-priorities.png",
  });

  await page.goto(`/dashboard/businesses/${businessId}/overview`, {
    waitUntil: "networkidle",
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^growth-audit-just-pie-orlando-\d{4}-\d{2}-\d{2}\.pdf$/,
  );
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const pdfText = await extractPdfText(Buffer.concat(chunks));

  expect(pdfText).toMatch(
    /Main headline \(H1\)\s+Handcrafted pie pockets in Orlando/,
  );
  expect(pdfText).toContain("The analyzed Menu page has an H1 count of 0.");
  expect(pdfText).toContain("Pages missing meta descriptions   4");
  expect(pdfText).toContain(
    "The Merchandise Shop contains 13 images, and 8 are missing alt text. The Order Inquiries page has 0 images missing alt text.",
  );
  expect(pdfText).not.toMatch(/five (?:important )?pages are missing meta descriptions/i);
  expect(pdfText).toContain("Website Growth Score");
  expect(pdfText).not.toMatch(/User-confirmed social profiles/i);
  expect(pdfText).not.toMatch(/Publicly detected social profiles/i);
  expect(pdfText).not.toMatch(/Profile content analyzed/i);
  expect(pdfText).not.toMatch(/rating and review count/i);
  expect(pdfText).not.toContain(
    "Correct visible copy errors across key customer pages",
  );
  for (const title of overviewPriorityTitles) {
    expect(pdfText).toContain(title);
  }
  expect(pdfText).not.toMatch(
    /add a clear main headline to (?:the )?homepage/i,
  );
});

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function extractPdfText(buffer: Buffer) {
  const document = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const pdfPage = await document.getPage(pageNumber);
    const content = await pdfPage.getTextContent();
    pages.push(
      content.items
        .flatMap((item) => ("str" in item ? [item.str] : []))
        .join(" "),
    );
  }

  return pages.join("\n");
}

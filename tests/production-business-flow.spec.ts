import AxeBuilder from "@axe-core/playwright";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AuditStatus,
  BusinessProfileStatus,
  PlanType,
  PrismaClient,
  ProfilePlatform,
  ScoreCategory,
  SubscriptionStatus,
} from "@prisma/client";
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

const databaseUrl = process.env.PRODUCTION_FLOW_TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("Production flow test database is unavailable.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const artifactRoot = path.join(process.cwd(), ".artifacts", "launch-flow");

let userId = "";
let emptyBusinessId = "";
let sessionToken = "";

test.beforeAll(async () => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret)
    throw new Error("NEXTAUTH_SECRET is required for browser tests.");

  const user = await prisma.user.create({
    data: {
      email: `production-flow-${randomUUID()}@example.test`,
      name: "Website Growth Test",
      emailVerified: new Date(),
      subscriptions: {
        create: {
          plan: PlanType.PRO,
          status: SubscriptionStatus.ACTIVE,
          stripeSubscriptionId: `sub_launch_${randomUUID()}`,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        },
      },
      businesses: {
        create: {
          name: "No Audit Website",
          initialInput: "https://no-audit.example/",
          websiteUrl: "https://no-audit.example/",
        },
      },
    },
    include: { businesses: true },
  });
  userId = user.id;
  emptyBusinessId = user.businesses[0]!.id;
  sessionToken = await encode({
    secret,
    token: {
      id: user.id,
      sub: user.id,
      name: user.name,
      email: user.email,
    },
  });
  await mkdir(artifactRoot, { recursive: true });
});

test.afterAll(async () => {
  if (userId) await prisma.user.delete({ where: { id: userId } });
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

test("a verified user completes the focused website growth workflow", async ({
  page,
}) => {
  test.setTimeout(300_000);

  await page.goto(`/dashboard/businesses/${emptyBusinessId}/overview`);
  await expect(
    page.getByRole("heading", {
      name: "Finish setup to see your website priorities",
    }),
  ).toBeVisible();
  await expect(page.getByText("No website audit yet")).toBeVisible();
  await page.screenshot({
    path: path.join(artifactRoot, "overview-no-audit.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.goto("/dashboard/businesses/new");
  await expect(
    page.getByRole("heading", { name: "Start your website growth workspace" }),
  ).toBeVisible();
  await expect(page.getByLabel("Website URL")).toHaveAttribute("required", "");
  await expect(page.getByText(/social profile/i)).toHaveCount(0);
  await page.screenshot({
    path: path.join(artifactRoot, "onboarding-new-business.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.getByLabel("Business name").fill("Website Growth Fixture");
  await page.getByLabel("Website URL").fill("https://example.com/");
  await page.getByRole("button", { name: "Continue setup" }).click();
  await expect(page).toHaveURL(
    /\/dashboard\/businesses\/[^/]+\/setup\?step=profiles$/,
  );

  const businessId = new URL(page.url()).pathname.split("/")[3]!;
  await expect(
    page.getByRole("heading", { name: "Confirm your website" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Only this source is used for the launch Website Growth Score.",
    ),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifactRoot, "onboarding-confirm-website.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText("Website confirmed", { exact: true }),
  ).toBeVisible();

  await prisma.business.update({
    where: { id: businessId },
    data: {
      description:
        "A small business using its website to explain services and generate qualified inquiries.",
      targetAudience: "Prospective customers comparing service providers.",
      mainOffer: "Professional services delivered after a qualified inquiry.",
      industry: "Professional services",
      businessType: "Service business",
      primaryConversionGoal: "Generate qualified contact inquiries.",
      brandTone: "Clear, practical, and trustworthy",
      contextConfidence: 100,
      contextSource: "user_confirmed",
      contextConfirmedAt: new Date(),
    },
  });

  await page.goto(`/dashboard/businesses/${businessId}/setup?step=context`);
  await expect(page.getByText("Confirmed context")).toBeVisible();
  await page.screenshot({
    path: path.join(artifactRoot, "onboarding-context.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.goto(`/dashboard/businesses/${businessId}/setup?step=goals`);
  await expect(
    page.getByRole("checkbox", { name: /Improve website/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Grow social media", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("checkbox", { name: /Improve website/ }).check();
  await page.locator('input[type="radio"][value="IMPROVE_WEBSITE"]').check();
  await page.screenshot({
    path: path.join(artifactRoot, "onboarding-goals.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(
    `/dashboard/businesses/${businessId}/setup?step=audit`,
  );
  await expect(
    page.getByText("Website and SEO", { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifactRoot, "onboarding-audit-ready.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page
    .getByRole("button", { name: "Run your first website audit" })
    .click();
  await expect(page).toHaveURL(/\/audit\/run\?auditId=/);
  await expect(
    page.getByRole("heading", { name: "Running your website audit" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifactRoot, "audit-running.png"),
    fullPage: true,
    animations: "disabled",
  });

  await expect
    .poll(
      async () =>
        (
          await prisma.audit.findFirst({
            where: { businessId },
            orderBy: { createdAt: "desc" },
            select: { status: true },
          })
        )?.status,
      { timeout: 180_000 },
    )
    .toBe(AuditStatus.COMPLETED);

  await expect(page).toHaveURL(
    `/dashboard/businesses/${businessId}/setup?step=results`,
    { timeout: 45_000 },
  );
  await page.screenshot({
    path: path.join(artifactRoot, "onboarding-results.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "View overview" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/businesses/${businessId}/overview$`),
  );
  await expect(
    page.getByRole("heading", { name: "Your website growth priorities" }),
  ).toBeVisible();
  await expect(
    page.locator('[aria-label^="Website Growth Score "]'),
  ).toBeVisible();

  const overviewText = await page.locator("main").innerText();
  expect(overviewText).not.toContain("Social Score");
  expect(overviewText).not.toContain("Competitor Intelligence");
  expect(overviewText).not.toContain("Google Business");
  expect(overviewText).not.toContain("Reviews Score");
  await page.screenshot({
    path: path.join(artifactRoot, "overview-completed.png"),
    fullPage: true,
    animations: "disabled",
  });

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  const audit = await prisma.audit.findFirstOrThrow({
    where: { businessId, status: AuditStatus.COMPLETED },
    orderBy: { createdAt: "desc" },
    include: {
      scores: true,
      recommendations: true,
    },
  });
  const categories = new Set(audit.scores.map((score) => score.category));
  const supportedCategories = new Set<ScoreCategory>([
    ScoreCategory.WEBSITE,
    ScoreCategory.SEO,
  ]);
  expect(categories).toEqual(
    new Set([
      ScoreCategory.OVERALL,
      ScoreCategory.WEBSITE,
      ScoreCategory.SEO,
    ]),
  );
  expect(
    audit.recommendations.every((item) =>
      supportedCategories.has(item.category),
    ),
  ).toBe(true);

  const snapshot = audit.analysisSnapshot as Record<string, unknown>;
  expect(snapshot).not.toHaveProperty("social");
  expect(snapshot).not.toHaveProperty("reviews");
  expect(snapshot).not.toHaveProperty("competitors");
  expect(snapshot).toHaveProperty(
    "scoringMetadata.scoringEngineVersion",
    "website-growth-score-v1",
  );
  expect(snapshot).toHaveProperty("assessment.confirmedSocialProfilesCount", 0);
  const consistencyValidation = snapshot.consistencyValidation as
    | { issues?: Array<{ severity?: string; code?: string; message?: string }> }
    | undefined;
  expect(
    consistencyValidation?.issues?.filter((issue) => issue.severity === "ERROR") ?? [],
  ).toEqual([]);

  const profiles = await prisma.businessProfile.findMany({
    where: { businessId },
  });
  expect(profiles).toEqual([
    expect.objectContaining({
      platform: ProfilePlatform.WEBSITE,
      status: BusinessProfileStatus.CONFIRMED,
    }),
  ]);

  const firstAction = page.locator(
    'section[aria-labelledby="recommended-first-action"]',
  );
  await expect(firstAction).toBeVisible();
  await firstAction.getByRole("button", { name: "Start action" }).click();
  await expect(
    firstAction.getByRole("link", { name: "Continue action" }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^growth-audit-.*\.pdf$/);
  await download.saveAs(path.join(artifactRoot, "website-growth-report.pdf"));

  await page.goto(`/dashboard/businesses/${businessId}/audit`);
  await expect(
    page.getByRole("heading", { name: "Findings and evidence" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifactRoot, "audit-workspace.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.goto(`/dashboard/businesses/${businessId}/action-plan`);
  await expect(
    page.getByRole("heading", { name: "Action Plan" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifactRoot, "action-plan.png"),
    fullPage: true,
    animations: "disabled",
  });
  const continueAction = page.getByRole("button", { name: "Continue action" });
  if ((await continueAction.count()) > 0) {
    await continueAction.first().click();
    await expect(
      page.getByRole("dialog", { name: "Implementation steps" }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(artifactRoot, "implementation-help.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", {
        name: "Close Implementation Help",
        exact: true,
      })
      .click();
  }

  await page.goto(`/dashboard/businesses/${businessId}/chat`);
  await expect(
    page.getByRole("heading", { name: "Ask your Website & SEO Consultant" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifactRoot, "ai-consultant.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.goto(`/dashboard/businesses/${businessId}/history`);
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  await page.screenshot({
    path: path.join(artifactRoot, "progress-history.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.goto(`/dashboard/businesses/${businessId}/social`);
  await expect(
    page.getByRole("heading", {
      name: "Social Growth is not part of the launch product",
    }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: path.join(artifactRoot, "mobile-dashboard.png"),
    fullPage: true,
    animations: "disabled",
  });
});

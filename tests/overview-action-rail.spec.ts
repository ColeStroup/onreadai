import {
  AuditStatus,
  RecommendationStatus,
} from "@prisma/client";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";

import { prisma } from "../src/lib/prisma";

const artifactRoot = path.join(
  process.cwd(),
  ".artifacts",
  "customer-experience",
);

let businessId = "";
let emptyBusinessId = "";
let overviewPath = "";
let sessionToken = "";
let auditId = "";
let originalRecommendations: Array<{
  id: string;
  status: RecommendationStatus;
  completedAt: Date | null;
}> = [];

test.beforeAll(async () => {
  const business = await prisma.business.findFirst({
    where: {
      name: "Schooners",
      audits: {
        some: {
          status: AuditStatus.COMPLETED,
          recommendations: { some: {} },
        },
      },
    },
    select: {
      id: true,
      owner: { select: { id: true, name: true, email: true } },
      audits: {
        where: { status: AuditStatus.COMPLETED },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          recommendations: {
            select: { id: true, status: true, completedAt: true },
          },
        },
      },
    },
  });

  if (!business?.owner.email) {
    throw new Error("A completed Schooners audit fixture is required.");
  }

  const latestAudit = business.audits.at(0);
  if (!latestAudit?.recommendations.length) {
    throw new Error("The Schooners fixture needs audit recommendations.");
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for browser tests.");

  businessId = business.id;
  auditId = latestAudit.id;
  originalRecommendations = latestAudit.recommendations;
  sessionToken = await encode({
    secret,
    token: {
      id: business.owner.id,
      sub: business.owner.id,
      name: business.owner.name,
      email: business.owner.email,
    },
  });
  overviewPath = `/dashboard/businesses/${business.id}/overview`;

  await prisma.recommendation.updateMany({
    where: { auditId },
    data: { status: RecommendationStatus.TODO, completedAt: null },
  });

  const emptyBusiness = await prisma.business.create({
    data: {
      ownerId: business.owner.id,
      name: `Customer Experience Empty ${Date.now()}`,
      initialInput: "Customer Experience Empty Fixture",
    },
    select: { id: true },
  });
  emptyBusinessId = emptyBusiness.id;
});

test.afterAll(async () => {
  await prisma.$transaction(
    originalRecommendations.map((recommendation) =>
      prisma.recommendation.update({
        where: { id: recommendation.id },
        data: {
          status: recommendation.status,
          completedAt: recommendation.completedAt,
        },
      }),
    ),
  );
  if (emptyBusinessId) {
    await prisma.business.deleteMany({ where: { id: emptyBusinessId } });
  }
  await prisma.$disconnect();
});

test.beforeEach(async ({ context, baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is unavailable.");
  await prisma.recommendation.updateMany({
    where: { auditId },
    data: { status: RecommendationStatus.TODO, completedAt: null },
  });
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: sessionToken,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(overviewPath, { waitUntil: "domcontentloaded" });
});

test("overview makes the first action clear at every supported viewport", async ({
  page,
}, testInfo) => {
  const firstAction = page.locator(
    'section[aria-labelledby="recommended-first-action"]',
  );
  await expect(
    page.getByRole("heading", { name: "Your growth priorities" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Current health/).first(),
  ).toBeVisible();
  await expect(firstAction).toBeVisible();
  await expect(
    firstAction.getByRole("button", { name: "Start action" }),
  ).toHaveCount(1);
  await expect(
    firstAction.getByRole("button", { name: "See evidence" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Start with your first recommended action")).toBeVisible();
  await expect(page.getByText("0%", { exact: true })).toHaveCount(0);

  const followUpHeading = page.getByRole("heading", {
    name: "Next two actions",
  });
  await expect(followUpHeading).toBeVisible();
  const followUpSection = followUpHeading.locator("xpath=../../..");
  await expect(followUpSection.locator("article")).toHaveCount(2);
  await expect(
    followUpSection.getByRole("button", { name: "Start action" }),
  ).toHaveCount(2);
  await expect(page.getByText("Generate Fix", { exact: true })).toHaveCount(0);

  const coverageButton = page.getByRole("button", {
    name: /Analysis coverage/,
  });
  await expect(coverageButton).toHaveAttribute("aria-expanded", "false");
  const firstActionBox = await firstAction.boundingBox();
  const coverageBox = await coverageButton.boundingBox();
  expect(firstActionBox).not.toBeNull();
  expect(coverageBox).not.toBeNull();
  expect(firstActionBox!.y).toBeLessThan(coverageBox!.y);

  const findingsHeading = page.getByRole("heading", { name: "Key findings" });
  const findingsSection = findingsHeading.locator("xpath=../../..");
  expect(await findingsSection.locator("article").count()).toBeLessThanOrEqual(3);
  await expect(
    findingsSection.getByRole("link", { name: "View all findings" }),
  ).toHaveAttribute("href", new RegExp(`/businesses/${businessId}/audit$`));
  await expect(
    page.getByRole("heading", { name: "Business health by area" }),
  ).toHaveCount(1);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);

  const artifactDirectory = path.join(artifactRoot, testInfo.project.name);
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(artifactDirectory, "overview.png"),
    fullPage: true,
    animations: "disabled",
  });

  if (["mobile-375", "tablet-portrait", "desktop-1366"].includes(testInfo.project.name)) {
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  }

  await firstAction.getByRole("button", { name: "Start action" }).click();
  await expect(
    firstAction.getByRole("link", { name: "Continue action" }),
  ).toBeVisible();
  await expect(page.getByText("In progress:", { exact: false })).toBeVisible();
});

test("overview keeps evidence, coverage, and full findings accessible", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1366",
    "Detailed interaction flow runs once on the reference desktop viewport.",
  );

  const firstAction = page.locator(
    'section[aria-labelledby="recommended-first-action"]',
  );
  const evidenceButton = firstAction.getByRole("button", {
    name: "See evidence",
  });
  await expect(firstAction.getByText("Confidence:", { exact: true })).toHaveCount(0);
  await evidenceButton.click();
  await expect(evidenceButton).toHaveAttribute("aria-expanded", "true");
  await expect(firstAction.getByText("Confidence:", { exact: true })).toBeVisible();
  await evidenceButton.click();
  await expect(evidenceButton).toHaveAttribute("aria-expanded", "false");

  const coverageButton = page.getByRole("button", {
    name: /Analysis coverage/,
  });
  await coverageButton.click();
  await expect(coverageButton).toHaveAttribute("aria-expanded", "true");
  for (const label of [
    "Website pages checked",
    "Technical website checks",
    "Pages reviewed by AI",
    "Social profiles reviewed",
    "Review evidence",
    "Competitor evidence",
  ]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await page.getByText("Technical methodology", { exact: true }).click();
  await expect(page.getByText("Scoring engine", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "View all findings" }).click();
  await expect(page).toHaveURL(new RegExp(`/businesses/${businessId}/audit$`));
  await expect(
    page.getByRole("heading", { name: "Findings and evidence" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to overview" }),
  ).toHaveAttribute("href", overviewPath);
});

test("changed customer routes remain readable and accessible", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1366",
    "Cross-route accessibility and visual review run once.",
  );
  test.setTimeout(300_000);

  const routes = [
    ["guided-setup", `/dashboard/businesses/${businessId}/setup?step=context`],
    ["audit-findings", `/dashboard/businesses/${businessId}/audit`],
    ["action-plan", `/dashboard/businesses/${businessId}/action-plan`],
    ["consultant", `/dashboard/businesses/${businessId}/chat`],
    ["billing", "/dashboard/billing"],
    ["settings", "/dashboard/settings"],
    ["website", `/dashboard/businesses/${businessId}/website`],
    ["seo", `/dashboard/businesses/${businessId}/seo`],
    ["social", `/dashboard/businesses/${businessId}/social`],
    ["reviews", `/dashboard/businesses/${businessId}/reviews`],
    ["competitors", `/dashboard/businesses/${businessId}/competitors`],
    ["history", `/dashboard/businesses/${businessId}/history`],
    ["dashboard", "/dashboard"],
    ["businesses", "/dashboard/businesses"],
    ["help", "/dashboard/help"],
  ] as const;

  const artifactDirectory = path.join(artifactRoot, "desktop-1366");
  await mkdir(artifactDirectory, { recursive: true });

  for (const [name, route] of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations, `${name} accessibility`).toEqual([]);

    if (name === "audit-findings") {
      const firstStrength = page
        .locator("article")
        .filter({ hasText: "Verified strength" })
        .first();
      await expect(firstStrength).toBeVisible();
      await expect(
        firstStrength.getByRole("button", { name: "Start action" }),
      ).toHaveCount(0);
    }

    if (name === "action-plan") {
      await expect(
        page.getByRole("button", { name: /All actions/ }),
      ).toHaveAttribute("aria-expanded", "false");
    }

    if (
      [
        "guided-setup",
        "audit-findings",
        "action-plan",
        "consultant",
        "billing",
      ].includes(name)
    ) {
      await page.screenshot({
        path: path.join(artifactDirectory, `${name}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  }

  await page.goto(
    `/dashboard/businesses/${emptyBusinessId}/competitors`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(
    page.getByText("Track competitors that matter to your business."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Side-by-Side Comparison" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Evidence-Based Opportunities" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: path.join(artifactDirectory, "empty-competitors.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.goto(
    `/dashboard/businesses/${businessId}/reviews?error=invalid`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(
    page.getByText("Enter a valid Google Maps URL or Place ID."),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifactDirectory, "error-state.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("setup actions expose immediate pending feedback", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-1366",
    "Pending-state capture runs once.",
  );

  await page.goto(
    `/dashboard/businesses/${businessId}/setup?step=context`,
    { waitUntil: "domcontentloaded" },
  );
  let releaseRequest: (() => void) | undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/setup?step=context", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await requestGate;
    await route.abort();
  });

  const finishLater = page.getByRole("button", { name: "Finish later" });
  const click = finishLater.click().catch(() => undefined);
  await expect(page.getByRole("button", { name: "Saving..." })).toBeVisible();
  const artifactDirectory = path.join(artifactRoot, "desktop-1366");
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(artifactDirectory, "loading-state.png"),
    fullPage: true,
    animations: "disabled",
  });
  releaseRequest?.();
  await click;
});

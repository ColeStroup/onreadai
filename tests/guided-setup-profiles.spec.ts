import AxeBuilder from "@axe-core/playwright";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  BusinessProfileSource,
  BusinessProfileStatus,
  PlanType,
  PrismaClient,
  ProfilePlatform,
  SubscriptionStatus,
} from "@prisma/client";
import { expect, type Page, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

const databaseUrl = process.env.PRODUCTION_FLOW_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Guided setup test database is unavailable.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

let userId = "";
let sessionToken = "";

test.beforeAll(async () => {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for browser tests.");

  const user = await prisma.user.create({
    data: {
      email: `guided-setup-${randomUUID()}@example.test`,
      name: "Guided Setup Test",
      emailVerified: new Date(),
      subscriptions: {
        create: {
          plan: PlanType.PRO,
          status: SubscriptionStatus.ACTIVE,
          stripeSubscriptionId: `sub_guided_${randomUUID()}`,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        },
      },
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

test("guided setup confirms only the launch website source", async ({ page }) => {
  const businessId = await createBusiness(page, "https://example.com/");

  await expect(
    page.getByRole("heading", { name: "Confirm your website" }),
  ).toBeVisible();
  await expect(
    page.getByText("Only this source is used for the launch Website Growth Score."),
  ).toBeVisible();
  await expect(page.getByText(/Instagram|Google Business|Competitor/i)).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Website confirmed", { exact: true })).toBeVisible();

  const profiles = await prisma.businessProfile.findMany({
    where: { businessId },
  });
  expect(profiles).toEqual([
    expect.objectContaining({
      platform: ProfilePlatform.WEBSITE,
      status: BusinessProfileStatus.CONFIRMED,
      source: BusinessProfileSource.SUBMITTED,
    }),
  ]);

  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(
    `/dashboard/businesses/${businessId}/setup?step=context`,
  );
});

test("a removed website can be replaced without leaving guided setup", async ({
  page,
}) => {
  const businessId = await createBusiness(page, "https://example.com/");

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Website confirmation required")).toBeVisible();

  const form = page.getByRole("form", { name: "Add missing profile" });
  await expect(form.getByText("Website", { exact: true })).toBeVisible();
  await expect(form.getByLabel("Platform")).toHaveCount(0);
  await form.getByLabel("Public profile URL").fill("https://www.example.org/");
  await form.getByRole("button", { name: "Add profile" }).click();
  await expect(page.getByText("Website confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText("https://www.example.org/")).toBeVisible();

  const profiles = await prisma.businessProfile.findMany({
    where: { businessId, platform: ProfilePlatform.WEBSITE },
    orderBy: { createdAt: "asc" },
  });
  expect(profiles).toHaveLength(2);
  expect(profiles[0]?.status).toBe(BusinessProfileStatus.REMOVED);
  expect(profiles[1]).toEqual(
    expect.objectContaining({
      status: BusinessProfileStatus.CONFIRMED,
      source: BusinessProfileSource.MANUAL,
      normalizedUrl: "https://example.org/",
      url: "https://www.example.org/",
    }),
  );
});

test("website confirmation exposes pending feedback and remains accessible on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createBusiness(page, "https://example.com/");

  await page.route("**/dashboard/businesses/*/setup**", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    await route.continue();
  });
  const confirm = page.getByRole("button", { name: "Confirm", exact: true });
  const confirmation = confirm.click();
  await expect(page.getByRole("button", { name: "Confirming..." })).toBeDisabled();
  await confirmation;
  await expect(page.getByText("Website confirmed", { exact: true })).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

async function createBusiness(page: Page, websiteUrl: string) {
  await page.goto("/dashboard/businesses/new");
  await page
    .getByLabel("Business name")
    .fill(`Guided Website ${randomUUID().slice(0, 8)}`);
  await page.getByLabel("Website URL").fill(websiteUrl);
  await page.getByRole("button", { name: "Continue setup" }).click();
  await expect(page).toHaveURL(
    /\/dashboard\/businesses\/[^/]+\/setup\?step=profiles$/,
  );
  return new URL(page.url()).pathname.split("/")[3]!;
}

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

test("partial discovery can be completed entirely inside guided setup", async ({
  page,
}) => {
  const businessId = await createBusiness(page, "https://example.com");

  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await addManualProfile(
    page,
    ProfilePlatform.INSTAGRAM,
    `https://instagram.com/onread-${randomUUID().slice(0, 8)}`,
  );
  await page
    .getByLabel("Google Maps or Business Profile URL")
    .fill("https://www.google.com/maps/place/Example");
  await page.getByRole("button", { name: "Add Google profile" }).click();

  await expect(page.getByText("Your audit sources are ready")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Advanced profile management" }),
  ).toBeVisible();

  const profiles = await prisma.businessProfile.findMany({
    where: { businessId },
  });
  expect(profiles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        platform: ProfilePlatform.INSTAGRAM,
        status: BusinessProfileStatus.CONFIRMED,
        source: BusinessProfileSource.MANUAL,
      }),
      expect.objectContaining({
        platform: ProfilePlatform.GOOGLE_BUSINESS,
        status: BusinessProfileStatus.CONFIRMED,
        source: BusinessProfileSource.MANUAL,
      }),
    ]),
  );
});

test("incorrect discovery can be removed and replaced without leaving setup", async ({
  page,
}) => {
  const businessId = await createBusiness(
    page,
    `https://instagram.com/onread-${randomUUID().slice(0, 8)}`,
  );
  await prisma.businessProfile.create({
    data: {
      businessId,
      platform: ProfilePlatform.FACEBOOK,
      url: "https://www.facebook.com/unrelated-guided-result",
      normalizedUrl: "https://facebook.com/unrelated-guided-result",
      status: BusinessProfileStatus.PENDING,
      source: BusinessProfileSource.DISCOVERED,
      confidenceScore: 72,
    },
  });
  await page.reload();

  const wrongCard = page
    .getByText("https://www.facebook.com/unrelated-guided-result")
    .locator("xpath=ancestor::article[1]");
  await wrongCard.getByRole("button", { name: "Remove" }).click();
  await addManualProfile(
    page,
    ProfilePlatform.FACEBOOK,
    `https://facebook.com/correct-${randomUUID().slice(0, 8)}`,
  );

  const records = await prisma.businessProfile.findMany({
    where: { businessId, platform: ProfilePlatform.FACEBOOK },
    orderBy: { createdAt: "asc" },
  });
  expect(records[0]?.status).toBe(BusinessProfileStatus.REMOVED);
  expect(records[1]?.status).toBe(BusinessProfileStatus.CONFIRMED);
  expect(records[1]?.source).toBe(BusinessProfileSource.MANUAL);
});

test("Google skip remains distinct and paid audit shows acknowledgement", async ({
  page,
}) => {
  const businessId = await createBusiness(
    page,
    `https://instagram.com/onread-${randomUUID().slice(0, 8)}`,
  );
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page.getByText("Your audit sources are ready")).toBeVisible();
  await prisma.business.update({
    where: { id: businessId },
    data: {
      description: "A creator education business.",
      targetAudience: "Independent creators.",
      mainOffer: "Practical weekly education.",
      contextConfirmedAt: new Date(),
      goals: ["GROW_SOCIAL_MEDIA"],
      primaryGoal: "GROW_SOCIAL_MEDIA",
    },
  });

  await page.goto(`/dashboard/businesses/${businessId}/setup?step=audit`);
  await expect(
    page.getByRole("heading", { name: "Some sources have not been added" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Continue with available information",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue with available information" })
    .click();
  await expect(page).toHaveURL(/\/audit\/run\?auditId=/);

  await expect
    .poll(async () => {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { auditSourceAcknowledgementHash: true },
      });
      return Boolean(business?.auditSourceAcknowledgementHash);
    })
    .toBe(true);

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
      { timeout: 120_000 },
    )
    .toMatch(/COMPLETED|FAILED/);
});

test("profile actions expose pending feedback and the mobile flow has no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createBusiness(page, "https://example.com");

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
  await expect(page.getByText("Website confirmed.")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});

test("advanced management has a route back and preserves setup progress", async ({
  page,
}) => {
  const businessId = await createBusiness(page, "https://example.com");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("button", { name: "I don't have one" }).click();
  await expect(page.getByText("Your audit sources are ready")).toBeVisible();
  await page.getByRole("link", { name: "Advanced profile management" }).click();

  await expect(
    page.getByRole("link", { name: "Return to guided setup" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Return to guided setup" }).click();
  await expect(page).toHaveURL(
    `/dashboard/businesses/${businessId}/setup?step=profiles`,
  );
  await expect(page.getByText("Your audit sources are ready")).toBeVisible();
});

async function createBusiness(page: Page, startingSource: string) {
  await page.goto("/dashboard/businesses/new");
  await page
    .getByLabel("Start with your primary business link")
    .fill(startingSource);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(
    /\/dashboard\/businesses\/[^/]+\/setup\?step=profiles$/,
  );
  return new URL(page.url()).pathname.split("/")[3]!;
}

async function addManualProfile(
  page: Page,
  platform: ProfilePlatform,
  url: string,
) {
  const form = page.getByRole("form", { name: "Add missing profile" });
  await form.getByLabel("Platform").selectOption(platform);
  await form.getByLabel("Public profile URL").fill(url);
  await form.getByRole("button", { name: "Add profile" }).click();
  await expect(
    page.getByText(`${platformLabel(platform)} added and confirmed.`),
  ).toBeVisible();
}

function platformLabel(platform: ProfilePlatform) {
  return platform.charAt(0) + platform.slice(1).toLowerCase();
}

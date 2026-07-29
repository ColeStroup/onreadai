import { AuditStatus, BusinessProfileStatus, ProfilePlatform, ScoreCategory } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";

const databaseUrl = process.env.PRODUCTION_FLOW_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Production flow test database is unavailable.");

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
      email: `production-flow-${randomUUID()}@example.test`,
      name: "Production Flow Test",
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

test("a verified user completes a social-first audit without website penalties", async ({
  page,
}) => {
  const handle = `onread-production-flow-${randomUUID().slice(0, 8)}`;

  await page.goto("/dashboard/businesses/new");
  await page
    .getByLabel("Start with your primary business link")
    .fill(`https://instagram.com/${handle}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(
    /\/dashboard\/businesses\/[^/]+\/setup\?step=profiles$/,
  );

  const businessId = new URL(page.url()).pathname.split("/")[3];
  expect(businessId).toBeTruthy();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page.getByText("Your audit sources are ready")).toBeVisible();

  await page.goto(`/dashboard/businesses/${businessId}/context`);
  await page
    .getByLabel("Business Description")
    .fill("A creator-led education brand publishing practical operations guidance for independent consultants.");
  await page
    .getByLabel("Target Audience")
    .fill("Independent consultants and small agency owners who want clearer operating systems.");
  await page
    .getByLabel("Main Offer")
    .fill("Weekly educational content and a paid implementation workshop.");
  await page.getByLabel("Industry / Category").fill("Business education");
  await page.getByLabel("Business Type").fill("Creator-led education business");
  await page
    .getByLabel("Primary Conversion Goal")
    .fill("Turn qualified followers into workshop registrations.");
  await page.getByLabel("Brand Tone").fill("Practical, direct, and encouraging.");
  await page.getByLabel("Confidence Score").fill("100");
  await page.getByRole("button", { name: "Save Context" }).click();
  await page.getByRole("button", { name: "Confirm This Looks Right" }).first().click();
  await expect(page.getByText("Business context confirmed.")).toBeVisible();

  await page.goto(`/dashboard/businesses/${businessId}/confirm`);
  const runAudit = page.getByRole("button", { name: "Run Audit" });
  await expect(runAudit).toBeEnabled();
  await runAudit.click();
  await expect(page).toHaveURL(/\/audit\/run\?auditId=/);
  await expect(page.getByRole("heading", { name: "Running your growth audit" })).toBeVisible();

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
    .toBe(AuditStatus.COMPLETED);

  await expect(page).toHaveURL(new RegExp(`/dashboard/businesses/${businessId}/overview$`), {
    timeout: 30_000,
  });
  await expect(page.getByText("Not provided", { exact: true }).first()).toBeVisible();

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    include: {
      profiles: true,
      audits: {
        where: { status: AuditStatus.COMPLETED },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { scores: true, recommendations: true },
      },
    },
  });

  expect(business.profiles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        platform: ProfilePlatform.INSTAGRAM,
        status: BusinessProfileStatus.CONFIRMED,
      }),
    ]),
  );
  expect(business.audits).toHaveLength(1);
  const categories = new Set(business.audits[0].scores.map((score) => score.category));
  expect(categories.has(ScoreCategory.WEBSITE)).toBe(false);
  expect(categories.has(ScoreCategory.SEO)).toBe(false);
  expect(categories.has(ScoreCategory.SOCIAL)).toBe(true);
  expect(business.audits[0].recommendations.length).toBeGreaterThan(0);
  expect(
    business.audits[0].recommendations.some((item) =>
      /homepage|website h1|meta description/i.test(`${item.title} ${item.description}`),
    ),
  ).toBe(false);
});

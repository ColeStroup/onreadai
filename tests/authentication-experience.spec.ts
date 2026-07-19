import "dotenv/config";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const verificationSecret = "auth-e2e-email-verification-secret-123456789";
const resetSecret = "auth-e2e-password-reset-secret-123456789012";
const artifactRoot = path.join(process.cwd(), ".artifacts", "auth");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const createdUserIds = new Set<string>();
const authRateKeys = new Set<string>();

function authRateHash(kind: string, value: string) {
  return createHmac("sha256", verificationSecret)
    .update(`auth-rate-limit:v1:${kind}:${value}`)
    .digest("hex");
}

authRateKeys.add(authRateHash("network", "unknown|Onread Auth E2E"));
authRateKeys.add(authRateHash("network", "127.0.0.1|Onread Auth E2E"));
authRateKeys.add(authRateHash("network", "::1|Onread Auth E2E"));

function trackAuthEmail(email: string) {
  authRateKeys.add(authRateHash("email", email.toLowerCase()));
}

function verificationHash(input: {
  userId: string;
  email: string;
  code: string;
}) {
  return createHmac("sha256", verificationSecret)
    .update(
      [
        "email-verification:v1",
        "SIGNUP_VERIFICATION",
        input.userId,
        input.email.toLowerCase(),
        input.code,
      ].join(":"),
    )
    .digest("hex");
}

function resetHash(token: string) {
  return createHmac("sha256", resetSecret)
    .update(`password-reset:v1:${token}`)
    .digest("hex");
}

async function seedPendingUser(options: { expired?: boolean } = {}) {
  const email = `auth-e2e-${randomUUID()}@example.test`;
  trackAuthEmail(email);
  const password = "secure-test-password";
  const user = await prisma.user.create({
    data: {
      email,
      name: "Auth E2E",
      passwordHash: await bcrypt.hash(password, 4),
      emailVerificationRequiredAt: new Date(),
    },
  });
  createdUserIds.add(user.id);
  const code = "246810";
  await prisma.emailVerificationCode.create({
    data: {
      userId: user.id,
      email,
      codeHash: verificationHash({ userId: user.id, email, code }),
      expiresAt: options.expired
        ? new Date(Date.now() - 60_000)
        : new Date(Date.now() + 10 * 60_000),
    },
  });
  return { user, email, password, code };
}

async function signInPendingUser(
  page: Page,
  account: Awaited<ReturnType<typeof seedPendingUser>>,
) {
  await page.goto("/signin");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/verify-email/);
}

test.afterEach(async () => {
  if (createdUserIds.size) {
    await prisma.user.deleteMany({
      where: { id: { in: [...createdUserIds] } },
    });
    createdUserIds.clear();
  }
  await prisma.authSecurityEvent.deleteMany({
    where: { keyHash: { in: [...authRateKeys] } },
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("credentials signup verifies once and unlocks the protected workspace", async ({
  page,
}) => {
  const email = `signup-${randomUUID()}@example.test`;
  trackAuthEmail(email);
  const password = "launch-ready-password";

  await page.goto("/signup?callbackUrl=/dashboard/businesses/new");
  await page.getByLabel("Full name").fill("Launch Test User");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);

  await expect
    .poll(() => prisma.user.findUnique({ where: { email } }))
    .not.toBeNull();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  createdUserIds.add(user.id);
  expect(user.emailVerified).toBeNull();
  expect(user.emailVerificationRequiredAt).not.toBeNull();
  expect(await bcrypt.compare(password, user.passwordHash!)).toBe(true);

  const code = "135790";
  const challenge = await prisma.emailVerificationCode.findFirstOrThrow({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  expect(challenge.codeHash).not.toBe(code);
  await prisma.emailVerificationCode.update({
    where: { id: challenge.id },
    data: {
      codeHash: verificationHash({ userId: user.id, email, code }),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      invalidatedAt: null,
      attemptCount: 0,
    },
  });

  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText("Email verified. Your Onread workspace is ready.")).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/businesses\/new/, {
    timeout: 20_000,
  });

  const verified = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(verified.emailVerified).not.toBeNull();
  expect(
    await prisma.emailVerificationCode.findUniqueOrThrow({
      where: { id: challenge.id },
    }),
  ).toMatchObject({ consumedAt: expect.any(Date) });
});

test("an unverified credentials session is redirected away from protected pages", async ({
  page,
}) => {
  const account = await seedPendingUser();
  await signInPendingUser(page, account);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/verify-email/);
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
});

test("a returning partial signup resumes verification without duplicating the user", async ({
  page,
}) => {
  const account = await seedPendingUser();
  const countBefore = await prisma.user.count({
    where: { email: account.email },
  });

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Returning User");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByLabel("Confirm password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
  await expect(page.getByText(account.email.slice(0, 1) + "••••@example.test")).toBeVisible();
  expect(await prisma.user.count({ where: { email: account.email } })).toBe(
    countBefore,
  );
});

test("invalid and expired codes fail, while a replacement code succeeds", async ({
  page,
}) => {
  const account = await seedPendingUser({ expired: true });
  await signInPendingUser(page, account);
  await page.getByLabel("Verification code").fill(account.code);
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText("That code has expired. Request a new code to continue.")).toBeVisible();

  const code = "112233";
  await prisma.emailVerificationCode.create({
    data: {
      userId: account.user.id,
      email: account.email,
      codeHash: verificationHash({
        userId: account.user.id,
        email: account.email,
        code,
      }),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText(/wasn't recognized/)).toBeVisible();
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
});

test("password reset is single-use and signs in with the new password", async ({
  page,
}) => {
  const unknownEmail = `unknown-reset-${randomUUID()}@example.test`;
  trackAuthEmail(unknownEmail);
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill(unknownEmail);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an eligible password account exists/)).toBeVisible();

  const email = `reset-e2e-${randomUUID()}@example.test`;
  trackAuthEmail(email);
  const user = await prisma.user.create({
    data: {
      email,
      name: "Reset Test",
      passwordHash: await bcrypt.hash("old-password", 4),
      emailVerified: new Date(),
    },
  });
  createdUserIds.add(user.id);
  const token = `reset-${randomUUID()}-${randomUUID()}`;
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      email,
      tokenHash: resetHash(token),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });

  await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
  await page.getByLabel("New password", { exact: true }).fill("new-secure-password");
  await page.getByLabel("Confirm new password").fill("new-secure-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/signin\?reset=1/);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("new-secure-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
  await expect(page.getByText("This reset link is invalid or has already been used.")).toBeVisible();
});

test("auth pages are accessible, responsive, and visually consistent", async ({
  page,
}) => {
  await mkdir(artifactRoot, { recursive: true });
  const viewports = [
    { name: "mobile-375", width: 375, height: 812 },
    { name: "mobile-430", width: 430, height: 932 },
    { name: "tablet-portrait", width: 768, height: 1024 },
    { name: "tablet-landscape", width: 1024, height: 768 },
    { name: "laptop-1366", width: 1366, height: 768 },
    { name: "desktop-1440", width: 1440, height: 900 },
    { name: "desktop-1920", width: 1920, height: 1080 },
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${viewport.name} should not overflow`).toBeLessThanOrEqual(1);

    if (["mobile-375", "desktop-1440"].includes(viewport.name)) {
      await page.screenshot({
        path: path.join(artifactRoot, `signup-${viewport.name}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ["/signup", "/signin", "/forgot-password", "/reset-password"]) {
    await page.goto(route);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations, route).toEqual([]);
  }

  await page.goto("/signin");
  await page.screenshot({
    path: path.join(artifactRoot, "signin-desktop-1440.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: path.join(artifactRoot, "signin-mobile-375.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/forgot-password");
  await page.screenshot({
    path: path.join(artifactRoot, "forgot-password-desktop-1440.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: path.join(artifactRoot, "forgot-password-mobile-375.png"),
    fullPage: true,
    animations: "disabled",
  });

  const verificationAccount = await seedPendingUser();
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInPendingUser(page, verificationAccount);
  await page.screenshot({
    path: path.join(artifactRoot, "verification-resend-cooldown-desktop-1440.png"),
    fullPage: true,
    animations: "disabled",
  });
  const verificationAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(verificationAccessibility.violations).toEqual([]);
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText(/wasn't recognized/)).toBeVisible();
  await page.screenshot({
    path: path.join(artifactRoot, "verification-invalid-code-desktop-1440.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: path.join(artifactRoot, "verification-mobile-375.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);

  const resetEmail = `visual-reset-${randomUUID()}@example.test`;
  const resetUser = await prisma.user.create({
    data: {
      email: resetEmail,
      passwordHash: await bcrypt.hash("visual-old-password", 4),
      emailVerified: new Date(),
    },
  });
  createdUserIds.add(resetUser.id);
  const resetToken = `visual-${randomUUID()}-${randomUUID()}`;
  await prisma.passwordResetToken.create({
    data: {
      userId: resetUser.id,
      email: resetEmail,
      tokenHash: resetHash(resetToken),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/reset-password?token=${encodeURIComponent(resetToken)}`);
  await page.screenshot({
    path: path.join(artifactRoot, "reset-password-desktop-1440.png"),
    fullPage: true,
    animations: "disabled",
  });
  const resetAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(resetAccessibility.violations).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: path.join(artifactRoot, "reset-password-mobile-375.png"),
    fullPage: true,
    animations: "disabled",
  });
});

import "dotenv/config";

import { expect, test, type Page } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PlanType,
  PrismaClient,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const databaseUrl =
  process.env.ENTITLEMENT_E2E_DATABASE_URL ?? process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });
const password = "complimentary-access-test-password";
const runId = randomUUID();
const accounts = new Map<
  string,
  { id: string; email: string; password: string }
>();

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  for (const [label, role] of [
    ["admin", UserRole.ADMIN],
    ["founder", UserRole.USER],
    ["promotion", UserRole.USER],
    ["revocation", UserRole.USER],
    ["paid", UserRole.USER],
    ["normal", UserRole.USER],
    ["mutation-target", UserRole.USER],
  ] as const) {
    const account = await createAccount(label, role);
    accounts.set(label, account);
  }

  await prisma.userSubscription.create({
    data: {
      userId: account("paid").id,
      plan: PlanType.STARTER,
      status: SubscriptionStatus.ACTIVE,
      stripeSubscriptionId: `sub_entitlement_e2e_${runId}`,
      stripePriceId: "price_e2e_starter",
      stripeProductKey: "starter_monthly",
      currentPeriodStart: new Date(Date.now() - 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });
});

test.afterAll(async () => {
  const userIds = [...accounts.values()].map((value) => value.id);
  const grants = await prisma.complimentaryEntitlement.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  await prisma.partnerAdminAuditLog.deleteMany({
    where: {
      OR: [
        { adminUserId: account("admin").id },
        { entityId: { in: grants.map((grant) => grant.id) } },
      ],
    },
  });
  await prisma.complimentaryEntitlement.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.userSubscription.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.authSecurityEvent.deleteMany({});
  await prisma.$disconnect();
});

test("Flow A grants permanent founder Pro access without Stripe side effects", async ({
  page,
}) => {
  const before = await externalBillingCounts();
  await grantThroughAdmin(page, "founder", {
    plan: "PRO",
    source: "FOUNDER",
    reason: "Founder/internal account",
  });
  const after = await externalBillingCounts();
  expect(after).toEqual(before);

  await signIn(page, account("founder"));
  await page.goto("/dashboard/billing");
  await expect(page.getByRole("heading", { name: "Plan and feature limits" })).toBeVisible();
  await expect(
    page.getByText(
      "Onread granted complimentary Pro access with no expiration. No charge was made for this access.",
    ),
  ).toBeVisible();
  await expect(page.getByText("No expiration", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage billing" })).toHaveCount(0);
  await expect(page.getByText("75 pages", { exact: true })).toBeVisible();
});

test("Flow B expires temporary promotional access without a scheduled job", async ({
  page,
}) => {
  await grantThroughAdmin(page, "promotion", {
    plan: "STARTER",
    source: "PROMOTION",
    reason: "Launch promotion",
    expiresAt: "2099-01-15T00:00",
  });

  await signIn(page, account("promotion"));
  await page.goto("/dashboard/billing");
  await expect(
    page.getByText("Ends January 15, 2099", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("25 pages", { exact: true })).toBeVisible();

  await prisma.complimentaryEntitlement.updateMany({
    where: {
      userId: account("promotion").id,
      revokedAt: null,
    },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  await page.reload();
  await expect(page.getByText("Free access", { exact: true })).toBeVisible();
  await expect(page.getByText("5 pages", { exact: true })).toBeVisible();
  await expect(page.getByText("Complimentary access", { exact: true })).toHaveCount(0);
});

test("Flow C revokes access promptly while preserving admin history", async ({
  page,
}) => {
  await grantThroughAdmin(page, "revocation", {
    plan: "PRO",
    source: "CUSTOMER_SUPPORT",
    reason: "Temporary support resolution",
  });

  await signIn(page, account("revocation"));
  await page.goto("/dashboard/billing");
  await expect(page.getByText(/complimentary Pro access/i)).toBeVisible();

  await signIn(page, account("admin"));
  await page.goto(
    `/dashboard/admin/entitlements/${account("revocation").id}`,
  );
  await page.getByLabel("Revocation reason").fill("Support period completed");
  await page.getByRole("button", { name: "Revoke access", exact: true }).first().click();
  const dialog = page.getByRole("dialog", {
    name: "Revoke complimentary Pro access?",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Revoke access" }).click();
  await expect(page.getByText("REVOKED", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("article").getByText("Support period completed"),
  ).toBeVisible();

  await signIn(page, account("revocation"));
  await page.goto("/dashboard/billing");
  await expect(page.getByText("Free access", { exact: true })).toBeVisible();
});

test("Flow D shows paid Starter and complimentary Pro separately, then falls back", async ({
  page,
}) => {
  await grantThroughAdmin(page, "paid", {
    plan: "PRO",
    source: "INTERNAL",
    reason: "Approved complimentary upgrade",
  });

  await signIn(page, account("paid"));
  await page.goto("/dashboard/billing");
  await expect(page.getByText("Paid subscription", { exact: true })).toBeVisible();
  await expect(page.getByText("Stripe plan", { exact: true })).toBeVisible();
  await expect(page.getByText("Starter", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/complimentary Pro access/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage billing" }).first()).toBeVisible();
  await expect(page.getByText("75 pages", { exact: true })).toBeVisible();

  await signIn(page, account("admin"));
  await page.goto(`/dashboard/admin/entitlements/${account("paid").id}`);
  await page.getByLabel("Revocation reason").fill("Complimentary upgrade ended");
  await page.getByRole("button", { name: "Revoke access", exact: true }).first().click();
  await page
    .getByRole("dialog", { name: "Revoke complimentary Pro access?" })
    .getByRole("button", { name: "Revoke access" })
    .click();
  await expect(page.getByText("REVOKED", { exact: true })).toBeVisible();

  await signIn(page, account("paid"));
  await page.goto("/dashboard/billing");
  await expect(page.getByText("Paid access", { exact: true })).toBeVisible();
  await expect(page.getByText("25 pages", { exact: true })).toBeVisible();
  await expect(page.getByText("Complimentary access", { exact: true })).toHaveCount(0);
});

test("Flow E hides admin routes and rejects a replayed grant mutation", async ({
  page,
}) => {
  await signIn(page, account("normal"));
  const response = await page.goto("/dashboard/admin/entitlements");
  expect(response?.status()).toBe(404);

  await signIn(page, account("admin"));
  await page.goto(
    `/dashboard/admin/entitlements/${account("mutation-target").id}`,
  );
  const grantForm = page
    .locator("form")
    .filter({ has: page.getByLabel("Reason", { exact: true }) });
  await grantForm.getByLabel("Plan").selectOption("PRO");
  await grantForm.getByLabel("Source").selectOption("MANUAL_ADMIN");
  await grantForm
    .getByLabel("Reason", { exact: true })
    .fill("Unauthorized replay must fail");
  const replay = await grantForm.evaluate((element) => {
    const form = element as HTMLFormElement;
    return {
      action: form.action,
      entries: [...new FormData(form).entries()]
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([name, value]) => ({ name, value })),
    };
  });

  await page.context().clearCookies();
  await page.goto("/");
  await replayServerAction(page, replay);
  await expect(page).toHaveURL(/\/signin/);
  await expect
    .poll(() =>
      prisma.complimentaryEntitlement.count({
        where: { userId: account("mutation-target").id },
      }),
    )
    .toBe(0);

  await signIn(page, account("normal"));
  await page.goto("/dashboard");
  await replayServerAction(page, replay);

  await expect
    .poll(() =>
      prisma.complimentaryEntitlement.count({
        where: { userId: account("mutation-target").id },
      }),
    )
    .toBe(0);
});

async function replayServerAction(
  page: Page,
  payload: {
    action: string;
    entries: { name: string; value: string }[];
  },
) {
  await page.evaluate((input) => {
    const form = document.createElement("form");
    form.method = "post";
    form.action = input.action;
    for (const entry of input.entries) {
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = entry.name;
      field.value = entry.value;
      form.append(field);
    }
    document.body.append(form);
    form.submit();
  }, payload);
  await page.waitForLoadState("domcontentloaded");
}

async function grantThroughAdmin(
  page: Page,
  target: string,
  input: {
    plan: "STARTER" | "PRO";
    source:
      | "FOUNDER"
      | "INTERNAL"
      | "BETA"
      | "PROMOTION"
      | "CUSTOMER_SUPPORT"
      | "MANUAL_ADMIN";
    reason: string;
    expiresAt?: string;
  },
) {
  await signIn(page, account("admin"));
  await page.goto(`/dashboard/admin/entitlements/${account(target).id}`);
  await page.getByLabel("Plan").selectOption(input.plan);
  await page.getByLabel("Source").selectOption(input.source);
  await page.getByLabel("Reason", { exact: true }).fill(input.reason);

  if (input.expiresAt) {
    await page.getByLabel("Expiration").selectOption("CUSTOM");
    await page.getByLabel("Expiration time (UTC)").fill(input.expiresAt);
  }

  await page
    .getByRole("button", { name: "Grant complimentary access", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: /Grant complimentary access to/i,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      "This grants Onread access without creating a Stripe subscription or charging the user.",
    ),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Grant complimentary access" })
    .click();
  await expect(page.getByText("Complimentary access granted.")).toBeVisible();
  await expect
    .poll(() =>
      prisma.complimentaryEntitlement.count({
        where: {
          userId: account(target).id,
          revokedAt: null,
        },
      }),
    )
    .toBe(1);
}

async function signIn(
  page: Page,
  user: { email: string; password: string },
) {
  await page.context().clearCookies();
  await page.goto("/signin");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function createAccount(label: string, role: UserRole) {
  const email = `entitlement-e2e-${label}-${runId}@example.test`;
  const user = await prisma.user.create({
    data: {
      name: `Entitlement ${label}`,
      email,
      passwordHash: await bcrypt.hash(password, 4),
      emailVerified: new Date(),
      role,
    },
  });
  return { id: user.id, email, password };
}

function account(label: string) {
  const value = accounts.get(label);
  if (!value) throw new Error(`Missing ${label} test account.`);
  return value;
}

async function externalBillingCounts() {
  const [
    subscriptions,
    purchases,
    webhookEvents,
    commissions,
    notifications,
  ] = await Promise.all([
    prisma.userSubscription.count(),
    prisma.oneTimeAuditPurchase.count(),
    prisma.stripeWebhookEvent.count(),
    prisma.partnerCommission.count(),
    prisma.partnerNotification.count(),
  ]);
  return {
    subscriptions,
    purchases,
    webhookEvents,
    commissions,
    notifications,
  };
}

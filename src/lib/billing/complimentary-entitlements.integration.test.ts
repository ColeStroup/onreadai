import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

import {
  ComplimentaryEntitlementSource,
  PlanType,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";

import {
  ComplimentaryEntitlementError,
  createComplimentaryEntitlement,
  getUserEntitlementSummary,
  revokeComplimentaryEntitlement,
} from "@/lib/billing/complimentary-entitlements";
import { getEffectiveEntitlement } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";

const databaseUrl = process.env.DATABASE_URL ?? "";
const databaseName = databaseUrl
  ? new URL(databaseUrl).pathname.replace(/^\/+/, "")
  : "";
const usesDedicatedTestDatabase = databaseName.includes(
  "complimentary_entitlement_test",
);
const testRunId = randomUUID();
const userIds: string[] = [];
let adminUserId = "";
let normalUserId = "";
let starterTargetId = "";
let proTargetId = "";
let paidTargetId = "";
let restrictedTargetId = "";

describe(
  "complimentary entitlement persistence and isolation",
  { skip: !usesDedicatedTestDatabase },
  () => {
    before(async () => {
      const users = await Promise.all([
        createUser("admin", UserRole.ADMIN),
        createUser("normal", UserRole.USER),
        createUser("starter-target", UserRole.USER),
        createUser("pro-target", UserRole.USER),
        createUser("paid-target", UserRole.USER),
        createUser("restricted-target", UserRole.USER, {
          emailVerified: null,
          emailVerificationRequiredAt: new Date(),
          sessionVersion: 4,
        }),
      ]);

      [
        adminUserId,
        normalUserId,
        starterTargetId,
        proTargetId,
        paidTargetId,
        restrictedTargetId,
      ] = users.map((user) => user.id);

      await prisma.userSubscription.create({
        data: {
          userId: paidTargetId,
          plan: PlanType.STARTER,
          status: SubscriptionStatus.ACTIVE,
          stripeSubscriptionId: `sub_entitlement_test_${testRunId}`,
          stripePriceId: "price_test_starter",
          stripeProductKey: "starter_monthly",
          currentPeriodStart: new Date("2027-01-01T00:00:00.000Z"),
          currentPeriodEnd: new Date("2027-02-01T00:00:00.000Z"),
        },
      });
    });

    after(async () => {
      const grants = await prisma.complimentaryEntitlement.findMany({
        where: { userId: { in: userIds } },
        select: { id: true },
      });
      await prisma.partnerAdminAuditLog.deleteMany({
        where: {
          OR: [
            { adminUserId },
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
      await prisma.$disconnect();
    });

    test("admin grants Starter with ownership, reason, and an immutable audit event", async () => {
      const grant = await createComplimentaryEntitlement(
        {
          adminUserId,
          targetUserId: starterTargetId,
          plan: PlanType.STARTER,
          source: ComplimentaryEntitlementSource.BETA,
          reason: "Approved beta access",
          internalNotes: "Private support note",
          startsAt: new Date("2020-01-01T00:00:00.000Z"),
          expiresAt: null,
        },
      );

      assert.equal(grant.userId, starterTargetId);
      assert.equal(grant.grantedByUserId, adminUserId);
      assert.equal(grant.plan, PlanType.STARTER);
      assert.equal(grant.reason, "Approved beta access");
      const event = await prisma.partnerAdminAuditLog.findFirstOrThrow({
        where: {
          action: "COMPLIMENTARY_ENTITLEMENT_GRANTED",
          entityId: grant.id,
        },
      });
      assert.equal(event.adminUserId, adminUserId);
      assert.equal(event.reason, grant.reason);
      assert.doesNotMatch(JSON.stringify(event.afterState), /Private support note/);
    });

    test("admin grants permanent Pro without writing billing or commission records", async () => {
      const before = await billingSideEffectCounts();
      const userBefore = await prisma.user.findUniqueOrThrow({
        where: { id: proTargetId },
        select: { stripeCustomerId: true },
      });
      const grant = await createComplimentaryEntitlement({
        adminUserId,
        targetUserId: proTargetId,
        plan: PlanType.PRO,
        source: ComplimentaryEntitlementSource.FOUNDER,
        reason: "Founder/internal account",
        internalNotes: "Founder access approved by operations",
        expiresAt: null,
      });
      const after = await billingSideEffectCounts();
      const userAfter = await prisma.user.findUniqueOrThrow({
        where: { id: proTargetId },
        select: { stripeCustomerId: true },
      });

      assert.equal(grant.plan, PlanType.PRO);
      assert.deepEqual(after, before);
      assert.equal(userBefore.stripeCustomerId, null);
      assert.equal(userAfter.stripeCustomerId, null);
    });

    test("non-admin and unauthenticated identities cannot grant access", async () => {
      for (const actorId of [normalUserId, `missing-${testRunId}`]) {
        await assert.rejects(
          createComplimentaryEntitlement({
            adminUserId: actorId,
            targetUserId: starterTargetId,
            plan: PlanType.PRO,
            source: ComplimentaryEntitlementSource.MANUAL_ADMIN,
            reason: "Unauthorized attempt",
          }),
          (error: unknown) =>
            error instanceof Error &&
            /Administrator access is required/i.test(error.message),
        );
      }
    });

    test("validates reason, plan, and expiration on the server", async () => {
      await assert.rejects(
        createComplimentaryEntitlement({
          adminUserId,
          targetUserId: proTargetId,
          plan: PlanType.PRO,
          source: ComplimentaryEntitlementSource.MANUAL_ADMIN,
          reason: " ",
        }),
        matchesEntitlementError("REASON_REQUIRED"),
      );
      await assert.rejects(
        createComplimentaryEntitlement({
          adminUserId,
          targetUserId: proTargetId,
          plan: "AGENCY",
          source: ComplimentaryEntitlementSource.MANUAL_ADMIN,
          reason: "Invalid plan attempt",
        }),
        matchesEntitlementError("INVALID_PLAN"),
      );
      await assert.rejects(
        createComplimentaryEntitlement({
          adminUserId,
          targetUserId: proTargetId,
          plan: PlanType.FREE,
          source: ComplimentaryEntitlementSource.MANUAL_ADMIN,
          reason: "Complimentary Free is not a valid grant",
        }),
        matchesEntitlementError("INVALID_PLAN"),
      );
      await assert.rejects(
        createComplimentaryEntitlement({
          adminUserId,
          targetUserId: proTargetId,
          plan: PlanType.PRO,
          source: ComplimentaryEntitlementSource.MANUAL_ADMIN,
          reason: "Invalid date attempt",
          startsAt: new Date("2027-02-01T00:00:00.000Z"),
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        }),
        matchesEntitlementError("INVALID_EXPIRATION"),
      );
      await assert.rejects(
        createComplimentaryEntitlement({
          adminUserId,
          targetUserId: `missing-target-${testRunId}`,
          plan: PlanType.PRO,
          source: ComplimentaryEntitlementSource.MANUAL_ADMIN,
          reason: "Missing target attempt",
        }),
        matchesEntitlementError("TARGET_USER_NOT_FOUND"),
      );
    });

    test("requires explicit confirmation for an overlapping equal-or-higher grant", async () => {
      await assert.rejects(
        createComplimentaryEntitlement({
          adminUserId,
          targetUserId: proTargetId,
          plan: PlanType.PRO,
          source: ComplimentaryEntitlementSource.INTERNAL,
          reason: "Overlapping internal grant",
        }),
        matchesEntitlementError("OVERLAPPING_GRANT_CONFIRMATION_REQUIRED"),
      );

      const confirmed = await createComplimentaryEntitlement({
        adminUserId,
        targetUserId: proTargetId,
        plan: PlanType.PRO,
        source: ComplimentaryEntitlementSource.INTERNAL,
        reason: "Confirmed overlapping internal grant",
        confirmSupersede: true,
      });
      assert.equal(confirmed.plan, PlanType.PRO);
    });

    test("paid Starter plus complimentary Pro remains separate and falls back after revoke", async () => {
      const subscriptionBefore = await prisma.userSubscription.findFirstOrThrow({
        where: { userId: paidTargetId },
      });
      const grant = await createComplimentaryEntitlement({
        adminUserId,
        targetUserId: paidTargetId,
        plan: PlanType.PRO,
        source: ComplimentaryEntitlementSource.CUSTOMER_SUPPORT,
        reason: "Support resolution",
      });
      const upgraded = await getEffectiveEntitlement(paidTargetId);

      assert.equal(upgraded.effectivePlan, PlanType.PRO);
      assert.equal(upgraded.paidPlan, PlanType.STARTER);
      assert.equal(upgraded.source, "COMPLIMENTARY");

      await revokeComplimentaryEntitlement({
        adminUserId,
        entitlementId: grant.id,
        reason: "Support resolution completed",
      });
      const restored = await getEffectiveEntitlement(paidTargetId);
      const subscriptionAfter = await prisma.userSubscription.findFirstOrThrow({
        where: { userId: paidTargetId },
      });

      assert.equal(restored.effectivePlan, PlanType.STARTER);
      assert.equal(restored.source, "PAID");
      assert.equal(subscriptionAfter.id, subscriptionBefore.id);
      assert.equal(
        subscriptionAfter.stripeSubscriptionId,
        subscriptionBefore.stripeSubscriptionId,
      );
      assert.equal(subscriptionAfter.status, SubscriptionStatus.ACTIVE);
    });

    test("revocation is immediate, historic data remains, and a revoke event is written", async () => {
      const activeGrant = await prisma.complimentaryEntitlement.findFirstOrThrow({
        where: {
          userId: starterTargetId,
          revokedAt: null,
        },
      });
      const beforeRevocation = await getEffectiveEntitlement(starterTargetId);
      assert.equal(beforeRevocation.effectivePlan, PlanType.STARTER);

      await revokeComplimentaryEntitlement({
        adminUserId,
        entitlementId: activeGrant.id,
        reason: "Beta period ended",
      });

      const [effective, retained, event] = await Promise.all([
        getEffectiveEntitlement(starterTargetId),
        prisma.complimentaryEntitlement.findUniqueOrThrow({
          where: { id: activeGrant.id },
        }),
        prisma.partnerAdminAuditLog.findFirstOrThrow({
          where: {
            action: "COMPLIMENTARY_ENTITLEMENT_REVOKED",
            entityId: activeGrant.id,
          },
        }),
      ]);

      assert.equal(effective.effectivePlan, PlanType.FREE);
      assert.ok(retained.revokedAt);
      assert.equal(retained.revokedReason, "Beta period ended");
      assert.equal(event.adminUserId, adminUserId);
      assert.equal(event.reason, "Beta period ended");
      await assert.rejects(
        revokeComplimentaryEntitlement({
          adminUserId,
          entitlementId: activeGrant.id,
          reason: "Second revocation attempt",
        }),
        matchesEntitlementError("ENTITLEMENT_ALREADY_REVOKED"),
      );
    });

    test("internal notes and grant history are available only through the admin service", async () => {
      const summary = await getUserEntitlementSummary({
        adminUserId,
        targetUserId: proTargetId,
      });
      assert.ok(
        summary.user.complimentaryEntitlements.some(
          (grant) =>
            grant.source === ComplimentaryEntitlementSource.FOUNDER &&
            grant.internalNotes === "Founder access approved by operations",
        ),
      );

      await assert.rejects(
        getUserEntitlementSummary({
          adminUserId: normalUserId,
          targetUserId: proTargetId,
        }),
        (error: unknown) =>
          error instanceof Error &&
          /Administrator access is required/i.test(error.message),
      );
      const effective = await getEffectiveEntitlement(proTargetId);
      assert.equal(
        "internalNotes" in (effective.complimentaryEntitlement ?? {}),
        false,
      );
    });

    test("complimentary access does not alter existing account security gates", async () => {
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: restrictedTargetId },
        select: {
          emailVerificationRequiredAt: true,
          sessionVersion: true,
        },
      });
      await createComplimentaryEntitlement({
        adminUserId,
        targetUserId: restrictedTargetId,
        plan: PlanType.PRO,
        source: ComplimentaryEntitlementSource.INTERNAL,
        reason: "Restricted account isolation check",
      });
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: restrictedTargetId },
        select: {
          emailVerificationRequiredAt: true,
          sessionVersion: true,
        },
      });

      assert.deepEqual(after, before);
      assert.ok(after.emailVerificationRequiredAt);
    });
  },
);

async function createUser(
  label: string,
  role: UserRole,
  overrides: {
    emailVerified?: Date | null;
    emailVerificationRequiredAt?: Date | null;
    sessionVersion?: number;
  } = {},
) {
  const user = await prisma.user.create({
    data: {
      id: `complimentary-test-${label}-${testRunId}`,
      name: `Entitlement ${label}`,
      email: `entitlement-${label}-${testRunId}@example.test`,
      role,
      emailVerified: new Date(),
      ...overrides,
    },
  });
  userIds.push(user.id);
  return user;
}

async function billingSideEffectCounts() {
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

function matchesEntitlementError(code: string) {
  return (error: unknown) =>
    error instanceof ComplimentaryEntitlementError && error.code === code;
}

import "server-only";

import {
  ComplimentaryEntitlementSource,
  PlanType,
  Prisma,
  UserRole,
} from "@prisma/client";

import { planRank } from "@/lib/billing/effective-entitlement";
import { getUserSubscriptionSummary } from "@/lib/billing/entitlements";
import { assertAdminUser } from "@/lib/partners/admin-authorization";
import { prisma } from "@/lib/prisma";

export const complimentaryEntitlementPlans = [
  PlanType.STARTER,
  PlanType.PRO,
] as const;

export const complimentaryEntitlementSources = [
  ComplimentaryEntitlementSource.FOUNDER,
  ComplimentaryEntitlementSource.INTERNAL,
  ComplimentaryEntitlementSource.BETA,
  ComplimentaryEntitlementSource.PROMOTION,
  ComplimentaryEntitlementSource.CUSTOMER_SUPPORT,
  ComplimentaryEntitlementSource.MANUAL_ADMIN,
] as const;

export class ComplimentaryEntitlementError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ComplimentaryEntitlementError";
  }
}

export type GrantComplimentaryEntitlementInput = {
  adminUserId: string;
  targetUserId: string;
  plan: unknown;
  source: unknown;
  reason: string;
  internalNotes?: string | null;
  startsAt?: Date;
  expiresAt?: Date | null;
  confirmSupersede?: boolean;
};

export async function createComplimentaryEntitlement(
  input: GrantComplimentaryEntitlementInput,
  now = new Date(),
) {
  const validated = validateGrantInput(input, now);

  return prisma.$transaction(async (transaction) => {
    await assertAdminInTransaction(transaction, input.adminUserId);
    const targetUser = await transaction.user.findUnique({
      where: { id: input.targetUserId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new ComplimentaryEntitlementError(
        "The selected user no longer exists.",
        "TARGET_USER_NOT_FOUND",
        404,
      );
    }

    const equalOrHigherPlans = complimentaryEntitlementPlans.filter(
      (plan) => planRank(plan) >= planRank(validated.plan),
    );
    const supersededGrant =
      await transaction.complimentaryEntitlement.findFirst({
        where: {
          userId: input.targetUserId,
          revokedAt: null,
          plan: { in: [...equalOrHigherPlans] },
          ...(validated.expiresAt
            ? { startsAt: { lt: validated.expiresAt } }
            : {}),
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: validated.startsAt } },
          ],
        },
        select: {
          id: true,
        },
        orderBy: { createdAt: "desc" },
      });

    if (supersededGrant && !input.confirmSupersede) {
      throw new ComplimentaryEntitlementError(
        "This user already has an overlapping equal-or-higher complimentary grant. Confirm the overlap before continuing.",
        "OVERLAPPING_GRANT_CONFIRMATION_REQUIRED",
        409,
      );
    }

    const entitlement = await transaction.complimentaryEntitlement.create({
      data: {
        userId: input.targetUserId,
        plan: validated.plan,
        source: validated.source,
        reason: validated.reason,
        internalNotes: validated.internalNotes,
        startsAt: validated.startsAt,
        expiresAt: validated.expiresAt,
        grantedByUserId: input.adminUserId,
      },
    });

    await transaction.partnerAdminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: "COMPLIMENTARY_ENTITLEMENT_GRANTED",
        entityType: "ComplimentaryEntitlement",
        entityId: entitlement.id,
        afterState: entitlementAuditSnapshot(entitlement),
        reason: validated.reason,
      },
    });

    return entitlement;
  });
}

export async function revokeComplimentaryEntitlement(input: {
  adminUserId: string;
  entitlementId: string;
  reason: string;
  revokedAt?: Date;
}) {
  const reason = requiredText(input.reason, "A revocation reason is required.");
  const revokedAt = input.revokedAt ?? new Date();

  if (!isValidDate(revokedAt)) {
    throw new ComplimentaryEntitlementError(
      "The revocation date is invalid.",
      "INVALID_REVOCATION_DATE",
    );
  }

  return prisma.$transaction(async (transaction) => {
    await assertAdminInTransaction(transaction, input.adminUserId);
    const current = await transaction.complimentaryEntitlement.findUnique({
      where: { id: input.entitlementId },
    });

    if (!current) {
      throw new ComplimentaryEntitlementError(
        "The complimentary grant was not found.",
        "ENTITLEMENT_NOT_FOUND",
        404,
      );
    }

    if (current.revokedAt) {
      throw new ComplimentaryEntitlementError(
        "This complimentary grant has already been revoked.",
        "ENTITLEMENT_ALREADY_REVOKED",
        409,
      );
    }

    const entitlement = await transaction.complimentaryEntitlement.update({
      where: { id: current.id },
      data: {
        revokedAt,
        revokedReason: reason,
        revokedByUserId: input.adminUserId,
      },
    });

    await transaction.partnerAdminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: "COMPLIMENTARY_ENTITLEMENT_REVOKED",
        entityType: "ComplimentaryEntitlement",
        entityId: entitlement.id,
        beforeState: entitlementAuditSnapshot(current),
        afterState: entitlementAuditSnapshot(entitlement),
        reason,
      },
    });

    return entitlement;
  });
}

export async function listComplimentaryEntitlements(input: {
  adminUserId: string;
  query?: string;
  plan?: PlanType;
  source?: ComplimentaryEntitlementSource;
  status?: "SCHEDULED" | "ACTIVE" | "EXPIRED" | "REVOKED";
  now?: Date;
  take?: number;
}) {
  await assertAdminUser(input.adminUserId);
  const now = input.now ?? new Date();
  const query = input.query?.trim().slice(0, 200);
  const take = Math.min(100, Math.max(1, input.take ?? 50));
  const where: Prisma.ComplimentaryEntitlementWhereInput = {
    ...(input.plan ? { plan: input.plan } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(query
      ? {
          user: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          },
        }
      : {}),
    ...statusWhere(input.status, now),
  };

  return prisma.complimentaryEntitlement.findMany({
    where,
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      grantedByUser: {
        select: { id: true, name: true, email: true },
      },
      revokedByUser: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
}

export async function searchEntitlementUsers(input: {
  adminUserId: string;
  query: string;
  take?: number;
}) {
  await assertAdminUser(input.adminUserId);
  const query = input.query.trim().slice(0, 200);
  if (query.length < 2) return [];

  return prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: Math.min(50, Math.max(1, input.take ?? 20)),
  });
}

export async function getUserEntitlementSummary(input: {
  adminUserId: string;
  targetUserId: string;
}) {
  await assertAdminUser(input.adminUserId);
  const user = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      complimentaryEntitlements: {
        include: {
          grantedByUser: {
            select: { id: true, name: true, email: true },
          },
          revokedByUser: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  });

  if (!user) {
    throw new ComplimentaryEntitlementError(
      "The selected user was not found.",
      "TARGET_USER_NOT_FOUND",
      404,
    );
  }

  const [billing, auditEvents] = await Promise.all([
    getUserSubscriptionSummary(user.id),
    prisma.partnerAdminAuditLog.findMany({
      where: {
        entityType: "ComplimentaryEntitlement",
        entityId: {
          in: user.complimentaryEntitlements.map(
            (entitlement) => entitlement.id,
          ),
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return { user, billing, auditEvents };
}

function validateGrantInput(
  input: GrantComplimentaryEntitlementInput,
  now: Date,
) {
  if (
    typeof input.plan !== "string" ||
    !complimentaryEntitlementPlans.includes(
      input.plan as (typeof complimentaryEntitlementPlans)[number],
    )
  ) {
    throw new ComplimentaryEntitlementError(
      "Complimentary access can only grant Starter or Pro.",
      "INVALID_PLAN",
    );
  }

  if (
    typeof input.source !== "string" ||
    !complimentaryEntitlementSources.includes(
      input.source as (typeof complimentaryEntitlementSources)[number],
    )
  ) {
    throw new ComplimentaryEntitlementError(
      "Select a valid complimentary access source.",
      "INVALID_SOURCE",
    );
  }

  const startsAt = input.startsAt ?? now;
  const expiresAt = input.expiresAt ?? null;

  if (!isValidDate(startsAt) || (expiresAt && !isValidDate(expiresAt))) {
    throw new ComplimentaryEntitlementError(
      "Enter valid access dates.",
      "INVALID_DATE",
    );
  }

  if (expiresAt && expiresAt <= startsAt) {
    throw new ComplimentaryEntitlementError(
      "Expiration must be after the access start time.",
      "INVALID_EXPIRATION",
    );
  }

  return {
    plan: input.plan as (typeof complimentaryEntitlementPlans)[number],
    source:
      input.source as (typeof complimentaryEntitlementSources)[number],
    reason: requiredText(input.reason, "A grant reason is required."),
    internalNotes: optionalText(input.internalNotes, 5_000),
    startsAt,
    expiresAt,
  };
}

async function assertAdminInTransaction(
  transaction: Prisma.TransactionClient,
  adminUserId: string,
) {
  const admin = await transaction.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true },
  });

  if (!admin || admin.role !== UserRole.ADMIN) {
    throw new ComplimentaryEntitlementError(
      "Administrator access is required.",
      "FORBIDDEN",
      403,
    );
  }
}

function statusWhere(
  status: "SCHEDULED" | "ACTIVE" | "EXPIRED" | "REVOKED" | undefined,
  now: Date,
): Prisma.ComplimentaryEntitlementWhereInput {
  if (status === "REVOKED") return { revokedAt: { not: null } };
  if (status === "SCHEDULED") {
    return { revokedAt: null, startsAt: { gt: now } };
  }
  if (status === "EXPIRED") {
    return {
      revokedAt: null,
      startsAt: { lte: now },
      expiresAt: { lte: now },
    };
  }
  if (status === "ACTIVE") {
    return {
      revokedAt: null,
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
  }
  return {};
}

function entitlementAuditSnapshot(
  entitlement: {
    id: string;
    userId: string;
    plan: PlanType;
    source: ComplimentaryEntitlementSource;
    startsAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
    revokedByUserId: string | null;
    revokedReason: string | null;
    grantedByUserId: string;
  },
): Prisma.InputJsonValue {
  return {
    grantId: entitlement.id,
    targetUserId: entitlement.userId,
    plan: entitlement.plan,
    source: entitlement.source,
    startsAt: entitlement.startsAt.toISOString(),
    expiresAt: entitlement.expiresAt?.toISOString() ?? null,
    revokedAt: entitlement.revokedAt?.toISOString() ?? null,
    grantedByUserId: entitlement.grantedByUserId,
    revokedByUserId: entitlement.revokedByUserId,
    revocationReason: entitlement.revokedReason,
  };
}

function requiredText(value: string, message: string) {
  const normalized = value.trim().slice(0, 1_000);
  if (!normalized) {
    throw new ComplimentaryEntitlementError(message, "REASON_REQUIRED");
  }
  return normalized;
}

function optionalText(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim().slice(0, maxLength);
  return normalized || null;
}

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime());
}

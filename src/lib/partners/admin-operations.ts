import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import {
  PartnerAttributionSource,
  PartnerAttributionStatus,
  PartnerCommissionAdjustmentType,
  PartnerCommissionStatus,
  PartnerStatus,
} from "@prisma/client";

import { assertAdminUser } from "@/lib/partners/admin-authorization";
import { PartnerProgramError } from "@/lib/partners/errors";
import { normalizeReferralCode } from "@/lib/partners/referral-policy";
import { prisma } from "@/lib/prisma";

function requiredReason(value: string) {
  const reason = value.trim().slice(0, 1_000);
  if (reason.length < 3) {
    throw new PartnerProgramError("A specific administrator reason is required.", "REASON_REQUIRED");
  }
  return reason;
}

async function unusedReferralCode(displayName: string) {
  const base = normalizeReferralCode(displayName).slice(0, 22) || "partner";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `${base}-${randomBytes(4).toString("hex")}`;
    const existing = await prisma.partnerProfile.findUnique({
      where: { normalizedReferralCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new PartnerProgramError("A replacement code could not be generated.", "REFERRAL_CODE_FAILED", 500);
}

export async function replacePartnerReferralCode(input: {
  adminUserId: string;
  partnerId: string;
  reason: string;
}) {
  await assertAdminUser(input.adminUserId);
  const reason = requiredReason(input.reason);
  const partner = await prisma.partnerProfile.findUnique({
    where: { id: input.partnerId },
    include: { application: { select: { displayName: true } }, user: { select: { name: true } } },
  });
  if (!partner) throw new PartnerProgramError("Partner not found.", "PARTNER_NOT_FOUND", 404);
  const referralCode = await unusedReferralCode(
    partner.application?.displayName || partner.user.name || "partner",
  );

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.partnerProfile.update({
      where: { id: partner.id },
      data: { referralCode, normalizedReferralCode: normalizeReferralCode(referralCode) },
    });
    await transaction.partnerAdminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        partnerId: partner.id,
        action: "REFERRAL_CODE_REPLACED",
        entityType: "PartnerProfile",
        entityId: partner.id,
        beforeState: { referralCode: partner.referralCode },
        afterState: { referralCode },
        reason,
      },
    });
    return updated;
  });
}

export async function resetPartnerTraining(input: {
  adminUserId: string;
  partnerId: string;
  reason: string;
}) {
  await assertAdminUser(input.adminUserId);
  const reason = requiredReason(input.reason);
  const partner = await prisma.partnerProfile.findUnique({ where: { id: input.partnerId } });
  if (!partner) throw new PartnerProgramError("Partner not found.", "PARTNER_NOT_FOUND", 404);
  if (partner.status === PartnerStatus.TERMINATED) {
    throw new PartnerProgramError("A terminated partner cannot restart training.", "PARTNER_TERMINATED", 409);
  }

  return prisma.$transaction(async (transaction) => {
    await transaction.partnerTrainingProgress.deleteMany({ where: { partnerId: partner.id } });
    await transaction.partnerTrainingAssessment.deleteMany({ where: { partnerId: partner.id } });
    const updated = await transaction.partnerProfile.update({
      where: { id: partner.id },
      data: {
        status: PartnerStatus.PENDING_TRAINING,
        referralEnabled: false,
        scannerEnabled: false,
        trainingCompletedAt: null,
        certificationIssuedAt: null,
      },
    });
    await transaction.partnerAdminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        partnerId: partner.id,
        action: "PARTNER_TRAINING_RESET",
        entityType: "PartnerProfile",
        entityId: partner.id,
        beforeState: { status: partner.status, certificationIssuedAt: partner.certificationIssuedAt },
        afterState: { status: updated.status, certificationIssuedAt: null },
        reason,
      },
    });
    return updated;
  });
}

export async function requirePartnerTermsReacceptance(input: {
  adminUserId: string;
  partnerId: string;
  reason: string;
}) {
  await assertAdminUser(input.adminUserId);
  const reason = requiredReason(input.reason);
  const partner = await prisma.partnerProfile.findUnique({ where: { id: input.partnerId } });
  if (!partner) throw new PartnerProgramError("Partner not found.", "PARTNER_NOT_FOUND", 404);
  if (partner.status === PartnerStatus.TERMINATED) {
    throw new PartnerProgramError("A terminated partner cannot be reactivated.", "PARTNER_TERMINATED", 409);
  }
  const requiredAt = new Date();

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.partnerProfile.update({
      where: { id: partner.id },
      data: {
        status: PartnerStatus.PENDING_TRAINING,
        referralEnabled: false,
        scannerEnabled: false,
        currentTermsVersion: null,
        termsAcceptedAt: null,
        termsReacceptRequiredAt: requiredAt,
      },
    });
    await transaction.partnerAdminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        partnerId: partner.id,
        action: "PARTNER_TERMS_REACCEPTANCE_REQUIRED",
        entityType: "PartnerProfile",
        entityId: partner.id,
        beforeState: { currentTermsVersion: partner.currentTermsVersion, termsAcceptedAt: partner.termsAcceptedAt },
        afterState: { requiredAt },
        reason,
      },
    });
    return updated;
  });
}

export async function overridePartnerAttribution(input: {
  adminUserId: string;
  partnerId: string;
  referredUserId: string;
  reason: string;
}) {
  await assertAdminUser(input.adminUserId);
  const reason = requiredReason(input.reason);
  const [partner, referredUser, existing] = await Promise.all([
    prisma.partnerProfile.findUnique({ where: { id: input.partnerId } }),
    prisma.user.findUnique({ where: { id: input.referredUserId }, select: { id: true, createdAt: true } }),
    prisma.partnerReferralAttribution.findUnique({
      where: { referredUserId: input.referredUserId },
      include: { _count: { select: { commissions: true } } },
    }),
  ]);
  if (!partner || partner.status !== PartnerStatus.ACTIVE) {
    throw new PartnerProgramError("Select an active partner.", "PARTNER_INACTIVE", 409);
  }
  if (!referredUser) throw new PartnerProgramError("Referred user not found.", "USER_NOT_FOUND", 404);
  if (partner.userId === referredUser.id) {
    throw new PartnerProgramError("Self-referrals cannot be created by override.", "SELF_REFERRAL", 409);
  }
  if (existing?._count.commissions) {
    throw new PartnerProgramError(
      "Attribution with a financial ledger cannot be reassigned. Use a documented commission adjustment instead.",
      "ATTRIBUTION_HAS_COMMISSIONS",
      409,
    );
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + partner.referralWindowDays * 86_400_000);

  return prisma.$transaction(async (transaction) => {
    const attribution = existing
      ? await transaction.partnerReferralAttribution.update({
          where: { id: existing.id },
          data: {
            partnerId: partner.id,
            referralCode: partner.referralCode,
            status: PartnerAttributionStatus.OVERRIDDEN,
            source: PartnerAttributionSource.ADMIN_OVERRIDE,
            firstVisitAt: now,
            signupAt: referredUser.createdAt,
            expiresAt,
            landingPath: "/admin-override",
            prospectId: null,
            lockedAt: now,
            disqualifiedAt: null,
            disqualificationReason: null,
            overriddenAt: now,
            overriddenByUserId: input.adminUserId,
            overrideReason: reason,
          },
        })
      : await transaction.partnerReferralAttribution.create({
          data: {
            partnerId: partner.id,
            referredUserId: referredUser.id,
            referralCode: partner.referralCode,
            status: PartnerAttributionStatus.OVERRIDDEN,
            source: PartnerAttributionSource.ADMIN_OVERRIDE,
            firstVisitAt: now,
            signupAt: referredUser.createdAt,
            expiresAt,
            landingPath: "/admin-override",
            overriddenAt: now,
            overriddenByUserId: input.adminUserId,
            overrideReason: reason,
          },
        });
    await transaction.partnerAdminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        partnerId: partner.id,
        action: "REFERRAL_ATTRIBUTION_OVERRIDDEN",
        entityType: "PartnerReferralAttribution",
        entityId: attribution.id,
        beforeState: existing ? { partnerId: existing.partnerId, status: existing.status } : undefined,
        afterState: { partnerId: partner.id, referredUserId: referredUser.id, status: attribution.status },
        reason,
      },
    });
    return attribution;
  });
}

export async function createManualCommissionAdjustment(input: {
  adminUserId: string;
  commissionId: string;
  direction: "CREDIT" | "DEBIT";
  amountCents: number;
  reason: string;
}) {
  await assertAdminUser(input.adminUserId);
  const reason = requiredReason(input.reason);
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 10_000_000) {
    throw new PartnerProgramError("Enter a positive adjustment amount in cents.", "INVALID_AMOUNT");
  }

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-commission:${input.commissionId}`}))`;
    const commission = await transaction.partnerCommission.findUnique({ where: { id: input.commissionId } });
    if (!commission) throw new PartnerProgramError("Commission not found.", "COMMISSION_NOT_FOUND", 404);
    const requestedSigned = input.direction === "CREDIT" ? input.amountCents : -input.amountCents;
    const signedAmount =
      commission.status === PartnerCommissionStatus.PAID || requestedSigned > 0
        ? requestedSigned
        : -Math.min(Math.abs(requestedSigned), commission.netCommissionAmountCents);
    if (signedAmount === 0) {
      throw new PartnerProgramError("This commission has no remaining amount to debit.", "NO_ADJUSTABLE_BALANCE", 409);
    }

    const adjustment = await transaction.partnerCommissionAdjustment.create({
      data: {
        commissionId: commission.id,
        partnerId: commission.partnerId,
        type:
          input.direction === "CREDIT"
            ? PartnerCommissionAdjustmentType.MANUAL_CREDIT
            : PartnerCommissionAdjustmentType.MANUAL_DEBIT,
        sourceKey: `manual:${randomUUID()}`,
        sourceEventId: `admin:${input.adminUserId}`,
        amountCents: signedAmount,
        reason,
        createdByUserId: input.adminUserId,
      },
    });

    if (commission.status !== PartnerCommissionStatus.PAID) {
      const nextNet = Math.max(0, commission.netCommissionAmountCents + signedAmount);
      await transaction.partnerCommission.update({
        where: { id: commission.id },
        data: {
          netCommissionAmountCents: nextNet,
          status:
            nextNet === 0
              ? PartnerCommissionStatus.REVERSED
              : nextNet < commission.originalCommissionAmountCents
                ? PartnerCommissionStatus.PARTIALLY_REVERSED
                : PartnerCommissionStatus.PENDING,
        },
      });
    }

    await transaction.partnerAdminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        partnerId: commission.partnerId,
        action: `COMMISSION_MANUAL_${input.direction}`,
        entityType: "PartnerCommissionAdjustment",
        entityId: adjustment.id,
        beforeState: { commissionId: commission.id, netCommissionAmountCents: commission.netCommissionAmountCents },
        afterState: { amountCents: signedAmount },
        reason,
      },
    });
    return adjustment;
  });
}

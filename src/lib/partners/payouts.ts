import "server-only";

import {
  PartnerCommissionStatus,
  PartnerPayoutEligibilityStatus,
  PartnerPayoutMethod,
  PartnerPayoutStatus,
  PartnerStatus,
} from "@prisma/client";

import { assertAdminUser } from "@/lib/partners/admin-authorization";
import { getPartnerProgramSettings } from "@/lib/partners/config";
import { PartnerProgramError } from "@/lib/partners/errors";
import { requiredPartnerAgreementTypes } from "@/lib/partners/training-content";
import { prisma } from "@/lib/prisma";

export async function getPartnerAvailableBalance(
  partnerId: string,
  currency = "usd",
  now = new Date(),
  database: Pick<typeof prisma, "partnerCommission" | "partnerCommissionAdjustment"> = prisma,
) {
  const [commissions, carryAdjustments] = await Promise.all([
    database.partnerCommission.findMany({
      where: {
        partnerId,
        currency: currency.toLowerCase(),
        availableAt: { lte: now },
        disputeOpen: false,
        netCommissionAmountCents: { gt: 0 },
        status: {
          in: [
            PartnerCommissionStatus.PENDING,
            PartnerCommissionStatus.AVAILABLE,
            PartnerCommissionStatus.PARTIALLY_REVERSED,
          ],
        },
        payoutItem: { is: null },
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    }),
    database.partnerCommissionAdjustment.findMany({
      where: {
        partnerId,
        commission: {
          currency: currency.toLowerCase(),
          status: PartnerCommissionStatus.PAID,
        },
        payoutItem: { is: null },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const grossCommissionCents = commissions.reduce(
    (total, commission) => total + commission.netCommissionAmountCents,
    0,
  );
  const adjustmentCents = carryAdjustments.reduce(
    (total, adjustment) => total + adjustment.amountCents,
    0,
  );

  return {
    currency: currency.toLowerCase(),
    grossCommissionCents,
    adjustmentCents,
    netAvailableCents: grossCommissionCents + adjustmentCents,
    commissions,
    carryAdjustments,
  };
}

async function assertPayoutEligibility(
  partnerId: string,
  options: { allowTerminatedFinalPayout?: boolean } = {},
) {
  const settings = await getPartnerProgramSettings();
  if (!settings.enabled || !settings.manualPayoutWorkflowEnabled) {
    throw new PartnerProgramError("Manual payouts are currently disabled.", "PAYOUTS_DISABLED", 403);
  }

  const partner = await prisma.partnerProfile.findUnique({ where: { id: partnerId } });
  if (!partner) throw new PartnerProgramError("Partner not found.", "PARTNER_NOT_FOUND", 404);
  const finalPayoutAllowed =
    options.allowTerminatedFinalPayout && partner.status === PartnerStatus.TERMINATED;
  if (partner.status !== PartnerStatus.ACTIVE && !finalPayoutAllowed) {
    throw new PartnerProgramError("The partner is not active.", "PARTNER_INACTIVE", 409);
  }
  if (partner.payoutEligibilityStatus !== PartnerPayoutEligibilityStatus.ELIGIBLE) {
    throw new PartnerProgramError("Payout eligibility is not approved.", "PAYOUT_NOT_ELIGIBLE", 409);
  }
  if (partner.complianceReviewStatus !== "CLEAR") {
    throw new PartnerProgramError("A compliance review is blocking payouts.", "COMPLIANCE_BLOCK", 409);
  }
  if (!partner.payoutContactEmail || !partner.payoutMethod) {
    throw new PartnerProgramError("Payout contact settings are incomplete.", "PAYOUT_SETTINGS_REQUIRED", 409);
  }

  const accepted = await prisma.partnerAgreementAcceptance.count({
    where: {
      partnerId,
      version: settings.currentTermsVersion,
      ...(partner.termsReacceptRequiredAt
        ? { acceptedAt: { gte: partner.termsReacceptRequiredAt } }
        : {}),
      agreementType: { in: [...requiredPartnerAgreementTypes] },
    },
  });
  if (accepted < requiredPartnerAgreementTypes.length) {
    throw new PartnerProgramError("Current partner agreements must be accepted.", "TERMS_OUTDATED", 409);
  }

  return { partner, settings };
}

export async function createManualPartnerPayout(input: {
  adminUserId: string;
  partnerId: string;
  currency?: string;
  periodStart: Date;
  periodEnd: Date;
  thresholdOverrideReason?: string;
  finalPayoutReason?: string;
  adminNotes?: string;
}) {
  await assertAdminUser(input.adminUserId);
  const finalPayoutReason = input.finalPayoutReason?.trim().slice(0, 1_000) || null;
  const { partner } = await assertPayoutEligibility(input.partnerId, {
    allowTerminatedFinalPayout: Boolean(finalPayoutReason),
  });
  const currency = (input.currency ?? "usd").trim().toLowerCase();
  if (currency !== "usd") {
    throw new PartnerProgramError("Only USD payouts are operational in v1.", "CURRENCY_UNSUPPORTED", 409);
  }
  const overrideReason = input.thresholdOverrideReason?.trim().slice(0, 1_000) || null;
  if (
    !Number.isFinite(input.periodStart.getTime()) ||
    !Number.isFinite(input.periodEnd.getTime()) ||
    input.periodStart > input.periodEnd
  ) {
    throw new PartnerProgramError("Select a valid payout period.", "INVALID_PAYOUT_PERIOD");
  }

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-payout:${input.partnerId}:${currency}`}))`;
    const balance = await getPartnerAvailableBalance(
      input.partnerId,
      currency,
      new Date(),
      transaction,
    );
    if (balance.netAvailableCents <= 0) {
      throw new PartnerProgramError("There is no positive available balance.", "NO_AVAILABLE_BALANCE", 409);
    }
    if (balance.netAvailableCents < partner.minimumPayoutCents && !overrideReason) {
      throw new PartnerProgramError(
        `The available balance is below the ${partner.minimumPayoutCents}-cent payout minimum.`,
        "PAYOUT_MINIMUM_NOT_MET",
        409,
      );
    }
    const usedCommission = await transaction.partnerPayoutItem.findFirst({
      where: { commissionId: { in: balance.commissions.map((item) => item.id) } },
      select: { id: true },
    });
    const usedAdjustment = await transaction.partnerPayoutAdjustmentItem.findFirst({
      where: {
        adjustmentId: { in: balance.carryAdjustments.map((item) => item.id) },
      },
      select: { id: true },
    });
    if (usedCommission || usedAdjustment) {
      throw new PartnerProgramError("Available items changed. Refresh and try again.", "PAYOUT_ITEMS_CHANGED", 409);
    }

    const payout = await transaction.partnerPayout.create({
      data: {
        partnerId: input.partnerId,
        currency,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        grossCommissionCents: balance.grossCommissionCents,
        adjustmentCents: balance.adjustmentCents,
        netPayoutCents: balance.netAvailableCents,
        thresholdOverrideReason: overrideReason,
        adminNotes:
          [
            input.adminNotes?.trim().slice(0, 2_000),
            finalPayoutReason ? `Final payout authorization: ${finalPayoutReason}` : null,
          ]
            .filter(Boolean)
            .join("\n") || null,
        createdByUserId: input.adminUserId,
        items: {
          create: balance.commissions.map((commission) => ({
            commissionId: commission.id,
            amountCents: commission.netCommissionAmountCents,
          })),
        },
        adjustmentItems: {
          create: balance.carryAdjustments.map((adjustment) => ({
            adjustmentId: adjustment.id,
            amountCents: adjustment.amountCents,
          })),
        },
      },
    });
    await transaction.partnerAdminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        partnerId: input.partnerId,
        action: "PAYOUT_CREATED",
        entityType: "PartnerPayout",
        entityId: payout.id,
        afterState: {
          currency,
          netPayoutCents: balance.netAvailableCents,
          commissionCount: balance.commissions.length,
          adjustmentCount: balance.carryAdjustments.length,
        },
        reason:
          finalPayoutReason ??
          overrideReason ??
          "Available balance met the configured payout minimum.",
      },
    });
    return payout;
  });
}

export async function approveManualPartnerPayout(input: {
  adminUserId: string;
  payoutId: string;
  reason: string;
}) {
  await assertAdminUser(input.adminUserId);
  const reason = input.reason.trim();
  if (!reason) throw new PartnerProgramError("An approval reason is required.", "REASON_REQUIRED");
  const payout = await prisma.partnerPayout.findUnique({ where: { id: input.payoutId } });
  if (!payout || payout.status !== PartnerPayoutStatus.DRAFT) {
    throw new PartnerProgramError("Only draft payouts may be approved.", "PAYOUT_NOT_DRAFT", 409);
  }

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.partnerPayout.update({
      where: { id: payout.id },
      data: {
        status: PartnerPayoutStatus.APPROVED,
        approvedAt: new Date(),
        approvedByUserId: input.adminUserId,
      },
    });
    await transaction.partnerAdminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        partnerId: payout.partnerId,
        action: "PAYOUT_APPROVED",
        entityType: "PartnerPayout",
        entityId: payout.id,
        beforeState: { status: payout.status },
        afterState: { status: updated.status },
        reason,
      },
    });
    return updated;
  });
}

export async function markManualPartnerPayoutPaid(input: {
  adminUserId: string;
  payoutId: string;
  paymentMethod: PartnerPayoutMethod;
  externalReference: string;
  reason: string;
  paidAt?: Date;
}) {
  await assertAdminUser(input.adminUserId);
  const externalReference = input.externalReference.trim().slice(0, 200);
  const reason = input.reason.trim().slice(0, 1_000);
  if (!externalReference || !reason) {
    throw new PartnerProgramError("Payment reference and reason are required.", "PAYMENT_DETAILS_REQUIRED");
  }
  const payout = await prisma.partnerPayout.findUnique({
    where: { id: input.payoutId },
    include: { items: true, partner: true },
  });
  if (!payout || payout.status !== PartnerPayoutStatus.APPROVED) {
    throw new PartnerProgramError("Only approved payouts may be marked paid.", "PAYOUT_NOT_APPROVED", 409);
  }
  const paidAt = input.paidAt ?? new Date();

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.partnerPayout.update({
      where: { id: payout.id },
      data: {
        status: PartnerPayoutStatus.PAID,
        paymentMethod: input.paymentMethod,
        externalReference,
        paidAt,
      },
    });
    await transaction.partnerCommission.updateMany({
      where: { id: { in: payout.items.map((item) => item.commissionId) } },
      data: { status: PartnerCommissionStatus.PAID, paidAt },
    });
    await transaction.partnerAdminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        partnerId: payout.partnerId,
        action: "PAYOUT_MARKED_PAID",
        entityType: "PartnerPayout",
        entityId: payout.id,
        beforeState: { status: payout.status },
        afterState: {
          status: updated.status,
          paymentMethod: input.paymentMethod,
          externalReference,
        },
        reason,
      },
    });
    await transaction.partnerNotification.create({
      data: {
        userId: payout.partner.userId,
        partnerId: payout.partnerId,
        type: "PARTNER_PAYOUT_PAID",
        title: "Payout recorded",
        message: `A ${payout.currency.toUpperCase()} payout was marked paid with the external reference on file.`,
      },
    });
    return updated;
  });
}

export async function cancelManualPartnerPayout(input: {
  adminUserId: string;
  payoutId: string;
  reason: string;
}) {
  await assertAdminUser(input.adminUserId);
  const reason = input.reason.trim();
  if (!reason) throw new PartnerProgramError("A cancellation reason is required.", "REASON_REQUIRED");
  const payout = await prisma.partnerPayout.findUnique({ where: { id: input.payoutId } });
  if (
    !payout ||
    (payout.status !== PartnerPayoutStatus.DRAFT &&
      payout.status !== PartnerPayoutStatus.APPROVED)
  ) {
    throw new PartnerProgramError("This payout cannot be canceled.", "PAYOUT_CANCEL_NOT_ALLOWED", 409);
  }

  return prisma.$transaction(async (transaction) => {
    await transaction.partnerPayoutItem.deleteMany({ where: { payoutId: payout.id } });
    await transaction.partnerPayoutAdjustmentItem.deleteMany({ where: { payoutId: payout.id } });
    const updated = await transaction.partnerPayout.update({
      where: { id: payout.id },
      data: { status: PartnerPayoutStatus.CANCELED, canceledAt: new Date() },
    });
    await transaction.partnerAdminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        partnerId: payout.partnerId,
        action: "PAYOUT_CANCELED",
        entityType: "PartnerPayout",
        entityId: payout.id,
        beforeState: { status: payout.status },
        afterState: { status: updated.status },
        reason,
      },
    });
    return updated;
  });
}

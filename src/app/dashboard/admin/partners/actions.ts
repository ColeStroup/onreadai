"use server";

import { PartnerPayoutEligibilityStatus, PartnerStatus, PartnerTier } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { reviewPartnerApplication } from "@/lib/partners/applications";
import {
  overridePartnerAttribution,
  replacePartnerReferralCode,
  requirePartnerTermsReacceptance,
  resetPartnerTraining,
} from "@/lib/partners/admin-operations";
import { requireAdmin } from "@/lib/partners/authorization";
import { PartnerProgramError } from "@/lib/partners/errors";
import { prisma } from "@/lib/prisma";

export async function reviewPartnerApplicationAction(formData: FormData) {
  const admin = await requireAdmin("/dashboard/admin/partners/applications");
  const decision = String(formData.get("decision") ?? "");
  if (!["APPROVE", "REJECT", "WAITLIST"].includes(decision)) throw new Error("Invalid application decision.");
  await reviewPartnerApplication({ adminUserId: admin.id, applicationId: String(formData.get("applicationId") ?? ""), decision: decision as "APPROVE" | "REJECT" | "WAITLIST", reason: String(formData.get("reason") ?? "") });
  revalidatePath("/dashboard/admin/partners");
  revalidatePath("/dashboard/admin/partners/applications");
}

export async function updatePartnerProfileAction(partnerId: string, formData: FormData) {
  const admin = await requireAdmin(`/dashboard/admin/partners/${partnerId}`);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);
  if (!reason) throw new PartnerProgramError("A reason is required.", "REASON_REQUIRED");
  const current = await prisma.partnerProfile.findUnique({ where: { id: partnerId } });
  if (!current) throw new Error("Partner not found.");
  const status = String(formData.get("status") ?? current.status) as PartnerStatus;
  const tier = String(formData.get("tier") ?? current.tier) as PartnerTier;
  const payoutEligibilityStatus = String(formData.get("payoutEligibilityStatus") ?? current.payoutEligibilityStatus) as PartnerPayoutEligibilityStatus;
  if (!Object.values(PartnerStatus).includes(status) || !Object.values(PartnerTier).includes(tier) || !Object.values(PartnerPayoutEligibilityStatus).includes(payoutEligibilityStatus)) throw new Error("Invalid partner settings.");
  if (
    status === PartnerStatus.ACTIVE &&
    current.status === PartnerStatus.PENDING_TRAINING &&
    !current.certificationIssuedAt
  ) {
    throw new PartnerProgramError(
      "Training, assessment, and agreement requirements must activate this partner.",
      "CERTIFICATION_REQUIRED",
      409,
    );
  }
  const integer = (name: string, fallback: number, min: number, max: number) => { const value = Number.parseInt(String(formData.get(name) ?? fallback), 10); return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; };
  const referralRequested = formData.get("referralEnabled") === "on";
  const scannerRequested = formData.get("scannerEnabled") === "on";
  const active = status === PartnerStatus.ACTIVE;
  const data = {
    status,
    tier,
    payoutEligibilityStatus,
    commissionRateBps: integer("commissionRateBps", current.commissionRateBps, 0, 10_000),
    recurringCommissionMonths: integer("recurringCommissionMonths", current.recurringCommissionMonths, 0, 60),
    referralWindowDays: integer("referralWindowDays", current.referralWindowDays, 1, 365),
    commissionHoldDays: integer("commissionHoldDays", current.commissionHoldDays, 0, 180),
    minimumPayoutCents: integer("minimumPayoutCents", current.minimumPayoutCents, 0, 1_000_000),
    scannerDailyLimit: integer("scannerDailyLimit", current.scannerDailyLimit, 0, 1000),
    scannerMonthlyLimit: integer("scannerMonthlyLimit", current.scannerMonthlyLimit, 0, 25000),
    referralEnabled: active && referralRequested,
    scannerEnabled: active && scannerRequested,
    suspendedAt: status === PartnerStatus.SUSPENDED ? new Date() : null,
    terminatedAt: status === PartnerStatus.TERMINATED ? new Date() : null,
    suspensionReason: status === PartnerStatus.SUSPENDED ? reason : null,
    complianceReviewStatus: ["CLEAR", "REVIEW_REQUIRED", "BLOCKED"].includes(String(formData.get("complianceReviewStatus")))
      ? String(formData.get("complianceReviewStatus"))
      : current.complianceReviewStatus,
    internalNotes: String(formData.get("internalNotes") ?? current.internalNotes ?? "").trim().slice(0, 5000) || null,
  };
  await prisma.$transaction([prisma.partnerProfile.update({ where: { id: partnerId }, data }), prisma.partnerAdminAuditLog.create({ data: { adminUserId: admin.id, partnerId, action: "PARTNER_PROFILE_UPDATED", entityType: "PartnerProfile", entityId: partnerId, beforeState: current, afterState: data, reason } })]);
  revalidatePath(`/dashboard/admin/partners/${partnerId}`);
  revalidatePath("/dashboard/admin/partners");
}

export async function replacePartnerReferralCodeAction(partnerId: string, formData: FormData) {
  const admin = await requireAdmin(`/dashboard/admin/partners/${partnerId}`);
  await replacePartnerReferralCode({ adminUserId: admin.id, partnerId, reason: String(formData.get("reason") ?? "") });
  revalidatePath(`/dashboard/admin/partners/${partnerId}`);
}

export async function resetPartnerTrainingAction(partnerId: string, formData: FormData) {
  const admin = await requireAdmin(`/dashboard/admin/partners/${partnerId}`);
  await resetPartnerTraining({ adminUserId: admin.id, partnerId, reason: String(formData.get("reason") ?? "") });
  revalidatePath(`/dashboard/admin/partners/${partnerId}`);
}

export async function requirePartnerTermsReacceptanceAction(partnerId: string, formData: FormData) {
  const admin = await requireAdmin(`/dashboard/admin/partners/${partnerId}`);
  await requirePartnerTermsReacceptance({ adminUserId: admin.id, partnerId, reason: String(formData.get("reason") ?? "") });
  revalidatePath(`/dashboard/admin/partners/${partnerId}`);
}

export async function overridePartnerAttributionAction(partnerId: string, formData: FormData) {
  const admin = await requireAdmin(`/dashboard/admin/partners/${partnerId}`);
  const email = String(formData.get("referredUserEmail") ?? "").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new PartnerProgramError("No user has that email address.", "USER_NOT_FOUND", 404);
  await overridePartnerAttribution({
    adminUserId: admin.id,
    partnerId,
    referredUserId: user.id,
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath(`/dashboard/admin/partners/${partnerId}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/partners/authorization";
import { getPartnerProgramSettings } from "@/lib/partners/config";
import { prisma } from "@/lib/prisma";

export async function updatePartnerProgramSettingsAction(formData: FormData) {
  const admin = await requireAdmin("/dashboard/admin/partners/settings");
  const current = await getPartnerProgramSettings();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1000);
  if (reason.length < 3) throw new Error("A reason is required for program changes.");
  if (formData.get("confirmFinancialChange") !== "on") {
    throw new Error("Confirm that you understand these settings affect future referrals and payments.");
  }
  const integer = (name: string, fallback: number, min: number, max: number) => { const value = Number.parseInt(String(formData.get(name) ?? fallback), 10); return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; };
  const countries = String(formData.get("approvedCountries") ?? "US").split(",").map((value) => value.trim().toUpperCase()).filter((value) => /^[A-Z]{2}$/.test(value));
  const data = { enabled: formData.get("enabled") === "on", applicationsOpen: formData.get("applicationsOpen") === "on", referralAttributionEnabled: formData.get("referralAttributionEnabled") === "on", commissionCreationEnabled: formData.get("commissionCreationEnabled") === "on", scannerEnabled: formData.get("scannerEnabled") === "on", previewPagesEnabled: formData.get("previewPagesEnabled") === "on", manualPayoutWorkflowEnabled: formData.get("manualPayoutWorkflowEnabled") === "on", defaultCommissionRateBps: integer("defaultCommissionRateBps", current.defaultCommissionRateBps, 0, 10000), defaultRecurringCommissionMonths: integer("defaultRecurringCommissionMonths", current.defaultRecurringCommissionMonths, 0, 60), defaultReferralWindowDays: integer("defaultReferralWindowDays", current.defaultReferralWindowDays, 1, 365), defaultCommissionHoldDays: integer("defaultCommissionHoldDays", current.defaultCommissionHoldDays, 0, 180), defaultMinimumPayoutCents: integer("defaultMinimumPayoutCents", current.defaultMinimumPayoutCents, 0, 1000000), defaultScannerDailyLimit: integer("defaultScannerDailyLimit", current.defaultScannerDailyLimit, 0, 1000), defaultScannerMonthlyLimit: integer("defaultScannerMonthlyLimit", current.defaultScannerMonthlyLimit, 0, 25000), scanCacheDays: integer("scanCacheDays", current.scanCacheDays, 1, 365), approvedCountries: countries.length ? countries : ["US"], currentTermsVersion: String(formData.get("currentTermsVersion") ?? current.currentTermsVersion).trim().slice(0, 30), currentTrainingVersion: String(formData.get("currentTrainingVersion") ?? current.currentTrainingVersion).trim().slice(0, 30), updatedByUserId: admin.id };
  await prisma.$transaction([prisma.partnerProgramSettings.update({ where: { id: current.id }, data }), prisma.partnerAdminAuditLog.create({ data: { adminUserId: admin.id, action: "PROGRAM_SETTINGS_UPDATED", entityType: "PartnerProgramSettings", entityId: current.id, beforeState: current, afterState: data, reason } })]);
  revalidatePath("/dashboard/admin/partners/settings");
  revalidatePath("/partners");
}

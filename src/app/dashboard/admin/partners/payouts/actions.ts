"use server";

import { PartnerPayoutMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/partners/authorization";
import {
  approveManualPartnerPayout,
  cancelManualPartnerPayout,
  createManualPartnerPayout,
  markManualPartnerPayoutPaid,
} from "@/lib/partners/payouts";

export async function createPartnerPayoutAction(formData: FormData) {
  const admin = await requireAdmin("/dashboard/admin/partners/payouts");
  await createManualPartnerPayout({
    adminUserId: admin.id,
    partnerId: String(formData.get("partnerId") ?? ""),
    currency: "usd",
    periodStart: new Date(String(formData.get("periodStart") ?? "")),
    periodEnd: new Date(String(formData.get("periodEnd") ?? "")),
    thresholdOverrideReason: String(formData.get("thresholdOverrideReason") ?? ""),
    finalPayoutReason: String(formData.get("finalPayoutReason") ?? ""),
    adminNotes: String(formData.get("adminNotes") ?? ""),
  });
  revalidatePath("/dashboard/admin/partners/payouts");
}

export async function approvePartnerPayoutAction(formData: FormData) {
  const admin = await requireAdmin("/dashboard/admin/partners/payouts");
  await approveManualPartnerPayout({ adminUserId: admin.id, payoutId: String(formData.get("payoutId") ?? ""), reason: String(formData.get("reason") ?? "") });
  revalidatePath("/dashboard/admin/partners/payouts");
}

export async function markPartnerPayoutPaidAction(formData: FormData) {
  const admin = await requireAdmin("/dashboard/admin/partners/payouts");
  const method = String(formData.get("paymentMethod") ?? "") as PartnerPayoutMethod;
  if (!Object.values(PartnerPayoutMethod).includes(method)) throw new Error("Invalid payout method.");
  await markManualPartnerPayoutPaid({ adminUserId: admin.id, payoutId: String(formData.get("payoutId") ?? ""), paymentMethod: method, externalReference: String(formData.get("externalReference") ?? ""), reason: String(formData.get("reason") ?? "") });
  revalidatePath("/dashboard/admin/partners/payouts");
}

export async function cancelPartnerPayoutAction(formData: FormData) {
  const admin = await requireAdmin("/dashboard/admin/partners/payouts");
  await cancelManualPartnerPayout({ adminUserId: admin.id, payoutId: String(formData.get("payoutId") ?? ""), reason: String(formData.get("reason") ?? "") });
  revalidatePath("/dashboard/admin/partners/payouts");
}

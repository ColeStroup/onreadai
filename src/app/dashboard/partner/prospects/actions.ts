"use server";

import { PartnerProspectStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePartner } from "@/lib/partners/authorization";
import { createPartnerProspectPreview } from "@/lib/partners/scanner";
import { prisma } from "@/lib/prisma";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";

export async function updatePartnerProspectAction(formData: FormData) {
  const { partner } = await requirePartner("/dashboard/partner/prospects");
  const prospectId = String(formData.get("prospectId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!Object.values(PartnerProspectStatus).includes(status as PartnerProspectStatus)) throw new Error("Invalid prospect status.");
  await prisma.partnerProspect.updateMany({ where: { id: prospectId, partnerId: partner.id }, data: { status: status as PartnerProspectStatus } });
  revalidatePath("/dashboard/partner/prospects");
}

export async function savePartnerProspectNotesAction(formData: FormData) {
  const { partner } = await requirePartner("/dashboard/partner/prospects");
  await prisma.partnerProspect.updateMany({ where: { id: String(formData.get("prospectId") ?? ""), partnerId: partner.id }, data: { notes: String(formData.get("notes") ?? "").trim().slice(0, 3000) || null, contactName: String(formData.get("contactName") ?? "").trim().slice(0, 160) || null, contactMethod: String(formData.get("contactMethod") ?? "").trim().slice(0, 240) || null } });
  revalidatePath("/dashboard/partner/prospects");
}

export async function createPartnerPreviewAction(formData: FormData) {
  const { partner } = await requirePartner("/dashboard/partner/prospects", { active: true });
  try {
    await enforceRateLimit({
      scope: "partner-preview",
      identifiers: [partner.id, await currentRequestRateLimitIdentifier()],
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect("/dashboard/partner/prospects?error=preview-rate");
    }
    throw error;
  }
  const { token } = await createPartnerProspectPreview({ partnerId: partner.id, prospectId: String(formData.get("prospectId") ?? "") });
  redirect(`/dashboard/partner/prospects?preview=${encodeURIComponent(token)}`);
}

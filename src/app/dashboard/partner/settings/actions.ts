"use server";

import { PartnerPayoutEligibilityStatus, PartnerPayoutMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requirePartner } from "@/lib/partners/authorization";

export async function updatePartnerPayoutSettingsAction(formData: FormData) {
  const { partner } = await requirePartner("/dashboard/partner/settings");
  const method = String(formData.get("payoutMethod") ?? "");
  const email = String(formData.get("payoutContactEmail") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("payoutAccountDisplayName") ?? "").trim().slice(0, 160);
  const instructions = String(formData.get("payoutInstructions") ?? "").trim().slice(0, 1_000);
  if (!Object.values(PartnerPayoutMethod).includes(method as PartnerPayoutMethod)) throw new Error("Select a supported payout method.");
  if (!email.includes("@")) throw new Error("Enter a valid payout contact email.");

  await (await import("@/lib/prisma")).prisma.partnerProfile.update({
    where: { id: partner.id },
    data: {
      payoutMethod: method as PartnerPayoutMethod,
      payoutContactEmail: email,
      payoutAccountDisplayName: displayName || null,
      payoutInstructions: instructions || null,
      payoutEligibilityStatus:
        partner.payoutEligibilityStatus === PartnerPayoutEligibilityStatus.NOT_CONFIGURED
          ? PartnerPayoutEligibilityStatus.PENDING_REVIEW
          : partner.payoutEligibilityStatus,
    },
  });
  revalidatePath("/dashboard/partner/settings");
  revalidatePath("/dashboard/partner");
}

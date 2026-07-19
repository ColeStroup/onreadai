"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/partners/authorization";
import { createManualCommissionAdjustment } from "@/lib/partners/admin-operations";

export async function createManualCommissionAdjustmentAction(
  commissionId: string,
  formData: FormData,
) {
  const admin = await requireAdmin("/dashboard/admin/partners/commissions");
  const direction = String(formData.get("direction") ?? "");
  if (direction !== "CREDIT" && direction !== "DEBIT") {
    throw new Error("Select a valid adjustment direction.");
  }
  await createManualCommissionAdjustment({
    adminUserId: admin.id,
    commissionId,
    direction,
    amountCents: Number.parseInt(String(formData.get("amountCents") ?? ""), 10),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath("/dashboard/admin/partners/commissions");
}

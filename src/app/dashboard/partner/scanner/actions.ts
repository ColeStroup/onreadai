"use server";

import { revalidatePath } from "next/cache";

import { requirePartner } from "@/lib/partners/authorization";
import { partnerErrorMessage } from "@/lib/partners/errors";
import { runPartnerProspectScan } from "@/lib/partners/scanner";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";

export type ScannerActionState = { status: "idle" | "error" | "success"; message: string; prospectId?: string };

export async function runPartnerScannerAction(_previous: ScannerActionState, formData: FormData): Promise<ScannerActionState> {
  const { partner } = await requirePartner("/dashboard/partner/scanner", { active: true });
  try {
    await enforceRateLimit({ scope: "partner-scanner", identifiers: [partner.id, await currentRequestRateLimitIdentifier()], limit: 10, windowMs: 5 * 60 * 1_000 });
    const result = await runPartnerProspectScan({ partnerId: partner.id, websiteUrl: String(formData.get("websiteUrl") ?? ""), businessName: String(formData.get("businessName") ?? "") });
    revalidatePath("/dashboard/partner/scanner");
    revalidatePath("/dashboard/partner/prospects");
    return { status: "success", message: result.cached ? "A recent safe scan was reused for this domain." : "The public website scan is complete.", prospectId: result.prospect.id };
  } catch (error) {
    if (error instanceof RateLimitError) return { status: "error", message: "Please wait before running another scan." };
    return { status: "error", message: partnerErrorMessage(error) };
  }
}

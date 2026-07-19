"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  submitPartnerApplication,
  withdrawPartnerApplication,
} from "@/lib/partners/applications";
import { partnerErrorMessage } from "@/lib/partners/errors";
import { getCurrentUser } from "@/lib/session";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";

export type PartnerApplicationState = {
  status: "idle" | "error" | "success";
  message: string;
};

export async function submitPartnerApplicationAction(
  _previous: PartnerApplicationState,
  formData: FormData,
): Promise<PartnerApplicationState> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/partners/apply");

  try {
    await enforceRateLimit({
      scope: "partner-application",
      identifiers: [user.id, await currentRequestRateLimitIdentifier()],
      limit: 5,
      windowMs: 24 * 60 * 60 * 1_000,
    });
    await submitPartnerApplication(user.id, {
      legalName: String(formData.get("legalName") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      email: String(formData.get("email") ?? user.email ?? ""),
      country: String(formData.get("country") ?? ""),
      stateOrRegion: String(formData.get("stateOrRegion") ?? ""),
      websiteUrl: String(formData.get("websiteUrl") ?? ""),
      socialProfiles: String(formData.get("socialProfiles") ?? "")
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
      experienceSummary: String(formData.get("experienceSummary") ?? ""),
      intendedPromotionMethods: formData
        .getAll("promotionMethod")
        .map(String),
      audienceOrOutreachSummary: String(
        formData.get("audienceOrOutreachSummary") ?? "",
      ),
      applicationMessage: String(formData.get("applicationMessage") ?? ""),
      ageConfirmation: formData.get("ageConfirmation") === "on",
      standardsAgreement: formData.get("standardsAgreement") === "on",
      earningsDisclaimerAccepted:
        formData.get("earningsDisclaimerAccepted") === "on",
    });
    revalidatePath("/partners/apply");
    return {
      status: "success",
      message: "Application received. An administrator will review it before any partner access is granted.",
    };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        status: "error",
        message: "Please wait before submitting another application.",
      };
    }
    return { status: "error", message: partnerErrorMessage(error) };
  }
}

export async function withdrawPartnerApplicationAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/partners/apply");
  await withdrawPartnerApplication(
    user.id,
    String(formData.get("applicationId") ?? ""),
  );
  revalidatePath("/partners/apply");
}

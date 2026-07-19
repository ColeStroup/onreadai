"use server";

import { AuthSecurityAction } from "@prisma/client";

import {
  AuthRateLimitError,
  currentAuthRateLimitKeys,
  recordAuthSecurityAttempt,
} from "@/lib/auth/rate-limit";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation";

export type ForgotPasswordState = {
  status: "idle" | "error" | "submitted";
  message: string;
};

export async function submitForgotPassword(
  _previousState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = normalizeEmail(formData.get("email"));
  if (!isValidEmail(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  try {
    await recordAuthSecurityAttempt({
      action: AuthSecurityAction.FORGOT_PASSWORD,
      keyHashes: await currentAuthRateLimitKeys({ email }),
      limit: 5,
      windowMs: 60 * 60 * 1_000,
      outcome: "requested",
    });
    await requestPasswordReset(email);
  } catch (error) {
    if (!(error instanceof AuthRateLimitError)) throw error;
  }

  return {
    status: "submitted",
    message:
      "If an eligible password account exists for that address, a reset link is on its way. If you use Google, continue with Google instead.",
  };
}

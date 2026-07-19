"use server";

import { AuthSecurityAction } from "@prisma/client";

import {
  AuthRateLimitError,
  currentAuthRateLimitKeys,
  recordAuthSecurityAttempt,
} from "@/lib/auth/rate-limit";
import {
  PasswordResetError,
  resetPassword,
} from "@/lib/auth/password-reset";
import { passwordValidationMessage } from "@/lib/auth/validation";

export type ResetPasswordState = {
  status: "idle" | "error" | "reset";
  message: string;
  redirectTo?: string;
};

export async function submitResetPassword(
  _previousState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(
    formData.get("passwordConfirmation") ?? "",
  );
  const passwordError = passwordValidationMessage(password);

  if (passwordError) return { status: "error", message: passwordError };
  if (password !== passwordConfirmation) {
    return { status: "error", message: "Passwords do not match." };
  }
  if (token.length < 32 || token.length > 180) {
    return {
      status: "error",
      message: "This reset link is invalid or no longer available.",
    };
  }

  try {
    await recordAuthSecurityAttempt({
      action: AuthSecurityAction.PASSWORD_RESET,
      keyHashes: await currentAuthRateLimitKeys({ token }),
      limit: 10,
      windowMs: 60 * 60 * 1_000,
      outcome: "attempt",
    });
    await resetPassword({ token, password });
    return {
      status: "reset",
      message: "Password updated. You can now sign in with your new password.",
      redirectTo: "/signin?reset=1",
    };
  } catch (error) {
    if (error instanceof AuthRateLimitError) {
      return {
        status: "error",
        message: "Too many attempts. Wait a while, then request a new reset link.",
      };
    }
    if (error instanceof PasswordResetError) {
      return {
        status: "error",
        message:
          error.code === "EXPIRED"
            ? "This reset link has expired. Request a new one."
            : "This reset link is invalid or has already been used.",
      };
    }
    throw error;
  }
}

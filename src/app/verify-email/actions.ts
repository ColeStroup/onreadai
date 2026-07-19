"use server";

import {
  EmailVerificationError,
  getPendingVerificationState,
  issueSignupVerificationCode,
  verifySignupEmailCode,
} from "@/lib/auth/email-verification";
import { safePostVerificationCallbackUrl } from "@/lib/auth/safe-redirect";
import {
  clearVerificationFlowCookie,
  getVerificationFlowCookie,
  setVerificationFlowCookie,
} from "@/lib/auth/verification-flow";
import { getSessionUser } from "@/lib/session";

export type VerificationActionState = {
  status:
    | "idle"
    | "error"
    | "verified"
    | "resent"
    | "cooldown"
    | "delivery-error";
  message: string;
  attemptsRemaining?: number;
  retryAfterSeconds?: number;
  countdownKey?: string;
  redirectTo?: string;
};

async function pendingVerificationSubject() {
  const sessionUser = await getSessionUser();
  if (sessionUser?.id) {
    const state = await getPendingVerificationState(sessionUser.id);
    if (state) return { state, sessionUser };
  }

  const flow = await getVerificationFlowCookie();
  if (!flow) return null;
  const state = await getPendingVerificationState(flow.userId);
  if (!state || state.email !== flow.email) return null;
  return { state, sessionUser: null };
}

function verificationErrorState(
  error: EmailVerificationError,
): VerificationActionState {
  switch (error.code) {
    case "INVALID_CODE":
      return {
        status: "error",
        message: "That code wasn't recognized. Check the six digits and try again.",
      };
    case "EXPIRED":
      return {
        status: "error",
        message: "That code has expired. Request a new code to continue.",
      };
    case "TOO_MANY_ATTEMPTS":
    case "HOURLY_ATTEMPT_LIMIT":
      return {
        status: "error",
        message: "That code can no longer be used. Wait a little, then request a new one.",
      };
    case "COOLDOWN":
      return {
        status: "cooldown",
        message: "A code was sent recently. Please wait before requesting another.",
        retryAfterSeconds: error.retryAfterSeconds ?? 60,
        countdownKey: `cooldown-${Date.now()}`,
      };
    case "HOURLY_SEND_LIMIT":
    case "DAILY_LIMIT":
      return {
        status: "cooldown",
        message: "You've requested several codes. Please wait before trying again.",
        retryAfterSeconds: 60,
        countdownKey: `limited-${Date.now()}`,
      };
    case "DELIVERY_FAILED":
      return {
        status: "delivery-error",
        message: "We couldn't send a new code right now. Please try again shortly.",
      };
    case "ALREADY_VERIFIED":
      return {
        status: "verified",
        message: "Your email is already verified.",
        redirectTo: "/dashboard",
      };
    default:
      return {
        status: "error",
        message: "This verification request is no longer available. Sign in to continue.",
      };
  }
}

export async function prepareVerificationAfterSignIn(callbackUrl: string) {
  const safeCallbackUrl = safePostVerificationCallbackUrl(callbackUrl);
  const user = await getSessionUser();
  if (!user?.id || !user.emailVerificationRequired) {
    return { destination: safeCallbackUrl, deliveryIssue: false };
  }

  const state = await getPendingVerificationState(user.id);
  if (!state || state.alreadyVerified) {
    return { destination: safeCallbackUrl, deliveryIssue: false };
  }

  await setVerificationFlowCookie({
    userId: state.userId,
    email: state.email,
    callbackUrl: safeCallbackUrl,
  });

  let deliveryIssue = false;
  try {
    await issueSignupVerificationCode({ userId: state.userId, mode: "ensure" });
  } catch (error) {
    if (
      error instanceof EmailVerificationError &&
      ["COOLDOWN", "HOURLY_SEND_LIMIT", "DAILY_LIMIT"].includes(error.code)
    ) {
      // Keep the existing challenge and continue to the verification page.
    } else if (
      error instanceof EmailVerificationError &&
      error.code === "DELIVERY_FAILED"
    ) {
      deliveryIssue = true;
    } else {
      throw error;
    }
  }

  const params = new URLSearchParams({ callbackUrl: safeCallbackUrl });
  if (deliveryIssue) params.set("delivery", "failed");
  return {
    destination: `/verify-email?${params.toString()}`,
    deliveryIssue,
  };
}

export async function verifyEmailCode(
  _previousState: VerificationActionState,
  formData: FormData,
): Promise<VerificationActionState> {
  const subject = await pendingVerificationSubject();
  if (!subject) {
    return {
      status: "error",
      message: "This verification request is no longer available. Sign in to continue.",
    };
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return {
      status: "error",
      message: "Enter the complete six-digit code from your email.",
    };
  }

  const flow = await getVerificationFlowCookie();
  const callbackUrl = safePostVerificationCallbackUrl(
    flow?.callbackUrl ?? String(formData.get("callbackUrl") ?? ""),
  );

  try {
    await verifySignupEmailCode({
      userId: subject.state.userId,
      email: subject.state.email,
      code,
    });
    await clearVerificationFlowCookie();

    const hasMatchingSession =
      subject.sessionUser?.id === subject.state.userId;
    return {
      status: "verified",
      message: "Email verified. Your Onread workspace is ready.",
      redirectTo: hasMatchingSession
        ? callbackUrl
        : `/signin?verified=1&callbackUrl=${encodeURIComponent(callbackUrl)}`,
    };
  } catch (error) {
    if (error instanceof EmailVerificationError) {
      return verificationErrorState(error);
    }
    throw error;
  }
}

export async function resendVerificationCode(
  _previousState: VerificationActionState,
  formData: FormData,
): Promise<VerificationActionState> {
  const subject = await pendingVerificationSubject();
  if (!subject) {
    return {
      status: "error",
      message: "This verification request is no longer available. Sign in to continue.",
    };
  }

  const callbackUrl = safePostVerificationCallbackUrl(
    String(formData.get("callbackUrl") ?? ""),
  );
  await setVerificationFlowCookie({
    userId: subject.state.userId,
    email: subject.state.email,
    callbackUrl,
  });

  try {
    const result = await issueSignupVerificationCode({
      userId: subject.state.userId,
      mode: "resend",
    });
    return {
      status: "resent",
      message: `We sent a new code to ${subject.state.maskedEmail}.`,
      retryAfterSeconds: result.retryAfterSeconds,
      countdownKey: `resent-${result.expiresAt.getTime()}`,
    };
  } catch (error) {
    if (error instanceof EmailVerificationError) {
      return verificationErrorState(error);
    }
    throw error;
  }
}

export async function getVerificationPageContext() {
  const subject = await pendingVerificationSubject();
  if (!subject) return null;

  const flow = await getVerificationFlowCookie();
  return {
    maskedEmail: subject.state.maskedEmail,
    alreadyVerified: subject.state.alreadyVerified,
    resendAvailableAt: subject.state.resendAvailableAt,
    resendSeconds: Math.max(
      0,
      Math.ceil(
        (subject.state.resendAvailableAt.getTime() - Date.now()) / 1_000,
      ),
    ),
    callbackUrl: safePostVerificationCallbackUrl(flow?.callbackUrl),
  };
}

"use server";

import bcrypt from "bcryptjs";
import { AuthSecurityAction, Prisma } from "@prisma/client";

import {
  EmailVerificationError,
  issueSignupVerificationCode,
} from "@/lib/auth/email-verification";
import {
  AuthRateLimitError,
  currentAuthRateLimitKeys,
  recordAuthSecurityAttempt,
} from "@/lib/auth/rate-limit";
import { safePostVerificationCallbackUrl } from "@/lib/auth/safe-redirect";
import { validateSignupForm, type AuthFieldErrors } from "@/lib/auth/validation";
import { setVerificationFlowCookie } from "@/lib/auth/verification-flow";
import { consumePartnerReferralForUser } from "@/lib/partners/referrals";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/observability/log";

export type SignUpState = {
  status: "idle" | "error" | "created";
  message: string;
  fieldErrors?: AuthFieldErrors;
  email?: string;
  callbackUrl?: string;
  deliveryIssue?: boolean;
};

export async function signUp(
  _previousState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const validation = validateSignupForm(formData);
  const { name, email, password } = validation.values;
  const callbackUrl = safePostVerificationCallbackUrl(
    String(formData.get("callbackUrl") ?? ""),
  );

  try {
    await recordAuthSecurityAttempt({
      action: AuthSecurityAction.SIGNUP,
      keyHashes: await currentAuthRateLimitKeys({ email }),
      limit: 5,
      windowMs: 15 * 60 * 1_000,
      outcome: validation.valid ? "valid" : "invalid",
    });
  } catch (error) {
    if (error instanceof AuthRateLimitError) {
      return {
        status: "error",
        message: "Too many sign-up attempts. Wait a few minutes and try again.",
      };
    }
    throw error;
  }

  if (!validation.valid) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: validation.fieldErrors,
    };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      emailVerified: true,
      emailVerificationRequiredAt: true,
      accounts: { select: { provider: true } },
    },
  });

  if (existingUser) {
    const passwordMatches = existingUser.passwordHash
      ? await bcrypt.compare(password, existingUser.passwordHash)
      : false;
    const pendingCredentialsAccount = Boolean(
      passwordMatches &&
        existingUser.email &&
        existingUser.emailVerificationRequiredAt &&
        !existingUser.emailVerified,
    );

    if (pendingCredentialsAccount && existingUser.email) {
      await setVerificationFlowCookie({
        userId: existingUser.id,
        email: existingUser.email,
        callbackUrl,
      });

      let deliveryIssue = false;
      try {
        await issueSignupVerificationCode({
          userId: existingUser.id,
          mode: "resend",
        });
      } catch (error) {
        if (
          error instanceof EmailVerificationError &&
          ["COOLDOWN", "HOURLY_SEND_LIMIT", "DAILY_LIMIT"].includes(
            error.code,
          )
        ) {
          // A recent code may still be valid; the verification page explains timing.
        } else if (
          error instanceof EmailVerificationError &&
          error.code === "DELIVERY_FAILED"
        ) {
          deliveryIssue = true;
        } else {
          throw error;
        }
      }

      return {
        status: "created",
        message: "Continue to verify your email.",
        email,
        callbackUrl,
        deliveryIssue,
      };
    }

    const googleAccount = existingUser.accounts.some(
      (account) => account.provider === "google",
    );
    return {
      status: "error",
      message: googleAccount
        ? "This address may already use Google sign-in. Try continuing with Google or sign in to your account."
        : "We couldn't create a new account with those details. Try signing in instead.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        emailVerified: null,
        emailVerificationRequiredAt: new Date(),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        status: "error",
        message: "We couldn't create a new account with those details. Try signing in instead.",
      };
    }
    throw error;
  }

  await consumePartnerReferralForUser(user.id, { clearCookie: true }).catch(
    (error) => {
      logError("signup_referral_attribution_failed", error, {
        userId: user.id,
      });
    },
  );

  await setVerificationFlowCookie({
    userId: user.id,
    email,
    callbackUrl,
  });

  let deliveryIssue = false;
  try {
    await issueSignupVerificationCode({ userId: user.id, mode: "initial" });
  } catch (error) {
    if (
      error instanceof EmailVerificationError &&
      error.code === "DELIVERY_FAILED"
    ) {
      deliveryIssue = true;
    } else {
      throw error;
    }
  }

  return {
    status: "created",
    message: "Account created. Check your email for your verification code.",
    email,
    callbackUrl,
    deliveryIssue,
  };
}

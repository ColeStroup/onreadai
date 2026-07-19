"use client";

import { ArrowRight, RefreshCw } from "lucide-react";
import { getSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import {
  resendVerificationCode,
  type VerificationActionState,
  verifyEmailCode,
} from "@/app/verify-email/actions";
import { AuthNotice } from "@/components/auth/auth-notice";

const initialVerificationActionState: VerificationActionState = {
  status: "idle",
  message: "",
};

export function VerificationForm({
  maskedEmail,
  callbackUrl,
  initialResendSeconds,
  deliveryIssue,
  alreadyVerified,
}: {
  maskedEmail: string;
  callbackUrl: string;
  initialResendSeconds: number;
  deliveryIssue: boolean;
  alreadyVerified: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyEmailCode,
    initialVerificationActionState,
  );
  const [resendState, resendAction, resending] = useActionState(
    resendVerificationCode,
    initialVerificationActionState,
  );

  useEffect(() => {
    if (verifyState.status !== "verified" || !verifyState.redirectTo) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        await getSession();
        router.push(verifyState.redirectTo!);
        router.refresh();
      })();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [router, verifyState]);

  const notice =
    resendState.status !== "idle"
      ? resendState
      : verifyState.status !== "idle"
        ? verifyState
        : null;
  const noticeTone = notice?.status === "verified" || notice?.status === "resent"
    ? "success"
    : notice
      ? "error"
      : null;

  if (alreadyVerified && verifyState.status === "idle") {
    return (
      <div className="space-y-4">
        <AuthNotice tone="success">Your email is already verified.</AuthNotice>
        <Link
          href={callbackUrl}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-teal-300 px-4 text-sm font-semibold text-[#052b27] outline-none hover:bg-teal-200 focus-visible:ring-2 focus-visible:ring-white"
        >
          Continue to Onread
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {deliveryIssue && !notice ? (
        <AuthNotice tone="error">
          We could not deliver the first code. Wait a moment, then request a new one.
        </AuthNotice>
      ) : null}
      {notice && noticeTone ? (
        <AuthNotice tone={noticeTone}>{notice.message}</AuthNotice>
      ) : null}

      <p className="text-sm leading-6 text-slate-400">
        We sent a six-digit code to{" "}
        <span className="font-medium text-slate-200">{maskedEmail}</span>.
      </p>

      <form action={verifyAction} className="space-y-4" aria-busy={verifying}>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="space-y-2">
          <label htmlFor="verification-code" className="text-sm font-medium text-slate-200">
            Verification code
          </label>
          <input
            id="verification-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            aria-describedby="verification-code-help"
            className="h-14 w-full rounded-lg border border-white/15 bg-[#091213] px-4 text-center font-mono text-2xl text-white outline-none transition-colors placeholder:text-slate-700 focus:border-teal-300 focus:ring-2 focus:ring-teal-300/20"
            placeholder="000000"
          />
          <p id="verification-code-help" className="text-xs leading-5 text-slate-400">
            The code expires after 10 minutes and works once.
          </p>
        </div>
        <button
          type="submit"
          disabled={verifying || code.length !== 6 || verifyState.status === "verified"}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-[#052b27] outline-none transition-colors hover:bg-teal-200 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying ? "Verifying..." : "Verify email"}
          {!verifying ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
        </button>
      </form>

      <form action={resendAction}>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <ResendCountdownButton
          key={resendState.countdownKey ?? "initial"}
          initialSeconds={
            resendState.retryAfterSeconds ?? initialResendSeconds
          }
          resending={resending}
          verified={verifyState.status === "verified"}
        />
      </form>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/signup" })}
          className="rounded-sm text-slate-400 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-teal-300"
        >
          Use a different email
        </button>
        <Link
          href="/signin"
          onClick={(event) => {
            event.preventDefault();
            void signOut({ callbackUrl: "/signin" });
          }}
          className="rounded-sm text-slate-400 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-teal-300"
        >
          Back to sign in
        </Link>
      </div>
      <p className="sr-only" aria-live="polite">
        {verifying ? "Verifying code" : resending ? "Sending a new code" : ""}
      </p>
    </div>
  );
}

function ResendCountdownButton({
  initialSeconds,
  resending,
  verified,
}: {
  initialSeconds: number;
  resending: boolean;
  verified: boolean;
}) {
  const [countdown, setCountdown] = useState(initialSeconds);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(
      () => setCountdown((value) => Math.max(0, value - 1)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [countdown]);

  return (
    <button
      type="submit"
      disabled={resending || countdown > 0 || verified}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.035] px-4 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RefreshCw className="size-4" aria-hidden="true" />
      {resending
        ? "Sending..."
        : countdown > 0
          ? `Resend code in ${countdown}s`
          : "Resend code"}
    </button>
  );
}

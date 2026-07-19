"use client";

import { ArrowRight } from "lucide-react";
import { getSession, signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { prepareVerificationAfterSignIn } from "@/app/verify-email/actions";
import { AuthInput } from "@/components/auth/auth-input";
import { AuthNotice } from "@/components/auth/auth-notice";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { OAuthDivider } from "@/components/auth/oauth-divider";
import { PasswordInput } from "@/components/auth/password-input";

type SignInFormProps = {
  callbackUrl: string;
  googleEnabled: boolean;
  registered?: boolean;
  verified?: boolean;
  passwordReset?: boolean;
  oauthError?: boolean;
};

export function SignInForm({
  callbackUrl,
  googleEnabled,
  registered,
  verified,
  passwordReset,
  oauthError,
}: SignInFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setIsSubmitting(false);
      setError("Email or password was not recognized. Check your details and try again.");
      return;
    }

    const session = await getSession();
    if (session?.user.emailVerificationRequired) {
      const verification = await prepareVerificationAfterSignIn(callbackUrl);
      router.push(verification.destination);
      router.refresh();
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  const successMessage = passwordReset
    ? "Password updated. Sign in with your new password."
    : verified
      ? "Email verified. Sign in to continue."
      : registered
        ? "Account created. Sign in to continue."
        : null;

  return (
    <div className="space-y-5">
      {successMessage ? <AuthNotice tone="success">{successMessage}</AuthNotice> : null}
      {oauthError && !error ? (
        <AuthNotice tone="error">
          Google sign-in could not be completed. If this address already uses a password, sign in with that password first.
        </AuthNotice>
      ) : null}
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}

      <form onSubmit={onSubmit} className="space-y-4" aria-busy={isSubmitting}>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-slate-200">
            Email address
          </label>
          <AuthInput
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="password" className="text-sm font-medium text-slate-200">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="rounded-sm text-sm text-teal-200 outline-none hover:text-teal-100 focus-visible:ring-2 focus-visible:ring-teal-300"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="Your password"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-[#052b27] outline-none transition-colors hover:bg-teal-200 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
          {!isSubmitting ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
        </button>
      </form>

      <OAuthDivider />
      <GoogleAuthButton callbackUrl={callbackUrl} enabled={googleEnabled} />
      <p className="sr-only" aria-live="polite">
        {isSubmitting ? "Signing in" : ""}
      </p>
    </div>
  );
}

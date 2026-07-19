"use client";

import { ArrowRight } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { signUp, type SignUpState } from "@/app/auth/sign-up/actions";
import { AuthInput } from "@/components/auth/auth-input";
import { AuthNotice } from "@/components/auth/auth-notice";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { OAuthDivider } from "@/components/auth/oauth-divider";
import { PasswordInput } from "@/components/auth/password-input";

const initialState: SignUpState = {
  status: "idle",
  message: "",
};

export function SignUpForm({
  callbackUrl,
  googleEnabled,
}: {
  callbackUrl: string;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const submittedPasswordRef = useRef("");
  const handledState = useRef<SignUpState | null>(null);
  const [state, formAction, pending] = useActionState(signUp, initialState);
  const [isContinuing, setIsContinuing] = useState(false);

  useEffect(() => {
    if (
      state.status !== "created" ||
      !state.email ||
      handledState.current === state
    ) {
      return;
    }
    handledState.current = state;
    setIsContinuing(true);

    void (async () => {
      const result = await signIn("credentials", {
        email: state.email,
        password: submittedPasswordRef.current,
        redirect: false,
      });
      const destination = new URLSearchParams({
        callbackUrl: state.callbackUrl ?? callbackUrl,
      });
      if (state.deliveryIssue) destination.set("delivery", "failed");

      if (result?.error) destination.set("session", "pending");
      router.push(`/verify-email?${destination.toString()}`);
      router.refresh();
    })();
  }, [callbackUrl, router, state]);

  const busy = pending || isContinuing;
  const errors = state.fieldErrors ?? {};

  return (
    <div className="space-y-5">
      {state.status === "error" ? (
        <AuthNotice tone="error">{state.message}</AuthNotice>
      ) : null}

      <form
        action={formAction}
        onSubmit={() => {
          submittedPasswordRef.current = passwordRef.current?.value ?? "";
        }}
        className="space-y-4"
        aria-busy={busy}
      >
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium text-slate-200">
            Full name
          </label>
          <AuthInput
            id="name"
            name="name"
            autoComplete="name"
            required
            maxLength={80}
            placeholder="Your full name"
            invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "name-error" : undefined}
          />
          {errors.name ? (
            <p id="name-error" className="text-sm text-rose-200">
              {errors.name}
            </p>
          ) : null}
        </div>

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
            invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email ? (
            <p id="email-error" className="text-sm text-rose-200">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-slate-200">
            Password
          </label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Create a password"
            describedBy={errors.password ? "password-help password-error" : "password-help"}
            invalid={Boolean(errors.password)}
            inputRef={passwordRef}
          />
          <p id="password-help" className="text-xs leading-5 text-slate-400">
            Use at least 8 characters. Password managers are supported.
          </p>
          {errors.password ? (
            <p id="password-error" className="text-sm text-rose-200">
              {errors.password}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label
            htmlFor="passwordConfirmation"
            className="text-sm font-medium text-slate-200"
          >
            Confirm password
          </label>
          <PasswordInput
            id="passwordConfirmation"
            name="passwordConfirmation"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Enter it again"
            describedBy={errors.passwordConfirmation ? "password-confirmation-error" : undefined}
            invalid={Boolean(errors.passwordConfirmation)}
          />
          {errors.passwordConfirmation ? (
            <p id="password-confirmation-error" className="text-sm text-rose-200">
              {errors.passwordConfirmation}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-[#052b27] outline-none transition-colors hover:bg-teal-200 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Creating account..." : "Create account"}
          {!busy ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
        </button>
        <p className="text-center text-xs leading-5 text-slate-400">
          By creating an account, you agree to the{" "}
          <Link href="/terms" className="text-slate-300 underline hover:text-white">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-slate-300 underline hover:text-white">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <OAuthDivider />
      <GoogleAuthButton callbackUrl={callbackUrl} enabled={googleEnabled} />
      <p className="sr-only" aria-live="polite">
        {busy ? "Creating your account" : ""}
      </p>
    </div>
  );
}

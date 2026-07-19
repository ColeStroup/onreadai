"use client";

import { ArrowRight } from "lucide-react";
import { useActionState } from "react";

import {
  submitForgotPassword,
  type ForgotPasswordState,
} from "@/app/forgot-password/actions";
import { AuthInput } from "@/components/auth/auth-input";
import { AuthNotice } from "@/components/auth/auth-notice";

const initialState: ForgotPasswordState = { status: "idle", message: "" };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    submitForgotPassword,
    initialState,
  );

  return (
    <div className="space-y-5">
      {state.status === "submitted" ? (
        <AuthNotice tone="success">{state.message}</AuthNotice>
      ) : state.status === "error" ? (
        <AuthNotice tone="error">{state.message}</AuthNotice>
      ) : null}
      <form action={action} className="space-y-4" aria-busy={pending}>
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
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-[#052b27] outline-none transition-colors hover:bg-teal-200 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Sending..." : "Send reset link"}
          {!pending ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
        </button>
      </form>
    </div>
  );
}

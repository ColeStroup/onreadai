"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import {
  submitResetPassword,
  type ResetPasswordState,
} from "@/app/reset-password/actions";
import { AuthNotice } from "@/components/auth/auth-notice";
import { PasswordInput } from "@/components/auth/password-input";

const initialState: ResetPasswordState = { status: "idle", message: "" };

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    submitResetPassword,
    initialState,
  );

  useEffect(() => {
    if (state.status !== "reset" || !state.redirectTo) return;
    const timer = window.setTimeout(() => {
      router.push(state.redirectTo!);
      router.refresh();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [router, state]);

  return (
    <div className="space-y-5">
      {state.status === "reset" ? (
        <AuthNotice tone="success">{state.message}</AuthNotice>
      ) : state.status === "error" ? (
        <AuthNotice tone="error">{state.message}</AuthNotice>
      ) : null}
      <form action={action} className="space-y-4" aria-busy={pending}>
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-slate-200">
            New password
          </label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Create a new password"
            describedBy="reset-password-help"
          />
          <p id="reset-password-help" className="text-xs leading-5 text-slate-400">
            Use at least 8 characters. All existing sessions will be signed out.
          </p>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="passwordConfirmation"
            className="text-sm font-medium text-slate-200"
          >
            Confirm new password
          </label>
          <PasswordInput
            id="passwordConfirmation"
            name="passwordConfirmation"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Enter it again"
          />
        </div>
        <button
          type="submit"
          disabled={pending || state.status === "reset"}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-300 px-4 text-sm font-semibold text-[#052b27] outline-none transition-colors hover:bg-teal-200 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Updating..." : "Update password"}
          {!pending ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
        </button>
      </form>
    </div>
  );
}

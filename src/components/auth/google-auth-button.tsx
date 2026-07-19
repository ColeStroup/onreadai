"use client";

import { signIn } from "next-auth/react";

export function GoogleAuthButton({
  callbackUrl,
  enabled,
}: {
  callbackUrl: string;
  enabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => signIn("google", { callbackUrl })}
      disabled={!enabled}
      title={enabled ? undefined : "Google sign-in is not configured"}
      className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/[0.035] px-4 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className="flex size-5 items-center justify-center rounded-full bg-white text-xs font-bold text-[#172221]"
        aria-hidden="true"
      >
        G
      </span>
      Continue with Google
    </button>
  );
}

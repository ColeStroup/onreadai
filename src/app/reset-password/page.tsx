import type { Metadata } from "next";
import Link from "next/link";

import { AuthNotice } from "@/components/auth/auth-notice";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getPasswordResetTokenState } from "@/lib/auth/password-reset";

type ResetPasswordPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = {
  title: "Choose a New Password",
  description: "Choose a new password for your Onread account.",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const tokenState = await getPasswordResetTokenState(token);

  return (
    <AuthShell
      title="Choose a new password"
      description="Set a new password for your Onread account."
      footer={
        <Link
          href="/signin"
          className="font-semibold text-teal-200 outline-none hover:text-teal-100 focus-visible:ring-2 focus-visible:ring-teal-300"
        >
          Back to sign in
        </Link>
      }
    >
      {tokenState === "VALID" ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4">
          <AuthNotice tone="error">
            {tokenState === "EXPIRED"
              ? "This reset link has expired. Request a new one to continue."
              : "This reset link is invalid or has already been used."}
          </AuthNotice>
          <Link
            href="/forgot-password"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-teal-300 px-4 text-sm font-semibold text-[#052b27] outline-none hover:bg-teal-200 focus-visible:ring-2 focus-visible:ring-white"
          >
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

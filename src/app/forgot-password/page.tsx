import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Request a secure Onread password reset link.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we will send a secure reset link if the account is eligible."
      footer={
        <Link
          href="/signin"
          className="font-semibold text-teal-200 outline-none hover:text-teal-100 focus-visible:ring-2 focus-visible:ring-teal-300"
        >
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}

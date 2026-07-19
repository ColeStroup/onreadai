import type { Metadata } from "next";
import Link from "next/link";

import { getVerificationPageContext } from "@/app/verify-email/actions";
import { AuthNotice } from "@/components/auth/auth-notice";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerificationForm } from "@/components/auth/verification-form";
import { safePostVerificationCallbackUrl } from "@/lib/auth/safe-redirect";

type VerifyEmailPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = {
  title: "Verify Your Email",
  description: "Verify your email to finish creating your Onread account.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const params = await searchParams;
  const context = await getVerificationPageContext();
  const callbackUrl = safePostVerificationCallbackUrl(
    context?.callbackUrl ?? params.callbackUrl,
  );

  return (
    <AuthShell
      title="Check your email"
      description="Enter the secure code we sent to finish setting up your account."
      footer={
        <>
          Need help?{" "}
          <a
            href="mailto:support@onread.ai"
            className="font-semibold text-teal-200 outline-none hover:text-teal-100 focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            Contact support
          </a>
        </>
      }
    >
      {!context ? (
        <div className="space-y-4">
          <AuthNotice tone="error">
            This verification request is no longer available. Sign in to request a new code.
          </AuthNotice>
          <Link
            href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-teal-300 px-4 text-sm font-semibold text-[#052b27] outline-none hover:bg-teal-200 focus-visible:ring-2 focus-visible:ring-white"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <VerificationForm
          maskedEmail={context.maskedEmail}
          callbackUrl={callbackUrl}
          initialResendSeconds={context.resendSeconds}
          deliveryIssue={params.delivery === "failed"}
          alreadyVerified={context.alreadyVerified}
        />
      )}
    </AuthShell>
  );
}

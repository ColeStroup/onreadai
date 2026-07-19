import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safePostVerificationCallbackUrl } from "@/lib/auth/safe-redirect";

type SigninPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Onread workspace.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function SigninPage({ searchParams }: SigninPageProps) {
  const params = await searchParams;
  const callbackUrl = safePostVerificationCallbackUrl(params.callbackUrl);
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to continue working through your audits, action plans, and recommendations."
      footer={
        <>
          New to Onread?{" "}
          <Link
            href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-semibold text-teal-200 outline-none hover:text-teal-100 focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm
        callbackUrl={callbackUrl}
        googleEnabled={googleEnabled}
        registered={params.registered === "1"}
        verified={params.verified === "1"}
        passwordReset={params.reset === "1"}
        oauthError={typeof params.error === "string"}
      />
    </AuthShell>
  );
}

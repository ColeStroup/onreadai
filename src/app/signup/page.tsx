import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { safePostVerificationCallbackUrl } from "@/lib/auth/safe-redirect";

type SignupPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = {
  title: "Create Your Account",
  description: "Create an Onread account and start your first growth audit.",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const callbackUrl = safePostVerificationCallbackUrl(params.callbackUrl);
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  return (
    <AuthShell
      title="Create your account"
      description="Run your first audit and turn business uncertainty into clear next moves."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-semibold text-teal-200 outline-none hover:text-teal-100 focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm callbackUrl={callbackUrl} googleEnabled={googleEnabled} />
    </AuthShell>
  );
}

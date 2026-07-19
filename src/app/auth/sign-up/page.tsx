import { redirect } from "next/navigation";

import { safePostVerificationCallbackUrl } from "@/lib/auth/safe-redirect";

type LegacySignUpPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function LegacySignUpPage({
  searchParams,
}: LegacySignUpPageProps) {
  const params = await searchParams;
  const destination = new URLSearchParams({
    callbackUrl: safePostVerificationCallbackUrl(params.callbackUrl),
  });
  redirect(`/signup?${destination.toString()}`);
}

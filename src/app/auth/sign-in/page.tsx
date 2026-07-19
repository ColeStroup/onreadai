import { redirect } from "next/navigation";

import { safePostVerificationCallbackUrl } from "@/lib/auth/safe-redirect";

type LegacySignInPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function LegacySignInPage({
  searchParams,
}: LegacySignInPageProps) {
  const params = await searchParams;
  const destination = new URLSearchParams({
    callbackUrl: safePostVerificationCallbackUrl(params.callbackUrl),
  });
  for (const key of ["registered", "verified", "reset"] as const) {
    if (params[key] === "1") destination.set(key, "1");
  }
  redirect(`/signin?${destination.toString()}`);
}

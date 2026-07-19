import "server-only";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { safePostVerificationCallbackUrl } from "@/lib/auth/safe-redirect";

export async function getSessionUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || session.user.sessionInvalidated) {
    return null;
  }

  return session.user;
}

export async function getCurrentUser() {
  const user = await getSessionUser();
  if (!user || user.emailVerificationRequired || user.sessionInvalidated) {
    return null;
  }

  return user;
}

export async function requireUser(callbackUrl = "/dashboard") {
  const user = await getSessionUser();
  const safeCallbackUrl = safePostVerificationCallbackUrl(callbackUrl);

  if (!user || user.sessionInvalidated) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`);
  }

  if (user.emailVerificationRequired) {
    redirect(
      `/verify-email?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`,
    );
  }

  return user;
}

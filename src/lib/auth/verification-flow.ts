import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { getEmailVerificationSecret } from "@/lib/auth/secrets";
import { safePostVerificationCallbackUrl } from "@/lib/auth/safe-redirect";

export const EMAIL_VERIFICATION_FLOW_COOKIE = "onread_email_verification";
const flowLifetimeMs = 60 * 60 * 1_000;

type VerificationFlowPayload = {
  version: 1;
  userId: string;
  email: string;
  callbackUrl: string;
  expiresAt: string;
};

function flowSignature(encodedPayload: string) {
  return createHmac("sha256", getEmailVerificationSecret())
    .update(`verification-flow:v1:${encodedPayload}`)
    .digest("base64url");
}

function signFlow(payload: VerificationFlowPayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encoded}.${flowSignature(encoded)}`;
}

function verifyFlow(value: string | undefined) {
  if (!value) return null;
  const [encoded, suppliedSignature, extra] = value.split(".");
  if (!encoded || !suppliedSignature || extra) return null;

  const expected = Buffer.from(flowSignature(encoded), "base64url");
  const supplied = Buffer.from(suppliedSignature, "base64url");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<VerificationFlowPayload>;
    if (
      payload.version !== 1 ||
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.callbackUrl !== "string" ||
      typeof payload.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(payload.expiresAt)) ||
      Date.parse(payload.expiresAt) <= Date.now()
    ) {
      return null;
    }

    return {
      version: 1,
      userId: payload.userId,
      email: payload.email,
      callbackUrl: safePostVerificationCallbackUrl(payload.callbackUrl),
      expiresAt: payload.expiresAt,
    } satisfies VerificationFlowPayload;
  } catch {
    return null;
  }
}

export async function setVerificationFlowCookie(input: {
  userId: string;
  email: string;
  callbackUrl?: string;
}) {
  const expiresAt = new Date(Date.now() + flowLifetimeMs);
  const cookieStore = await cookies();
  cookieStore.set(
    EMAIL_VERIFICATION_FLOW_COOKIE,
    signFlow({
      version: 1,
      userId: input.userId,
      email: input.email.trim().toLowerCase(),
      callbackUrl: safePostVerificationCallbackUrl(input.callbackUrl),
      expiresAt: expiresAt.toISOString(),
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
      priority: "high",
    },
  );
}

export async function getVerificationFlowCookie() {
  const cookieStore = await cookies();
  return verifyFlow(
    cookieStore.get(EMAIL_VERIFICATION_FLOW_COOKIE)?.value,
  );
}

export async function clearVerificationFlowCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(EMAIL_VERIFICATION_FLOW_COOKIE);
}

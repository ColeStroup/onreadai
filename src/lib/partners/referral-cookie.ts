import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { PartnerAttributionSource } from "@prisma/client";

import { PartnerProgramError } from "@/lib/partners/errors";

export const PARTNER_REFERRAL_COOKIE = "onread_partner_referral";

export type PartnerReferralCookiePayload = {
  version: 1;
  referralCode: string;
  anonymousVisitorId: string;
  firstVisitAt: string;
  expiresAt: string;
  landingPath: string;
  source: PartnerAttributionSource;
  prospectId?: string;
};

function signingSecret() {
  const configured = process.env.PARTNER_REFERRAL_SIGNING_SECRET?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new PartnerProgramError(
      "Partner referral signing is not configured.",
      "REFERRAL_SIGNING_NOT_CONFIGURED",
      503,
    );
  }

  return process.env.NEXTAUTH_SECRET?.trim() || "development-partner-referral-only";
}

function signature(encodedPayload: string) {
  return createHmac("sha256", signingSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function signPartnerReferralCookie(payload: PartnerReferralCookiePayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyPartnerReferralCookie(value: string | undefined | null) {
  if (!value) return null;
  const [encoded, suppliedSignature, extra] = value.split(".");
  if (!encoded || !suppliedSignature || extra) return null;

  const expected = signature(encoded);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<PartnerReferralCookiePayload>;

    if (
      parsed.version !== 1 ||
      typeof parsed.referralCode !== "string" ||
      typeof parsed.anonymousVisitorId !== "string" ||
      typeof parsed.firstVisitAt !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      typeof parsed.landingPath !== "string" ||
      !Object.values(PartnerAttributionSource).includes(
        parsed.source as PartnerAttributionSource,
      ) ||
      !Number.isFinite(Date.parse(parsed.firstVisitAt)) ||
      !Number.isFinite(Date.parse(parsed.expiresAt))
    ) {
      return null;
    }

    return parsed as PartnerReferralCookiePayload;
  } catch {
    return null;
  }
}

export function createAnonymousVisitorId() {
  return randomBytes(18).toString("base64url");
}

export function referralCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    priority: "high" as const,
  };
}

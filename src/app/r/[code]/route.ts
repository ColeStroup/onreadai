import { PartnerAttributionSource, PartnerStatus } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getPartnerProgramSettings } from "@/lib/partners/config";
import {
  createAnonymousVisitorId,
  PARTNER_REFERRAL_COOKIE,
  referralCookieOptions,
  signPartnerReferralCookie,
  verifyPartnerReferralCookie,
} from "@/lib/partners/referral-cookie";
import {
  normalizeReferralCode,
  safeReferralDestination,
} from "@/lib/partners/referral-policy";
import { prisma } from "@/lib/prisma";
import { hashPreviewToken } from "@/lib/partners/preview-token";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";

function cleanTrackingValue(value: string | null) {
  return value?.trim().slice(0, 120) || null;
}

function referrerHost(request: NextRequest) {
  const value = request.headers.get("referer");
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().slice(0, 253);
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const destination = safeReferralDestination(
    request.nextUrl.searchParams.get("to"),
  );
  const response = NextResponse.redirect(new URL(destination, request.url));
  const settings = await getPartnerProgramSettings();

  if (!settings.enabled || !settings.referralAttributionEnabled) return response;

  const existing = verifyPartnerReferralCookie(
    request.cookies.get(PARTNER_REFERRAL_COOKIE)?.value,
  );
  if (existing && new Date(existing.expiresAt) > new Date()) return response;

  try {
    await enforceRateLimit({
      scope: "partner-referral-visit",
      identifiers: [
        normalizeReferralCode(code),
        await currentRequestRateLimitIdentifier(),
      ],
      limit: 120,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) return response;
    throw error;
  }

  const partner = await prisma.partnerProfile.findUnique({
    where: { normalizedReferralCode: normalizeReferralCode(code) },
  });

  if (
    !partner ||
    partner.status !== PartnerStatus.ACTIVE ||
    !partner.referralEnabled
  ) {
    return response;
  }

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + partner.referralWindowDays * 24 * 60 * 60 * 1_000,
  );
  const anonymousVisitorId = createAnonymousVisitorId();
  const previewToken = request.nextUrl.searchParams.get("preview");
  const preview =
    previewToken && settings.previewPagesEnabled
      ? await prisma.partnerProspectPreview.findFirst({
          where: {
            tokenHash: hashPreviewToken(previewToken),
            partnerId: partner.id,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          select: { prospectId: true },
        })
      : null;

  await prisma.partnerReferralVisit.create({
    data: {
      partnerId: partner.id,
      referralCode: partner.referralCode,
      anonymousVisitorId,
      landingPath: destination,
      referrerHost: referrerHost(request),
      utmSource: cleanTrackingValue(request.nextUrl.searchParams.get("utm_source")),
      utmMedium: cleanTrackingValue(request.nextUrl.searchParams.get("utm_medium")),
      utmCampaign: cleanTrackingValue(
        request.nextUrl.searchParams.get("utm_campaign"),
      ),
    },
  });

  response.cookies.set(
    PARTNER_REFERRAL_COOKIE,
    signPartnerReferralCookie({
      version: 1,
      referralCode: partner.referralCode,
      anonymousVisitorId,
      firstVisitAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      landingPath: destination,
      source: preview
        ? PartnerAttributionSource.PROSPECT_PREVIEW
        : PartnerAttributionSource.REFERRAL_LINK,
      ...(preview ? { prospectId: preview.prospectId } : {}),
    }),
    referralCookieOptions(expiresAt),
  );

  return response;
}

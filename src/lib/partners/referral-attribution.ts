import "server-only";

import {
  PartnerAttributionStatus,
  PartnerStatus,
  SubscriptionStatus,
} from "@prisma/client";

import { getPartnerProgramSettings } from "@/lib/partners/config";
import { normalizeReferralCode, safeReferralDestination } from "@/lib/partners/referral-policy";
import type { PartnerReferralCookiePayload } from "@/lib/partners/referral-cookie";
import { prisma } from "@/lib/prisma";

export async function lockPartnerReferralAttribution(
  userId: string,
  payload: PartnerReferralCookiePayload,
) {
  const settings = await getPartnerProgramSettings();
  const now = new Date();
  const firstVisitAt = new Date(payload.firstVisitAt);
  const expiresAt = new Date(payload.expiresAt);

  if (
    !settings.enabled ||
    !settings.referralAttributionEnabled ||
    expiresAt <= now ||
    firstVisitAt > now
  ) {
    return { attributed: false, reason: "disabled_or_expired" } as const;
  }

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-attribution:${userId}`}))`;
    const existing = await transaction.partnerReferralAttribution.findUnique({
      where: { referredUserId: userId },
    });
    if (existing) {
      return { attributed: false, reason: "already_attributed", attribution: existing } as const;
    }

    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { id: true, createdAt: true },
    });
    const partner = await transaction.partnerProfile.findUnique({
      where: { normalizedReferralCode: normalizeReferralCode(payload.referralCode) },
    });
    const priorOneTimePurchase = await transaction.oneTimeAuditPurchase.count({ where: { userId } });
    const priorPaidSubscription = await transaction.userSubscription.count({
      where: {
        userId,
        OR: [
          { stripeSubscriptionId: { not: null } },
          { stripeProductKey: { not: null }, status: { not: SubscriptionStatus.FREE } },
        ],
      },
    });

    if (!user) return { attributed: false, reason: "user_missing" } as const;
    if (!partner || partner.status !== PartnerStatus.ACTIVE || !partner.referralEnabled) {
      return { attributed: false, reason: "partner_ineligible" } as const;
    }
    if (partner.userId === userId) return { attributed: false, reason: "self_referral" } as const;
    if (user.createdAt < firstVisitAt) return { attributed: false, reason: "existing_user" } as const;
    if (priorOneTimePurchase > 0 || priorPaidSubscription > 0) {
      return { attributed: false, reason: "prior_customer" } as const;
    }

    const attribution = await transaction.partnerReferralAttribution.create({
      data: {
        partnerId: partner.id,
        referredUserId: userId,
        referralCode: partner.referralCode,
        status: PartnerAttributionStatus.LOCKED,
        source: payload.source,
        firstVisitAt,
        signupAt: user.createdAt,
        expiresAt,
        landingPath: safeReferralDestination(payload.landingPath),
        prospectId: payload.prospectId,
      },
    });
    return { attributed: true, reason: "locked", attribution } as const;
  });
}

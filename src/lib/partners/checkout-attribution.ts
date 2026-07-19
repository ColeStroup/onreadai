import "server-only";

import {
  PartnerAttributionStatus,
  PartnerStatus,
} from "@prisma/client";

import { getPartnerProgramSettings } from "@/lib/partners/config";
import { consumePartnerReferralForUser } from "@/lib/partners/referrals";
import { prisma } from "@/lib/prisma";

export type PartnerCheckoutContext = {
  partnerId: string;
  partnerAttributionId: string;
  partnerCheckoutIntentId: string;
};

export async function preparePartnerCheckoutContext(
  userId: string,
  productKey: string,
): Promise<PartnerCheckoutContext | null> {
  await consumePartnerReferralForUser(userId).catch(() => null);
  const settings = await getPartnerProgramSettings();
  if (!settings.enabled || !settings.referralAttributionEnabled) return null;

  const attribution = await prisma.partnerReferralAttribution.findUnique({
    where: { referredUserId: userId },
    include: { partner: true },
  });
  if (
    !attribution ||
    (attribution.status !== PartnerAttributionStatus.LOCKED &&
      attribution.status !== PartnerAttributionStatus.CONVERTED &&
      attribution.status !== PartnerAttributionStatus.OVERRIDDEN) ||
    attribution.partner.status !== PartnerStatus.ACTIVE ||
    !attribution.partner.referralEnabled
  ) {
    return null;
  }

  const intent = await prisma.partnerCheckoutIntent.create({
    data: {
      userId,
      partnerId: attribution.partnerId,
      attributionId: attribution.id,
      productKey,
    },
  });

  return {
    partnerId: attribution.partnerId,
    partnerAttributionId: attribution.id,
    partnerCheckoutIntentId: intent.id,
  };
}

export async function recordPartnerCheckoutSession(
  context: PartnerCheckoutContext,
  stripeCheckoutSessionId: string,
) {
  await prisma.partnerCheckoutIntent.updateMany({
    where: {
      id: context.partnerCheckoutIntentId,
      partnerId: context.partnerId,
      attributionId: context.partnerAttributionId,
    },
    data: { stripeCheckoutSessionId, status: "SESSION_CREATED" },
  });
}

import "server-only";

import { PartnerCommissionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function releaseAvailablePartnerCommissions(
  partnerId?: string,
  now = new Date(),
) {
  const candidates = await prisma.partnerCommission.findMany({
    where: {
      ...(partnerId ? { partnerId } : {}),
      status: PartnerCommissionStatus.PENDING,
      availableAt: { lte: now },
      disputeOpen: false,
      netCommissionAmountCents: { gt: 0 },
    },
    select: { id: true, partnerId: true, partner: { select: { userId: true } } },
    orderBy: { availableAt: "asc" },
    take: 250,
  });

  let released = 0;
  for (const candidate of candidates) {
    const result = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.partnerCommission.updateMany({
        where: { id: candidate.id, status: PartnerCommissionStatus.PENDING },
        data: { status: PartnerCommissionStatus.AVAILABLE },
      });
      if (updated.count !== 1) return false;
      await transaction.partnerNotification.create({
        data: {
          userId: candidate.partner.userId,
          partnerId: candidate.partnerId,
          type: "PARTNER_COMMISSION_AVAILABLE",
          title: "Commission available",
          message: "A commission completed its hold period and is now eligible for a future payout.",
        },
      });
      return true;
    });
    if (result) released += 1;
  }
  return released;
}

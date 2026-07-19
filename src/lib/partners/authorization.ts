import "server-only";

import { PartnerStatus, UserRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { assertAdminUser } from "@/lib/partners/admin-authorization";
import {
  partnerCanRefer,
  partnerCanScan,
} from "@/lib/partners/partner-access-policy";
import { getPartnerProgramSettings } from "@/lib/partners/config";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export { assertAdminUser, partnerCanRefer, partnerCanScan };

export async function requireAdmin(callbackUrl = "/dashboard/admin/partners") {
  const user = await requireUser(callbackUrl);
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (record?.role !== UserRole.ADMIN) notFound();
  return user;
}

export async function getPartnerForUser(userId: string) {
  return prisma.partnerProfile.findUnique({ where: { userId } });
}

export async function requirePartner(
  callbackUrl = "/dashboard/partner",
  options: { active?: boolean } = {},
) {
  const user = await requireUser(callbackUrl);
  const [partner, settings] = await Promise.all([
    getPartnerForUser(user.id),
    getPartnerProgramSettings(),
  ]);

  if (!settings.enabled) notFound();
  if (!partner) redirect("/partners/apply");
  if (options.active && partner.status !== PartnerStatus.ACTIVE) {
    redirect("/dashboard/partner/training");
  }

  return { user, partner };
}

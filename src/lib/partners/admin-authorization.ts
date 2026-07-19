import "server-only";

import { UserRole } from "@prisma/client";

import { PartnerProgramError } from "@/lib/partners/errors";
import { prisma } from "@/lib/prisma";

export async function assertAdminUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!user || user.role !== UserRole.ADMIN) {
    throw new PartnerProgramError("Administrator access is required.", "FORBIDDEN", 403);
  }

  return user;
}

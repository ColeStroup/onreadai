import type { ReactNode } from "react";
import type { Metadata } from "next";

import { CustomerEventBoundary } from "@/components/analytics/customer-event-boundary";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getPartnerProgramSettings } from "@/lib/partners/config";
import { consumePartnerReferralForUser } from "@/lib/partners/referrals";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Workspace",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser("/dashboard");
  await consumePartnerReferralForUser(user.id).catch(() => null);
  const [access, partnerSettings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, partnerProfile: { select: { id: true } } },
    }),
    getPartnerProgramSettings(),
  ]);

  return (
    <DashboardShell
      user={user}
      isAdmin={access?.role === "ADMIN"}
      isPartner={partnerSettings.enabled && Boolean(access?.partnerProfile)}
    >
      <CustomerEventBoundary />
      {children}
    </DashboardShell>
  );
}

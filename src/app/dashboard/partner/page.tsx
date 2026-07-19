import { PartnerCommissionStatus, PartnerStatus } from "@prisma/client";
import { ArrowRight, BadgeCheck, CircleDollarSign, MousePointerClick, ScanSearch, Users } from "lucide-react";
import Link from "next/link";

import { CopyReferralLink } from "@/components/partners/copy-referral-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthAppOrigin } from "@/lib/auth/app-url";
import { partnerCommunityUrl } from "@/lib/partners/config";
import { releaseAvailablePartnerCommissions } from "@/lib/partners/commission-availability";
import { requirePartner } from "@/lib/partners/authorization";
import { prisma } from "@/lib/prisma";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function PartnerDashboardPage() {
  const { partner } = await requirePartner("/dashboard/partner");
  await releaseAvailablePartnerCommissions(partner.id);
  const month = new Date().toISOString().slice(0, 7);
  const [visits, signups, conversions, commissionGroups, adjustments, usage, recent, notifications] = await Promise.all([
    prisma.partnerReferralVisit.count({ where: { partnerId: partner.id } }),
    prisma.partnerReferralAttribution.count({ where: { partnerId: partner.id } }),
    prisma.partnerReferralAttribution.count({ where: { partnerId: partner.id, convertedAt: { not: null } } }),
    prisma.partnerCommission.groupBy({ where: { partnerId: partner.id }, by: ["status"], _sum: { netCommissionAmountCents: true } }),
    prisma.partnerCommissionAdjustment.aggregate({ where: { partnerId: partner.id, amountCents: { lt: 0 }, commission: { status: PartnerCommissionStatus.PAID }, payoutItem: { is: null } }, _sum: { amountCents: true } }),
    prisma.partnerScannerUsage.aggregate({ where: { partnerId: partner.id, usageMonth: month }, _sum: { scanRequests: true, freshScans: true, cachedScans: true } }),
    prisma.partnerCommission.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.partnerNotification.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" }, take: 4 }),
  ]);
  const totals = new Map(commissionGroups.map((group) => [group.status, group._sum.netCommissionAmountCents ?? 0]));
  const pending = (totals.get(PartnerCommissionStatus.PENDING) ?? 0) + (totals.get(PartnerCommissionStatus.PARTIALLY_REVERSED) ?? 0);
  const available = totals.get(PartnerCommissionStatus.AVAILABLE) ?? 0;
  const paid = totals.get(PartnerCommissionStatus.PAID) ?? 0;
  const referralLink = `${getAuthAppOrigin()}/r/${partner.referralCode}`;
  const community = partnerCommunityUrl();

  return (
    <div className="space-y-6">
      {partner.status !== PartnerStatus.ACTIVE ? (
        <Card className="border-amber-400/30 bg-amber-400/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">Certification is not complete</p><p className="mt-1 text-sm text-muted">Finish all required modules, pass the assessment, and accept current agreements before referrals activate.</p></div>
            <Link href="/dashboard/partner/training" className="inline-flex items-center gap-2 text-sm font-semibold text-accent">Continue training <ArrowRight className="size-4" /></Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Unique visits", value: visits, Icon: MousePointerClick },
          { label: "Referred signups", value: signups, Icon: Users },
          { label: "Paid conversions", value: conversions, Icon: BadgeCheck },
          { label: "Conversion rate", value: signups ? `${Math.round((conversions / signups) * 100)}%` : "0%", Icon: CircleDollarSign },
        ].map(({ label, value, Icon }) => (
          <Card key={label}><CardContent className="p-5"><Icon className="size-4 text-accent" /><p className="mt-5 text-2xl font-semibold">{String(value)}</p><p className="mt-1 text-sm text-muted">{label}</p></CardContent></Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader><CardTitle>Referral link</CardTitle></CardHeader>
          <CardContent>
            {partner.status === PartnerStatus.ACTIVE && partner.referralEnabled ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 text-sm">{referralLink}</code><CopyReferralLink value={referralLink} /></div>
            ) : <p className="text-sm text-muted">Your referral code is reserved, but the link remains disabled until certification is complete.</p>}
            <p className="mt-3 text-xs text-muted">First valid referral, {partner.referralWindowDays}-day signup window. Customer pricing does not change.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Commission snapshot</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-muted">Pending</p><p className="mt-1 text-lg font-semibold">{money(pending)}</p></div>
            <div><p className="text-muted">Available</p><p className="mt-1 text-lg font-semibold">{money(available)}</p></div>
            <div><p className="text-muted">Paid</p><p className="mt-1 text-lg font-semibold">{money(paid)}</p></div>
            <div><p className="text-muted">Carry-forward</p><p className="mt-1 text-lg font-semibold">{money(adjustments._sum.amountCents ?? 0)}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent commissions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {recent.length ? recent.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 border-b border-border pb-3 text-sm last:border-0"><div><p className="font-medium">{item.purchaseType.replaceAll("_", " ")}</p><p className="text-xs text-muted">{item.createdAt.toLocaleDateString()} · {item.status.replaceAll("_", " ")}</p></div><p className="font-semibold">{money(item.netCommissionAmountCents)}</p></div>) : <p className="text-sm text-muted">No commissions yet. Share your link only through compliant, clearly disclosed promotion.</p>}
            <Link href="/dashboard/partner/earnings" className="inline-flex text-sm font-semibold text-accent">View earnings ledger</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Partner activity</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {notifications.length ? notifications.map((item) => <div key={item.id} className="border-b border-border pb-3 last:border-0"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted">{item.message}</p></div>) : <p className="text-sm text-muted">Program updates and commission notices will appear here.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3"><ScanSearch className="mt-0.5 size-5 text-accent" /><div><p className="font-semibold">Scanner usage</p><p className="mt-1 text-sm text-muted">{usage._sum.scanRequests ?? 0} of {partner.scannerMonthlyLimit} requests this month · {usage._sum.freshScans ?? 0} fresh · {usage._sum.cachedScans ?? 0} cached</p></div></div>
          <div className="flex gap-4"><Link href="/dashboard/partner/scanner" className="text-sm font-semibold text-accent">Open scanner</Link>{community ? <a href={community} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-accent">Join Partner Community</a> : null}</div>
        </CardContent>
      </Card>
    </div>
  );
}

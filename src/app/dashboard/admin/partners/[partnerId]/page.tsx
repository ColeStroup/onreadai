import {
  PartnerPayoutEligibilityStatus,
  PartnerStatus,
  PartnerTier,
} from "@prisma/client";
import { notFound } from "next/navigation";

import {
  overridePartnerAttributionAction,
  replacePartnerReferralCodeAction,
  requirePartnerTermsReacceptanceAction,
  resetPartnerTrainingAction,
  updatePartnerProfileAction,
} from "@/app/dashboard/admin/partners/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { prisma } from "@/lib/prisma";

const field = "mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const operationField = "rounded-lg border border-border bg-background px-3 py-2 text-sm";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function PartnerAdminDetailPage({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const { partnerId } = await params;
  const [partner, commissionTotals, adjustmentTotals, paidTotals, usage, auditLogs] = await Promise.all([
    prisma.partnerProfile.findUnique({
      where: { id: partnerId },
      include: {
        user: { select: { name: true, email: true } },
        application: true,
        _count: {
          select: {
            referralVisits: true,
            attributions: true,
            commissions: true,
            payouts: true,
            prospects: true,
          },
        },
      },
    }),
    prisma.partnerCommission.aggregate({
      where: { partnerId },
      _sum: { commissionableAmountCents: true, netCommissionAmountCents: true },
    }),
    prisma.partnerCommissionAdjustment.aggregate({
      where: { partnerId },
      _sum: { amountCents: true },
    }),
    prisma.partnerPayout.aggregate({
      where: { partnerId, status: "PAID" },
      _sum: { netPayoutCents: true },
    }),
    prisma.partnerScannerUsage.aggregate({
      where: { partnerId },
      _sum: { scanRequests: true, failures: true },
    }),
    prisma.partnerAdminAuditLog.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  if (!partner) notFound();

  const metrics = [
    ["Visits", partner._count.referralVisits],
    ["Signups", partner._count.attributions],
    ["Conversions", partner._count.commissions],
    ["Attributed revenue", money(commissionTotals._sum.commissionableAmountCents ?? 0)],
    ["Net commissions", money(commissionTotals._sum.netCommissionAmountCents ?? 0)],
    ["Adjustments", money(adjustmentTotals._sum.amountCents ?? 0)],
    ["Paid", money(paidTotals._sum.netPayoutCents ?? 0)],
    ["Scanner requests", usage._sum.scanRequests ?? 0],
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-muted">Partner</p>
            <p className="mt-1 font-semibold">{partner.user.name || partner.application?.displayName}</p>
            <p className="text-sm text-muted">{partner.user.email}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Certification</p>
            <p className="mt-1 font-semibold">{partner.status.replaceAll("_", " ")}</p>
            <p className="text-sm text-muted">{partner.certificationIssuedAt?.toLocaleDateString() ?? "Not issued"}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Terms</p>
            <p className="mt-1 font-semibold">{partner.currentTermsVersion ?? "Acceptance required"}</p>
            <p className="text-sm text-muted">{partner.termsAcceptedAt?.toLocaleDateString() ?? "Not accepted"}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Referral code</p>
            <p className="mt-1 font-mono font-semibold">{partner.referralCode}</p>
            <p className="text-sm text-muted">{partner.referralEnabled ? "Enabled" : "Disabled"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xl font-semibold">{value}</p>
              <p className="mt-1 text-xs text-muted">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operational controls</CardTitle>
          <p className="text-sm text-muted">
            Every change requires a reason and creates an administrator audit record. New financial values never rewrite historical commissions.
          </p>
        </CardHeader>
        <CardContent>
          <form action={updatePartnerProfileAction.bind(null, partner.id)} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium">Status<select name="status" defaultValue={partner.status} className={field}>{Object.values(PartnerStatus).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-sm font-medium">Tier<select name="tier" defaultValue={partner.tier} className={field}>{Object.values(PartnerTier).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-sm font-medium">Payout eligibility<select name="payoutEligibilityStatus" defaultValue={partner.payoutEligibilityStatus} className={field}>{Object.values(PartnerPayoutEligibilityStatus).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-sm font-medium">Compliance review<select name="complianceReviewStatus" defaultValue={partner.complianceReviewStatus} className={field}><option>CLEAR</option><option>REVIEW_REQUIRED</option><option>BLOCKED</option></select></label>
            <label className="text-sm font-medium">Commission basis points<input name="commissionRateBps" type="number" min={0} max={10000} defaultValue={partner.commissionRateBps} className={field} /></label>
            <label className="text-sm font-medium">Recurring paid months<input name="recurringCommissionMonths" type="number" min={0} max={60} defaultValue={partner.recurringCommissionMonths} className={field} /></label>
            <label className="text-sm font-medium">Referral window days<input name="referralWindowDays" type="number" min={1} max={365} defaultValue={partner.referralWindowDays} className={field} /></label>
            <label className="text-sm font-medium">Commission hold days<input name="commissionHoldDays" type="number" min={0} max={180} defaultValue={partner.commissionHoldDays} className={field} /></label>
            <label className="text-sm font-medium">Minimum payout cents<input name="minimumPayoutCents" type="number" min={0} defaultValue={partner.minimumPayoutCents} className={field} /></label>
            <label className="text-sm font-medium">Daily scanner limit<input name="scannerDailyLimit" type="number" min={0} max={1000} defaultValue={partner.scannerDailyLimit} className={field} /></label>
            <label className="text-sm font-medium">Monthly scanner limit<input name="scannerMonthlyLimit" type="number" min={0} max={25000} defaultValue={partner.scannerMonthlyLimit} className={field} /></label>
            <div className="flex flex-col justify-end gap-3 pb-2">
              <label className="flex items-center gap-3 text-sm font-medium"><input name="referralEnabled" type="checkbox" defaultChecked={partner.referralEnabled} className="size-4 accent-accent" />Referral enabled</label>
              <label className="flex items-center gap-3 text-sm font-medium"><input name="scannerEnabled" type="checkbox" defaultChecked={partner.scannerEnabled} className="size-4 accent-accent" />Scanner enabled</label>
            </div>
            <label className="text-sm font-medium sm:col-span-2 lg:col-span-3">Internal notes<textarea name="internalNotes" defaultValue={partner.internalNotes ?? ""} maxLength={5000} className={`${field} min-h-24`} /></label>
            <label className="text-sm font-medium sm:col-span-2 lg:col-span-3">Required reason<textarea name="reason" required minLength={3} maxLength={1000} className={`${field} min-h-20`} /></label>
            <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>Save partner controls</SubmitButton></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audited partner operations</CardTitle>
          <p className="text-sm text-muted">These actions are deliberately separate so consequential changes are explicit.</p>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <form action={replacePartnerReferralCodeAction.bind(null, partner.id)} className="space-y-3 rounded-lg border border-border p-4">
            <div><p className="font-semibold">Replace referral code</p><p className="mt-1 text-sm text-muted">The old link stops resolving immediately.</p></div>
            <input name="reason" required minLength={3} className={operationField} placeholder="Required reason" />
            <SubmitButton>Generate replacement</SubmitButton>
          </form>
          <form action={resetPartnerTrainingAction.bind(null, partner.id)} className="space-y-3 rounded-lg border border-border p-4">
            <div><p className="font-semibold">Reset training</p><p className="mt-1 text-sm text-muted">Disables referrals and scanner access until certification is completed again.</p></div>
            <input name="reason" required minLength={3} className={operationField} placeholder="Required reason" />
            <SubmitButton>Reset certification</SubmitButton>
          </form>
          <form action={requirePartnerTermsReacceptanceAction.bind(null, partner.id)} className="space-y-3 rounded-lg border border-border p-4">
            <div><p className="font-semibold">Require terms reacceptance</p><p className="mt-1 text-sm text-muted">Preserves prior acceptance records while requiring a new timestamp.</p></div>
            <input name="reason" required minLength={3} className={operationField} placeholder="Required reason" />
            <SubmitButton>Require acceptance</SubmitButton>
          </form>
          <form action={overridePartnerAttributionAction.bind(null, partner.id)} className="space-y-3 rounded-lg border border-border p-4">
            <div><p className="font-semibold">Override attribution</p><p className="mt-1 text-sm text-muted">Only allowed before a commission ledger exists for the user.</p></div>
            <input name="referredUserEmail" type="email" required className={operationField} placeholder="Customer account email" />
            <input name="reason" required minLength={3} className={operationField} placeholder="Required reason" />
            <SubmitButton>Apply override</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Application</CardTitle></CardHeader>
        <CardContent className="grid gap-4 text-sm lg:grid-cols-3">
          <div><p className="font-semibold">Experience</p><p className="mt-2 leading-6 text-muted">{partner.application?.experienceSummary ?? "Not available"}</p></div>
          <div><p className="font-semibold">Promotion approach</p><p className="mt-2 leading-6 text-muted">{partner.application?.audienceOrOutreachSummary ?? "Not available"}</p></div>
          <div><p className="font-semibold">Scanner health</p><p className="mt-2 leading-6 text-muted">{usage._sum.failures ?? 0} failures across {usage._sum.scanRequests ?? 0} requests.</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Administrator audit trail</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {auditLogs.length ? auditLogs.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1 border-b border-border pb-3 text-sm last:border-0 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="font-medium">{entry.action.replaceAll("_", " ")}</p><p className="text-muted">{entry.reason}</p></div>
              <time className="shrink-0 text-xs text-muted">{entry.createdAt.toLocaleString()}</time>
            </div>
          )) : <p className="text-sm text-muted">No administrator changes recorded.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

import { PartnerPayoutMethod } from "@prisma/client";
import Link from "next/link";

import {
  approvePartnerPayoutAction,
  cancelPartnerPayoutAction,
  createPartnerPayoutAction,
  markPartnerPayoutPaidAction,
} from "@/app/dashboard/admin/partners/payouts/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { releaseAvailablePartnerCommissions } from "@/lib/partners/commission-availability";
import { prisma } from "@/lib/prisma";

const pageSize = 30;
const field = "rounded-lg border border-border bg-background px-3 py-2 text-sm";

function money(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default async function PartnerPayoutAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const requested = Number.parseInt((await searchParams).page ?? "1", 10);
  await releaseAvailablePartnerCommissions();
  const page = Math.max(1, Number.isFinite(requested) ? requested : 1);
  const [partners, payouts, count] = await Promise.all([
    prisma.partnerProfile.findMany({
      where: { status: { in: ["ACTIVE", "TERMINATED"] } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.partnerPayout.findMany({
      include: {
        partner: { include: { user: { select: { name: true, email: true } } } },
        _count: { select: { items: true, adjustmentItems: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.partnerPayout.count(),
  ]);
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div><CardTitle>Create manual payout</CardTitle><p className="mt-2 text-sm text-muted">Eligible ledger items and carry adjustments are recalculated inside a locked server transaction.</p></div>
          <Link href="/dashboard/admin/partners/payouts/csv" className="shrink-0 text-sm font-semibold text-accent">Export paid CSV</Link>
        </CardHeader>
        <CardContent>
          <form action={createPartnerPayoutAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select name="partnerId" required className={field}>
              <option value="">Select eligible partner</option>
              {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.user.name || partner.user.email} ({partner.status})</option>)}
            </select>
            <input name="periodStart" type="date" defaultValue={start} required className={field} />
            <input name="periodEnd" type="date" defaultValue={end} required className={field} />
            <input name="thresholdOverrideReason" className={field} placeholder="Below-threshold reason" />
            <input name="finalPayoutReason" className={field} placeholder="Terminated-partner final payout reason" />
            <input name="adminNotes" className={`${field} sm:col-span-2`} placeholder="Optional operational note" />
            <SubmitButton>Create draft</SubmitButton>
          </form>
          <p className="mt-3 text-xs text-muted">Terminated partners require a final-payout reason. All partners still require approved payout eligibility, current terms, payout contact settings, and a clear compliance review.</p>
        </CardContent>
      </Card>

      {payouts.length ? payouts.map((payout) => (
        <Card key={payout.id}>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div><CardTitle>{payout.partner.user.name || payout.partner.user.email}</CardTitle><p className="mt-2 text-sm text-muted">{money(payout.netPayoutCents, payout.currency)} · {payout._count.items} commissions · {payout._count.adjustmentItems} carry adjustments</p></div>
            <span className="rounded-full border border-border px-2 py-1 text-xs">{payout.status}</span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <p>Gross: <strong>{money(payout.grossCommissionCents)}</strong></p>
              <p>Adjustments: <strong>{money(payout.adjustmentCents)}</strong></p>
              <p>Period: <strong>{payout.periodStart.toLocaleDateString()}–{payout.periodEnd.toLocaleDateString()}</strong></p>
              <p>Reference: <strong>{payout.externalReference ?? "Not paid"}</strong></p>
            </div>
            {payout.status === "DRAFT" ? (
              <div className="flex flex-wrap gap-3">
                <form action={approvePartnerPayoutAction} className="flex flex-wrap gap-2"><input type="hidden" name="payoutId" value={payout.id} /><input name="reason" required minLength={3} className={field} placeholder="Approval reason" /><SubmitButton>Approve</SubmitButton></form>
                <form action={cancelPartnerPayoutAction} className="flex flex-wrap gap-2"><input type="hidden" name="payoutId" value={payout.id} /><input name="reason" required minLength={3} className={field} placeholder="Cancellation reason" /><SubmitButton>Cancel draft</SubmitButton></form>
              </div>
            ) : null}
            {payout.status === "APPROVED" ? (
              <div className="space-y-3">
                <form action={markPartnerPayoutPaidAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <input type="hidden" name="payoutId" value={payout.id} />
                  <select name="paymentMethod" required className={field}>{Object.values(PartnerPayoutMethod).map((method) => <option key={method}>{method}</option>)}</select>
                  <input name="externalReference" required className={field} placeholder="External payment reference" />
                  <input name="reason" required minLength={3} className={field} placeholder="Completion reason" />
                  <SubmitButton>Mark paid</SubmitButton>
                </form>
                <form action={cancelPartnerPayoutAction} className="flex flex-wrap gap-2"><input type="hidden" name="payoutId" value={payout.id} /><input name="reason" required minLength={3} className={field} placeholder="Cancellation reason" /><SubmitButton>Cancel approved payout</SubmitButton></form>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )) : <Card><CardContent className="py-12 text-center text-sm text-muted">No payout records yet.</CardContent></Card>}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Page {page} of {pages}</span>
        <div className="flex gap-3">{page > 1 ? <Link className="font-semibold text-accent" href={`?page=${page - 1}`}>Previous</Link> : null}{page < pages ? <Link className="font-semibold text-accent" href={`?page=${page + 1}`}>Next</Link> : null}</div>
      </div>
    </div>
  );
}

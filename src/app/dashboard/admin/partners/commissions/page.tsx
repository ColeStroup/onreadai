import { PartnerCommissionStatus } from "@prisma/client";
import Link from "next/link";

import { createManualCommissionAdjustmentAction } from "@/app/dashboard/admin/partners/commissions/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { prisma } from "@/lib/prisma";

const pageSize = 30;
const field = "rounded-lg border border-border bg-background px-2 py-1.5 text-xs";

function money(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default async function PartnerCommissionsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const status = Object.values(PartnerCommissionStatus).includes(
    params.status as PartnerCommissionStatus,
  )
    ? (params.status as PartnerCommissionStatus)
    : undefined;
  const where = status ? { status } : {};
  const [items, count, totals] = await Promise.all([
    prisma.partnerCommission.findMany({
      where,
      include: {
        partner: { include: { user: { select: { name: true, email: true } } } },
        adjustments: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.partnerCommission.count({ where }),
    prisma.partnerCommission.aggregate({
      _sum: {
        commissionableAmountCents: true,
        originalCommissionAmountCents: true,
        netCommissionAmountCents: true,
        reversedAmountCents: true,
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Attributed subtotal", totals._sum.commissionableAmountCents],
          ["Original commission", totals._sum.originalCommissionAmountCents],
          ["Net commission", totals._sum.netCommissionAmountCents],
          ["Reversed", totals._sum.reversedAmountCents],
        ].map(([label, value]) => (
          <Card key={String(label)}><CardContent className="p-4"><p className="text-sm text-muted">{label}</p><p className="mt-2 text-xl font-semibold">{money(Number(value ?? 0))}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-end justify-between gap-4">
          <div><CardTitle>Commission ledger</CardTitle><p className="mt-2 text-sm text-muted">Manual credits and debits require a reason and never erase the original record.</p></div>
          <form className="flex items-center gap-2">
            <label className="text-xs text-muted" htmlFor="status-filter">Status</label>
            <select id="status-filter" name="status" defaultValue={status ?? ""} className={field}>
              <option value="">All</option>
              {Object.values(PartnerCommissionStatus).map((value) => <option key={value}>{value}</option>)}
            </select>
            <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">Filter</button>
          </form>
        </CardHeader>
        <CardContent>
          {items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead><tr className="border-b border-border text-muted"><th className="pb-3">Partner</th><th className="pb-3">Purchase</th><th className="pb-3">Subtotal</th><th className="pb-3">Rate</th><th className="pb-3">Net</th><th className="pb-3">Status</th><th className="pb-3">Available</th><th className="pb-3">Adjustment</th></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-border align-top last:border-0">
                      <td className="py-4"><p className="font-medium">{item.partner.user.name || "Partner"}</p><p className="text-xs text-muted">{item.partner.user.email}</p></td>
                      <td className="py-4">{item.purchaseType.replaceAll("_", " ")}</td>
                      <td className="py-4">{money(item.commissionableAmountCents, item.currency)}</td>
                      <td className="py-4">{item.commissionRateBps / 100}%</td>
                      <td className="py-4 font-semibold">{money(item.netCommissionAmountCents, item.currency)}</td>
                      <td className="py-4">{item.status.replaceAll("_", " ")}</td>
                      <td className="py-4">{item.availableAt.toLocaleDateString()}</td>
                      <td className="py-4">
                        <form action={createManualCommissionAdjustmentAction.bind(null, item.id)} className="grid min-w-72 grid-cols-[auto_90px_1fr_auto] gap-2">
                          <select name="direction" className={field}><option>CREDIT</option><option>DEBIT</option></select>
                          <input name="amountCents" type="number" min={1} max={10000000} required className={field} placeholder="Cents" />
                          <input name="reason" required minLength={3} maxLength={1000} className={field} placeholder="Required reason" />
                          <SubmitButton className="px-3 py-1.5 text-xs" pendingLabel="Saving...">Apply</SubmitButton>
                        </form>
                        <p className="mt-1 text-xs text-muted">{item.adjustments.length} existing adjustment{item.adjustments.length === 1 ? "" : "s"}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="py-10 text-center text-sm text-muted">No commission records.</p>}
          <div className="mt-5 flex items-center justify-between text-sm">
            <span className="text-muted">Page {page} of {pages}</span>
            <div className="flex gap-3">
              {page > 1 ? <Link className="font-semibold text-accent" href={`?page=${page - 1}${status ? `&status=${status}` : ""}`}>Previous</Link> : null}
              {page < pages ? <Link className="font-semibold text-accent" href={`?page=${page + 1}${status ? `&status=${status}` : ""}`}>Next</Link> : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

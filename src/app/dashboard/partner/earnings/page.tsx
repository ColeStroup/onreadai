import { PartnerCommissionStatus } from "@prisma/client";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { effectiveCommissionStatus } from "@/lib/partners/commission-policy";
import { releaseAvailablePartnerCommissions } from "@/lib/partners/commission-availability";
import { requirePartner } from "@/lib/partners/authorization";
import { prisma } from "@/lib/prisma";

const pageSize = 20;
function money(cents: number, currency = "usd") { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100); }
const explanations: Record<PartnerCommissionStatus, string> = {
  PENDING: "The customer paid, but the commission is still within the refund hold period.",
  AVAILABLE: "This amount is eligible for the next payout.",
  PAID: "This amount was included in a completed payout.",
  REVERSED: "The related payment was refunded, disputed, or otherwise became ineligible.",
  PARTIALLY_REVERSED: "Part of the related payment became ineligible; the remaining amount is shown.",
  REJECTED: "This payment did not satisfy the commission policy.",
};

export default async function PartnerEarningsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { partner } = await requirePartner("/dashboard/partner/earnings");
  await releaseAvailablePartnerCommissions(partner.id);
  const requested = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isFinite(requested) ? Math.max(1, requested) : 1;
  const [items, count, totals, refundTotal] = await Promise.all([
    prisma.partnerCommission.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.partnerCommission.count({ where: { partnerId: partner.id } }),
    prisma.partnerCommission.aggregate({ where: { partnerId: partner.id }, _sum: { commissionableAmountCents: true, netCommissionAmountCents: true } }),
    prisma.partnerCommissionAdjustment.aggregate({ where: { partnerId: partner.id, amountCents: { lt: 0 } }, _sum: { amountCents: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(count / pageSize));
  return <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="p-5"><p className="text-sm text-muted">Attributed payment subtotal</p><p className="mt-2 text-2xl font-semibold">{money(totals._sum.commissionableAmountCents ?? 0)}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted">Net commission ledger</p><p className="mt-2 text-2xl font-semibold">{money(totals._sum.netCommissionAmountCents ?? 0)}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted">Reversals and debits</p><p className="mt-2 text-2xl font-semibold">{money(refundTotal._sum.amountCents ?? 0)}</p></CardContent></Card></div><Card><CardHeader><CardTitle>Commission history</CardTitle><p className="text-sm text-muted">Customer identities and Stripe billing details are intentionally not shown.</p></CardHeader><CardContent>{items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-border text-muted"><th className="pb-3 font-medium">Purchase</th><th className="pb-3 font-medium">Eligible subtotal</th><th className="pb-3 font-medium">Rate</th><th className="pb-3 font-medium">Commission</th><th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">Available</th></tr></thead><tbody>{items.map((item) => { const status = effectiveCommissionStatus({ storedStatus: item.status, availableAt: item.availableAt, netCommissionAmountCents: item.netCommissionAmountCents, disputeOpen: item.disputeOpen }); return <tr key={item.id} className="border-b border-border last:border-0"><td className="py-4"><p className="font-medium">{item.purchaseType.replaceAll("_", " ")}</p><p className="text-xs text-muted">{item.createdAt.toLocaleDateString()}</p></td><td className="py-4">{money(item.commissionableAmountCents, item.currency)}</td><td className="py-4">{item.commissionRateBps / 100}%</td><td className="py-4 font-semibold">{money(item.netCommissionAmountCents, item.currency)}</td><td className="py-4"><span className="rounded-full border border-border px-2 py-1 text-xs">{status.replaceAll("_", " ")}</span><span className="sr-only">. {explanations[status]}</span></td><td className="py-4 text-muted">{item.availableAt.toLocaleDateString()}</td></tr>; })}</tbody></table></div> : <p className="py-8 text-center text-sm text-muted">No commission entries yet.</p>}<div className="mt-5 flex items-center justify-between text-sm"><span className="text-muted">Page {page} of {pages}</span><div className="flex gap-3">{page > 1 ? <Link className="font-semibold text-accent" href={`?page=${page - 1}`}>Previous</Link> : null}{page < pages ? <Link className="font-semibold text-accent" href={`?page=${page + 1}`}>Next</Link> : null}</div></div></CardContent></Card><Card><CardContent className="grid gap-3 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">{Object.entries(explanations).map(([status, text]) => <div key={status}><p className="font-semibold">{status.replaceAll("_", " ")}</p><p className="mt-1 leading-5 text-muted">{text}</p></div>)}</CardContent></Card></div>;
}

import { requireAdmin } from "@/lib/partners/authorization";
import { safeCsvCell } from "@/lib/partners/payout-csv";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  await requireAdmin("/dashboard/admin/partners/payouts");
  const payouts = await prisma.partnerPayout.findMany({
    where: { status: "PAID" },
    include: {
      partner: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
    orderBy: { paidAt: "desc" },
    take: 5_000,
  });
  const rows = [
    [
      "payout_id",
      "partner",
      "contact_email",
      "amount",
      "currency",
      "period_start",
      "period_end",
      "method",
      "external_reference",
      "paid_at",
    ],
    ...payouts.map((payout) => [
      payout.id,
      payout.partner.user.name ?? "",
      payout.partner.payoutContactEmail ?? payout.partner.user.email ?? "",
      (payout.netPayoutCents / 100).toFixed(2),
      payout.currency.toUpperCase(),
      payout.periodStart.toISOString(),
      payout.periodEnd.toISOString(),
      payout.paymentMethod ?? "",
      payout.externalReference ?? "",
      payout.paidAt?.toISOString() ?? "",
    ]),
  ];

  return new Response(
    rows.map((row) => row.map(safeCsvCell).join(",")).join("\r\n"),
    {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="partner-payouts-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "private, no-store",
      },
    },
  );
}

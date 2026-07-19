import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPartnerProgramSettings } from "@/lib/partners/config";
import { prisma } from "@/lib/prisma";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function PartnerAdminOverviewPage() {
  const settings = await getPartnerProgramSettings();
  const failureSince = new Date();
  failureSince.setUTCDate(failureSince.getUTCDate() - 7);
  const [pending, active, commissions, payouts, failures, complianceReviews, termsMismatches] = await Promise.all([
    prisma.partnerApplication.count({ where: { status: "PENDING" } }),
    prisma.partnerProfile.count({ where: { status: "ACTIVE" } }),
    prisma.partnerCommission.aggregate({
      _sum: { commissionableAmountCents: true, netCommissionAmountCents: true },
    }),
    prisma.partnerPayout.aggregate({
      where: { status: "PAID" },
      _sum: { netPayoutCents: true },
    }),
    prisma.partnerProspectScan.count({
      where: { status: "FAILED", updatedAt: { gte: failureSince } },
    }),
    prisma.partnerProfile.count({
      where: { complianceReviewStatus: { not: "CLEAR" } },
    }),
    prisma.partnerProfile.count({
      where: {
        status: "ACTIVE",
        OR: [
          { currentTermsVersion: null },
          { currentTermsVersion: { not: settings.currentTermsVersion } },
        ],
      },
    }),
  ]);
  const controls = [
    ["Program", settings.enabled],
    ["Applications", settings.applicationsOpen],
    ["Attribution", settings.referralAttributionEnabled],
    ["Commissions", settings.commissionCreationEnabled],
    ["Scanner", settings.scannerEnabled],
    ["Previews", settings.previewPagesEnabled],
    ["Manual payouts", settings.manualPayoutWorkflowEnabled],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Pending applications", pending],
          ["Active partners", active],
          ["Attributed revenue", money(commissions._sum.commissionableAmountCents ?? 0)],
          ["Commission expense", money(commissions._sum.netCommissionAmountCents ?? 0)],
        ].map(([label, value]) => (
          <Card key={String(label)}><CardContent className="p-5"><p className="text-sm text-muted">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Program controls</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {controls.map(([label, enabled]) => (
            <div key={label} className="rounded-lg border border-border p-3"><p className="text-muted">{label}</p><p className="mt-1 font-semibold">{enabled ? "Enabled" : "Disabled"}</p></div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Operational totals</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Paid payouts: <strong>{money(payouts._sum.netPayoutCents ?? 0)}</strong></p>
            <p>Scanner failures in 7 days: <strong>{failures}</strong></p>
            <p>Compliance reviews: <strong>{complianceReviews}</strong></p>
            <p>Terms-version mismatches: <strong>{termsMismatches}</strong></p>
            <p>Missing signing secret: <strong>{process.env.PARTNER_REFERRAL_SIGNING_SECRET ? "No" : "Yes"}</strong></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Review queue</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted">Review applications before creating a partner profile. Approval never skips certification.</p>
            <Link href="/dashboard/admin/partners/applications" className="mt-4 inline-flex text-sm font-semibold text-accent">Open applications</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PartnerScannerForm } from "@/app/dashboard/partner/scanner/scanner-form";
import { requirePartner } from "@/lib/partners/authorization";
import { getPartnerProgramSettings } from "@/lib/partners/config";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

export default async function PartnerScannerPage() {
  const { partner } = await requirePartner("/dashboard/partner/scanner");
  const settings = await getPartnerProgramSettings();
  const month = new Date().toISOString().slice(0, 7);
  const usage = await prisma.partnerScannerUsage.aggregate({ where: { partnerId: partner.id, usageMonth: month }, _sum: { scanRequests: true, freshScans: true, cachedScans: true, failures: true } });
  const available = settings.enabled && settings.scannerEnabled && partner.status === "ACTIVE" && partner.scannerEnabled;
  return <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]"><Card><CardHeader><CardTitle>Partner Scanner</CardTitle><p className="text-sm text-muted">Identify up to three high-confidence public website observations for a professional conversation.</p></CardHeader><CardContent>{available ? <PartnerScannerForm /> : <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-muted">Scanner access is unavailable. Complete certification or contact an administrator if you believe this is incorrect.</div>}</CardContent></Card><div className="space-y-6"><Card><CardHeader><CardTitle>Fair-use limits</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-muted">Today</p><p className="mt-1 text-xl font-semibold">Up to {partner.scannerDailyLimit}</p></div><div><p className="text-muted">This month</p><p className="mt-1 text-xl font-semibold">{usage._sum.scanRequests ?? 0} / {partner.scannerMonthlyLimit}</p></div><div><p className="text-muted">Fresh crawls</p><p className="mt-1 font-semibold">{usage._sum.freshScans ?? 0}</p></div><div><p className="text-muted">Cache reuse</p><p className="mt-1 font-semibold">{usage._sum.cachedScans ?? 0}</p></div></CardContent></Card><Card><CardHeader><CardTitle>What the result means</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-6 text-muted"><p>The result is a lightweight scan, not a full audit and not private analytics.</p><p>It may miss script-rendered controls or visual context. Use the evidence as a respectful conversation starter, not proof of business performance.</p><p>When evidence is insufficient, the scanner returns fewer than three observations rather than inventing findings.</p></CardContent></Card></div></div>;
}

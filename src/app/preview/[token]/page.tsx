import { PartnerProspectScanStatus, PartnerStatus, PlanType } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { planDefinitions } from "@/lib/billing/plans";
import { brand } from "@/lib/brand";
import { getPartnerProgramSettings } from "@/lib/partners/config";
import { hashPreviewToken } from "@/lib/partners/preview-token";
import type { PartnerScannerFinding } from "@/lib/partners/scanner";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: `Public Website Scan | ${brand.name}`,
  description: "A limited public static-website scan shared by a Certified Growth Partner.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function publicFindings(value: unknown): PartnerScannerFinding[] {
  return Array.isArray(value)
    ? value
        .filter(
          (item): item is PartnerScannerFinding =>
            Boolean(
              item &&
                typeof item === "object" &&
                "title" in item &&
                "evidenceSummary" in item,
            ),
        )
        .slice(0, 3)
    : [];
}

export default async function PartnerPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const settings = await getPartnerProgramSettings();
  if (
    !settings.enabled ||
    !settings.previewPagesEnabled ||
    token.length < 32 ||
    token.length > 100
  ) {
    notFound();
  }
  const preview = await prisma.partnerProspectPreview.findUnique({
    where: { tokenHash: hashPreviewToken(token) },
    include: { partner: true, prospect: true, scan: true },
  });
  if (
    !preview ||
    preview.revokedAt ||
    preview.expiresAt <= new Date() ||
    preview.partner.status !== PartnerStatus.ACTIVE ||
    !preview.partner.referralEnabled ||
    preview.scan.status !== PartnerProspectScanStatus.COMPLETED
  ) {
    notFound();
  }
  const findings = publicFindings(preview.scan.findings);
  const businessDestination = `/dashboard/businesses/new?businessInput=${encodeURIComponent(preview.prospect.websiteUrl)}`;
  const signupDestination = `/signup?callbackUrl=${encodeURIComponent(businessDestination)}`;
  const referralHref = `/r/${encodeURIComponent(preview.partner.referralCode)}?to=${encodeURIComponent(signupDestination)}&preview=${encodeURIComponent(token)}`;
  const offers = [PlanType.ONE_TIME_AUDIT, PlanType.STARTER, PlanType.PRO].map(
    (plan) => planDefinitions[plan],
  );

  return (
    <MarketingShell>
      <main>
        <section className="border-b border-white/10 bg-[#071011] py-16 sm:py-20">
          <div className="mx-auto w-full max-w-5xl px-6 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Lightweight public website scan</p>
            <h1 className="mt-4 text-4xl font-semibold text-white">{preview.prospect.businessName || preview.prospect.normalizedDomain}</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">A Certified Growth Partner reviewed accessible static website evidence. No private analytics, customer account, traffic, revenue, or conversion data was accessed.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={referralHref} className="inline-flex h-11 items-center rounded-lg bg-teal-300 px-5 text-sm font-semibold text-[#052b27]">Create your own account</Link>
              <a href={preview.prospect.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-lg border border-white/15 px-5 text-sm font-semibold text-white">Open public website</a>
            </div>
          </div>
        </section>

        <section className="bg-[#0a1415] py-16">
          <div className="mx-auto w-full max-w-5xl px-6 lg:px-8">
            <h2 className="text-3xl font-semibold text-white">Observed opportunities</h2>
            <p className="mt-4 text-slate-400">The scanner returns fewer than three findings when evidence is insufficient. These observations are not a complete audit.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {findings.length ? findings.map((finding) => (
                <article key={`${finding.title}-${finding.scannedPageLabel}`} className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                  <p className="text-xs font-semibold uppercase text-teal-300">{finding.category} · {finding.confidence}</p>
                  <h3 className="mt-4 font-semibold text-white">{finding.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{finding.evidenceSummary}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{finding.whyItMayMatter}</p>
                  <p className="mt-4 text-xs text-slate-500">Evidence page: {finding.scannedPageLabel}</p>
                </article>
              )) : (
                <div className="rounded-lg border border-white/10 bg-[#0d1718] p-6 text-sm text-slate-400 md:col-span-3">This lightweight scan did not produce a high-confidence finding. A complete audit may evaluate additional areas after the business confirms its context and profiles.</div>
              )}
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#071011] py-16">
          <div className="mx-auto w-full max-w-5xl px-6 lg:px-8">
            <h2 className="text-3xl font-semibold text-white">What the complete workspace adds</h2>
            <p className="mt-4 max-w-3xl leading-7 text-slate-400">The complete audit evaluates additional areas of the business&apos;s online presence after the account owner confirms what the business does, its audience, offer, profiles, goals, and competitors.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {offers.map((offer) => (
                <article key={offer.plan} className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                  <p className="text-sm text-teal-300">{offer.price} {offer.cadence}</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">{offer.name}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{offer.description}</p>
                  <ul className="mt-5 space-y-2 text-sm text-slate-300">{offer.features.slice(0, 4).map((feature) => <li key={feature}>· {feature}</li>)}</ul>
                </article>
              ))}
            </div>
            <p className="mt-8 text-sm text-slate-400">The business owns its account, audits, reports, data, and billing. The referring partner does not receive workspace access.</p>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}

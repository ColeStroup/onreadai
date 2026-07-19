import {
  BadgeCheck,
  BookOpenCheck,
  ChartNoAxesCombined,
  Handshake,
  Radar,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuditPreview } from "@/components/marketing/audit-preview";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { createMarketingMetadata, brand } from "@/lib/brand";
import { getPartnerProgramSettings } from "@/lib/partners/config";

export const metadata: Metadata = createMarketingMetadata({
  title: `Partner Program | ${brand.name}`,
  description:
    "Apply to become a Certified Growth Partner, introduce evidence-backed growth audits, and earn commission on eligible customer purchases.",
  pathname: "/partners",
});

const paths = [
  {
    title: "Professional outreach",
    text: "Use honest one-to-one conversations and an optional lightweight public website scan to identify a useful starting point.",
    icon: Radar,
  },
  {
    title: "Educational content",
    text: "Create walkthroughs, public-evidence teardowns, and practical growth education with a clear partner disclosure.",
    icon: BookOpenCheck,
  },
  {
    title: "Existing client work",
    text: "Introduce the platform to consulting clients while keeping any independent implementation agreement separate.",
    icon: Handshake,
  },
] as const;

const faq = [
  ["How does commission work?", "The launch default is 20% of eligible payment subtotal after discounts and excluding tax. One-time Full Audit purchases and up to the first 12 paid subscription months may qualify. A refund hold applies before payout eligibility."],
  ["Do partners receive Pro access?", "No. Partner certification does not change product entitlements and does not grant access to customer workspaces."],
  ["Can I offer implementation services?", "Yes. You may independently offer consulting or implementation services using your own pricing and contract. The platform is not a party to that agreement and does not process its payment."],
  ["Are clients or earnings guaranteed?", "No. The program does not guarantee leads, customers, conversions, revenue, or business outcomes."],
  ["How are partners paid?", "Payouts are reviewed and recorded manually in v1 after commissions clear the hold period, eligibility checks, and the configured minimum."],
] as const;

export default async function PartnersPage() {
  const settings = await getPartnerProgramSettings();
  const applicationsAvailable = settings.enabled && settings.applicationsOpen;

  return (
    <MarketingShell>
      <main>
        <section className="relative overflow-hidden border-b border-white/10 bg-[#071011]">
          <div className="mx-auto w-full max-w-5xl px-6 py-14 text-center sm:py-16 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
                Partner Program
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">
                Become a Certified Growth Partner.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                We build the intelligence and implementation platform. Certified partners introduce it to businesses, earn referral commissions on eligible purchases, and may independently offer implementation services.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/partners/apply"
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-300 px-5 text-sm font-semibold text-[#052b27] hover:bg-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  {applicationsAvailable ? "Apply to the program" : "View application status"}
                </Link>
                <Link
                  href="/partners/commission-policy"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-white/15 px-5 text-sm font-semibold text-white hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                >
                  Review commission policy
                </Link>
              </div>
              {!applicationsAvailable ? (
                <p className="mt-4 text-sm text-amber-200">
                  Applications are currently closed or invite-only. Program information remains available for review.
                </p>
              ) : null}
            </div>
            <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-2 text-center text-xs text-slate-300">
              <div className="border-y border-white/10 px-3 py-3">Evidence-led</div>
              <div className="border-y border-white/10 px-3 py-3">20% default</div>
              <div className="border-y border-white/10 px-3 py-3">Manual payouts</div>
            </div>
          </div>
        </section>

        <section className="bg-[#0a1415] py-16 sm:py-20" aria-labelledby="partner-fit">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Flexible promotion</p>
              <h2 id="partner-fit" className="mt-3 text-3xl font-semibold text-white">Choose a compliant approach that fits how you already work.</h2>
              <p className="mt-4 leading-7 text-slate-400">The program provides training, evidence standards, resources, referral tracking, and an optional scanner. It does not force one sales method.</p>
            </div>
            <div className="mt-10 max-w-5xl">
              <AuditPreview />
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {paths.map((path) => {
                const Icon = path.icon;
                return (
                  <article key={path.title} className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                    <Icon className="size-5 text-teal-300" aria-hidden="true" />
                    <h3 className="mt-6 text-lg font-semibold text-white">{path.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">{path.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#071011] py-16 sm:py-20" aria-labelledby="program-flow">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <h2 id="program-flow" className="text-3xl font-semibold text-white">A reviewed program, not an instant affiliate link.</h2>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 md:grid-cols-4">
              {[
                ["01", "Apply", "Tell us about your experience, audience, and intended promotion approach."],
                ["02", "Get approved", "An administrator reviews every application. Approval starts training, not referrals."],
                ["03", "Earn certification", "Complete evidence, outreach, disclosure, product-limit, and commission training."],
                ["04", "Refer responsibly", "Use your unique link and view eligible earnings without customer-account access."],
              ].map(([number, title, text]) => (
                <li key={number} className="min-h-60 bg-[#0d1718] p-6">
                  <span className="font-mono text-xs text-teal-300">{number}</span>
                  <h3 className="mt-8 font-semibold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-[#0a1415] py-16 sm:py-20" aria-labelledby="standards-heading">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <ShieldCheck className="size-6 text-teal-300" aria-hidden="true" />
              <h2 id="standards-heading" className="mt-5 text-3xl font-semibold text-white">The customer stays in control.</h2>
              <ul className="mt-6 space-y-3 text-sm leading-6 text-slate-300">
                <li className="border-l border-teal-300 pl-4">Businesses purchase directly and own their account, data, audits, and billing.</li>
                <li className="border-l border-teal-300 pl-4">Referral attribution grants commission eligibility only.</li>
                <li className="border-l border-teal-300 pl-4">Partners do not receive customer workspace or private audit access.</li>
                <li className="border-l border-teal-300 pl-4">Independent services use a separate agreement between partner and business.</li>
              </ul>
            </div>
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-7">
              <BadgeCheck className="size-5 text-amber-200" aria-hidden="true" />
              <h3 className="mt-5 text-lg font-semibold text-white">Professional claims only</h3>
              <p className="mt-4 text-sm leading-7 text-slate-400">The program does not guarantee leads, customers, conversions, revenue, or business outcomes. Partners must keep public scans, comparisons, and promotional claims proportional to observed evidence and clearly state their limitations.</p>
              <Link href="/partners/promotion-standards" className="mt-5 inline-flex text-sm font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">Read promotion standards</Link>
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-[#071011] py-16 sm:py-20" aria-labelledby="partner-faq">
          <div className="mx-auto w-full max-w-4xl px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <ChartNoAxesCombined className="size-5 text-teal-300" aria-hidden="true" />
              <h2 id="partner-faq" className="text-3xl font-semibold text-white">Partner FAQ</h2>
            </div>
            <div className="mt-8 divide-y divide-white/10 rounded-lg border border-white/10 bg-[#0d1718]">
              {faq.map(([question, answer]) => (
                <details key={question} className="group p-5 open:bg-white/[0.02]">
                  <summary className="cursor-pointer list-none font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">{question}</summary>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}

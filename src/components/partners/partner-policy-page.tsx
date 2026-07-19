import Link from "next/link";

import { MarketingShell } from "@/components/marketing/marketing-shell";

export type PartnerPolicySection = {
  title: string;
  paragraphs: string[];
};

export function PartnerPolicyPage({
  eyebrow,
  title,
  summary,
  sections,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  sections: PartnerPolicySection[];
}) {
  return (
    <MarketingShell>
      <main className="bg-[#071011] py-14 sm:py-20">
        <article className="mx-auto w-full max-w-4xl px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">{eyebrow}</p>
          <h1 className="mt-4 text-4xl font-semibold text-white">{title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{summary}</p>
          <p className="mt-5 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100">Draft version 1.0. Acceptance is versioned inside the application.</p>
          <div className="mt-10 space-y-5">
            {sections.map((section) => (
              <section key={section.title} className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                <h2 className="text-xl font-semibold text-white">{section.title}</h2>
                <div className="mt-4 space-y-3 text-sm leading-7 text-slate-400">
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-4 text-sm">
            <Link href="/partners" className="font-semibold text-teal-200">Partner Program</Link>
            <Link href="/partners/commission-policy" className="text-slate-300">Commission Policy</Link>
            <Link href="/partners/promotion-standards" className="text-slate-300">Promotion Standards</Link>
            <Link href="/partners/scanner-policy" className="text-slate-300">Scanner Policy</Link>
          </div>
        </article>
      </main>
    </MarketingShell>
  );
}

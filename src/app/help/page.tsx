import { BookOpen, CircleHelp, LifeBuoy, SearchCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FaqSection } from "@/components/marketing/faq-section";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PublicPageHero } from "@/components/marketing/public-page-hero";
import { createMarketingMetadata } from "@/lib/brand";

export const metadata: Metadata = createMarketingMetadata({
  title: "Help and FAQ | Onread AI",
  description:
    "Learn how growth audits, confirmed profiles, website and SEO checks, social strategy, competitor intelligence, implementation help, and progress comparisons work.",
  pathname: "/help",
});

const startingPoints = [
  {
    title: "Prepare the inputs",
    description: "Add a business, confirm the profiles that belong to it, review Business Context, and choose goals.",
    icon: SearchCheck,
  },
  {
    title: "Read findings as evidence",
    description: "Use scores to orient yourself, then read the finding, evidence, limitation, and recommendation together.",
    icon: BookOpen,
  },
  {
    title: "Work the Action Plan",
    description: "Start with the highest-value recommendation, generate implementation help where useful, and track status.",
    icon: CircleHelp,
  },
] as const;

export default function HelpPage() {
  return (
    <MarketingShell>
      <main>
        <PublicPageHero
          eyebrow="Help and FAQ"
          title="Understand what the audit knows, what it means, and what to do next."
          description="Plain-language guidance for preparing a business, interpreting evidence, using implementation tools, and understanding the limits of public data."
          icon={LifeBuoy}
        />

        <section aria-labelledby="start-heading" className="bg-[#0a1415] py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <h2 id="start-heading" className="text-3xl font-semibold text-white">Start with the workflow</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {startingPoints.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                    <Icon className="size-5 text-teal-300" aria-hidden="true" />
                    <h3 className="mt-5 text-lg font-semibold text-white">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">{item.description}</p>
                  </article>
                );
              })}
            </div>
            <p className="mt-6 text-sm text-slate-400">
              Already signed in? The <Link href="/dashboard/help" className="rounded-sm font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">workspace Help Center</Link> includes feature-by-feature guidance tied to dashboard terminology.
            </p>
          </div>
        </section>

        <FaqSection />

        <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-24 bg-[#0a1415] py-16">
          <div className="mx-auto w-full max-w-4xl px-6 lg:px-8">
            <h2 id="contact-heading" className="text-3xl font-semibold text-white">Need account-specific help?</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              Sign in and open the workspace Help Center so your question can reference the same feature names and setup flow you see in the application. A public support email has not been published yet, so this page does not invent one.
            </p>
            <div className="mt-7 flex flex-wrap gap-4">
              <Link href="/signin" className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-300 px-5 font-semibold text-[#052b27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Sign In</Link>
              <Link href="/methodology" className="inline-flex h-11 items-center justify-center rounded-lg border border-white/15 px-5 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">Read Methodology</Link>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}

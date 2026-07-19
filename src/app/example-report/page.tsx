import {
  ArrowRight,
  BarChart3,
  Bot,
  FilePenLine,
  FileText,
  Presentation,
  Scale,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PublicPageCta } from "@/components/marketing/public-page-cta";
import { createMarketingMetadata } from "@/lib/brand";

export const metadata: Metadata = createMarketingMetadata({
  title: "Example Business Growth Audit Report | Onread AI",
  description:
    "Explore a sanitized fictional growth audit with scores, evidence-backed priorities, competitor comparison, implementation help, and report deliverables.",
  pathname: "/example-report",
});

const scores = [
  ["Website", 75, "Fair"],
  ["SEO", 68, "Needs attention"],
  ["Branding", 84, "Good"],
  ["Social", 72, "Fair"],
  ["Reviews", 86, "Good"],
  ["Competitive position", 64, "Needs attention"],
] as const;

const priorities = [
  {
    title: "Clarify the homepage offer and primary action",
    description: "Use one descriptive H1 and one prominent action that matches the main storefront conversion path.",
    evidence: "No clear homepage H1 was observed, and the primary action competes with several secondary links.",
    category: "Website",
    effort: "Low",
    impact: "High",
  },
  {
    title: "Complete high-value page metadata",
    description: "Write useful descriptions for the homepage and the most important product or collection pages first.",
    evidence: "Five of twelve scanned pages were missing a useful meta description.",
    category: "SEO",
    effort: "Medium",
    impact: "High",
  },
  {
    title: "Move customer proof closer to the decision point",
    description: "Place confirmed rating context and approved customer proof near the primary shopping action.",
    evidence: "Review presence is confirmed, but customer proof was not prominent near the main conversion path.",
    category: "Reviews & trust",
    effort: "Low",
    impact: "Medium",
  },
] as const;

export default function ExampleReportPage() {
  return (
    <MarketingShell>
      <main className="bg-[#071011]">
        <header className="border-b border-white/10 bg-[#081213]">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-14 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8 lg:py-16">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-300/[0.08] px-3 py-1.5 text-xs font-semibold text-teal-100">
                <ShieldCheck className="size-3.5 text-teal-300" aria-hidden="true" />
                Sanitized fictional example
              </div>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Growth Audit Report</p>
              <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl lg:text-6xl">Harbor &amp; Pine</h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">
                A fictional coastal retail brand used to demonstrate report structure. No values on this page represent a real customer or a promised result.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-md border border-white/10 px-2.5 py-1.5">Example audit</span>
                <span className="rounded-md border border-white/10 px-2.5 py-1.5">Website supplied</span>
                <span className="rounded-md border border-white/10 px-2.5 py-1.5">2 confirmed social profiles</span>
              </div>
            </div>
            <div className="flex size-36 flex-col items-center justify-center rounded-full border-[10px] border-teal-300 border-r-slate-700 bg-[#0d1718] text-center">
              <span className="text-5xl font-semibold leading-none text-white">75</span>
              <span className="mt-1 text-xs text-slate-400">Overall / 100</span>
            </div>
          </div>
        </header>

        <section aria-labelledby="summary-heading" className="bg-[#0a1415] py-14 sm:py-16">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <article className="rounded-lg border border-white/10 bg-[#0d1718] p-6 sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">Executive summary</p>
                <h2 id="summary-heading" className="mt-3 text-2xl font-semibold text-white">A credible foundation with a clearer conversion path still to build.</h2>
                <p className="mt-4 text-sm leading-7 text-slate-400">
                  Harbor &amp; Pine has useful review coverage and a recognizable public brand. The strongest next opportunity is to make the homepage offer, primary action, and customer proof easier to understand at the moment a visitor decides whether to shop.
                </p>
              </article>
              <article className="rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-6 sm:p-7">
                <Target className="size-5 text-amber-300" aria-hidden="true" />
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">What matters most</p>
                <p className="mt-3 text-lg font-semibold text-white">Make the main offer and visitor action unmistakable.</p>
                <p className="mt-3 text-sm leading-6 text-slate-400">This recommendation connects the observed heading gap, CTA competition, and public competitor difference.</p>
              </article>
            </div>
          </div>
        </section>

        <section aria-labelledby="health-heading" className="border-y border-white/10 bg-[#071011] py-14 sm:py-16">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <BarChart3 className="size-5 text-teal-300" aria-hidden="true" />
              <h2 id="health-heading" className="text-2xl font-semibold text-white">Overall health</h2>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {scores.map(([label, score, status]) => (
                <article key={label} className="rounded-lg border border-white/10 bg-[#0d1718] p-4">
                  <p className="text-xs leading-5 text-slate-400">{label}</p>
                  <p className="mt-4 text-3xl font-semibold text-white">{score}<span className="text-sm text-slate-400">/100</span></p>
                  <p className={`mt-2 text-xs ${score >= 80 ? "text-teal-200" : score >= 70 ? "text-slate-300" : "text-amber-200"}`}>{status}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="priorities-heading" className="bg-[#0a1415] py-14 sm:py-16">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">Prioritized Action Plan</p>
            <h2 id="priorities-heading" className="mt-3 text-3xl font-semibold text-white">Next 3 Moves</h2>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {priorities.map((priority, index) => (
                <article key={priority.title} className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex size-8 items-center justify-center rounded-full bg-teal-300 text-sm font-semibold text-[#052b27]">{index + 1}</span>
                    <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-400">{priority.category}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-semibold text-white">{priority.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{priority.description}</p>
                  <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400"><span className="font-semibold text-slate-300">Evidence:</span> {priority.evidence}</p>
                  <dl className="mt-4 flex gap-4 text-xs">
                    <div><dt className="text-slate-400">Effort</dt><dd className="mt-1 text-slate-300">{priority.effort}</dd></div>
                    <div><dt className="text-slate-400">Impact</dt><dd className="mt-1 text-teal-200">{priority.impact}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="comparison-heading" className="border-y border-white/10 bg-[#071011] py-14 sm:py-16">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 lg:grid-cols-[0.65fr_1.35fr] lg:items-start lg:px-8">
            <div>
              <Scale className="size-5 text-teal-300" aria-hidden="true" />
              <h2 id="comparison-heading" className="mt-5 text-3xl font-semibold text-white">Public competitor comparison</h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">Observable evidence for fictional competitor Northline Goods. Private performance is not included.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Fictional Harbor and Pine competitor comparison</caption>
                <thead className="bg-[#111e1f] text-xs text-slate-400">
                  <tr><th scope="col" className="px-4 py-3">Area</th><th scope="col" className="px-4 py-3">Harbor &amp; Pine</th><th scope="col" className="px-4 py-3">Northline Goods</th><th scope="col" className="hidden px-4 py-3 sm:table-cell">Result</th></tr>
                </thead>
                <tbody className="bg-[#0d1718] text-slate-300">
                  <tr className="border-t border-white/10"><th scope="row" className="px-4 py-3 text-white">Website</th><td className="px-4 py-3">75</td><td className="px-4 py-3">91</td><td className="hidden px-4 py-3 text-amber-200 sm:table-cell">Competitor leads</td></tr>
                  <tr className="border-t border-white/10"><th scope="row" className="px-4 py-3 text-white">SEO</th><td className="px-4 py-3">68</td><td className="px-4 py-3">88</td><td className="hidden px-4 py-3 text-amber-200 sm:table-cell">Competitor leads</td></tr>
                  <tr className="border-t border-white/10"><th scope="row" className="px-4 py-3 text-white">Reviews</th><td className="px-4 py-3">Confirmed</td><td className="px-4 py-3">Unavailable</td><td className="hidden px-4 py-3 text-slate-400 sm:table-cell">Not comparable</td></tr>
                  <tr className="border-t border-white/10"><th scope="row" className="px-4 py-3 text-white">Social</th><td className="px-4 py-3">2 confirmed</td><td className="px-4 py-3">2 confirmed</td><td className="hidden px-4 py-3 text-teal-200 sm:table-cell">Similar</td></tr>
                </tbody>
              </table>
              <p className="border-t border-white/10 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">Opportunity: clarify the homepage offer and primary shopping action.</p>
            </div>
          </div>
        </section>

        <section id="implementation-help" aria-labelledby="implementation-example-heading" className="scroll-mt-24 bg-[#0a1415] py-14 sm:py-16">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <FilePenLine className="size-5 text-teal-300" aria-hidden="true" />
              <h2 id="implementation-example-heading" className="text-3xl font-semibold text-white">Implementation Help</h2>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">The recommendation becomes review-ready material. Nothing is published or edited automatically.</p>
            <div className="mt-8 grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
              <article className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Recommendation</p>
                <h3 className="mt-3 text-xl font-semibold text-white">Give the homepage one clear main headline</h3>
                <p className="mt-4 text-sm leading-6 text-slate-400">The current homepage has no descriptive H1. Start with the offer and pair it with the primary shopping action.</p>
              </article>
              <article className="rounded-lg border border-teal-300/30 bg-teal-300/[0.05] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-200">Draft options</p>
                <ol className="mt-4 grid gap-3 sm:grid-cols-3">
                  {["Coastal essentials, made for unhurried weekends.", "Thoughtful goods for life near the water.", "Bring the calm of the coast into every day."].map((option, index) => (
                    <li key={option} className="rounded-lg border border-white/10 bg-[#0a1314] p-4 text-sm leading-6 text-slate-200"><span className="mb-3 block font-mono text-xs text-teal-300">0{index + 1}</span>{option}</li>
                  ))}
                </ol>
                <p className="mt-5 text-sm text-slate-300"><span className="font-semibold text-white">Suggested CTA:</span> Shop the collection</p>
              </article>
            </div>
          </div>
        </section>

        <section aria-labelledby="conversation-heading" className="border-y border-white/10 bg-[#071011] py-14 sm:py-16">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:px-8">
            <div>
              <Bot className="size-5 text-teal-300" aria-hidden="true" />
              <h2 id="conversation-heading" className="mt-5 text-3xl font-semibold text-white">Continue with the AI Consultant</h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">Questions use the saved fictional report context rather than creating new audit facts.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {["Which homepage headline should I test first?", "Turn the first recommendation into a checklist.", "How does Northline Goods differ publicly?", "Draft a customer-proof section without inventing reviews."].map((prompt) => (
                <div key={prompt} className="rounded-lg border border-white/10 bg-[#0d1718] p-4 text-sm text-slate-300">“{prompt}”</div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="formats-heading" className="bg-[#0a1415] py-14 sm:py-16">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <h2 id="formats-heading" className="text-3xl font-semibold text-white">Share the same evidence in the right format</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <article className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                <FileText className="size-5 text-teal-300" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-semibold text-white">Professional PDF report</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">A structured document with executive summary, scores, evidence, priorities, recommendations, and technical appendix.</p>
              </article>
              <article className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                <Presentation className="size-5 text-teal-300" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-semibold text-white">Fixed-slide Presentation Mode</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">A concise full-screen walkthrough for discussing the audit without exposing private dashboard navigation.</p>
              </article>
            </div>
            <Link href="/signup" className="mt-8 inline-flex items-center gap-2 rounded-md font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
              Run an audit for your business
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <PublicPageCta title="Build the report around your business." description="The example is fictional. Your report uses the profiles, context, goals, website evidence, reviews, and competitors available for your own business." />
      </main>
    </MarketingShell>
  );
}

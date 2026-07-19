import {
  Bot,
  CheckCircle2,
  FileSearch,
  Gauge,
  Globe2,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PublicPageCta } from "@/components/marketing/public-page-cta";
import { PublicPageHero } from "@/components/marketing/public-page-hero";
import { createMarketingMetadata } from "@/lib/brand";

export const metadata: Metadata = createMarketingMetadata({
  title: "Growth Audit Methodology | Onread AI",
  description:
    "Understand the public evidence, score applicability, confidence rules, competitor limits, and AI boundaries behind each growth audit.",
  pathname: "/methodology",
});

const evidenceSources = [
  {
    title: "User-confirmed context",
    description:
      "Business description, audience, offer, goals, conversion path, profiles, and competitors that the user reviews or supplies.",
    icon: CheckCircle2,
  },
  {
    title: "Public website evidence",
    description:
      "A controlled crawl of accessible HTML pages, including page structure, metadata, links, headings, images, and observable visitor actions.",
    icon: Globe2,
  },
  {
    title: "Public listing and profile evidence",
    description:
      "Confirmed or detected public profile coverage and available Google Business information when discovery is configured and a match is confirmed.",
    icon: Users,
  },
  {
    title: "Saved audit history",
    description:
      "Completed audit snapshots, recommendation status, and disclosed coverage or methodology changes used for progress comparisons.",
    icon: FileSearch,
  },
] as const;

export default function MethodologyPage() {
  return (
    <MarketingShell>
      <main>
        <PublicPageHero
          eyebrow="Methodology"
          title="Evidence first. Interpretation second. Limitations always visible."
          description="The audit is designed to help people make better marketing decisions without presenting unavailable data or uncertain interpretations as verified facts."
          icon={ShieldCheck}
        />

        <section aria-labelledby="sources-heading" className="bg-[#0a1415] py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <h2 id="sources-heading" className="text-3xl font-semibold text-white">What the audit can use</h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
              Each report records the evidence available at the time of the run. The mix changes depending on confirmed profiles, website access, selected goals, competitors, and plan crawl limits.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {evidenceSources.map((source) => {
                const Icon = source.icon;
                return (
                  <article key={source.title} className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                    <Icon className="size-5 text-teal-300" aria-hidden="true" />
                    <h3 className="mt-5 text-lg font-semibold text-white">{source.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">{source.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section aria-labelledby="scores-heading" className="border-y border-white/10 bg-[#071011] py-16 sm:py-20">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
            <div>
              <Gauge className="size-6 text-teal-300" aria-hidden="true" />
              <h2 id="scores-heading" className="mt-5 text-3xl font-semibold text-white">Applicable scoring</h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                Scores are directional summaries of deterministic checks. Findings and supporting evidence provide the explanation behind them.
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2">
              <div className="bg-[#0d1718] p-6">
                <h3 className="font-semibold text-white">Unavailable is not zero</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  If no website is provided, Website and SEO can be marked not provided and excluded from the applicable overall score.
                </p>
              </div>
              <div className="bg-[#0d1718] p-6">
                <h3 className="font-semibold text-white">Coverage is disclosed</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Crawl limits, failed fetches, pending profiles, and missing competitor evidence remain visible in the report.
                </p>
              </div>
              <div className="bg-[#0d1718] p-6">
                <h3 className="font-semibold text-white">Re-audits compare like with like</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Only completed audits are compared. Expanded data or methodology changes are disclosed when they can affect interpretation.
                </p>
              </div>
              <div className="bg-[#0d1718] p-6">
                <h3 className="font-semibold text-white">Context influences priority</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Goals and Business Context can reorder recommendations without inventing new analyzer evidence or changing observed facts.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="competitors" aria-labelledby="competitor-method-heading" className="scroll-mt-24 bg-[#0a1415] py-16 sm:py-20">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <Scale className="size-6 text-teal-300" aria-hidden="true" />
              <h2 id="competitor-method-heading" className="mt-5 text-3xl font-semibold text-white">Competitor comparison boundaries</h2>
              <p className="mt-4 text-base leading-7 text-slate-400">
                A comparison uses timestamped public website pages, confirmed or detected profiles, available public listings, and observable messaging. Positioning conclusions are labeled as interpretations.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
              <h3 className="font-semibold text-white">The platform does not claim access to:</h3>
              <ul className="mt-5 grid gap-3 text-sm text-slate-400 sm:grid-cols-2">
                {["Traffic", "Revenue or sales", "Ad spend", "Conversions", "Private analytics", "Social reach or engagement", "Audience demographics", "Post performance"].map((item) => (
                  <li key={item} className="border-l border-white/15 pl-3">{item}</li>
                ))}
              </ul>
              <p className="mt-6 border-t border-white/10 pt-5 text-sm leading-6 text-slate-400">
                When one side lacks comparable evidence, the report says “Not comparable” rather than declaring a winner.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="social-ai-heading" className="border-y border-white/10 bg-[#071011] py-16 sm:py-20">
          <div className="mx-auto grid w-full max-w-7xl gap-4 px-6 md:grid-cols-2 lg:px-8">
            <article className="rounded-lg border border-white/10 bg-[#0d1718] p-7">
              <Users className="size-5 text-teal-300" aria-hidden="true" />
              <h2 id="social-ai-heading" className="mt-5 text-2xl font-semibold text-white">Social analysis scope</h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                Social Strategy uses confirmed profile coverage, channel suitability, Business Context, goals, competitors, and known conversion paths. It does not analyze individual posts, engagement, reach, posting frequency, or content performance in this version.
              </p>
            </article>
            <article className="rounded-lg border border-white/10 bg-[#0d1718] p-7">
              <Bot className="size-5 text-teal-300" aria-hidden="true" />
              <h2 className="mt-5 text-2xl font-semibold text-white">The role of AI</h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                AI explains, prioritizes, and drafts from saved data. It does not create audit scores, crawl websites, or replace deterministic findings. Missing context should be requested or disclosed instead of guessed.
              </p>
            </article>
          </div>
        </section>

        <section aria-labelledby="confidence-heading" className="bg-[#0a1415] py-16 sm:py-20">
          <div className="mx-auto w-full max-w-4xl px-6 lg:px-8">
            <h2 id="confidence-heading" className="text-3xl font-semibold text-white">Confidence and review</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              Discovered profiles remain pending until confirmed. Generated Business Context can be edited before it guides strategy. Recommendations may include confidence, supporting evidence, and limitations so a user can decide whether the conclusion is ready to act on.
            </p>
            <p className="mt-5 text-sm leading-6 text-slate-400">
              Methodology summary updated July 14, 2026. Analyzer implementation may evolve; material comparison changes should remain visible in saved report history.
            </p>
          </div>
        </section>

        <PublicPageCta />
      </main>
    </MarketingShell>
  );
}

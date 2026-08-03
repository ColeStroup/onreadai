import {
  Bot,
  CheckCircle2,
  FileSearch,
  Gauge,
  Globe2,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PublicPageCta } from "@/components/marketing/public-page-cta";
import { PublicPageHero } from "@/components/marketing/public-page-hero";
import { createMarketingMetadata } from "@/lib/brand";

export const metadata: Metadata = createMarketingMetadata({
  title: "Website and SEO Audit Methodology | Onread AI",
  description:
    "Understand the crawl evidence, Website Growth Score, confidence rules, AI boundaries, and comparison safeguards behind an Onread website audit.",
  pathname: "/methodology",
});

const evidenceSources = [
  {
    title: "User-confirmed context",
    description:
      "The business description, audience, offer, goal, and conversion path that the owner reviews or supplies.",
    icon: CheckCircle2,
  },
  {
    title: "Public website evidence",
    description:
      "A controlled crawl of accessible HTML pages, including structure, metadata, links, headings, images, content, and observable visitor actions.",
    icon: Globe2,
  },
  {
    title: "Saved audit evidence",
    description:
      "Findings, recommendations, analyzed URLs, coverage limits, model versions, and technical snapshots saved when the audit completes.",
    icon: FileSearch,
  },
] as const;

const classifications = [
  "Verified technical issue",
  "AI-reviewed opportunity",
  "Verified strength",
  "Coverage note",
  "Limitation",
  "Observation",
] as const;

export default function MethodologyPage() {
  return (
    <MarketingShell>
      <main>
        <PublicPageHero
          eyebrow="Methodology"
          title="Evidence first. Interpretation second. Limitations always visible."
          description="Onread is designed to help owners improve websites without presenting unavailable data or uncertain interpretation as verified fact."
          icon={ShieldCheck}
        />

        <section
          aria-labelledby="sources-heading"
          className="bg-[#0a1415] py-16 sm:py-20"
        >
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <h2
              id="sources-heading"
              className="text-3xl font-semibold text-white"
            >
              What a website audit can use
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
              Every report records the evidence available at run time. Website
              access, crawl limits, and failed page requests remain part of the
              report so you can understand its coverage.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {evidenceSources.map((source) => {
                const Icon = source.icon;
                return (
                  <article
                    key={source.title}
                    className="rounded-lg border border-white/10 bg-[#0d1718] p-6"
                  >
                    <Icon className="size-5 text-teal-300" aria-hidden="true" />
                    <h3 className="mt-5 text-lg font-semibold text-white">
                      {source.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      {source.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="scores-heading"
          className="border-y border-white/10 bg-[#071011] py-16 sm:py-20"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
            <div>
              <Gauge className="size-6 text-teal-300" aria-hidden="true" />
              <h2
                id="scores-heading"
                className="mt-5 text-3xl font-semibold text-white"
              >
                Website Growth Score
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                New audits use the website-growth-score-v1 methodology. Website
                evidence contributes 55% and SEO evidence contributes 45%.
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2">
              <MethodCard
                title="Only supported evidence is scored"
                description="Social profiles, competitors, Google Business data, ratings, and review counts do not affect the launch score."
              />
              <MethodCard
                title="Unavailable is not a defect"
                description="Blocked pages, timeouts, skipped pages, and other limitations are disclosed instead of silently receiving a failing score."
              />
              <MethodCard
                title="Historical scores stay historical"
                description="Older broad-model audits remain unchanged and are labeled Legacy scoring model. They are not recalculated in place."
              />
              <MethodCard
                title="Comparisons require compatibility"
                description="Onread limits direct score comparison when scoring versions differ, so a methodology change is not presented as website progress."
              />
            </div>
          </div>
        </section>

        <section
          aria-labelledby="classification-heading"
          className="bg-[#0a1415] py-16 sm:py-20"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <FileSearch className="size-6 text-teal-300" aria-hidden="true" />
              <h2
                id="classification-heading"
                className="mt-5 text-3xl font-semibold text-white"
              >
                Not every observation is a problem
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-400">
                Findings use explicit classifications so deterministic defects,
                AI-reviewed opportunities, strengths, and coverage limits do not
                blur together.
              </p>
            </div>
            <ul className="grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2">
              {classifications.map((classification) => (
                <li
                  key={classification}
                  className="flex min-h-20 items-center bg-[#0d1718] px-5 text-sm font-medium text-slate-200"
                >
                  {classification}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          aria-labelledby="ai-heading"
          className="border-y border-white/10 bg-[#071011] py-16 sm:py-20"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
            <div>
              <Bot className="size-6 text-teal-300" aria-hidden="true" />
              <h2
                id="ai-heading"
                className="mt-5 text-3xl font-semibold text-white"
              >
                AI is bounded by saved evidence
              </h2>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0d1718] p-7">
              <p className="text-sm leading-7 text-slate-300">
                Selective AI review can help interpret page clarity and
                conversion opportunities. The Website &amp; SEO Consultant can
                explain and implement saved findings. Neither is allowed to
                invent crawled pages, technical defects, traffic, rankings,
                revenue, or customer behavior.
              </p>
              <p className="mt-5 border-t border-white/10 pt-5 text-sm leading-7 text-slate-400">
                Technical checks remain deterministic. AI-reviewed conclusions
                are labeled separately and retain confidence, evidence, and
                source URL context when available.
              </p>
            </div>
          </div>
        </section>

        <PublicPageCta
          title="See the evidence for your own website."
          description="Run a controlled website and SEO audit, review what matters first, and recheck the site after making improvements."
        />
      </main>
    </MarketingShell>
  );
}

function MethodCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <article className="bg-[#0d1718] p-6">
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
    </article>
  );
}

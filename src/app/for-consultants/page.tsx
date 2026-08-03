import {
  BarChart3,
  BriefcaseBusiness,
  FilePenLine,
  FileText,
  ListChecks,
  Presentation,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PublicPageCta } from "@/components/marketing/public-page-cta";
import { PublicPageHero } from "@/components/marketing/public-page-hero";
import { createMarketingMetadata } from "@/lib/brand";

export const metadata: Metadata = createMarketingMetadata({
  title: "Website Audit Software for Consultants | Onread AI",
  description:
    "Create evidence-backed client audits, action plans, implementation drafts, PDF reports, presentations, and progress comparisons in one workflow.",
  pathname: "/for-consultants",
});

const consultantDeliverables = [
  {
    title: "Evidence-backed assessment",
    description:
      "Organize website crawl evidence, SEO checks, Business Context, goals, and explicit coverage limits.",
    icon: BarChart3,
  },
  {
    title: "Prioritized client Action Plan",
    description:
      "Translate findings into ordered work with priority, impact, effort, and status tracking.",
    icon: ListChecks,
  },
  {
    title: "Implementation assets",
    description:
      "Draft review-ready headlines, metadata, CTA structures, page outlines, and fix steps.",
    icon: FilePenLine,
  },
  {
    title: "Professional PDF report",
    description:
      "Give clients a readable assessment with scores, evidence, priorities, and technical findings.",
    icon: FileText,
  },
  {
    title: "Presentation Mode",
    description:
      "Walk through the audit in a concise, fixed-slide client conversation without the dashboard sidebar.",
    icon: Presentation,
  },
] as const;

export default function ForConsultantsPage() {
  return (
    <MarketingShell>
      <main>
        <PublicPageHero
          eyebrow="For consultants and agencies"
          title="Turn website evidence into a clearer client improvement plan."
          description="Analyze a client's website and SEO, explain what deserves attention, create practical implementation assets, and use repeat audits to verify progress."
          icon={BriefcaseBusiness}
        />

        <section
          aria-labelledby="workflow-heading"
          className="bg-[#0a1415] py-16 sm:py-20"
        >
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <h2
              id="workflow-heading"
              className="text-3xl font-semibold text-white"
            >
              A client workflow from discovery to follow-through
            </h2>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 md:grid-cols-4">
              {[
                [
                  "01",
                  "Establish context",
                  "Confirm the client's website, offer, audience, goal, and intended conversion path.",
                ],
                [
                  "02",
                  "Run the assessment",
                  "Collect accessible public evidence and separate verified observations from interpretation.",
                ],
                [
                  "03",
                  "Present priorities",
                  "Use the report, PDF, or slide experience to focus the conversation on the highest-value next moves.",
                ],
                [
                  "04",
                  "Support implementation",
                  "Generate drafts, track recommendation work, and rerun the audit when meaningful changes are ready.",
                ],
              ].map(([number, title, description]) => (
                <li key={number} className="min-h-64 bg-[#0d1718] p-6">
                  <span className="font-mono text-xs text-teal-300">
                    {number}
                  </span>
                  <h3 className="mt-8 text-lg font-semibold text-white">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="deliverables-heading"
          className="border-y border-white/10 bg-[#071011] py-16 sm:py-20"
        >
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
                Client-ready outputs
              </p>
              <h2
                id="deliverables-heading"
                className="mt-3 text-3xl font-semibold text-white"
              >
                Explain the recommendation and help move it forward.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-400">
                The workspace supports the diagnostic, communication, and
                implementation moments without pretending to replace
                professional judgment.
              </p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {consultantDeliverables.map((item) => {
                const Icon = item.icon;
                return (
                  <article
                    key={item.title}
                    className="rounded-lg border border-white/10 bg-[#0d1718] p-5"
                  >
                    <Icon className="size-5 text-teal-300" aria-hidden="true" />
                    <h3 className="mt-6 font-semibold text-white">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      {item.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="fit-heading"
          className="bg-[#0a1415] py-16 sm:py-20"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <h2
                id="fit-heading"
                className="text-3xl font-semibold text-white"
              >
                Useful for focused, evidence-led engagements
              </h2>
              <ul className="mt-6 space-y-3 text-sm leading-6 text-slate-300">
                <li className="border-l border-teal-300 pl-4">
                  Initial website and SEO assessments
                </li>
                <li className="border-l border-teal-300 pl-4">
                  Website clarity, search foundations, and conversion planning
                </li>
                <li className="border-l border-teal-300 pl-4">
                  Page-level content and technical improvement planning
                </li>
                <li className="border-l border-teal-300 pl-4">
                  Implementation scoping and client-ready draft creation
                </li>
                <li className="border-l border-teal-300 pl-4">
                  Repeat audit reviews after meaningful changes
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-7">
              <h3 className="text-lg font-semibold text-white">
                What it does not promise
              </h3>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                The platform does not automatically get consultants clients,
                guarantee revenue, replace professional judgment, edit client
                websites, or claim private analytics. Every client-facing
                conclusion should remain proportional to the available evidence.
              </p>
              <Link
                href="/methodology"
                className="mt-6 inline-flex rounded-md text-sm font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
              >
                Review the methodology and limits
              </Link>
            </div>
          </div>
        </section>

        <PublicPageCta
          title="Create a clearer first website assessment."
          description="Start with one client website and see how the report, Action Plan, Implementation Help, and repeat-audit evidence fit your workflow."
        />
      </main>
    </MarketingShell>
  );
}

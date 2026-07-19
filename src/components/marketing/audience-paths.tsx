import { ArrowRight, BriefcaseBusiness, Store, Users } from "lucide-react";
import Link from "next/link";

import { SectionHeading } from "@/components/marketing/section-heading";
import { businessArchetypes } from "@/lib/marketing-content";

const audiences = [
  {
    eyebrow: "For business owners",
    title: "Know what to improve next.",
    description:
      "Understand your public online presence, prioritize fixes, compare available competitor evidence, create implementation drafts, and track progress.",
    cta: "Run My Business Audit",
    href: "/signup",
    icon: Store,
  },
  {
    eyebrow: "For consultants and agencies",
    title: "Deliver clearer, evidence-backed client work.",
    description:
      "Analyze client businesses, produce professional reports, present findings, generate practical assets, and use repeat audits to discuss progress.",
    cta: "Explore Consultant Workflow",
    href: "/for-consultants",
    icon: BriefcaseBusiness,
  },
] as const;

export function AudiencePaths() {
  return (
    <section aria-labelledby="audiences-heading" className="bg-[#0a1415] py-20 sm:py-24">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
        <SectionHeading
          id="audiences-heading"
          eyebrow="Two ways to use the workspace"
          title="Built for the person doing the work—and the person explaining it."
          description="Use the same evidence-backed workflow to improve your own business or communicate a clearer plan to a client."
        />

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          {audiences.map((audience) => {
            const Icon = audience.icon;
            return (
              <article key={audience.title} className="rounded-lg border border-white/10 bg-[#0d1718] p-7 sm:p-8">
                <Icon className="size-6 text-teal-300" aria-hidden="true" />
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{audience.eyebrow}</p>
                <h3 className="mt-3 text-2xl font-semibold text-white">{audience.title}</h3>
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">{audience.description}</p>
                <Link
                  href={audience.href}
                  className="mt-7 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                >
                  {audience.cta}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </div>

        <div className="mt-16 border-t border-white/10 pt-12">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div>
              <Users className="size-5 text-teal-300" aria-hidden="true" />
              <h3 className="mt-4 text-3xl font-semibold text-white">Built to understand different businesses.</h3>
              <p className="mt-4 text-base leading-7 text-slate-400">
                Whether you sell products, services, experiences, content, or your personal brand, recommendations adapt around your audience, offer, goals, and conversion path.
              </p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {businessArchetypes.map((type) => (
                <li key={type} className="rounded-md border border-white/10 bg-[#0d1718] px-4 py-3 text-sm text-slate-300">{type}</li>
              ))}
            </ul>
          </div>
          <p className="mt-7 text-sm leading-6 text-slate-400">
            Specialized platform analytics, product catalogs, podcast feeds, and private social performance may require additional integrations. The product does not claim equal specialized depth for every industry.
          </p>
        </div>
      </div>
    </section>
  );
}

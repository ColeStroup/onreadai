import { PlanType } from "@prisma/client";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

import { SectionHeading } from "@/components/marketing/section-heading";
import { planDefinitions } from "@/lib/billing/plans";

const featuredPlans = [
  PlanType.FREE,
  PlanType.ONE_TIME_AUDIT,
  PlanType.STARTER,
  PlanType.PRO,
] as const;

export function PricingPreview() {
  return (
    <section
      id="pricing"
      aria-labelledby="homepage-pricing-heading"
      className="border-t border-white/10 bg-[#071011] py-20 sm:py-24"
    >
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="homepage-pricing-heading"
            eyebrow="Pricing"
            title="Start with a preview. Go deeper when the report is useful."
            description="Choose a one-time website audit or an ongoing plan for repeat checks, implementation support, and progress verification."
          />
          <Link
            href="/pricing"
            className="inline-flex w-fit items-center gap-2 rounded-md text-sm font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            Compare every plan
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featuredPlans.map((plan) => {
            const definition = planDefinitions[plan];
            return (
              <article
                key={plan}
                className="rounded-lg border border-white/10 bg-[#0d1718] p-6"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
                  {definition.name}
                </p>
                <p className="mt-4 text-3xl font-semibold text-white">
                  {definition.price}
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    {definition.cadence}
                  </span>
                </p>
                <p className="mt-3 min-h-16 text-sm leading-6 text-slate-400">
                  {definition.audience}
                </p>
                <ul className="mt-5 space-y-2 border-t border-white/10 pt-5">
                  {definition.features.slice(0, 3).map((feature) => (
                    <li
                      key={feature}
                      className="flex gap-2 text-sm leading-5 text-slate-300"
                    >
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-teal-300"
                        aria-hidden="true"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

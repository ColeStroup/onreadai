import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { SectionHeading } from "@/components/marketing/section-heading";
import { userOutcomes } from "@/lib/marketing-content";

export function OutcomesSection() {
  return (
    <section
      aria-labelledby="outcomes-heading"
      className="border-y border-white/10 bg-[#071011] py-20 sm:py-24"
    >
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="outcomes-heading"
            eyebrow="Prioritized Action Plan"
            title="A score is useful only when it leads to action."
            description="See what matters first, why it matters, which page is affected, and how Onread can verify the improvement later."
          />
          <Link
            href="/example-report"
            className="inline-flex w-fit items-center gap-2 rounded-md text-sm font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            Explore the example report
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          {userOutcomes.map((outcome, index) => {
            const Icon = outcome.icon;
            return (
              <article
                key={outcome.title}
                className={`rounded-lg border p-6 ${index === 1 ? "border-teal-300/40 bg-teal-300/[0.07]" : "border-white/10 bg-[#0d1718]"} ${index < 2 ? "lg:col-span-3" : "lg:col-span-2"}`}
              >
                <Icon className="size-5 text-teal-300" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-semibold text-white">
                  {outcome.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {outcome.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

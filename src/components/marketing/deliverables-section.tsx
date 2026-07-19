import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { SectionHeading } from "@/components/marketing/section-heading";
import { deliverables } from "@/lib/marketing-content";

export function DeliverablesSection() {
  return (
    <section aria-labelledby="deliverables-heading" className="border-y border-white/10 bg-[#071011] py-20 sm:py-24">
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="deliverables-heading"
            eyebrow="Example deliverables"
            title="Everything needed to understand, explain, and act."
            description="Each output serves a distinct moment, from choosing the next task to sharing a professional assessment with someone else."
          />
          <Link href="/example-report" className="inline-flex w-fit items-center gap-2 rounded-md text-sm font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
            Open the complete example
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {deliverables.map((item, index) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-lg border border-white/10 bg-[#0d1718] p-5">
                <div className="flex items-center justify-between gap-4">
                  <Icon className="size-5 text-teal-300" aria-hidden="true" />
                  <span className="font-mono text-[10px] text-slate-400">0{index + 1}</span>
                </div>
                <h3 className="mt-8 text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{item.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

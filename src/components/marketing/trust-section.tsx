import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { SectionHeading } from "@/components/marketing/section-heading";
import { trustPrinciples } from "@/lib/marketing-content";

export function TrustSection() {
  return (
    <section aria-labelledby="trust-heading" className="bg-[#0a1415] py-20 sm:py-24">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start lg:px-8">
        <div>
          <ShieldCheck className="size-7 text-teal-300" aria-hidden="true" />
          <SectionHeading
            id="trust-heading"
            eyebrow="Accuracy and trust"
            title="Recommendations you can trace back to evidence."
            description="AI can help interpret and implement the findings, but the platform does not pretend to know what it cannot observe."
          />
          <div className="mt-7 flex flex-wrap gap-5">
            <Link href="/methodology" className="inline-flex items-center gap-2 rounded-md text-sm font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
              Read the methodology
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/help" className="rounded-md text-sm font-semibold text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
              Browse Help and FAQ
            </Link>
          </div>
        </div>

        <ul className="grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2">
          {trustPrinciples.map((principle) => (
            <li key={principle} className="flex min-h-28 gap-3 bg-[#0d1718] p-5 text-sm leading-6 text-slate-300">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-300" aria-hidden="true" />
              {principle}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

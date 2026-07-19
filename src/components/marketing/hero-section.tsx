import {
  ArrowRight,
  CheckCircle2,
  SearchCheck,
} from "lucide-react";
import Link from "next/link";

import { AuditPreview } from "@/components/marketing/audit-preview";

const valueMarkers = [
  "Evidence-backed findings",
  "Competitor intelligence",
  "Ready-to-use implementation help",
] as const;

export function HeroSection() {
  return (
    <section aria-labelledby="hero-heading" className="border-b border-white/10">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-6 pb-16 pt-8 sm:pt-14 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-20 lg:pt-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-300/[0.08] px-3 py-1.5 text-sm font-medium text-teal-100">
            <SearchCheck className="size-4 text-teal-300" aria-hidden="true" />
            Evidence-backed growth audits
          </div>
          <h1
            id="hero-heading"
            className="mt-5 max-w-4xl text-[2.65rem] font-semibold leading-[1.03] text-white sm:mt-6 sm:text-6xl sm:leading-[1.04] lg:text-7xl"
          >
            See what’s holding your business back—and know what to do next.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:mt-6 sm:text-lg sm:leading-8">
            Analyze your website, SEO, reviews, social presence, and competitors.
            Get a prioritized action plan, ready-to-use fixes, and an AI Consultant
            that understands your business.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:flex sm:flex-row">
            <Link
              href="/signup"
              data-marketing-cta="hero"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-teal-300 px-3 text-sm font-semibold text-[#052b27] transition-colors hover:bg-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-5 sm:text-base"
            >
              Start Free Audit
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/example-report"
              className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-lg border border-white/20 bg-white/[0.04] px-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:px-5 sm:text-base"
            >
              View Example Report
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-400">No credit card required.</p>

          <ul className="mt-6 grid grid-cols-2 gap-3 text-xs text-slate-300 sm:mt-8 sm:grid-cols-3 sm:text-sm">
            {valueMarkers.map((item) => (
              <li key={item} className="flex items-start gap-2 last:col-span-2 sm:last:col-span-1">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-300" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative lg:pl-4" aria-label="Product preview">
          <div className="absolute -left-3 top-8 hidden h-28 w-px bg-teal-300/50 lg:block" aria-hidden="true" />
          <AuditPreview />
        </div>
      </div>
    </section>
  );
}

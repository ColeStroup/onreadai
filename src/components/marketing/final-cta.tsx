import { ArrowRight, FileSearch } from "lucide-react";
import Link from "next/link";

export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="bg-teal-300 py-16 text-[#052b27] sm:py-20"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="max-w-3xl">
          <FileSearch className="size-6" aria-hidden="true" />
          <h2
            id="final-cta-heading"
            className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl"
          >
            Find your website&apos;s best next move.
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#174b47] sm:text-lg">
            Run your first website audit and see what needs attention, why it
            matters, how to fix it, and how to verify the result.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
          <Link
            href="/signup"
            data-marketing-cta="final"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#071011] px-5 font-semibold text-white transition-colors hover:bg-[#101b1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#071011] focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300"
          >
            Run a Website Audit
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href="/example-report"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-[#174b47]/30 px-5 font-semibold transition-colors hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#071011]"
          >
            View Example Report
          </Link>
        </div>
      </div>
      <p className="mx-auto mt-5 w-full max-w-7xl px-6 text-sm text-[#35635f] lg:px-8">
        No credit card required.
      </p>
    </section>
  );
}

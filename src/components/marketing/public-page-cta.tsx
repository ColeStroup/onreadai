import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function PublicPageCta({
  title = "See what deserves attention next.",
  description = "Create a free account, confirm your business context, and run an evidence-backed audit.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section aria-labelledby="public-page-cta" className="border-t border-white/10 bg-[#0d1718] py-14">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <h2 id="public-page-cta" className="text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <Link
          href="/signup"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-teal-300 px-5 font-semibold text-[#052b27] transition-colors hover:bg-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Start Free Audit
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

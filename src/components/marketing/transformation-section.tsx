import { ArrowRight, Check, X } from "lucide-react";

import { SectionHeading } from "@/components/marketing/section-heading";

const before = [
  "You know the website needs work",
  "You do not know which issue matters most",
  "Affected pages are hard to identify",
  "Advice stops before implementation",
  "There is no clear way to verify a fix",
] as const;

const after = [
  "Website and SEO findings in priority order",
  "Evidence and affected URLs for each issue",
  "A clear best next action",
  "Implementation drafts and practical guidance",
  "Repeat audits that verify progress",
] as const;

export function TransformationSection() {
  return (
    <section
      aria-labelledby="transformation-heading"
      className="bg-[#0a1415] py-20 sm:py-24"
    >
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
        <SectionHeading
          id="transformation-heading"
          eyebrow="From uncertainty to action"
          title="Stop guessing what deserves your attention."
          description="Onread connects observed website evidence to clear priorities, practical implementation, and a way to verify what changed."
        />

        <div className="relative mt-10 grid overflow-hidden rounded-lg border border-white/10 md:grid-cols-[1fr_auto_1fr]">
          <div className="bg-[#0d1718] p-6 sm:p-8">
            <p className="text-sm font-semibold text-slate-400">Before</p>
            <ul className="mt-5 space-y-4">
              {before.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-slate-300"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-400/10 text-rose-300">
                    <X className="size-3" aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="hidden w-px bg-white/10 md:flex md:items-center md:justify-center">
            <span className="absolute flex size-9 items-center justify-center rounded-full border border-white/15 bg-[#101b1c] text-teal-300">
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </div>

          <div className="border-t border-white/10 bg-[#0f1d1d] p-6 sm:p-8 md:border-l-0 md:border-t-0">
            <p className="text-sm font-semibold text-teal-200">After</p>
            <ul className="mt-5 space-y-4">
              {after.map((item) => (
                <li key={item} className="flex items-start gap-3 text-white">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal-300/15 text-teal-200">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

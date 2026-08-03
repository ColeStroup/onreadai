import { ArrowRight, Check, FilePenLine, SearchCheck } from "lucide-react";
import Link from "next/link";

import { SectionHeading } from "@/components/marketing/section-heading";

const draftOptions = [
  "Coastal essentials, made for unhurried weekends.",
  "Thoughtful goods for life near the water.",
  "Bring the calm of the coast into every day.",
] as const;

export function ImplementationHelpShowcase() {
  return (
    <section
      aria-labelledby="implementation-heading"
      className="bg-[#0a1415] py-20 sm:py-24"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-8">
        <div>
          <SectionHeading
            id="implementation-heading"
            eyebrow="Implementation Help"
            title='Go from "what is wrong" to "here is the fix."'
            description="Recommendations can become review-ready copy, structures, or ordered steps based on the saved Business Context and current evidence."
          />
          <ul className="mt-7 space-y-3 text-sm leading-6 text-slate-300">
            <li className="flex gap-3">
              <Check
                className="mt-1 size-4 shrink-0 text-teal-300"
                aria-hidden="true"
              />
              Drafts remain connected to the recommendation they support.
            </li>
            <li className="flex gap-3">
              <Check
                className="mt-1 size-4 shrink-0 text-teal-300"
                aria-hidden="true"
              />
              Onread does not automatically edit or publish to your website.
            </li>
            <li className="flex gap-3">
              <Check
                className="mt-1 size-4 shrink-0 text-teal-300"
                aria-hidden="true"
              />
              Users review generated wording before publishing it.
            </li>
          </ul>
          <Link
            href="/example-report#implementation-help"
            className="mt-7 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            See a sanitized example
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid overflow-hidden rounded-lg border border-white/10 bg-white/10 md:grid-cols-[0.82fr_1.18fr]">
          <div className="bg-[#0d1718] p-6">
            <SearchCheck className="size-5 text-amber-300" aria-hidden="true" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Finding
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Homepage has no clear H1.
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              The main offer is harder to identify because the homepage does not
              expose one descriptive primary heading.
            </p>
            <dl className="mt-6 border-t border-white/10 pt-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">Category</dt>
                <dd className="text-slate-200">Website / SEO</dd>
              </div>
              <div className="mt-3 flex justify-between gap-4">
                <dt className="text-slate-400">Priority</dt>
                <dd className="text-amber-200">High</dd>
              </div>
            </dl>
          </div>

          <div className="border-t border-white/10 bg-[#101b1c] p-6 md:border-l md:border-t-0">
            <FilePenLine className="size-5 text-teal-300" aria-hidden="true" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-teal-200">
              Generated fix
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Three headline directions
            </h3>
            <ol className="mt-5 space-y-3">
              {draftOptions.map((option, index) => (
                <li
                  key={option}
                  className="flex gap-3 rounded-lg border border-white/10 bg-[#0a1314] p-3 text-sm leading-5 text-slate-200"
                >
                  <span className="font-mono text-xs text-teal-300">
                    0{index + 1}
                  </span>
                  {option}
                </li>
              ))}
            </ol>
            <div className="mt-5 border-t border-white/10 pt-4 text-sm leading-6 text-slate-300">
              <p>
                <span className="font-semibold text-white">
                  Recommended CTA:
                </span>{" "}
                Shop the collection
              </p>
              <p className="mt-2">
                <span className="font-semibold text-white">Placement:</span>{" "}
                Pair the selected H1 with one primary action above the first
                product section.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

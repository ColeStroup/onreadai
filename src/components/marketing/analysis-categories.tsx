import { Check } from "lucide-react";

import { SectionHeading } from "@/components/marketing/section-heading";
import { analysisCategories } from "@/lib/marketing-content";

export function AnalysisCategories() {
  return (
    <section
      id="product"
      aria-labelledby="analysis-heading"
      className="scroll-mt-24 bg-[#0a1415] py-20 sm:py-24"
    >
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
        <SectionHeading
          id="analysis-heading"
          eyebrow="What Onread checks"
          title="The website signals that affect visibility and action."
          description="Onread combines deterministic checks with clearly labeled AI review, and keeps unavailable evidence separate from verified problems."
        />

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {analysisCategories.map((category) => {
            const Icon = category.icon;
            return (
              <article
                key={category.title}
                className="rounded-lg border border-white/10 bg-[#0d1718] p-6"
              >
                <Icon className="size-5 text-teal-300" aria-hidden="true" />
                <h3 className="mt-5 text-xl font-semibold text-white">
                  {category.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {category.description}
                </p>
                <ul className="mt-5 space-y-2 border-t border-white/10 pt-4">
                  {category.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 text-sm text-slate-300"
                    >
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-teal-300"
                        aria-hidden="true"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="mt-8 grid gap-4 border-t border-white/10 pt-6 text-sm leading-6 text-slate-400 md:grid-cols-3">
          <p>Every crawl records which public pages were actually analyzed.</p>
          <p>
            AI-reviewed opportunities remain distinct from verified technical
            issues.
          </p>
          <p>
            Missing data is disclosed and can be excluded instead of becoming an
            automatic failure.
          </p>
        </div>
      </div>
    </section>
  );
}

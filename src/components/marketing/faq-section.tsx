import { ChevronDown } from "lucide-react";

import { SectionHeading } from "@/components/marketing/section-heading";
import { marketingFaqs } from "@/lib/marketing-content";

export function FaqSection({ compact = false }: { compact?: boolean }) {
  const entries = compact ? marketingFaqs.slice(0, 6) : marketingFaqs;

  return (
    <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-24 border-y border-white/10 bg-[#071011] py-20 sm:py-24">
      <div className="mx-auto w-full max-w-5xl px-6 lg:px-8">
        <SectionHeading
          id="faq-heading"
          eyebrow="Questions before you start"
          title="Clear answers about scope, evidence, and what happens next."
          description="The product is explicit about what it can observe today and what still requires your confirmation or a future integration."
          align="center"
        />

        <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
          {entries.map((entry) => (
            <details key={entry.question} className="marketing-faq group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
                <span>{entry.question}</span>
                <ChevronDown className="size-4 shrink-0 text-teal-300 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="max-w-3xl pb-6 pr-8 text-sm leading-7 text-slate-400">{entry.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

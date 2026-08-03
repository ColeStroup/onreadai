import { SectionHeading } from "@/components/marketing/section-heading";
import { howItWorks } from "@/lib/marketing-content";

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-24 border-y border-white/10 bg-[#071011] py-20 sm:py-24"
    >
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
        <SectionHeading
          id="how-it-works-heading"
          eyebrow="How Onread works"
          title="From website URL to verified improvement."
          description="The workflow keeps the evidence, priority, implementation guidance, and follow-up check connected."
        />

        <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
          {howItWorks.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="min-h-64 bg-[#0d1718] p-6">
                <div className="flex items-center justify-between gap-4">
                  <span className="flex size-10 items-center justify-center rounded-lg border border-teal-300/20 bg-teal-300/[0.08] text-teal-300">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-8 text-lg font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {step.description}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

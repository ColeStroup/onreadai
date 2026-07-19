import { ArrowRight, Info, Scale } from "lucide-react";
import Link from "next/link";

import { SectionHeading } from "@/components/marketing/section-heading";

const comparisonRows = [
  { area: "Website", business: "81", competitor: "96", result: "Competitor leads", tone: "warning" },
  { area: "SEO", business: "66", competitor: "100", result: "Competitor leads", tone: "warning" },
  { area: "Reviews", business: "Confirmed", competitor: "Unavailable", result: "Not comparable", tone: "neutral" },
  { area: "Social", business: "2 confirmed", competitor: "2 confirmed", result: "Similar", tone: "positive" },
] as const;

export function CompetitorShowcase() {
  return (
    <section aria-labelledby="competitor-heading" className="border-y border-white/10 bg-[#071011] py-20 sm:py-24">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:px-8">
        <div>
          <SectionHeading
            id="competitor-heading"
            eyebrow="Competitor Intelligence"
            title="Understand where competitors lead—and where they do not."
            description="Compare observable public evidence side by side without turning missing information into an unsupported conclusion."
          />
          <div className="mt-7 flex gap-3 border-l-2 border-teal-300 pl-4">
            <Info className="mt-0.5 size-4 shrink-0 text-teal-300" aria-hidden="true" />
            <p className="text-sm leading-6 text-slate-400">
              No competitor traffic, sales, ad spend, private engagement, revenue,
              or conversions are claimed.
            </p>
          </div>
          <Link
            href="/methodology#competitors"
            className="mt-6 inline-flex items-center gap-2 rounded-md text-sm font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            Read the comparison methodology
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#0d1718] p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Fictional comparison</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Harbor &amp; Pine vs. Northline Goods</h3>
            </div>
            <Scale className="size-5 text-teal-300" aria-hidden="true" />
          </div>

          <div className="mt-4 hidden overflow-hidden rounded-lg border border-white/10 sm:block">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Fictional public competitor comparison</caption>
              <thead className="bg-[#111e1f] text-xs text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Area</th>
                  <th scope="col" className="px-4 py-3 font-medium">Your business</th>
                  <th scope="col" className="px-4 py-3 font-medium">Competitor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.area} className="border-t border-white/10 text-slate-300">
                    <th scope="row" className="px-4 py-3 font-medium text-white">{row.area}</th>
                    <td className="px-4 py-3">{row.business}</td>
                    <td className="px-4 py-3">{row.competitor}</td>
                    <td className={`px-4 py-3 ${row.tone === "warning" ? "text-amber-200" : row.tone === "positive" ? "text-teal-200" : "text-slate-400"}`}>
                      {row.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-3 sm:hidden">
            {comparisonRows.map((row) => (
              <dl key={row.area} className="grid grid-cols-2 gap-x-3 rounded-lg border border-white/10 bg-[#0a1314] p-4 text-sm">
                <div className="col-span-2 flex items-center justify-between gap-4">
                  <dt className="font-semibold text-white">{row.area}</dt>
                  <dd className={row.tone === "warning" ? "text-amber-200" : row.tone === "positive" ? "text-teal-200" : "text-slate-400"}>{row.result}</dd>
                </div>
                <div className="mt-3 border-t border-white/10 pt-3 text-slate-400">
                  <dt className="text-xs text-slate-400">Your business</dt>
                  <dd className="mt-1">{row.business}</dd>
                </div>
                <div className="mt-3 border-t border-white/10 pt-3 text-slate-400">
                  <dt className="text-xs text-slate-400">Competitor</dt>
                  <dd className="mt-1">{row.competitor}</dd>
                </div>
              </dl>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/[0.07] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">Best opportunity</p>
            <p className="mt-2 text-sm leading-6 text-white">Clarify the homepage offer and primary action.</p>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-400">
            Timestamped public website, profile, and listing evidence. Missing data is not treated as proof of weakness.
          </p>
        </div>
      </div>
    </section>
  );
}

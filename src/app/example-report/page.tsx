import {
  ArrowRight,
  BarChart3,
  Bot,
  FilePenLine,
  FileText,
  Presentation,
  SearchCheck,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PublicPageCta } from "@/components/marketing/public-page-cta";
import { createMarketingMetadata } from "@/lib/brand";
import { getPublicExampleAuditReport } from "@/lib/reports/public-example-report";

export const metadata: Metadata = createMarketingMetadata({
  title: "Example Website and SEO Audit Report | Onread AI",
  description:
    "Explore a fictional website and SEO audit with a Website Growth Score, crawl evidence, prioritized actions, implementation help, and verification guidance.",
  pathname: "/example-report",
});

const exampleReport = getPublicExampleAuditReport();
const canonical = exampleReport.canonicalReport;
const scores = exampleReport.scores.filter(
  (item): item is typeof item & { score: number } => item.score !== null,
);
const priorities = canonical.priorities;
const firstPriority = priorities.at(0);
const homepage = canonical.pages.find((page) => page.label === "Homepage");
const coveredPurposes = canonical.pagePurposes
  .filter((item) =>
    [
      "DEDICATED_PAGE",
      "EQUIVALENT_SECTION",
      "EQUIVALENT_CONVERSION_PATH",
    ].includes(item.status),
  )
  .map((item) => item.purpose);

export default function ExampleReportPage() {
  return (
    <MarketingShell>
      <main className="bg-[#071011]">
        <header className="border-b border-white/10 bg-[#081213]">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-14 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8 lg:py-16">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-300/[0.08] px-3 py-1.5 text-xs font-semibold text-teal-100">
                <ShieldCheck
                  className="size-3.5 text-teal-300"
                  aria-hidden="true"
                />
                Sanitized fictional example
              </div>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Website &amp; SEO Growth Report
              </p>
              <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl lg:text-6xl">
                {canonical.business.name}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">
                A fictional cottage-food business used to demonstrate report
                structure. No values on this page represent a real customer or a
                promised result.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-md border border-white/10 px-2.5 py-1.5">
                  Example audit
                </span>
                <span className="rounded-md border border-white/10 px-2.5 py-1.5">
                  Website supplied
                </span>
                <span className="rounded-md border border-white/10 px-2.5 py-1.5">
                  {canonical.facts.pagesScanned} public pages scanned
                </span>
              </div>
            </div>
            <div className="flex size-36 flex-col items-center justify-center rounded-full border-[10px] border-teal-300 border-r-slate-700 bg-[#0d1718] text-center">
              <span className="text-5xl font-semibold leading-none text-white">
                {exampleReport.audit.overallScore}
              </span>
              <span className="mt-1 text-center text-xs text-slate-400">
                Website Growth Score
              </span>
            </div>
          </div>
        </header>

        <section
          aria-labelledby="summary-heading"
          className="bg-[#0a1415] py-14 sm:py-16"
        >
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <article className="rounded-lg border border-white/10 bg-[#0d1718] p-6 sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
                  Executive summary
                </p>
                <h2
                  id="summary-heading"
                  className="mt-3 text-2xl font-semibold text-white"
                >
                  A clear view of what to improve first.
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-400">
                  {exampleReport.audit.executiveSummary}
                </p>
              </article>
              <article className="rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-6 sm:p-7">
                <Target className="size-5 text-amber-300" aria-hidden="true" />
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                  What matters most
                </p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {firstPriority?.title ?? "No priority action was published."}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {firstPriority?.whyItMatters ??
                    "The available evidence did not support a high-confidence priority."}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="health-heading"
          className="border-y border-white/10 bg-[#071011] py-14 sm:py-16"
        >
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <BarChart3 className="size-5 text-teal-300" aria-hidden="true" />
              <h2
                id="health-heading"
                className="text-2xl font-semibold text-white"
              >
                Website Growth Score
              </h2>
            </div>
            <div className="mt-7 grid max-w-2xl gap-3 sm:grid-cols-2">
              {scores.map((score) => (
                <article
                  key={score.category}
                  className="rounded-lg border border-white/10 bg-[#0d1718] p-4"
                >
                  <p className="text-xs leading-5 text-slate-400">
                    {score.label}
                  </p>
                  <p className="mt-4 text-3xl font-semibold text-white">
                    {score.score}
                    <span className="text-sm text-slate-400">/100</span>
                  </p>
                  <p
                    className={`mt-2 text-xs ${score.score >= 80 ? "text-teal-200" : score.score >= 70 ? "text-slate-300" : "text-amber-200"}`}
                  >
                    {healthLabelForScore(score.score)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="priorities-heading"
          className="bg-[#0a1415] py-14 sm:py-16"
        >
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
              Prioritized Action Plan
            </p>
            <h2
              id="priorities-heading"
              className="mt-3 text-3xl font-semibold text-white"
            >
              Next 3 Moves
            </h2>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {priorities.map((priority, index) => (
                <article
                  key={priority.title}
                  className="rounded-lg border border-white/10 bg-[#0d1718] p-6"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex size-8 items-center justify-center rounded-full bg-teal-300 text-sm font-semibold text-[#052b27]">
                      {index + 1}
                    </span>
                    <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-400">
                    {titleCase(priority.category)}
                    </span>
                  </div>
                  <h3 className="mt-6 text-lg font-semibold text-white">
                    {priority.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {priority.description}
                  </p>
                  <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-slate-400">
                    <span className="font-semibold text-slate-300">
                      Evidence:
                    </span>{" "}
                    {priority.evidenceSummary}
                  </p>
                  <dl className="mt-4 flex gap-4 text-xs">
                    <div>
                      <dt className="text-slate-400">Effort</dt>
                      <dd className="mt-1 text-slate-300">
                        {priority.estimatedEffort}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Impact</dt>
                      <dd className="mt-1 text-teal-200">
                        {priority.expectedImpact}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="comparison-heading"
          className="border-y border-white/10 bg-[#071011] py-14 sm:py-16"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 lg:grid-cols-[0.65fr_1.35fr] lg:items-start lg:px-8">
            <div>
              <SearchCheck
                className="size-5 text-teal-300"
                aria-hidden="true"
              />
              <h2
                id="comparison-heading"
                className="mt-5 text-3xl font-semibold text-white"
              >
                Crawl coverage and evidence
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                The report records what was scanned, what Onread observed, and
                where evidence was unavailable.
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Fictional {canonical.business.name} website crawl coverage
                </caption>
                <thead className="bg-[#111e1f] text-xs text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Check
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Observed evidence
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="hidden px-4 py-3 sm:table-cell">
                      Next step
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-[#0d1718] text-slate-300">
                  <tr className="border-t border-white/10">
                    <th scope="row" className="px-4 py-3 text-white">
                      Pages crawled
                    </th>
                    <td className="px-4 py-3">
                      {canonical.facts.pagesScanned} public URLs
                    </td>
                    <td className="px-4 py-3 text-teal-200">Scanned</td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      Review affected pages
                    </td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <th scope="row" className="px-4 py-3 text-white">
                      Homepage H1
                    </th>
                    <td className="px-4 py-3">
                      {homepage?.h1Count === 1
                        ? "One main heading found"
                        : `${homepage?.h1Count ?? 0} main headings found`}
                    </td>
                    <td
                      className={`px-4 py-3 ${homepage?.h1Count === 1 ? "text-teal-200" : "text-amber-200"}`}
                    >
                      {homepage?.h1Count === 1 ? "Clear" : "Review"}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      {homepage?.h1Count === 1
                        ? "Keep the heading focused"
                        : "Add one clear heading"}
                    </td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <th scope="row" className="px-4 py-3 text-white">
                      Meta descriptions
                    </th>
                    <td className="px-4 py-3">
                      {canonical.facts.pagesMissingMetaDescriptions.length} of{" "}
                      {canonical.facts.pagesScanned} missing
                    </td>
                    <td className="px-4 py-3 text-amber-200">Verified issue</td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      Fix priority pages first
                    </td>
                  </tr>
                  <tr className="border-t border-white/10">
                    <th scope="row" className="px-4 py-3 text-white">
                      Important pages
                    </th>
                    <td className="px-4 py-3">
                      {coveredPurposes.slice(0, 4).join(", ") ||
                        "No equivalent purpose confirmed"}
                    </td>
                    <td className="px-4 py-3 text-teal-200">
                      Verified strength
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      Maintain coverage
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="border-t border-white/10 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">
                Priority: {firstPriority?.title ?? "Review the saved findings."}
              </p>
            </div>
          </div>
        </section>

        <section
          id="implementation-help"
          aria-labelledby="implementation-example-heading"
          className="scroll-mt-24 bg-[#0a1415] py-14 sm:py-16"
        >
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <FilePenLine
                className="size-5 text-teal-300"
                aria-hidden="true"
              />
              <h2
                id="implementation-example-heading"
                className="text-3xl font-semibold text-white"
              >
                Implementation Help
              </h2>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
              The recommendation becomes review-ready material. Nothing is
              published or edited automatically.
            </p>
            <div className="mt-8 grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
              <article className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Recommendation
                </p>
                <h3 className="mt-3 text-xl font-semibold text-white">
                  {firstPriority?.title ?? "No implementation brief available"}
                </h3>
                <p className="mt-4 text-sm leading-6 text-slate-400">
                  {firstPriority?.description ??
                    "The saved evidence did not support an implementation brief."}
                </p>
              </article>
              <article className="rounded-lg border border-teal-300/30 bg-teal-300/[0.05] p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-200">
                  Ready-to-use brief
                </p>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-[#0a1314] p-4">
                    <dt className="font-semibold text-white">Complete when</dt>
                    <dd className="mt-2 leading-6 text-slate-300">
                      {firstPriority?.completionCriteria ??
                        "The recommended change is visible on every affected page."}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-[#0a1314] p-4">
                    <dt className="font-semibold text-white">How to verify it</dt>
                    <dd className="mt-2 leading-6 text-slate-300">
                      {firstPriority?.verificationMethod ??
                        "Run another audit after publishing the change."}
                    </dd>
                  </div>
                </dl>
                <p className="mt-5 text-sm text-slate-300">
                  <span className="font-semibold text-white">Affected pages:</span>{" "}
                  {firstPriority?.affectedPages.map((page) => page.label).join(", ") ||
                    "See the saved evidence"}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="conversation-heading"
          className="border-y border-white/10 bg-[#071011] py-14 sm:py-16"
        >
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:px-8">
            <div>
              <Bot className="size-5 text-teal-300" aria-hidden="true" />
              <h2
                id="conversation-heading"
                className="mt-5 text-3xl font-semibold text-white"
              >
                Continue with the AI Consultant
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                Questions use the saved fictional report context rather than
                creating new audit facts.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "Which homepage headline should I test first?",
                "Turn the first recommendation into a checklist.",
                "Help me rewrite the missing page descriptions.",
                "How can I verify the homepage CTA improvement?",
              ].map((prompt) => (
                <div
                  key={prompt}
                  className="rounded-lg border border-white/10 bg-[#0d1718] p-4 text-sm text-slate-300"
                >
                  &quot;{prompt}&quot;
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="formats-heading"
          className="bg-[#0a1415] py-14 sm:py-16"
        >
          <div className="mx-auto w-full max-w-7xl px-6 lg:px-8">
            <h2
              id="formats-heading"
              className="text-3xl font-semibold text-white"
            >
              Share the same evidence in the right format
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <article className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                <FileText className="size-5 text-teal-300" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-semibold text-white">
                  Professional PDF report
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  A structured document with executive summary, scores,
                  evidence, priorities, recommendations, and technical appendix.
                </p>
              </article>
              <article className="rounded-lg border border-white/10 bg-[#0d1718] p-6">
                <Presentation
                  className="size-5 text-teal-300"
                  aria-hidden="true"
                />
                <h3 className="mt-5 text-lg font-semibold text-white">
                  Fixed-slide Presentation Mode
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  A concise full-screen walkthrough for discussing the audit
                  without exposing private dashboard navigation.
                </p>
              </article>
            </div>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center gap-2 rounded-md font-semibold text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
            >
              Run a website audit
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <PublicPageCta
          title="Build the report around your website."
          description="The example is fictional. Your report uses the public website evidence, Business Context, goals, and crawl coverage available for your own business."
        />
      </main>
    </MarketingShell>
  );
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function healthLabelForScore(score: number) {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Good foundation";
  if (score >= 55) return "Needs attention";
  return "Priority work needed";
}

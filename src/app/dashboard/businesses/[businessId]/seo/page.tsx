import { AuditStatus, ScoreCategory } from "@prisma/client";
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Search,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContextualHelpCard } from "@/components/dashboard/contextual-help-card";
import { DisclosureSection } from "@/components/dashboard/disclosure-section";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FloatingScrollControls } from "@/components/dashboard/floating-scroll-controls";
import {
  CompactIssueRow,
  CompactMetricCard,
  PageIntro,
  PositiveEmptyState,
  ReportSection,
  SummaryStrip,
} from "@/components/dashboard/report-ui";
import { buttonVariants } from "@/components/ui/button";
import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import type {
  CrawledPageResult,
  WebsiteCrawlResult,
} from "@/lib/analyzers/website-crawler";
import {
  categoryScore,
  getAuditAssessment,
} from "@/lib/audits/audit-applicability";
import { contextualHelp } from "@/lib/education/help-content";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type BusinessSeoPageProps = {
  params: Promise<{ businessId: string }>;
};

const qualityStyles: Record<string, string> = {
  good: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100",
  found: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100",
  missing: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
  blocked: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
  too_short: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  too_long: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  multiple: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  timeout: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  unreachable: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  unknown: "border-border bg-background text-muted",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getSeoAnalysis(snapshot: unknown): SeoAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.seo)) return null;
  return typeof snapshot.seo.score === "number"
    ? (snapshot.seo as SeoAnalysis)
    : null;
}

function getWebsiteCrawl(snapshot: unknown): WebsiteCrawlResult | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.websiteCrawl)) return null;
  return Array.isArray(snapshot.websiteCrawl.pageResults)
    ? (snapshot.websiteCrawl as WebsiteCrawlResult)
    : null;
}

function displayPagePath(url: string) {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function SeoStatus({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
        qualityStyles[status] ?? qualityStyles.unknown,
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function affectedPages(
  pages: CrawledPageResult[],
  type: "title" | "meta" | "h1",
) {
  return pages.filter((page) => {
    if (type === "title") return !page.title;
    if (type === "meta") return !page.metaDescription;
    return page.h1Count !== 1;
  });
}

export default async function BusinessSeoPage({ params }: BusinessSeoPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: user.id },
    include: {
      audits: {
        where: { status: AuditStatus.COMPLETED },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          scores: true,
          recommendations: {
            where: { category: ScoreCategory.SEO },
            orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
            include: {
              implementationDrafts: {
                where: { status: { not: "ARCHIVED" } },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  if (!business) notFound();

  const audit = business.audits.at(0);
  const seo = audit ? getSeoAnalysis(audit.analysisSnapshot) : null;
  const crawl = audit ? getWebsiteCrawl(audit.analysisSnapshot) : null;

  if (!audit) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="SEO analysis"
          description="Review search titles, descriptions, page headlines, crawl rules, and sitemap setup."
          icon={Search}
        />
        <EmptyState
          compact
          icon={<Search className="size-6" />}
          title="No SEO analysis yet"
          description="Confirm a website profile and run an audit to check search titles, descriptions, headlines, crawl rules, and sitemap setup."
          action={
            <Link
              href={`/dashboard/businesses/${business.id}/audit/run`}
              data-customer-event="empty_state_action_clicked"
              data-customer-surface="empty_state"
              className={buttonVariants({ variant: "primary" })}
            >
              Run audit
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        />
      </div>
    );
  }

  const assessment = getAuditAssessment(audit.analysisSnapshot);

  if (!seo || !assessment.hasWebsite) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="SEO analysis"
          description="SEO analysis becomes available after a website is added, confirmed, and included in a new audit."
          icon={Search}
        />
        <EmptyState
          compact
          icon={<Search className="size-6" />}
          title="SEO not applicable yet"
          description="This social-first audit excluded SEO from the overall score. Add and confirm a website later to check search titles, descriptions, H1 structure, robots.txt, sitemap.xml, and crawl signals."
          action={
            <Link
              href={`/dashboard/businesses/${business.id}/confirm`}
              className={buttonVariants({ variant: "primary" })}
            >
              Add website
              <ArrowRight className="size-4" />
            </Link>
          }
        />
      </div>
    );
  }

  const seoScore = categoryScore(audit.scores, ScoreCategory.SEO) ?? seo.score;
  const pages = crawl?.pageResults ?? [];
  const titlePages = affectedPages(pages, "title");
  const metaPages = affectedPages(pages, "meta");
  const h1Pages = affectedPages(pages, "h1");
  const issues: Array<{
    key: string;
    title: string;
    detail: string;
    why: string;
    affected: CrawledPageResult[];
    impact: "danger" | "warning" | "info";
    prompt: string;
  }> = [];

  if (seo.h1Status !== "good") {
    issues.push({
      key: "h1",
      title:
        seo.h1Status === "missing"
          ? "The homepage needs a clear main headline"
          : "Some pages have headline structure issues",
      detail: `Homepage H1 status: ${seo.h1Status.replaceAll("_", " ")}. ${h1Pages.length} crawled page${h1Pages.length === 1 ? "" : "s"} need attention.`,
      why: "A clear page headline helps visitors and search engines understand the page topic quickly.",
      affected: h1Pages,
      impact: "danger",
      prompt: "Help me create a clear homepage headline based on my business context.",
    });
  }
  if (seo.metaDescriptionStatus !== "good") {
    issues.push({
      key: "meta",
      title:
        seo.metaDescriptionStatus === "missing"
          ? "Add a homepage search description"
          : `Shorten the homepage search description`,
      detail: `Current length: ${seo.metaDescriptionLength} characters. ${metaPages.length} crawled page${metaPages.length === 1 ? "" : "s"} are missing a description.`,
      why: "A concise description helps potential customers understand the page before they click from search results.",
      affected: metaPages,
      impact: "warning",
      prompt: "Draft a shorter meta description for my homepage using the saved business context.",
    });
  }
  if (seo.titleStatus !== "good") {
    issues.push({
      key: "title",
      title: seo.titleStatus === "missing" ? "Add a search title" : "Refine the homepage search title",
      detail: `Current length: ${seo.titleLength} characters. ${titlePages.length} crawled page${titlePages.length === 1 ? "" : "s"} are missing titles.`,
      why: "Search titles are a primary signal for page topic and often become the clickable headline in search results.",
      affected: titlePages,
      impact: "warning",
      prompt: "Help me draft a concise SEO title for my homepage.",
    });
  }
  if (seo.robotsTxtStatus !== "found" || seo.sitemapStatus !== "found") {
    issues.push({
      key: "indexability",
      title: "Complete the site discovery setup",
      detail: `robots.txt: ${seo.robotsTxtStatus.replaceAll("_", " ")}; sitemap.xml: ${seo.sitemapStatus.replaceAll("_", " ")}.`,
      why: "These files help search engines discover pages and understand crawl guidance.",
      affected: [],
      impact: "warning",
      prompt: "Explain how I should fix my robots.txt or sitemap setup.",
    });
  }
  if (seo.canonicalStatus !== "good") {
    issues.push({
      key: "canonical",
      title: "Add a canonical tag as technical cleanup",
      detail: `Canonical status: ${seo.canonicalStatus.replaceAll("_", " ")}.`,
      why: "A canonical tag helps search engines understand which URL is the preferred version of a page.",
      affected: [],
      impact: "info",
      prompt: "Explain how to add the correct canonical tag to my homepage.",
    });
  }
  const displayedIssues = issues.slice(0, 5);
  const affectedPageList = [...new Map(
    [...h1Pages, ...metaPages, ...titlePages].map((page) => [page.url, page]),
  ).values()].sort((a, b) => {
    const issueCount = (page: CrawledPageResult) =>
      Number(!page.title) + Number(!page.metaDescription) + Number(page.h1Count !== 1);
    return issueCount(b) - issueCount(a);
  });
  const statusChecks = [
    ["Search title", seo.titleStatus, `${seo.titleLength} characters`],
    ["Search description", seo.metaDescriptionStatus, `${seo.metaDescriptionLength} characters`],
    ["Main headline (H1)", seo.h1Status, "Exactly one preferred"],
    ["Canonical", seo.canonicalStatus, "Preferred page URL"],
    ["Mobile viewport", seo.viewportStatus, "Mobile rendering"],
    ["robots.txt", seo.robotsTxtStatus, "Crawl guidance"],
    ["sitemap.xml", seo.sitemapStatus, "Page discovery"],
  ] as const;

  return (
    <div className="space-y-6">
      <PageIntro
        title="SEO analysis"
        description="Checks search titles, descriptions, page headlines, canonical setup, mobile readiness, robots.txt, sitemap.xml, and multi-page SEO issues."
        icon={Search}
        actions={
          <Link
            href={`/dashboard/businesses/${business.id}/action-plan?category=SEO`}
            className={buttonVariants({ variant: "primary", size: "sm" })}
          >
            Review SEO actions
            <ArrowRight className="size-4" />
          </Link>
        }
      />

      <ContextualHelpCard {...contextualHelp.seo} />

      <section className="grid gap-3 sm:grid-cols-3">
        <CompactMetricCard label="Overall SEO score" value={`${seoScore}/100`} />
        <CompactMetricCard label="Issues to fix" value={displayedIssues.length} tone={displayedIssues.length ? "warning" : "good"} />
        <CompactMetricCard label="Pages scanned" value={crawl?.pagesScanned ?? 1} />
      </section>

      {crawl?.duplicateUrlsSkipped ? (
        <SummaryStrip>
          <strong>Controlled crawl</strong>
          <span className="text-muted">Repeated URL variants were safely skipped.</span>
        </SummaryStrip>
      ) : null}

      <ReportSection
        title={`${displayedIssues.length} SEO issue${displayedIssues.length === 1 ? "" : "s"} to fix`}
        description="Diagnosis and next action are combined so the same issue is not repeated under separate warning and fix lists."
      >
        {displayedIssues.length > 0 ? displayedIssues.map((issue) => {
          const patterns: Record<string, RegExp> = {
            h1: /h1|headline/i,
            meta: /meta|search description/i,
            title: /search title|title tag/i,
            indexability: /robots|sitemap|index/i,
            canonical: /canonical/i,
          };
          const recommendation =
            audit.recommendations.find((item) => patterns[issue.key]?.test(item.title)) ??
            audit.recommendations.at(0);

          return (
            <CompactIssueRow
              key={issue.key}
              title={issue.title}
              detail={`${issue.detail} ${issue.why}`}
              tone={issue.impact}
              meta={issue.affected.length > 0 ? `Affected pages: ${issue.affected.slice(0, 3).map((page) => displayPagePath(page.url)).join(", ")}` : "Site-wide technical setup"}
              action={
                <Link
                  href={`/dashboard/businesses/${business.id}/action-plan?category=SEO${recommendation ? `&q=${encodeURIComponent(recommendation.title)}` : ""}`}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Review action
                  <ArrowRight className="size-4" />
                </Link>
              }
            />
          );
        }) : <PositiveEmptyState>No priority SEO issues were detected.</PositiveEmptyState>}
      </ReportSection>

      <ReportSection title="Core SEO checks" description="A compact status view of the homepage and site-discovery basics.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {statusChecks.map(([label, status, detail]) => (
            <div key={label} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="mt-1 text-xs text-muted">{detail}</p>
              </div>
              <SeoStatus status={status} />
            </div>
          ))}
        </div>
      </ReportSection>

      {crawl ? (
        <ReportSection title="Multi-page SEO coverage" description="Counts reflect only the controlled set of pages scanned in this audit.">
          <div className="grid gap-3 sm:grid-cols-3">
            <CompactMetricCard label="Missing titles" value={crawl.pagesMissingTitle} tone={crawl.pagesMissingTitle ? "warning" : "good"} />
            <CompactMetricCard label="Missing descriptions" value={crawl.pagesMissingMetaDescription} tone={crawl.pagesMissingMetaDescription ? "warning" : "good"} />
            <CompactMetricCard label="Headline issue pages" value={crawl.pagesWithNoH1 + crawl.pagesWithMultipleH1} tone={crawl.pagesWithNoH1 + crawl.pagesWithMultipleH1 ? "warning" : "good"} />
          </div>

          <div className="mt-5">
            <p className="mb-3 text-sm font-semibold">Highest-priority affected pages</p>
            {affectedPageList.length > 0 ? affectedPageList.slice(0, 5).map((page) => (
              <div key={page.url} className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{page.title ?? "Missing title"}</p>
                  <p className="truncate text-xs text-muted">{displayPagePath(page.url)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {!page.title ? <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100">Missing title</span> : null}
                  {!page.metaDescription ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Missing description</span> : null}
                  {page.h1Count !== 1 ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">H1: {page.h1Count}</span> : null}
                </div>
              </div>
            )) : <PositiveEmptyState>No multi-page title, description, or headline issues were found.</PositiveEmptyState>}
          </div>

          {affectedPageList.length > 5 ? (
            <DisclosureSection title={`View all affected pages (${affectedPageList.length})`} compact className="mt-4">
              {affectedPageList.map((page) => (
                <p key={page.url} className="border-b border-border py-2 text-sm last:border-b-0">{displayPagePath(page.url)}</p>
              ))}
            </DisclosureSection>
          ) : null}

          <div className="mt-4">
            {crawl.skippedImportantPages.length === 0 ? (
              <PositiveEmptyState>All discovered priority pages were scanned.</PositiveEmptyState>
            ) : (
              <SummaryStrip>
                <strong>{crawl.skippedImportantPages.length} priority page{crawl.skippedImportantPages.length === 1 ? "" : "s"} discovered beyond the crawl limit</strong>
                <span className="text-muted">Review the Website tab for details.</span>
              </SummaryStrip>
            )}
          </div>
        </ReportSection>
      ) : null}

      <ReportSection title="SEO strengths" description="Positive signals worth preserving while fixes are made.">
        {seo.seoStrengths.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {seo.seoStrengths.slice(0, 6).map((strength) => (
              <span key={strength} className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100">
                <CheckCircle2 className="size-4 shrink-0" />
                {strength}
              </span>
            ))}
          </div>
        ) : <p className="text-sm text-muted">No strengths were recorded in this snapshot.</p>}
      </ReportSection>

      <DisclosureSection title="Technical SEO details" description="Analyzer score, raw warnings, exact crawl counts, and saved recommended-fix text.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CompactMetricCard label="Technical SEO check score" value={`${seo.score}/100`} detail="This raw rules score may differ from the overall SEO score because the audit also considers multi-page evidence and business context." />
          <CompactMetricCard label="Duplicate variants skipped" value={crawl?.duplicateUrlsSkipped ?? 0} />
          <CompactMetricCard label="Crawl limit" value={crawl?.crawlLimitUsed ?? 1} />
          <CompactMetricCard label="Limit reached" value={crawl?.crawlLimitReached ? "Yes" : "No"} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><HelpCircle className="size-4" /> Saved warnings</p>
            {[...seo.seoWarnings, ...seo.indexabilityWarnings].map((warning) => <p key={warning} className="border-b border-border py-2 text-sm leading-6 text-muted last:border-b-0">{warning}</p>)}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Saved fixes</p>
            {seo.recommendedFixes.map((fix) => <p key={fix} className="border-b border-border py-2 text-sm leading-6 text-muted last:border-b-0">{fix}</p>)}
          </div>
        </div>
      </DisclosureSection>

      <FloatingScrollControls />
    </div>
  );
}

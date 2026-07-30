import { AuditStatus, FindingSeverity, ScoreCategory } from "@prisma/client";
import {
  ArrowRight,
  ExternalLink,
  Globe2,
  MousePointerClick,
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
import { Input } from "@/components/ui/input";
import { classifyWebsiteActions } from "@/lib/analyzers/action-classifier";
import { normalizeImportantPageCoverage } from "@/lib/analyzers/important-page-coverage";
import type {
  CrawledPageResult,
  WebsiteCrawlResult,
} from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import {
  categoryScore,
  getAuditAssessment,
} from "@/lib/audits/audit-applicability";
import { contextualHelp } from "@/lib/education/help-content";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type BusinessWebsitePageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{
    q?: string;
    issue?: string;
    pageType?: string;
    sort?: string;
  }>;
};

const importantPageOrder = [
  "Homepage",
  "Menu",
  "Contact",
  "Location",
  "Hours",
  "Events",
  "Order / Takeout",
  "About",
];

const severityRank: Record<FindingSeverity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getWebsiteAnalysis(snapshot: unknown): WebsiteAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.website)) return null;
  return typeof snapshot.website.score === "number"
    ? (snapshot.website as WebsiteAnalysis)
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

function pageIssueCount(page: CrawledPageResult) {
  return (
    Number(!page.title) +
    Number(!page.metaDescription) +
    Number(page.h1Count !== 1) +
    Number(primaryActionCount(page) === 0) +
    Number(page.imagesMissingAltCount > 0) +
    Number(page.statusCode === null || page.statusCode >= 400)
  );
}

function primaryActionCount(page: CrawledPageResult) {
  return page.actionSummary?.primaryActions?.length ?? page.ctaCandidates.length;
}

function recommendationForFinding<
  T extends { title: string; category: ScoreCategory },
>(findingTitle: string, recommendations: T[]) {
  const patterns = [
    /h1|headline/i,
    /call.to.action|\bcta\b/i,
    /meta description|search description/i,
    /alt text|image alt/i,
    /contact/i,
    /proof|trust|testimonial|review/i,
    /pricing/i,
  ];
  const pattern = patterns.find((candidate) => candidate.test(findingTitle));

  return (
    (pattern
      ? recommendations.find((item) => pattern.test(item.title))
      : undefined) ??
    recommendations.find((item) => item.category === ScoreCategory.WEBSITE)
  );
}

function pageMatchesIssue(page: CrawledPageResult, issue?: string) {
  if (!issue || issue === "all") return true;
  if (issue === "title") return !page.title;
  if (issue === "meta") return !page.metaDescription;
  if (issue === "h1") return page.h1Count !== 1;
  if (issue === "cta") return primaryActionCount(page) === 0;
  if (issue === "alt") return page.imagesMissingAltCount > 0;
  return true;
}

function affectedPagesForFinding(
  title: string,
  pages: CrawledPageResult[],
) {
  const lower = title.toLowerCase();
  let matches = pages;

  if (/meta|description/.test(lower)) {
    matches = pages.filter((page) => !page.metaDescription);
  } else if (/h1|headline/.test(lower)) {
    matches = pages.filter((page) => page.h1Count !== 1);
  } else if (/cta|call.to.action|next step|action/.test(lower)) {
    matches = pages.filter((page) => primaryActionCount(page) === 0);
  } else if (/alt|image/.test(lower)) {
    matches = pages.filter((page) => page.imagesMissingAltCount > 0);
  } else {
    matches = pages.filter((page) => page.pageTypes.includes("Homepage"));
  }

  return matches.slice(0, 3).map((page) => displayPagePath(page.url));
}

function ActionGroup({
  label,
  items,
  emptyLabel,
  primary = false,
}: {
  label: string;
  items: string[];
  emptyLabel: string;
  primary?: boolean;
}) {
  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0">
      <p className="text-sm font-semibold">{label}</p>
      {items.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.slice(0, 12).map((item) => (
            <span
              key={item}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                primary
                  ? "border-accent/30 bg-accent/5 font-medium"
                  : "border-border bg-background text-muted",
              )}
            >
              {primary ? <MousePointerClick className="size-4 text-accent" /> : null}
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

function PageRow({ page }: { page: CrawledPageResult }) {
  const issues = pageIssueCount(page);
  return (
    <div className="grid gap-3 border-b border-border py-4 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{page.title ?? "Missing title"}</p>
          {page.pageTypes.slice(0, 2).map((type) => (
            <span key={type} className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-muted">
              {type}
            </span>
          ))}
        </div>
        <a
          href={page.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <span className="truncate">{displayPagePath(page.url)}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-medium">
        <span className={cn("rounded-full border px-2.5 py-1", issues > 0 ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" : "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100")}>
          {issues} issue{issues === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-border bg-background px-2.5 py-1">
          H1: {page.h1Count === 1 ? "Good" : page.h1Count === 0 ? "Missing" : `${page.h1Count} found`}
        </span>
        <span className="rounded-full border border-border bg-background px-2.5 py-1">
          Meta: {page.metaDescription ? "Present" : "Missing"}
        </span>
        <span className="rounded-full border border-border bg-background px-2.5 py-1">
          Actions: {primaryActionCount(page)}
        </span>
        <span className="rounded-full border border-border bg-background px-2.5 py-1">
          Alt missing: {page.imagesMissingAltCount}
        </span>
      </div>
    </div>
  );
}

export default async function BusinessWebsitePage({
  params,
  searchParams,
}: BusinessWebsitePageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = searchParams ? await searchParams : {};
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: user.id },
    include: {
      audits: {
        where: { status: AuditStatus.COMPLETED },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          scores: true,
          findings: {
            where: { category: { in: [ScoreCategory.WEBSITE, ScoreCategory.SEO] } },
            orderBy: { createdAt: "asc" },
          },
          recommendations: {
            where: { category: { in: [ScoreCategory.WEBSITE, ScoreCategory.SEO] } },
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
  const analysis = audit ? getWebsiteAnalysis(audit.analysisSnapshot) : null;
  const crawl = audit ? getWebsiteCrawl(audit.analysisSnapshot) : null;

  if (!audit) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Website analysis"
          description="Review website clarity, conversion paths, page quality, and supporting crawl evidence."
          icon={Globe2}
        />
        <EmptyState
          compact
          icon={<Globe2 className="size-6" />}
          title="No website analysis yet"
          description="Confirm a website profile and run an audit to analyze the homepage and priority internal pages."
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

  if (!analysis || !assessment.hasWebsite) {
    return (
      <div className="space-y-6">
        <PageIntro
          title="Website analysis"
          description="Website analysis becomes available after a website is added, confirmed, and included in a new audit."
          icon={Globe2}
        />
        <EmptyState
          compact
          icon={<Globe2 className="size-6" />}
          title="Website not provided"
          description="This social-first audit did not score Website as a failure. Add and confirm a website later to unlock homepage, conversion, and multi-page crawl analysis."
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

  const websiteScore =
    categoryScore(audit.scores, ScoreCategory.WEBSITE) ?? analysis.score;
  const pages = crawl?.pageResults ?? [];
  const actionSummary =
    analysis.actionSummary ??
    classifyWebsiteActions({
      candidates: analysis.ctaCandidates.map((candidate) =>
        /^https?:\/\//i.test(candidate)
          ? { href: candidate, label: "" }
          : { label: candidate, href: "" },
      ),
      businessContext: {
        description: business.description,
        targetAudience: business.targetAudience,
        mainOffer: business.mainOffer,
        industry: business.industry,
        businessType: business.businessType,
        primaryConversionGoal: business.primaryConversionGoal,
      },
    });
  const criticalFindings = audit.findings
    .filter((finding) => finding.severity !== FindingSeverity.INFO)
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
    .filter(
      (finding, index, findings) =>
        findings.findIndex((item) => item.title === finding.title) === index,
    )
    .slice(0, 5);
  const normalizedCoverage = crawl
    ? normalizeImportantPageCoverage(crawl)
    : null;
  const scannedTypes = new Set(
    normalizedCoverage?.scannedImportantPages.map((page) => page.type) ?? [
      "Homepage",
    ],
  );
  const skippedTypes = new Set(
    normalizedCoverage?.skippedImportantPages.map((page) => page.type) ?? [],
  );
  const relevantCoverage = importantPageOrder.filter(
    (type) =>
      scannedTypes.has(type) ||
      skippedTypes.has(type) ||
      crawl?.missingImportantPageTypes?.includes(type) ||
      type === "Homepage",
  );
  const q = query.q?.trim().toLowerCase() ?? "";
  const filteredPages = pages
    .filter(
      (page) =>
        (!q || `${page.title ?? ""} ${page.url}`.toLowerCase().includes(q)) &&
        pageMatchesIssue(page, query.issue) &&
        (!query.pageType || query.pageType === "all" || page.pageTypes.includes(query.pageType)),
    )
    .sort((a, b) => {
      if (query.sort === "path") return a.url.localeCompare(b.url);
      if (query.sort === "score") return a.score - b.score;
      return pageIssueCount(b) - pageIssueCount(a);
    });
  const priorityPages = [...pages]
    .sort((a, b) => {
      const aPriority = a.pageTypes.some((type) => importantPageOrder.includes(type)) ? 10 : 0;
      const bPriority = b.pageTypes.some((type) => importantPageOrder.includes(type)) ? 10 : 0;
      return bPriority + pageIssueCount(b) - (aPriority + pageIssueCount(a));
    })
    .slice(0, 5);
  const allPageTypes = [...new Set(pages.flatMap((page) => page.pageTypes))].sort();
  const filtersActive = Boolean(q || query.issue || query.pageType || query.sort);

  return (
    <div className="space-y-6">
      <PageIntro
        title="Website analysis"
        description="See the highest-impact clarity, conversion, and page-quality issues first. Full crawl evidence stays available when you need it."
        icon={Globe2}
        actions={
          <>
            <Link
              href={`/dashboard/businesses/${business.id}/action-plan?category=WEBSITE`}
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Review website actions
              <ArrowRight className="size-4" />
            </Link>
            <a href={analysis.normalizedUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Open website
              <ExternalLink className="size-4" />
            </a>
          </>
        }
      />

      <ContextualHelpCard {...contextualHelp.website} />

      <section className="grid gap-3 sm:grid-cols-3">
        <CompactMetricCard label="Website score" value={`${websiteScore}/100`} />
        <CompactMetricCard label="Pages scanned" value={crawl?.pagesScanned ?? 1} />
        <CompactMetricCard label="Critical issues" value={criticalFindings.length} tone={criticalFindings.length ? "warning" : "good"} />
      </section>

      {crawl?.duplicateUrlsSkipped ? (
        <SummaryStrip>
          <strong>Clean crawl</strong>
          <span className="text-muted">Repeated/internal URL variants were safely skipped.</span>
        </SummaryStrip>
      ) : null}

      <ReportSection
        title="Critical issues"
        description="The website problems most likely to affect clarity, search visibility, or visitor action."
      >
        {criticalFindings.length > 0 ? (
          criticalFindings.map((finding) => {
            const affected = affectedPagesForFinding(finding.title, pages);
            const recommendation = recommendationForFinding(
              finding.title,
              audit.recommendations,
            );
            return (
              <CompactIssueRow
                key={finding.id}
                title={finding.title}
                detail={finding.description}
                tone={finding.severity === FindingSeverity.CRITICAL || finding.severity === FindingSeverity.HIGH ? "danger" : "warning"}
                meta={affected.length > 0 ? `Affected key pages: ${affected.join(", ")}` : "Homepage evidence"}
                action={
                  <Link
                    href={`/dashboard/businesses/${business.id}/action-plan?category=${finding.category}${recommendation ? `&q=${encodeURIComponent(recommendation.title)}` : ""}`}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    Review action
                    <ArrowRight className="size-4" />
                  </Link>
                }
              />
            );
          })
        ) : (
          <PositiveEmptyState>No high-impact website issues were detected in this audit.</PositiveEmptyState>
        )}
      </ReportSection>

      <ReportSection title="Important page coverage" description="Scanned means analyzed. Discovered but skipped means the page was found beyond the crawl limit. Not detected means no matching page was found.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {relevantCoverage.map((type) => {
            const state = scannedTypes.has(type)
              ? "Scanned"
              : skippedTypes.has(type)
                ? "Discovered but skipped"
                : "Not detected";
            return (
              <div key={type} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-3">
                <span className="text-sm font-medium">{type}</span>
                <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", state === "Scanned" ? "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100" : state === "Discovered but skipped" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" : "border-border bg-card text-muted")}>
                  {state}
                </span>
              </div>
            );
          })}
        </div>
      </ReportSection>

      <ReportSection title="Conversion and visitor actions" description="High-value actions are separated from navigation, social, event, and utility links.">
        <ActionGroup label="Primary visitor actions" items={actionSummary.primaryActions} emptyLabel="No clear primary visitor action was detected." primary />
        <ActionGroup label="Secondary navigation" items={actionSummary.secondaryNavigation} emptyLabel="No secondary navigation actions saved." />
        <ActionGroup label="Social links" items={actionSummary.socialLinks} emptyLabel="No social links detected." />
        <ActionGroup label="Event links" items={actionSummary.eventLinks} emptyLabel="No individual event links detected." />
        <ActionGroup label="Utility links" items={actionSummary.utilityLinks} emptyLabel="No utility actions detected." />
      </ReportSection>

      {crawl ? (
        <ReportSection title="Pages needing attention" description="The five highest-priority pages are shown first, favoring core customer journeys.">
          {priorityPages.map((page) => <PageRow key={page.url} page={page} />)}
        </ReportSection>
      ) : null}

      {crawl ? (
        <DisclosureSection
          title={`All scanned pages (${crawl.pageResults.length})`}
          description="Search, filter, and sort the full crawl inventory."
          defaultOpen={filtersActive}
        >
          <form className="grid gap-3 border-b border-border pb-4 md:grid-cols-[1fr_180px_180px_160px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted" />
              <Input name="q" defaultValue={query.q} placeholder="Search title or URL" className="pl-9" aria-label="Search crawled pages" />
            </div>
            <select name="issue" defaultValue={query.issue ?? "all"} aria-label="Filter by issue" className="h-11 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20">
              <option value="all">All issues</option>
              <option value="title">Missing title</option>
              <option value="meta">Missing description</option>
              <option value="h1">Headline issue</option>
              <option value="cta">No primary action</option>
              <option value="alt">Missing image alt</option>
            </select>
            <select name="pageType" defaultValue={query.pageType ?? "all"} aria-label="Filter by page type" className="h-11 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20">
              <option value="all">All page types</option>
              {allPageTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select name="sort" defaultValue={query.sort ?? "issues"} aria-label="Sort pages" className="h-11 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20">
              <option value="issues">Most issues</option>
              <option value="score">Lowest score</option>
              <option value="path">URL path</option>
            </select>
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>Apply</button>
          </form>
          <div className="mt-2">
            {filteredPages.length > 0 ? filteredPages.map((page) => <PageRow key={page.url} page={page} />) : <p className="py-5 text-sm text-muted">No pages match these filters.</p>}
          </div>
        </DisclosureSection>
      ) : null}

      <DisclosureSection title="Technical diagnostics" description="Raw crawl counts, homepage metadata, and low-level warnings.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CompactMetricCard label="Successful pages" value={crawl?.successfulPages ?? 1} />
          <CompactMetricCard label="Failed pages" value={crawl?.failedPages ?? 0} />
          <CompactMetricCard label="Duplicate variants skipped" value={crawl?.duplicateUrlsSkipped ?? 0} />
          <CompactMetricCard label="Images missing alt" value={`${crawl?.totalImagesMissingAlt ?? analysis.imagesMissingAltCount} / ${crawl?.totalImages ?? analysis.imageCount}`} />
        </div>
        <div className="mt-4 space-y-3 text-sm leading-6">
          <p><strong>Homepage title:</strong> {analysis.pageTitle || "Missing"}</p>
          <p><strong>Meta description:</strong> {analysis.metaDescription || "Missing"}</p>
          <p><strong>Homepage H1:</strong> {analysis.h1Text.join(" | ") || "Missing"}</p>
          {[...analysis.warnings, ...(crawl?.warnings ?? [])].map((warning) => <p key={warning} className="text-amber-700 dark:text-amber-200">{warning}</p>)}
        </div>
      </DisclosureSection>

      <FloatingScrollControls />
    </div>
  );
}

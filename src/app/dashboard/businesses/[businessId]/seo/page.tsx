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
import { ReportQualityNotice } from "@/components/reports/report-quality-notice";
import {
  CompactIssueRow,
  CompactMetricCard,
  PageIntro,
  PositiveEmptyState,
  ReportSection,
  SummaryStrip,
} from "@/components/dashboard/report-ui";
import { buttonVariants } from "@/components/ui/button";
import { contextualHelp } from "@/lib/education/help-content";
import { prisma } from "@/lib/prisma";
import { buildAuditReportViewModel } from "@/lib/reports/audit-report-view-model";
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

  const report = await buildAuditReportViewModel({
    businessId: business.id,
    auditId: audit.id,
    ownerId: user.id,
  });
  if (!report) notFound();
  if (report.reportIntegrity?.status === "NEEDS_REVIEW") {
    return <ReportQualityNotice businessId={business.id} />;
  }
  const seo = report.seo;
  const crawl = report.websiteCrawl;
  const assessment = report.assessment;

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

  const seoScore =
    report.scores.find((item) => item.category === ScoreCategory.SEO)?.score ??
    seo.score;
  const displayedIssues = report.findings.all
    .filter(
      (finding) =>
        finding.category === ScoreCategory.SEO &&
        (finding.findingType === "VERIFIED_TECHNICAL_ISSUE" ||
          finding.findingType === "AI_REVIEWED_OPPORTUNITY"),
    )
    .slice(0, 5);
  const affectedPageList = (report.canonicalReport?.pages ?? []).filter(
    (page) => !page.title || !page.metaDescription || page.h1Count !== 1,
  );
  const seoStrengths = report.findings.strengths.filter(
    (finding) => finding.category === ScoreCategory.SEO,
  );
  const seoActions = report.recommendations.all.filter(
    (recommendation) => recommendation.category === ScoreCategory.SEO,
  );
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
        <CompactMetricCard label="Pages scanned" value={report.canonicalFacts?.successfulPages ?? crawl?.successfulPages ?? 1} />
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
          const recommendation =
            report.recommendations.all.find(
              (item) =>
                item.sourceFindingId === issue.id ||
                (issue.rootCauseKey && item.rootCauseKey === issue.rootCauseKey),
            );

          return (
            <CompactIssueRow
              key={issue.id}
              title={issue.title}
              detail={`${issue.description} ${issue.whyItMatters ?? ""}`.trim()}
              tone={issue.findingType === "VERIFIED_TECHNICAL_ISSUE" ? "danger" : "warning"}
              meta={issue.affectedPages?.length ? `Affected pages: ${issue.affectedPages.slice(0, 3).map((page) => `${page.label} (${page.path})`).join(", ")}` : "Site-wide evidence"}
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
            <CompactMetricCard label="Missing titles" value={report.canonicalFacts?.pagesMissingTitles.length ?? 0} tone={report.canonicalFacts?.pagesMissingTitles.length ? "warning" : "good"} />
            <CompactMetricCard label="Missing descriptions" value={report.canonicalFacts?.pagesMissingMetaDescriptions.length ?? 0} tone={report.canonicalFacts?.pagesMissingMetaDescriptions.length ? "warning" : "good"} />
            <CompactMetricCard label="Headline issue pages" value={(report.canonicalFacts?.pagesWithNoH1.length ?? 0) + (report.canonicalFacts?.pagesWithMultipleH1.length ?? 0)} tone={(report.canonicalFacts?.pagesWithNoH1.length ?? 0) + (report.canonicalFacts?.pagesWithMultipleH1.length ?? 0) ? "warning" : "good"} />
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
        {seoStrengths.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {seoStrengths.slice(0, 6).map((strength) => (
              <span key={strength.id} className="inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100">
                <CheckCircle2 className="size-4 shrink-0" />
                {strength.title}
              </span>
            ))}
          </div>
        ) : <p className="text-sm text-muted">No strengths were recorded in this snapshot.</p>}
      </ReportSection>

      <DisclosureSection title="Technical SEO details" description="Saved checks and the same verified actions used throughout this audit.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CompactMetricCard label="SEO score" value={`${seoScore}/100`} detail="This is the finalized score used throughout the report." />
          <CompactMetricCard label="Duplicate variants skipped" value={crawl?.duplicateUrlsSkipped ?? 0} />
          <CompactMetricCard label="Crawl limit" value={crawl?.crawlLimitUsed ?? 1} />
          <CompactMetricCard label="Limit reached" value={crawl?.crawlLimitReached ? "Yes" : "No"} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><HelpCircle className="size-4" /> Verified findings</p>
            {displayedIssues.map((finding) => <p key={finding.id} className="border-b border-border py-2 text-sm leading-6 text-muted last:border-b-0">{finding.description}</p>)}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Recommended actions</p>
            {seoActions.map((action) => <p key={action.id} className="border-b border-border py-2 text-sm leading-6 text-muted last:border-b-0">{action.description}</p>)}
          </div>
        </div>
      </DisclosureSection>

      <FloatingScrollControls />
    </div>
  );
}

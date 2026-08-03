import {
  AuditStatus,
  FindingSeverity,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSearch,
  Lightbulb,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DisclosureSection } from "@/components/dashboard/disclosure-section";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FloatingScrollControls } from "@/components/dashboard/floating-scroll-controls";
import { RecommendationPrimaryAction } from "@/components/dashboard/recommendation-primary-action";
import {
  PageIntro,
  ReportSection,
  SectionTabs,
  SummaryStrip,
} from "@/components/dashboard/report-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  findingTypeLabels,
  type AuditFindingType,
} from "@/lib/audits/finding-taxonomy";
import { recommendationCategoryLabels } from "@/lib/recommendations/utils";
import {
  buildAuditReportViewModel,
  type ReportFinding,
} from "@/lib/reports/audit-report-view-model";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type AuditFindingsPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{
    view?: string | string[];
    category?: string | string[];
  }>;
};

type FindingView =
  "all" | "priority" | "issues" | "opportunities" | "strengths" | "limitations";

const findingViews: FindingView[] = [
  "all",
  "priority",
  "issues",
  "opportunities",
  "strengths",
  "limitations",
];

const findingViewLabels: Record<FindingView, string> = {
  all: "All findings",
  priority: "High priority",
  issues: "Verified issues",
  opportunities: "AI opportunities",
  strengths: "Strengths",
  limitations: "Limitations",
};

const findingCategories = [
  ScoreCategory.WEBSITE,
  ScoreCategory.SEO,
  ScoreCategory.SOCIAL,
  ScoreCategory.REVIEWS,
  ScoreCategory.BRANDING,
  ScoreCategory.COMPETITORS,
] as const;

const categoryRoutes: Partial<Record<ScoreCategory, string>> = {
  WEBSITE: "website",
  SEO: "seo",
  SOCIAL: "social",
  REVIEWS: "reviews",
  COMPETITORS: "competitors",
};

const severityStyles: Record<FindingSeverity, string> = {
  INFO: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100",
  LOW: "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100",
  MEDIUM:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  HIGH: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
  CRITICAL:
    "border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100",
};

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function findingsHref(
  businessId: string,
  view: FindingView,
  category?: ScoreCategory | null,
) {
  const query = new URLSearchParams();
  if (view !== "all") query.set("view", view);
  if (category) query.set("category", category);
  const suffix = query.toString();
  return `/dashboard/businesses/${businessId}/audit${suffix ? `?${suffix}` : ""}`;
}

function matchesView(finding: ReportFinding, view: FindingView) {
  switch (view) {
    case "priority":
      return (
        finding.severity === FindingSeverity.HIGH ||
        finding.severity === FindingSeverity.CRITICAL
      );
    case "issues":
      return finding.findingType === "VERIFIED_TECHNICAL_ISSUE";
    case "opportunities":
      return finding.findingType === "AI_REVIEWED_OPPORTUNITY";
    case "strengths":
      return finding.findingType === "VERIFIED_STRENGTH";
    case "limitations":
      return (
        finding.findingType === "LIMITATION" ||
        finding.findingType === "COVERAGE_INFORMATION"
      );
    default:
      return true;
  }
}

function findingImpact(finding: ReportFinding) {
  if (finding.whyItMatters) return finding.whyItMatters;

  const impacts: Partial<Record<ScoreCategory, string>> = {
    WEBSITE:
      "This can affect how quickly visitors understand the business and take the next step.",
    SEO: "This can make it harder for search engines and potential customers to understand the page.",
    SOCIAL:
      "This can make the business look less consistent across the public channels customers may check.",
    REVIEWS:
      "This can affect whether potential customers see enough public proof to feel confident.",
    BRANDING:
      "This can make the offer and business identity harder to recognize or remember.",
    COMPETITORS:
      "This identifies a public difference worth considering before choosing a competitive response.",
  };

  return (
    impacts[finding.category] ??
    "This finding may affect the business's online growth priorities."
  );
}

function sourcePageLabel(sourceUrl: string | null | undefined) {
  if (!sourceUrl) return "Business-wide";

  try {
    const url = new URL(sourceUrl);
    if (url.pathname === "/" || !url.pathname) return "Homepage";
    const part = url.pathname
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.[a-z0-9]+$/i, "")
      .replaceAll("-", " ")
      .replaceAll("_", " ");
    if (!part) return url.hostname;
    return part.replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return sourceUrl.startsWith("/") ? "Saved comparison" : "Business-wide";
  }
}

function typeIcon(type: AuditFindingType | undefined) {
  switch (type) {
    case "VERIFIED_STRENGTH":
      return CheckCircle2;
    case "AI_REVIEWED_OPPORTUNITY":
      return Lightbulb;
    case "LIMITATION":
    case "COVERAGE_INFORMATION":
      return ShieldAlert;
    default:
      return AlertTriangle;
  }
}

export default async function AuditFindingsPage({
  params,
  searchParams,
}: AuditFindingsPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = searchParams ? await searchParams : {};
  const requestedView = scalar(query.view);
  const selectedView = findingViews.includes(requestedView as FindingView)
    ? (requestedView as FindingView)
    : "all";
  const requestedCategory = scalar(query.category);
  const selectedCategory = findingCategories.find(
    (category) => category === requestedCategory,
  );
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: user.id },
    select: {
      id: true,
      audits: {
        where: { status: AuditStatus.COMPLETED },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          recommendations: {
            select: {
              id: true,
              title: true,
              category: true,
              status: true,
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
      <EmptyState
        icon={<FileSearch className="size-6" />}
        title="No audit findings yet"
        description="Run an audit to create verified findings, opportunities, strengths, limitations, and supporting evidence."
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
    );
  }

  const report = await buildAuditReportViewModel({
    businessId: business.id,
    auditId: audit.id,
    ownerId: user.id,
  });
  if (!report) notFound();

  const availableFindingCategories = report.legacyScoring
    ? findingCategories
    : ([ScoreCategory.WEBSITE, ScoreCategory.SEO] as const);
  const effectiveSelectedCategory = availableFindingCategories.find(
    (category) => category === selectedCategory,
  );
  const filteredFindings = report.findings.all.filter(
    (finding) =>
      matchesView(finding, selectedView) &&
      (!effectiveSelectedCategory ||
        finding.category === effectiveSelectedCategory),
  );
  const priorityCount = report.findings.all.filter((finding) =>
    matchesView(finding, "priority"),
  ).length;
  const issueCount = report.findings.all.filter((finding) =>
    matchesView(finding, "issues"),
  ).length;
  const opportunityCount = report.findings.all.filter((finding) =>
    matchesView(finding, "opportunities"),
  ).length;
  const limitationCount = report.findings.all.filter((finding) =>
    matchesView(finding, "limitations"),
  ).length;
  const firstImportantFinding =
    report.findings.all.find((finding) => matchesView(finding, "priority")) ??
    report.findings.warnings.at(0) ??
    report.findings.opportunities.at(0) ??
    report.findings.all.at(0);
  const firstReportRecommendation = firstImportantFinding
    ? report.recommendations.all.find(
        (recommendation) =>
          recommendation.sourceFindingId === firstImportantFinding.id,
      )
    : null;
  const firstRecommendation = firstImportantFinding
    ? (audit.recommendations.find(
        (recommendation) => recommendation.id === firstReportRecommendation?.id,
      ) ??
      audit.recommendations.find(
        (recommendation) =>
          recommendation.category === firstImportantFinding.category &&
          recommendation.status !== RecommendationStatus.COMPLETED &&
          recommendation.status !== RecommendationStatus.DISMISSED,
      ))
    : null;
  const usedRecommendationIds = new Set(
    firstRecommendation ? [firstRecommendation.id] : [],
  );
  const recommendationByFindingId = new Map<
    string,
    (typeof audit.recommendations)[number]
  >();

  for (const finding of filteredFindings) {
    const reportRecommendation = report.recommendations.all.find(
      (recommendation) => recommendation.sourceFindingId === finding.id,
    );
    const recommendation = reportRecommendation
      ? audit.recommendations.find(
          (candidate) => candidate.id === reportRecommendation.id,
        )
      : null;

    if (recommendation && !usedRecommendationIds.has(recommendation.id)) {
      recommendationByFindingId.set(finding.id, recommendation);
      usedRecommendationIds.add(recommendation.id);
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Audit"
        title="Findings and evidence"
        description="Review Website and SEO findings with their affected URLs, evidence, impact, next action, and verification method."
        icon={FileSearch}
        actions={
          <>
            <Link
              href={`/dashboard/businesses/${business.id}/overview`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to overview
            </Link>
            <Link
              href={`/dashboard/businesses/${business.id}/audit/run`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Re-audit website
            </Link>
          </>
        }
      />

      {report.legacyScoring ? (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <strong>Legacy scoring model.</strong> This saved report retains its
          original categories. Run a new audit to use the Website Growth Score.
        </Card>
      ) : null}

      {firstImportantFinding ? (
        <ReportSection
          title="Most important finding"
          description="Start here before reviewing the complete evidence list."
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-sm font-medium text-accent">
                {recommendationCategoryLabels[firstImportantFinding.category]}
              </p>
              <h3 className="mt-2 text-xl font-semibold">
                {firstImportantFinding.title}
              </h3>
              <p className="mt-2 max-w-3xl text-base leading-7 text-muted">
                {findingImpact(firstImportantFinding)}
              </p>
            </div>
            {firstRecommendation ? (
              <RecommendationPrimaryAction
                businessId={business.id}
                recommendationId={firstRecommendation.id}
                recommendationTitle={firstRecommendation.title}
                status={firstRecommendation.status}
                surface="audit_findings"
                className="w-full sm:w-auto"
              />
            ) : (
              <Link
                href={`/dashboard/businesses/${business.id}/${categoryRoutes[firstImportantFinding.category] ?? "action-plan"}`}
                className={buttonVariants({ variant: "primary", size: "sm" })}
              >
                Review category
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </ReportSection>
      ) : null}

      <SummaryStrip>
        <strong>{report.findings.all.length} findings</strong>
        <span>{priorityCount} high priority</span>
        <span>{issueCount} verified issues</span>
        <span>{opportunityCount} opportunities</span>
        <span>{limitationCount} coverage notes or limitations</span>
      </SummaryStrip>

      <SectionTabs
        items={findingViews.map((view) => ({
          label: findingViewLabels[view],
          href: findingsHref(business.id, view, effectiveSelectedCategory),
          active: selectedView === view,
          count:
            view === "all"
              ? report.findings.all.length
              : report.findings.all.filter((finding) =>
                  matchesView(finding, view),
                ).length,
        }))}
      />

      <details className="rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Filter by category
          {effectiveSelectedCategory
            ? `: ${recommendationCategoryLabels[effectiveSelectedCategory]}`
            : ""}
        </summary>
        <div className="flex flex-wrap gap-2 border-t border-border p-4">
          <Link
            href={findingsHref(business.id, selectedView)}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              !effectiveSelectedCategory && "border-accent text-accent",
            )}
          >
            All categories
          </Link>
          {availableFindingCategories.map((category) => (
            <Link
              key={category}
              href={findingsHref(business.id, selectedView, category)}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                effectiveSelectedCategory === category &&
                  "border-accent text-accent",
              )}
            >
              {recommendationCategoryLabels[category]}
            </Link>
          ))}
        </div>
      </details>

      <section aria-labelledby="finding-list-title">
        <div className="mb-4">
          <h2 id="finding-list-title" className="text-lg font-semibold">
            {findingViewLabels[selectedView]}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Showing {filteredFindings.length} of {report.findings.all.length}.
          </p>
        </div>

        {filteredFindings.length > 0 ? (
          <div className="divide-y divide-border rounded-lg border border-border bg-card px-5">
            {filteredFindings.map((finding) => {
              const Icon = typeIcon(finding.findingType);
              const relatedRecommendation = recommendationByFindingId.get(
                finding.id,
              );

              return (
                <article
                  key={finding.id}
                  id={`finding-${finding.id}`}
                  className="py-6"
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold">
                          <Icon className="size-3.5" aria-hidden="true" />
                          {finding.findingType
                            ? findingTypeLabels[finding.findingType]
                            : "Observation"}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-semibold",
                            severityStyles[finding.severity],
                          )}
                        >
                          {finding.severity === FindingSeverity.INFO
                            ? "Informational"
                            : `${finding.severity.toLowerCase()} priority`}
                        </span>
                        <span className="text-xs font-medium text-muted">
                          {recommendationCategoryLabels[finding.category]}
                          {" \u00b7 "}
                          {sourcePageLabel(finding.sourceUrl)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold">
                        {finding.title}
                      </h3>
                      <p className="mt-2 max-w-4xl text-sm leading-6 text-muted">
                        {findingImpact(finding)}
                      </p>
                    </div>
                    {relatedRecommendation ? (
                      <RecommendationPrimaryAction
                        businessId={business.id}
                        recommendationId={relatedRecommendation.id}
                        recommendationTitle={relatedRecommendation.title}
                        status={relatedRecommendation.status}
                        surface="audit_findings"
                        className="w-full sm:w-auto"
                      />
                    ) : null}
                  </div>

                  <DisclosureSection
                    title="See evidence"
                    description={finding.evidenceSummary ?? finding.description}
                    compact
                    className="mt-4 border-dashed shadow-none"
                    analyticsEvent="finding_opened"
                    analyticsSurface="audit_findings"
                  >
                    <div className="space-y-3 text-sm leading-6 text-muted">
                      <p>{finding.description}</p>
                      {finding.sourceUrl ? (
                        <p className="break-all">
                          <strong className="text-foreground">Source:</strong>{" "}
                          {finding.sourceUrl}
                        </p>
                      ) : null}
                      {finding.confidence ? (
                        <p>
                          <strong className="text-foreground">
                            Confidence:
                          </strong>{" "}
                          {finding.confidence}
                        </p>
                      ) : null}
                      {finding.suggestedAction ? (
                        <p>
                          <strong className="text-foreground">
                            Recommended response:
                          </strong>{" "}
                          {finding.suggestedAction}
                        </p>
                      ) : null}
                    </div>
                  </DisclosureSection>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            compact
            icon={<FileSearch className="size-5" />}
            title="No findings match these filters"
            description="Choose another finding type or clear the category filter to return to the complete audit."
            action={
              <Link
                href={findingsHref(business.id, "all")}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Show all findings
              </Link>
            }
          />
        )}
      </section>

      <FloatingScrollControls />
    </div>
  );
}

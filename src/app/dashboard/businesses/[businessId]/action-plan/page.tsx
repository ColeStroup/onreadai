import {
  AuditStatus,
  ImplementationDraftStatus,
  PlanType,
  RecommendationPriority,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";
import { ArrowRight, ListChecks, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { LockedFeature } from "@/components/billing/locked-feature";
import { ContextualHelpCard } from "@/components/dashboard/contextual-help-card";
import { DisclosureSection } from "@/components/dashboard/disclosure-section";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FloatingScrollControls } from "@/components/dashboard/floating-scroll-controls";
import { RecommendationLearnWhy } from "@/components/dashboard/recommendation-learn-why";
import { RecommendationPrimaryAction } from "@/components/dashboard/recommendation-primary-action";
import { RecommendationStatusControls } from "@/components/dashboard/recommendation-status-controls";
import { ImplementationHelpDrawer } from "@/components/implementation/implementation-help-drawer";
import { ReportQualityNotice } from "@/components/reports/report-quality-notice";
import {
  CompactMetricCard,
  PageIntro,
  ReportSection,
  SectionTabs,
  SummaryStrip,
} from "@/components/dashboard/report-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  categoryLabel,
  compareAudits,
  formatDelta,
} from "@/lib/audits/audit-comparison";
import { canAccessFullActionPlan } from "@/lib/billing/entitlements";
import { contextualHelp } from "@/lib/education/help-content";
import { prisma } from "@/lib/prisma";
import { isWebsiteSeoCategory } from "@/lib/product/website-seo-scope";
import { buildAuditReportViewModel } from "@/lib/reports/audit-report-view-model";
import {
  actionableCategories,
  buildThirtyDayPlan,
  displayEffort,
  displayImpact,
  progressForRecommendations,
  recommendationCategoryLabels,
  recommendationStatusLabels,
  recommendationStatusStyles,
  sortRecommendations,
} from "@/lib/recommendations/utils";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type ActionPlanPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{
    category?: string;
    status?: string;
    week?: string;
    q?: string;
  }>;
};

type RecommendationView = {
  id: string;
  title: string;
  description: string;
  category: ScoreCategory;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  estimatedEffort: string | null;
  effort: string | null;
  expectedImpact: string | null;
  impact: string | null;
  dueDate: Date | null;
  sourceType: string | null;
  sourceUrl: string | null;
  evidence: unknown;
  implementationDrafts: Array<{
    id: string;
    status: ImplementationDraftStatus;
  }>;
};

const statuses = [
  RecommendationStatus.TODO,
  RecommendationStatus.IN_PROGRESS,
  RecommendationStatus.COMPLETED,
  RecommendationStatus.DISMISSED,
];

function implementationPrompt(recommendation: RecommendationView) {
  const title = recommendation.title.toLowerCase();
  if (/h1|headline/.test(title))
    return "Help me create a homepage headline for this business.";
  if (/meta description|search description/.test(title))
    return "Draft a shorter meta description using my saved business context.";
  if (/proof|testimonial|review/.test(title))
    return "Draft a customer proof section and a simple review-request message.";
  if (recommendation.category === ScoreCategory.SOCIAL)
    return "Help me refine this week's content plan for this recommendation.";
  if (recommendation.category === ScoreCategory.COMPETITORS)
    return `Help me implement this competitor recommendation: ${recommendation.title}`;
  return `Help me implement this recommendation for my business: ${recommendation.title}`;
}

function filterHref({
  businessId,
  status,
  category,
  week,
}: {
  businessId: string;
  status?: string;
  category?: string | null;
  week?: number;
}) {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (category) query.set("category", category);
  if (week) query.set("week", String(week));
  const suffix = query.toString();
  return `/dashboard/businesses/${businessId}/action-plan${suffix ? `?${suffix}` : ""}`;
}

function TaskBadges({
  recommendation,
}: {
  recommendation: RecommendationView;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold">
      <span className="rounded-full border border-border bg-card px-2.5 py-1">
        {recommendationCategoryLabels[recommendation.category]}
      </span>
      <span
        className={cn(
          "rounded-full border px-2.5 py-1",
          recommendationStatusStyles[recommendation.status],
        )}
      >
        {recommendationStatusLabels[recommendation.status]}
      </span>
      <span className="font-medium text-muted">
        {recommendation.priority.toLowerCase()} priority
        {" \u00b7 "}
        {displayImpact(recommendation)} impact
        {" \u00b7 "}
        {displayEffort(recommendation)} effort
      </span>
    </div>
  );
}

function TaskRow({
  businessId,
  businessName,
  recommendation,
  evidence,
  sourceUrl,
  embedded = false,
}: {
  businessId: string;
  businessName: string;
  recommendation: RecommendationView;
  evidence?: string;
  sourceUrl?: string | null;
  embedded?: boolean;
}) {
  const prompt = implementationPrompt(recommendation);
  const savedDraftCount = recommendation.implementationDrafts.filter(
    (draft) =>
      draft.status === ImplementationDraftStatus.SAVED ||
      draft.status === ImplementationDraftStatus.APPLIED,
  ).length;
  return (
    <article
      className={cn(
        embedded
          ? "py-5 first:pt-0 last:pb-0"
          : "rounded-lg border border-border bg-card p-4",
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <TaskBadges recommendation={recommendation} />
          <h3 className="mt-3 text-base font-semibold">
            {recommendation.title}
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            {recommendation.description}
          </p>
        </div>
        <div className="lg:justify-self-end">
          {recommendation.status === RecommendationStatus.IN_PROGRESS ? (
            <ImplementationHelpDrawer
              businessId={businessId}
              businessName={businessName}
              source={{
                kind: "recommendation",
                recommendationId: recommendation.id,
              }}
              recommendationId={recommendation.id}
              recommendationTitle={recommendation.title}
              evidence={evidence}
              initialSavedCount={recommendation.implementationDrafts.length}
              label="Continue action"
              preserveTriggerLabel
              triggerVariant="primary"
              triggerClassName="w-full sm:w-auto"
              analyticsEvent="task_continued"
              analyticsSurface="action_plan"
            />
          ) : (
            <RecommendationPrimaryAction
              businessId={businessId}
              recommendationId={recommendation.id}
              recommendationTitle={recommendation.title}
              status={recommendation.status}
              surface="action_plan"
              className="w-full sm:w-auto"
            />
          )}
        </div>
      </div>
      <DisclosureSection
        title="Details and options"
        description="Evidence, implementation help, and status controls."
        compact
        className="mt-4 border-dashed shadow-none"
      >
        <div className="space-y-4">
          {evidence ? (
            <div>
              <p className="text-sm font-semibold">Related audit evidence</p>
              <p className="mt-1 text-sm leading-6 text-muted">{evidence}</p>
            </div>
          ) : null}
          {recommendation.dueDate ? (
            <p className="text-sm text-muted">
              Due {recommendation.dueDate.toLocaleDateString()}
            </p>
          ) : null}
          {sourceUrl ? (
            <Link
              href={sourceUrl}
              className="text-sm font-medium text-accent hover:underline"
            >
              View comparison evidence
            </Link>
          ) : null}
          <RecommendationLearnWhy category={recommendation.category} />
          <div className="flex flex-wrap items-center gap-2">
            {recommendation.status !== RecommendationStatus.IN_PROGRESS ? (
              <ImplementationHelpDrawer
                businessId={businessId}
                businessName={businessName}
                source={{
                  kind: "recommendation",
                  recommendationId: recommendation.id,
                }}
                recommendationId={recommendation.id}
                recommendationTitle={recommendation.title}
                evidence={evidence}
                initialSavedCount={recommendation.implementationDrafts.length}
                label={
                  /canonical|robots|sitemap|alt text/i.test(
                    recommendation.title,
                  )
                    ? "Show implementation steps"
                    : "Generate implementation"
                }
                triggerVariant="secondary"
              />
            ) : null}
            <Link
              href={`/dashboard/businesses/${businessId}/chat?prompt=${encodeURIComponent(prompt)}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Ask Consultant
            </Link>
            <RecommendationStatusControls
              businessId={businessId}
              recommendationId={recommendation.id}
              status={recommendation.status}
              compact
              showPrimaryAction={false}
            />
          </div>
          {savedDraftCount > 0 ? (
            <p className="text-xs font-medium text-muted">
              {savedDraftCount} saved implementation draft
              {savedDraftCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </DisclosureSection>
    </article>
  );
}

function storedEvidenceSummary(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.reportEvidence === "string") {
      return record.reportEvidence;
    }
  }
  if (!Array.isArray(value)) return null;
  const first = value.find(
    (item) => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  ) as Record<string, unknown> | undefined;
  if (!first) return null;

  const label = typeof first.label === "string" ? first.label : "Comparison";
  const businessValue =
    typeof first.businessValue === "string" ? first.businessValue : null;
  const competitorValue =
    typeof first.competitorValue === "string" ? first.competitorValue : null;

  return businessValue && competitorValue
    ? `${label}: your business ${businessValue}; competitor ${competitorValue}.`
    : null;
}

function FreePreview({
  businessId,
  businessName,
  recommendations,
  progress,
}: {
  businessId: string;
  businessName: string;
  recommendations: RecommendationView[];
  progress: { completed: number; total: number; percent: number };
}) {
  return (
    <div className="space-y-6">
      <PageIntro
        title="Action Plan Preview"
        description="Free users can preview top priorities. Status tracking, filters, and the 30-day roadmap unlock with a paid package."
        icon={ListChecks}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <CompactMetricCard
          label="Progress"
          value={`${progress.percent}%`}
          detail={`${progress.completed} of ${progress.total} completed`}
        />
        <CompactMetricCard
          label="Preview items"
          value={Math.min(3, recommendations.length)}
        />
        <CompactMetricCard
          label="Total recommendations"
          value={recommendations.length}
        />
      </div>
      <ReportSection title="Top recommendations preview">
        <div className="space-y-3">
          {recommendations.slice(0, 3).map((recommendation) => (
            <div
              key={recommendation.id}
              className="rounded-lg border border-border bg-background p-4"
            >
              <TaskBadges recommendation={recommendation} />
              <p className="mt-3 font-semibold">{recommendation.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {recommendation.description}
              </p>
              <div className="mt-3">
                <ImplementationHelpDrawer
                  businessId={businessId}
                  businessName={businessName}
                  source={{
                    kind: "recommendation",
                    recommendationId: recommendation.id,
                  }}
                  recommendationId={recommendation.id}
                  recommendationTitle={recommendation.title}
                  initialSavedCount={recommendation.implementationDrafts.length}
                />
              </div>
            </div>
          ))}
        </div>
      </ReportSection>
      <LockedFeature
        title="Unlock the full Action Plan"
        description="Track status, focus the backlog, and use a practical 30-day plan between audits."
        requiredPlan={PlanType.ONE_TIME_AUDIT}
        preview={[
          "Focus This Week and one-week-at-a-time roadmap",
          "Status tabs, category filters, and compact task rows",
          "AI implementation help with editable prompts",
        ]}
      />
      <Link
        href={`/dashboard/businesses/${businessId}/overview`}
        className={buttonVariants({ variant: "secondary" })}
      >
        Back to overview
      </Link>
    </div>
  );
}

export default async function BusinessActionPlanPage({
  params,
  searchParams,
}: ActionPlanPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = searchParams ? await searchParams : {};
  const selectedCategory =
    actionableCategories.find((category) => category === query.category) ??
    null;
  const selectedStatus = statuses.includes(query.status as RecommendationStatus)
    ? (query.status as RecommendationStatus)
    : RecommendationStatus.TODO;
  const selectedWeek = Math.min(4, Math.max(1, Number(query.week) || 1));
  const searchTerm = query.q?.trim().toLowerCase() ?? "";
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: user.id },
    include: {
      audits: {
        where: { status: AuditStatus.COMPLETED },
        orderBy: { createdAt: "desc" },
        take: 2,
        include: {
          scores: true,
          findings: { orderBy: { createdAt: "asc" } },
          recommendations: {
            include: {
              implementationDrafts: {
                where: { status: { not: "ARCHIVED" } },
                select: { id: true, status: true },
              },
            },
          },
        },
      },
    },
  });

  if (!business) notFound();

  const audit = business.audits.at(0);
  const previousAudit = business.audits.at(1);
  if (!audit || audit.recommendations.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="size-6" />}
        title="No action plan yet"
        description="Run a completed audit to turn recommendations into trackable action items."
        action={
          <Link
            href={`/dashboard/businesses/${business.id}/audit/run`}
            className={buttonVariants({ variant: "primary" })}
          >
            Run Audit
            <ArrowRight className="size-4" />
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
  if (report.reportIntegrity?.status === "NEEDS_REVIEW") {
    return <ReportQualityNotice businessId={business.id} />;
  }
  const reportRecommendationById = new Map(
    report.recommendations.all.map((recommendation) => [
      recommendation.id,
      recommendation,
    ]),
  );
  const canonicalRecommendations = report.recommendations.all.flatMap(
    (recommendation) => {
      const stored = audit.recommendations.find(
        (item) => item.id === recommendation.id,
      );
      return stored
        ? [
            {
              ...stored,
              title: recommendation.title,
              description: recommendation.description,
              category: recommendation.category,
              priority: recommendation.priority,
            },
          ]
        : [];
    },
  );
  const recommendations = sortRecommendations(
    canonicalRecommendations && canonicalRecommendations.length > 0
      ? canonicalRecommendations
      : audit.recommendations,
  ).filter((recommendation) => isWebsiteSeoCategory(recommendation.category));
  if (recommendations.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="size-6" />}
        title="No Website or SEO actions in this report"
        description="Run a new website audit to create a focused implementation plan from current evidence."
        action={
          <Link
            href={`/dashboard/businesses/${business.id}/audit/run`}
            className={buttonVariants({ variant: "primary" })}
          >
            Run website audit
            <ArrowRight className="size-4" />
          </Link>
        }
      />
    );
  }
  const progress = progressForRecommendations(recommendations);
  const actionPlanCheck = await canAccessFullActionPlan(user.id);
  if (!actionPlanCheck.allowed) {
    return (
      <FreePreview
        businessId={business.id}
        businessName={business.name}
        recommendations={recommendations}
        progress={progress}
      />
    );
  }

  const counts = Object.fromEntries(
    statuses.map((status) => [
      status,
      recommendations.filter(
        (recommendation) => recommendation.status === status,
      ).length,
    ]),
  ) as Record<RecommendationStatus, number>;
  const activeCount = counts.TODO + counts.IN_PROGRESS;
  const focusItems = recommendations
    .filter(
      (recommendation) =>
        recommendation.status === RecommendationStatus.TODO ||
        recommendation.status === RecommendationStatus.IN_PROGRESS,
    )
    .slice(0, 3);
  const filteredRecommendations = recommendations.filter(
    (recommendation) =>
      recommendation.status === selectedStatus &&
      (!selectedCategory || recommendation.category === selectedCategory) &&
      (!searchTerm ||
        `${recommendation.title} ${recommendation.description}`
          .toLowerCase()
          .includes(searchTerm)),
  );
  const thirtyDayPlan = buildThirtyDayPlan(recommendations);
  const currentWeek = thirtyDayPlan[selectedWeek - 1];
  const comparison =
    report?.progress.comparison ??
    compareAudits({ currentAudit: audit, previousAudit });

  return (
    <div className="space-y-6">
      <PageIntro
        title="Action Plan"
        description="Work through prioritized Website and SEO improvements, use implementation help, and verify the result in your next audit."
        icon={ListChecks}
      />

      <ContextualHelpCard {...contextualHelp.actionPlan} />

      <ReportSection
        title="Next up"
        description="Start with the first open action. The next two stay visible without competing for attention."
      >
        {focusItems.length > 0 ? (
          <div className="divide-y divide-border">
            {focusItems.map((recommendation) => (
              <TaskRow
                key={recommendation.id}
                businessId={business.id}
                businessName={business.name}
                recommendation={recommendation}
                evidence={
                  reportRecommendationById.get(recommendation.id)
                    ?.evidenceSummary ??
                  storedEvidenceSummary(recommendation.evidence) ??
                  undefined
                }
                sourceUrl={
                  reportRecommendationById.get(recommendation.id)?.sourceUrl ??
                  recommendation.sourceUrl ??
                  undefined
                }
                embedded
              />
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <ListChecks
              className="mt-0.5 size-5 shrink-0 text-accent"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">All current actions are resolved</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                Review completed work or run another audit when the business is
                ready for a fresh set of priorities.
              </p>
            </div>
          </div>
        )}
      </ReportSection>

      <ReportSection
        title="Your progress"
        description={
          progress.completed > 0 || counts.IN_PROGRESS > 0
            ? `${progress.completed} of ${progress.total} actions completed.`
            : "Progress becomes useful after you start the first action."
        }
      >
        {progress.completed > 0 || counts.IN_PROGRESS > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-semibold">{progress.percent}%</p>
                <p className="mt-1 text-sm text-muted">
                  {counts.IN_PROGRESS} in progress
                  {" \u00b7 "}
                  {activeCount} open
                </p>
              </div>
              <Link
                href={`/dashboard/businesses/${business.id}/history`}
                className="text-sm font-medium text-accent hover:underline"
              >
                View audit history
              </Link>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-foreground/10"
              role="progressbar"
              aria-label="Action plan progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <ListChecks
              className="mt-0.5 size-5 shrink-0 text-accent"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">Start your first action</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                The completion rate and active work will appear here once you
                begin.
              </p>
            </div>
          </div>
        )}

        {comparison.previousAuditId ? (
          comparison.methodologyChanged ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-sm font-semibold">Comparison limited</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                The scoring method changed, so the score difference is not a
                reliable measure of business progress.
              </p>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-medium text-accent">
                  Technical comparison details
                </summary>
                <p className="mt-2 leading-6 text-muted">
                  {comparison.comparisonNote}
                </p>
              </details>
            </div>
          ) : (
            <SummaryStrip className="mt-5 border-0 bg-foreground/[0.035]">
              <strong>
                Latest audit {formatDelta(comparison.overallScoreChange)}
              </strong>
              {comparison.improvedCategories.slice(0, 2).map((item) => (
                <span
                  key={item.category}
                  className="text-teal-700 dark:text-teal-200"
                >
                  {categoryLabel(item.category)} {formatDelta(item.delta)}
                </span>
              ))}
              {comparison.declinedCategories.slice(0, 1).map((item) => (
                <span
                  key={item.category}
                  className="text-rose-700 dark:text-rose-200"
                >
                  {categoryLabel(item.category)} {formatDelta(item.delta)}
                </span>
              ))}
            </SummaryStrip>
          )
        ) : null}
      </ReportSection>

      <ReportSection
        title="30-Day Roadmap"
        description="Open one week at a time to keep the plan usable on desktop and mobile."
      >
        <SectionTabs
          items={thirtyDayPlan.map((week, index) => ({
            label: week.week,
            href: filterHref({
              businessId: business.id,
              status: selectedStatus,
              category: selectedCategory,
              week: index + 1,
            }),
            active: selectedWeek === index + 1,
            count: week.items.length,
          }))}
        />
        <div className="mt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-accent">
                {currentWeek.week}
              </p>
              <h3 className="mt-1 font-semibold">{currentWeek.title}</h3>
              <p className="mt-1 text-sm text-muted">
                {currentWeek.description}
              </p>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">
              {
                currentWeek.items.filter(
                  (item) => item.status === RecommendationStatus.COMPLETED,
                ).length
              }{" "}
              of {currentWeek.items.length} complete
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {currentWeek.items.length > 0 ? (
              currentWeek.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {recommendationCategoryLabels[item.category]}
                      {" \u00b7 "}
                      {displayEffort(item)} effort
                      {" \u00b7 "}
                      {displayImpact(item)} impact
                    </p>
                  </div>
                  <span
                    className={cn(
                      "w-fit rounded-full border px-2.5 py-1 text-xs font-semibold",
                      recommendationStatusStyles[item.status],
                    )}
                  >
                    {recommendationStatusLabels[item.status]}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">
                No open recommendations are assigned to this week.
              </p>
            )}
          </div>
        </div>
      </ReportSection>

      <DisclosureSection
        title="All actions"
        description={`${recommendations.length} recommendations available. Open the backlog to search or filter them.`}
        defaultOpen={Boolean(query.q || query.category || query.status)}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-end">
            <form className="flex gap-2">
              <input type="hidden" name="status" value={selectedStatus} />
              {selectedCategory ? (
                <input type="hidden" name="category" value={selectedCategory} />
              ) : null}
              <input type="hidden" name="week" value={selectedWeek} />
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" />
                <Input
                  name="q"
                  defaultValue={query.q}
                  placeholder="Search actions"
                  className="pl-9"
                  aria-label="Search actions"
                />
              </div>
              <button
                type="submit"
                className={buttonVariants({ variant: "secondary" })}
              >
                Search
              </button>
            </form>
          </div>

          <SectionTabs
            items={statuses.map((status) => ({
              label: recommendationStatusLabels[status],
              href: filterHref({
                businessId: business.id,
                status,
                category: selectedCategory,
                week: selectedWeek,
              }),
              active: selectedStatus === status,
              count: counts[status],
            }))}
          />

          <div className="flex flex-wrap gap-2">
            <FilterLink
              href={filterHref({
                businessId: business.id,
                status: selectedStatus,
                week: selectedWeek,
              })}
              active={!selectedCategory}
            >
              All categories
            </FilterLink>
            {actionableCategories.map((category) => (
              <FilterLink
                key={category}
                href={filterHref({
                  businessId: business.id,
                  status: selectedStatus,
                  category,
                  week: selectedWeek,
                })}
                active={selectedCategory === category}
              >
                {recommendationCategoryLabels[category]}
              </FilterLink>
            ))}
          </div>

          <div className="space-y-3">
            {filteredRecommendations.length > 0 ? (
              filteredRecommendations.map((recommendation) => (
                <TaskRow
                  key={recommendation.id}
                  businessId={business.id}
                  businessName={business.name}
                  recommendation={recommendation}
                  evidence={
                    reportRecommendationById.get(recommendation.id)
                      ?.evidenceSummary ??
                    storedEvidenceSummary(recommendation.evidence) ??
                    undefined
                  }
                  sourceUrl={
                    reportRecommendationById.get(recommendation.id)?.sourceUrl ??
                    recommendation.sourceUrl ??
                    undefined
                  }
                />
              ))
            ) : (
              <Card className="p-5 text-sm text-muted">
                No {recommendationStatusLabels[selectedStatus].toLowerCase()}{" "}
                actions match the current filters.
              </Card>
            )}
          </div>
        </div>
      </DisclosureSection>

      <FloatingScrollControls />
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        active
          ? "bg-foreground text-background dark:bg-accent dark:text-accent-foreground"
          : "bg-card text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

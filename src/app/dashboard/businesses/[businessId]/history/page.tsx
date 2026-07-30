import { AuditStatus, PlanType, RecommendationStatus } from "@prisma/client";
import { ArrowRight, FileClock, History } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LockedFeature } from "@/components/billing/locked-feature";
import { ContextualHelpCard } from "@/components/dashboard/contextual-help-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FloatingScrollControls } from "@/components/dashboard/floating-scroll-controls";
import { PageIntro } from "@/components/dashboard/report-ui";
import { buttonVariants } from "@/components/ui/button";
import { compareAudits, formatDelta } from "@/lib/audits/audit-comparison";
import { canUseProgressComparison } from "@/lib/billing/entitlements";
import { contextualHelp } from "@/lib/education/help-content";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type BusinessHistoryPageProps = {
  params: Promise<{ businessId: string }>;
};

const statusStyles: Record<AuditStatus, string> = {
  PENDING:
    "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100",
  QUEUED:
    "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100",
  RUNNING:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100",
  COMPLETED:
    "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100",
  FAILED:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
};

const statusLabels: Record<AuditStatus, string> = {
  PENDING: "Preparing",
  QUEUED: "Waiting",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Needs retry",
};

function deltaStyles(delta: number | null) {
  if (delta === null) {
    return "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100";
  }

  if (delta > 0) {
    return "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100";
  }

  if (delta < 0) {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100";
  }

  return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100";
}

export default async function BusinessHistoryPage({
  params,
}: BusinessHistoryPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    include: {
      audits: {
        orderBy: {
          createdAt: "desc",
        },
        include: {
          scores: true,
          findings: {
            orderBy: {
              createdAt: "asc",
            },
          },
          _count: {
            select: {
              findings: true,
              recommendations: true,
            },
          },
          recommendations: {
            select: {
              id: true,
              title: true,
              description: true,
              category: true,
              status: true,
              completedAt: true,
            },
          },
        },
      },
    },
  });

  if (!business) {
    notFound();
  }

  if (business.audits.length === 0) {
    return (
      <div className="space-y-6">
        <PageIntro
          eyebrow="Plan"
          title="Audit history"
          description="Review saved reports and meaningful changes between comparable audits."
          icon={History}
        />
        <EmptyState
          compact
          icon={<History className="size-6" />}
          title="No audit history yet"
          description="Confirm profiles and run your first audit to create a saved report."
          action={
            <Link
              href={`/dashboard/businesses/${business.id}/audit/run`}
              data-customer-event="empty_state_action_clicked"
              data-customer-surface="empty_state"
              className={buttonVariants({ variant: "primary" })}
            >
              Run first audit
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        />
      </div>
    );
  }

  const progressComparisonCheck = await canUseProgressComparison(user.id);

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Plan"
        title="Audit history"
        description="Review saved reports, action progress, and changes that can be compared reliably."
        icon={History}
        actions={
          <Link
            href={`/dashboard/businesses/${business.id}/audit/run`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Run audit
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        }
      />
      <ContextualHelpCard {...contextualHelp.history} />

      {!progressComparisonCheck.allowed ? (
        <LockedFeature
          title="Progress comparison is locked"
          description="Audit history still shows saved reports, scores, and recommendation counts. Upgrade to see what improved, declined, and changed between completed audits."
          requiredPlan={PlanType.ONE_TIME_AUDIT}
          preview={[
            "Overall score change between audits",
            "Improved and declined categories",
            "Completed recommendations since the previous audit",
          ]}
        />
      ) : null}

      <section aria-labelledby="saved-audits-title">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <FileClock className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="saved-audits-title" className="text-lg font-semibold">
              Saved audits
            </h2>
            <p className="text-sm text-muted">
              Newest report first.
            </p>
          </div>
        </div>
        <div className="divide-y divide-border rounded-lg border border-border bg-card px-5">
          {business.audits.map((audit, index) => {
            const overallScore =
              audit.overallScore ??
              audit.scores.find((score) => score.category === "OVERALL")
                ?.score ??
              0;
            const isComplete = audit.status === AuditStatus.COMPLETED;
            const previousCompletedAudit = isComplete
              ? business.audits
                  .slice(index + 1)
                  .find(
                    (candidate) =>
                      candidate.status === AuditStatus.COMPLETED,
                  )
              : null;
            const comparison =
              isComplete && previousCompletedAudit
                ? compareAudits({
                    currentAudit: audit,
                    previousAudit: previousCompletedAudit,
                  })
                : null;
            const auditHref = isComplete
              ? `/dashboard/businesses/${business.id}/overview`
              : `/dashboard/businesses/${business.id}/audit/run?auditId=${audit.id}`;
            const auditActionLabel =
              audit.status === AuditStatus.FAILED
                ? "Retry audit"
                : isComplete
                  ? "View current overview"
                  : "View run";
            const completedRecommendations = audit.recommendations.filter(
              (recommendation) =>
                recommendation.status === RecommendationStatus.COMPLETED,
            ).length;

            return (
              <div
                key={audit.id}
                className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-4">
                  <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-card">
                    <span className="text-xl font-semibold">{overallScore}</span>
                    <span className="text-xs text-muted">score</span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {audit.createdAt.toLocaleDateString()}
                      </p>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-semibold",
                          statusStyles[audit.status],
                        )}
                      >
                        {statusLabels[audit.status]}
                      </span>
                      {isComplete && progressComparisonCheck.allowed ? (
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-semibold",
                            comparison && !comparison.methodologyChanged
                              ? deltaStyles(comparison.overallScoreChange)
                              : "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100",
                          )}
                        >
                          {comparison?.methodologyChanged
                            ? "Comparison limited"
                            : comparison
                            ? `${formatDelta(
                                comparison.overallScoreChange,
                              )} change`
                            : "First audit"}
                        </span>
                      ) : isComplete ? (
                        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted">
                          progress locked
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {audit._count.findings} findings -{" "}
                      {completedRecommendations} of{" "}
                      {audit._count.recommendations} recommendations completed
                    </p>
                    {comparison?.methodologyChanged ? (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer font-medium text-accent">
                          Why comparison is limited
                        </summary>
                        <p className="mt-1 max-w-2xl leading-6 text-muted">
                          The scoring method changed between these audits, so
                          the score difference does not necessarily represent a
                          business improvement or decline.
                        </p>
                      </details>
                    ) : null}
                  </div>
                </div>
                <Link
                  href={auditHref}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  {auditActionLabel}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <FloatingScrollControls />
    </div>
  );
}

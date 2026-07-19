import {
  AuditStatus,
  CompetitorStatus,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";
import {
  AlertTriangle,
  ArrowRight,
  Download,
  Globe2,
  ListChecks,
  MessageSquareText,
  MonitorPlay,
  RefreshCw,
  Share2,
  Star,
  Swords,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContextualHelpCard } from "@/components/dashboard/contextual-help-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FloatingScrollControls } from "@/components/dashboard/floating-scroll-controls";
import { RecommendationLearnWhy } from "@/components/dashboard/recommendation-learn-why";
import { TaskActionRail } from "@/components/dashboard/task-action-rail";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import {
  CompactMetricCard,
  DataSourceNotice,
  PageIntro,
  ReportSection,
  SummaryStrip,
} from "@/components/dashboard/report-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  categoryLabel,
  formatDelta,
} from "@/lib/audits/audit-comparison";
import { categoryScore } from "@/lib/audits/audit-applicability";
import {
  canUsePdfExport,
  canUsePresentationMode,
  canUseProgressComparison,
} from "@/lib/billing/entitlements";
import { contextualHelp } from "@/lib/education/help-content";
import { trustedBusinessAdvantages } from "@/lib/competitors/competitor-types";
import {
  businessGoalLabels,
  getSuggestedQuestionsForGoals,
} from "@/lib/goals";
import { prisma } from "@/lib/prisma";
import { deriveBusinessSetupProgress } from "@/lib/onboarding/business-setup";
import { buildAuditReportViewModel } from "@/lib/reports/audit-report-view-model";
import {
  progressForRecommendations,
  recommendationCategoryLabels,
  recommendationPriorityStyles,
  recommendationStatusLabels,
  recommendationStatusStyles,
  sortRecommendations,
} from "@/lib/recommendations/utils";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type BusinessOverviewPageProps = {
  params: Promise<{ businessId: string }>;
};

const scoreLabels: Record<ScoreCategory, string> = {
  OVERALL: "Overall",
  WEBSITE: "Website",
  SEO: "SEO",
  BRANDING: "Branding",
  SOCIAL: "Social",
  REVIEWS: "Reviews",
  COMPETITORS: "Competitors",
};

function healthFor(score: number) {
  if (score >= 85) return { label: "Excellent", tone: "good" as const };
  if (score >= 70) return { label: "Good", tone: "good" as const };
  if (score >= 50) return { label: "Fair", tone: "warning" as const };
  return { label: "Needs attention", tone: "danger" as const };
}

function scoreColor(score: number) {
  if (score >= 78) return "text-teal-700 dark:text-teal-200";
  if (score >= 60) return "text-blue-700 dark:text-blue-200";
  if (score >= 45) return "text-amber-700 dark:text-amber-200";
  return "text-rose-700 dark:text-rose-200";
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      className="flex size-32 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(var(--accent) ${score * 3.6}deg, color-mix(in srgb, var(--border) 78%, transparent) 0deg)`,
      }}
    >
      <div className="flex size-24 flex-col items-center justify-center rounded-full bg-card shadow-sm">
        <span className="text-3xl font-semibold">{score}</span>
        <span className="text-xs text-muted">/100</span>
      </div>
    </div>
  );
}

export default async function BusinessOverviewPage({
  params,
}: BusinessOverviewPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
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
                select: { id: true },
              },
            },
          },
        },
      },
      profiles: {
        select: {
          platform: true,
          status: true,
          displayName: true,
          url: true,
          handle: true,
        },
      },
      googleBusinessProfiles: {
        where: { status: { not: "removed" } },
        orderBy: [{ status: "asc" }, { matchConfidence: "desc" }],
      },
      competitors: {
        where: { status: CompetitorStatus.ACTIVE },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          discoveredProfiles: {
            select: { platform: true, label: true, status: true },
          },
        },
      },
    },
  });

  if (!business) notFound();

  const setupProgress = deriveBusinessSetupProgress(business);
  const audit = business.audits.at(0);
  if (!audit) {
    return (
      <div className="space-y-6">
        <SetupChecklist
          businessId={business.id}
          progress={setupProgress}
          dismissed={Boolean(business.onboardingDismissedAt)}
        />
        <EmptyState
          icon={<AlertTriangle className="size-6" />}
          title="No audit generated yet"
          description="Run your first audit to receive scores, findings, and an action plan."
          action={
            <Link
              href={`/dashboard/businesses/${business.id}/setup`}
              className={buttonVariants({ variant: "primary" })}
            >
              Continue setup
              <ArrowRight className="size-4" />
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
  const comparison = report.progress.comparison;
  const website = report.website;
  const websiteCrawl = report.websiteCrawl;
  const social = report.social;
  const assessment = report.assessment;
  const competitorIntelligence = report.competitors.intelligence;
  const reportBusinessAdvantages = competitorIntelligence
    ? trustedBusinessAdvantages(competitorIntelligence.comparison)
    : [];
  const hasAnalyzedCompetitors =
    (competitorIntelligence?.comparison.analyzedCompetitorCount ?? 0) > 0;
  const reviews = report.reviews;
  const overallScore = report.audit.overallScore;
  const health = healthFor(overallScore);
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
  const recommendations =
    canonicalRecommendations.length > 0
      ? canonicalRecommendations
      : sortRecommendations(audit.recommendations);
  const activeRecommendations = recommendations.filter(
    (recommendation) =>
      recommendation.status !== RecommendationStatus.COMPLETED &&
      recommendation.status !== RecommendationStatus.DISMISSED,
  );
  const nextMoves = (
    activeRecommendations.length >= 3 ? activeRecommendations : recommendations
  ).slice(0, 3);
  const progress = progressForRecommendations(audit.recommendations);
  const confirmedSocial = social.confirmedPlatforms;
  const confirmedCompetitorProfiles =
    report.competitors.profileCounts.confirmedPublicProfiles;
  const scoreBreakdown = report.scores.map(
    (item) => [item.category, item.score] as const,
  );
  const executiveSummary = report.audit.executiveSummary;
  const suggestedQuestions = getSuggestedQuestionsForGoals(
    business.goals,
    business.primaryGoal,
    business.competitors.map((competitor) => competitor.name),
    social.score,
    reviews.score,
    reviews.googleBusinessStatus,
    {
      description: business.description,
      targetAudience: business.targetAudience,
      businessType: business.businessType,
      primaryConversionGoal: business.primaryConversionGoal,
      contextConfirmedAt: business.contextConfirmedAt,
    },
  ).slice(0, 5);
  const [pdfCheck, presentationCheck, comparisonCheck] = await Promise.all([
    canUsePdfExport(user.id),
    canUsePresentationMode(user.id),
    canUseProgressComparison(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Growth Audit"
        title="Your decision-ready report"
        description={`Completed ${audit.createdAt.toLocaleDateString()}. Start with the next three moves, then open a detailed analysis when you need the evidence.`}
        actions={
          <>
            <Link
              href={`/dashboard/businesses/${business.id}/audit/run`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <RefreshCw className="size-4" />
              Run again
            </Link>
            <Link
              href={
                presentationCheck.allowed
                  ? `/dashboard/businesses/${business.id}/audit/${audit.id}/present`
                  : "/pricing"
              }
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <MonitorPlay className="size-4" />
              {presentationCheck.allowed ? "Present" : "Unlock presentation"}
            </Link>
            <Link
              href={
                pdfCheck.allowed
                  ? `/dashboard/businesses/${business.id}/audit/${audit.id}/pdf`
                  : "/pricing"
              }
              prefetch={false}
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              <Download className="size-4" />
              {pdfCheck.allowed ? "Download PDF" : "Unlock PDF"}
            </Link>
          </>
        }
      />

      <ContextualHelpCard {...contextualHelp.overview} />

      {assessment.mode === "social_first" ? (
        <DataSourceNotice>
          <strong>Social-first assessment.</strong> This report used confirmed
          and pending social profiles, Business Context, goals, reviews, and
          competitors. Website and SEO were excluded from the overall score
          because no confirmed website was provided. Add one later to unlock
          those analyses.
        </DataSourceNotice>
      ) : null}

      {report.dataNotes.length > 0 ? (
        <DataSourceNotice>
          <strong>Conflicting evidence to review.</strong>{" "}
          {report.dataNotes.join(" ")}
        </DataSourceNotice>
      ) : null}

      <SetupChecklist
        businessId={business.id}
        progress={setupProgress}
        dismissed={Boolean(business.onboardingDismissedAt)}
      />

      <Card className="p-5">
        <div className="grid gap-5 lg:grid-cols-[auto_1fr] lg:items-center">
          <ScoreRing score={overallScore} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold">{health.label}</h3>
              {business.primaryGoal ? (
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted">
                  Goal: {businessGoalLabels[business.primaryGoal]}
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              {executiveSummary}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {scoreBreakdown.map(([category, score]) => {
                const notConfigured =
                  category === ScoreCategory.COMPETITORS &&
                  business.competitors.length === 0;
                const savedNotAnalyzed =
                  category === ScoreCategory.COMPETITORS &&
                  business.competitors.length > 0 &&
                  !hasAnalyzedCompetitors;
                const unavailable = score === null;
                return (
                  <div key={category} className="rounded-lg bg-foreground/[0.035] p-3">
                    <p className="text-xs text-muted">{scoreLabels[category]}</p>
                    <p
                      className={cn(
                        "mt-1 font-semibold",
                        unavailable || notConfigured || savedNotAnalyzed
                          ? "text-muted"
                          : scoreColor(score),
                      )}
                    >
                      {notConfigured
                        ? "Not configured"
                        : savedNotAnalyzed
                          ? "Not analyzed"
                          : unavailable
                            ? "Not provided"
                            : score}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <ReportSection
        title="Your next three moves"
        description="The highest-priority open work, ordered by impact, effort, goals, and audit priority."
        action={
          <Link
            href={`/dashboard/businesses/${business.id}/action-plan`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Full action plan
            <ArrowRight className="size-4" />
          </Link>
        }
      >
        <div className="divide-y divide-border">
          {nextMoves.map((recommendation, index) => (
            <article
              key={recommendation.id}
              className="grid gap-4 py-5 first:pt-0 last:pb-0 lg:grid-cols-[2rem_minmax(0,1fr)_10rem] lg:items-start lg:gap-x-8"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-sm font-semibold text-accent">
                {index + 1}
              </span>
              <div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-semibold",
                      recommendationPriorityStyles[recommendation.priority],
                    )}
                  >
                    {recommendation.priority.toLowerCase()} priority
                  </span>
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold">
                    {recommendationCategoryLabels[recommendation.category]}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-semibold",
                      recommendationStatusStyles[recommendation.status],
                    )}
                  >
                    {recommendationStatusLabels[recommendation.status]}
                  </span>
                </div>
                <h4 className="mt-3 font-semibold">{recommendation.title}</h4>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {recommendation.description}
                </p>
                <RecommendationLearnWhy category={recommendation.category} />
              </div>
              <TaskActionRail
                businessId={business.id}
                businessName={business.name}
                recommendationId={recommendation.id}
                recommendationTitle={recommendation.title}
                status={recommendation.status}
                evidence={audit.findings.find((finding) => finding.category === recommendation.category)?.description}
                initialSavedCount={recommendation.implementationDrafts.length}
                implementationLabel={/canonical|robots|sitemap|alt text/i.test(recommendation.title) ? "Show Implementation Steps" : "Generate Fix"}
              />
            </article>
          ))}
        </div>
      </ReportSection>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <ReportSection title="Action progress" description={`${progress.completed} of ${progress.total} recommendations completed.`}>
          <div className="flex items-end justify-between gap-4">
            <span className="text-3xl font-semibold">{progress.percent}%</span>
            <ListChecks className="size-5 text-accent" />
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </ReportSection>

        <ReportSection title="Since your last audit">
          {comparison.previousAuditId && comparisonCheck.allowed ? (
            <div className="space-y-3">
              <SummaryStrip className="border-0 bg-foreground/[0.035]">
                <strong>Overall {formatDelta(comparison.overallScoreChange)}</strong>
                {comparison.improvedCategories.slice(0, 2).map((item) => (
                  <span key={item.category} className="text-teal-700 dark:text-teal-200">
                    {categoryLabel(item.category)} {formatDelta(item.delta)}
                  </span>
                ))}
                {comparison.declinedCategories.slice(0, 1).map((item) => (
                  <span key={item.category} className="text-rose-700 dark:text-rose-200">
                    {categoryLabel(item.category)} {formatDelta(item.delta)}
                  </span>
                ))}
              </SummaryStrip>
              <p className="text-sm leading-6 text-muted">{comparison.summary}</p>
              {comparison.comparisonNote ? (
                <p className="rounded-md border border-border bg-foreground/[0.025] p-3 text-xs leading-5 text-muted">
                  {comparison.comparisonNote}
                </p>
              ) : null}
            </div>
          ) : comparison.previousAuditId ? (
            <Link href="/pricing" className="text-sm font-medium text-accent hover:underline">
              Unlock progress comparison
            </Link>
          ) : (
            <p className="text-sm leading-6 text-muted">
              This is your first audit. Future audits will show progress over time.
            </p>
          )}
        </ReportSection>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <ReportSection
          title="Website + SEO"
          description="Clarity, conversion, search basics, and crawl coverage."
          action={<Globe2 className="size-5 text-accent" />}
        >
          {assessment.hasWebsite ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <CompactMetricCard
                  label="Website"
                  value={categoryScore(audit.scores, ScoreCategory.WEBSITE) ?? "Not scored"}
                />
                <CompactMetricCard
                  label="SEO"
                  value={categoryScore(audit.scores, ScoreCategory.SEO) ?? "Not scored"}
                />
                <CompactMetricCard
                  label="Pages scanned"
                  value={websiteCrawl?.pagesScanned ?? 1}
                />
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">
                {websiteCrawl
                  ? `${websiteCrawl.pagesMissingMetaDescription} pages need descriptions and ${websiteCrawl.pagesWithNoH1 + websiteCrawl.pagesWithMultipleH1} have headline issues.`
                  : website?.pageTitle
                    ? `Homepage title found: ${website.pageTitle}`
                    : "Open the detailed analysis for homepage evidence."}
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-background p-4">
              <p className="font-semibold">Website and SEO: Not provided</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                These categories were not counted as failures and were excluded
                from the overall score. Adding a confirmed website later will
                unlock homepage, crawl, conversion, and SEO analysis.
              </p>
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Link href={`/dashboard/businesses/${business.id}/website`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Website
            </Link>
            <Link href={`/dashboard/businesses/${business.id}/seo`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              SEO
            </Link>
          </div>
        </ReportSection>

        <ReportSection
          title="Reviews + trust"
          description="Public credibility and review-channel readiness."
          action={<Star className="size-5 text-accent" />}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <CompactMetricCard label="Score" value={reviews.score} />
            <CompactMetricCard label="Google Business" value={reviews.googleBusinessStatus === "confirmed" ? "Confirmed" : reviews.googleBusinessStatus === "pending" ? "Review" : "Missing"} />
            <CompactMetricCard label="Presence" value={reviews.reviewPresenceLevel} />
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">
            {reviews.reviewScoreExplanation}
          </p>
          <Link href={`/dashboard/businesses/${business.id}/reviews`} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}>
            View reviews
            <ArrowRight className="size-4" />
          </Link>
        </ReportSection>

        <ReportSection
          title="Social presence"
          description="Confirmed channel coverage and strategy readiness."
          action={<Share2 className="size-5 text-accent" />}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <CompactMetricCard label="Score" value={social?.score ?? categoryScore(audit.scores, ScoreCategory.SOCIAL) ?? "Not scored"} />
            <CompactMetricCard label="Confirmed" value={confirmedSocial.length} />
            <CompactMetricCard label="Coverage" value={social?.platformCoverageLevel ?? "Not set"} />
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">
            {confirmedSocial.length > 0
              ? `Confirmed channels: ${confirmedSocial.slice(0, 4).join(", ")}.`
              : "Confirm or add a social profile before relying on channel recommendations."}
          </p>
          <Link href={`/dashboard/businesses/${business.id}/social`} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}>
            View social
            <ArrowRight className="size-4" />
          </Link>
        </ReportSection>

        <ReportSection
          title="Competitor intelligence"
          description="A compact preview of the latest evidence-based public comparison."
          action={<Swords className="size-5 text-accent" />}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <CompactMetricCard label="Active competitors" value={business.competitors.length} />
            <CompactMetricCard
              label="Analyzed"
              value={competitorIntelligence?.comparison.analyzedCompetitorCount ?? 0}
            />
            <CompactMetricCard
              label="Confirmed public profiles, including website"
              value={confirmedCompetitorProfiles}
              detail={`${report.competitors.profileCounts.confirmedSocialProfiles} confirmed social; ${report.competitors.profileCounts.pendingSocialProfiles} pending social`}
            />
          </div>
          {business.competitors.length === 0 ? (
            <p className="mt-4 text-sm leading-6 text-muted">
              No competitors configured. Add a relevant competitor when you want a public side-by-side comparison.
            </p>
          ) : !hasAnalyzedCompetitors ? (
            <p className="mt-4 text-sm leading-6 text-muted">
              {business.competitors.length} competitor{business.competitors.length === 1 ? " is" : "s are"} saved. Full analysis has not run in this audit yet.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-semibold uppercase text-muted">Strongest advantage</p>
                <p className="mt-2 text-sm font-semibold">
                  {reportBusinessAdvantages.at(0)?.title ?? "No confirmed advantage yet"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-semibold uppercase text-muted">Highest-priority opportunity</p>
                <p className="mt-2 text-sm font-semibold">
                  {competitorIntelligence?.comparison.opportunities.at(0)?.title ?? "More comparable data needed"}
                </p>
              </div>
              <p className="text-xs text-muted md:col-span-2">
                Last updated {new Date(competitorIntelligence?.generatedAt ?? audit.createdAt).toLocaleDateString()}.
              </p>
            </div>
          )}
          <Link href={`/dashboard/businesses/${business.id}/competitors`} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}>
            {hasAnalyzedCompetitors ? "View comparison" : "Manage competitors"}
            <ArrowRight className="size-4" />
          </Link>
        </ReportSection>
      </section>

      <Card className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <MessageSquareText className="size-5" />
            </span>
            <div>
              <h3 className="font-semibold">Continue with your AI Consultant</h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Turn this report into a focused decision, draft, or implementation plan.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.slice(0, 3).map((question) => (
              <Link
                key={question}
                href={`/dashboard/businesses/${business.id}/chat?prompt=${encodeURIComponent(question)}`}
                className="rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-foreground"
              >
                {question}
              </Link>
            ))}
            <Link href={`/dashboard/businesses/${business.id}/chat`} className={buttonVariants({ variant: "primary", size: "sm" })}>
              <MessageSquareText className="size-4" />
              Open consultant
            </Link>
          </div>
        </div>
      </Card>

      <FloatingScrollControls />
    </div>
  );
}

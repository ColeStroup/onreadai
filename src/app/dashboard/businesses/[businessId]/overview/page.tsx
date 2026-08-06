import {
  AuditStatus,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Globe2,
  ListChecks,
  MessageSquareText,
  MonitorPlay,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Star,
  Swords,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerEventImpression } from "@/components/analytics/customer-event-impression";
import { ContextualHelpCard } from "@/components/dashboard/contextual-help-card";
import { DisclosureSection } from "@/components/dashboard/disclosure-section";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FloatingScrollControls } from "@/components/dashboard/floating-scroll-controls";
import { RecommendationPrimaryAction } from "@/components/dashboard/recommendation-primary-action";
import {
  DataSourceNotice,
  PageIntro,
  ReportSection,
  SummaryStrip,
} from "@/components/dashboard/report-ui";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { ReportQualityNotice } from "@/components/reports/report-quality-notice";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { categoryLabel, formatDelta } from "@/lib/audits/audit-comparison";
import { findingTypeLabels } from "@/lib/audits/finding-taxonomy";
import {
  canUsePdfExport,
  canUsePresentationMode,
  canUseProgressComparison,
} from "@/lib/billing/entitlements";
import {
  compactCoverageSummary,
  compactWebsiteSeoCoverageSummary,
  plainCoverageLabel,
  plainHealthLabel,
  plainScoreInterpretation,
  strongestScoredCategory,
  summarizeFindingTypes,
} from "@/lib/customer-experience/overview";
import { contextualHelp } from "@/lib/education/help-content";
import { businessGoalLabels, getSuggestedQuestionsForGoals } from "@/lib/goals";
import { deriveBusinessSetupProgress } from "@/lib/onboarding/business-setup";
import { prisma } from "@/lib/prisma";
import {
  displayEffort,
  displayImpact,
  progressForRecommendations,
  recommendationCategoryLabels,
  sortRecommendations,
} from "@/lib/recommendations/utils";
import { buildAuditReportViewModel } from "@/lib/reports/audit-report-view-model";
import { requireUser } from "@/lib/session";

type BusinessOverviewPageProps = {
  params: Promise<{ businessId: string }>;
};

const categoryRoutes: Record<Exclude<ScoreCategory, "OVERALL">, string> = {
  WEBSITE: "website",
  SEO: "seo",
  BRANDING: "audit?category=BRANDING",
  SOCIAL: "social",
  REVIEWS: "reviews",
  COMPETITORS: "competitors",
};

const overviewCategories = [
  ScoreCategory.WEBSITE,
  ScoreCategory.SEO,
  ScoreCategory.BRANDING,
  ScoreCategory.SOCIAL,
  ScoreCategory.REVIEWS,
  ScoreCategory.COMPETITORS,
] as const;

function ScoreRing({ score, label }: { score: number; label: string }) {
  return (
    <div
      aria-label={`${label} ${score} out of 100`}
      className="flex size-32 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(var(--accent) ${score * 3.6}deg, color-mix(in srgb, var(--border) 78%, transparent) 0deg)`,
      }}
    >
      <div className="flex size-24 flex-col items-center justify-center rounded-full bg-card shadow-sm">
        <span className="text-3xl font-semibold">{score}</span>
        <span className="text-xs text-muted">out of 100</span>
      </div>
    </div>
  );
}

function sourcePageLabel(sourceUrl: string | null | undefined) {
  if (!sourceUrl) return "Business-wide";

  try {
    const url = new URL(sourceUrl);
    if (url.pathname === "/" || !url.pathname) return "Homepage";
    const page = url.pathname
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.[a-z0-9]+$/i, "")
      .replaceAll("-", " ")
      .replaceAll("_", " ");
    if (!page) return url.hostname;
    return page.replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return "Business-wide";
  }
}

function scoreDisplay(item: {
  score: number | null;
  status:
    | "scored"
    | "not_provided"
    | "not_applicable"
    | "not_configured"
    | "saved_not_analyzed"
    | "partial";
}) {
  if (item.status === "not_provided") return "Not provided";
  if (item.status === "not_applicable") return "Not applicable";
  if (item.status === "not_configured") return "Not configured";
  if (item.status === "saved_not_analyzed") return "Not analyzed";
  return item.score === null ? "Not scored" : `${item.score}/100`;
}

function categoryIcon(category: ScoreCategory) {
  const className = "size-4";
  switch (category) {
    case ScoreCategory.WEBSITE:
      return <Globe2 className={className} aria-hidden="true" />;
    case ScoreCategory.SEO:
      return <Search className={className} aria-hidden="true" />;
    case ScoreCategory.SOCIAL:
      return <Share2 className={className} aria-hidden="true" />;
    case ScoreCategory.REVIEWS:
      return <Star className={className} aria-hidden="true" />;
    case ScoreCategory.COMPETITORS:
      return <Swords className={className} aria-hidden="true" />;
    default:
      return <Sparkles className={className} aria-hidden="true" />;
  }
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
          recommendations: true,
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
    },
  });

  if (!business) notFound();

  const setupProgress = deriveBusinessSetupProgress(business);
  const audit = business.audits.at(0);
  if (!audit) {
    return (
      <div className="space-y-6">
        <PageIntro
          eyebrow="Overview"
          title="Finish setup to see your website priorities"
          description="Confirm your website and essential business information, then run your first website audit."
        />
        <SetupChecklist
          businessId={business.id}
          progress={setupProgress}
          dismissed={Boolean(business.onboardingDismissedAt)}
        />
        <EmptyState
          compact
          icon={<AlertTriangle className="size-6" />}
          title="No website audit yet"
          description="Run your first website audit to see what is helping or hurting visibility and conversions."
          action={
            <Link
              href={`/dashboard/businesses/${business.id}/setup`}
              data-customer-event="empty_state_action_clicked"
              data-customer-surface="empty_state"
              className={buttonVariants({ variant: "primary" })}
            >
              Continue setup
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
  const priorityIds = new Set(
    report.recommendations.primary.map((recommendation) => recommendation.id),
  );
  const nextMoves = recommendations.filter((recommendation) =>
    priorityIds.has(recommendation.id),
  );
  const firstMove = nextMoves.at(0);
  const followUpMoves = nextMoves.slice(1, 3);
  const reportRecommendationById = new Map(
    report.recommendations.all.map((recommendation) => [
      recommendation.id,
      recommendation,
    ]),
  );
  const progress = progressForRecommendations(recommendations);
  const currentAction = recommendations.find(
    (recommendation) =>
      recommendation.status === RecommendationStatus.IN_PROGRESS,
  );
  const hasMeaningfulProgress =
    progress.completed > 0 || Boolean(currentAction);
  const topFindings = [
    ...report.findings.warnings,
    ...report.findings.opportunities,
    ...report.findings.strengths,
  ].slice(0, 3);
  const findingSummary = summarizeFindingTypes(report.findings.all);
  const strongestCategory = strongestScoredCategory(report.scores);
  const overallEvidence =
    report.normalizedFacts?.scoreEvidence.categories?.[ScoreCategory.OVERALL];
  const coverageLabel = plainCoverageLabel(
    overallEvidence?.evidenceCompleteness,
  );
  const mainOpportunity =
    firstMove?.title ??
    report.findings.opportunities.at(0)?.title ??
    report.findings.warnings.at(0)?.title ??
    "Keep building on the current foundation";
  const comparison = report.progress.comparison;
  const suggestedQuestions = getSuggestedQuestionsForGoals(
    business.goals,
    business.primaryGoal,
    [],
    null,
    null,
    null,
    {
      description: business.description,
      targetAudience: business.targetAudience,
      businessType: business.businessType,
      primaryConversionGoal: business.primaryConversionGoal,
      contextConfirmedAt: business.contextConfirmedAt,
    },
  ).slice(0, 3);
  const [pdfCheck, presentationCheck, comparisonCheck] = await Promise.all([
    canUsePdfExport(user.id),
    canUsePresentationMode(user.id),
    canUseProgressComparison(user.id),
  ]);
  const reportFindings = report.findings.all;

  function evidenceFor(recommendationId: string) {
    const reportRecommendation = reportRecommendationById.get(recommendationId);
    const sourceFinding = reportRecommendation?.sourceFindingId
      ? reportFindings.find(
          (finding) => finding.id === reportRecommendation.sourceFindingId,
        )
      : undefined;

    return {
      summary:
        reportRecommendation?.evidenceSummary ??
        sourceFinding?.evidenceSummary ??
        sourceFinding?.description ??
        "This action is based on the latest completed audit.",
      sourceUrl:
        reportRecommendation?.sourceUrl ?? sourceFinding?.sourceUrl ?? null,
      confidence:
        reportRecommendation?.confidence ?? sourceFinding?.confidence ?? null,
    };
  }

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Overview"
        title="Your website growth priorities"
        description={`Last audited ${audit.createdAt.toLocaleDateString()}. Start with the best next action, make the improvement, then verify it with a new audit.`}
        actions={
          <>
            <Link
              href={`/dashboard/businesses/${business.id}/audit/run`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Re-audit website
            </Link>
            <Link
              href={
                presentationCheck.allowed
                  ? `/dashboard/businesses/${business.id}/audit/${audit.id}/present`
                  : "/pricing"
              }
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <MonitorPlay className="size-4" aria-hidden="true" />
              {presentationCheck.allowed ? "Present" : "Unlock presentation"}
            </Link>
            <Link
              href={
                pdfCheck.allowed
                  ? `/dashboard/businesses/${business.id}/audit/${audit.id}/pdf`
                  : "/pricing"
              }
              prefetch={false}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Download className="size-4" aria-hidden="true" />
              {pdfCheck.allowed ? "Download PDF" : "Unlock PDF"}
            </Link>
          </>
        }
      />

      <ContextualHelpCard {...contextualHelp.overview} />

      {report.legacyScoring ? (
        <DataSourceNotice>
          <strong>Legacy scoring model.</strong> This historical report keeps
          the categories and score that were saved when it was created. Its
          score should not be compared directly with the current Website Growth
          Score.
        </DataSourceNotice>
      ) : null}

      {report.assessment.mode === "social_first" ? (
        <DataSourceNotice>
          <strong>Social-first assessment.</strong> This report used confirmed
          and pending social profiles, Business Context, goals, reviews, and
          competitors. Website and SEO were not counted as failures. Add a
          website later to unlock those analyses.
        </DataSourceNotice>
      ) : null}

      {report.dataNotes.length > 0 ? (
        <DataSourceNotice>
          <strong>Some saved information needs review.</strong>{" "}
          {report.dataNotes.join(" ")}
        </DataSourceNotice>
      ) : null}

      <Card className="overflow-hidden">
        <div className="grid gap-6 p-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:p-6">
          <ScoreRing
            score={report.audit.overallScore}
            label={report.scoreLabel}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-accent">
              {report.scoreLabel}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              {plainHealthLabel(report.audit.overallScore)}
              <span className="text-muted">
                {" "}
                - {report.audit.overallScore}/100
              </span>
            </h2>
            <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted">Strongest area</p>
                <p className="mt-1 font-semibold">
                  {strongestCategory
                    ? recommendationCategoryLabels[strongestCategory.category]
                    : "Not enough scored areas yet"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted">Main opportunity</p>
                <p className="mt-1 font-semibold">{mainOpportunity}</p>
              </div>
              <div>
                <p className="text-sm text-muted">Your primary goal</p>
                <p className="mt-1 font-semibold">
                  {business.primaryGoal
                    ? businessGoalLabels[business.primaryGoal]
                    : "No primary goal selected"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted">Report coverage</p>
                <p className="mt-1 font-semibold">{coverageLabel}</p>
              </div>
            </div>
            <DisclosureSection
              title="Read executive summary"
              description="A short explanation of the current result."
              compact
              className="mt-5 border-dashed shadow-none"
            >
              <p className="text-sm leading-6 text-muted">
                {report.audit.executiveSummary}
              </p>
            </DisclosureSection>
          </div>
        </div>
      </Card>

      {firstMove ? (
        <section
          aria-labelledby="recommended-first-action"
          className="rounded-lg border border-accent/40 bg-accent/[0.06] p-5 shadow-sm sm:p-6"
        >
          <CustomerEventImpression
            eventName="top_action_viewed"
            surface="business_overview"
          />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-accent">
                Recommended first action
              </p>
              <h2
                id="recommended-first-action"
                className="mt-2 text-xl font-semibold sm:text-2xl"
              >
                {firstMove.title}
              </h2>
              <p className="mt-2 max-w-3xl text-base leading-7 text-muted">
                {firstMove.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
                <span>{recommendationCategoryLabels[firstMove.category]}</span>
                <span>Effort: {displayEffort(firstMove)}</span>
                <span>Expected impact: {displayImpact(firstMove)}</span>
              </div>
            </div>
            <RecommendationPrimaryAction
              businessId={business.id}
              recommendationId={firstMove.id}
              recommendationTitle={firstMove.title}
              status={firstMove.status}
              surface="business_overview"
              className="w-full sm:w-auto"
            />
          </div>
          {(() => {
            const evidence = evidenceFor(firstMove.id);
            return (
              <DisclosureSection
                title="See evidence"
                description="Open the supporting source and confidence details."
                compact
                className="mt-5 border-accent/20 bg-background/50 shadow-none"
                analyticsEvent="overview_evidence_expanded"
                analyticsSurface="business_overview"
              >
                <div className="space-y-2 text-sm leading-6 text-muted">
                  <p>{evidence.summary}</p>
                  {evidence.sourceUrl ? (
                    <p className="break-all">
                      <strong className="text-foreground">Source:</strong>{" "}
                      {evidence.sourceUrl}
                    </p>
                  ) : null}
                  {evidence.confidence ? (
                    <p>
                      <strong className="text-foreground">Confidence:</strong>{" "}
                      {evidence.confidence}
                    </p>
                  ) : null}
                </div>
              </DisclosureSection>
            );
          })()}
        </section>
      ) : (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="mt-0.5 size-5 shrink-0 text-accent"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-semibold">No open priority actions</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Review completed work or run a fresh audit to identify the next
                opportunity.
              </p>
            </div>
          </div>
        </Card>
      )}

      {followUpMoves.length > 0 ? (
        <ReportSection
          title="Next two actions"
          description="Continue with these after the recommended first action."
          action={
            <Link
              href={`/dashboard/businesses/${business.id}/action-plan`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              View full plan
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        >
          <div className="divide-y divide-border">
            {followUpMoves.map((recommendation, index) => (
              <article
                key={recommendation.id}
                className="grid gap-4 py-5 first:pt-0 last:pb-0 sm:grid-cols-[2rem_minmax(0,1fr)] lg:grid-cols-[2rem_minmax(0,1fr)_auto] lg:items-center"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-foreground/[0.06] text-sm font-semibold">
                  {index + 2}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted">
                    {recommendationCategoryLabels[recommendation.category]}
                    {" \u00b7 "}
                    {displayEffort(recommendation)} effort
                    {" \u00b7 "}
                    {displayImpact(recommendation)} impact
                  </p>
                  <h3 className="mt-1 text-base font-semibold">
                    {recommendation.title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {recommendation.description}
                  </p>
                  {(() => {
                    const evidence = evidenceFor(recommendation.id);
                    return (
                      <DisclosureSection
                        title="See evidence"
                        description="Open the supporting source and confidence details."
                        compact
                        className="mt-3 border-0 bg-transparent shadow-none"
                        analyticsEvent="overview_evidence_expanded"
                        analyticsSurface="business_overview"
                      >
                        <div className="space-y-2 text-sm leading-6 text-muted">
                          <p>{evidence.summary}</p>
                          {evidence.sourceUrl ? (
                            <p className="break-all">
                              <strong className="text-foreground">
                                Source:
                              </strong>{" "}
                              {evidence.sourceUrl}
                            </p>
                          ) : null}
                          {evidence.confidence ? (
                            <p>
                              <strong className="text-foreground">
                                Confidence:
                              </strong>{" "}
                              {evidence.confidence}
                            </p>
                          ) : null}
                        </div>
                      </DisclosureSection>
                    );
                  })()}
                </div>
                <RecommendationPrimaryAction
                  businessId={business.id}
                  recommendationId={recommendation.id}
                  recommendationTitle={recommendation.title}
                  status={recommendation.status}
                  surface="business_overview"
                  className="w-full sm:col-start-2 sm:w-auto lg:col-start-auto"
                />
              </article>
            ))}
          </div>
        </ReportSection>
      ) : null}

      <SetupChecklist
        businessId={business.id}
        progress={setupProgress}
        dismissed={Boolean(business.onboardingDismissedAt)}
      />

      <ReportSection
        title="Key findings"
        description={`${findingSummary.total} findings in this audit. ${findingSummary.label}.`}
        action={
          <Link
            href={`/dashboard/businesses/${business.id}/audit`}
            data-customer-event="overview_view_all_findings_clicked"
            data-customer-surface="business_overview"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            View all findings
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        }
      >
        {topFindings.length > 0 ? (
          <div className="divide-y divide-border">
            {topFindings.map((finding) => (
              <article key={finding.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted">
                  <span>
                    {finding.findingType
                      ? findingTypeLabels[finding.findingType]
                      : "Observation"}
                  </span>
                  <span>{recommendationCategoryLabels[finding.category]}</span>
                  <span>{sourcePageLabel(finding.sourceUrl)}</span>
                </div>
                <h3 className="mt-2 font-semibold">{finding.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {finding.evidenceSummary ??
                    finding.whyItMatters ??
                    finding.description}
                </p>
                <DisclosureSection
                  title="See evidence"
                  description="Open the supporting source, confidence, and recommended response."
                  compact
                  className="mt-3 border-0 bg-transparent shadow-none"
                  analyticsEvent="overview_evidence_expanded"
                  analyticsSurface="business_overview"
                >
                  <div className="space-y-2 text-sm leading-6 text-muted">
                    <p>{finding.description}</p>
                    {finding.sourceUrl ? (
                      <p className="break-all">
                        <strong className="text-foreground">Source:</strong>{" "}
                        {finding.sourceUrl}
                      </p>
                    ) : null}
                    {finding.confidence ? (
                      <p>
                        <strong className="text-foreground">Confidence:</strong>{" "}
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
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted">
            No detailed findings were saved for this audit.
          </p>
        )}
      </ReportSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection
          title="Action progress"
          description={
            hasMeaningfulProgress
              ? `${progress.completed} of ${progress.total} actions completed.`
              : "Begin with the recommended action above."
          }
        >
          {hasMeaningfulProgress ? (
            <div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-3xl font-semibold">{progress.percent}%</p>
                  {currentAction ? (
                    <p className="mt-1 text-sm text-muted">
                      In progress: {currentAction.title}
                    </p>
                  ) : null}
                </div>
                <ListChecks className="size-5 text-accent" aria-hidden="true" />
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10"
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
                <p className="font-semibold">
                  Start with your first recommended action
                </p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Progress will appear here after work begins.
                </p>
              </div>
            </div>
          )}
        </ReportSection>

        <ReportSection title="Since your last audit">
          {comparison.previousAuditId && comparisonCheck.allowed ? (
            comparison.methodologyChanged ? (
              <div>
                <p className="font-semibold">Comparison limited</p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  The scoring method changed, so the score difference does not
                  necessarily mean the business improved or declined.
                </p>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-accent">
                    Technical comparison details
                  </summary>
                  <p className="mt-2 leading-6 text-muted">
                    {comparison.comparisonNote ??
                      "The two audits used different scoring methods and should not be compared as a direct trend."}
                  </p>
                </details>
              </div>
            ) : (
              <div className="space-y-3">
                <SummaryStrip className="border-0 bg-foreground/[0.035]">
                  <strong>
                    Overall {formatDelta(comparison.overallScoreChange)}
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
                <p className="text-sm leading-6 text-muted">
                  {comparison.summary}
                </p>
              </div>
            )
          ) : comparison.previousAuditId ? (
            <Link
              href="/pricing"
              className="text-sm font-medium text-accent hover:underline"
            >
              Unlock progress comparison
            </Link>
          ) : (
            <p className="text-sm leading-6 text-muted">
              This is your first audit. Future audits will show progress over
              time.
            </p>
          )}
        </ReportSection>
      </div>

      <ReportSection
        title={
          report.legacyScoring
            ? "Business health by area"
            : "Website health by area"
        }
        description={
          report.legacyScoring
            ? "Each legacy area appears once. Open a category for the saved analysis."
            : "Website and SEO are the only categories included in the Website Growth Score."
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overviewCategories.map((category) => {
            const item = report.scores.find(
              (score) => score.category === category,
            );
            if (!item) return null;
            const href = `/dashboard/businesses/${business.id}/${categoryRoutes[category]}`;

            return (
              <Link
                key={category}
                href={href}
                data-customer-event="category_opened"
                data-customer-surface="category"
                className="group flex min-h-32 flex-col justify-between rounded-lg bg-foreground/[0.035] p-4 transition-colors hover:bg-foreground/[0.065] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-semibold">
                    {categoryIcon(category)}
                    {recommendationCategoryLabels[category]}
                  </span>
                  <ArrowRight
                    className="size-4 text-muted transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-5">
                  <p className="text-lg font-semibold">{scoreDisplay(item)}</p>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    {plainScoreInterpretation(item.score)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </ReportSection>

      {report.coverage ? (
        <DisclosureSection
          title="Analysis coverage"
          description={
            report.legacyScoring
              ? compactCoverageSummary(report.coverage)
              : compactWebsiteSeoCoverageSummary(report.coverage)
          }
          analyticsEvent="overview_coverage_expanded"
          analyticsSurface="business_overview"
        >
          <div className="divide-y divide-border text-sm">
            <div className="grid gap-1 py-3 first:pt-0 sm:grid-cols-[14rem_1fr]">
              <p className="font-semibold">Website pages checked</p>
              <p className="leading-6 text-muted">
                {report.coverage.crawl.explanation}
              </p>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr]">
              <p className="font-semibold">Technical website checks</p>
              <p className="leading-6 text-muted">
                {report.coverage.technical.explanation}
              </p>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr]">
              <p className="font-semibold">Pages reviewed by AI</p>
              <p className="leading-6 text-muted">
                {report.coverage.aiContent.explanation}
              </p>
            </div>
            {report.legacyScoring ? (
              <>
                <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr]">
                  <p className="font-semibold">Social profiles reviewed</p>
                  <p className="leading-6 text-muted">
                    {report.coverage.socialProfiles.explanation}
                  </p>
                </div>
                <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr]">
                  <p className="font-semibold">Review evidence</p>
                  <p className="leading-6 text-muted">
                    {report.coverage.reviews.explanation}
                  </p>
                </div>
                <div className="grid gap-1 py-3 last:pb-0 sm:grid-cols-[14rem_1fr]">
                  <p className="font-semibold">Competitor evidence</p>
                  <p className="leading-6 text-muted">
                    {report.coverage.competitors.explanation}
                  </p>
                </div>
              </>
            ) : null}
          </div>
          <details className="mt-5 border-t border-border pt-4 text-sm">
            <summary className="cursor-pointer font-medium text-accent">
              Technical methodology
            </summary>
            <dl className="mt-3 grid gap-3 text-muted sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground">Scoring engine</dt>
                <dd>{report.scoringMetadata.scoringEngineVersion}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Report model</dt>
                <dd>{report.scoringMetadata.reportViewModelVersion}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-medium text-foreground">
                  Analyzer versions
                </dt>
                <dd className="break-words">
                  {Object.entries(report.scoringMetadata.analyzerVersions)
                    .map(([name, version]) => `${name}: ${version}`)
                    .join(", ")}
                </dd>
              </div>
            </dl>
          </details>
        </DisclosureSection>
      ) : null}

      <Card className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <MessageSquareText className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold">
                Continue with your Website &amp; SEO Consultant
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Ask about the current audit, choose an action, or draft an
                implementation.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {suggestedQuestions.map((question) => (
              <Link
                key={question}
                href={`/dashboard/businesses/${business.id}/chat?prompt=${encodeURIComponent(question)}`}
                data-customer-event="consultant_prompt_selected"
                data-customer-surface="consultant"
                className="rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {question}
              </Link>
            ))}
            <Link
              href={`/dashboard/businesses/${business.id}/chat`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <MessageSquareText className="size-4" aria-hidden="true" />
              Ask Consultant
            </Link>
          </div>
        </div>
      </Card>

      <FloatingScrollControls />
    </div>
  );
}

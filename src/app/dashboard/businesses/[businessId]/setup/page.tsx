import {
  AuditStatus,
  PlanType,
  type Prisma,
  ScoreCategory,
} from "@prisma/client";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Check,
  ClipboardCheck,
  ListChecks,
  RefreshCw,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prepareAuditRun } from "@/app/dashboard/businesses/[businessId]/confirm/actions";
import {
  confirmBusinessContext,
  regenerateBusinessContext,
} from "@/app/dashboard/businesses/[businessId]/context/actions";
import { saveBusinessGoals } from "@/app/dashboard/businesses/[businessId]/goals/actions";
import {
  completeBusinessSetup,
  dismissBusinessSetup,
  goToBusinessSetupStep,
} from "@/app/dashboard/businesses/[businessId]/setup/actions";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  CompactMetricCard,
  DataSourceNotice,
  PageIntro,
  ReportSection,
  SummaryStrip,
} from "@/components/dashboard/report-ui";
import { GuidedProfileManager } from "@/components/onboarding/guided-profile-manager";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { getPlanEntitlements, getPlanDefinition } from "@/lib/billing/plans";
import { getUserPlan } from "@/lib/billing/entitlements";
import {
  contextConfidenceLabel,
  contextSourceLabel,
} from "@/lib/business-context";
import {
  businessGoalDescriptions,
  businessGoalLabels,
  orderedBusinessGoals,
} from "@/lib/goals";
import {
  businessSetupSteps,
  deriveBusinessSetupProgress,
  isBusinessSetupStep,
  nextBusinessSetupStep,
  previousBusinessSetupStep,
  type BusinessSetupStep,
} from "@/lib/onboarding/business-setup";
import {
  deriveAuditSourceReadiness,
  type AuditSourceReadiness,
} from "@/lib/onboarding/audit-source-readiness";
import { prisma } from "@/lib/prisma";
import { sortRecommendations } from "@/lib/recommendations/utils";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type SetupPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ step?: string; [key: string]: string | string[] | undefined }>;
};

const stepDetails: Record<
  BusinessSetupStep,
  { label: string; title: string; description: string }
> = {
  profiles: {
    label: "Profiles",
    title: "Confirm your online profiles",
    description:
      "Review what we found and add anything missing. Onread will use only the profiles you confirm in your audit.",
  },
  context: {
    label: "Context",
    title: "Review Business Context",
    description:
      "Give the audit a clear picture of what you do, who you serve, and the result you want.",
  },
  goals: {
    label: "Goals",
    title: "Select Business Goals",
    description:
      "Choose the outcomes that should shape recommendation order and consultant guidance.",
  },
  audit: {
    label: "Audit",
    title: "Run Your First Audit",
    description:
      "Review readiness, then hand off to the existing audit runner and progress experience.",
  },
  results: {
    label: "Results",
    title: "Review Your Results",
    description:
      "Start with the strongest area, largest opportunity, and three most useful next moves.",
  },
};

const scoreLabels: Partial<Record<ScoreCategory, string>> = {
  WEBSITE: "Website",
  SEO: "SEO",
  BRANDING: "Branding",
  SOCIAL: "Social",
  REVIEWS: "Reviews",
  COMPETITORS: "Competitors",
};

export default async function BusinessSetupPage({
  params,
  searchParams,
}: SetupPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = await searchParams;
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: user.id },
    include: {
      profiles: {
        orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
      },
      googleBusinessProfiles: {
        where: { status: { not: "removed" } },
        select: {
          id: true,
          displayName: true,
          formattedAddress: true,
          googleMapsUri: true,
          matchConfidence: true,
          status: true,
          source: true,
        },
      },
      profileDecisions: true,
      audits: {
        where: { status: AuditStatus.COMPLETED },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          scores: true,
          recommendations: true,
        },
      },
    },
  });

  if (!business) notFound();

  const progress = deriveBusinessSetupProgress(business);
  const sourceReadiness = deriveAuditSourceReadiness(business);
  const requestedStep = typeof query.step === "string" ? query.step : "";
  const savedStep = business.onboardingLastStep ?? "";
  const step = isBusinessSetupStep(requestedStep)
    ? requestedStep
    : isBusinessSetupStep(savedStep) && !progress.completedSteps[savedStep]
      ? savedStep
      : progress.currentStep;
  const plan = await getUserPlan(user.id);
  const planDefinition = getPlanDefinition(plan);
  const entitlements = getPlanEntitlements(plan);
  const current = stepDetails[step];

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Guided setup"
        title={current.title}
        description={current.description}
        icon={ClipboardCheck}
        actions={
          <form action={dismissBusinessSetup}>
            <input type="hidden" name="businessId" value={business.id} />
            <input type="hidden" name="step" value={step} />
            <SubmitButton
              variant="outline"
              size="sm"
              pendingLabel="Saving..."
            >
              Finish later
            </SubmitButton>
          </form>
        }
      />

      <SetupStepper
        businessId={business.id}
        currentStep={step}
        completed={progress.completedSteps}
      />

      <SummaryStrip>
        <strong>{progress.percent}% complete</strong>
        <span className="text-muted">
          {progress.completedCount} of {businessSetupSteps.length} steps
        </span>
        <span className="text-muted">{progress.listStatus}</span>
      </SummaryStrip>

      {step === "profiles" ? (
        <ProfilesStep business={business} progress={progress} />
      ) : null}
      {step === "context" ? (
        <ContextStep business={business} progress={progress} />
      ) : null}
      {step === "goals" ? <GoalsStep business={business} /> : null}
      {step === "audit" ? (
        <AuditStep
          business={business}
          progress={progress}
          sourceReadiness={sourceReadiness}
          plan={plan}
          planName={planDefinition.name}
          crawlLimit={entitlements.maxCrawlPages}
        />
      ) : null}
      {step === "results" ? <ResultsStep business={business} /> : null}

      {step !== "results" ? (
        <SetupControls
          businessId={business.id}
          step={step}
          canContinue={
            step === "profiles"
              ? progress.profilesComplete
              : step === "context"
                ? progress.socialFirst
                  ? progress.contextComplete && progress.contextHasCoreDetails
                  : progress.contextState !== "missing"
                : step === "goals"
                  ? progress.goalsComplete
                  : progress.auditComplete
          }
        />
      ) : null}
    </div>
  );
}

function SetupStepper({
  businessId,
  currentStep,
  completed,
}: {
  businessId: string;
  currentStep: BusinessSetupStep;
  completed: Record<BusinessSetupStep, boolean>;
}) {
  return (
    <nav aria-label="Business setup progress">
      <ol className="grid gap-2 sm:grid-cols-5">
        {businessSetupSteps.map((step, index) => {
          const active = step === currentStep;
          return (
            <li key={step}>
              <Link
                href={`/dashboard/businesses/${businessId}/setup?step=${step}`}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-card text-muted hover:border-accent hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    completed[step]
                      ? "border-teal-600 bg-teal-600 text-white"
                      : active
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-background",
                  )}
                >
                  {completed[step] ? <Check className="size-4" /> : index + 1}
                </span>
                <span className="truncate font-medium">{stepDetails[step].label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        Current step: {stepDetails[currentStep].title}
      </p>
    </nav>
  );
}

type SetupBusiness = Prisma.BusinessGetPayload<{
  include: {
    profiles: true;
    googleBusinessProfiles: {
      select: {
        id: true;
        displayName: true;
        formattedAddress: true;
        googleMapsUri: true;
        matchConfidence: true;
        status: true;
        source: true;
      };
    };
    profileDecisions: true;
    audits: { include: { scores: true; recommendations: true } };
  };
}>;

function ProfilesStep({
  business,
  progress,
}: {
  business: NonNullable<SetupBusiness>;
  progress: ReturnType<typeof deriveBusinessSetupProgress>;
}) {
  return (
    <GuidedProfileManager
      businessId={business.id}
      profiles={business.profiles}
      googleCandidates={business.googleBusinessProfiles}
      decisions={business.profileDecisions}
      profilesComplete={progress.profilesComplete}
      hasConfirmedWebsite={progress.hasConfirmedWebsite}
    />
  );
}

function ContextStep({
  business,
  progress,
}: {
  business: NonNullable<SetupBusiness>;
  progress: ReturnType<typeof deriveBusinessSetupProgress>;
}) {
  const fields = [
    ["Description", business.description],
    ["Target audience", business.targetAudience],
    ["Main offer", business.mainOffer],
    ["Industry / type", [business.industry, business.businessType].filter(Boolean).join(" · ")],
    ["Conversion goal", business.primaryConversionGoal],
  ];

  return (
    <div className="space-y-5">
      {progress.socialFirst ? (
        <DataSourceNotice>
          <strong>Business Context powers this social-first audit.</strong>{" "}
          Confirm or edit what the business does, who it serves, and its main
          offer before running the audit. We will not guess from a handle alone.
        </DataSourceNotice>
      ) : null}

      {!progress.contextHasCoreDetails && progress.socialFirst ? (
        <Card className="border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            Add a description, target audience, and main offer to continue.
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-900 dark:text-amber-200">
            Social profile URLs do not provide enough reliable business detail
            on their own.
          </p>
        </Card>
      ) : null}
      <Card className="p-5">
        <div className="flex gap-3">
          <BookOpenText className="mt-0.5 size-5 text-accent" />
          <p className="text-sm leading-6 text-muted">
            Business Context helps the audit and AI understand what your business actually does and who it serves.
          </p>
        </div>
      </Card>

      {progress.contextState === "missing" ? (
        <EmptyState
          icon={<Sparkles className="size-6" />}
          title="No Business Context yet"
          description="Generate a draft from your saved profiles and a bounded public homepage analysis."
          action={
            <form action={regenerateBusinessContext}>
              <input type="hidden" name="businessId" value={business.id} />
              <input type="hidden" name="returnTo" value="setup" />
              <SubmitButton
                variant="primary"
                pendingLabel="Generating context..."
              >
                <Sparkles className="size-4" />
                Generate context
              </SubmitButton>
            </form>
          }
        />
      ) : (
        <ReportSection
          title={progress.contextComplete ? "Confirmed context" : "Draft needs review"}
          description={`${contextConfidenceLabel(business.contextConfidence)} · ${contextSourceLabel(business.contextSource)}`}
        >
          <dl className="grid gap-4 md:grid-cols-2">
            {fields.map(([label, value]) => (
              <div key={label} className="rounded-lg bg-foreground/[0.035] p-4">
                <dt className="text-xs font-semibold uppercase text-muted">{label}</dt>
                <dd className="mt-2 text-sm leading-6">{value || "Not provided"}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            {!progress.contextComplete ? (
              <form action={confirmBusinessContext}>
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="returnTo" value="setup" />
                <SubmitButton
                  variant="primary"
                  size="sm"
                  pendingLabel="Confirming..."
                >
                  <BadgeCheck className="size-4" />
                  Confirm This Looks Right
                </SubmitButton>
              </form>
            ) : null}
            <Link href={`/dashboard/businesses/${business.id}/context`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Edit Context
            </Link>
            <form action={regenerateBusinessContext}>
              <input type="hidden" name="businessId" value={business.id} />
              <input type="hidden" name="returnTo" value="setup" />
              <SubmitButton
                variant="secondary"
                size="sm"
                pendingLabel="Regenerating..."
              >
                <RefreshCw className="size-4" />
                Regenerate
              </SubmitButton>
            </form>
          </div>
        </ReportSection>
      )}
    </div>
  );
}

function GoalsStep({ business }: { business: NonNullable<SetupBusiness> }) {
  const selected = new Set(business.goals);

  return (
    <form action={saveBusinessGoals} className="space-y-5">
      <input type="hidden" name="businessId" value={business.id} />
      <input type="hidden" name="returnTo" value="setup" />
      <Card className="p-5">
        <div className="flex gap-3">
          <Target className="mt-0.5 size-5 text-accent" />
          <p className="text-sm leading-6 text-muted">
            Goals help prioritize recommendations around the outcomes that matter most to you. Select several, then choose one primary goal.
          </p>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {orderedBusinessGoals.map((goal) => (
          <Card key={goal} className="p-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="goals"
                value={goal}
                defaultChecked={selected.has(goal)}
                className="mt-1 size-4 accent-foreground dark:accent-accent"
              />
              <span>
                <span className="text-sm font-semibold">{businessGoalLabels[goal]}</span>
                <span className="mt-1 block text-xs leading-5 text-muted">{businessGoalDescriptions[goal]}</span>
              </span>
            </label>
            <label className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs font-semibold text-muted">
              <input
                type="radio"
                name="primaryGoal"
                value={goal}
                defaultChecked={business.primaryGoal === goal}
                className="size-3.5 accent-foreground dark:accent-accent"
              />
              Make primary
            </label>
          </Card>
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          You can skip for now, but recommendations will be less personalized.
        </p>
        <SubmitButton pendingLabel="Saving goals...">Save goals</SubmitButton>
      </div>
    </form>
  );
}

function AuditStep({
  business,
  progress,
  sourceReadiness,
  plan,
  planName,
  crawlLimit,
}: {
  business: NonNullable<SetupBusiness>;
  progress: ReturnType<typeof deriveBusinessSetupProgress>;
  sourceReadiness: AuditSourceReadiness;
  plan: PlanType;
  planName: string;
  crawlLimit: number;
}) {
  const canRunAudit = progress.profilesComplete;
  const requiresSourceAcknowledgement =
    plan !== PlanType.FREE && sourceReadiness.requiresAcknowledgement;
  const readiness = [
    ["Profiles ready", progress.profilesComplete, `${progress.profileCounts.confirmed} confirmed`],
    [
      "Business Context",
      progress.contextComplete,
      progress.contextState === "complete"
        ? "Confirmed"
        : progress.contextState === "needs_review"
          ? "Needs review"
          : "Missing",
    ],
    ["Goals selected", progress.goalsComplete, `${business.goals.length} selected`],
  ] as const;

  return (
    <div className="space-y-5">
      <ReportSection
        title="Audit readiness"
        description="The audit can run with partial setup, but confirmed inputs produce more reliable priorities."
      >
        <div className="space-y-3">
          {readiness.map(([label, ready, detail]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-3">
                {ready ? (
                  <Check className="size-5 text-teal-700 dark:text-teal-200" />
                ) : (
                  <TriangleAlert className="size-5 text-amber-700 dark:text-amber-200" />
                )}
                <span className="font-medium">{label}</span>
              </div>
              <span className="text-sm text-muted">{detail}</span>
            </div>
          ))}
        </div>
      </ReportSection>

      <section className="grid gap-3 sm:grid-cols-2">
        <CompactMetricCard label="Current plan" value={planName} />
        <CompactMetricCard
          label="Website crawl"
          value={
            progress.hasConfirmedWebsite
              ? `${crawlLimit} pages`
              : "Not applicable"
          }
          detail={
            progress.hasConfirmedWebsite
              ? undefined
              : "Add and confirm a website later to unlock Website and SEO analysis."
          }
        />
      </section>

      {sourceReadiness.missingSources.length > 0 ? (
        <Card
          className={cn(
            "p-5",
            requiresSourceAcknowledgement
              ? "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/25"
              : "",
          )}
        >
          <div className="flex items-start gap-3">
            <TriangleAlert
              className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-200"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h3 className="font-semibold">Some sources have not been added</h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Your audit can still run, but results for unavailable sources
                may be limited. Only confirmed profiles will be analyzed as
                belonging to your business.
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {sourceReadiness.missingSources.map((source) => (
              <li
                key={source.code}
                className="rounded-lg border border-border/80 bg-background/80 p-3"
              >
                <p className="text-sm font-semibold">{source.label}</p>
                <p className="mt-1 text-sm leading-5 text-muted">
                  {source.limitation}
                </p>
              </li>
            ))}
          </ul>
          {sourceReadiness.acknowledged ? (
            <p className="mt-4 text-sm font-medium text-teal-700 dark:text-teal-200">
              You already chose to continue with this source set. We will ask
              again only if these inputs change.
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card className="p-5">
        <h3 className="font-semibold">What this audit analyzes</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          {progress.socialFirst
            ? "Confirmed social profiles, Business Context, platform coverage, social strategy readiness, conversion paths, reviews, goals, competitors, and a prioritized action plan. Website and SEO will be marked not provided."
            : "Confirmed profiles, website pages, SEO basics, review and trust coverage, social presence, goals, competitors, and a prioritized action plan."}
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          {requiresSourceAcknowledgement ? (
            <Link
              href={`/dashboard/businesses/${business.id}/setup?step=${sourceReadiness.missingSources.at(0)?.returnStep ?? "profiles"}`}
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Add missing sources
            </Link>
          ) : null}
          <form action={prepareAuditRun}>
            <input type="hidden" name="businessId" value={business.id} />
            <input type="hidden" name="returnTo" value="setup" />
            {requiresSourceAcknowledgement ? (
              <input
                type="hidden"
                name="acknowledgeMissingSources"
                value="1"
              />
            ) : null}
            <SubmitButton
              variant="primary"
              size="lg"
              pendingLabel="Starting audit..."
              disabled={!canRunAudit}
              className="w-full sm:w-auto"
            >
              {requiresSourceAcknowledgement
                ? "Continue with available information"
                : "Run My First Audit"}
              <ArrowRight className="size-4" />
            </SubmitButton>
          </form>
        </div>
        {!canRunAudit ? (
          <p className="mt-3 text-sm text-muted">
            Confirm at least one website, social, or Google Business profile,
            resolve every discovered match, and review the Google Business
            source before running the audit.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function ResultsStep({ business }: { business: NonNullable<SetupBusiness> }) {
  const audit = business.audits.at(0);

  if (!audit) {
    return (
      <EmptyState
        icon={<ListChecks className="size-6" />}
        title="No completed audit yet"
        description="Run your first audit to receive scores, findings, and an action plan."
        action={
          <Link href={`/dashboard/businesses/${business.id}/setup?step=audit`} className={buttonVariants({ variant: "primary" })}>
            Go to audit step
          </Link>
        }
      />
    );
  }

  const categories = audit.scores
    .filter((score) => !score.platform && score.category !== ScoreCategory.OVERALL)
    .sort((a, b) => b.score - a.score);
  const strongest = categories.at(0);
  const weakest = categories.at(-1);
  const nextMoves = sortRecommendations(audit.recommendations).slice(0, 3);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <CompactMetricCard label="Overall score" value={`${audit.overallScore ?? 0}/100`} />
        <CompactMetricCard label="Strongest area" value={strongest ? `${scoreLabels[strongest.category] ?? strongest.category} · ${strongest.score}` : "Not available"} tone="good" />
        <CompactMetricCard label="Largest opportunity" value={weakest ? `${scoreLabels[weakest.category] ?? weakest.category} · ${weakest.score}` : "Not available"} tone="warning" />
      </section>

      <ReportSection title="Your next three moves" description="Start here before opening the full recommendation backlog.">
        <ol className="space-y-3">
          {nextMoves.map((recommendation, index) => (
            <li key={recommendation.id} className="flex gap-3 rounded-lg border border-border bg-background p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                {index + 1}
              </span>
              <div>
                <p className="font-semibold">{recommendation.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{recommendation.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </ReportSection>

      <div className="flex flex-col gap-3 sm:flex-row">
        <form action={completeBusinessSetup}>
          <input type="hidden" name="businessId" value={business.id} />
          <input type="hidden" name="destination" value="action-plan" />
          <SubmitButton
            variant="primary"
            size="lg"
            pendingLabel="Opening action plan..."
            className="w-full sm:w-auto"
          >
            Open My Action Plan
            <ArrowRight className="size-4" />
          </SubmitButton>
        </form>
        <form action={completeBusinessSetup}>
          <input type="hidden" name="businessId" value={business.id} />
          <input type="hidden" name="destination" value="chat" />
          <SubmitButton
            variant="secondary"
            size="lg"
            pendingLabel="Opening consultant..."
            className="w-full sm:w-auto"
          >
            <Sparkles className="size-4" />
            Ask the AI Consultant
          </SubmitButton>
        </form>
        <form action={completeBusinessSetup}>
          <input type="hidden" name="businessId" value={business.id} />
          <input type="hidden" name="destination" value="overview" />
          <SubmitButton
            variant="outline"
            size="lg"
            pendingLabel="Opening report..."
            className="w-full sm:w-auto"
          >
            View full report
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

function SetupControls({
  businessId,
  step,
  canContinue,
}: {
  businessId: string;
  step: BusinessSetupStep;
  canContinue: boolean;
}) {
  const previous = previousBusinessSetupStep(step);
  const next = nextBusinessSetupStep(step);
  const canSkip = step === "context" || step === "goals";

  return (
    <Card className="sticky bottom-4 z-10 flex flex-col gap-3 bg-card/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      {step !== "profiles" ? (
        <form action={goToBusinessSetupStep}>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="step" value={previous} />
          <SubmitButton variant="secondary" pendingLabel="Going back...">
            <ArrowLeft className="size-4" />
            Back
          </SubmitButton>
        </form>
      ) : (
        <span />
      )}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {!canContinue && canSkip ? (
          <form action={goToBusinessSetupStep}>
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="step" value={next} />
            <SubmitButton variant="ghost" pendingLabel="Saving...">
              Skip for now
            </SubmitButton>
          </form>
        ) : null}
        <form action={goToBusinessSetupStep}>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="step" value={next} />
          <SubmitButton
            variant="primary"
            pendingLabel="Saving..."
            disabled={!canContinue}
          >
            Continue
            <ArrowRight className="size-4" />
          </SubmitButton>
        </form>
      </div>
    </Card>
  );
}

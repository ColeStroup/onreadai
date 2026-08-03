import {
  AuditStatus,
  BusinessProfileStatus,
  PlanType,
  ProfilePlatform,
  type Prisma,
  ScoreCategory,
} from "@prisma/client";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
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
  websiteSeoBusinessGoals,
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
import { platformLabels } from "@/lib/profiles/platforms";
import { sortRecommendations } from "@/lib/recommendations/utils";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type SetupPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    step?: string;
    [key: string]: string | string[] | undefined;
  }>;
};

const stepDetails: Record<
  BusinessSetupStep,
  { label: string; title: string; description: string }
> = {
  profiles: {
    label: "Website",
    title: "Confirm your website",
    description:
      "Check the public website Onread should crawl and use as audit evidence.",
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
    title: "Run Your First Website Audit",
    description:
      "Review the website and business context Onread will use, then start the analysis.",
  },
  results: {
    label: "Results",
    title: "Review Your Results",
    description:
      "See your Website Growth Score, strongest evidence, and the next three improvements.",
  },
};

const scoreLabels: Partial<Record<ScoreCategory, string>> = {
  WEBSITE: "Website",
  SEO: "SEO",
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
            <SubmitButton variant="outline" size="sm" pendingLabel="Saving...">
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

      {step !== "results" && step !== "goals" && step !== "audit" ? (
        <SetupControls
          businessId={business.id}
          step={step}
          canContinue={
            step === "profiles"
              ? progress.profilesComplete
              : step === "context"
                ? progress.contextState !== "missing"
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
                <span className="truncate font-medium">
                  {stepDetails[step].label}
                </span>
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
      profiles={business.profiles.filter(
        (profile) => profile.platform === ProfilePlatform.WEBSITE,
      )}
      googleCandidates={[]}
      decisions={[]}
      profilesComplete={progress.profilesComplete}
      hasConfirmedWebsite={progress.hasConfirmedWebsite}
      websiteOnly
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
    [
      "Industry / type",
      [business.industry, business.businessType]
        .filter(Boolean)
        .join(" \u00b7 "),
    ],
    ["Conversion goal", business.primaryConversionGoal],
  ];

  return (
    <div className="space-y-5">
      {progress.contextState === "missing" ? (
        <EmptyState
          compact
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
          title={
            progress.contextComplete
              ? "Confirmed context"
              : "Draft needs review"
          }
          description={
            progress.contextComplete
              ? "This information will guide the audit and Consultant."
              : "Review the business description, audience, offer, and conversion goal before continuing."
          }
        >
          <dl className="divide-y divide-border">
            {fields.map(([label, value]) => (
              <div
                key={label}
                className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[11rem_1fr]"
              >
                <dt className="text-sm font-medium text-muted">{label}</dt>
                <dd className="text-sm leading-6">{value || "Not provided"}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            {!progress.contextComplete ? (
              <form action={confirmBusinessContext}>
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="returnTo" value="setup" />
                <SubmitButton
                  variant={progress.socialFirst ? "primary" : "secondary"}
                  size="sm"
                  pendingLabel="Confirming context..."
                  data-customer-event="setup_step_completed"
                  data-customer-surface="guided_setup"
                >
                  <BadgeCheck className="size-4" />
                  Confirm this looks right
                </SubmitButton>
              </form>
            ) : null}
            <Link
              href={`/dashboard/businesses/${business.id}/context`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Edit context
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
                Regenerate draft
              </SubmitButton>
            </form>
          </div>
          <details className="mt-4 border-t border-border pt-4 text-sm">
            <summary className="cursor-pointer font-medium text-accent">
              Generation details
            </summary>
            <p className="mt-2 leading-6 text-muted">
              {contextConfidenceLabel(business.contextConfidence)}
              {" \u00b7 "}
              {contextSourceLabel(business.contextSource)}
            </p>
          </details>
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
      <input type="hidden" name="returnTo" value="setup-next" />
      <div className="flex gap-3 text-sm leading-6 text-muted">
        <Target className="mt-0.5 size-5 shrink-0 text-accent" />
        <p>
          Select several outcomes, then choose one primary goal. These choices
          shape recommendation order and Consultant guidance.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {websiteSeoBusinessGoals.map((goal) => (
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
                <span className="text-sm font-semibold">
                  {businessGoalLabels[goal]}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted">
                  {businessGoalDescriptions[goal]}
                </span>
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
      <Card className="sticky bottom-4 z-10 flex flex-col gap-3 bg-card/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/dashboard/businesses/${business.id}/setup?step=context`}
          className={buttonVariants({ variant: "secondary" })}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Link>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Link
            href={`/dashboard/businesses/${business.id}/setup?step=audit`}
            className={buttonVariants({ variant: "ghost" })}
          >
            Skip for now
          </Link>
          <SubmitButton
            pendingLabel="Saving goals..."
            data-customer-event="setup_step_completed"
            data-customer-surface="guided_setup"
          >
            Save and continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </SubmitButton>
        </div>
      </Card>
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
    [
      "Website ready",
      progress.profilesComplete,
      progress.profilesComplete ? "Confirmed" : "Needs confirmation",
    ],
    [
      "Business Context",
      progress.contextComplete,
      progress.contextState === "complete"
        ? "Confirmed"
        : progress.contextState === "needs_review"
          ? "Needs review"
          : "Missing",
    ],
    [
      "Goals selected",
      progress.goalsComplete,
      `${business.goals.length} selected`,
    ],
  ] as const;
  const confirmedPlatforms = business.profiles
    .filter(
      (profile) =>
        profile.status === BusinessProfileStatus.CONFIRMED &&
        profile.platform === ProfilePlatform.WEBSITE,
    )
    .map((profile) => platformLabels[profile.platform]);
  const includedAnalysis = [
    progress.hasConfirmedWebsite
      ? `Website and SEO, including up to ${crawlLimit} public pages`
      : null,
    confirmedPlatforms.length > 0
      ? `Confirmed source: ${confirmedPlatforms.join(", ")}`
      : null,
    "Business Context and selected website goals",
    "Evidence-backed Website and SEO findings",
    "A prioritized implementation and verification plan",
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="space-y-5">
      <ReportSection
        title="Audit readiness"
        description="The audit can run with partial setup, but confirmed inputs produce more reliable priorities."
      >
        <div className="divide-y divide-border">
          {readiness.map(([label, ready, detail]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
            >
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
              <h3 className="font-semibold">Setup details need attention</h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                A confirmed website is required. Optional context and goals make
                prioritization more specific to this business.
              </p>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-border/80 border-y border-border/80">
            {sourceReadiness.missingSources.map((source) => (
              <li key={source.code} className="py-3">
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
        <h3 className="font-semibold">Your audit will include</h3>
        <ul className="mt-3 space-y-2 text-sm leading-6">
          {includedAnalysis.map((item) => (
            <li key={item} className="flex gap-2">
              <Check
                className="mt-1 size-4 shrink-0 text-accent"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <details className="mt-4 border-t border-border pt-4 text-sm">
          <summary className="cursor-pointer font-medium text-accent">
            Plan and analysis limits
          </summary>
          <p className="mt-2 leading-6 text-muted">
            Current plan: {planName}. Website crawl limit:{" "}
            {progress.hasConfirmedWebsite
              ? `${crawlLimit} pages`
              : "not applicable"}
            .
          </p>
        </details>
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
              <input type="hidden" name="acknowledgeMissingSources" value="1" />
            ) : null}
            <SubmitButton
              variant="primary"
              size="lg"
              pendingLabel="Starting audit..."
              disabled={!canRunAudit}
              className="w-full sm:w-auto"
              data-customer-event="setup_step_completed"
              data-customer-surface="guided_setup"
            >
              {requiresSourceAcknowledgement
                ? "Run with current context"
                : "Run your first website audit"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </SubmitButton>
          </form>
        </div>
        {!canRunAudit ? (
          <p className="mt-3 text-sm text-muted">
            Confirm a public website before running the audit.
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
        description="Run your first website audit to receive evidence-backed Website and SEO findings with a prioritized action plan."
        action={
          <Link
            href={`/dashboard/businesses/${business.id}/setup?step=audit`}
            className={buttonVariants({ variant: "primary" })}
          >
            Go to audit step
          </Link>
        }
      />
    );
  }

  const categories = audit.scores
    .filter(
      (score) => !score.platform && score.category !== ScoreCategory.OVERALL,
    )
    .sort((a, b) => b.score - a.score);
  const strongest = categories.at(0);
  const weakest = categories.at(-1);
  const nextMoves = sortRecommendations(audit.recommendations).slice(0, 3);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <CompactMetricCard
          label="Website Growth Score"
          value={`${audit.overallScore ?? 0}/100`}
        />
        <CompactMetricCard
          label="Strongest area"
          value={
            strongest
              ? `${scoreLabels[strongest.category] ?? strongest.category} \u00b7 ${strongest.score}`
              : "Not available"
          }
          tone="good"
        />
        <CompactMetricCard
          label="Largest opportunity"
          value={
            weakest
              ? `${scoreLabels[weakest.category] ?? weakest.category} \u00b7 ${weakest.score}`
              : "Not available"
          }
          tone="warning"
        />
      </section>

      <ReportSection
        title="Your next three moves"
        description="Start here before opening the full recommendation backlog."
      >
        <ol className="space-y-3">
          {nextMoves.map((recommendation, index) => (
            <li
              key={recommendation.id}
              className="flex gap-3 rounded-lg border border-border bg-background p-4"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                {index + 1}
              </span>
              <div>
                <p className="font-semibold">{recommendation.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {recommendation.description}
                </p>
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
            Open action plan
            <ArrowRight className="size-4" aria-hidden="true" />
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
            Ask AI Consultant
          </SubmitButton>
        </form>
        <form action={completeBusinessSetup}>
          <input type="hidden" name="businessId" value={business.id} />
          <input type="hidden" name="destination" value="overview" />
          <SubmitButton
            variant="ghost"
            size="lg"
            pendingLabel="Opening report..."
            className="w-full sm:w-auto"
          >
            View overview
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
          <SubmitButton variant="secondary" pendingLabel="Returning...">
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
            <SubmitButton variant="ghost" pendingLabel="Skipping step...">
              Skip for now
            </SubmitButton>
          </form>
        ) : null}
        <form action={goToBusinessSetupStep}>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="step" value={next} />
          <SubmitButton
            variant="primary"
            pendingLabel="Saving step..."
            disabled={!canContinue}
            data-customer-event="setup_step_completed"
            data-customer-surface="guided_setup"
          >
            Save and continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </SubmitButton>
        </form>
      </div>
    </Card>
  );
}

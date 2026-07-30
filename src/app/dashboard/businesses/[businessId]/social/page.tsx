import {
  AuditStatus,
  BusinessProfileStatus,
  CompetitorStatus,
  PlanType,
  ProfilePlatform,
} from "@prisma/client";
import {
  ArrowRight,
  CalendarDays,
  Share2,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { generateSocialStrategyAction } from "@/app/dashboard/businesses/[businessId]/social/actions";
import { LockedFeature } from "@/components/billing/locked-feature";
import { ContextualHelpCard } from "@/components/dashboard/contextual-help-card";
import { DisclosureSection } from "@/components/dashboard/disclosure-section";
import { FloatingScrollControls } from "@/components/dashboard/floating-scroll-controls";
import {
  CompactMetricCard,
  PageIntro,
  ReportSection,
  SectionTabs,
} from "@/components/dashboard/report-ui";
import { SocialPostActions } from "@/components/dashboard/social-post-actions";
import { buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import type { SocialAnalysis } from "@/lib/analyzers/social-analyzer";
import { hasConfirmedWebsite } from "@/lib/audits/audit-applicability";
import {
  canRegenerateSocialStrategy,
  canUseSocialStrategy,
} from "@/lib/billing/entitlements";
import {
  hasBusinessContext,
} from "@/lib/business-context";
import { contextualHelp } from "@/lib/education/help-content";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  parseSocialStrategy,
  socialStrategyPriorityClass,
  socialStrategySourceLabel,
} from "@/lib/social-strategy";
import { cn } from "@/lib/utils";

type BusinessSocialPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams?: Promise<{
    view?: string;
    strategy?: string;
    error?: string;
  }>;
};

type SocialView = "overview" | "strategy" | "content-plan" | "post-ideas";

const socialViews: SocialView[] = [
  "overview",
  "strategy",
  "content-plan",
  "post-ideas",
];

const platformLabels: Record<ProfilePlatform, string> = {
  WEBSITE: "Website",
  GOOGLE_BUSINESS: "Google Business",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  LINKEDIN: "LinkedIn",
  X: "X",
  PINTEREST: "Pinterest",
  OTHER: "Other",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getSocialAnalysis(snapshot: unknown): SocialAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.social)) return null;
  return typeof snapshot.social.score === "number"
    ? (snapshot.social as SocialAnalysis)
    : null;
}

function StrategyGenerateForm({
  businessId,
  hasStrategy,
}: {
  businessId: string;
  hasStrategy: boolean;
}) {
  return (
    <form action={generateSocialStrategyAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <SubmitButton pendingLabel="Generating strategy...">
        <Sparkles className="size-4" />
        {hasStrategy ? "Regenerate Strategy" : "Generate Social Strategy"}
      </SubmitButton>
    </form>
  );
}

function normalizePlatform(value: string) {
  return value.toLowerCase().replace(" shorts", "").replace(/[^a-z]/g, "");
}

function platformState(
  platform: string,
  confirmed: string[],
  pending: string[],
) {
  const normalized = normalizePlatform(platform);
  if (confirmed.some((item) => normalizePlatform(item) === normalized)) {
    return "Confirmed channel";
  }
  if (pending.some((item) => normalizePlatform(item) === normalized)) {
    return "Detected, needs review";
  }
  return "Recommended new channel";
}

function StrategyUnavailable({
  businessId,
  contextAvailable,
  strategyExists,
  hasAccess,
}: {
  businessId: string;
  contextAvailable: boolean;
  strategyExists: boolean;
  hasAccess: boolean;
}) {
  if (!strategyExists && hasAccess) {
    return (
      <Card className="border-dashed p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Generate your Social Strategy</h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              Create platform priorities, content pillars, a weekly plan, post ideas, and conversion guidance from the data already saved for this business.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StrategyGenerateForm businessId={businessId} hasStrategy={false} />
            {!contextAvailable ? (
              <Link href={`/dashboard/businesses/${businessId}/context`} className={buttonVariants({ variant: "secondary" })}>
                Confirm context
              </Link>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <LockedFeature
      title={strategyExists ? "Full Social Strategy is locked" : "Generate a full Social Strategy"}
      description="Platform strategy, content pillars, weekly plans, post ideas, and conversion guidance are packaged for paid plans."
      requiredPlan={PlanType.ONE_TIME_AUDIT}
      preview={[
        "Profile coverage remains available on Free.",
        "Paid plans unlock strategy generation from Business Context and audit data.",
        "Starter and higher can regenerate after context changes.",
      ]}
    />
  );
}

export default async function BusinessSocialPage({
  params,
  searchParams,
}: BusinessSocialPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = searchParams ? await searchParams : {};
  const selectedView = socialViews.includes(query.view as SocialView)
    ? (query.view as SocialView)
    : "overview";
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: user.id },
    include: {
      profiles: {
        orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
        select: { platform: true, status: true, url: true, handle: true },
      },
      competitors: {
        where: { status: CompetitorStatus.ACTIVE },
        orderBy: { name: "asc" },
        select: {
          name: true,
          discoveredProfiles: { select: { status: true } },
        },
      },
      audits: {
        where: { status: AuditStatus.COMPLETED },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { analysisSnapshot: true, scores: true },
      },
      socialStrategies: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!business) notFound();

  const audit = business.audits.at(0);
  const social = audit ? getSocialAnalysis(audit.analysisSnapshot) : null;
  const strategyRecord = business.socialStrategies.at(0);
  const strategy = parseSocialStrategy(strategyRecord);
  const socialDrafts = strategyRecord
    ? await prisma.implementationDraft.findMany({
        where: {
          businessId: business.id,
          userId: user.id,
          sourceKey: { startsWith: `social:${strategyRecord.id}:` },
          status: { not: "ARCHIVED" },
        },
        select: { sourceKey: true },
      })
    : [];
  const savedDraftCount = (itemKind: "post" | "weekly", itemIndex: number) =>
    socialDrafts.filter(
      (draft) =>
        draft.sourceKey ===
        `social:${strategyRecord?.id}:${itemKind}:${itemIndex}`,
    ).length;
  const [strategyAccessCheck, regenerateStrategyCheck] = await Promise.all([
    canUseSocialStrategy(user.id),
    canRegenerateSocialStrategy(user.id),
  ]);
  const canSubmitStrategy = strategy
    ? regenerateStrategyCheck.allowed
    : strategyAccessCheck.allowed;
  const contextAvailable = hasBusinessContext(business);
  const socialProfiles = business.profiles.filter(
    (profile) =>
      profile.platform !== ProfilePlatform.WEBSITE &&
      profile.platform !== ProfilePlatform.GOOGLE_BUSINESS,
  );
  const websiteConfirmed = hasConfirmedWebsite(business.profiles);
  const confirmedPlatforms =
    social?.confirmedPlatforms ??
    socialProfiles
      .filter((profile) => profile.status === BusinessProfileStatus.CONFIRMED)
      .map((profile) => platformLabels[profile.platform]);
  const pendingPlatforms =
    social?.pendingPlatforms ??
    socialProfiles
      .filter((profile) => profile.status === BusinessProfileStatus.PENDING)
      .map((profile) => platformLabels[profile.platform]);
  const potentialPlatforms =
    social?.missingRecommendedPlatforms ??
    strategy?.recommendedPlatforms
      .filter(
        (platform) =>
          platformState(platform.platform, confirmedPlatforms, pendingPlatforms) ===
          "Recommended new channel",
      )
      .map((platform) => platform.platform) ??
    [];
  const mainOpportunity =
    social?.opportunities.at(0) ??
    strategy?.reasoningSummary ??
    "Build a consistent content plan around the channels your audience is most likely to use.";
  const strategyError =
    query.error === "strategy_locked"
      ? "Full Social Strategy generation is available on Full Audit, Starter, Pro, and Agency plans."
      : query.error === "strategy_regen_locked"
        ? "Social Strategy regeneration is available on Starter, Pro, and Agency plans."
        : query.error === "strategy_rate_limited"
          ? "Please wait before generating another Social Strategy."
        : null;
  const tabItems = [
    ["Overview", "overview"],
    ["Strategy", "strategy"],
    ["Content Plan", "content-plan"],
    ["Post Ideas", "post-ideas"],
  ] as const;

  return (
    <div className="space-y-6">
      <PageIntro
        title="Social growth"
        description="Choose the right channels and turn your saved business context into a practical content direction without implying feed or engagement analysis."
        icon={Share2}
        actions={
          canSubmitStrategy ? (
            <StrategyGenerateForm businessId={business.id} hasStrategy={Boolean(strategy)} />
          ) : (
            <Link href="/pricing" className={buttonVariants({ variant: "primary" })}>
              View plans
              <ArrowRight className="size-4" />
            </Link>
          )
        }
      />

      {query.strategy === "generated" ? (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100">
          Social Strategy saved from the latest available business data.
        </div>
      ) : null}
      {strategyError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {strategyError}
        </div>
      ) : null}

      <ContextualHelpCard {...contextualHelp.social} />

      <DisclosureSection
        title="What this analysis used"
        description="Business Context, profile coverage, goals, reviews, and available competitor data."
        compact
      >
        <p className="text-sm leading-6 text-muted">
          The strategy used confirmed and pending profile coverage, saved
          Business Context, goals, review data, available competitor
          information{websiteConfirmed ? ", and website content" : ""}.
          Individual posts, engagement, follower counts, posting frequency, and
          content performance were not analyzed.
        </p>
      </DisclosureSection>

      {!contextAvailable || !business.contextConfirmedAt ? (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-amber-950 dark:text-amber-100">
              Confirm Business Context for sharper audience, offer, tone, and
              conversion guidance. The current saved context still needs your
              review.
            </p>
            <Link href={`/dashboard/businesses/${business.id}/context`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Open context
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <SectionTabs
        items={tabItems.map(([label, view]) => ({
          label,
          href: `/dashboard/businesses/${business.id}/social?view=${view}`,
          active: selectedView === view,
        }))}
      />

      {selectedView === "overview" ? (
        <>
          <Card className="p-5">
            <div className="grid gap-5 lg:grid-cols-[auto_1fr] lg:items-center">
              <div>
                <p className="text-sm font-medium text-muted">Social Presence</p>
                <p className="mt-1 text-4xl font-semibold">
                  {social?.score ?? "--"}
                  {social ? <span className="text-base text-muted">/100</span> : null}
                </p>
              </div>
              <dl className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-foreground/[0.035] p-4">
                  <dt className="text-sm text-muted">Confirmed profiles</dt>
                  <dd className="mt-1 font-semibold">
                    {confirmedPlatforms.join(", ") || "None"}
                  </dd>
                </div>
                <div className="rounded-lg bg-foreground/[0.035] p-4">
                  <dt className="text-sm text-muted">Needs review</dt>
                  <dd className="mt-1 font-semibold">
                    {pendingPlatforms.join(", ") || "None"}
                  </dd>
                </div>
                <div className="rounded-lg bg-foreground/[0.035] p-4">
                  <dt className="text-sm text-muted">Potential channels</dt>
                  <dd className="mt-1 font-semibold">
                    {potentialPlatforms.slice(0, 3).join(", ") ||
                      "No priority gap"}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-xs font-medium text-muted">Main opportunity</p>
              <p className="mt-1 text-sm leading-6">{mainOpportunity}</p>
              {social?.detectedConversionPaths?.length ? (
                <p className="mt-2 text-xs leading-5 text-muted">
                  Saved conversion paths detected: {social.detectedConversionPaths.join(", ")}
                </p>
              ) : null}
            </div>
          </Card>

          {strategy && strategyAccessCheck.allowed ? (
            <ReportSection title="Recommended platform focus" description="The strongest current channel choices based on business fit and available evidence.">
              <div className="grid gap-3 md:grid-cols-3">
                {strategy.recommendedPlatforms.slice(0, 3).map((platform) => (
                  <div key={platform.platform} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold">{platform.platform}</p>
                      <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", socialStrategyPriorityClass(platform.priority))}>
                        {platform.priority}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-medium text-accent">
                      {platformState(platform.platform, confirmedPlatforms, pendingPlatforms)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted">{platform.reason}</p>
                  </div>
                ))}
              </div>
              <Link href={`/dashboard/businesses/${business.id}/social?view=strategy`} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}>
                View full strategy
                <ArrowRight className="size-4" />
              </Link>
            </ReportSection>
          ) : null}

          {!strategyAccessCheck.allowed ? (
            <LockedFeature
              title="Full Social Strategy is locked"
              description="Profile coverage remains available here. Paid packages unlock channel reasoning, content pillars, weekly plans, and post drafts."
              requiredPlan={PlanType.ONE_TIME_AUDIT}
              preview={[
                strategy?.recommendedPlatforms.at(0)
                  ? `Top platform preview: ${strategy.recommendedPlatforms[0].platform}`
                  : "Recommended platform preview",
                "Content direction built from saved Business Context",
                "A practical weekly plan and editable post ideas",
              ]}
            />
          ) : null}

          {social ? (
            <DisclosureSection title="Presence findings" description="Strengths, warnings, opportunities, and recommended fixes from profile coverage.">
              <div className="grid gap-5 md:grid-cols-2">
                {[
                  ["Strengths", social.strengths],
                  ["Warnings", social.warnings],
                  ["Opportunities", social.opportunities],
                  ["Recommended fixes", social.recommendedFixes],
                ].map(([label, items]) => (
                  <div key={label as string}>
                    <p className="text-sm font-semibold">{label as string}</p>
                    <div className="mt-2 space-y-2">
                      {(items as string[]).slice(0, 4).map((item) => (
                        <p key={item} className="text-sm leading-6 text-muted">{item}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </DisclosureSection>
          ) : (
            <Card className="border-dashed p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted">Run an audit to score profile coverage and save social findings.</p>
                <Link href={`/dashboard/businesses/${business.id}/audit/run`} className={buttonVariants({ variant: "primary", size: "sm" })}>Run audit</Link>
              </div>
            </Card>
          )}

          {social?.competitorSocialCoverage?.length ? (
            <DisclosureSection title="Competitor social coverage" description="Manual competitor profile coverage used for channel comparison.">
              <div className="grid gap-3 lg:grid-cols-2">
                {social.competitorSocialCoverage.map((competitor) => (
                  <div key={competitor.competitorName} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{competitor.competitorName}</p>
                      <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold capitalize">{competitor.coverageLevel}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted">Confirmed: {competitor.confirmedPlatforms.join(", ") || "none"}</p>
                    <p className="mt-1 text-sm text-muted">Pending: {competitor.pendingPlatforms.join(", ") || "none"}</p>
                  </div>
                ))}
              </div>
            </DisclosureSection>
          ) : (
            <Card className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Competitor social comparison is not available yet.</p>
                  <p className="mt-1 text-sm text-muted">Add 2-3 competitors to compare channels and content direction.</p>
                </div>
                <Link href={`/dashboard/businesses/${business.id}/competitors`} className={buttonVariants({ variant: "secondary", size: "sm" })}>Add competitors</Link>
              </div>
            </Card>
          )}
        </>
      ) : null}

      {selectedView !== "overview" && (!strategy || !strategyAccessCheck.allowed) ? (
        <StrategyUnavailable
          businessId={business.id}
          contextAvailable={contextAvailable}
          strategyExists={Boolean(strategy)}
          hasAccess={strategyAccessCheck.allowed}
        />
      ) : null}

      {selectedView === "strategy" && strategy && strategyAccessCheck.allowed ? (
        <>
          <Card className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="font-semibold">Generated strategy summary</h3>
                <p className="mt-1 text-sm text-muted">
                  {socialStrategySourceLabel(strategyRecord?.source)} · Updated {strategyRecord?.updatedAt.toLocaleDateString()}
                </p>
              </div>
              <div className="text-sm lg:text-right">
                <p className="font-semibold">Strategy confidence: {strategy.confidence}%</p>
                <p className="mt-1 max-w-md text-xs leading-5 text-muted">
                  Confidence reflects the completeness of available business data, not a guarantee that content will perform.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <CompactMetricCard label="Best channels" value={strategy.recommendedPlatforms.slice(0, 3).map((item) => item.platform).join(", ") || "Not set"} />
              <CompactMetricCard label="Best content direction" value={strategy.contentPillars.at(0)?.title ?? "Not set"} />
              <CompactMetricCard label="Primary conversion goal" value={business.primaryConversionGoal ?? strategy.conversionTips.at(0)?.tip ?? "Not set"} />
            </div>
          </Card>

          <ReportSection title="Recommended platforms" description="Each recommendation distinguishes existing evidence from a genuinely new channel opportunity.">
            <div className="grid gap-4 lg:grid-cols-2">
              {strategy.recommendedPlatforms.map((platform) => {
                const state = platformState(platform.platform, confirmedPlatforms, pendingPlatforms);
                return (
                  <div key={platform.platform} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{platform.platform}</p>
                      <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", socialStrategyPriorityClass(platform.priority))}>{platform.priority} priority</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-accent">{state}</p>
                    <p className="mt-3 text-sm leading-6 text-muted">{platform.reason}</p>
                    <p className="mt-2 text-sm leading-6"><strong>Content fit:</strong> {platform.contentFit}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                      {business.businessType ? <span className="rounded-full border border-border px-2 py-1">Business type: {business.businessType}</span> : null}
                      {business.targetAudience ? <span className="rounded-full border border-border px-2 py-1">Audience context</span> : null}
                      <span className="rounded-full border border-border px-2 py-1">{state}</span>
                      {business.goals.length > 0 ? <span className="rounded-full border border-border px-2 py-1">Goal evidence</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </ReportSection>

          <ReportSection title="Content pillars" description="Repeatable themes keep planning focused without forcing every topic onto one channel.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {strategy.contentPillars.map((pillar) => (
                <div key={pillar.title} className="rounded-lg border border-border bg-background p-4">
                  <p className="font-semibold">{pillar.title}</p>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{pillar.description}</p>
                  <DisclosureSection title="Examples" compact className="mt-3">
                    <ul className="space-y-2 text-sm text-muted">
                      {pillar.exampleTopics.map((topic) => <li key={topic}>{topic}</li>)}
                    </ul>
                    <Link href={`/dashboard/businesses/${business.id}/chat?prompt=${encodeURIComponent(`Generate 5 post ideas for the ${pillar.title} content pillar.`)}`} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-3" })}>Generate ideas</Link>
                  </DisclosureSection>
                </div>
              ))}
            </div>
          </ReportSection>

          <ReportSection title="Conversion strategy" description="Connect attention to a clear business result.">
            <div className="grid gap-3 md:grid-cols-2">
              {strategy.conversionTips.map((tip) => (
                <div key={tip.tip} className="rounded-lg border border-border bg-background p-4">
                  <p className="font-semibold">{tip.tip}</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{tip.reason}</p>
                </div>
              ))}
            </div>
          </ReportSection>

          <DisclosureSection title="View strategy reasoning" description="The full rationale generated from the available business data.">
            <p className="text-sm leading-6 text-muted">{strategy.reasoningSummary}</p>
          </DisclosureSection>
        </>
      ) : null}

      {selectedView === "content-plan" && strategy && strategyAccessCheck.allowed ? (
        <>
          <ReportSection title="Next 3 posts" description="Start with a manageable set before opening the full weekly plan." action={<CalendarDays className="size-5 text-accent" />}>
            <div className="grid gap-4 lg:grid-cols-3">
              {strategy.weeklyPlan.slice(0, 3).map((item, index) => (
                <div key={`${item.day}-${index}`} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{item.day}</p>
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold">{item.platform}</span>
                  </div>
                  <p className="mt-3 text-xs font-medium text-accent">{item.contentType}</p>
                  <div className="mt-3">
                    <SocialPostActions
                      businessId={business.id}
                      itemKey={`plan-${index}-${item.day}`}
                      initialText={`${item.idea}\n\nGoal: ${item.goal}`}
                      aiPrompt={`Refine this planned ${item.platform} post for ${business.name}: ${item.idea}`}
                      allowPosted
                      implementation={strategyRecord ? {
                        businessName: business.name,
                        strategyId: strategyRecord.id,
                        itemKind: "weekly",
                        itemIndex: index,
                        savedCount: savedDraftCount("weekly", index),
                        title: `${item.day} ${item.platform} content plan`,
                      } : undefined}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ReportSection>

          {strategy.weeklyPlan.length > 3 ? (
            <DisclosureSection title="View full 7-day plan" description={`${strategy.weeklyPlan.length - 3} more planned posts`}>
              <div className="grid gap-4 lg:grid-cols-2">
                {strategy.weeklyPlan.slice(3).map((item, index) => (
                  <div key={`${item.day}-${index + 3}`} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{item.day}</p>
                      <span className="rounded-full border border-border px-2.5 py-1 text-xs">{item.platform}</span>
                    </div>
                    <div className="mt-3">
                      <SocialPostActions
                        businessId={business.id}
                        itemKey={`plan-${index + 3}-${item.day}`}
                        initialText={`${item.idea}\n\nGoal: ${item.goal}`}
                        aiPrompt={`Refine this planned ${item.platform} post for ${business.name}: ${item.idea}`}
                        allowPosted
                        implementation={strategyRecord ? {
                          businessName: business.name,
                          strategyId: strategyRecord.id,
                          itemKind: "weekly",
                          itemIndex: index + 3,
                          savedCount: savedDraftCount("weekly", index + 3),
                          title: `${item.day} ${item.platform} content plan`,
                        } : undefined}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </DisclosureSection>
          ) : null}
        </>
      ) : null}

      {selectedView === "post-ideas" && strategy && strategyAccessCheck.allowed ? (
        <ReportSection title="Suggested posts" description="Edit, copy, save, or hand an idea to the AI Consultant without publishing anything automatically." action={<Target className="size-5 text-accent" />}>
          <div className="grid gap-4 lg:grid-cols-2">
            {strategy.suggestedPosts.map((post, index) => (
              <div key={`${post.platform}-${index}`} className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-accent">{post.platform}</p>
                    <h3 className="mt-2 font-semibold">{post.hook}</h3>
                  </div>
                  <Sparkles className="size-4 text-muted" />
                </div>
                <p className="mt-3 text-sm leading-6"><strong>Concept:</strong> {post.postConcept}</p>
                <div className="mt-3">
                  <SocialPostActions
                    businessId={business.id}
                    itemKey={`idea-${index}-${post.platform}`}
                    initialText={`${post.captionDraft}\n\nCTA: ${post.callToAction}`}
                    aiPrompt={`Rewrite and improve this ${post.platform} post for ${business.name}: ${post.captionDraft}`}
                    implementation={strategyRecord ? {
                      businessName: business.name,
                      strategyId: strategyRecord.id,
                      itemKind: "post",
                      itemIndex: index,
                      savedCount: savedDraftCount("post", index),
                      title: `${post.platform} post: ${post.hook}`,
                    } : undefined}
                  />
                </div>
              </div>
            ))}
          </div>
        </ReportSection>
      ) : null}

      <FloatingScrollControls />
    </div>
  );
}

import { AuditStatus, ScoreCategory } from "@prisma/client";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Globe2,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addManualGoogleBusinessProfile,
  confirmGoogleBusinessProfile,
  regenerateGoogleBusinessDiscovery,
  removeGoogleBusinessProfile,
} from "@/app/dashboard/businesses/[businessId]/reviews/actions";
import { ContextualHelpCard } from "@/components/dashboard/contextual-help-card";
import { DisclosureSection } from "@/components/dashboard/disclosure-section";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FloatingScrollControls } from "@/components/dashboard/floating-scroll-controls";
import {
  CompactIssueRow,
  PageIntro,
  PositiveEmptyState,
  ReportSection,
} from "@/components/dashboard/report-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReviewAnalysis } from "@/lib/analyzers/review-analyzer";
import { contextualHelp } from "@/lib/education/help-content";
import { prisma } from "@/lib/prisma";
import {
  buildCurrentReviewAnalysis,
  getReviewFreshnessSummary,
} from "@/lib/reviews/current-review-analysis";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type BusinessReviewsPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type GoogleBusinessProfileView = {
  id: string;
  displayName: string | null;
  formattedAddress: string | null;
  phoneNumber: string | null;
  websiteUri: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  matchConfidence: number | null;
  matchReasons: unknown;
  status: string;
  source: string;
};

const statusStyles = {
  missing: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
  pending: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  confirmed: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100",
};

const googleBusinessStatusLabels = {
  missing: "Not found",
  pending: "Needs review",
  confirmed: "Confirmed",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getMatchReasons(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.reasons)) return [];
  return value.reasons.filter(
    (reason): reason is string => typeof reason === "string",
  );
}

function formatReviewCount(count: number | null | undefined) {
  return typeof count === "number" ? count.toLocaleString() : "not available";
}

function ListingCard({
  businessId,
  profile,
}: {
  businessId: string;
  profile: GoogleBusinessProfileView;
}) {
  const reasons = getMatchReasons(profile.matchReasons);
  const isConfirmed = profile.status === "confirmed";

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
                isConfirmed ? statusStyles.confirmed : statusStyles.pending,
              )}
            >
              {isConfirmed ? "Confirmed by you" : "Awaiting confirmation"}
            </span>
            <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted">
              {profile.source.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-3 font-semibold">
            {profile.displayName ?? "Google Business listing"}
          </p>
          {profile.formattedAddress ? (
            <p className="mt-2 flex gap-2 text-sm leading-6 text-muted">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              {profile.formattedAddress}
            </p>
          ) : null}
          {profile.phoneNumber ? (
            <p className="mt-1 flex gap-2 text-sm text-muted">
              <Phone className="size-4 shrink-0" />
              {profile.phoneNumber}
            </p>
          ) : null}
        </div>
        <div className="text-sm sm:text-right">
          <p className="font-semibold">
            {profile.rating ? `${profile.rating.toFixed(1)} stars` : "Rating unavailable"}
          </p>
          <p className="mt-1 text-muted">
            {formatReviewCount(profile.reviewCount)} reviews
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {profile.googleMapsUri ? (
          <a href={profile.googleMapsUri} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <ExternalLink className="size-4" />
            View Maps
          </a>
        ) : null}
        {profile.websiteUri ? (
          <a href={profile.websiteUri} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Globe2 className="size-4" />
            Website
          </a>
        ) : null}
        {!isConfirmed ? (
          <form action={confirmGoogleBusinessProfile}>
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="profileId" value={profile.id} />
            <button type="submit" className={buttonVariants({ variant: "primary", size: "sm" })}>
              <BadgeCheck className="size-4" />
              Confirm
            </button>
          </form>
        ) : null}
        <form action={removeGoogleBusinessProfile}>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="profileId" value={profile.id} />
          <button
            type="submit"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className:
                "border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/30",
            })}
          >
            <Trash2 className="size-4" />
            Remove
          </button>
        </form>
      </div>

      <DisclosureSection
        title="Match details"
        description={`Discovery confidence: ${profile.matchConfidence ?? 0}%`}
        compact
        className="mt-4"
      >
        {reasons.length > 0 ? (
          <ul className="space-y-2 text-sm leading-6 text-muted">
            {reasons.slice(0, 6).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No detailed match reasons were saved.</p>
        )}
      </DisclosureSection>
    </div>
  );
}

function GoogleListingManager({
  businessId,
  profiles,
}: {
  businessId: string;
  profiles: GoogleBusinessProfileView[];
}) {
  const activeProfiles = profiles.filter((profile) => profile.status !== "removed");
  const hasConfirmed = activeProfiles.some(
    (profile) => profile.status === "confirmed",
  );

  return (
    <DisclosureSection
      title={hasConfirmed ? "Manage Google Business listing" : "Review Google Business discovery"}
      description={
        hasConfirmed
          ? "The confirmed listing is already used as a trust signal. Open this only to replace, remove, or regenerate it."
          : "Confirm a discovered candidate or add a listing manually."
      }
      defaultOpen={!hasConfirmed}
    >
      <div className="space-y-5">
        <div className="flex justify-end">
          <form action={regenerateGoogleBusinessDiscovery}>
            <input type="hidden" name="businessId" value={businessId} />
            <button type="submit" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <RefreshCw className="size-4" />
              Regenerate discovery
            </button>
          </form>
        </div>

        {activeProfiles.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {activeProfiles.map((profile) => (
              <ListingCard key={profile.id} businessId={businessId} profile={profile} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
            No Google Business candidates are saved yet. Regenerate discovery or add a Maps URL / Place ID below.
          </p>
        )}

        <form action={addManualGoogleBusinessProfile} className="grid gap-4 rounded-lg border border-border bg-background p-4 md:grid-cols-[220px_1fr_auto]">
          <input type="hidden" name="businessId" value={businessId} />
          <div className="space-y-2">
            <Label htmlFor="displayName">Listing name</Label>
            <Input id="displayName" name="displayName" placeholder="Optional" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="googleProfileValue">Google Maps URL or Place ID</Label>
            <Input id="googleProfileValue" name="googleProfileValue" placeholder="https://maps.google.com/... or ChIJ..." required />
          </div>
          <div className="flex items-end">
            <button type="submit" className={buttonVariants({ variant: "secondary", className: "w-full md:w-auto" })}>
              <Plus className="size-4" />
              Add listing
            </button>
          </div>
        </form>
      </div>
    </DisclosureSection>
  );
}

function reviewInsight(reviews: ReviewAnalysis) {
  if (
    reviews.googleBusinessStatus === "confirmed" &&
    reviews.reviewPresenceLevel === "strong"
  ) {
    return "Strong review presence. The biggest opportunity is to feature this customer proof more visibly and maintain a consistent review-request process.";
  }
  if (reviews.googleBusinessStatus === "pending") {
    return "A likely Google Business listing is available, but it needs your confirmation before the audit can treat it as trusted evidence.";
  }
  if (reviews.googleBusinessStatus === "missing") {
    return "Trust coverage is limited. Add or confirm a Google Business listing first, then make customer proof visible on key website pages.";
  }
  return reviews.reviewScoreExplanation;
}

export default async function BusinessReviewsPage({
  params,
  searchParams,
}: BusinessReviewsPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = await searchParams;
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: user.id },
    include: {
      profiles: true,
      competitors: {
        select: {
          name: true,
          discoveredProfiles: {
            select: { platform: true, status: true, label: true },
          },
        },
      },
      audits: {
        where: { status: AuditStatus.COMPLETED },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          createdAt: true,
          analysisSnapshot: true,
          recommendations: {
            where: { category: ScoreCategory.REVIEWS },
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
      googleBusinessProfiles: {
        orderBy: [
          { status: "asc" },
          { matchConfidence: "desc" },
          { updatedAt: "desc" },
        ],
      },
    },
  });

  if (!business) notFound();

  const audit = business.audits.at(0);
  const reviews = audit
    ? buildCurrentReviewAnalysis({
        businessProfiles: business.profiles,
        googleBusinessProfiles: business.googleBusinessProfiles,
        competitors: business.competitors.map((competitor) => ({
          name: competitor.name,
          discoveredProfiles: competitor.discoveredProfiles,
        })),
        goals: business.goals,
        primaryGoal: business.primaryGoal,
        businessContext: {
          description: business.description,
          targetAudience: business.targetAudience,
          mainOffer: business.mainOffer,
          industry: business.industry,
          businessType: business.businessType,
          primaryConversionGoal: business.primaryConversionGoal,
        },
        latestAuditSnapshot: audit.analysisSnapshot,
      })
    : null;
  const freshness = audit
    ? getReviewFreshnessSummary({
        latestAuditCreatedAt: audit.createdAt,
        googleBusinessProfiles: business.googleBusinessProfiles,
      })
    : null;
  const primaryGoogleProfile =
    business.googleBusinessProfiles.find(
      (profile) => profile.status === "confirmed",
    ) ??
    business.googleBusinessProfiles.find(
      (profile) => profile.status === "pending",
    ) ??
    null;
  const recommendedActions = reviews
    ? [...new Set([...reviews.opportunities, ...reviews.recommendedFixes])].slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      <PageIntro
        title="Reviews and trust"
        description="Understand whether customers can find credible review signals and whether your Google Business presence is ready to support local trust."
        icon={Star}
        actions={
          <Link
            href={`/dashboard/businesses/${business.id}/action-plan?category=REVIEWS`}
            className={buttonVariants({ variant: "primary", size: "sm" })}
          >
            Review trust actions
            <ArrowRight className="size-4" />
          </Link>
        }
      />

      <ContextualHelpCard {...contextualHelp.reviews} />

      {query.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {query.error === "provider-rate"
            ? "Please wait before requesting another Google Business lookup."
            : "Enter a valid Google Maps URL or Place ID."}
        </div>
      ) : null}

      {freshness?.note ? (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>{freshness.note}</p>
            <Link href={`/dashboard/businesses/${business.id}/audit/run`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Run fresh audit
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {!audit || !reviews ? (
        <>
          <GoogleListingManager businessId={business.id} profiles={business.googleBusinessProfiles} />
          <EmptyState
            compact
            icon={<Star className="size-6" />}
            title="No reviews analysis yet"
            description="Run a new audit to evaluate Google Business presence, review platform coverage, and local trust signals."
            action={
              <Link href={`/dashboard/businesses/${business.id}/audit/run`} className={buttonVariants({ variant: "primary" })}>
                Run audit
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            }
          />
        </>
      ) : (
        <>
          <Card className="p-5">
            <div className="grid gap-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-medium text-muted">Reviews & Trust</p>
                <p className="mt-1 text-4xl font-semibold">{reviews.score}<span className="text-base text-muted">/100</span></p>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", statusStyles[reviews.googleBusinessStatus])}>
                    Google Business{" "}
                    {googleBusinessStatusLabels[reviews.googleBusinessStatus]}
                  </span>
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold capitalize">
                    Presence: {reviews.reviewPresenceLevel}
                  </span>
                </div>
                <p className="mt-3 font-semibold">
                  {primaryGoogleProfile?.displayName ?? reviews.googleBusinessListingName ?? "No confirmed listing"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {reviews.googleRating
                    ? `${reviews.googleRating.toFixed(1)} stars`
                    : "Rating unavailable"}
                  {" \u00b7 "}
                  {formatReviewCount(reviews.googleReviewCount)} reviews
                </p>
              </div>
              <div className="lg:text-right">
                <p className="text-xs font-medium text-muted">Confirmed channels</p>
                <p className="mt-1 text-sm font-semibold">
                  {reviews.confirmedReviewPlatforms.join(", ") || "None yet"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-accent/25 bg-accent/5 p-5">
            <p className="text-sm font-semibold">Key insight</p>
            <p className="mt-2 text-sm leading-6 text-muted">{reviewInsight(reviews)}</p>
          </Card>

          <GoogleListingManager businessId={business.id} profiles={business.googleBusinessProfiles} />

          <div className="grid gap-4 lg:grid-cols-2">
            <ReportSection title="Trust signals" description="What is already working and ready to preserve.">
              {reviews.trustStrengths.length > 0 ? (
                <div className="space-y-2">
                  {reviews.trustStrengths.slice(0, 5).map((strength) => (
                    <p key={strength} className="flex gap-2 text-sm leading-6">
                      <CheckCircle2 className="mt-1 size-4 shrink-0 text-teal-600" />
                      {strength}
                    </p>
                  ))}
                </div>
              ) : <p className="text-sm text-muted">No trust strengths have been recorded yet.</p>}
            </ReportSection>

            <ReportSection title="Coverage status" description="Channels that are ready versus still awaiting review.">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted">Confirmed</p>
                  <p className="mt-1 text-sm font-medium">{reviews.confirmedReviewPlatforms.join(", ") || "None"}</p>
                </div>
                {reviews.pendingReviewPlatforms.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-muted">Needs confirmation</p>
                    <p className="mt-1 text-sm font-medium">{reviews.pendingReviewPlatforms.join(", ")}</p>
                  </div>
                ) : <PositiveEmptyState>No pending review platforms.</PositiveEmptyState>}
                {reviews.trustWarnings.length === 0 ? <PositiveEmptyState>No trust warnings detected.</PositiveEmptyState> : null}
              </div>
            </ReportSection>
          </div>

          <ReportSection
            title="Recommended actions"
            description="Opportunities and fixes are combined into one practical queue."
          >
            {recommendedActions.length > 0 ? recommendedActions.map((action, index) => {
              const requestAction = /request|collect|ask/i.test(action);
              const recommendation =
                audit?.recommendations.find((item) =>
                  requestAction
                    ? /request|collect|ask/i.test(item.title)
                    : /proof|review|trust|google/i.test(item.title),
                ) ?? audit?.recommendations.at(0);

              return (
                <CompactIssueRow
                  key={action}
                  title={action}
                  detail="Strengthen visible customer proof and make review collection part of a repeatable operating process."
                  tone="info"
                  meta={`Priority ${index + 1}`}
                  action={
                    <Link
                      href={`/dashboard/businesses/${business.id}/action-plan?category=REVIEWS${recommendation ? `&q=${encodeURIComponent(recommendation.title)}` : ""}`}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Review action
                      <ArrowRight className="size-4" />
                    </Link>
                  }
                />
              );
            }) : <PositiveEmptyState>No additional trust actions are recommended.</PositiveEmptyState>}
          </ReportSection>

          {reviews.competitorReviewCoverage?.length ? (
            <DisclosureSection title="Competitor review coverage" description="Manual profile coverage used for comparison context.">
              <div className="grid gap-3 lg:grid-cols-2">
                {reviews.competitorReviewCoverage.map((competitor) => (
                  <div key={competitor.competitorName} className="rounded-lg border border-border bg-background p-4">
                    <p className="font-medium">{competitor.competitorName}</p>
                    <p className="mt-2 text-sm text-muted">
                      Google Business: {competitor.hasGoogleBusinessProfile ? "confirmed" : "not confirmed"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Channels: {competitor.confirmedPlatforms.join(", ") || "none confirmed"}
                    </p>
                  </div>
                ))}
              </div>
            </DisclosureSection>
          ) : null}
        </>
      )}

      <FloatingScrollControls />
    </div>
  );
}

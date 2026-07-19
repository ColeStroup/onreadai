import {
  BusinessProfileStatus,
  CompetitorSnapshotStatus,
  CompetitorStatus,
  PlanType,
  ProfilePlatform,
} from "@prisma/client";
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSearch,
  Pencil,
  Plus,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
  Swords,
  X,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addComparisonOpportunity,
  addCompetitor,
  analyzeCompetitor,
  archiveCompetitor,
  refreshAllCompetitors,
  refreshCompetitor,
  setCompetitorGoogleProfileStatus,
  updateCompetitor,
} from "@/app/dashboard/businesses/[businessId]/competitors/actions";
import { LockedFeature } from "@/components/billing/locked-feature";
import { UsageMeter } from "@/components/billing/usage-meter";
import { ContextualHelpCard } from "@/components/dashboard/contextual-help-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FloatingScrollControls } from "@/components/dashboard/floating-scroll-controls";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { canAddCompetitor, getUsageSummary } from "@/lib/billing/entitlements";
import {
  asCompetitorPositioningSnapshot,
  asCompetitorReviewSnapshot,
  asCompetitorSocialSnapshot,
  asCompetitorWebsiteSnapshot,
  asSeoAnalysis,
} from "@/lib/competitors/competitor-types";
import { buildCurrentCompetitorComparison } from "@/lib/competitors/current-comparison";
import { contextualHelp } from "@/lib/education/help-content";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

type BusinessCompetitorsPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const competitorStatusStyles: Record<CompetitorStatus, string> = {
  ACTIVE:
    "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100",
  ARCHIVED:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200",
};

const snapshotStatusStyles: Record<CompetitorSnapshotStatus, string> = {
  PENDING:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200",
  RUNNING:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
  COMPLETED:
    "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100",
  PARTIAL:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  FAILED:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
};

const usableSnapshotStatuses: CompetitorSnapshotStatus[] = [
  CompetitorSnapshotStatus.COMPLETED,
  CompetitorSnapshotStatus.PARTIAL,
];

function textareaClassName() {
  return "min-h-24 w-full resize-y rounded-lg border border-border bg-card px-3 py-3 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20";
}

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function saveMessage(value: string | undefined) {
  const messages: Record<string, string> = {
    added: "Competitor added. Analyze it when you are ready to create a public snapshot.",
    updated: "Competitor updated.",
    archived: "Competitor archived.",
    google_confirmed:
      "Google Business candidate confirmed. Refresh the analysis to update comparison data.",
    google_removed: "Google Business candidate rejected.",
    action_added: "Opportunity added to the Action Plan.",
  };
  return value ? messages[value] ?? null : null;
}

function analysisMessage(value: string | undefined) {
  const messages: Record<string, string> = {
    completed:
      "Website and SEO analysis completed. Some profile and review information may remain unavailable or awaiting confirmation.",
    cached: "The current cached snapshot is still fresh and was reused.",
    partial: "Analysis completed with limited data. Available sections are shown below.",
    failed: "Competitor analysis could not be completed. Review the URL and try again.",
    locked: "Your competitor analysis or refresh allowance has been reached.",
    not_analyzable: "Add a valid public website before analyzing this competitor.",
    running: "This competitor is already being analyzed.",
  };
  return value ? messages[value] ?? null : null;
}

function errorMessage(value: string | undefined) {
  const messages: Record<string, string> = {
    name: "Enter a competitor name before saving.",
    duplicate: "A competitor with that name already exists for this business.",
    competitor_limit:
      "Your current plan has reached the active competitor limit for this business.",
    invalid_url:
      "Enter a public HTTP or HTTPS website. Local, private, credentialed, and unreachable URLs are blocked.",
    opportunity_missing:
      "That opportunity is no longer in the current comparison. Refresh the page and try again.",
  };
  return value ? messages[value] ?? null : null;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not analyzed";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function comparisonLabel(status: string) {
  switch (status) {
    case "business_stronger":
      return "Stronger";
    case "competitor_stronger":
    case "needs_attention":
      return "Needs attention";
    case "similar":
      return "Similar";
    case "not_comparable":
      return "Not comparable";
    case "not_applicable":
      return "Not applicable";
    default:
      return "Data unavailable";
  }
}

function isSocialPlatform(platform: ProfilePlatform) {
  return (
    platform !== ProfilePlatform.WEBSITE &&
    platform !== ProfilePlatform.GOOGLE_BUSINESS &&
    platform !== ProfilePlatform.OTHER
  );
}

function platformName(platform: ProfilePlatform) {
  if (platform === ProfilePlatform.X) return "X";
  return platform
    .toLowerCase()
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export default async function BusinessCompetitorsPage({
  params,
  searchParams,
}: BusinessCompetitorsPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = await searchParams;
  const current = await buildCurrentCompetitorComparison({
    businessId,
    ownerId: user.id,
  });

  if (!current) notFound();

  const { business, activeCompetitors, archivedCompetitors, comparison } = current;
  const [competitorCheck, usage] = await Promise.all([
    canAddCompetitor(user.id, business.id),
    getUsageSummary(user.id, business.id),
  ]);
  const saved = saveMessage(scalar(query.saved));
  const analysis = analysisMessage(scalar(query.analysis));
  const error = errorMessage(scalar(query.error));
  const strongestAdvantage = comparison?.businessAdvantages.at(0) ?? null;
  const strongestCompetitorAdvantage =
    comparison?.competitorAdvantages.at(0) ?? null;
  const topOpportunity = comparison?.opportunities.at(0) ?? null;
  const latestComparisonDate = comparison?.freshness
    .map((item) => item.scannedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <div className="space-y-6">
      <Card id="overview">
        <CardHeader>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Swords className="size-5" />
              </div>
              <CardTitle className="text-2xl">Competitor Intelligence</CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base leading-7">
                Analyze public website, search, profile, review, and positioning
                signals, then compare them with {business.name}. Private traffic,
                sales, and social engagement data are not available.
              </CardDescription>
            </div>
            {activeCompetitors.length > 0 ? (
              <form action={refreshAllCompetitors}>
                <input type="hidden" name="businessId" value={business.id} />
                <SubmitButton pendingLabel="Refreshing competitors...">
                  <RefreshCw className="size-4" />
                  Refresh all
                </SubmitButton>
              </form>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <nav className="flex flex-wrap gap-2" aria-label="Competitor page sections">
            {[
              ["Overview", "#overview"],
              ["Competitor List", "#competitor-list"],
              ["Comparison", "#comparison"],
              ["Opportunities", "#opportunities"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                {label}
              </a>
            ))}
          </nav>
        </CardContent>
      </Card>

      <ContextualHelpCard {...contextualHelp.competitors} />

      <div className="grid gap-4 lg:grid-cols-2">
        {usage.competitors ? (
          <UsageMeter
            label="Active competitors"
            used={usage.competitors.used}
            limit={usage.competitors.limit}
            detail="Competitor storage is counted per business workspace."
          />
        ) : null}
        <UsageMeter
          label="Competitor scans"
          used={usage.competitorScans.used}
          limit={usage.competitorScans.limit}
          detail={`${usage.competitorAnalysis.maxCrawlPages} pages per competitor, with fresh snapshots cached for seven days.`}
        />
      </div>

      {saved || analysis ? (
        <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {saved ?? analysis}
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Comparison Overview</CardTitle>
          <CardDescription>
            A concise view of the latest comparable public snapshots.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeCompetitors.length === 0 ? (
            <p className="text-sm text-muted">No competitors configured.</p>
          ) : !comparison || comparison.analyzedCompetitorCount === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-5">
              <p className="font-semibold">
                {activeCompetitors.length} competitor
                {activeCompetitors.length === 1 ? " is" : "s are"} saved, but
                full analysis has not run.
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Analyze a competitor below and the AI Consultant can use the
                current snapshot immediately. Rerun the business audit when you
                want to save that comparison into the report, PDF, and
                Presentation Mode.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase text-muted">Analyzed</p>
                <p className="mt-2 text-2xl font-semibold">
                  {comparison.analyzedCompetitorCount}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {comparison.staleCompetitorCount} stale, {comparison.failedCompetitorCount} failed
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase text-muted">Your advantage</p>
                <p className="mt-2 text-sm font-semibold">
                  {strongestAdvantage?.title ?? "No confirmed advantage yet"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase text-muted">Competitor edge</p>
                <p className="mt-2 text-sm font-semibold">
                  {strongestCompetitorAdvantage?.title ?? "No clear edge yet"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase text-muted">Best opportunity</p>
                <p className="mt-2 text-sm font-semibold">
                  {topOpportunity?.title ?? "More comparable data needed"}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Updated {formatDate(latestComparisonDate)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="competitor-list">
        <CardHeader>
          <CardTitle>Competitor List</CardTitle>
          <CardDescription>
            Saved competitors remain editable. Each analysis creates a new
            timestamped snapshot instead of overwriting history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeCompetitors.length === 0 ? (
            <EmptyState
              icon={<Swords className="size-6" />}
              title="Track competitors that matter to your business."
              description="Add competitors you want to monitor, compare against, or ask the AI consultant about."
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {activeCompetitors.map((competitor) => {
                const latestSnapshot = competitor.snapshots.at(0) ?? null;
                const usableSnapshot = competitor.snapshots.find((snapshot) =>
                  usableSnapshotStatuses.includes(snapshot.status),
                );
                const website = asCompetitorWebsiteSnapshot(
                  usableSnapshot?.websiteSnapshot,
                );
                const seo = asSeoAnalysis(usableSnapshot?.seoSnapshot);
                const social = asCompetitorSocialSnapshot(
                  usableSnapshot?.socialSnapshot,
                );
                const reviews = asCompetitorReviewSnapshot(
                  usableSnapshot?.reviewsSnapshot,
                );
                const positioning = asCompetitorPositioningSnapshot(
                  usableSnapshot?.positioningSnapshot,
                );
                const confirmedProfiles = competitor.discoveredProfiles.filter(
                  (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
                );
                const pendingProfiles = competitor.discoveredProfiles.filter(
                  (profile) => profile.status === BusinessProfileStatus.PENDING,
                );
                const pendingGoogle = pendingProfiles.filter(
                  (profile) => profile.platform === ProfilePlatform.GOOGLE_BUSINESS,
                );
                const confirmedSocialProfiles = confirmedProfiles.filter(
                  (profile) => isSocialPlatform(profile.platform),
                );
                const pendingSocialProfiles = pendingProfiles.filter((profile) =>
                  isSocialPlatform(profile.platform),
                );
                const sectionStatuses = [
                  ["Website", website ? "Complete" : "Unavailable"],
                  ["SEO", seo ? "Complete" : "Unavailable"],
                  [
                    "Social",
                    social
                      ? pendingSocialProfiles.length > 0
                        ? "Needs confirmation"
                        : "Complete"
                      : "Unavailable",
                  ],
                  [
                    "Reviews",
                    reviews?.rating !== null && reviews?.rating !== undefined
                      ? "Complete"
                      : pendingGoogle.length > 0
                        ? "Needs confirmation"
                        : "Unavailable",
                  ],
                  ["Positioning", positioning ? "Inferred" : "Unavailable"],
                ];
                const comparisonFreshness = comparison?.freshness.find(
                  (item) => item.competitorId === competitor.id,
                );
                const stale = comparisonFreshness?.status === "stale";
                const hasFailedRefresh =
                  latestSnapshot?.status === CompetitorSnapshotStatus.FAILED;
                const analysisStatus = latestSnapshot
                  ? latestSnapshot.status === CompetitorSnapshotStatus.RUNNING
                    ? "Scanning public website and business signals..."
                    : latestSnapshot.status === CompetitorSnapshotStatus.PENDING
                      ? "Waiting to analyze"
                      : latestSnapshot.status === CompetitorSnapshotStatus.PARTIAL
                        ? "Analysis completed with limited data"
                        : latestSnapshot.status === CompetitorSnapshotStatus.FAILED
                          ? usableSnapshot
                            ? "Refresh failed; showing the previous snapshot"
                            : "Competitor analysis could not be completed"
                          : stale
                            ? "Snapshot is stale"
                            : "Current public snapshot"
                  : "Saved, not analyzed yet";

                return (
                  <article
                    key={competitor.id}
                    id={`competitor-${competitor.id}`}
                    className="rounded-lg border border-border bg-background p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold">{competitor.name}</h3>
                        {competitor.websiteUrl ? (
                          <a
                            href={competitor.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex max-w-full items-center gap-2 break-all text-sm text-muted hover:text-foreground"
                          >
                            {competitor.websiteUrl}
                            <ExternalLink className="size-3.5 shrink-0" />
                          </a>
                        ) : (
                          <p className="mt-1 text-sm text-muted">No website saved.</p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "w-fit rounded-full border px-2.5 py-1 text-xs font-semibold",
                          latestSnapshot
                            ? snapshotStatusStyles[latestSnapshot.status]
                            : competitorStatusStyles[competitor.status],
                        )}
                      >
                        {latestSnapshot
                          ? latestSnapshot.status.toLowerCase()
                          : "not analyzed"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs text-muted">Profiles</p>
                        <p className="mt-1 text-sm font-semibold">
                          {confirmedProfiles.length} confirmed / {pendingProfiles.length} pending
                        </p>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs text-muted">Pages scanned</p>
                        <p className="mt-1 text-sm font-semibold">
                          {website?.crawl?.pagesScanned ??
                            (website?.homepage ? 1 : "Not available")}
                        </p>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <p className="text-xs text-muted">Google / reviews</p>
                        <p className="mt-1 text-sm font-semibold">
                          {reviews?.rating !== null && reviews?.rating !== undefined
                            ? `${reviews.rating.toFixed(1)} / ${reviews.reviewCount?.toLocaleString() ?? "count unavailable"}`
                            : reviews?.status.replaceAll("_", " ") ?? "Not analyzed"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-start gap-2 rounded-md border border-border p-3">
                      {hasFailedRefresh ? (
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />
                      ) : stale ? (
                        <Clock3 className="mt-0.5 size-4 shrink-0 text-amber-600" />
                      ) : (
                        <Activity className="mt-0.5 size-4 shrink-0 text-accent" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{analysisStatus}</p>
                        <p className="mt-1 text-xs text-muted">
                          Last analyzed: {formatDate(usableSnapshot?.scannedAt)}
                        </p>
                        {latestSnapshot?.errorMessage ? (
                          <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                            {latestSnapshot.errorMessage}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {usableSnapshot ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {sectionStatuses.map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-md border border-border px-2.5 py-2"
                          >
                            <p className="text-[11px] font-medium text-muted">
                              {label}
                            </p>
                            <p className="mt-0.5 text-xs font-semibold">{value}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {pendingGoogle.map((profile) => (
                      <div
                        key={profile.id}
                        className="mt-4 rounded-md border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20"
                      >
                        <p className="text-sm font-semibold">Google listing needs confirmation</p>
                        <p className="mt-1 break-all text-xs text-muted">
                          {profile.urlOrHandle ?? "Public listing candidate"} / {profile.confidenceScore}% match confidence
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <form action={setCompetitorGoogleProfileStatus}>
                            <input type="hidden" name="businessId" value={business.id} />
                            <input type="hidden" name="profileId" value={profile.id} />
                            <input type="hidden" name="status" value="confirmed" />
                            <button
                              type="submit"
                              className={buttonVariants({ variant: "secondary", size: "sm" })}
                            >
                              <Check className="size-4" /> Confirm
                            </button>
                          </form>
                          <form action={setCompetitorGoogleProfileStatus}>
                            <input type="hidden" name="businessId" value={business.id} />
                            <input type="hidden" name="profileId" value={profile.id} />
                            <input type="hidden" name="status" value="removed" />
                            <button
                              type="submit"
                              className={buttonVariants({ variant: "ghost", size: "sm" })}
                            >
                              <X className="size-4" /> Reject
                            </button>
                          </form>
                        </div>
                      </div>
                    ))}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {competitor.websiteUrl ? (
                        <form
                          action={usableSnapshot ? refreshCompetitor : analyzeCompetitor}
                        >
                          <input type="hidden" name="businessId" value={business.id} />
                          <input type="hidden" name="competitorId" value={competitor.id} />
                          <SubmitButton
                            pendingLabel={usableSnapshot ? "Refreshing..." : "Analyzing..."}
                          >
                            {usableSnapshot ? (
                              <RefreshCw className="size-4" />
                            ) : (
                              <FileSearch className="size-4" />
                            )}
                            {usableSnapshot ? "Refresh" : "Analyze"}
                          </SubmitButton>
                        </form>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className={buttonVariants({ variant: "secondary", size: "sm" })}
                          title="Add a public website URL before analyzing this competitor."
                        >
                          <FileSearch className="size-4" /> Add website to analyze
                        </button>
                      )}
                      <Link
                        href={`/dashboard/businesses/${business.id}/competitors/${competitor.id}/profiles`}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        <SearchCheck className="size-4" /> Manage profiles
                      </Link>
                      {usableSnapshot ? (
                        <a
                          href={`#analysis-${competitor.id}`}
                          className={buttonVariants({ variant: "secondary", size: "sm" })}
                        >
                          <BarChart3 className="size-4" /> View analysis
                        </a>
                      ) : null}
                    </div>

                    {usableSnapshot ? (
                      <details
                        id={`analysis-${competitor.id}`}
                        className="mt-4 rounded-md border border-border p-4"
                      >
                        <summary className="cursor-pointer font-semibold">
                          Public analysis details
                        </summary>
                        <div className="mt-4 space-y-4 text-sm">
                          <div>
                            <p className="font-semibold">Website</p>
                            <p className="mt-1 leading-6 text-muted">
                              Score {usableSnapshot.websiteScore ?? "unavailable"}; homepage title: {website?.homepage.pageTitle ?? "not detected"}; primary H1: {website?.homepage.h1Text.at(0) ?? "not detected"}.
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold">SEO</p>
                            <p className="mt-1 leading-6 text-muted">
                              Score {seo?.score ?? "unavailable"}; robots.txt {seo?.robotsTxtStatus ?? "not checked"}; sitemap {seo?.sitemapStatus ?? "not checked"}.
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold">Social coverage</p>
                            <p className="mt-1 leading-6 text-muted">
                              {confirmedSocialProfiles.length} confirmed profile
                              {confirmedSocialProfiles.length === 1 ? "" : "s"}
                              {confirmedSocialProfiles.length > 0
                                ? ` across ${[
                                    ...new Set(
                                      confirmedSocialProfiles.map((profile) =>
                                        platformName(profile.platform),
                                      ),
                                    ),
                                  ].join(", ")}`
                                : ""}
                              ; {pendingSocialProfiles.length} additional link
                              {pendingSocialProfiles.length === 1 ? "" : "s"} awaiting
                              confirmation
                              {pendingSocialProfiles.length > 0
                                ? ` across ${[
                                    ...new Set(
                                      pendingSocialProfiles.map((profile) =>
                                        platformName(profile.platform),
                                      ),
                                    ),
                                  ].join(", ")}`
                                : ""}
                              .
                            </p>
                            {social?.detectedPlatforms.length ? (
                              <p className="mt-1 text-xs leading-5 text-muted">
                                The scan detected public links across {social.detectedPlatforms.join(", ")}. Current confirmation records above determine which links count as confirmed.
                              </p>
                            ) : null}
                          </div>
                          <div>
                            <p className="font-semibold">Positioning</p>
                            <p className="mt-1 leading-6 text-muted">
                              {positioning?.positioningStatement ?? "Insufficient public copy for a positioning summary."}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              Primary CTA clarity: {positioning?.primaryCtaClarity?.replaceAll("_", " ").toLowerCase() ?? "not assessed"}; structurally clear action: {positioning?.primaryCTA ?? "not verified"}; confidence {positioning?.confidence ?? 0}%.
                            </p>
                            {positioning?.detectedActionTypes?.length ? (
                              <p className="mt-1 text-xs text-muted">
                                Detected action types: {positioning.detectedActionTypes.join(", ")}.
                              </p>
                            ) : null}
                          </div>
                          <p className="rounded-md border border-border bg-card p-3 text-xs leading-5 text-muted">
                            Confirmed profile coverage is compared separately from pending and website-detected links. Individual posts and engagement metrics have not been analyzed.
                          </p>
                          <details className="rounded-md border border-border p-3">
                            <summary className="cursor-pointer text-sm font-semibold">
                              Technical details
                            </summary>
                            <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
                              <p>Snapshot date: {formatDate(usableSnapshot.scannedAt)}</p>
                              <p>Source: {usableSnapshot.source ?? "manual"}</p>
                              <p>Website score: {usableSnapshot.websiteScore ?? "N/A"}</p>
                              <p>SEO score: {usableSnapshot.seoScore ?? "N/A"}</p>
                              <p>Confirmed social profiles: {confirmedSocialProfiles.length}</p>
                              <p>Pending social links: {pendingSocialProfiles.length}</p>
                              <p>
                                Google review metrics: {reviews?.rating !== null && reviews?.rating !== undefined ? "Available" : "Unavailable"}
                              </p>
                            </div>
                          </details>
                        </div>
                      </details>
                    ) : null}

                    {competitor.notes ? (
                      <p className="mt-4 rounded-md border border-border p-3 text-sm leading-6 text-muted">
                        {competitor.notes}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                      <details>
                        <summary
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                            "cursor-pointer list-none",
                          )}
                        >
                          <Pencil className="size-4" /> Edit
                        </summary>
                        <form
                          action={updateCompetitor}
                          className="mt-3 space-y-3 rounded-md border border-border p-3"
                        >
                          <input type="hidden" name="businessId" value={business.id} />
                          <input type="hidden" name="competitorId" value={competitor.id} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`name-${competitor.id}`}>Name</Label>
                              <Input id={`name-${competitor.id}`} name="name" defaultValue={competitor.name} required />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`website-${competitor.id}`}>Website</Label>
                              <Input id={`website-${competitor.id}`} name="websiteUrl" defaultValue={competitor.websiteUrl ?? ""} />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`notes-${competitor.id}`}>Notes</Label>
                            <textarea id={`notes-${competitor.id}`} name="notes" defaultValue={competitor.notes ?? ""} className={textareaClassName()} />
                          </div>
                          <SubmitButton pendingLabel="Saving...">Save changes</SubmitButton>
                        </form>
                      </details>
                      <form action={archiveCompetitor}>
                        <input type="hidden" name="businessId" value={business.id} />
                        <input type="hidden" name="competitorId" value={competitor.id} />
                        <button
                          type="submit"
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          <Archive className="size-4" /> Archive
                        </button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="comparison">
        <CardHeader>
          <CardTitle>Side-by-Side Comparison</CardTitle>
          <CardDescription>
            Scores are shown only where both public datasets are genuinely
            comparable. Every observation includes its underlying evidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!current.latestAudit ? (
            <EmptyState
              icon={<BarChart3 className="size-6" />}
              title="Run the business audit first"
              description="A current business website, SEO, social, and reviews baseline is needed before competitor snapshots can be compared fairly."
              action={
                <Link
                  href={`/dashboard/businesses/${business.id}/audit/run`}
                  className={buttonVariants({ variant: "primary" })}
                >
                  Run audit <ArrowRight className="size-4" />
                </Link>
              }
            />
          ) : !comparison || comparison.categoryComparisons.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="font-semibold">No comparable snapshots yet</p>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted">
                Analyze at least one active competitor with a public website.
                Missing data is left unavailable rather than guessed.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {activeCompetitors.map((competitor) => {
                const rows = comparison.categoryComparisons.filter(
                  (item) => item.competitorId === competitor.id,
                );
                if (rows.length === 0) return null;

                return (
                  <div key={competitor.id} className="overflow-hidden rounded-lg border border-border">
                    <div className="border-b border-border bg-background px-4 py-3">
                      <h3 className="font-semibold">
                        {business.name} vs. {competitor.name}
                      </h3>
                    </div>
                    <div className="hidden grid-cols-[0.8fr_1fr_1fr_0.8fr_2fr] gap-3 border-b border-border bg-card px-4 py-3 text-xs font-semibold uppercase text-muted lg:grid">
                      <span>Category</span>
                      <span>{business.name}</span>
                      <span>{competitor.name}</span>
                      <span>Result</span>
                      <span>Observation</span>
                    </div>
                    {rows.map((row) => (
                      <div
                        key={`${row.competitorId}-${row.category}`}
                        className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 lg:grid-cols-[0.8fr_1fr_1fr_0.8fr_2fr] lg:items-start"
                      >
                        <p className="font-semibold capitalize">{row.category}</p>
                        <p className="text-sm">{row.businessDisplay}</p>
                        <p className="text-sm">{row.competitorDisplay}</p>
                        <span className="w-fit rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold">
                          {comparisonLabel(row.status)}
                        </span>
                        <div>
                          <p className="text-sm leading-6 text-muted">{row.observation}</p>
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-semibold text-foreground">
                              View evidence
                            </summary>
                            <div className="mt-2 space-y-2">
                              {row.evidence.map((item) => (
                                <div key={`${row.category}-${item.label}`} className="rounded-md border border-border p-2 text-xs leading-5 text-muted">
                                  <p className="font-semibold text-foreground">{item.label}</p>
                                  <p>{business.name}: {item.businessValue}</p>
                                  <p>{competitor.name}: {item.competitorValue}</p>
                                  {item.sourceUrls.length > 0 ? (
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      {item.sourceUrls.slice(0, 3).map((url, index) => (
                                        <a
                                          key={url}
                                          href={url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="font-medium text-accent hover:underline"
                                        >
                                          Source {index + 1}
                                        </a>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="text-xs font-semibold uppercase text-muted">Data limits</p>
                <ul className="mt-2 space-y-1 text-sm leading-6 text-muted">
                  {comparison.limitations.slice(0, 6).map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="opportunities">
        <CardHeader>
          <CardTitle>Evidence-Based Opportunities</CardTitle>
          <CardDescription>
            Choose the differences worth acting on. Nothing is added to your
            Action Plan automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!comparison?.opportunities.length ? (
            <p className="text-sm text-muted">
              Analyze a competitor to surface supported opportunities.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {comparison.opportunities.slice(0, 6).map((opportunity) => (
                <article key={opportunity.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold capitalize">
                      {opportunity.category}
                    </span>
                    <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold capitalize">
                      {opportunity.confidence} confidence
                    </span>
                  </div>
                  <h3 className="mt-3 font-semibold">{opportunity.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {opportunity.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {opportunity.confidence === "high" ? (
                      <form action={addComparisonOpportunity}>
                        <input type="hidden" name="businessId" value={business.id} />
                        <input type="hidden" name="opportunityId" value={opportunity.id} />
                        <SubmitButton pendingLabel="Adding...">
                          <Plus className="size-4" /> Add to Action Plan
                        </SubmitButton>
                      </form>
                    ) : null}
                    <Link
                      href={`/dashboard/businesses/${business.id}/chat?prompt=${encodeURIComponent(`Help me act on this competitor opportunity: ${opportunity.title}. Use the saved comparison evidence.`)}`}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Ask AI to help
                    </Link>
                    <details>
                      <summary className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "cursor-pointer list-none")}>View evidence</summary>
                      <div className="mt-2 min-w-64 space-y-2 rounded-md border border-border p-3 text-xs text-muted">
                        {opportunity.evidence.map((item) => (
                          <div key={item.label}>
                            <p className="font-semibold text-foreground">{item.label}</p>
                            <p>{business.name}: {item.businessValue}</p>
                            <p>{opportunity.competitorName}: {item.competitorValue}</p>
                            {item.sourceUrls.length > 0 ? (
                              <div className="mt-1 flex flex-wrap gap-2">
                                {item.sourceUrls.slice(0, 3).map((url, index) => (
                                  <a
                                    key={url}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-accent hover:underline"
                                  >
                                    Source {index + 1}
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {competitorCheck.allowed ? (
        <Card>
          <CardHeader>
            <CardTitle>Add Competitor</CardTitle>
            <CardDescription>
              A public website unlocks website, SEO, positioning, profile, and
              optional Google Places analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addCompetitor} className="space-y-4">
              <input type="hidden" name="businessId" value={business.id} />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="competitorName">Competitor name</Label>
                  <Input id="competitorName" name="name" placeholder="Northstar Creative Co." required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="competitorWebsite">Website URL optional</Label>
                  <Input id="competitorWebsite" name="websiteUrl" placeholder="https://example.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="competitorNotes">Notes optional</Label>
                <textarea id="competitorNotes" name="notes" className={textareaClassName()} placeholder="Why this competitor matters or what you want to compare." />
              </div>
              <SubmitButton pendingLabel="Adding competitor...">
                <Plus className="size-4" /> Add competitor
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      ) : (
        <LockedFeature
          title="Competitor limit reached"
          description={competitorCheck.reason ?? "Upgrade to track more competitors."}
          requiredPlan={PlanType.STARTER}
          preview={[
            "Keep reviewing existing competitor snapshots.",
            "Upgrade to add more active competitors.",
            "Plan-specific analysis limits are enforced before network requests.",
          ]}
        />
      )}

      {archivedCompetitors.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Archived Competitors</CardTitle>
            <CardDescription>
              Historical snapshots remain stored, but archived competitors are
              excluded from new audits and comparisons.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {archivedCompetitors.map((competitor) => (
              <div key={competitor.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{competitor.name}</p>
                    <p className="mt-1 break-all text-sm text-muted">
                      {competitor.websiteUrl ?? "No website URL saved."}
                    </p>
                  </div>
                  <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", competitorStatusStyles[competitor.status])}>
                    archived
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm leading-6 text-muted">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
        <p>
          Analysis uses publicly observable website pages, detected or confirmed
          profiles, and Google Places data when configured. It does not know
          competitor traffic, sales, ad spend, private analytics, or social post
          performance.
        </p>
      </div>

      <FloatingScrollControls />
    </div>
  );
}

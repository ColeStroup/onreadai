import {
  ArrowLeft,
  BadgeCheck,
  ExternalLink,
  Pencil,
  Plus,
  SearchCheck,
  Trash2,
} from "lucide-react";
import { BusinessProfileStatus, ProfilePlatform } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addManualCompetitorProfile,
  confirmCompetitorProfile,
  removeCompetitorProfile,
  updateCompetitorProfile,
} from "@/app/dashboard/businesses/[businessId]/competitors/[competitorId]/profiles/actions";
import { EmptyState } from "@/components/dashboard/empty-state";
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
import { platformLabels } from "@/lib/profiles/platforms";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

type CompetitorProfilesPageProps = {
  params: Promise<{ businessId: string; competitorId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const platformOrder: ProfilePlatform[] = [
  ProfilePlatform.WEBSITE,
  ProfilePlatform.GOOGLE_BUSINESS,
  ProfilePlatform.INSTAGRAM,
  ProfilePlatform.FACEBOOK,
  ProfilePlatform.TIKTOK,
  ProfilePlatform.YOUTUBE,
  ProfilePlatform.LINKEDIN,
  ProfilePlatform.X,
  ProfilePlatform.PINTEREST,
  ProfilePlatform.OTHER,
];

const statusStyles: Record<BusinessProfileStatus, string> = {
  PENDING:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  CONFIRMED:
    "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100",
  REMOVED:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
};

function confidenceTone(score: number) {
  if (score >= 80) {
    return "text-teal-700 dark:text-teal-200";
  }

  if (score >= 60) {
    return "text-amber-700 dark:text-amber-200";
  }

  return "text-rose-700 dark:text-rose-200";
}

function errorMessage(error: string | string[] | undefined) {
  if (error === "profile-value") {
    return "Enter a profile URL or handle before saving.";
  }

  if (error === "manual-profile") {
    return "Choose a platform and enter a valid URL or handle.";
  }

  return null;
}

function isExternalLink(value: string | null) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export default async function CompetitorProfilesPage({
  params,
  searchParams,
}: CompetitorProfilesPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId, competitorId } = await params;
  const query = await searchParams;
  const competitor = await prisma.competitor.findFirst({
    where: {
      id: competitorId,
      businessId,
      business: {
        ownerId: user.id,
      },
    },
    include: {
      discoveredProfiles: {
        orderBy: [
          { status: "asc" },
          { confidenceScore: "desc" },
          { createdAt: "asc" },
        ],
      },
    },
  });

  if (!competitor) {
    notFound();
  }

  const error = errorMessage(query.error);
  const confirmedCount = competitor.discoveredProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  ).length;
  const pendingCount = competitor.discoveredProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.PENDING,
  ).length;

  return (
    <div className="space-y-6">
      <Link
        href={`/dashboard/businesses/${businessId}/competitors`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <ArrowLeft className="size-4" />
        Back to competitors
      </Link>

      <Card>
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <SearchCheck className="size-5" />
          </div>
          <CardTitle className="text-2xl">Review competitor profiles</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Confirm the profiles that belong to {competitor.name}, edit anything
            incorrect, or remove profiles that should not be tracked.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted">
            {confirmedCount} confirmed
          </span>
          <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted">
            {pendingCount} pending
          </span>
          {competitor.websiteUrl ? (
            <span className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted">
              Source: {competitor.websiteUrl}
            </span>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {competitor.discoveredProfiles.length === 0 ? (
        <EmptyState
          icon={<SearchCheck className="size-6" />}
          title="No competitor profiles discovered yet"
          description="Add the public profile links you want to track for this competitor."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {competitor.discoveredProfiles.map((profile) => (
            <Card key={profile.id}>
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{profile.label}</CardTitle>
                    <p className="mt-1 break-all text-sm text-muted">
                      {profile.urlOrHandle ?? "No URL or handle saved."}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-semibold",
                      statusStyles[profile.status],
                    )}
                  >
                    {profile.status.toLowerCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                  <span className="text-xs text-muted">Confidence</span>
                  <span
                    className={cn(
                      "text-lg font-semibold",
                      confidenceTone(profile.confidenceScore),
                    )}
                  >
                    {profile.confidenceScore}%
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isExternalLink(profile.urlOrHandle) ? (
                  <a
                    href={profile.urlOrHandle ?? ""}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
                  >
                    Open profile
                    <ExternalLink className="size-4" />
                  </a>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <form action={confirmCompetitorProfile}>
                    <input type="hidden" name="businessId" value={businessId} />
                    <input
                      type="hidden"
                      name="competitorId"
                      value={competitor.id}
                    />
                    <input type="hidden" name="profileId" value={profile.id} />
                    <button
                      type="submit"
                      className={buttonVariants({
                        variant:
                          profile.status === BusinessProfileStatus.CONFIRMED
                            ? "secondary"
                            : "primary",
                        size: "sm",
                      })}
                    >
                      <BadgeCheck className="size-4" />
                      Confirm
                    </button>
                  </form>

                  <details>
                    <summary
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "cursor-pointer list-none",
                      )}
                    >
                      <Pencil className="size-4" />
                      Edit
                    </summary>
                    <div className="mt-3 rounded-lg border border-border bg-background p-3">
                      <form action={updateCompetitorProfile} className="space-y-3">
                        <input
                          type="hidden"
                          name="businessId"
                          value={businessId}
                        />
                        <input
                          type="hidden"
                          name="competitorId"
                          value={competitor.id}
                        />
                        <input
                          type="hidden"
                          name="profileId"
                          value={profile.id}
                        />
                        <div className="space-y-2">
                          <Label htmlFor={`profileValue-${profile.id}`}>
                            URL or handle
                          </Label>
                          <Input
                            id={`profileValue-${profile.id}`}
                            name="profileValue"
                            defaultValue={profile.urlOrHandle ?? ""}
                            placeholder="https://example.com or @handle"
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          className={buttonVariants({
                            variant: "primary",
                            size: "sm",
                          })}
                        >
                          Save changes
                        </button>
                      </form>
                    </div>
                  </details>

                  <form action={removeCompetitorProfile}>
                    <input type="hidden" name="businessId" value={businessId} />
                    <input
                      type="hidden"
                      name="competitorId"
                      value={competitor.id}
                    />
                    <input type="hidden" name="profileId" value={profile.id} />
                    <button
                      type="submit"
                      className={buttonVariants({
                        variant: "danger",
                        size: "sm",
                      })}
                      disabled={profile.status === BusinessProfileStatus.REMOVED}
                    >
                      <Trash2 className="size-4" />
                      Remove
                    </button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add profile manually</CardTitle>
          <CardDescription>
            Add a public competitor profile link or handle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={addManualCompetitorProfile}
            className="grid gap-4 md:grid-cols-[220px_1fr_auto]"
          >
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="competitorId" value={competitor.id} />
            <div className="space-y-2">
              <Label htmlFor="manualPlatform">Platform</Label>
              <select
                id="manualPlatform"
                name="platform"
                className="flex h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
                defaultValue={ProfilePlatform.WEBSITE}
              >
                {platformOrder.map((platform) => (
                  <option key={platform} value={platform}>
                    {platformLabels[platform]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manualProfileValue">URL or handle</Label>
              <Input
                id="manualProfileValue"
                name="profileValue"
                placeholder="https://example.com or @handle"
                required
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className={buttonVariants({
                  variant: "secondary",
                  className: "w-full md:w-auto",
                })}
              >
                <Plus className="size-4" />
                Add profile
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

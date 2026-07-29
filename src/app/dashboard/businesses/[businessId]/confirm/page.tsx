import { BusinessProfileStatus, ProfilePlatform } from "@prisma/client";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ExternalLink,
  Plus,
  RotateCcw,
  SearchCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addManualProfile,
  confirmProfile,
  prepareAuditRun,
  removeProfile,
  restoreProfile,
  updateProfile,
} from "@/app/dashboard/businesses/[businessId]/confirm/actions";
import { DisclosureSection } from "@/components/dashboard/disclosure-section";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  DataSourceNotice,
  PageIntro,
  SummaryStrip,
} from "@/components/dashboard/report-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { platformLabels } from "@/lib/profiles/platforms";
import {
  hasConfirmedAuditablePresence,
  hasConfirmedWebsite,
} from "@/lib/audits/audit-applicability";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type ConfirmBusinessPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type ProfileView = {
  id: string;
  platform: ProfilePlatform;
  displayName: string | null;
  url: string | null;
  handle: string | null;
  confidenceScore: number;
  status: BusinessProfileStatus;
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

function getProfileValue(profile: Pick<ProfileView, "url" | "handle">) {
  return profile.url || profile.handle || "";
}

function confidenceLabel(score: number) {
  if (score >= 80) return "High-confidence match";
  if (score >= 50) return "Possible match";
  return "Low-confidence match";
}

function ProfileEditForm({
  businessId,
  profile,
}: {
  businessId: string;
  profile: ProfileView;
}) {
  return (
    <DisclosureSection
      title="Edit profile"
      description="Update the saved public URL. Edited discovered profiles return to review."
      compact
    >
      <form action={updateProfile} className="space-y-3">
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="profileId" value={profile.id} />
        <div className="space-y-2">
          <Label htmlFor={`profileValue-${profile.id}`}>Public profile URL</Label>
          <Input
            id={`profileValue-${profile.id}`}
            name="profileValue"
            defaultValue={getProfileValue(profile)}
            placeholder="https://example.com/profile"
            required
          />
        </div>
        <SubmitButton
          variant="primary"
          size="sm"
          pendingLabel="Saving..."
        >
          Save changes
        </SubmitButton>
      </form>
    </DisclosureSection>
  );
}

function ProfileCard({
  businessId,
  profile,
}: {
  businessId: string;
  profile: ProfileView;
}) {
  const isPending = profile.status === BusinessProfileStatus.PENDING;
  const isConfirmed = profile.status === BusinessProfileStatus.CONFIRMED;
  const isRemoved = profile.status === BusinessProfileStatus.REMOVED;
  const profileValue = getProfileValue(profile);

  return (
    <Card className={cn(isRemoved && "bg-foreground/[0.02]")}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold">
                {platformLabels[profile.platform]}
              </span>
              {isConfirmed ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100">
                  <BadgeCheck className="size-3.5" />
                  Confirmed by you
                </span>
              ) : null}
              {isRemoved ? (
                <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-muted">
                  Removed
                </span>
              ) : null}
            </div>
            <p className="mt-3 font-semibold">
              {profile.displayName ?? platformLabels[profile.platform]}
            </p>
            <p className="mt-1 break-all text-sm text-muted">
              {profileValue || "No URL or handle saved"}
            </p>
          </div>
          {isPending ? (
            <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              <span className="block text-xs">Automated match</span>
              <span className="text-sm font-semibold">
                {confidenceLabel(profile.confidenceScore)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {profile.url ? (
            <a
              href={profile.url}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <ExternalLink className="size-4" />
              Open profile
            </a>
          ) : null}
          {isPending ? (
            <form action={confirmProfile}>
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="profileId" value={profile.id} />
              <SubmitButton
                variant="primary"
                size="sm"
                pendingLabel="Confirming..."
              >
                <BadgeCheck className="size-4" />
                Confirm
              </SubmitButton>
            </form>
          ) : null}
          {isRemoved ? (
            <form action={restoreProfile}>
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="profileId" value={profile.id} />
              <SubmitButton
                variant="secondary"
                size="sm"
                pendingLabel="Restoring..."
              >
                <RotateCcw className="size-4" />
                Restore
              </SubmitButton>
            </form>
          ) : null}
          {!isRemoved ? (
            <form action={removeProfile}>
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="profileId" value={profile.id} />
              <SubmitButton
                variant="outline"
                size="sm"
                pendingLabel="Removing..."
                className="border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/30"
              >
                <Trash2 className="size-4" />
                Remove
              </SubmitButton>
            </form>
          ) : null}
        </div>

        <ProfileEditForm businessId={businessId} profile={profile} />

        {isConfirmed ? (
          <DisclosureSection
            title="Discovery details"
            description="The automated confidence shown before you confirmed this profile."
            compact
          >
            <p className="text-sm text-muted">
              Original discovery confidence: {profile.confidenceScore}%
            </p>
          </DisclosureSection>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function ConfirmBusinessPage({
  params,
  searchParams,
}: ConfirmBusinessPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = await searchParams;
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: user.id },
    include: {
      profiles: {
        orderBy: [{ confidenceScore: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!business) {
    notFound();
  }

  const pendingProfiles = business.profiles.filter(
    (profile) => profile.status === BusinessProfileStatus.PENDING,
  );
  const confirmedProfiles = business.profiles.filter(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const removedProfiles = business.profiles.filter(
    (profile) => profile.status === BusinessProfileStatus.REMOVED,
  );
  const websiteConfirmed = hasConfirmedWebsite(business.profiles);
  const canRunAudit = hasConfirmedAuditablePresence(business.profiles);

  return (
    <div className="space-y-6">
      <PageIntro
        title="Advanced profile management"
        description="Review and maintain saved sources outside the guided setup flow."
        icon={SearchCheck}
        actions={
          <Link
            href={`/dashboard/businesses/${business.id}/setup?step=profiles`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <ArrowLeft className="size-4" />
            Return to guided setup
          </Link>
        }
      />

      <SummaryStrip>
        <strong>{confirmedProfiles.length} confirmed</strong>
        <span className="text-muted">{pendingProfiles.length} awaiting review</span>
        <span className="text-muted">{removedProfiles.length} removed</span>
      </SummaryStrip>

      {!websiteConfirmed ? (
        <DataSourceNotice>
          <strong>No website? That&apos;s okay.</strong> We can create a
          social-first growth assessment using your confirmed profiles,
          Business Context, goals, reviews, and competitors. Website and SEO
          will be marked not provided instead of scored as failures.
        </DataSourceNotice>
      ) : null}

      {query.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {query.error === "confirmed-presence"
            ? "Confirm at least one real website, social, or Google Business profile before running an audit."
            : "Enter a valid platform and profile URL or handle."}
        </div>
      ) : null}

      {pendingProfiles.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Profiles requiring review</h3>
            <p className="mt-1 text-sm text-muted">
              Confidence is an automated clue. Your confirmation is the source of truth.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {pendingProfiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                businessId={business.id}
                profile={profile}
              />
            ))}
          </div>
        </section>
      ) : null}

      {confirmedProfiles.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Confirmed profiles</h3>
            <p className="mt-1 text-sm text-muted">
              These sources are ready to use in audits and recommendations.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {confirmedProfiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                businessId={business.id}
                profile={profile}
              />
            ))}
          </div>
        </section>
      ) : null}

      {pendingProfiles.length === 0 && confirmedProfiles.length === 0 ? (
        <EmptyState
          icon={<SearchCheck className="size-6" />}
          title="No active profiles"
          description="Add a profile manually to give the audit a reliable source for this business."
        />
      ) : null}

      {removedProfiles.length > 0 ? (
        <DisclosureSection
          title={`Removed profiles (${removedProfiles.length})`}
          description="Restore a profile to review it again."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {removedProfiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                businessId={business.id}
                profile={profile}
              />
            ))}
          </div>
        </DisclosureSection>
      ) : null}

      <DisclosureSection
        title="Add profile manually"
        description="Add a missing website, social profile, or business listing."
        defaultOpen={business.profiles.length === 0}
      >
        <form
          action={addManualProfile}
          className="grid gap-4 md:grid-cols-[220px_1fr_auto]"
        >
          <input type="hidden" name="businessId" value={business.id} />
          <div className="space-y-2">
            <Label htmlFor="manualPlatform">Platform</Label>
            <select
              id="manualPlatform"
              name="platform"
              className="flex h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
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
            <Label htmlFor="manualProfileValue">Public profile URL</Label>
            <Input
              id="manualProfileValue"
              name="profileValue"
              placeholder="https://example.com/profile"
              required
            />
          </div>
          <div className="flex items-end">
            <SubmitButton
              variant="secondary"
              pendingLabel="Adding profile..."
              className="w-full md:w-auto"
            >
              <Plus className="size-4" />
              Add profile
            </SubmitButton>
          </div>
        </form>
      </DisclosureSection>

      <div className="sticky bottom-4 z-10 rounded-lg border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Profiles ready</p>
            <p className="mt-1 text-sm text-muted">
              {confirmedProfiles.length} confirmed · {pendingProfiles.length} awaiting review · {removedProfiles.length} removed
            </p>
          </div>
          <form action={prepareAuditRun}>
            <input type="hidden" name="businessId" value={business.id} />
            <SubmitButton
              variant="primary"
              size="lg"
              pendingLabel="Starting audit..."
              disabled={!canRunAudit}
            >
              Run Audit
              <ArrowRight className="size-4" />
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}

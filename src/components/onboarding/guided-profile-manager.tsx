"use client";

import {
  BusinessProfileSource,
  BusinessProfileStatus,
  ProfilePlatform,
  ProfileReviewDecision,
} from "@prisma/client";
import {
  BadgeCheck,
  Ban,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  SearchCheck,
  SkipForward,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  mutateGuidedProfile,
  type GuidedProfileActionState,
} from "@/app/dashboard/businesses/[businessId]/setup/profile-actions";
import {
  CompactMetricCard,
  DataSourceNotice,
  ReportSection,
} from "@/components/dashboard/report-ui";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { platformLabels } from "@/lib/profiles/platforms";
import {
  guidedProfilePlatforms,
  optionalDecisionPlatforms,
} from "@/lib/profiles/profile-url";
import { cn } from "@/lib/utils";

export type GuidedProfileView = {
  id: string;
  platform: ProfilePlatform;
  displayName: string | null;
  url: string | null;
  handle: string | null;
  confidenceScore: number;
  status: BusinessProfileStatus;
  source: BusinessProfileSource;
};

export type GuidedGoogleCandidateView = {
  id: string;
  displayName: string | null;
  formattedAddress: string | null;
  googleMapsUri: string | null;
  matchConfidence: number | null;
  status: string;
  source: string;
};

export type GuidedProfileDecisionView = {
  platform: ProfilePlatform;
  decision: ProfileReviewDecision;
};

type GuidedProfileManagerProps = {
  businessId: string;
  profiles: GuidedProfileView[];
  googleCandidates: GuidedGoogleCandidateView[];
  decisions: GuidedProfileDecisionView[];
  profilesComplete: boolean;
  hasConfirmedWebsite: boolean;
};

const selectClassName =
  "flex h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60";
const initialGuidedProfileActionState: GuidedProfileActionState = {
  status: "idle",
  message: "",
};

export function GuidedProfileManager({
  businessId,
  profiles,
  googleCandidates,
  decisions,
  profilesComplete,
  hasConfirmedWebsite,
}: GuidedProfileManagerProps) {
  const activeProfiles = profiles.filter(
    (profile) => profile.status !== BusinessProfileStatus.REMOVED,
  );
  const foundProfiles = activeProfiles.filter(
    (profile) => profile.source !== BusinessProfileSource.MANUAL,
  );
  const manualProfiles = activeProfiles.filter(
    (profile) => profile.source === BusinessProfileSource.MANUAL,
  );
  const removedProfiles = profiles.filter(
    (profile) => profile.status === BusinessProfileStatus.REMOVED,
  );
  const activeGoogleCandidates = googleCandidates.filter(
    (profile) => profile.status.toLowerCase() !== "removed",
  );
  const confirmedBusinessProfiles = activeProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const confirmedGoogleCandidate = activeGoogleCandidates.some(
    (profile) => profile.status.toLowerCase() === "confirmed",
  );
  const googleAlreadyCounted = confirmedBusinessProfiles.some(
    (profile) => profile.platform === ProfilePlatform.GOOGLE_BUSINESS,
  );
  const pendingCount =
    activeProfiles.filter(
      (profile) => profile.status === BusinessProfileStatus.PENDING,
    ).length +
    activeGoogleCandidates.filter(
      (profile) => profile.status.toLowerCase() === "pending",
    ).length;
  const confirmedCount =
    confirmedBusinessProfiles.length +
    (confirmedGoogleCandidate && !googleAlreadyCounted ? 1 : 0);
  const discoveredAnything =
    foundProfiles.length > 0 || activeGoogleCandidates.length > 0;

  return (
    <div className="space-y-6">
      {!hasConfirmedWebsite ? (
        <DataSourceNotice>
          <strong>No website? That&apos;s okay.</strong> We can create a
          social-first growth assessment using confirmed profiles, Business
          Context, goals, reviews, and competitors.
        </DataSourceNotice>
      ) : null}

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Profile review totals"
      >
        <CompactMetricCard
          label="Confirmed"
          value={confirmedCount}
          tone="good"
        />
        <CompactMetricCard
          label="Awaiting review"
          value={pendingCount}
          tone={pendingCount ? "warning" : "default"}
        />
        <CompactMetricCard
          label="Added manually"
          value={manualProfiles.length}
        />
        <CompactMetricCard
          label="Removed"
          value={removedProfiles.length}
        />
      </section>

      <ReportSection
        title="Profiles found"
        description="Review the starting link and any possible matches. Match confidence is an automated clue, not proof that you own a profile."
      >
        {!discoveredAnything ? (
          <div className="rounded-lg border border-dashed border-border p-5">
            <div className="flex gap-3">
              <SearchCheck className="mt-0.5 size-5 text-accent" />
              <div>
                <p className="font-semibold">
                  We couldn&apos;t find every profile automatically
                </p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Add any missing profiles below. Manual setup remains fully
                  available and discovery is not required.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {foundProfiles.map((profile) => (
              <GuidedProfileCard
                key={profile.id}
                businessId={businessId}
                profile={profile}
              />
            ))}
            {activeGoogleCandidates.map((candidate) => (
              <GoogleCandidateCard
                key={candidate.id}
                businessId={businessId}
                candidate={candidate}
              />
            ))}
          </div>
        )}

        {removedProfiles.length > 0 ? (
          <details className="mt-4 rounded-lg border border-border bg-background">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
              Removed profiles ({removedProfiles.length})
              <ChevronDown className="size-4 text-muted" aria-hidden="true" />
            </summary>
            <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-2">
              {removedProfiles.map((profile) => (
                <GuidedProfileCard
                  key={profile.id}
                  businessId={businessId}
                  profile={profile}
                />
              ))}
            </div>
          </details>
        ) : null}
      </ReportSection>

      <ReportSection
        title="Add missing profiles"
        description="Automatic discovery may not find every profile. Add the public links you want Onread to use."
      >
        <div className="space-y-6">
          <ManualProfileForm businessId={businessId} />

          {manualProfiles.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold">Added by you</h3>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                {manualProfiles.map((profile) => (
                  <GuidedProfileCard
                    key={profile.id}
                    businessId={businessId}
                    profile={profile}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <GoogleBusinessPanel
            businessId={businessId}
            profiles={activeProfiles}
            candidates={activeGoogleCandidates}
            decisions={decisions}
          />

          <OptionalPlatformDecisionForm
            businessId={businessId}
            activeProfiles={activeProfiles}
            decisions={decisions}
          />
        </div>
      </ReportSection>

      <AuditSourceSummary
        profiles={activeProfiles}
        googleCandidates={activeGoogleCandidates}
        decisions={decisions}
        ready={profilesComplete}
      />

      <Link
        href={`/dashboard/businesses/${businessId}/confirm?returnTo=setup`}
        className={buttonVariants({ variant: "secondary" })}
      >
        <CircleHelp className="size-4" />
        Advanced profile management
      </Link>
    </div>
  );
}

function GuidedProfileCard({
  businessId,
  profile,
}: {
  businessId: string;
  profile: GuidedProfileView;
}) {
  const [editing, setEditing] = useState(false);
  const pending = profile.status === BusinessProfileStatus.PENDING;
  const removed = profile.status === BusinessProfileStatus.REMOVED;
  const value = profile.url || profile.handle || "No public URL saved";

  return (
    <article
      className={cn(
        "rounded-lg border border-border bg-background p-4",
        removed && "opacity-75",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold">
              {platformLabels[profile.platform]}
            </span>
            <ProfileStatusBadge status={profile.status} />
            {profile.source === BusinessProfileSource.MANUAL ? (
              <span className="text-xs font-medium text-muted">
                Added by you
              </span>
            ) : null}
          </div>
          <p className="mt-3 break-all text-sm leading-6 text-muted">{value}</p>
        </div>
        {profile.source !== BusinessProfileSource.MANUAL ? (
          <span className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted">
            {confidenceLabel(profile.confidenceScore)}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {profile.url ? (
          <a
            href={profile.url}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <ExternalLink className="size-4" />
            Open
          </a>
        ) : null}
        <ProfileActionButton
          businessId={businessId}
          profileId={profile.id}
          operation="confirm"
          label="Confirm"
          pendingLabel="Confirming..."
          icon={<BadgeCheck className="size-4" />}
          variant="primary"
          showButton={pending}
        />
        {!removed ? (
          <button
            type="button"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
            onClick={() => setEditing((current) => !current)}
            aria-expanded={editing}
          >
            <Pencil className="size-4" />
            Edit
          </button>
        ) : null}
        {!removed ? (
          <ProfileActionButton
            businessId={businessId}
            profileId={profile.id}
            operation="remove"
            label="Remove"
            pendingLabel="Removing..."
            icon={<Trash2 className="size-4" />}
            variant="outline"
          />
        ) : (
          <ProfileActionButton
            businessId={businessId}
            profileId={profile.id}
            operation="restore"
            label="Restore"
            pendingLabel="Restoring..."
            icon={<RotateCcw className="size-4" />}
            variant="secondary"
          />
        )}
      </div>

      {editing ? (
        <ProfileEditForm
          businessId={businessId}
          profile={profile}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : null}
    </article>
  );
}

function ProfileActionButton({
  businessId,
  profileId,
  operation,
  label,
  pendingLabel,
  icon,
  variant,
  showButton = true,
}: {
  businessId: string;
  profileId: string;
  operation: string;
  label: string;
  pendingLabel: string;
  icon: React.ReactNode;
  variant: "primary" | "secondary" | "outline";
  showButton?: boolean;
}) {
  const [state, action] = useActionState(
    mutateGuidedProfile,
    initialGuidedProfileActionState,
  );

  if (!showButton && !state.message) return null;

  return (
    <form action={action} className="contents">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="operation" value={operation} />
      {showButton ? (
        <SubmitButton
          pendingLabel={pendingLabel}
          variant={variant}
          size="sm"
        >
          {icon}
          {label}
        </SubmitButton>
      ) : null}
      {state.message ? (
        <span className="basis-full">
          <ActionFeedback state={state} />
        </span>
      ) : null}
    </form>
  );
}

function ProfileEditForm({
  businessId,
  profile,
  onCancel,
  onSaved,
}: {
  businessId: string;
  profile: GuidedProfileView;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [state, action] = useActionState(
    mutateGuidedProfile,
    initialGuidedProfileActionState,
  );

  useEffect(() => {
    if (state.status === "success") onSaved();
  }, [onSaved, state.completedAt, state.status]);

  return (
    <form
      action={action}
      className="mt-4 grid gap-4 border-t border-border pt-4"
      aria-label={`Edit ${platformLabels[profile.platform]} profile`}
    >
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="profileId" value={profile.id} />
      <input type="hidden" name="operation" value="edit" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-platform`}>Platform</Label>
          <select
            id={`${id}-platform`}
            name="platform"
            className={selectClassName}
            defaultValue={state.values?.platform || profile.platform}
            aria-describedby={
              state.fieldErrors?.platform ? `${id}-platform-error` : undefined
            }
          >
            {guidedProfilePlatforms.map((platform) => (
              <option key={platform} value={platform}>
                {platformLabels[platform]}
              </option>
            ))}
          </select>
          <FieldError
            id={`${id}-platform-error`}
            message={state.fieldErrors?.platform}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-display-name`}>Display name (optional)</Label>
          <Input
            id={`${id}-display-name`}
            name="displayName"
            defaultValue={
              state.values?.displayName ?? profile.displayName ?? ""
            }
            maxLength={160}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-url`}>Public profile URL</Label>
        <Input
          id={`${id}-url`}
          name="url"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.values?.url || profile.url || ""}
          placeholder="https://example.com/profile"
          required
          aria-invalid={Boolean(state.fieldErrors?.url)}
          aria-describedby={
            state.fieldErrors?.url ? `${id}-url-error` : undefined
          }
        />
        <FieldError id={`${id}-url-error`} message={state.fieldErrors?.url} />
      </div>
      {state.message ? <ActionFeedback state={state} /> : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving..." size="sm">
          Save
        </SubmitButton>
        <button
          type="button"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ManualProfileForm({ businessId }: { businessId: string }) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(
    mutateGuidedProfile,
    initialGuidedProfileActionState,
  );

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.completedAt, state.status]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid gap-4 rounded-lg border border-border bg-background p-4 lg:grid-cols-[190px_1fr_220px_auto]"
      aria-label="Add missing profile"
    >
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="operation" value="add" />
      <div className="space-y-2">
        <Label htmlFor={`${id}-platform`}>Platform</Label>
        <select
          id={`${id}-platform`}
          name="platform"
          className={selectClassName}
          defaultValue={
            state.values?.platform || ProfilePlatform.INSTAGRAM
          }
          aria-describedby={
            state.fieldErrors?.platform ? `${id}-platform-error` : undefined
          }
        >
          {guidedProfilePlatforms.map((platform) => (
            <option key={platform} value={platform}>
              {platformLabels[platform]}
            </option>
          ))}
        </select>
        <FieldError
          id={`${id}-platform-error`}
          message={state.fieldErrors?.platform}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-url`}>Public profile URL</Label>
        <Input
          id={`${id}-url`}
          name="url"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.values?.url}
          placeholder="https://instagram.com/example"
          required
          aria-invalid={Boolean(state.fieldErrors?.url)}
          aria-describedby={
            state.fieldErrors?.url ? `${id}-url-error` : undefined
          }
        />
        <FieldError id={`${id}-url-error`} message={state.fieldErrors?.url} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-display-name`}>Display name (optional)</Label>
        <Input
          id={`${id}-display-name`}
          name="displayName"
          defaultValue={state.values?.displayName}
          maxLength={160}
          placeholder="Main account"
        />
      </div>
      <div className="flex items-end">
        <SubmitButton
          pendingLabel="Adding profile..."
          className="w-full lg:w-auto"
        >
          <Plus className="size-4" />
          Add profile
        </SubmitButton>
      </div>
      {state.message ? (
        <div className="lg:col-span-4">
          <ActionFeedback state={state} />
        </div>
      ) : null}
    </form>
  );
}

function GoogleBusinessPanel({
  businessId,
  profiles,
  candidates,
  decisions,
}: {
  businessId: string;
  profiles: GuidedProfileView[];
  candidates: GuidedGoogleCandidateView[];
  decisions: GuidedProfileDecisionView[];
}) {
  const googleProfile = profiles.find(
    (profile) =>
      profile.platform === ProfilePlatform.GOOGLE_BUSINESS &&
      profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const confirmedCandidate = candidates.find(
    (candidate) => candidate.status.toLowerCase() === "confirmed",
  );
  const decision = decisions.find(
    (item) => item.platform === ProfilePlatform.GOOGLE_BUSINESS,
  );

  return (
    <section className="rounded-lg border border-border bg-background p-5">
      <div className="flex gap-3">
        <MapPin className="mt-0.5 size-5 text-accent" />
        <div>
          <h3 className="font-semibold">Google Business Profile</h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            Add your Google listing so Onread can review local visibility,
            business information, and available review signals.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">
        {googleProfile || confirmedCandidate ? (
          <div className="flex items-center gap-2 font-semibold text-teal-700 dark:text-teal-200">
            <BadgeCheck className="size-4" />
            Google Business Profile confirmed by you
          </div>
        ) : decision ? (
          <div className="flex items-center gap-2 font-semibold">
            {decision.decision === ProfileReviewDecision.NOT_USED ? (
              <Ban className="size-4 text-muted" />
            ) : (
              <SkipForward className="size-4 text-muted" />
            )}
            {decision.decision === ProfileReviewDecision.NOT_USED
              ? "You indicated this business does not use Google Business."
              : "Google Business was skipped for now."}
          </div>
        ) : (
          <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-200">
            <TriangleAlert className="size-4" />
            Google Business still needs review
          </div>
        )}
      </div>

      {!googleProfile && !confirmedCandidate ? (
        <GoogleProfileForm businessId={businessId} />
      ) : null}

      {!googleProfile && !confirmedCandidate ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <PlatformDecisionButton
            businessId={businessId}
            platform={ProfilePlatform.GOOGLE_BUSINESS}
            decision={ProfileReviewDecision.NOT_USED}
            label="I don't have one"
            pendingLabel="Saving..."
            icon={<Ban className="size-4" />}
          />
          <PlatformDecisionButton
            businessId={businessId}
            platform={ProfilePlatform.GOOGLE_BUSINESS}
            decision={ProfileReviewDecision.SKIPPED}
            label="Skip for now"
            pendingLabel="Skipping..."
            icon={<SkipForward className="size-4" />}
          />
        </div>
      ) : null}
    </section>
  );
}

function GoogleProfileForm({ businessId }: { businessId: string }) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(
    mutateGuidedProfile,
    initialGuidedProfileActionState,
  );

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.completedAt, state.status]);

  return (
    <form
      ref={formRef}
      action={action}
      className="mt-4 grid gap-4 md:grid-cols-[1fr_220px_auto]"
      aria-label="Add Google Business Profile"
    >
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="operation" value="add" />
      <input
        type="hidden"
        name="platform"
        value={ProfilePlatform.GOOGLE_BUSINESS}
      />
      <div className="space-y-2">
        <Label htmlFor={`${id}-google-url`}>
          Google Maps or Business Profile URL
        </Label>
        <Input
          id={`${id}-google-url`}
          name="url"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.values?.url}
          placeholder="https://maps.google.com/..."
          required
          aria-invalid={Boolean(state.fieldErrors?.url)}
          aria-describedby={
            state.fieldErrors?.url ? `${id}-google-url-error` : undefined
          }
        />
        <FieldError
          id={`${id}-google-url-error`}
          message={state.fieldErrors?.url}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-google-name`}>Listing name (optional)</Label>
        <Input
          id={`${id}-google-name`}
          name="displayName"
          defaultValue={state.values?.displayName}
          maxLength={160}
        />
      </div>
      <div className="flex items-end">
        <SubmitButton
          pendingLabel="Adding Google profile..."
          className="w-full md:w-auto"
        >
          <Plus className="size-4" />
          Add Google profile
        </SubmitButton>
      </div>
      {state.message ? (
        <div className="md:col-span-3">
          <ActionFeedback state={state} />
        </div>
      ) : null}
    </form>
  );
}

function GoogleCandidateCard({
  businessId,
  candidate,
}: {
  businessId: string;
  candidate: GuidedGoogleCandidateView;
}) {
  const confirmed = candidate.status.toLowerCase() === "confirmed";
  const [editing, setEditing] = useState(false);

  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold">
              Google Business
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-semibold",
                confirmed
                  ? "bg-teal-500/10 text-teal-700 dark:text-teal-200"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-200",
              )}
            >
              {confirmed ? "Confirmed by you" : "Awaiting review"}
            </span>
          </div>
          <p className="mt-3 font-semibold">
            {candidate.displayName || "Google Business candidate"}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {candidate.formattedAddress || "Address not provided"}
          </p>
        </div>
        {!confirmed ? (
          <span className="shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted">
            {confidenceLabel(candidate.matchConfidence ?? 0)}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {candidate.googleMapsUri ? (
          <a
            href={candidate.googleMapsUri}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <ExternalLink className="size-4" />
            Open listing
          </a>
        ) : null}
        <ProfileActionButton
          businessId={businessId}
          profileId={candidate.id}
          operation="confirm_google_candidate"
          label="Confirm"
          pendingLabel="Confirming..."
          icon={<BadgeCheck className="size-4" />}
          variant="primary"
          showButton={!confirmed}
        />
        {!confirmed ? (
          <button
            type="button"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
            onClick={() => setEditing((current) => !current)}
            aria-expanded={editing}
          >
            <Pencil className="size-4" />
            Edit
          </button>
        ) : null}
        <ProfileActionButton
          businessId={businessId}
          profileId={candidate.id}
          operation="remove_google_candidate"
          label="Remove"
          pendingLabel="Removing..."
          icon={<Trash2 className="size-4" />}
          variant="outline"
        />
      </div>
      {editing ? (
        <GoogleCandidateEditForm
          businessId={businessId}
          candidate={candidate}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : null}
    </article>
  );
}

function GoogleCandidateEditForm({
  businessId,
  candidate,
  onCancel,
  onSaved,
}: {
  businessId: string;
  candidate: GuidedGoogleCandidateView;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [state, action] = useActionState(
    mutateGuidedProfile,
    initialGuidedProfileActionState,
  );

  useEffect(() => {
    if (state.status === "success") onSaved();
  }, [onSaved, state.completedAt, state.status]);

  return (
    <form
      action={action}
      className="mt-4 grid gap-4 border-t border-border pt-4"
      aria-label="Edit Google Business candidate"
    >
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="profileId" value={candidate.id} />
      <input type="hidden" name="operation" value="edit_google_candidate" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-candidate-url`}>
            Google Maps or Business Profile URL
          </Label>
          <Input
            id={`${id}-candidate-url`}
            name="url"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={state.values?.url ?? candidate.googleMapsUri ?? ""}
            required
            aria-invalid={Boolean(state.fieldErrors?.url)}
            aria-describedby={
              state.fieldErrors?.url ? `${id}-candidate-url-error` : undefined
            }
          />
          <FieldError
            id={`${id}-candidate-url-error`}
            message={state.fieldErrors?.url}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-candidate-name`}>
            Listing name (optional)
          </Label>
          <Input
            id={`${id}-candidate-name`}
            name="displayName"
            defaultValue={
              state.values?.displayName ?? candidate.displayName ?? ""
            }
            maxLength={160}
          />
        </div>
      </div>
      {state.message ? <ActionFeedback state={state} /> : null}
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" pendingLabel="Saving...">
          Save
        </SubmitButton>
        <button
          type="button"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function OptionalPlatformDecisionForm({
  businessId,
  activeProfiles,
  decisions,
}: {
  businessId: string;
  activeProfiles: GuidedProfileView[];
  decisions: GuidedProfileDecisionView[];
}) {
  const [state, action] = useActionState(
    mutateGuidedProfile,
    initialGuidedProfileActionState,
  );
  const availablePlatforms = optionalDecisionPlatforms.filter(
    (platform) =>
      platform !== ProfilePlatform.GOOGLE_BUSINESS &&
      !activeProfiles.some(
        (profile) =>
          profile.platform === platform &&
          profile.status === BusinessProfileStatus.CONFIRMED,
      ),
  );

  if (availablePlatforms.length === 0) return null;

  return (
    <details className="rounded-lg border border-border bg-background">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
        Mark an optional platform as skipped or not used
        <ChevronDown className="size-4 text-muted" aria-hidden="true" />
      </summary>
      <form
        action={action}
        className="grid gap-4 border-t border-border p-4 md:grid-cols-[1fr_1fr_auto]"
      >
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="operation" value="set_decision" />
        <div className="space-y-2">
          <Label htmlFor="optional-platform">Platform</Label>
          <select
            id="optional-platform"
            name="platform"
            className={selectClassName}
            defaultValue={availablePlatforms[0]}
          >
            {availablePlatforms.map((platform) => (
              <option key={platform} value={platform}>
                {platformLabels[platform]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="optional-decision">Status</Label>
          <select
            id="optional-decision"
            name="decision"
            className={selectClassName}
            defaultValue={ProfileReviewDecision.NOT_USED}
          >
            <option value={ProfileReviewDecision.NOT_USED}>Not used</option>
            <option value={ProfileReviewDecision.SKIPPED}>Skip for now</option>
          </select>
        </div>
        <div className="flex items-end">
          <SubmitButton
            pendingLabel="Saving status..."
            variant="secondary"
            className="w-full md:w-auto"
          >
            Save status
          </SubmitButton>
        </div>
        {state.message ? (
          <div className="md:col-span-3">
            <ActionFeedback state={state} />
          </div>
        ) : null}
        {decisions.length > 0 ? (
          <p className="text-xs leading-5 text-muted md:col-span-3">
            Saved statuses remain visible in the audit source summary and can
            be replaced at any time by adding a profile.
          </p>
        ) : null}
      </form>
    </details>
  );
}

function PlatformDecisionButton({
  businessId,
  platform,
  decision,
  label,
  pendingLabel,
  icon,
}: {
  businessId: string;
  platform: ProfilePlatform;
  decision: ProfileReviewDecision;
  label: string;
  pendingLabel: string;
  icon: React.ReactNode;
}) {
  const [state, action] = useActionState(
    mutateGuidedProfile,
    initialGuidedProfileActionState,
  );

  return (
    <form action={action}>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="operation" value="set_decision" />
      <input type="hidden" name="platform" value={platform} />
      <input type="hidden" name="decision" value={decision} />
      <SubmitButton
        pendingLabel={pendingLabel}
        variant="secondary"
        size="sm"
      >
        {icon}
        {label}
      </SubmitButton>
      {state.message ? <ActionFeedback state={state} /> : null}
    </form>
  );
}

function AuditSourceSummary({
  profiles,
  googleCandidates,
  decisions,
  ready,
}: {
  profiles: GuidedProfileView[];
  googleCandidates: GuidedGoogleCandidateView[];
  decisions: GuidedProfileDecisionView[];
  ready: boolean;
}) {
  const platforms = guidedProfilePlatforms.filter(
    (platform) =>
      platform !== ProfilePlatform.OTHER ||
      profiles.some((profile) => profile.platform === platform),
  );

  return (
    <ReportSection
      title="Sources included in your audit"
      description="Only sources you confirm are treated as belonging to your business. Skipped, not-used, removed, and pending sources are excluded."
    >
      {ready ? (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 p-4 text-teal-900 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100">
          <BadgeCheck className="size-5" />
          <p className="font-semibold">Your audit sources are ready</p>
        </div>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        {platforms.map((platform) => {
          const state = sourceStateForPlatform({
            platform,
            profiles,
            googleCandidates,
            decisions,
          });
          return (
            <div
              key={platform}
              className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"
            >
              <span className="text-sm font-medium">
                {platformLabels[platform]}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs font-semibold",
                  state.tone,
                )}
              >
                <state.icon className="size-3.5" aria-hidden="true" />
                {state.label}
              </span>
            </div>
          );
        })}
      </div>
    </ReportSection>
  );
}

function sourceStateForPlatform({
  platform,
  profiles,
  googleCandidates,
  decisions,
}: {
  platform: ProfilePlatform;
  profiles: GuidedProfileView[];
  googleCandidates: GuidedGoogleCandidateView[];
  decisions: GuidedProfileDecisionView[];
}) {
  const platformProfiles = profiles.filter(
    (profile) => profile.platform === platform,
  );
  const confirmed =
    platformProfiles.some(
      (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
    ) ||
    (platform === ProfilePlatform.GOOGLE_BUSINESS &&
      googleCandidates.some(
        (profile) => profile.status.toLowerCase() === "confirmed",
      ));
  const pending =
    platformProfiles.some(
      (profile) => profile.status === BusinessProfileStatus.PENDING,
    ) ||
    (platform === ProfilePlatform.GOOGLE_BUSINESS &&
      googleCandidates.some(
        (profile) => profile.status.toLowerCase() === "pending",
      ));
  const decision = decisions.find((item) => item.platform === platform);

  if (confirmed) {
    return {
      label: "Confirmed",
      icon: Check,
      tone: "text-teal-700 dark:text-teal-200",
    };
  }
  if (pending) {
    return {
      label: "Awaiting review",
      icon: TriangleAlert,
      tone: "text-amber-700 dark:text-amber-200",
    };
  }
  if (decision?.decision === ProfileReviewDecision.NOT_USED) {
    return {
      label: "Not used",
      icon: Ban,
      tone: "text-muted",
    };
  }
  if (decision?.decision === ProfileReviewDecision.SKIPPED) {
    return {
      label: "Skipped",
      icon: SkipForward,
      tone: "text-muted",
    };
  }
  return {
    label: "Not added",
    icon: CircleHelp,
    tone: "text-muted",
  };
}

function ProfileStatusBadge({
  status,
}: {
  status: BusinessProfileStatus;
}) {
  if (status === BusinessProfileStatus.CONFIRMED) {
    return (
      <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:text-teal-200">
        Confirmed by you
      </span>
    );
  }
  if (status === BusinessProfileStatus.REMOVED) {
    return (
      <span className="rounded-full bg-foreground/5 px-2.5 py-1 text-xs font-semibold text-muted">
        Removed
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200">
      Awaiting review
    </span>
  );
}

function confidenceLabel(score: number) {
  if (score >= 80) return "High-confidence match";
  if (score >= 50) return "Possible match";
  return "Low-confidence match";
}

function ActionFeedback({ state }: { state: GuidedProfileActionState }) {
  return (
    <p
      className={cn(
        "mt-2 text-sm font-medium",
        state.status === "error"
          ? "text-rose-700 dark:text-rose-200"
          : "text-teal-700 dark:text-teal-200",
      )}
      role={state.status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {state.message}
    </p>
  );
}

function FieldError({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm font-medium text-rose-700 dark:text-rose-200">
      {message}
    </p>
  );
}

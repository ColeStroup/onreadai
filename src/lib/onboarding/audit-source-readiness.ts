import { createHash } from "node:crypto";

import {
  BusinessProfileStatus,
  ProfilePlatform,
  ProfileReviewDecision,
  type BusinessGoal,
} from "@prisma/client";

import { meaningfulSocialPlatforms } from "@/lib/audits/audit-applicability";

export type AuditSourceReadinessInput = {
  profiles: Array<{
    id: string;
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
    normalizedUrl?: string | null;
    url?: string | null;
    handle?: string | null;
    updatedAt?: Date | string | null;
  }>;
  googleBusinessProfiles?: Array<{
    id: string;
    status: string;
    updatedAt?: Date | string | null;
  }>;
  profileDecisions?: Array<{
    platform: ProfilePlatform;
    decision: ProfileReviewDecision;
    updatedAt?: Date | string | null;
  }>;
  description?: string | null;
  targetAudience?: string | null;
  mainOffer?: string | null;
  contextConfirmedAt?: Date | string | null;
  goals?: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
  auditSourceAcknowledgementHash?: string | null;
};

export type MissingAuditSource = {
  code:
    | "NO_WEBSITE"
    | "NO_SOCIAL"
    | "GOOGLE_NOT_REVIEWED"
    | "PROFILES_AWAITING_REVIEW"
    | "CONTEXT_INCOMPLETE"
    | "GOALS_NOT_SELECTED";
  label: string;
  limitation: string;
  returnStep: "profiles" | "context" | "goals";
};

export type AuditSourceReadiness = {
  confirmedProfileCount: number;
  pendingProfileCount: number;
  hasWebsite: boolean;
  hasSocial: boolean;
  googleReviewState: "confirmed" | "skipped" | "not_used" | "unresolved";
  missingSources: MissingAuditSource[];
  stateHash: string;
  acknowledged: boolean;
  requiresAcknowledgement: boolean;
};

export function deriveAuditSourceReadiness(
  input: AuditSourceReadinessInput,
): AuditSourceReadiness {
  const websiteProfiles = input.profiles.filter(
    (profile) => profile.platform === ProfilePlatform.WEBSITE,
  );
  const confirmedProfiles = websiteProfiles.filter(
    (profile) =>
      profile.status === BusinessProfileStatus.CONFIRMED &&
      Boolean(
        profile.normalizedUrl?.trim() ||
        profile.url?.trim() ||
        profile.handle?.trim(),
      ),
  );
  const pendingBusinessProfiles = websiteProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.PENDING,
  );
  const googleReviewState = "not_used" as const;
  const pendingProfileCount = pendingBusinessProfiles.length;
  const hasWebsite = confirmedProfiles.some(
    (profile) => profile.platform === ProfilePlatform.WEBSITE,
  );
  const hasSocial = confirmedProfiles.some((profile) =>
    meaningfulSocialPlatforms.has(profile.platform),
  );
  const contextComplete = Boolean(
    input.description?.trim() &&
    input.targetAudience?.trim() &&
    input.mainOffer?.trim() &&
    input.contextConfirmedAt,
  );
  const goalsComplete = Boolean(input.goals?.length && input.primaryGoal);
  const missingSources: MissingAuditSource[] = [];

  if (!hasWebsite) {
    missingSources.push({
      code: "NO_WEBSITE",
      label: "No confirmed website",
      limitation: "Website and SEO analysis will be marked not provided.",
      returnStep: "profiles",
    });
  }
  if (pendingProfileCount > 0) {
    missingSources.push({
      code: "PROFILES_AWAITING_REVIEW",
      label: `${pendingProfileCount} profile${
        pendingProfileCount === 1 ? "" : "s"
      } awaiting review`,
      limitation: "The website must be confirmed before it can be analyzed.",
      returnStep: "profiles",
    });
  }
  if (!contextComplete) {
    missingSources.push({
      code: "CONTEXT_INCOMPLETE",
      label: "Business Context is incomplete or unconfirmed",
      limitation:
        "Audience, offer, positioning, and conversion guidance may be less specific.",
      returnStep: "context",
    });
  }
  if (!goalsComplete) {
    missingSources.push({
      code: "GOALS_NOT_SELECTED",
      label: "Business goals are not selected",
      limitation:
        "Recommendation ordering will not reflect a primary business goal.",
      returnStep: "goals",
    });
  }

  const stateHash = auditSourceStateHash(input);
  const acknowledged =
    missingSources.length === 0 ||
    input.auditSourceAcknowledgementHash === stateHash;

  return {
    confirmedProfileCount: confirmedProfiles.length,
    pendingProfileCount,
    hasWebsite,
    hasSocial,
    googleReviewState,
    missingSources,
    stateHash,
    acknowledged,
    requiresAcknowledgement: missingSources.length > 0 && !acknowledged,
  };
}

export function auditSourceStateHash(input: AuditSourceReadinessInput) {
  const state = {
    profiles: input.profiles
      .filter((profile) => profile.platform === ProfilePlatform.WEBSITE)
      .map((profile) => ({
        id: profile.id,
        platform: profile.platform,
        status: profile.status,
        value: profile.normalizedUrl ?? profile.url ?? profile.handle ?? null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    context: {
      description: input.description?.trim() || null,
      targetAudience: input.targetAudience?.trim() || null,
      mainOffer: input.mainOffer?.trim() || null,
      confirmed: Boolean(input.contextConfirmedAt),
    },
    goals: [...(input.goals ?? [])].sort(),
    primaryGoal: input.primaryGoal ?? null,
  };

  return createHash("sha256")
    .update(`onread-audit-sources:v1:${JSON.stringify(state)}`)
    .digest("hex");
}

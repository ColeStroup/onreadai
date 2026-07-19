import {
  BusinessGoal,
  BusinessProfileStatus,
  ProfilePlatform,
} from "@prisma/client";

import {
  analyzeReviews,
  normalizeReviewAnalysisForDisplay,
  type ReviewAnalysis,
  type ReviewAnalyzerGoogleBusinessProfile,
} from "@/lib/analyzers/review-analyzer";

export type CurrentReviewBusinessProfile = {
  platform: ProfilePlatform;
  status: BusinessProfileStatus;
  displayName?: string | null;
  label?: string | null;
};

export type CurrentReviewGoogleBusinessProfile =
  ReviewAnalyzerGoogleBusinessProfile & {
    googlePlaceId?: string | null;
    confirmedAt?: Date | null;
    updatedAt?: Date | null;
    businessStatus?: string | null;
    primaryType?: string | null;
    types?: unknown;
  };

export type CurrentReviewCompetitor = {
  name?: string;
  competitorName?: string;
  discoveredProfiles?: CurrentReviewBusinessProfile[];
  profiles?: CurrentReviewBusinessProfile[];
};

export type ReviewDataFreshness =
  | "current"
  | "stale_after_google_confirmation"
  | "no_completed_audit";

export type ReviewFreshnessSummary = {
  status: ReviewDataFreshness;
  needsFreshAudit: boolean;
  confirmedAfterAudit: Array<{
    displayName: string | null;
    confirmedAt: Date;
    updatedAt: Date | null;
  }>;
  note: string | null;
};

export function buildCurrentReviewAnalysis({
  businessProfiles,
  googleBusinessProfiles,
  competitors = [],
  goals = [],
  primaryGoal,
  businessContext,
  latestAuditSnapshot,
}: {
  businessProfiles: CurrentReviewBusinessProfile[];
  googleBusinessProfiles: CurrentReviewGoogleBusinessProfile[];
  competitors?: CurrentReviewCompetitor[];
  goals?: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
  businessContext?: {
    description?: string | null;
    targetAudience?: string | null;
    mainOffer?: string | null;
    industry?: string | null;
    businessType?: string | null;
    primaryConversionGoal?: string | null;
  } | null;
  latestAuditSnapshot?: unknown;
}): ReviewAnalysis {
  return normalizeReviewAnalysisForDisplay(
    analyzeReviews({
      businessProfiles: businessProfiles.map((profile) => ({
        platform: profile.platform,
        status: profile.status,
        label: profile.displayName ?? profile.label,
      })),
      googleBusinessProfiles: googleBusinessProfiles.map(
        toReviewAnalyzerGoogleBusinessProfile,
      ),
      googleDiscovery: getGoogleBusinessDiscovery(latestAuditSnapshot),
      competitors: competitors.map((competitor) => ({
        competitorName:
          competitor.competitorName ?? competitor.name ?? "Competitor",
        profiles: (
          competitor.profiles ??
          competitor.discoveredProfiles ??
          []
        ).map((profile) => ({
          platform: profile.platform,
          status: profile.status,
          label: profile.displayName ?? profile.label,
        })),
      })),
      goals,
      primaryGoal,
      businessContext,
    }),
  );
}

export function getReviewFreshnessSummary({
  latestAuditCreatedAt,
  googleBusinessProfiles,
}: {
  latestAuditCreatedAt?: Date | null;
  googleBusinessProfiles: CurrentReviewGoogleBusinessProfile[];
}): ReviewFreshnessSummary {
  if (!latestAuditCreatedAt) {
    return {
      status: "no_completed_audit",
      needsFreshAudit: false,
      confirmedAfterAudit: [],
      note: null,
    };
  }

  const confirmedAfterAudit = googleBusinessProfiles
    .filter(
      (profile) =>
        profile.status === "confirmed" &&
        profile.confirmedAt instanceof Date &&
        profile.confirmedAt.getTime() > latestAuditCreatedAt.getTime(),
    )
    .map((profile) => ({
      displayName: profile.displayName ?? null,
      confirmedAt: profile.confirmedAt as Date,
      updatedAt: profile.updatedAt instanceof Date ? profile.updatedAt : null,
    }));

  if (confirmedAfterAudit.length === 0) {
    return {
      status: "current",
      needsFreshAudit: false,
      confirmedAfterAudit: [],
      note: null,
    };
  }

  return {
    status: "stale_after_google_confirmation",
    needsFreshAudit: true,
    confirmedAfterAudit,
    note:
      "Your Google Business listing was confirmed after this audit. Run a fresh audit to update saved scores and reports.",
  };
}

export function toReviewAnalyzerGoogleBusinessProfile(
  profile: CurrentReviewGoogleBusinessProfile,
): ReviewAnalyzerGoogleBusinessProfile {
  return {
    id: profile.id,
    displayName: profile.displayName,
    formattedAddress: profile.formattedAddress,
    phoneNumber: profile.phoneNumber,
    websiteUri: profile.websiteUri,
    googleMapsUri: profile.googleMapsUri,
    rating: profile.rating,
    reviewCount: profile.reviewCount,
    matchConfidence: profile.matchConfidence,
    matchReasons: profile.matchReasons,
    status: profile.status,
    source: profile.source,
  };
}

export function getGoogleBusinessDiscovery(snapshot: unknown) {
  if (!isRecord(snapshot) || !isRecord(snapshot.googleBusinessDiscovery)) {
    return null;
  }

  const discovery = snapshot.googleBusinessDiscovery;

  return {
    apiConfigured:
      typeof discovery.apiConfigured === "boolean"
        ? discovery.apiConfigured
        : undefined,
    searched:
      typeof discovery.searched === "boolean" ? discovery.searched : undefined,
    error: typeof discovery.error === "string" ? discovery.error : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

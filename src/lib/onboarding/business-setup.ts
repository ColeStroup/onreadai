import {
  AuditStatus,
  BusinessProfileSource,
  BusinessProfileStatus,
  ProfileReviewDecision,
  type BusinessGoal,
  type ProfilePlatform,
} from "@prisma/client";

import { hasConfirmedWebsite } from "@/lib/audits/audit-applicability";

export const businessSetupSteps = [
  "profiles",
  "context",
  "goals",
  "audit",
  "results",
] as const;

export type BusinessSetupStep = (typeof businessSetupSteps)[number];

export type BusinessSetupSource = {
  profiles: Array<{
    status: BusinessProfileStatus;
    platform: ProfilePlatform;
    url?: string | null;
    handle?: string | null;
    source?: BusinessProfileSource;
  }>;
  description?: string | null;
  targetAudience?: string | null;
  mainOffer?: string | null;
  industry?: string | null;
  businessType?: string | null;
  primaryConversionGoal?: string | null;
  contextConfirmedAt?: Date | null;
  goals: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
  audits: Array<{
    status: AuditStatus;
    id?: string;
    overallScore?: number | null;
  }>;
  onboardingCompletedAt?: Date | null;
  googleBusinessProfiles?: Array<{ status: string }>;
  profileDecisions?: Array<{
    platform: ProfilePlatform;
    decision: ProfileReviewDecision;
  }>;
};

export type BusinessSetupProgress = {
  profileCounts: {
    confirmed: number;
    pending: number;
    removed: number;
    manuallyAdded: number;
    skipped: number;
    notUsed: number;
  };
  profilesComplete: boolean;
  googleReviewed: boolean;
  hasConfirmedWebsite: boolean;
  socialFirst: boolean;
  contextHasCoreDetails: boolean;
  contextState: "missing" | "needs_review" | "complete";
  contextComplete: boolean;
  goalsComplete: boolean;
  auditComplete: boolean;
  resultsReviewed: boolean;
  readyToAudit: boolean;
  completedSteps: Record<BusinessSetupStep, boolean>;
  currentStep: BusinessSetupStep;
  completedCount: number;
  percent: number;
  listStatus: "Setup incomplete" | "Ready to audit" | "Audit complete";
};

export function deriveBusinessSetupProgress(
  business: BusinessSetupSource,
): BusinessSetupProgress {
  const websiteProfiles = business.profiles.filter(
    (profile) => profile.platform === "WEBSITE",
  );
  const confirmedProfiles = websiteProfiles.filter(
    (profile) =>
      profile.status === BusinessProfileStatus.CONFIRMED &&
      Boolean(profile.url?.trim() || profile.handle?.trim()),
  );
  const pendingProfiles = websiteProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.PENDING,
  );
  const removedProfiles = websiteProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.REMOVED,
  );
  const manuallyAddedProfiles = websiteProfiles.filter(
    (profile) =>
      profile.source === BusinessProfileSource.MANUAL &&
      profile.status !== BusinessProfileStatus.REMOVED,
  );
  const googleReviewed = true;
  const websiteConfirmed = hasConfirmedWebsite(business.profiles);
  const socialFirst = false;
  const profilesComplete = websiteConfirmed && pendingProfiles.length === 0;
  const contextHasCoreDetails = Boolean(
    business.description?.trim() &&
    business.targetAudience?.trim() &&
    business.mainOffer?.trim(),
  );
  const hasContext = Boolean(
    business.description?.trim() ||
    business.targetAudience?.trim() ||
    business.mainOffer?.trim() ||
    business.industry?.trim() ||
    business.businessType?.trim() ||
    business.primaryConversionGoal?.trim(),
  );
  const contextState = !hasContext
    ? "missing"
    : business.contextConfirmedAt
      ? "complete"
      : "needs_review";
  const goalsComplete =
    business.goals.length > 0 && Boolean(business.primaryGoal);
  const auditComplete = business.audits.some(
    (audit) => audit.status === AuditStatus.COMPLETED,
  );
  const resultsReviewed = Boolean(business.onboardingCompletedAt);
  const completedSteps: Record<BusinessSetupStep, boolean> = {
    profiles: profilesComplete,
    context: contextState === "complete",
    goals: goalsComplete,
    audit: auditComplete,
    results: resultsReviewed,
  };
  const currentStep =
    businessSetupSteps.find((step) => !completedSteps[step]) ?? "results";
  const completedCount = businessSetupSteps.filter(
    (step) => completedSteps[step],
  ).length;

  return {
    profileCounts: {
      confirmed: confirmedProfiles.length,
      pending: pendingProfiles.length,
      removed: removedProfiles.length,
      manuallyAdded: manuallyAddedProfiles.length,
      skipped: 0,
      notUsed: 0,
    },
    profilesComplete,
    googleReviewed,
    hasConfirmedWebsite: websiteConfirmed,
    socialFirst,
    contextHasCoreDetails,
    contextState,
    contextComplete: contextState === "complete",
    goalsComplete,
    auditComplete,
    resultsReviewed,
    readyToAudit:
      profilesComplete && contextState !== "missing" && goalsComplete,
    completedSteps,
    currentStep,
    completedCount,
    percent: Math.round((completedCount / businessSetupSteps.length) * 100),
    listStatus: auditComplete
      ? "Audit complete"
      : profilesComplete && contextState !== "missing" && goalsComplete
        ? "Ready to audit"
        : "Setup incomplete",
  };
}

export function isBusinessSetupStep(value: string): value is BusinessSetupStep {
  return businessSetupSteps.includes(value as BusinessSetupStep);
}

export function nextBusinessSetupStep(step: BusinessSetupStep) {
  const index = businessSetupSteps.indexOf(step);
  return businessSetupSteps[Math.min(index + 1, businessSetupSteps.length - 1)];
}

export function previousBusinessSetupStep(step: BusinessSetupStep) {
  const index = businessSetupSteps.indexOf(step);
  return businessSetupSteps[Math.max(index - 1, 0)];
}

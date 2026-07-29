"use server";

import {
  PlanType,
  ProfilePlatform,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import {
  createPendingAuditRun,
  revalidateAuditPaths,
} from "@/lib/audits/audit-runner";
import {
  hasConfirmedAuditablePresence,
} from "@/lib/audits/audit-applicability";
import { getUserPlan } from "@/lib/billing/entitlements";
import { deriveAuditSourceReadiness } from "@/lib/onboarding/audit-source-readiness";
import { logInfo } from "@/lib/observability/log";
import { prisma } from "@/lib/prisma";
import {
  addManualBusinessProfile,
  confirmBusinessProfile,
  editBusinessProfile,
  ProfileMutationError,
  removeBusinessProfile,
  restoreBusinessProfile,
} from "@/lib/profiles/profile-management";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";
import { requireUser } from "@/lib/session";

async function requireOwnedBusiness(businessId: string) {
  const user = await requireUser(`/dashboard/businesses/${businessId}/confirm`);
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    select: {
      id: true,
      ownerId: true,
      description: true,
      targetAudience: true,
      mainOffer: true,
      contextConfirmedAt: true,
      goals: true,
      primaryGoal: true,
      auditSourceAcknowledgementHash: true,
      profiles: {
        select: {
          id: true,
          platform: true,
          status: true,
          normalizedUrl: true,
          url: true,
          handle: true,
          updatedAt: true,
        },
      },
      googleBusinessProfiles: {
        where: { status: { not: "removed" } },
        select: {
          id: true,
          status: true,
          updatedAt: true,
        },
      },
      profileDecisions: {
        select: {
          platform: true,
          decision: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!business) {
    notFound();
  }

  return business;
}

function profileReturnPath(formData: FormData, businessId: string) {
  return formData.get("returnTo") === "setup"
    ? `/dashboard/businesses/${businessId}/setup?step=profiles`
    : `/dashboard/businesses/${businessId}/confirm`;
}

function revalidateProfilePaths(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}/confirm`);
  revalidatePath(`/dashboard/businesses/${businessId}/setup`);
  revalidatePath(`/dashboard/businesses/${businessId}/overview`);
  revalidatePath("/dashboard/businesses");
  revalidatePath("/dashboard");
}

function profileErrorPath(
  formData: FormData,
  businessId: string,
  error: string,
) {
  const path = profileReturnPath(formData, businessId);
  return `${path}${path.includes("?") ? "&" : "?"}error=${error}`;
}

export async function confirmProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");

  const business = await requireOwnedBusiness(businessId);
  await enforceProfileMutationLimit(formData, businessId, business.ownerId);
  try {
    await confirmBusinessProfile({ businessId, profileId });
  } catch (error) {
    if (error instanceof ProfileMutationError) {
      redirect(profileErrorPath(formData, businessId, error.code.toLowerCase()));
    }
    throw error;
  }

  revalidateProfilePaths(businessId);
  redirect(profileReturnPath(formData, businessId));
}

export async function removeProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");

  const business = await requireOwnedBusiness(businessId);
  await enforceProfileMutationLimit(formData, businessId, business.ownerId);
  try {
    await removeBusinessProfile({ businessId, profileId });
  } catch (error) {
    if (error instanceof ProfileMutationError) {
      redirect(profileErrorPath(formData, businessId, error.code.toLowerCase()));
    }
    throw error;
  }

  revalidateProfilePaths(businessId);
  redirect(profileReturnPath(formData, businessId));
}

export async function restoreProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");

  const business = await requireOwnedBusiness(businessId);
  await enforceProfileMutationLimit(formData, businessId, business.ownerId);
  try {
    await restoreBusinessProfile({ businessId, profileId });
  } catch (error) {
    if (error instanceof ProfileMutationError) {
      redirect(profileErrorPath(formData, businessId, error.code.toLowerCase()));
    }
    throw error;
  }

  revalidateProfilePaths(businessId);
  redirect(profileReturnPath(formData, businessId));
}

export async function updateProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const profileValue = String(formData.get("profileValue") ?? "");

  const business = await requireOwnedBusiness(businessId);
  await enforceProfileMutationLimit(formData, businessId, business.ownerId);
  const profile = business.profiles.find((item) => item.id === profileId);
  if (!profile) {
    redirect(profileErrorPath(formData, businessId, "profile-value"));
  }
  try {
    await editBusinessProfile({
      businessId,
      profileId,
      platform: profile.platform,
      url: profileValue,
    });
  } catch (error) {
    if (error instanceof ProfileMutationError) {
      redirect(profileErrorPath(formData, businessId, error.code.toLowerCase()));
    }
    throw error;
  }

  revalidateProfilePaths(businessId);
  redirect(profileReturnPath(formData, businessId));
}

export async function addManualProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const platformValue = String(formData.get("platform") ?? "");
  const profileValue = String(formData.get("profileValue") ?? "");

  const business = await requireOwnedBusiness(businessId);
  await enforceProfileMutationLimit(formData, businessId, business.ownerId);

  if (!isProfilePlatform(platformValue)) {
    redirect(profileErrorPath(formData, businessId, "manual-profile"));
  }
  try {
    await addManualBusinessProfile({
      businessId,
      platform: platformValue,
      url: profileValue,
    });
  } catch (error) {
    if (error instanceof ProfileMutationError) {
      redirect(profileErrorPath(formData, businessId, error.code.toLowerCase()));
    }
    throw error;
  }

  revalidateProfilePaths(businessId);
  redirect(profileReturnPath(formData, businessId));
}

export async function prepareAuditRun(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const returnToSetup = formData.get("returnTo") === "setup";
  const acknowledgeMissingSources =
    formData.get("acknowledgeMissingSources") === "1";

  const business = await requireOwnedBusiness(businessId);
  const hasConfirmedGoogleCandidate = business.googleBusinessProfiles.some(
    (profile) => profile.status.toLowerCase() === "confirmed",
  );

  if (
    !hasConfirmedAuditablePresence(business.profiles) &&
    !hasConfirmedGoogleCandidate
  ) {
    redirect(
      `/dashboard/businesses/${businessId}/confirm?error=confirmed-presence`,
    );
  }

  const plan = await getUserPlan(business.ownerId);
  const sourceReadiness = deriveAuditSourceReadiness(business);
  const requiresComprehensiveAcknowledgement =
    plan !== PlanType.FREE && sourceReadiness.requiresAcknowledgement;

  if (requiresComprehensiveAcknowledgement && !acknowledgeMissingSources) {
    redirect(
      `/dashboard/businesses/${businessId}/setup?step=audit&missingSources=1`,
    );
  }

  if (requiresComprehensiveAcknowledgement && acknowledgeMissingSources) {
    await prisma.business.update({
      where: { id: business.id },
      data: {
        auditSourceAcknowledgementHash: sourceReadiness.stateHash,
        auditSourceAcknowledgedAt: new Date(),
      },
    });
    logInfo("guided_missing_sources_acknowledged", {
      businessId,
      missingSourceCount: sourceReadiness.missingSources.length,
    });
  }

  const audit = await createPendingAuditRun(businessId);
  logInfo("guided_audit_started", {
    businessId,
    auditId: audit.id,
    plan,
  });

  revalidateAuditPaths(businessId);
  const returnQuery = returnToSetup ? "&returnTo=setup" : "";
  redirect(
    `/dashboard/businesses/${businessId}/audit/run?auditId=${audit.id}${returnQuery}`,
  );
}

function isProfilePlatform(value: string): value is ProfilePlatform {
  return Object.values(ProfilePlatform).includes(value as ProfilePlatform);
}

async function enforceProfileMutationLimit(
  formData: FormData,
  businessId: string,
  userId: string,
) {
  try {
    await enforceRateLimit({
      scope: "profile-mutation",
      identifiers: [
        userId,
        businessId,
        await currentRequestRateLimitIdentifier(),
      ],
      limit: 120,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect(profileErrorPath(formData, businessId, "rate-limited"));
    }
    throw error;
  }
}

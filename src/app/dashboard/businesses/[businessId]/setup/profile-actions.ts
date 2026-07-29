"use server";

import {
  ProfilePlatform,
  ProfileReviewDecision,
  type Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { deriveBusinessSetupProgress } from "@/lib/onboarding/business-setup";
import { logError, logInfo } from "@/lib/observability/log";
import { platformLabels } from "@/lib/profiles/platforms";
import {
  addManualBusinessProfile,
  confirmBusinessProfile,
  confirmGoogleBusinessCandidate,
  editBusinessProfile,
  ProfileMutationError,
  removeBusinessProfile,
  removeGoogleBusinessCandidate,
  replaceGoogleBusinessCandidate,
  restoreBusinessProfile,
  setBusinessPlatformDecision,
} from "@/lib/profiles/profile-management";
import { prisma } from "@/lib/prisma";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";
import { requireUser } from "@/lib/session";

export type GuidedProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
  operation?: string;
  profileId?: string;
  fieldErrors?: {
    platform?: string;
    url?: string;
    displayName?: string;
  };
  values?: {
    platform?: string;
    url?: string;
    displayName?: string;
  };
  completedAt?: number;
};

type GuidedProfileOperation =
  | "add"
  | "confirm"
  | "edit"
  | "remove"
  | "restore"
  | "set_decision"
  | "confirm_google_candidate"
  | "edit_google_candidate"
  | "remove_google_candidate";

export async function mutateGuidedProfile(
  _previousState: GuidedProfileActionState,
  formData: FormData,
): Promise<GuidedProfileActionState> {
  const businessId = clean(formData.get("businessId"), 120);
  const operation = clean(
    formData.get("operation"),
    80,
  ) as GuidedProfileOperation;
  const profileId = clean(formData.get("profileId"), 120);
  const platformValue = clean(formData.get("platform"), 80);
  const url = clean(formData.get("url"), 2_000);
  const displayName = clean(formData.get("displayName"), 160);
  const values = {
    platform: platformValue,
    url,
    displayName,
  };
  const user = await requireUser(
    `/dashboard/businesses/${businessId}/setup?step=profiles`,
  );
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    select: {
      id: true,
    },
  });

  if (!business) {
    return safeError(
      operation,
      "This business is unavailable or you no longer have access.",
      values,
      profileId,
    );
  }

  try {
    await enforceRateLimit({
      scope: "guided-profile-mutation",
      identifiers: [
        user.id,
        business.id,
        await currentRequestRateLimitIdentifier(),
      ],
      limit: 120,
      windowMs: 60 * 60 * 1_000,
    });

    const platform = isProfilePlatform(platformValue)
      ? platformValue
      : null;

    switch (operation) {
      case "add": {
        if (!platform) {
          return fieldError(
            operation,
            "Choose a supported platform.",
            "platform",
            values,
          );
        }
        const profile = await addManualBusinessProfile({
          businessId: business.id,
          platform,
          url,
          displayName,
        });
        logInfo("guided_profile_added_manually", {
          businessId: business.id,
          platform,
        });
        if (platform === ProfilePlatform.GOOGLE_BUSINESS) {
          logInfo("guided_google_profile_added", {
            businessId: business.id,
          });
        }
        await finishProfileMutation(business.id);
        return successState(
          operation,
          `${platformLabels[platform]} added and confirmed.`,
          profile.id,
        );
      }
      case "confirm": {
        if (!profileId) {
          return safeError(
            operation,
            "That profile is no longer available.",
            values,
          );
        }
        const profile = await confirmBusinessProfile({
          businessId: business.id,
          profileId,
        });
        logInfo("guided_profile_confirmed", {
          businessId: business.id,
          platform: profile.platform,
        });
        await finishProfileMutation(business.id);
        return successState(
          operation,
          `${platformLabels[profile.platform]} confirmed.`,
          profile.id,
        );
      }
      case "edit": {
        if (!profileId) {
          return safeError(
            operation,
            "That profile is no longer available.",
            values,
          );
        }
        if (!platform) {
          return fieldError(
            operation,
            "Choose a supported platform.",
            "platform",
            values,
            profileId,
          );
        }
        const profile = await editBusinessProfile({
          businessId: business.id,
          profileId,
          platform,
          url,
          displayName,
          confirmAfterEdit: true,
        });
        logInfo("guided_profile_edited", {
          businessId: business.id,
          platform: profile.platform,
        });
        await finishProfileMutation(business.id);
        return successState(
          operation,
          `${platformLabels[profile.platform]} updated and confirmed.`,
          profile.id,
        );
      }
      case "remove": {
        if (!profileId) {
          return safeError(
            operation,
            "That profile is no longer available.",
            values,
          );
        }
        await removeBusinessProfile({
          businessId: business.id,
          profileId,
        });
        logInfo("guided_profile_removed", {
          businessId: business.id,
        });
        await finishProfileMutation(business.id);
        return successState(operation, "Profile removed.", profileId);
      }
      case "restore": {
        if (!profileId) {
          return safeError(
            operation,
            "That profile is no longer available.",
            values,
          );
        }
        const profile = await restoreBusinessProfile({
          businessId: business.id,
          profileId,
        });
        await finishProfileMutation(business.id);
        return successState(
          operation,
          `${platformLabels[profile.platform]} restored for review.`,
          profile.id,
        );
      }
      case "set_decision": {
        if (!platform) {
          return fieldError(
            operation,
            "Choose a supported platform.",
            "platform",
            values,
          );
        }
        const decisionValue = clean(formData.get("decision"), 40);
        if (!isProfileReviewDecision(decisionValue)) {
          return safeError(
            operation,
            "Choose whether this platform is not used or skipped for now.",
            values,
          );
        }
        await setBusinessPlatformDecision({
          businessId: business.id,
          platform,
          decision: decisionValue,
        });
        logInfo(
          platform === ProfilePlatform.GOOGLE_BUSINESS
            ? "guided_google_profile_skipped"
            : "guided_profile_platform_decided",
          {
            businessId: business.id,
            platform,
            decision: decisionValue,
          },
        );
        await finishProfileMutation(business.id);
        return successState(
          operation,
          decisionValue === ProfileReviewDecision.NOT_USED
            ? `${platformLabels[platform]} marked as not used.`
            : `${platformLabels[platform]} skipped for now.`,
        );
      }
      case "confirm_google_candidate": {
        if (!profileId) {
          return safeError(
            operation,
            "That Google Business candidate is no longer available.",
            values,
          );
        }
        await confirmGoogleBusinessCandidate({
          businessId: business.id,
          profileId,
        });
        logInfo("guided_profile_confirmed", {
          businessId: business.id,
          platform: ProfilePlatform.GOOGLE_BUSINESS,
        });
        await finishProfileMutation(business.id);
        return successState(
          operation,
          "Google Business Profile confirmed.",
          profileId,
        );
      }
      case "edit_google_candidate": {
        if (!profileId) {
          return safeError(
            operation,
            "That Google Business candidate is no longer available.",
            values,
          );
        }
        const profile = await replaceGoogleBusinessCandidate({
          businessId: business.id,
          candidateId: profileId,
          url,
          displayName,
        });
        logInfo("guided_profile_edited", {
          businessId: business.id,
          platform: ProfilePlatform.GOOGLE_BUSINESS,
        });
        logInfo("guided_google_profile_added", {
          businessId: business.id,
        });
        await finishProfileMutation(business.id);
        return successState(
          operation,
          "Google Business Profile updated and confirmed.",
          profile.id,
        );
      }
      case "remove_google_candidate": {
        if (!profileId) {
          return safeError(
            operation,
            "That Google Business candidate is no longer available.",
            values,
          );
        }
        await removeGoogleBusinessCandidate({
          businessId: business.id,
          profileId,
        });
        logInfo("guided_profile_removed", {
          businessId: business.id,
          platform: ProfilePlatform.GOOGLE_BUSINESS,
        });
        await finishProfileMutation(business.id);
        return successState(
          operation,
          "Google Business candidate removed.",
          profileId,
        );
      }
      default:
        return safeError(
          operation,
          "That profile action is not supported.",
          values,
          profileId,
        );
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      return safeError(
        operation,
        `Please wait ${error.retryAfterSeconds} seconds before trying again.`,
        values,
        profileId,
      );
    }
    if (error instanceof ProfileMutationError) {
      if (error.field) {
        return fieldError(
          operation,
          error.message,
          error.field,
          values,
          profileId,
        );
      }
      return safeError(
        operation,
        error.message,
        values,
        profileId,
      );
    }
    if (isUniqueConstraintError(error)) {
      return fieldError(
        operation,
        "That profile has already been added.",
        "url",
        values,
        profileId,
      );
    }

    logError("guided_profile_mutation_failed", error, {
      businessId: business.id,
      operation,
    });
    return safeError(
      operation,
      "We couldn't save your changes. Your existing setup was not changed.",
      values,
      profileId,
    );
  }
}

async function finishProfileMutation(businessId: string) {
  revalidateProfilePaths(businessId);

  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    include: {
      profiles: true,
      profileDecisions: true,
      googleBusinessProfiles: {
        select: {
          status: true,
        },
      },
      audits: {
        select: {
          status: true,
        },
      },
    },
  });

  if (business && deriveBusinessSetupProgress(business).profilesComplete) {
    logInfo("guided_profile_step_completed", {
      businessId,
    });
  }
}

function revalidateProfilePaths(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}/confirm`);
  revalidatePath(`/dashboard/businesses/${businessId}/setup`);
  revalidatePath(`/dashboard/businesses/${businessId}/overview`);
  revalidatePath(`/dashboard/businesses/${businessId}/reviews`);
  revalidatePath(`/dashboard/businesses/${businessId}/social`);
  revalidatePath(`/dashboard/businesses/${businessId}/chat`);
  revalidatePath("/dashboard/businesses");
  revalidatePath("/dashboard");
}

function successState(
  operation: string,
  message: string,
  profileId?: string,
): GuidedProfileActionState {
  return {
    status: "success",
    message,
    operation,
    profileId,
    completedAt: Date.now(),
  };
}

function safeError(
  operation: string,
  message: string,
  values?: GuidedProfileActionState["values"],
  profileId?: string,
): GuidedProfileActionState {
  return {
    status: "error",
    message,
    operation,
    profileId,
    values,
    completedAt: Date.now(),
  };
}

function fieldError(
  operation: string,
  message: string,
  field: keyof NonNullable<GuidedProfileActionState["fieldErrors"]>,
  values?: GuidedProfileActionState["values"],
  profileId?: string,
): GuidedProfileActionState {
  return {
    ...safeError(operation, message, values, profileId),
    fieldErrors: {
      [field]: message,
    },
  };
}

function isProfilePlatform(value: string): value is ProfilePlatform {
  return Object.values(ProfilePlatform).includes(value as ProfilePlatform);
}

function isProfileReviewDecision(
  value: string,
): value is ProfileReviewDecision {
  return Object.values(ProfileReviewDecision).includes(
    value as ProfileReviewDecision,
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as Prisma.PrismaClientKnownRequestError).code === "P2002"
  );
}

function clean(value: FormDataEntryValue | null, limit: number) {
  return String(value ?? "").trim().slice(0, limit);
}

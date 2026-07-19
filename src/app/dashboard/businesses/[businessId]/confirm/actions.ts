"use server";

import {
  BusinessProfileStatus,
  ProfilePlatform,
  type Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import {
  createPendingAuditRun,
  revalidateAuditPaths,
} from "@/lib/audits/audit-runner";
import {
  confirmedSocialProfiles,
  hasConfirmedAuditablePresence,
  hasConfirmedWebsite,
} from "@/lib/audits/audit-applicability";
import { hasCoreBusinessContext } from "@/lib/business-context";
import { platformLabels } from "@/lib/profiles/platforms";
import { prisma } from "@/lib/prisma";
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
      description: true,
      targetAudience: true,
      mainOffer: true,
      contextConfirmedAt: true,
      profiles: {
        select: {
          platform: true,
          status: true,
          url: true,
          handle: true,
        },
      },
    },
  });

  if (!business) {
    notFound();
  }

  return business;
}

function normalizeProfileValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (
    /^https?:\/\//i.test(trimmed) ||
    /^www\./i.test(trimmed) ||
    trimmed.includes(".")
  ) {
    return {
      url: /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
      handle: null,
    };
  }

  return {
    url: null,
    handle: trimmed.startsWith("@") ? trimmed : `@${trimmed}`,
  };
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

  await requireOwnedBusiness(businessId);

  await prisma.businessProfile.updateMany({
    where: {
      id: profileId,
      businessId,
    },
    data: {
      status: BusinessProfileStatus.CONFIRMED,
      isConfirmed: true,
    },
  });

  revalidateProfilePaths(businessId);
  if (formData.get("returnTo") === "setup") {
    redirect(profileReturnPath(formData, businessId));
  }
}

export async function removeProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");

  await requireOwnedBusiness(businessId);

  await prisma.businessProfile.updateMany({
    where: {
      id: profileId,
      businessId,
    },
    data: {
      status: BusinessProfileStatus.REMOVED,
      isConfirmed: false,
    },
  });

  revalidateProfilePaths(businessId);
  if (formData.get("returnTo") === "setup") {
    redirect(profileReturnPath(formData, businessId));
  }
}

export async function restoreProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");

  await requireOwnedBusiness(businessId);

  await prisma.businessProfile.updateMany({
    where: {
      id: profileId,
      businessId,
      status: BusinessProfileStatus.REMOVED,
    },
    data: {
      status: BusinessProfileStatus.PENDING,
      isConfirmed: false,
    },
  });

  revalidateProfilePaths(businessId);
  if (formData.get("returnTo") === "setup") {
    redirect(profileReturnPath(formData, businessId));
  }
}

export async function updateProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const profileValue = String(formData.get("profileValue") ?? "");
  const normalizedValue = normalizeProfileValue(profileValue);

  await requireOwnedBusiness(businessId);

  if (!normalizedValue) {
    redirect(profileErrorPath(formData, businessId, "profile-value"));
  }

  await prisma.businessProfile.updateMany({
    where: {
      id: profileId,
      businessId,
    },
    data: {
      url: normalizedValue.url,
      handle: normalizedValue.handle,
      status: BusinessProfileStatus.PENDING,
      isConfirmed: false,
    },
  });

  revalidateProfilePaths(businessId);
  redirect(profileReturnPath(formData, businessId));
}

export async function addManualProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const platformValue = String(formData.get("platform") ?? "");
  const profileValue = String(formData.get("profileValue") ?? "");
  const normalizedValue = normalizeProfileValue(profileValue);

  await requireOwnedBusiness(businessId);

  if (!isProfilePlatform(platformValue) || !normalizedValue) {
    redirect(profileErrorPath(formData, businessId, "manual-profile"));
  }

  const data: Prisma.BusinessProfileCreateInput = {
    business: {
      connect: {
        id: businessId,
      },
    },
    platform: platformValue,
    displayName: platformLabels[platformValue],
    url: normalizedValue.url,
    handle: normalizedValue.handle,
    confidenceScore: 100,
    status: BusinessProfileStatus.PENDING,
    discoveredAt: new Date(),
  };

  await prisma.businessProfile.create({ data });

  revalidateProfilePaths(businessId);
  redirect(profileReturnPath(formData, businessId));
}

export async function prepareAuditRun(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const returnToSetup = formData.get("returnTo") === "setup";

  const business = await requireOwnedBusiness(businessId);

  if (!hasConfirmedAuditablePresence(business.profiles)) {
    redirect(
      `/dashboard/businesses/${businessId}/confirm?error=confirmed-presence`,
    );
  }

  const socialFirst =
    !hasConfirmedWebsite(business.profiles) &&
    confirmedSocialProfiles(business.profiles).length > 0;

  if (
    socialFirst &&
    (!hasCoreBusinessContext(business) || !business.contextConfirmedAt)
  ) {
    redirect(
      `/dashboard/businesses/${businessId}/setup?step=context&socialFirst=1`,
    );
  }

  const audit = await createPendingAuditRun(businessId);

  revalidateAuditPaths(businessId);
  const returnQuery = returnToSetup ? "&returnTo=setup" : "";
  redirect(
    `/dashboard/businesses/${businessId}/audit/run?auditId=${audit.id}${returnQuery}`,
  );
}

function isProfilePlatform(value: string): value is ProfilePlatform {
  return Object.values(ProfilePlatform).includes(value as ProfilePlatform);
}

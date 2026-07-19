"use server";

import { BusinessProfileStatus, ProfilePlatform } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { platformLabels } from "@/lib/profiles/platforms";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

async function requireOwnedCompetitor({
  businessId,
  competitorId,
}: {
  businessId: string;
  competitorId: string;
}) {
  const user = await requireUser(
    `/dashboard/businesses/${businessId}/competitors/${competitorId}/profiles`,
  );
  const competitor = await prisma.competitor.findFirst({
    where: {
      id: competitorId,
      businessId,
      business: {
        ownerId: user.id,
      },
    },
    select: {
      id: true,
      businessId: true,
    },
  });

  if (!competitor) {
    notFound();
  }

  return competitor;
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
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function profilesPath({
  businessId,
  competitorId,
}: {
  businessId: string;
  competitorId: string;
}) {
  return `/dashboard/businesses/${businessId}/competitors/${competitorId}/profiles`;
}

function revalidateCompetitorProfilePaths({
  businessId,
  competitorId,
}: {
  businessId: string;
  competitorId: string;
}) {
  revalidatePath(`/dashboard/businesses/${businessId}`);
  revalidatePath(`/dashboard/businesses/${businessId}/competitors`);
  revalidatePath(profilesPath({ businessId, competitorId }));
  revalidatePath(`/dashboard/businesses/${businessId}/overview`);
  revalidatePath(`/dashboard/businesses/${businessId}/chat`);
}

export async function confirmCompetitorProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const competitorId = String(formData.get("competitorId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");

  await requireOwnedCompetitor({ businessId, competitorId });

  await prisma.competitorProfile.updateMany({
    where: {
      id: profileId,
      competitorId,
    },
    data: {
      status: BusinessProfileStatus.CONFIRMED,
    },
  });

  revalidateCompetitorProfilePaths({ businessId, competitorId });
}

export async function removeCompetitorProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const competitorId = String(formData.get("competitorId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");

  await requireOwnedCompetitor({ businessId, competitorId });

  await prisma.competitorProfile.updateMany({
    where: {
      id: profileId,
      competitorId,
    },
    data: {
      status: BusinessProfileStatus.REMOVED,
    },
  });

  revalidateCompetitorProfilePaths({ businessId, competitorId });
}

export async function updateCompetitorProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const competitorId = String(formData.get("competitorId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const profileValue = normalizeProfileValue(
    String(formData.get("profileValue") ?? ""),
  );

  await requireOwnedCompetitor({ businessId, competitorId });

  if (!profileValue) {
    redirect(`${profilesPath({ businessId, competitorId })}?error=profile-value`);
  }

  await prisma.competitorProfile.updateMany({
    where: {
      id: profileId,
      competitorId,
    },
    data: {
      urlOrHandle: profileValue,
      status: BusinessProfileStatus.PENDING,
    },
  });

  revalidateCompetitorProfilePaths({ businessId, competitorId });
  redirect(profilesPath({ businessId, competitorId }));
}

export async function addManualCompetitorProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const competitorId = String(formData.get("competitorId") ?? "");
  const platformValue = String(formData.get("platform") ?? "");
  const profileValue = normalizeProfileValue(
    String(formData.get("profileValue") ?? ""),
  );

  await requireOwnedCompetitor({ businessId, competitorId });

  if (!isProfilePlatform(platformValue) || !profileValue) {
    redirect(`${profilesPath({ businessId, competitorId })}?error=manual-profile`);
  }

  await prisma.competitorProfile.create({
    data: {
      competitorId,
      platform: platformValue,
      label: platformLabels[platformValue],
      urlOrHandle: profileValue,
      confidenceScore: 100,
      status: BusinessProfileStatus.PENDING,
    },
  });

  revalidateCompetitorProfilePaths({ businessId, competitorId });
  redirect(profilesPath({ businessId, competitorId }));
}

function isProfilePlatform(value: string): value is ProfilePlatform {
  return Object.values(ProfilePlatform).includes(value as ProfilePlatform);
}

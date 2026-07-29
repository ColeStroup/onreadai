import "server-only";

import {
  BusinessProfileSource,
  BusinessProfileStatus,
  ProfilePlatform,
  ProfileReviewDecision,
  type Prisma,
} from "@prisma/client";

import { assertPublicHttpUrl } from "@/lib/network/public-http";
import { prisma } from "@/lib/prisma";
import {
  normalizeProfileUrlSyntax,
  profileUrlComparisonKey,
  ProfileUrlError,
} from "@/lib/profiles/profile-url";

export class ProfileMutationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "INVALID_URL"
      | "DUPLICATE"
      | "INVALID_STATE",
    public readonly field?: "url" | "platform" | "displayName",
  ) {
    super(message);
    this.name = "ProfileMutationError";
  }
}

export async function addManualBusinessProfile(input: {
  businessId: string;
  platform: ProfilePlatform;
  url: string;
  displayName?: string | null;
}) {
  const normalized = await validatedProfileUrl(input.url, input.platform);
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    await lockProfileMutation(
      transaction,
      input.businessId,
      normalized.normalizedUrl,
    );
    await assertNoDuplicateProfile({
      transaction,
      businessId: input.businessId,
      normalizedUrl: normalized.normalizedUrl,
    });

    const profile = await transaction.businessProfile.create({
      data: {
        businessId: input.businessId,
        platform: input.platform,
        url: normalized.url,
        normalizedUrl: normalized.normalizedUrl,
        displayName: cleanDisplayName(input.displayName),
        confidenceScore: 0,
        status: BusinessProfileStatus.CONFIRMED,
        source: BusinessProfileSource.MANUAL,
        isConfirmed: true,
        manuallyAddedAt: now,
        confirmedAt: now,
      },
    });

    await transaction.businessProfileDecision.deleteMany({
      where: {
        businessId: input.businessId,
        platform: input.platform,
      },
    });

    if (input.platform === ProfilePlatform.GOOGLE_BUSINESS) {
      await transaction.googleBusinessProfile.updateMany({
        where: {
          businessId: input.businessId,
          status: "pending",
        },
        data: {
          status: "removed",
          confirmedAt: null,
        },
      });
    }

    return profile;
  });
}

export async function replaceGoogleBusinessCandidate(input: {
  businessId: string;
  candidateId: string;
  url: string;
  displayName?: string | null;
}) {
  const normalized = await validatedProfileUrl(
    input.url,
    ProfilePlatform.GOOGLE_BUSINESS,
  );
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    await lockProfileMutation(
      transaction,
      input.businessId,
      normalized.normalizedUrl,
    );
    const candidate = await transaction.googleBusinessProfile.findFirst({
      where: {
        id: input.candidateId,
        businessId: input.businessId,
        status: { not: "removed" },
      },
      select: { id: true },
    });

    if (!candidate) {
      throw new ProfileMutationError(
        "That Google Business candidate is no longer available.",
        "NOT_FOUND",
      );
    }

    const existingProfiles = await transaction.businessProfile.findMany({
      where: { businessId: input.businessId },
    });
    const existing = existingProfiles.find(
      (profile) =>
        (profile.normalizedUrl ??
          profileUrlComparisonKey(profile.url, profile.platform)) ===
        normalized.normalizedUrl,
    );
    if (
      existing &&
      existing.platform !== ProfilePlatform.GOOGLE_BUSINESS
    ) {
      throw new ProfileMutationError(
        "That profile has already been added under another platform.",
        "DUPLICATE",
        "url",
      );
    }

    const profile = existing
      ? await transaction.businessProfile.update({
          where: { id: existing.id },
          data: {
            url: normalized.url,
            normalizedUrl: normalized.normalizedUrl,
            displayName:
              cleanDisplayName(input.displayName) ?? existing.displayName,
            confidenceScore: 0,
            status: BusinessProfileStatus.CONFIRMED,
            source: BusinessProfileSource.MANUAL,
            isConfirmed: true,
            manuallyAddedAt: existing.manuallyAddedAt ?? now,
            confirmedAt: now,
          },
        })
      : await transaction.businessProfile.create({
          data: {
            businessId: input.businessId,
            platform: ProfilePlatform.GOOGLE_BUSINESS,
            url: normalized.url,
            normalizedUrl: normalized.normalizedUrl,
            displayName: cleanDisplayName(input.displayName),
            confidenceScore: 0,
            status: BusinessProfileStatus.CONFIRMED,
            source: BusinessProfileSource.MANUAL,
            isConfirmed: true,
            manuallyAddedAt: now,
            confirmedAt: now,
          },
        });

    await transaction.googleBusinessProfile.updateMany({
      where: {
        businessId: input.businessId,
        status: "pending",
      },
      data: {
        status: "removed",
        confirmedAt: null,
      },
    });
    await transaction.businessProfileDecision.deleteMany({
      where: {
        businessId: input.businessId,
        platform: ProfilePlatform.GOOGLE_BUSINESS,
      },
    });

    return profile;
  });
}

export async function editBusinessProfile(input: {
  businessId: string;
  profileId: string;
  platform: ProfilePlatform;
  url: string;
  displayName?: string | null;
  confirmAfterEdit?: boolean;
}) {
  const normalized = await validatedProfileUrl(input.url, input.platform);
  const now = new Date();

  return prisma.$transaction(async (transaction) => {
    await lockProfileMutation(
      transaction,
      input.businessId,
      normalized.normalizedUrl,
    );
    const profile = await transaction.businessProfile.findFirst({
      where: {
        id: input.profileId,
        businessId: input.businessId,
      },
    });

    if (!profile) {
      throw new ProfileMutationError(
        "That profile is no longer available.",
        "NOT_FOUND",
      );
    }

    await assertNoDuplicateProfile({
      transaction,
      businessId: input.businessId,
      normalizedUrl: normalized.normalizedUrl,
      excludeProfileId: profile.id,
    });

    const confirmAfterEdit = input.confirmAfterEdit ?? false;
    const updated = await transaction.businessProfile.update({
      where: {
        id: profile.id,
      },
      data: {
        platform: input.platform,
        url: normalized.url,
        normalizedUrl: normalized.normalizedUrl,
        handle: null,
        displayName:
          cleanDisplayName(input.displayName) ??
          profile.displayName,
        status: confirmAfterEdit
          ? BusinessProfileStatus.CONFIRMED
          : BusinessProfileStatus.PENDING,
        isConfirmed: confirmAfterEdit,
        confirmedAt: confirmAfterEdit ? now : null,
      },
    });

    await transaction.businessProfileDecision.deleteMany({
      where: {
        businessId: input.businessId,
        platform: input.platform,
      },
    });

    if (
      profile.platform !== input.platform &&
      input.platform === ProfilePlatform.GOOGLE_BUSINESS
    ) {
      await transaction.googleBusinessProfile.updateMany({
        where: {
          businessId: input.businessId,
          status: "pending",
        },
        data: {
          status: "removed",
          confirmedAt: null,
        },
      });
    }

    return updated;
  });
}

export async function confirmBusinessProfile(input: {
  businessId: string;
  profileId: string;
}) {
  const existingProfile = await prisma.businessProfile.findFirst({
    where: {
      id: input.profileId,
      businessId: input.businessId,
    },
  });

  if (!existingProfile) {
    throw new ProfileMutationError(
      "That profile is no longer available.",
      "NOT_FOUND",
    );
  }

  const normalized = existingProfile.url
    ? await validatedProfileUrl(
        existingProfile.url,
        existingProfile.platform,
      )
    : null;

  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.businessProfile.findFirst({
      where: {
        id: input.profileId,
        businessId: input.businessId,
      },
    });

    if (!profile) {
      throw new ProfileMutationError(
        "That profile is no longer available.",
        "NOT_FOUND",
      );
    }

    if (profile.status === BusinessProfileStatus.REMOVED) {
      throw new ProfileMutationError(
        "Restore this profile before confirming it.",
        "INVALID_STATE",
      );
    }

    if (profile.status === BusinessProfileStatus.CONFIRMED) {
      return profile;
    }

    let normalizedUrl = profile.normalizedUrl;
    let url = profile.url;
    if (normalized) {
      normalizedUrl = normalized.normalizedUrl;
      url = normalized.url;
      await assertNoDuplicateProfile({
        transaction,
        businessId: input.businessId,
        normalizedUrl,
        excludeProfileId: profile.id,
      });
    }

    const updated = await transaction.businessProfile.update({
      where: {
        id: profile.id,
      },
      data: {
        url,
        normalizedUrl,
        status: BusinessProfileStatus.CONFIRMED,
        isConfirmed: true,
        confirmedAt: new Date(),
      },
    });

    await transaction.businessProfileDecision.deleteMany({
      where: {
        businessId: input.businessId,
        platform: profile.platform,
      },
    });

    return updated;
  });
}

export async function removeBusinessProfile(input: {
  businessId: string;
  profileId: string;
}) {
  const result = await prisma.businessProfile.updateMany({
    where: {
      id: input.profileId,
      businessId: input.businessId,
      status: {
        not: BusinessProfileStatus.REMOVED,
      },
    },
    data: {
      status: BusinessProfileStatus.REMOVED,
      isConfirmed: false,
      confirmedAt: null,
    },
  });

  if (result.count > 0) return;

  const existing = await prisma.businessProfile.findFirst({
    where: {
      id: input.profileId,
      businessId: input.businessId,
    },
    select: {
      id: true,
    },
  });
  if (!existing) {
    throw new ProfileMutationError(
      "That profile is no longer available.",
      "NOT_FOUND",
    );
  }
}

export async function restoreBusinessProfile(input: {
  businessId: string;
  profileId: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.businessProfile.findFirst({
      where: {
        id: input.profileId,
        businessId: input.businessId,
      },
    });
    if (!profile) {
      throw new ProfileMutationError(
        "That profile is no longer available.",
        "NOT_FOUND",
      );
    }
    if (profile.status !== BusinessProfileStatus.REMOVED) return profile;

    await transaction.businessProfileDecision.deleteMany({
      where: {
        businessId: input.businessId,
        platform: profile.platform,
      },
    });

    return transaction.businessProfile.update({
      where: {
        id: profile.id,
      },
      data: {
        status: BusinessProfileStatus.PENDING,
        isConfirmed: false,
        confirmedAt: null,
      },
    });
  });
}

export async function setBusinessPlatformDecision(input: {
  businessId: string;
  platform: ProfilePlatform;
  decision: ProfileReviewDecision;
}) {
  return prisma.$transaction(async (transaction) => {
    await lockProfileMutation(
      transaction,
      input.businessId,
      `decision:${input.platform}`,
    );
    const confirmedProfile = await transaction.businessProfile.findFirst({
      where: {
        businessId: input.businessId,
        platform: input.platform,
        status: BusinessProfileStatus.CONFIRMED,
      },
      select: {
        id: true,
      },
    });
    const confirmedGoogle =
      input.platform === ProfilePlatform.GOOGLE_BUSINESS
        ? await transaction.googleBusinessProfile.findFirst({
            where: {
              businessId: input.businessId,
              status: "confirmed",
            },
            select: {
              id: true,
            },
          })
        : null;

    if (confirmedProfile || confirmedGoogle) {
      throw new ProfileMutationError(
        "Remove the confirmed profile before marking this platform as skipped or not used.",
        "INVALID_STATE",
      );
    }

    await transaction.businessProfile.updateMany({
      where: {
        businessId: input.businessId,
        platform: input.platform,
        status: BusinessProfileStatus.PENDING,
      },
      data: {
        status: BusinessProfileStatus.REMOVED,
        isConfirmed: false,
        confirmedAt: null,
      },
    });

    if (input.platform === ProfilePlatform.GOOGLE_BUSINESS) {
      await transaction.googleBusinessProfile.updateMany({
        where: {
          businessId: input.businessId,
          status: "pending",
        },
        data: {
          status: "removed",
          confirmedAt: null,
        },
      });
    }

    return transaction.businessProfileDecision.upsert({
      where: {
        businessId_platform: {
          businessId: input.businessId,
          platform: input.platform,
        },
      },
      update: {
        decision: input.decision,
        decidedAt: new Date(),
      },
      create: {
        businessId: input.businessId,
        platform: input.platform,
        decision: input.decision,
      },
    });
  });
}

export async function confirmGoogleBusinessCandidate(input: {
  businessId: string;
  profileId: string;
}) {
  return prisma.$transaction(async (transaction) => {
    const candidate = await transaction.googleBusinessProfile.findFirst({
      where: {
        id: input.profileId,
        businessId: input.businessId,
        status: {
          not: "removed",
        },
      },
    });

    if (!candidate) {
      throw new ProfileMutationError(
        "That Google Business candidate is no longer available.",
        "NOT_FOUND",
      );
    }

    if (candidate.status !== "confirmed") {
      await transaction.googleBusinessProfile.update({
        where: {
          id: candidate.id,
        },
        data: {
          status: "confirmed",
          confirmedAt: new Date(),
        },
      });
      await transaction.googleBusinessProfile.updateMany({
        where: {
          businessId: input.businessId,
          id: {
            not: candidate.id,
          },
          status: "pending",
        },
        data: {
          status: "removed",
          confirmedAt: null,
        },
      });
    }

    await transaction.businessProfileDecision.deleteMany({
      where: {
        businessId: input.businessId,
        platform: ProfilePlatform.GOOGLE_BUSINESS,
      },
    });

    return candidate;
  });
}

export async function removeGoogleBusinessCandidate(input: {
  businessId: string;
  profileId: string;
}) {
  const result = await prisma.googleBusinessProfile.updateMany({
    where: {
      id: input.profileId,
      businessId: input.businessId,
    },
    data: {
      status: "removed",
      confirmedAt: null,
    },
  });

  if (result.count === 0) {
    throw new ProfileMutationError(
      "That Google Business candidate is no longer available.",
      "NOT_FOUND",
    );
  }
}

async function validatedProfileUrl(
  value: string,
  platform: ProfilePlatform,
) {
  let normalized;

  try {
    normalized = normalizeProfileUrlSyntax(value, platform);
    await assertPublicHttpUrl(normalized.url);
  } catch (error) {
    if (error instanceof ProfileUrlError) {
      throw new ProfileMutationError(error.message, "INVALID_URL", "url");
    }
    throw new ProfileMutationError(
      "That URL could not be validated as a public profile.",
      "INVALID_URL",
      "url",
    );
  }

  return normalized;
}

async function assertNoDuplicateProfile({
  transaction,
  businessId,
  normalizedUrl,
  excludeProfileId,
}: {
  transaction: Prisma.TransactionClient;
  businessId: string;
  normalizedUrl: string;
  excludeProfileId?: string;
}) {
  const profiles = await transaction.businessProfile.findMany({
    where: {
      businessId,
      ...(excludeProfileId
        ? {
            id: {
              not: excludeProfileId,
            },
          }
        : {}),
    },
    select: {
      id: true,
      platform: true,
      url: true,
      normalizedUrl: true,
    },
  });

  const duplicate = profiles.some(
    (profile) =>
      (profile.normalizedUrl ??
        profileUrlComparisonKey(profile.url, profile.platform)) ===
      normalizedUrl,
  );

  if (duplicate) {
    throw new ProfileMutationError(
      "That profile has already been added.",
      "DUPLICATE",
      "url",
    );
  }
}

async function lockProfileMutation(
  transaction: Prisma.TransactionClient,
  businessId: string,
  key: string,
) {
  await transaction.$queryRaw<Array<{ lockResult: string }>>`
    SELECT pg_advisory_xact_lock(
      hashtext(${`business-profile:${businessId}:${key}`})
    )::text AS "lockResult"
  `;
}

function cleanDisplayName(value?: string | null) {
  const cleaned = value?.trim().slice(0, 160);
  return cleaned || null;
}

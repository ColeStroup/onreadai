"use server";

import type { Prisma } from "@prisma/client";
import { AuditStatus, ScoreCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { analyzeReviews } from "@/lib/analyzers/review-analyzer";
import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import { discoverGoogleBusinessProfiles } from "@/lib/google/google-business-discovery";
import {
  getGooglePlaceDetails,
  normalizePlaceId,
} from "@/lib/google/places";
import { prisma } from "@/lib/prisma";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";
import { requireUser } from "@/lib/session";

async function requireOwnedBusiness(businessId: string) {
  const user = await requireUser(`/dashboard/businesses/${businessId}/reviews`);
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
  });

  if (!business) {
    notFound();
  }

  return business;
}

export async function confirmGoogleBusinessProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");

  await requireOwnedBusiness(businessId);

  await prisma.googleBusinessProfile.updateMany({
    where: {
      id: profileId,
      businessId,
      status: {
        not: "removed",
      },
    },
    data: {
      status: "confirmed",
      confirmedAt: new Date(),
    },
  });

  await refreshLatestReviewSnapshot(businessId);
  revalidateGoogleBusinessPaths(businessId);
}

export async function removeGoogleBusinessProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");

  await requireOwnedBusiness(businessId);

  await prisma.googleBusinessProfile.updateMany({
    where: {
      id: profileId,
      businessId,
    },
    data: {
      status: "removed",
      confirmedAt: null,
    },
  });

  await refreshLatestReviewSnapshot(businessId);
  revalidateGoogleBusinessPaths(businessId);
}

export async function addManualGoogleBusinessProfile(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const value = String(formData.get("googleProfileValue") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const business = await requireOwnedBusiness(businessId);

  if (!value) {
    redirect(`/dashboard/businesses/${businessId}/reviews?error=google-manual`);
  }

  await enforceGoogleProviderRateLimit(businessId);

  const details = await getGooglePlaceDetails(value);
  const placeId = normalizePlaceId(value);

  if (details.place) {
    await saveManualPlace({
      businessId,
      placeId: details.place.googlePlaceId,
      displayName: details.place.displayName ?? displayName ?? business.name,
      formattedAddress: details.place.formattedAddress,
      phoneNumber: details.place.phoneNumber,
      websiteUri: details.place.websiteUri,
      googleMapsUri: details.place.googleMapsUri,
      rating: details.place.rating,
      reviewCount: details.place.reviewCount,
      businessStatus: details.place.businessStatus,
      primaryType: details.place.primaryType,
      types: details.place.types,
      rawSnapshot: details.place.rawSnapshot,
      matchReasons: {
        reasons: [
          "Manually added by user.",
          "Place details resolved through Google Places API.",
        ],
      },
    });
  } else {
    await prisma.googleBusinessProfile.create({
      data: {
        businessId,
        googlePlaceId: placeId,
        displayName: displayName || business.name,
        googleMapsUri: isUrl(value) ? value : null,
        matchConfidence: details.configured ? 60 : 45,
        matchReasons: {
          reasons: [
            "Manually added by user.",
            details.error ??
              "Google Places API is not configured, so details were not resolved.",
          ],
        } as Prisma.InputJsonValue,
        status: "pending",
        source: "manual",
        discoveredAt: new Date(),
      },
    });
  }

  await refreshLatestReviewSnapshot(businessId);
  revalidateGoogleBusinessPaths(businessId);
  redirect(`/dashboard/businesses/${businessId}/reviews`);
}

export async function regenerateGoogleBusinessDiscovery(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const business = await requireOwnedBusiness(businessId);
  await enforceGoogleProviderRateLimit(businessId);
  const latestAudit = await prisma.audit.findFirst({
    where: {
      businessId,
      status: AuditStatus.COMPLETED,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      analysisSnapshot: true,
    },
  });

  await discoverGoogleBusinessProfiles({
    business,
    websiteAnalysis: getWebsiteAnalysis(latestAudit?.analysisSnapshot),
    websiteCrawl: getWebsiteCrawl(latestAudit?.analysisSnapshot),
  });

  await refreshLatestReviewSnapshot(businessId);
  revalidateGoogleBusinessPaths(businessId);
}

async function enforceGoogleProviderRateLimit(businessId: string) {
  try {
    await enforceRateLimit({
      scope: "google-business-discovery",
      identifiers: [businessId, await currentRequestRateLimitIdentifier()],
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect(`/dashboard/businesses/${businessId}/reviews?error=provider-rate`);
    }
    throw error;
  }
}

function revalidateGoogleBusinessPaths(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}/reviews`);
  revalidatePath(`/dashboard/businesses/${businessId}/overview`);
  revalidatePath(`/dashboard/businesses/${businessId}/confirm`);
  revalidatePath(`/dashboard/businesses/${businessId}/setup`);
  revalidatePath(`/dashboard/businesses/${businessId}/chat`);
  revalidatePath("/dashboard/businesses");
  revalidatePath("/dashboard");
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

async function refreshLatestReviewSnapshot(businessId: string) {
  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    include: {
      profiles: true,
      googleBusinessProfiles: {
        where: {
          status: {
            not: "removed",
          },
        },
        orderBy: [
          {
            status: "asc",
          },
          {
            matchConfidence: "desc",
          },
        ],
      },
      competitors: {
        select: {
          name: true,
          discoveredProfiles: {
            select: {
              platform: true,
              status: true,
              label: true,
            },
          },
        },
      },
      audits: {
        where: {
          status: AuditStatus.COMPLETED,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          analysisSnapshot: true,
        },
      },
    },
  });
  const latestAudit = business?.audits.at(0);

  if (!business || !latestAudit) {
    return;
  }

  const previousSnapshot = isRecord(latestAudit.analysisSnapshot)
    ? latestAudit.analysisSnapshot
    : {};
  const googleDiscovery = isRecord(previousSnapshot.googleBusinessDiscovery)
    ? previousSnapshot.googleBusinessDiscovery
    : null;
  const reviewAnalysis = analyzeReviews({
    businessProfiles: business.profiles.map((profile) => ({
      platform: profile.platform,
      status: profile.status,
      label: profile.displayName,
    })),
    googleBusinessProfiles: business.googleBusinessProfiles.map((profile) => ({
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
    })),
    googleDiscovery: {
      apiConfigured:
        typeof googleDiscovery?.apiConfigured === "boolean"
          ? googleDiscovery.apiConfigured
          : undefined,
      searched:
        typeof googleDiscovery?.searched === "boolean"
          ? googleDiscovery.searched
          : undefined,
      error:
        typeof googleDiscovery?.error === "string"
          ? googleDiscovery.error
          : undefined,
    },
    competitors: business.competitors.map((competitor) => ({
      competitorName: competitor.name,
      profiles: competitor.discoveredProfiles.map((profile) => ({
        platform: profile.platform,
        status: profile.status,
        label: profile.label,
      })),
    })),
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    businessContext: {
      description: business.description,
      targetAudience: business.targetAudience,
      mainOffer: business.mainOffer,
      industry: business.industry,
      businessType: business.businessType,
      primaryConversionGoal: business.primaryConversionGoal,
    },
  });
  const updatedSnapshot = {
    ...previousSnapshot,
    reviews: reviewAnalysis,
  };

  await prisma.$transaction(async (tx) => {
    await tx.audit.update({
      where: {
        id: latestAudit.id,
      },
      data: {
        analysisSnapshot: toJsonValue(updatedSnapshot),
      },
    });

    const updatedScore = await tx.auditScore.updateMany({
      where: {
        auditId: latestAudit.id,
        category: ScoreCategory.REVIEWS,
        platform: null,
      },
      data: {
        score: reviewAnalysis.score,
      },
    });

    if (updatedScore.count === 0) {
      await tx.auditScore.create({
        data: {
          auditId: latestAudit.id,
          category: ScoreCategory.REVIEWS,
          label: "Reviews",
          score: reviewAnalysis.score,
        },
      });
    }
  });
}

async function saveManualPlace({
  businessId,
  placeId,
  displayName,
  formattedAddress,
  phoneNumber,
  websiteUri,
  googleMapsUri,
  rating,
  reviewCount,
  businessStatus,
  primaryType,
  types,
  rawSnapshot,
  matchReasons,
}: {
  businessId: string;
  placeId: string;
  displayName: string | null;
  formattedAddress: string | null;
  phoneNumber: string | null;
  websiteUri: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  primaryType: string | null;
  types: string[];
  rawSnapshot: unknown;
  matchReasons: Prisma.InputJsonValue;
}) {
  const existing = await prisma.googleBusinessProfile.findFirst({
    where: {
      businessId,
      googlePlaceId: placeId,
    },
    select: {
      id: true,
    },
  });
  const data = {
    displayName,
    formattedAddress,
    phoneNumber,
    websiteUri,
    googleMapsUri,
    rating,
    reviewCount,
    businessStatus,
    primaryType,
    types: types as Prisma.InputJsonValue,
    matchConfidence: 100,
    matchReasons,
    source: "manual",
    rawSnapshot: JSON.parse(JSON.stringify(rawSnapshot ?? null)) as Prisma.InputJsonValue,
    discoveredAt: new Date(),
  };

  if (existing) {
    await prisma.googleBusinessProfile.update({
      where: {
        id: existing.id,
      },
      data: {
        ...data,
        status: "pending",
      },
    });
    return;
  }

  await prisma.googleBusinessProfile.create({
    data: {
      businessId,
      googlePlaceId: placeId,
      status: "pending",
      ...data,
    },
  });
}

function isUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getWebsiteAnalysis(snapshot: unknown): WebsiteAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.website)) {
    return null;
  }

  const website = snapshot.website;

  return typeof website.normalizedUrl === "string" &&
    typeof website.score === "number"
    ? (website as WebsiteAnalysis)
    : null;
}

function getWebsiteCrawl(snapshot: unknown): WebsiteCrawlResult | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.websiteCrawl)) {
    return null;
  }

  const crawl = snapshot.websiteCrawl;

  return typeof crawl.pagesScanned === "number" &&
    Array.isArray(crawl.pageResults)
    ? (crawl as WebsiteCrawlResult)
    : null;
}

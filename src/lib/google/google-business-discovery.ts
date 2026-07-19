import "server-only";

import type { Prisma } from "@prisma/client";

import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import { prisma } from "@/lib/prisma";
import {
  isGooglePlacesConfigured,
  searchGooglePlacesForBusiness,
  type GooglePlaceCandidate,
  type GooglePlaceBusinessInput,
} from "@/lib/google/places";

export type GoogleBusinessDiscoveryBusiness = {
  id: string;
  name: string;
  initialInput: string;
  websiteUrl?: string | null;
  location?: string | null;
  description?: string | null;
  targetAudience?: string | null;
  mainOffer?: string | null;
  industry?: string | null;
  businessType?: string | null;
  primaryConversionGoal?: string | null;
};

export type GoogleBusinessDiscoverySummary = {
  apiConfigured: boolean;
  searched: boolean;
  query?: string;
  error?: string;
  candidatesSaved: number;
  bestConfidence: number | null;
  source: "places_api" | "website_detected" | "fallback" | "none";
  profileIds: string[];
  detectedAddress: string | null;
  detectedPhone: string | null;
  detectedGoogleMapsLinks: string[];
  detectedMapEmbeds: string[];
  detectedLocalBusinessSchemaCount: number;
};

type DiscoveryClues = {
  detectedAddress: string | null;
  detectedPhone: string | null;
  detectedGoogleMapsLinks: string[];
  detectedMapEmbeds: string[];
  detectedLocalBusinessSchema: unknown[];
};

export async function discoverGoogleBusinessProfiles({
  business,
  websiteAnalysis,
  websiteCrawl,
}: {
  business: GoogleBusinessDiscoveryBusiness;
  websiteAnalysis?: WebsiteAnalysis | null;
  websiteCrawl?: WebsiteCrawlResult | null;
}): Promise<GoogleBusinessDiscoverySummary> {
  const clues = collectGoogleBusinessClues({ websiteAnalysis, websiteCrawl });
  const apiConfigured = isGooglePlacesConfigured();
  const searchInput: GooglePlaceBusinessInput = {
    businessName: business.name,
    initialInput: business.initialInput,
    websiteUrl: business.websiteUrl ?? websiteAnalysis?.normalizedUrl ?? null,
    location: business.location,
    detectedAddress: clues.detectedAddress,
    detectedPhone: clues.detectedPhone,
    detectedGoogleMapsLinks: clues.detectedGoogleMapsLinks,
    detectedMapEmbeds: clues.detectedMapEmbeds,
    businessContext: {
      description: business.description,
      targetAudience: business.targetAudience,
      mainOffer: business.mainOffer,
      industry: business.industry,
      businessType: business.businessType,
      primaryConversionGoal: business.primaryConversionGoal,
    },
  };
  let searched = false;
  let query: string | undefined;
  let error: string | undefined;
  let source: GoogleBusinessDiscoverySummary["source"] = "none";
  const profileIds: string[] = [];
  let bestConfidence: number | null = null;

  if (apiConfigured) {
    const result = await searchGooglePlacesForBusiness(searchInput);
    searched = result.searched;
    query = result.query;
    error = result.error;

    const likelyCandidates = result.candidates
      .filter((candidate) => candidate.confidence >= 50)
      .slice(0, 3);

    bestConfidence = result.candidates.at(0)?.confidence ?? null;

    for (const candidate of likelyCandidates) {
      const saved = await saveGooglePlaceCandidate({
        businessId: business.id,
        candidate,
        query,
      });

      if (saved) {
        profileIds.push(saved.id);
      }
    }

    if (profileIds.length > 0) {
      source = "places_api";
    }
  }

  if (profileIds.length === 0 && hasFallbackGoogleClues(clues)) {
    const saved = await saveWebsiteDetectedCandidate({
      business,
      clues,
      apiConfigured,
      searchError: error,
    });

    if (saved) {
      profileIds.push(saved.id);
      bestConfidence = saved.matchConfidence;
      source = "website_detected";
    }
  }

  return {
    apiConfigured,
    searched,
    query,
    error,
    candidatesSaved: profileIds.length,
    bestConfidence,
    source,
    profileIds,
    detectedAddress: clues.detectedAddress,
    detectedPhone: clues.detectedPhone,
    detectedGoogleMapsLinks: clues.detectedGoogleMapsLinks,
    detectedMapEmbeds: clues.detectedMapEmbeds,
    detectedLocalBusinessSchemaCount: clues.detectedLocalBusinessSchema.length,
  };
}

export function collectGoogleBusinessClues({
  websiteAnalysis,
  websiteCrawl,
}: {
  websiteAnalysis?: WebsiteAnalysis | null;
  websiteCrawl?: WebsiteCrawlResult | null;
}): DiscoveryClues {
  const pageResults = websiteCrawl?.pageResults ?? [];
  const detectedGoogleMapsLinks = uniqueLimited(
    [
      ...(websiteAnalysis?.detectedGoogleMapsLinks ?? []),
      ...pageResults.flatMap((page) => page.detectedGoogleMapsLinks ?? []),
    ],
    12,
  );
  const detectedMapEmbeds = uniqueLimited(
    [
      ...(websiteAnalysis?.detectedMapEmbeds ?? []),
      ...pageResults.flatMap((page) => page.detectedMapEmbeds ?? []),
    ],
    8,
  );
  const detectedLocalBusinessSchema = [
    ...(websiteAnalysis?.detectedLocalBusinessSchema ?? []),
    ...pageResults.flatMap(
      (page) => page.detectedLocalBusinessSchema ?? [],
    ),
  ];

  return {
    detectedAddress:
      websiteAnalysis?.detectedAddress ??
      pageResults.find((page) => page.detectedAddress)?.detectedAddress ??
      null,
    detectedPhone:
      websiteAnalysis?.detectedPhone ??
      pageResults.find((page) => page.detectedPhone)?.detectedPhone ??
      null,
    detectedGoogleMapsLinks,
    detectedMapEmbeds,
    detectedLocalBusinessSchema: detectedLocalBusinessSchema.slice(0, 8),
  };
}

async function saveGooglePlaceCandidate({
  businessId,
  candidate,
  query,
}: {
  businessId: string;
  candidate: GooglePlaceCandidate & {
    confidence: number;
    reasons: string[];
  };
  query?: string;
}) {
  const existing = await prisma.googleBusinessProfile.findFirst({
    where: {
      businessId,
      googlePlaceId: candidate.googlePlaceId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (existing?.status === "removed") {
    return null;
  }

  const data = {
    displayName: candidate.displayName,
    formattedAddress: candidate.formattedAddress,
    phoneNumber: candidate.phoneNumber,
    websiteUri: candidate.websiteUri,
    googleMapsUri: candidate.googleMapsUri,
    rating: candidate.rating,
    reviewCount: candidate.reviewCount,
    businessStatus: candidate.businessStatus,
    primaryType: candidate.primaryType,
    types: candidate.types as Prisma.InputJsonValue,
    matchConfidence: candidate.confidence,
    matchReasons: {
      reasons: candidate.reasons,
      query,
    } as Prisma.InputJsonValue,
    source: "places_api",
    rawSnapshot: sanitizeJson(candidate.rawSnapshot),
    discoveredAt: new Date(),
  };

  if (existing) {
    return prisma.googleBusinessProfile.update({
      where: {
        id: existing.id,
      },
      data,
      select: {
        id: true,
        matchConfidence: true,
      },
    });
  }

  return prisma.googleBusinessProfile.create({
    data: {
      businessId,
      googlePlaceId: candidate.googlePlaceId,
      status: "pending",
      ...data,
    },
    select: {
      id: true,
      matchConfidence: true,
    },
  });
}

async function saveWebsiteDetectedCandidate({
  business,
  clues,
  apiConfigured,
  searchError,
}: {
  business: GoogleBusinessDiscoveryBusiness;
  clues: DiscoveryClues;
  apiConfigured: boolean;
  searchError?: string;
}) {
  const googleMapsUri =
    clues.detectedGoogleMapsLinks.at(0) ?? clues.detectedMapEmbeds.at(0) ?? null;
  const confidence = fallbackConfidence(clues);
  const reasons = [
    clues.detectedGoogleMapsLinks.length > 0
      ? "Google Maps link detected on the website."
      : null,
    clues.detectedMapEmbeds.length > 0
      ? "Google Maps embed detected on the website."
      : null,
    clues.detectedAddress ? "Address-like text detected on the website." : null,
    clues.detectedPhone ? "Phone number detected on the website." : null,
    clues.detectedLocalBusinessSchema.length > 0
      ? "LocalBusiness/Organization schema detected."
      : null,
    apiConfigured
      ? "Google Places lookup did not save a confident candidate."
      : "Google Places API is not configured, so the listing could not be verified.",
    searchError ? `Places lookup note: ${searchError}` : null,
  ].filter((reason): reason is string => Boolean(reason));
  const existing = await prisma.googleBusinessProfile.findFirst({
    where: {
      businessId: business.id,
      source: {
        in: ["website_detected", "fallback"],
      },
      status: {
        not: "removed",
      },
    },
    select: {
      id: true,
    },
  });
  const data = {
    displayName: business.name,
    formattedAddress: clues.detectedAddress,
    phoneNumber: clues.detectedPhone,
    googleMapsUri,
    matchConfidence: confidence,
    matchReasons: {
      reasons,
    } as Prisma.InputJsonValue,
    source: "website_detected",
    rawSnapshot: {
      detectedGoogleMapsLinks: clues.detectedGoogleMapsLinks.slice(0, 6),
      detectedMapEmbeds: clues.detectedMapEmbeds.slice(0, 4),
      detectedLocalBusinessSchema: clues.detectedLocalBusinessSchema.slice(0, 4),
    } as Prisma.InputJsonValue,
    discoveredAt: new Date(),
  };

  if (existing) {
    return prisma.googleBusinessProfile.update({
      where: {
        id: existing.id,
      },
      data,
      select: {
        id: true,
        matchConfidence: true,
      },
    });
  }

  return prisma.googleBusinessProfile.create({
    data: {
      businessId: business.id,
      status: "pending",
      ...data,
    },
    select: {
      id: true,
      matchConfidence: true,
    },
  });
}

function hasFallbackGoogleClues(clues: DiscoveryClues) {
  return (
    clues.detectedGoogleMapsLinks.length > 0 ||
    clues.detectedMapEmbeds.length > 0 ||
    clues.detectedLocalBusinessSchema.length > 0 ||
    Boolean(clues.detectedAddress && clues.detectedPhone)
  );
}

function fallbackConfidence(clues: DiscoveryClues) {
  let confidence = 35;

  if (clues.detectedGoogleMapsLinks.length > 0) confidence += 15;
  if (clues.detectedMapEmbeds.length > 0) confidence += 18;
  if (clues.detectedLocalBusinessSchema.length > 0) confidence += 8;
  if (clues.detectedAddress) confidence += 7;
  if (clues.detectedPhone) confidence += 7;

  return Math.min(72, confidence);
}

function uniqueLimited(values: string[], limit: number) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function sanitizeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

import "server-only";

import {
  BusinessProfileStatus,
  CompetitorSnapshotStatus,
  CompetitorStatus,
  ProfilePlatform,
  type Prisma,
} from "@prisma/client";

import { analyzeSeo } from "@/lib/analyzers/seo-analyzer";
import { crawlWebsite } from "@/lib/analyzers/website-crawler";
import {
  analyzeWebsite,
  normalizeWebsiteUrl,
  type WebsiteAnalysis,
} from "@/lib/analyzers/website-analyzer";
import {
  canAnalyzeCompetitor,
  getCompetitorAnalysisUsage,
} from "@/lib/billing/entitlements";
import { buildCompetitorPositioning } from "@/lib/competitors/competitor-positioning";
import type {
  CompetitorReviewSnapshot,
  CompetitorSocialProfileEvidence,
  CompetitorSocialSnapshot,
} from "@/lib/competitors/competitor-types";
import { collectGoogleBusinessClues } from "@/lib/google/google-business-discovery";
import {
  isGooglePlacesConfigured,
  searchGooglePlacesForBusiness,
} from "@/lib/google/places";
import {
  assertPublicHttpUrl,
  publicHttpErrorMessage,
} from "@/lib/network/public-http";
import { logError } from "@/lib/observability/log";
import { prisma } from "@/lib/prisma";

export const competitorSnapshotFreshnessMs = 7 * 24 * 60 * 60 * 1000;
const activeSnapshotWindowMs = 15 * 60 * 1000;

export type CompetitorAnalysisResult = {
  competitorId: string;
  competitorName: string;
  snapshotId: string | null;
  status:
    | "completed"
    | "partial"
    | "failed"
    | "running"
    | "cached"
    | "locked"
    | "not_analyzable";
  completedSections: string[];
  failedSections: string[];
  scannedAt: string | null;
  stale: boolean;
  reused: boolean;
  error?: string;
};

export async function runCompetitorAnalysis({
  userId,
  businessId,
  competitorId,
  auditId,
  crawlPageLimit,
  crawlTimeBudgetMs = 2 * 60 * 1_000,
  forceRefresh = false,
  source = "manual",
}: {
  userId: string;
  businessId: string;
  competitorId: string;
  auditId?: string | null;
  crawlPageLimit?: number;
  crawlTimeBudgetMs?: number;
  forceRefresh?: boolean;
  source?: "manual" | "manual_refresh" | "audit";
}): Promise<CompetitorAnalysisResult> {
  const competitor = await prisma.competitor.findFirst({
    where: {
      id: competitorId,
      businessId,
      status: CompetitorStatus.ACTIVE,
      business: {
        ownerId: userId,
      },
    },
    include: {
      business: {
        select: {
          industry: true,
          businessType: true,
        },
      },
      discoveredProfiles: {
        orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
      },
    },
  });

  if (!competitor) {
    return failedResult(competitorId, "Competitor was not found or is archived.");
  }

  if (!competitor.websiteUrl) {
    return {
      ...failedResult(competitor.id, "Add a public website before running competitor analysis."),
      competitorName: competitor.name,
      status: "not_analyzable",
    };
  }

  let normalizedWebsiteUrl: string;

  try {
    normalizedWebsiteUrl = normalizeWebsiteUrl(competitor.websiteUrl);
    await assertPublicHttpUrl(normalizedWebsiteUrl);
  } catch (error) {
    return {
      ...failedResult(
        competitor.id,
        publicHttpErrorMessage(
          error,
          "The competitor website URL is invalid.",
        ),
      ),
      competitorName: competitor.name,
      status: "not_analyzable",
    };
  }

  const freshSince = new Date(Date.now() - competitorSnapshotFreshnessMs);
  const freshSnapshot = await prisma.competitorSnapshot.findFirst({
    where: {
      competitorId: competitor.id,
      websiteUrl: normalizedWebsiteUrl,
      status: CompetitorSnapshotStatus.COMPLETED,
      scannedAt: {
        gte: freshSince,
      },
    },
    orderBy: {
      scannedAt: "desc",
    },
  });

  if (freshSnapshot && !forceRefresh) {
    if (auditId && !freshSnapshot.auditId) {
      const auditExists = await prisma.audit.count({
        where: {
          id: auditId,
          businessId,
        },
      });

      if (auditExists) {
        await prisma.competitorSnapshot.updateMany({
          where: {
            id: freshSnapshot.id,
            auditId: null,
          },
          data: { auditId },
        });
      }
    }

    return snapshotResult(competitor.name, freshSnapshot, {
      status: "cached",
      reused: true,
      stale: false,
    });
  }

  const activeSnapshot = await prisma.competitorSnapshot.findFirst({
    where: {
      competitorId: competitor.id,
      websiteUrl: normalizedWebsiteUrl,
      status: {
        in: [
          CompetitorSnapshotStatus.PENDING,
          CompetitorSnapshotStatus.RUNNING,
        ],
      },
      createdAt: {
        gte: new Date(Date.now() - activeSnapshotWindowMs),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (activeSnapshot) {
    return snapshotResult(competitor.name, activeSnapshot, {
      status: "running",
      reused: true,
      stale: false,
    });
  }

  const entitlement = await canAnalyzeCompetitor(
    userId,
    businessId,
    competitor.id,
  );

  if (!entitlement.allowed) {
    return {
      competitorId: competitor.id,
      competitorName: competitor.name,
      snapshotId: freshSnapshot?.id ?? null,
      status: "locked",
      completedSections: jsonStringArray(freshSnapshot?.completedSections),
      failedSections: [],
      scannedAt: freshSnapshot?.scannedAt?.toISOString() ?? null,
      stale: Boolean(freshSnapshot),
      reused: Boolean(freshSnapshot),
      error: entitlement.reason ?? "Competitor analysis is unavailable on this plan.",
    };
  }

  if (auditId) {
    const auditExists = await prisma.audit.count({
      where: {
        id: auditId,
        businessId,
      },
    });

    if (!auditExists) {
      auditId = null;
    }
  }

  const maxPages = Math.max(
    1,
    Math.min(crawlPageLimit ?? entitlement.crawlPages, entitlement.crawlPages),
  );
  const claim = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ lockResult: string }>>`
      SELECT pg_advisory_xact_lock(
        hashtext(${`competitor-scan:${competitor.id}`})
      )::text AS "lockResult"
    `;
    const activeSince = new Date(Date.now() - activeSnapshotWindowMs);
    const concurrentSnapshot = await tx.competitorSnapshot.findFirst({
      where: {
        competitorId: competitor.id,
        websiteUrl: normalizedWebsiteUrl,
        status: {
          in: [
            CompetitorSnapshotStatus.PENDING,
            CompetitorSnapshotStatus.RUNNING,
          ],
        },
        createdAt: { gte: activeSince },
      },
      orderBy: { createdAt: "desc" },
    });

    if (concurrentSnapshot) {
      return { snapshot: concurrentSnapshot, claimed: false as const };
    }

    await tx.competitorSnapshot.updateMany({
      where: {
        competitorId: competitor.id,
        status: {
          in: [
            CompetitorSnapshotStatus.PENDING,
            CompetitorSnapshotStatus.RUNNING,
          ],
        },
        createdAt: { lt: activeSince },
      },
      data: {
        status: CompetitorSnapshotStatus.FAILED,
        errorMessage: "A previous analysis claim expired before completion.",
      },
    });
    const pendingSnapshot = await tx.competitorSnapshot.create({
      data: {
        competitorId: competitor.id,
        auditId: auditId ?? null,
        status: CompetitorSnapshotStatus.PENDING,
        websiteUrl: normalizedWebsiteUrl,
        source,
      },
    });
    const runningSnapshot = await tx.competitorSnapshot.update({
      where: { id: pendingSnapshot.id },
      data: { status: CompetitorSnapshotStatus.RUNNING },
    });

    return { snapshot: runningSnapshot, claimed: true as const };
  });

  if (!claim.claimed) {
    return snapshotResult(competitor.name, claim.snapshot, {
      status: "running",
      reused: true,
      stale: false,
    });
  }

  const snapshot = claim.snapshot;

  const completedSections: string[] = [];
  const failedSections: string[] = [];

  try {
    const businessContext = {
      description: competitor.notes,
      industry: competitor.business.industry,
      businessType: competitor.business.businessType,
    };
    const website = await analyzeWebsite(normalizedWebsiteUrl, {
      businessContext,
    });
    const websiteUsable = isWebsiteAnalysisUsable(website);

    if (websiteUsable) completedSections.push("website");
    else failedSections.push("website");

    const [crawlSettled, seoSettled] = await Promise.allSettled([
      crawlWebsite(website.normalizedUrl, {
        maxPages,
        timeBudgetMs: Math.max(
          15_000,
          Math.min(crawlTimeBudgetMs, 2 * 60 * 1_000),
        ),
        businessContext,
      }),
      analyzeSeo(website.normalizedUrl, website),
    ]);
    const crawl =
      crawlSettled.status === "fulfilled" ? crawlSettled.value : null;
    const seo = seoSettled.status === "fulfilled" ? seoSettled.value : null;

    if (crawl && crawl.successfulPages > 0) completedSections.push("crawl");
    else failedSections.push("crawl");
    if (seo && websiteUsable) completedSections.push("seo");
    else failedSections.push("seo");

    const social = await buildCompetitorSocialSnapshot({
      competitorId: competitor.id,
      profiles: competitor.discoveredProfiles,
      website,
    });
    completedSections.push("social");

    const reviewsSettled = await Promise.allSettled([
      buildCompetitorReviewSnapshot({
        competitorId: competitor.id,
        competitorName: competitor.name,
        websiteUrl: normalizedWebsiteUrl,
        profiles: competitor.discoveredProfiles,
        website,
        crawl,
      }),
    ]);
    const reviews =
      reviewsSettled[0].status === "fulfilled"
        ? reviewsSettled[0].value
        : failedReviewSnapshot("Google Places lookup failed.");

    if (reviewsSettled[0].status === "fulfilled") completedSections.push("reviews");
    else failedSections.push("reviews");

    const positioning =
      crawl && websiteUsable
        ? buildCompetitorPositioning({
            competitorName: competitor.name,
            website,
            crawl,
            social,
            reviews,
          })
        : null;

    if (positioning) completedSections.push("positioning");
    else failedSections.push("positioning");

    const status =
      failedSections.length === 0
        ? CompetitorSnapshotStatus.COMPLETED
        : completedSections.length > 0
          ? CompetitorSnapshotStatus.PARTIAL
          : CompetitorSnapshotStatus.FAILED;
    const scannedAt = new Date();
    const updated = await prisma.competitorSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status,
        websiteScore: websiteUsable ? website.score : null,
        seoScore: seo && websiteUsable ? seo.score : null,
        socialCoverageScore: social.score,
        reviewsScore: reviews.score,
        positioningScore: positioning?.score ?? null,
        websiteSnapshot: toJsonValue({ homepage: website, crawl }),
        seoSnapshot: seo ? toJsonValue(seo) : undefined,
        socialSnapshot: toJsonValue(social),
        reviewsSnapshot: toJsonValue(reviews),
        positioningSnapshot: positioning
          ? toJsonValue(positioning)
          : undefined,
        analysisSummary: toJsonValue({
          headline: website.h1Text.at(0) ?? website.pageTitle,
          primaryActions: website.actionSummary.primaryActions,
          pagesScanned: crawl?.pagesScanned ?? 0,
          publicPlatforms: [
            ...new Set([
              ...social.confirmedPlatforms,
              ...social.detectedPlatforms,
            ]),
          ],
          googleListingStatus: reviews.status,
          note:
            status === CompetitorSnapshotStatus.COMPLETED
              ? "Public competitor analysis completed."
              : "Public competitor analysis completed with limited data.",
        }),
        completedSections: toJsonValue(completedSections),
        failedSections: toJsonValue(failedSections),
        errorMessage:
          status === CompetitorSnapshotStatus.FAILED
            ? "No public analyzer section completed successfully."
            : null,
        scannedAt,
      },
    });

    return snapshotResult(competitor.name, updated, {
      status:
        status === CompetitorSnapshotStatus.COMPLETED
          ? "completed"
          : status === CompetitorSnapshotStatus.PARTIAL
            ? "partial"
            : "failed",
      reused: false,
      stale: false,
    });
  } catch (error) {
    const message = "Competitor analysis could not be completed.";
    logError("competitor_analysis_failed", error, {
      competitorId: competitor.id,
      businessId,
      snapshotId: snapshot.id,
    });
    await prisma.competitorSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: CompetitorSnapshotStatus.FAILED,
        errorMessage: message.slice(0, 1_000),
        completedSections: toJsonValue(completedSections),
        failedSections: toJsonValue(failedSections),
        scannedAt: new Date(),
      },
    });
    const fallback = await prisma.competitorSnapshot.findFirst({
      where: {
        competitorId: competitor.id,
        id: { not: snapshot.id },
        status: {
          in: [
            CompetitorSnapshotStatus.COMPLETED,
            CompetitorSnapshotStatus.PARTIAL,
          ],
        },
      },
      orderBy: { scannedAt: "desc" },
    });

    if (fallback) {
      return {
        ...snapshotResult(competitor.name, fallback, {
          status:
            fallback.status === CompetitorSnapshotStatus.COMPLETED
              ? "cached"
              : "partial",
          reused: true,
          stale: true,
        }),
        error: `The refresh failed, so the previous public snapshot is being used. ${message}`,
      };
    }

    return {
      ...failedResult(competitor.id, message),
      competitorName: competitor.name,
      snapshotId: snapshot.id,
    };
  }
}

export async function analyzeBusinessCompetitors({
  userId,
  businessId,
  auditId,
  forceRefresh = false,
  source = "audit",
  maximumFreshScans = Number.POSITIVE_INFINITY,
  crawlTimeBudgetMs,
}: {
  userId: string;
  businessId: string;
  auditId?: string | null;
  forceRefresh?: boolean;
  source?: "manual" | "manual_refresh" | "audit";
  maximumFreshScans?: number;
  crawlTimeBudgetMs?: number;
}) {
  const [competitors, usage] = await Promise.all([
    prisma.competitor.findMany({
      where: {
        businessId,
        status: CompetitorStatus.ACTIVE,
        business: { ownerId: userId },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        websiteUrl: true,
        snapshots: {
          where: {
            status: {
              in: [
                CompetitorSnapshotStatus.COMPLETED,
                CompetitorSnapshotStatus.PARTIAL,
              ],
            },
          },
          orderBy: { scannedAt: "desc" },
          take: 1,
          select: {
            status: true,
            scannedAt: true,
            websiteUrl: true,
          },
        },
      },
    }),
    getCompetitorAnalysisUsage(userId, businessId),
  ]);
  const freshCutoff = Date.now() - competitorSnapshotFreshnessMs;
  const cached = forceRefresh ? [] : competitors.filter((competitor) => {
    const snapshot = competitor.snapshots.at(0);
    return (
      snapshot?.status === CompetitorSnapshotStatus.COMPLETED &&
      normalizeComparableUrl(snapshot.websiteUrl) ===
        normalizeComparableUrl(competitor.websiteUrl) &&
      Boolean(snapshot.scannedAt && snapshot.scannedAt.getTime() >= freshCutoff)
    );
  });
  const staleOrNew = competitors.filter(
    (competitor) => !cached.some((item) => item.id === competitor.id),
  );
  let remainingNewSlots = Math.max(
    0,
    usage.analyzedCompetitors.limit - usage.analyzedCompetitors.used,
  );
  const slotEligible = staleOrNew.filter((competitor) => {
    if (competitor.snapshots.length > 0) return true;
    if (remainingNewSlots <= 0) return false;
    remainingNewSlots -= 1;
    return true;
  });
  const scansAvailable = Math.max(0, usage.scans.limit - usage.scans.used);
  const runtimeScanLimit = Number.isFinite(maximumFreshScans)
    ? Math.max(0, Math.floor(maximumFreshScans))
    : slotEligible.length;
  const freshScanLimit = Math.max(
    0,
    Math.min(scansAvailable, runtimeScanLimit),
  );
  const scanTargets = slotEligible.slice(0, freshScanLimit);
  const targets = [...cached, ...scanTargets];
  const results = await runWithConcurrency(
    targets,
    2,
    ({ id }) =>
      runCompetitorAnalysis({
        userId,
        businessId,
        competitorId: id,
        auditId,
        forceRefresh,
        source,
        crawlTimeBudgetMs,
      }),
  );
  const selectedIds = new Set(targets.map((competitor) => competitor.id));
  const deferredForRuntime = new Set(
    slotEligible.slice(runtimeScanLimit).map((competitor) => competitor.id),
  );
  const lockedResults: CompetitorAnalysisResult[] = competitors
    .filter((competitor) => !selectedIds.has(competitor.id))
    .map((competitor) => ({
      competitorId: competitor.id,
      competitorName: competitor.name,
      snapshotId: null,
      status: "locked",
      completedSections: [],
      failedSections: [],
      scannedAt: null,
      stale: Boolean(competitor.snapshots.length),
      reused: false,
      error: deferredForRuntime.has(competitor.id)
        ? "This competitor was deferred to keep the audit within its execution window. Refresh it individually, then run another audit."
        : slotEligible.some((eligible) => eligible.id === competitor.id)
          ? "The competitor scan allowance has been reached for this plan period."
          : "The analyzed competitor limit has been reached for this plan.",
    }));

  return [...results, ...lockedResults];
}

async function buildCompetitorSocialSnapshot({
  competitorId,
  profiles,
  website,
}: {
  competitorId: string;
  profiles: Array<{
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
    urlOrHandle: string | null;
  }>;
  website: WebsiteAnalysis;
}): Promise<CompetitorSocialSnapshot> {
  const savedSocial = profiles.filter(
    (profile) =>
      isSocialPlatform(profile.platform) &&
      profile.status !== BusinessProfileStatus.REMOVED,
  );
  const detected = website.detectedSocialLinks
    .map((url) => ({ url, platform: platformForUrl(url) }))
    .filter(
      (profile): profile is { url: string; platform: ProfilePlatform } =>
        Boolean(profile.platform),
    );

  for (const profile of detected) {
    const exists = profiles.some(
      (saved) =>
        saved.platform === profile.platform &&
        normalizeComparableUrl(saved.urlOrHandle) === normalizeComparableUrl(profile.url),
    );

    if (!exists) {
      await prisma.competitorProfile.create({
        data: {
          competitorId,
          platform: profile.platform,
          label: platformLabel(profile.platform),
          urlOrHandle: profile.url,
          confidenceScore: 82,
          status: BusinessProfileStatus.PENDING,
        },
      });
    }
  }

  const profileEvidence: CompetitorSocialProfileEvidence[] = [
    ...savedSocial.map((profile) => ({
      platform: platformLabel(profile.platform),
      url: profile.urlOrHandle,
      status:
        profile.status === BusinessProfileStatus.CONFIRMED
          ? ("confirmed" as const)
          : ("pending" as const),
      source: "saved_profile" as const,
    })),
    ...detected
      .filter(
        (profile) =>
          !profiles.some(
            (saved) =>
              normalizeComparableUrl(saved.urlOrHandle) ===
              normalizeComparableUrl(profile.url),
          ),
      )
      .map((profile) => ({
        platform: platformLabel(profile.platform),
        url: profile.url,
        status: "detected" as const,
        source: "website_detected" as const,
      })),
  ];
  const confirmedPlatforms = unique(
    profileEvidence
      .filter((profile) => profile.status === "confirmed")
      .map((profile) => profile.platform),
  );
  const pendingPlatforms = unique(
    profileEvidence
      .filter((profile) => profile.status === "pending")
      .map((profile) => profile.platform),
  );
  const detectedPlatforms = unique(
    profileEvidence
      .filter((profile) => profile.status === "detected")
      .map((profile) => profile.platform),
  );
  const potentialPlatforms = unique([
    ...pendingPlatforms,
    ...detectedPlatforms,
  ]).filter((platform) => !confirmedPlatforms.includes(platform));
  const platformCount = unique([
    ...confirmedPlatforms,
    ...pendingPlatforms,
    ...detectedPlatforms,
  ]).length;
  const confirmedCoverageScore =
    confirmedPlatforms.length === 0
      ? 15
      : confirmedPlatforms.length === 1
        ? 45
        : confirmedPlatforms.length === 2
          ? 62
          : confirmedPlatforms.length === 3
            ? 76
            : 88;
  const score = Math.min(92, confirmedCoverageScore + potentialPlatforms.length * 2);
  const confirmedProfileCount = profileEvidence.filter(
    (profile) => profile.status === "confirmed",
  ).length;
  const pendingProfileCount = profileEvidence.filter(
    (profile) => profile.status === "pending",
  ).length;
  const detectedProfileCount = profileEvidence.filter(
    (profile) => profile.status === "detected",
  ).length;

  return {
    score,
    confirmedPlatforms,
    pendingPlatforms,
    detectedPlatforms,
    profiles: profileEvidence,
    coverageLevel:
      confirmedPlatforms.length === 0
        ? "none"
        : confirmedPlatforms.length === 1
          ? "low"
          : confirmedPlatforms.length <= 3
            ? "moderate"
            : "strong",
    platformCount,
    confirmedProfileCount,
    pendingProfileCount,
    detectedProfileCount,
    observations: [
      confirmedProfileCount > 0
        ? `${confirmedProfileCount} public social profile${confirmedProfileCount === 1 ? " is" : "s are"} confirmed across ${confirmedPlatforms.length} platform${confirmedPlatforms.length === 1 ? "" : "s"}.`
        : "No public social profiles are confirmed.",
      pendingProfileCount + detectedProfileCount > 0
        ? `${pendingProfileCount + detectedProfileCount} additional public link${pendingProfileCount + detectedProfileCount === 1 ? " is" : "s are"} pending confirmation or detected from the website.`
        : "No additional public social links are awaiting confirmation.",
    ],
    limitations: [
      "Social comparison uses confirmed profiles and public links detected on the competitor website.",
      "Individual posts, engagement, reach, audience demographics, posting frequency, and content performance were not analyzed.",
    ],
  };
}

async function buildCompetitorReviewSnapshot({
  competitorId,
  competitorName,
  websiteUrl,
  profiles,
  website,
  crawl,
}: {
  competitorId: string;
  competitorName: string;
  websiteUrl: string;
  profiles: Array<{
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
    urlOrHandle: string | null;
  }>;
  website: WebsiteAnalysis;
  crawl: Awaited<ReturnType<typeof crawlWebsite>> | null;
}): Promise<CompetitorReviewSnapshot> {
  const clues = collectGoogleBusinessClues({ websiteAnalysis: website, websiteCrawl: crawl });
  const applicability =
    crawl?.businessTypeUsed === "restaurant" ||
    crawl?.businessTypeUsed === "local_service"
      ? "important"
      : crawl?.businessTypeUsed === "general" &&
          (clues.detectedAddress || clues.detectedPhone)
        ? "useful"
        : "optional";
  const configured = isGooglePlacesConfigured();
  const confirmedProfile = profiles.find(
    (profile) =>
      profile.platform === ProfilePlatform.GOOGLE_BUSINESS &&
      profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const search = await searchGooglePlacesForBusiness({
    businessName: competitorName,
    websiteUrl,
    detectedAddress: clues.detectedAddress,
    detectedPhone: clues.detectedPhone,
    detectedGoogleMapsLinks: clues.detectedGoogleMapsLinks,
    detectedMapEmbeds: clues.detectedMapEmbeds,
    businessContext: {
      businessType: crawl?.businessTypeUsed,
    },
  });
  const candidate = search.candidates.at(0) ?? null;
  const matchedCandidate = candidate && candidate.confidence >= 50 ? candidate : null;

  if (matchedCandidate?.googleMapsUri) {
    const existing = await prisma.competitorProfile.findFirst({
      where: {
        competitorId,
        platform: ProfilePlatform.GOOGLE_BUSINESS,
        urlOrHandle: matchedCandidate.googleMapsUri,
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.competitorProfile.create({
        data: {
          competitorId,
          platform: ProfilePlatform.GOOGLE_BUSINESS,
          label: "Google Business",
          urlOrHandle: matchedCandidate.googleMapsUri,
          confidenceScore: matchedCandidate.confidence,
          status: BusinessProfileStatus.PENDING,
        },
      });
    }
  }

  const status = confirmedProfile
    ? "manually_confirmed"
    : !configured
      ? "not_configured"
      : matchedCandidate?.confidence && matchedCandidate.confidence >= 70
        ? "likely_match"
        : matchedCandidate
          ? "possible_match"
          : search.error
            ? "error"
            : "not_found";
  const score = matchedCandidate
    ? Math.min(
        100,
        Math.round(
          36 +
            ((matchedCandidate.rating ?? 0) / 5) * 30 +
            Math.min(28, Math.log10((matchedCandidate.reviewCount ?? 0) + 1) * 10) +
            (matchedCandidate.businessStatus === "OPERATIONAL" ? 6 : 0),
        ),
      )
    : applicability === "optional"
      ? null
      : applicability === "important"
        ? 25
        : 35;

  return {
    status,
    applicability,
    score,
    listingName: matchedCandidate?.displayName ?? null,
    googlePlaceId: matchedCandidate?.googlePlaceId ?? null,
    googleMapsUri: matchedCandidate?.googleMapsUri ?? confirmedProfile?.urlOrHandle ?? null,
    rating: matchedCandidate?.rating ?? null,
    reviewCount: matchedCandidate?.reviewCount ?? null,
    formattedAddress: matchedCandidate?.formattedAddress ?? clues.detectedAddress,
    phoneNumber: matchedCandidate?.phoneNumber ?? clues.detectedPhone,
    businessStatus: matchedCandidate?.businessStatus ?? null,
    primaryType: matchedCandidate?.primaryType ?? null,
    matchConfidence: matchedCandidate?.confidence ?? null,
    matchReasons: matchedCandidate?.reasons ?? [],
    source: matchedCandidate
      ? "places_api"
      : confirmedProfile
        ? "saved_profile"
        : clues.detectedGoogleMapsLinks.length > 0
          ? "website_detected"
          : "none",
    searched: search.searched,
    apiConfigured: search.configured,
    note:
      status === "manually_confirmed"
        ? "A saved Google Business profile is manually confirmed. Public rating details are shown only when Places returned a sufficiently strong match."
        : status === "likely_match"
          ? "Google Places returned a likely public match that still requires user confirmation."
          : status === "possible_match"
            ? "Google Places returned a possible match. Confirm it before relying on the listing."
            : status === "not_configured"
              ? "Google Places is not configured, so public rating and review-count data are unavailable."
              : applicability === "optional"
                ? "Google Business appears optional for this primarily online competitor and is not scored as a failure."
                : "No sufficiently confident Google listing match was found.",
  };
}

function failedReviewSnapshot(note: string): CompetitorReviewSnapshot {
  return {
    status: "error",
    applicability: "useful",
    score: null,
    listingName: null,
    googlePlaceId: null,
    googleMapsUri: null,
    rating: null,
    reviewCount: null,
    formattedAddress: null,
    phoneNumber: null,
    businessStatus: null,
    primaryType: null,
    matchConfidence: null,
    matchReasons: [],
    source: "none",
    searched: false,
    apiConfigured: isGooglePlacesConfigured(),
    note,
  };
}

function isWebsiteAnalysisUsable(website: WebsiteAnalysis) {
  return Boolean(
    website.pageTitle ||
      website.metaDescription ||
      website.h1Text.length > 0 ||
      website.internalLinksCount > 0,
  );
}

function isSocialPlatform(platform: ProfilePlatform) {
  const socialPlatforms: ProfilePlatform[] = [
    ProfilePlatform.INSTAGRAM,
    ProfilePlatform.FACEBOOK,
    ProfilePlatform.TIKTOK,
    ProfilePlatform.YOUTUBE,
    ProfilePlatform.LINKEDIN,
    ProfilePlatform.X,
    ProfilePlatform.PINTEREST,
  ];

  return socialPlatforms.includes(platform);
}

function platformForUrl(value: string): ProfilePlatform | null {
  const hostname = safeHostname(value);

  if (hostname.includes("instagram.com")) return ProfilePlatform.INSTAGRAM;
  if (hostname.includes("facebook.com")) return ProfilePlatform.FACEBOOK;
  if (hostname.includes("tiktok.com")) return ProfilePlatform.TIKTOK;
  if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return ProfilePlatform.YOUTUBE;
  if (hostname.includes("linkedin.com")) return ProfilePlatform.LINKEDIN;
  if (hostname === "x.com" || hostname.endsWith(".x.com") || hostname.includes("twitter.com")) return ProfilePlatform.X;
  if (hostname.includes("pinterest.com")) return ProfilePlatform.PINTEREST;
  return null;
}

function platformLabel(platform: ProfilePlatform) {
  return platform
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeComparableUrl(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\/$/, "");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function snapshotResult(
  competitorName: string,
  snapshot: {
    id: string;
    competitorId: string;
    status: CompetitorSnapshotStatus;
    completedSections: unknown;
    failedSections: unknown;
    scannedAt: Date | null;
  },
  options: {
    status: CompetitorAnalysisResult["status"];
    reused: boolean;
    stale: boolean;
  },
): CompetitorAnalysisResult {
  return {
    competitorId: snapshot.competitorId,
    competitorName,
    snapshotId: snapshot.id,
    status: options.status,
    completedSections: jsonStringArray(snapshot.completedSections),
    failedSections: jsonStringArray(snapshot.failedSections),
    scannedAt: snapshot.scannedAt?.toISOString() ?? null,
    stale: options.stale,
    reused: options.reused,
  };
}

function failedResult(
  competitorId: string,
  error: string,
): CompetitorAnalysisResult {
  return {
    competitorId,
    competitorName: "Competitor",
    snapshotId: null,
    status: "failed",
    completedSections: [],
    failedSections: [],
    scannedAt: null,
    stale: false,
    reused: false,
    error,
  };
}

async function runWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), values.length) },
      () => runWorker(),
    ),
  );

  return results;
}

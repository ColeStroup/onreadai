"use server";

import {
  BusinessProfileStatus,
  CompetitorStatus,
  RecommendationPriority,
  RecommendationStatus,
  ScoreCategory,
  type Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { canAddCompetitor } from "@/lib/billing/entitlements";
import {
  analyzeBusinessCompetitors,
  runCompetitorAnalysis,
} from "@/lib/competitors/competitor-analysis-runner";
import type { ComparisonCategory } from "@/lib/competitors/competitor-types";
import { buildCurrentCompetitorComparison } from "@/lib/competitors/current-comparison";
import { submittedCompetitorWebsiteProfile } from "@/lib/discovery/submitted-profile-discovery";
import { normalizeWebsiteUrl } from "@/lib/analyzers/website-analyzer";
import { assertPublicHttpUrl } from "@/lib/network/public-http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";

async function requireOwnedBusiness(businessId: string) {
  const user = await requireUser(
    `/dashboard/businesses/${businessId}/competitors`,
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
    notFound();
  }

  return {
    business,
    user,
  };
}

function formWebsiteUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return normalizeWebsiteUrl(trimmed);
  } catch {
    return trimmed;
  }
}

function competitorFormData(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const websiteUrl = formWebsiteUrl(String(formData.get("websiteUrl") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return {
    name,
    websiteUrl,
    notes,
  };
}

async function validateCompetitorWebsite(websiteUrl: string | null) {
  if (!websiteUrl) return;
  await assertPublicHttpUrl(websiteUrl);
}

function revalidateCompetitorPaths(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}`);
  revalidatePath(`/dashboard/businesses/${businessId}/competitors`);
  revalidatePath(`/dashboard/businesses/${businessId}/overview`);
  revalidatePath(`/dashboard/businesses/${businessId}/chat`);
  revalidatePath(`/dashboard/businesses/${businessId}/action-plan`);
}

export async function addCompetitor(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const { business, user } = await requireOwnedBusiness(businessId);
  const competitorCheck = await canAddCompetitor(user.id, business.id);

  if (!competitorCheck.allowed) {
    redirect(
      `/dashboard/businesses/${business.id}/competitors?error=competitor_limit`,
    );
  }

  const { name, websiteUrl, notes } = competitorFormData(formData);

  if (!name) {
    redirect(`/dashboard/businesses/${business.id}/competitors?error=name`);
  }

  try {
    await validateCompetitorWebsite(websiteUrl);
  } catch {
    redirect(`/dashboard/businesses/${business.id}/competitors?error=invalid_url`);
  }

  try {
    await prisma.competitor.create({
      data: {
        businessId: business.id,
        name,
        websiteUrl,
        notes,
        discoveredProfiles: websiteUrl
          ? {
              create: submittedCompetitorWebsiteProfile(websiteUrl),
            }
          : undefined,
      },
    });
  } catch {
    redirect(`/dashboard/businesses/${business.id}/competitors?error=duplicate`);
  }

  revalidateCompetitorPaths(business.id);
  redirect(`/dashboard/businesses/${business.id}/competitors?saved=added`);
}

export async function updateCompetitor(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const competitorId = String(formData.get("competitorId") ?? "");
  const { business } = await requireOwnedBusiness(businessId);
  const { name, websiteUrl, notes } = competitorFormData(formData);

  if (!name) {
    redirect(`/dashboard/businesses/${business.id}/competitors?error=name`);
  }

  try {
    await validateCompetitorWebsite(websiteUrl);
  } catch {
    redirect(`/dashboard/businesses/${business.id}/competitors?error=invalid_url`);
  }

  try {
    await prisma.competitor.updateMany({
      where: {
        id: competitorId,
        businessId: business.id,
      },
      data: {
        name,
        websiteUrl,
        notes,
        status: CompetitorStatus.ACTIVE,
      },
    });

    const profileCount = await prisma.competitorProfile.count({
      where: {
        competitorId,
        competitor: {
          businessId: business.id,
        },
      },
    });

    if (websiteUrl && profileCount === 0) {
      await prisma.competitorProfile.createMany({
        data: submittedCompetitorWebsiteProfile(websiteUrl).map((profile) => ({
          competitorId,
          platform: profile.platform,
          label: profile.label,
          urlOrHandle: profile.urlOrHandle,
          confidenceScore: profile.confidenceScore,
          status: profile.status,
        })),
      });
    }
  } catch {
    redirect(`/dashboard/businesses/${business.id}/competitors?error=duplicate`);
  }

  revalidateCompetitorPaths(business.id);
  redirect(`/dashboard/businesses/${business.id}/competitors?saved=updated`);
}

export async function archiveCompetitor(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const competitorId = String(formData.get("competitorId") ?? "");
  const { business } = await requireOwnedBusiness(businessId);

  await prisma.competitor.updateMany({
    where: {
      id: competitorId,
      businessId: business.id,
    },
    data: {
      status: CompetitorStatus.ARCHIVED,
    },
  });

  revalidateCompetitorPaths(business.id);
  redirect(`/dashboard/businesses/${business.id}/competitors?saved=archived`);
}

export async function analyzeCompetitor(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const competitorId = String(formData.get("competitorId") ?? "");
  const { business, user } = await requireOwnedBusiness(businessId);
  await enforceCompetitorAnalysisLimit(user.id, business.id);
  const result = await runCompetitorAnalysis({
    userId: user.id,
    businessId: business.id,
    competitorId,
    source: "manual",
  });

  revalidateCompetitorPaths(business.id);
  redirect(
    `/dashboard/businesses/${business.id}/competitors?analysis=${result.status}`,
  );
}

export async function refreshCompetitor(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const competitorId = String(formData.get("competitorId") ?? "");
  const { business, user } = await requireOwnedBusiness(businessId);
  await enforceCompetitorAnalysisLimit(user.id, business.id);
  const result = await runCompetitorAnalysis({
    userId: user.id,
    businessId: business.id,
    competitorId,
    forceRefresh: true,
    source: "manual_refresh",
  });

  revalidateCompetitorPaths(business.id);
  redirect(
    `/dashboard/businesses/${business.id}/competitors?analysis=${result.status}`,
  );
}

export async function refreshAllCompetitors(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const { business, user } = await requireOwnedBusiness(businessId);
  await enforceCompetitorAnalysisLimit(user.id, business.id);
  const results = await analyzeBusinessCompetitors({
    userId: user.id,
    businessId: business.id,
    forceRefresh: true,
    source: "manual_refresh",
  });
  const status = results.some((result) => result.status === "completed")
    ? "completed"
    : results.some((result) => result.status === "partial")
      ? "partial"
      : results.some((result) => result.status === "locked")
        ? "locked"
        : "failed";

  revalidateCompetitorPaths(business.id);
  redirect(`/dashboard/businesses/${business.id}/competitors?analysis=${status}`);
}

export async function setCompetitorGoogleProfileStatus(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const profileId = String(formData.get("profileId") ?? "");
  const requestedStatus = String(formData.get("status") ?? "");
  const { business } = await requireOwnedBusiness(businessId);
  const status =
    requestedStatus === "confirmed"
      ? BusinessProfileStatus.CONFIRMED
      : BusinessProfileStatus.REMOVED;

  await prisma.competitorProfile.updateMany({
    where: {
      id: profileId,
      platform: "GOOGLE_BUSINESS",
      competitor: {
        businessId: business.id,
      },
    },
    data: { status },
  });

  revalidateCompetitorPaths(business.id);
  redirect(
    `/dashboard/businesses/${business.id}/competitors?saved=google_${requestedStatus}`,
  );
}

export async function addComparisonOpportunity(formData: FormData) {
  const businessId = String(formData.get("businessId") ?? "");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  const { business, user } = await requireOwnedBusiness(businessId);
  const current = await buildCurrentCompetitorComparison({
    businessId: business.id,
    ownerId: user.id,
  });
  const opportunity = current?.comparison?.opportunities.find(
    (item) => item.id === opportunityId,
  );

  if (!current?.latestAudit || !opportunity) {
    redirect(
      `/dashboard/businesses/${business.id}/competitors?error=opportunity_missing`,
    );
  }
  const sourceSnapshot = current.comparison?.freshness.find(
    (item) => item.competitorId === opportunity.competitorId,
  );

  const existing = await prisma.recommendation.findFirst({
    where: {
      businessId: business.id,
      sourceType: "competitor_comparison",
      sourceReferenceId: opportunity.id,
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.recommendation.create({
      data: {
        businessId: business.id,
        auditId: current.latestAudit.id,
        title: opportunity.title,
        description: opportunity.description,
        category: comparisonCategory(opportunity.category),
        priority:
          opportunity.confidence === "high"
            ? RecommendationPriority.HIGH
            : RecommendationPriority.MEDIUM,
        status: RecommendationStatus.TODO,
        estimatedEffort: "Medium",
        expectedImpact: "High",
        effort: "Medium",
        impact: "High",
        sourceType: "competitor_comparison",
        sourceReferenceId: opportunity.id,
        sourceUrl: `/dashboard/businesses/${business.id}/competitors#opportunities`,
        evidence: JSON.parse(
          JSON.stringify([
            ...opportunity.evidence,
            {
              label: "Comparison provenance",
              competitorName: opportunity.competitorName,
              category: opportunity.category,
              observation: opportunity.description,
              snapshotId: sourceSnapshot?.snapshotId ?? null,
              observedAt: sourceSnapshot?.scannedAt ?? null,
            },
          ]),
        ) as Prisma.InputJsonValue,
      },
    });
  }

  revalidateCompetitorPaths(business.id);
  redirect(`/dashboard/businesses/${business.id}/competitors?saved=action_added`);
}

function comparisonCategory(category: ComparisonCategory) {
  switch (category) {
    case "website":
      return ScoreCategory.WEBSITE;
    case "seo":
      return ScoreCategory.SEO;
    case "reviews":
      return ScoreCategory.REVIEWS;
    case "social":
      return ScoreCategory.SOCIAL;
    case "positioning":
      return ScoreCategory.BRANDING;
  }
}

async function enforceCompetitorAnalysisLimit(userId: string, businessId: string) {
  try {
    await enforceRateLimit({
      scope: "competitor-analysis",
      identifiers: [userId, businessId, await currentRequestRateLimitIdentifier()],
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect(`/dashboard/businesses/${businessId}/competitors?error=rate_limited`);
    }
    throw error;
  }
}

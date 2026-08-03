"use server";

import { AuditStatus, CompetitorStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import {
  normalizeReviewAnalysisForDisplay,
  type ReviewAnalysis,
} from "@/lib/analyzers/review-analyzer";
import type { SocialAnalysis } from "@/lib/analyzers/social-analyzer";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import { generateSocialStrategy } from "@/lib/ai/social-strategy-generator";
import {
  canRegenerateSocialStrategy,
  canUseSocialStrategy,
} from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import { isSocialGrowthEnabled } from "@/lib/features/feature-flags";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";
import { requireUser } from "@/lib/session";

function clean(value: FormDataEntryValue | null, limit = 120) {
  return String(value ?? "")
    .trim()
    .slice(0, limit);
}

export async function generateSocialStrategyAction(formData: FormData) {
  const businessId = clean(formData.get("businessId"));
  const user = await requireUser(`/dashboard/businesses/${businessId}/social`);
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    include: {
      profiles: {
        orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
      },
      competitors: {
        where: {
          status: CompetitorStatus.ACTIVE,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          name: true,
          websiteUrl: true,
          discoveredProfiles: {
            select: {
              platform: true,
              label: true,
              status: true,
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
        include: {
          recommendations: {
            orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
            select: {
              title: true,
              description: true,
              category: true,
              priority: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!business) {
    notFound();
  }

  if (!isSocialGrowthEnabled()) {
    throw new Error("Social Growth is not currently available.");
  }

  const existingStrategyCount = await prisma.socialStrategy.count({
    where: {
      businessId: business.id,
    },
  });
  const strategyCheck =
    existingStrategyCount > 0
      ? await canRegenerateSocialStrategy(user.id)
      : await canUseSocialStrategy(user.id);

  if (!strategyCheck.allowed) {
    redirect(
      `/dashboard/businesses/${business.id}/social?error=${
        existingStrategyCount > 0 ? "strategy_regen_locked" : "strategy_locked"
      }`,
    );
  }

  try {
    await enforceRateLimit({
      scope: "social-strategy-generation",
      identifiers: [
        user.id,
        business.id,
        await currentRequestRateLimitIdentifier(),
      ],
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      redirect(
        `/dashboard/businesses/${business.id}/social?error=strategy_rate_limited`,
      );
    }
    throw error;
  }

  const latestAudit = business.audits.at(0);
  const strategy = await generateSocialStrategy({
    businessName: business.name,
    initialInput: business.initialInput,
    businessContext: {
      description: business.description,
      targetAudience: business.targetAudience,
      mainOffer: business.mainOffer,
      industry: business.industry,
      businessType: business.businessType,
      primaryConversionGoal: business.primaryConversionGoal,
      brandTone: business.brandTone,
      contextConfidence: business.contextConfidence,
      contextSource: business.contextSource,
      contextConfirmedAt: business.contextConfirmedAt,
    },
    goals: business.goals,
    primaryGoal: business.primaryGoal,
    profiles: business.profiles,
    competitors: business.competitors,
    socialAnalysis: latestAudit
      ? getSocialAnalysis(latestAudit.analysisSnapshot)
      : null,
    reviewAnalysis: latestAudit
      ? getReviewAnalysis(latestAudit.analysisSnapshot)
      : null,
    websiteAnalysis: latestAudit
      ? getWebsiteAnalysis(latestAudit.analysisSnapshot)
      : null,
    recommendations: latestAudit?.recommendations ?? [],
  });

  await prisma.socialStrategy.create({
    data: {
      businessId: business.id,
      platformRecommendations: strategy.recommendedPlatforms,
      contentPillars: strategy.contentPillars,
      weeklyPlan: strategy.weeklyPlan,
      suggestedPosts: strategy.suggestedPosts,
      conversionTips: strategy.conversionTips,
      competitorOpportunities: strategy.competitorOpportunities,
      confidence: strategy.confidence,
      source: strategy.source,
      reasoningSummary: strategy.reasoningSummary,
    },
  });

  revalidatePath(`/dashboard/businesses/${business.id}`);
  revalidatePath(`/dashboard/businesses/${business.id}/social`);
  revalidatePath(`/dashboard/businesses/${business.id}/overview`);
  revalidatePath(`/dashboard/businesses/${business.id}/chat`);

  redirect(`/dashboard/businesses/${business.id}/social?strategy=generated`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getSocialAnalysis(snapshot: unknown): SocialAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.social)) {
    return null;
  }

  const social = snapshot.social;

  if (
    typeof social.score !== "number" ||
    !Array.isArray(social.confirmedPlatforms)
  ) {
    return null;
  }

  return social as SocialAnalysis;
}

function getReviewAnalysis(snapshot: unknown): ReviewAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.reviews)) {
    return null;
  }

  const reviews = snapshot.reviews;

  if (
    typeof reviews.score !== "number" ||
    !Array.isArray(reviews.confirmedReviewPlatforms)
  ) {
    return null;
  }

  return normalizeReviewAnalysisForDisplay(reviews as ReviewAnalysis);
}

function getWebsiteAnalysis(snapshot: unknown): WebsiteAnalysis | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.website)) {
    return null;
  }

  const website = snapshot.website;

  if (
    typeof website.normalizedUrl !== "string" ||
    typeof website.score !== "number"
  ) {
    return null;
  }

  return website as WebsiteAnalysis;
}

import "server-only";

import {
  AuditStatus,
  CompetitorStatus,
} from "@prisma/client";

import { analyzeReviews } from "@/lib/analyzers/review-analyzer";
import { analyzeSocialProfiles } from "@/lib/analyzers/social-analyzer";
import { compareBusinessToCompetitors } from "@/lib/competitors/competitor-comparison";
import { getAuditCompetitorIntelligence } from "@/lib/competitors/competitor-types";
import type { ConsultantDiagnostics } from "@/lib/observability/consultant-diagnostics";
import { prisma } from "@/lib/prisma";

export async function buildCurrentCompetitorComparison({
  businessId,
  ownerId,
  auditId,
  diagnostics,
}: {
  businessId: string;
  ownerId: string;
  auditId?: string;
  diagnostics?: ConsultantDiagnostics;
}) {
  diagnostics?.started("COMPETITOR_LOOKUP");
  let business;

  try {
    business = await prisma.business.findFirst({
      where: {
        id: businessId,
        ownerId,
      },
      select: {
      id: true,
      name: true,
      description: true,
      targetAudience: true,
      mainOffer: true,
      industry: true,
      businessType: true,
      primaryConversionGoal: true,
      goals: true,
      primaryGoal: true,
      updatedAt: true,
      contextUpdatedAt: true,
      profiles: {
        select: {
          platform: true,
          status: true,
          displayName: true,
          url: true,
          handle: true,
          updatedAt: true,
        },
      },
      googleBusinessProfiles: {
        where: {
          status: { not: "removed" },
        },
        orderBy: [{ status: "asc" }, { matchConfidence: "desc" }],
      },
      competitors: {
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          discoveredProfiles: {
            orderBy: [{ status: "asc" }, { confidenceScore: "desc" }],
          },
          snapshots: {
            orderBy: { createdAt: "desc" },
            take: 8,
          },
        },
      },
      audits: {
        where: {
          status: AuditStatus.COMPLETED,
          ...(auditId ? { id: auditId } : {}),
        },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          completedAt: true,
          createdAt: true,
          analysisSnapshot: true,
          scores: {
            select: {
              category: true,
              platform: true,
              score: true,
            },
          },
        },
      },
      },
    });
  } catch (error) {
    diagnostics?.failed("COMPETITOR_LOOKUP", error);
    throw error;
  }

  if (!business) {
    diagnostics?.completed("COMPETITOR_LOOKUP", {
      businessFound: false,
      activeCompetitors: 0,
      archivedCompetitors: 0,
    });
    return null;
  }

  const activeCompetitors = business.competitors.filter(
    (competitor) => competitor.status === CompetitorStatus.ACTIVE,
  );
  diagnostics?.completed("COMPETITOR_LOOKUP", {
    businessFound: true,
    activeCompetitors: activeCompetitors.length,
    archivedCompetitors:
      business.competitors.length - activeCompetitors.length,
  });
  diagnostics?.started("COMPETITOR_PROFILE_LOOKUP");
  diagnostics?.completed("COMPETITOR_PROFILE_LOOKUP", {
    totalProfiles: activeCompetitors.reduce(
      (total, competitor) => total + competitor.discoveredProfiles.length,
      0,
    ),
    confirmedProfiles: activeCompetitors.reduce(
      (total, competitor) =>
        total +
        competitor.discoveredProfiles.filter(
          (profile) => profile.status === "CONFIRMED",
        ).length,
      0,
    ),
    pendingProfiles: activeCompetitors.reduce(
      (total, competitor) =>
        total +
        competitor.discoveredProfiles.filter(
          (profile) => profile.status === "PENDING",
        ).length,
      0,
    ),
    removedProfiles: activeCompetitors.reduce(
      (total, competitor) =>
        total +
        competitor.discoveredProfiles.filter(
          (profile) => profile.status === "REMOVED",
        ).length,
      0,
    ),
  });
  const businessProfiles = business.profiles.map((profile) => ({
    platform: profile.platform,
    status: profile.status,
    label: profile.displayName,
    urlOrHandle: profile.url ?? profile.handle,
  }));
  const competitorProfiles = activeCompetitors.map((competitor) => ({
    competitorName: competitor.name,
    profiles: competitor.discoveredProfiles.map((profile) => ({
      platform: profile.platform,
      status: profile.status,
      label: profile.label,
      urlOrHandle: profile.urlOrHandle,
    })),
  }));
  const currentSocial = analyzeSocialProfiles({
    businessProfiles,
    competitors: competitorProfiles,
    goals: business.goals,
    primaryGoal: business.primaryGoal,
  });
  const currentReviews = analyzeReviews({
    businessProfiles,
    googleBusinessProfiles: business.googleBusinessProfiles,
    competitors: competitorProfiles,
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
  const latestAudit = business.audits.at(0) ?? null;
  const comparison = latestAudit
    ? compareBusinessToCompetitors({
        business: {
          name: business.name,
          description: business.description,
          targetAudience: business.targetAudience,
          mainOffer: business.mainOffer,
          primaryConversionGoal: business.primaryConversionGoal,
        },
        primaryAudit: latestAudit,
        currentReviews,
        currentSocial,
        confirmedProfiles: business.profiles.map((profile) => ({
          platform: profile.platform,
          status: profile.status,
        })),
        competitors: activeCompetitors.map((competitor) => ({
          id: competitor.id,
          name: competitor.name,
          websiteUrl: competitor.websiteUrl,
          profiles: competitor.discoveredProfiles.map((profile) => ({
            platform: profile.platform,
            status: profile.status,
            urlOrHandle: profile.urlOrHandle,
          })),
          snapshots: competitor.snapshots,
        })),
      })
    : null;

  return {
    business,
    activeCompetitors,
    archivedCompetitors: business.competitors.filter(
      (competitor) => competitor.status === CompetitorStatus.ARCHIVED,
    ),
    latestAudit,
    savedIntelligence: getAuditCompetitorIntelligence(
      latestAudit?.analysisSnapshot ?? null,
    ),
    currentSocial,
    currentReviews,
    comparison,
  };
}

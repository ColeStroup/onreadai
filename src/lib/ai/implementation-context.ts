import "server-only";

import {
  AuditStatus,
  BusinessProfileStatus,
  CompetitorStatus,
  ScoreCategory,
} from "@prisma/client";

import { buildCompetitorConsultantContext } from "@/lib/ai/competitor-consultant-context";
import { businessGoalLabels } from "@/lib/goals";
import { prisma } from "@/lib/prisma";
import { parseSocialStrategy } from "@/lib/social-strategy";

export const implementationTaskTypes = [
  "homepage_headline",
  "meta_description",
  "cta_improvement",
  "customer_proof",
  "review_request",
  "profile_bio",
  "social_cta",
  "link_in_bio",
  "pinned_post",
  "social_post",
  "weekly_content_plan",
  "generic_steps",
] as const;

export type ImplementationTaskType = (typeof implementationTaskTypes)[number];

export type ImplementationSourceInput =
  | {
      kind: "recommendation";
      recommendationId: string;
    }
  | {
      kind: "social";
      strategyId: string;
      itemKind: "post" | "weekly";
      itemIndex: number;
    };

export type ImplementationContext = {
  businessId: string;
  businessName: string;
  sourceKey: string;
  type: ImplementationTaskType;
  title: string;
  auditId: string | null;
  recommendationId: string | null;
  recommendation: {
    title: string;
    description: string;
    category: ScoreCategory;
    priority: string;
    impact: string | null;
    effort: string | null;
  };
  businessContext: {
    description: string | null;
    targetAudience: string | null;
    mainOffer: string | null;
    industry: string | null;
    businessType: string | null;
    location: string | null;
    conversionGoal: string | null;
    brandTone: string | null;
    confirmed: boolean;
  };
  goals: {
    primary: string | null;
    selected: string[];
  };
  evidence: Array<{
    title: string;
    description: string;
    sourceUrl: string | null;
  }>;
  website: {
    url: string | null;
    pageTitle: string | null;
    metaDescription: string | null;
    h1Text: string[];
    ctaCandidates: string[];
    pagesScanned: number | null;
    pagesMissingMetaDescription: number | null;
    pagesWithH1Issues: number | null;
  };
  googleBusiness: {
    status: "missing" | "pending" | "confirmed";
    rating: number | null;
    reviewCount: number | null;
    listingName: string | null;
  };
  social: {
    confirmedPlatforms: string[];
    pendingPlatforms: string[];
    currentItem: Record<string, string> | null;
    strategySummary: string | null;
  };
  competitors: string[];
  competitorEvidence: {
    competitorName: string;
    category: string;
    observation: string;
    snapshotDate: string | null;
    evidence: Array<{
      label: string;
      businessValue: string;
      competitorValue: string;
      sourceUrls: string[];
    }>;
  } | null;
  freshnessNote: string | null;
  auditCreatedAt: string | null;
};

export async function buildImplementationContext({
  userId,
  businessId,
  source,
}: {
  userId: string;
  businessId: string;
  source: ImplementationSourceInput;
}): Promise<ImplementationContext | null> {
  const business = await prisma.business.findFirst({
    where: { id: businessId, ownerId: userId },
    include: {
      profiles: {
        orderBy: { updatedAt: "desc" },
      },
      googleBusinessProfiles: {
        where: { status: { not: "removed" } },
        orderBy: [{ status: "asc" }, { matchConfidence: "desc" }],
      },
      competitors: {
        where: { status: CompetitorStatus.ACTIVE },
        orderBy: { name: "asc" },
        select: { name: true },
      },
      audits: {
        where: { status: AuditStatus.COMPLETED },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          findings: { orderBy: { createdAt: "asc" } },
        },
      },
      socialStrategies: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!business) return null;

  const latestAudit = business.audits.at(0) ?? null;
  let recommendationId: string | null = null;
  let auditId = latestAudit?.id ?? null;
  let auditCreatedAt = latestAudit?.createdAt ?? null;
  let recommendation: ImplementationContext["recommendation"];
  let type: ImplementationTaskType;
  let sourceKey: string;
  let currentSocialItem: Record<string, string> | null = null;
  let sourceFindings: ImplementationContext["evidence"] = [];
  let competitorReferenceId: string | null = null;

  if (source.kind === "recommendation") {
    const record = await prisma.recommendation.findFirst({
      where: {
        id: source.recommendationId,
        businessId: business.id,
      },
      include: {
        audit: {
          select: {
            id: true,
            businessId: true,
            createdAt: true,
            findings: {
              orderBy: { createdAt: "asc" },
              select: {
                category: true,
                title: true,
                description: true,
                sourceUrl: true,
              },
            },
          },
        },
      },
    });

    if (!record || (record.audit && record.audit.businessId !== business.id)) {
      return null;
    }

    recommendationId = record.id;
    auditId = record.audit?.id ?? auditId;
    auditCreatedAt = record.audit?.createdAt ?? auditCreatedAt;
    type = classifyImplementationTask(record);
    sourceKey = `recommendation:${record.id}`;
    recommendation = {
      title: record.title,
      description: record.description,
      category: record.category,
      priority: record.priority,
      impact: record.expectedImpact ?? record.impact,
      effort: record.estimatedEffort ?? record.effort,
    };
    sourceFindings = [
      ...recommendationEvidence(record.evidence, record.sourceUrl),
      ...(record.audit?.findings
        .filter((finding) => finding.category === record.category)
        .slice(0, 3)
        .map((finding) => ({
          title: finding.title,
          description: finding.description,
          sourceUrl: finding.sourceUrl,
        })) ?? []),
    ].slice(0, 3);
    competitorReferenceId =
      record.sourceType === "competitor_comparison"
        ? record.sourceReferenceId
        : null;
  } else {
    const strategy = await prisma.socialStrategy.findFirst({
      where: {
        id: source.strategyId,
        businessId: business.id,
      },
    });
    const parsed = parseSocialStrategy(strategy);
    const item =
      source.itemKind === "post"
        ? parsed?.suggestedPosts.at(source.itemIndex)
        : parsed?.weeklyPlan.at(source.itemIndex);

    if (!strategy || !parsed || !item) return null;

    currentSocialItem = stringRecord(item);
    type = source.itemKind === "post" ? "social_post" : "weekly_content_plan";
    sourceKey = `social:${strategy.id}:${source.itemKind}:${source.itemIndex}`;
    recommendation = {
      title:
        source.itemKind === "post"
          ? `Refine ${currentSocialItem.platform || "social"} post`
          : `Refine ${currentSocialItem.day || "weekly"} content plan`,
      description:
        currentSocialItem.postConcept ||
        currentSocialItem.idea ||
        "Turn this saved Social Strategy item into ready-to-use content.",
      category: ScoreCategory.SOCIAL,
      priority: "MEDIUM",
      impact: "Medium",
      effort: "Low",
    };
  }

  const snapshot = asRecord(latestAudit?.analysisSnapshot);
  const website = asRecord(snapshot.website);
  const crawl = asRecord(snapshot.websiteCrawl);
  const socialSnapshot = asRecord(snapshot.social);
  const primaryGoogle =
    business.googleBusinessProfiles.find(
      (profile) => profile.status.toLowerCase() === "confirmed",
    ) ?? business.googleBusinessProfiles.at(0);
  const confirmedSocial = business.profiles
    .filter(
      (profile) =>
        profile.status === BusinessProfileStatus.CONFIRMED &&
        !["WEBSITE", "GOOGLE_BUSINESS"].includes(profile.platform),
    )
    .map((profile) => profile.platform.replaceAll("_", " "));
  const pendingSocial = business.profiles
    .filter(
      (profile) =>
        profile.status === BusinessProfileStatus.PENDING &&
        !["WEBSITE", "GOOGLE_BUSINESS"].includes(profile.platform),
    )
    .map((profile) => profile.platform.replaceAll("_", " "));
  const latestStrategy = parseSocialStrategy(business.socialStrategies.at(0));
  const sourceAuditIsOld = Boolean(
    auditCreatedAt &&
      (business.contextUpdatedAt && business.contextUpdatedAt > auditCreatedAt ||
        business.profiles.some((profile) => profile.updatedAt > auditCreatedAt) ||
        business.googleBusinessProfiles.some(
          (profile) => profile.updatedAt > auditCreatedAt,
        ) ||
        business.socialStrategies.some(
          (strategy) => strategy.updatedAt > auditCreatedAt,
        )),
  );
  const relatedFindings = sourceFindings.length
    ? sourceFindings
    : latestAudit?.findings
        .filter((finding) => finding.category === recommendation.category)
        .slice(0, 3)
        .map((finding) => ({
          title: finding.title,
          description: finding.description,
          sourceUrl: finding.sourceUrl,
        })) ?? [];
  const currentCompetitorContext = competitorReferenceId
    ? await buildCompetitorConsultantContext({
        userId,
        businessId: business.id,
      })
    : null;
  const currentCompetitorOpportunity =
    currentCompetitorContext?.currentComparison?.opportunities.find(
      (item) => item.id === competitorReferenceId,
    ) ?? null;
  const currentCompetitorSnapshot = currentCompetitorOpportunity
    ? currentCompetitorContext?.latestSnapshots.find(
        (snapshot) =>
          snapshot.competitorId === currentCompetitorOpportunity.competitorId,
      )
    : null;

  return {
    businessId: business.id,
    businessName: business.name,
    sourceKey,
    type,
    title: recommendation.title,
    auditId,
    recommendationId,
    recommendation,
    businessContext: {
      description: business.description,
      targetAudience: business.targetAudience,
      mainOffer: business.mainOffer,
      industry: business.industry,
      businessType: business.businessType,
      location: business.location,
      conversionGoal: business.primaryConversionGoal,
      brandTone: business.brandTone,
      confirmed: Boolean(business.contextConfirmedAt),
    },
    goals: {
      primary: business.primaryGoal
        ? businessGoalLabels[business.primaryGoal]
        : null,
      selected: business.goals.map((goal) => businessGoalLabels[goal]),
    },
    evidence: relatedFindings,
    website: {
      url: stringValue(website.normalizedUrl) ?? business.websiteUrl,
      pageTitle: stringValue(website.pageTitle),
      metaDescription: stringValue(website.metaDescription),
      h1Text: stringArray(website.h1Text).slice(0, 3),
      ctaCandidates: stringArray(website.ctaCandidates).slice(0, 6),
      pagesScanned: numberValue(crawl.pagesScanned),
      pagesMissingMetaDescription: numberValue(crawl.pagesMissingMetaDescription),
      pagesWithH1Issues:
        numberValue(crawl.pagesWithNoH1) !== null ||
        numberValue(crawl.pagesWithMultipleH1) !== null
          ? (numberValue(crawl.pagesWithNoH1) ?? 0) +
            (numberValue(crawl.pagesWithMultipleH1) ?? 0)
          : null,
    },
    googleBusiness: {
      status: primaryGoogle
        ? primaryGoogle.status.toLowerCase() === "confirmed"
          ? "confirmed"
          : "pending"
        : "missing",
      rating: primaryGoogle?.rating ?? numberValue(asRecord(snapshot.reviews).googleRating),
      reviewCount:
        primaryGoogle?.reviewCount ??
        numberValue(asRecord(snapshot.reviews).googleReviewCount),
      listingName: primaryGoogle?.displayName ?? null,
    },
    social: {
      confirmedPlatforms:
        confirmedSocial.length > 0
          ? confirmedSocial
          : stringArray(socialSnapshot.confirmedPlatforms).slice(0, 8),
      pendingPlatforms:
        pendingSocial.length > 0
          ? pendingSocial
          : stringArray(socialSnapshot.pendingPlatforms).slice(0, 8),
      currentItem: currentSocialItem,
      strategySummary: latestStrategy?.reasoningSummary ?? null,
    },
    competitors: business.competitors.slice(0, 8).map((item) => item.name),
    competitorEvidence: currentCompetitorOpportunity
      ? {
          competitorName: currentCompetitorOpportunity.competitorName,
          category: currentCompetitorOpportunity.category,
          observation: currentCompetitorOpportunity.description,
          snapshotDate: currentCompetitorSnapshot?.scannedAt ?? null,
          evidence: currentCompetitorOpportunity.evidence,
        }
      : null,
    freshnessNote: sourceAuditIsOld
      ? "Live profile or Business Context data changed after the source audit. This draft uses the current data, but a re-audit may update the recommendation."
      : null,
    auditCreatedAt: auditCreatedAt?.toISOString() ?? null,
  };
}

function recommendationEvidence(value: unknown, sourceUrl: string | null) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .slice(0, 2)
    .map((item) => {
      const label = stringValue(item.label) ?? "Competitor comparison";
      const businessValue = stringValue(item.businessValue);
      const competitorValue = stringValue(item.competitorValue);

      return {
        title: label,
        description:
          businessValue && competitorValue
            ? `Your business: ${businessValue}. Competitor: ${competitorValue}.`
            : "Use the saved competitor comparison as implementation evidence.",
        sourceUrl,
      };
    });
}

export function classifyImplementationTask(input: {
  title: string;
  description: string;
  category: ScoreCategory;
}): ImplementationTaskType {
  const text = `${input.title} ${input.description}`.toLowerCase();

  if (/meta description|search description|meta tag/.test(text)) {
    return "meta_description";
  }
  if (/\bh1\b|home ?page headline|hero headline|clear headline/.test(text)) {
    return "homepage_headline";
  }
  if (/review request|ask for reviews|collect reviews|request process/.test(text)) {
    return "review_request";
  }
  if (/profile bio|bio draft|rewrite.*bio|social bio/.test(text)) {
    return "profile_bio";
  }
  if (/link.in.bio|profile link|booking link|storefront link/.test(text)) {
    return "link_in_bio";
  }
  if (/pinned post|pin.*post|profile highlight/.test(text)) {
    return "pinned_post";
  }
  if (
    input.category === ScoreCategory.SOCIAL &&
    /profile.*(?:cta|call.to.action)|social.*(?:cta|call.to.action)|direct message|\bdm\b/.test(
      text,
    )
  ) {
    return "social_cta";
  }
  if (/customer proof|social proof|trust section|testimonial|feature.*review/.test(text)) {
    return "customer_proof";
  }
  if (/call.to.action|\bcta\b|conversion action|contact path/.test(text)) {
    return "cta_improvement";
  }
  if (
    input.category === ScoreCategory.SOCIAL &&
    /week|schedule|calendar|content plan/.test(text)
  ) {
    return "weekly_content_plan";
  }
  if (
    input.category === ScoreCategory.SOCIAL &&
    /post|content|caption|instagram|facebook|tiktok|youtube/.test(text)
  ) {
    return "social_post";
  }

  return "generic_steps";
}

export function implementationButtonLabel(type: ImplementationTaskType) {
  if (type === "generic_steps") return "Show Implementation Steps";
  return "Generate Fix";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringRecord(value: object) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => typeof item === "string")
      .map(([key, item]) => [key, String(item).slice(0, 900)]),
  );
}

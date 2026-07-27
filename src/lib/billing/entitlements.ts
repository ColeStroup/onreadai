import "server-only";

import {
  ChatRole,
  CompetitorSnapshotStatus,
  CompetitorStatus,
  PlanType,
} from "@prisma/client";

import {
  entitlingSubscriptionStatuses,
  paidSubscriptionAccessStatuses,
  resolveEffectiveEntitlementFromRecords,
} from "@/lib/billing/effective-entitlement";
import {
  getPlanDefinition,
  getPlanEntitlements,
  planLabels,
  type PlanEntitlements,
} from "@/lib/billing/plans";
import {
  subscriptionHasBillingProblem,
  subscriptionHasPaidAccess,
} from "@/lib/billing/subscription-policy";
import { prisma } from "@/lib/prisma";

export type EntitlementCheck = {
  allowed: boolean;
  plan: PlanType;
  entitlements: PlanEntitlements;
  used?: number;
  limit?: number;
  requiredPlan?: PlanType;
  reason?: string;
};

export type UsageSummary = {
  plan: PlanType;
  businesses: {
    used: number;
    limit: number;
  };
  auditsThisMonth: {
    used: number;
    limit: number;
  };
  aiMessagesThisMonth: {
    used: number;
    limit: number;
  };
  implementationGenerations: {
    used: number;
    limit: number;
  };
  crawlPages: {
    limit: number;
  };
  competitors?: {
    used: number;
    limit: number;
  };
  competitorScans: {
    used: number;
    limit: number;
  };
  competitorAnalysis: {
    maxAnalyzedCompetitors: number;
    maxCrawlPages: number;
  };
};

export const featureRequiredPlans = {
  businesses: PlanType.PRO,
  pdf: PlanType.ONE_TIME_AUDIT,
  presentation: PlanType.ONE_TIME_AUDIT,
  fullSocialStrategy: PlanType.ONE_TIME_AUDIT,
  regenerateSocialStrategy: PlanType.STARTER,
  competitorLimit: PlanType.STARTER,
  competitorAnalysis: PlanType.ONE_TIME_AUDIT,
  aiMessages: PlanType.STARTER,
  actionPlan: PlanType.ONE_TIME_AUDIT,
  progressComparison: PlanType.ONE_TIME_AUDIT,
  implementationHelp: PlanType.ONE_TIME_AUDIT,
} as const;

export async function getEffectiveEntitlement(
  userId: string,
  now = new Date(),
) {
  const [subscriptions, complimentaryEntitlements] = await Promise.all([
    prisma.userSubscription.findMany({
      where: {
        userId,
        status: {
          in: [...entitlingSubscriptionStatuses],
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        plan: true,
        status: true,
        stripeSubscriptionId: true,
        currentPeriodEnd: true,
        updatedAt: true,
      },
    }),
    prisma.complimentaryEntitlement.findMany({
      where: {
        userId,
        revokedAt: null,
        startsAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: {
        startsAt: "desc",
      },
      select: {
        id: true,
        plan: true,
        source: true,
        startsAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
  ]);

  return resolveEffectiveEntitlementFromRecords({
    subscriptions,
    complimentaryEntitlements,
    now,
  });
}

export async function getUserPlan(userId: string): Promise<PlanType> {
  return (await getEffectiveEntitlement(userId)).effectivePlan;
}

export async function getUserSubscriptionSummary(userId: string) {
  const [
    effectiveEntitlement,
    latestSubscription,
    latestStripeSubscription,
    activeStripeSubscription,
  ] = await Promise.all([
    getEffectiveEntitlement(userId),
    prisma.userSubscription.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.userSubscription.findFirst({
      where: {
        userId,
        stripeSubscriptionId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.userSubscription.findFirst({
      where: {
        userId,
        plan: { not: PlanType.FREE },
        stripeSubscriptionId: { not: null },
        status: { in: [...paidSubscriptionAccessStatuses] },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const subscription =
    effectiveEntitlement.paidSubscription ?? latestSubscription;
  const plan = effectiveEntitlement.effectivePlan;

  return {
    plan,
    definition: getPlanDefinition(plan),
    subscription,
    latestSubscription,
    latestStripeSubscription,
    activeStripeSubscription,
    paidSubscription: effectiveEntitlement.paidSubscription,
    paidPlan: effectiveEntitlement.paidPlan,
    complimentaryPlan: effectiveEntitlement.complimentaryPlan,
    complimentaryEntitlement:
      effectiveEntitlement.complimentaryEntitlement,
    entitlementSource: effectiveEntitlement.source,
    hasPaidAccess: Boolean(
      effectiveEntitlement.paidSubscription &&
        effectiveEntitlement.paidPlan !== PlanType.FREE &&
        subscriptionHasPaidAccess(
          effectiveEntitlement.paidSubscription.status,
        ),
    ),
    hasBillingProblem: Boolean(
      latestStripeSubscription &&
        subscriptionHasBillingProblem(latestStripeSubscription.status),
    ),
    hasActiveStripeSubscription: Boolean(activeStripeSubscription),
    cancellationScheduled: Boolean(
      latestStripeSubscription?.cancelAtPeriodEnd,
    ),
  };
}

export function getPlanLimitLabel(limit: number) {
  return limit >= 9999 ? "Unlimited" : limit.toLocaleString();
}

export async function getUsageSummary(
  userId: string,
  businessId?: string,
): Promise<UsageSummary> {
  const plan = await getUserPlan(userId);
  const entitlements = getPlanEntitlements(plan);
  const periodStart = startOfMonth(new Date());
  const competitorPeriodStart =
    plan === PlanType.ONE_TIME_AUDIT ? new Date(0) : periodStart;
  const [
    businessCount,
    auditCount,
    aiMessageCount,
    implementationGenerationCount,
    competitorCount,
    competitorScanCount,
  ] =
    await Promise.all([
      prisma.business.count({
        where: {
          ownerId: userId,
        },
      }),
      prisma.audit.count({
        where: {
          createdAt: {
            gte: periodStart,
          },
          business: {
            ownerId: userId,
          },
        },
      }),
      prisma.chatMessage.count({
        where: {
          role: ChatRole.USER,
          createdAt: {
            gte: periodStart,
          },
          thread: {
            userId,
          },
        },
      }),
      prisma.implementationDraft.count({
        where: {
          userId,
          ...(businessId ? { businessId } : {}),
          ...(plan === PlanType.ONE_TIME_AUDIT
            ? {}
            : {
                createdAt: {
                  gte: periodStart,
                },
              }),
        },
      }),
      businessId
        ? prisma.competitor.count({
            where: {
              businessId,
              status: CompetitorStatus.ACTIVE,
              business: {
                ownerId: userId,
              },
            },
          })
        : Promise.resolve(0),
      prisma.competitorSnapshot.count({
        where: {
          createdAt: {
            gte: competitorPeriodStart,
          },
          status: {
            in: [
              CompetitorSnapshotStatus.PENDING,
              CompetitorSnapshotStatus.RUNNING,
              CompetitorSnapshotStatus.COMPLETED,
              CompetitorSnapshotStatus.PARTIAL,
            ],
          },
          competitor: {
            ...(businessId ? { businessId } : {}),
            business: {
              ownerId: userId,
            },
          },
        },
      }),
    ]);

  return {
    plan,
    businesses: {
      used: businessCount,
      limit: entitlements.maxBusinesses,
    },
    auditsThisMonth: {
      used: auditCount,
      limit: entitlements.maxAuditsPerMonth,
    },
    aiMessagesThisMonth: {
      used: aiMessageCount,
      limit: entitlements.maxAiMessagesPerMonth,
    },
    implementationGenerations: {
      used: implementationGenerationCount,
      limit: entitlements.maxImplementationGenerationsPerMonth,
    },
    crawlPages: {
      limit: entitlements.maxCrawlPages,
    },
    competitors: businessId
      ? {
          used: competitorCount,
          limit: entitlements.maxCompetitorsPerBusiness,
        }
      : undefined,
    competitorScans: {
      used: competitorScanCount,
      limit: entitlements.maxCompetitorScansPerMonth,
    },
    competitorAnalysis: {
      maxAnalyzedCompetitors: entitlements.maxAnalyzedCompetitors,
      maxCrawlPages: entitlements.maxCompetitorCrawlPages,
    },
  };
}

export async function canCreateBusiness(userId: string) {
  const usage = await getUsageSummary(userId);
  const plan = usage.plan;
  const entitlements = getPlanEntitlements(plan);
  const allowed = usage.businesses.used < entitlements.maxBusinesses;

  return check({
    allowed,
    plan,
    entitlements,
    used: usage.businesses.used,
    limit: entitlements.maxBusinesses,
    requiredPlan: featureRequiredPlans.businesses,
    reason: allowed
      ? undefined
      : `${planLabels[plan]} allows ${entitlements.maxBusinesses} business workspace${
          entitlements.maxBusinesses === 1 ? "" : "s"
        }.`,
  });
}

export async function canRunAudit(userId: string, businessId?: string) {
  const usage = await getUsageSummary(userId, businessId);
  const plan = usage.plan;
  const entitlements = getPlanEntitlements(plan);
  const allowed = usage.auditsThisMonth.used < entitlements.maxAuditsPerMonth;

  return check({
    allowed,
    plan,
    entitlements,
    used: usage.auditsThisMonth.used,
    limit: entitlements.maxAuditsPerMonth,
    requiredPlan: PlanType.STARTER,
    reason: allowed
      ? undefined
      : `${planLabels[plan]} includes ${entitlements.maxAuditsPerMonth} audit run${
          entitlements.maxAuditsPerMonth === 1 ? "" : "s"
        } per month.`,
  });
}

export async function canUsePdfExport(userId: string) {
  return booleanEntitlement(userId, "canExportPdf", featureRequiredPlans.pdf);
}

export async function canUsePresentationMode(userId: string) {
  return booleanEntitlement(
    userId,
    "canUsePresentationMode",
    featureRequiredPlans.presentation,
  );
}

export async function canUseSocialStrategy(userId: string) {
  return booleanEntitlement(
    userId,
    "canUseFullSocialStrategy",
    featureRequiredPlans.fullSocialStrategy,
  );
}

export async function canRegenerateSocialStrategy(userId: string) {
  return booleanEntitlement(
    userId,
    "canRegenerateSocialStrategy",
    featureRequiredPlans.regenerateSocialStrategy,
  );
}

export async function canUseCompetitorTracking(userId: string) {
  return booleanEntitlement(
    userId,
    "canUseCompetitorTracking",
    featureRequiredPlans.competitorLimit,
  );
}

export async function canUseCompetitorAnalysis(userId: string) {
  return booleanEntitlement(
    userId,
    "canUseCompetitorAnalysis",
    featureRequiredPlans.competitorAnalysis,
  );
}

export async function getCompetitorAnalysisUsage(
  userId: string,
  businessId: string,
) {
  const usage = await getUsageSummary(userId, businessId);
  const analyzed = await prisma.competitorSnapshot.findMany({
    where: {
      status: {
        in: [
          CompetitorSnapshotStatus.COMPLETED,
          CompetitorSnapshotStatus.PARTIAL,
        ],
      },
      competitor: {
        businessId,
        status: CompetitorStatus.ACTIVE,
        business: {
          ownerId: userId,
        },
      },
    },
    distinct: ["competitorId"],
    select: {
      competitorId: true,
    },
  });

  return {
    plan: usage.plan,
    scans: usage.competitorScans,
    analyzedCompetitors: {
      used: analyzed.length,
      limit: usage.competitorAnalysis.maxAnalyzedCompetitors,
    },
    crawlPagesPerCompetitor: usage.competitorAnalysis.maxCrawlPages,
  };
}

export async function canAnalyzeCompetitor(
  userId: string,
  businessId: string,
  competitorId: string,
) {
  const [usage, existingSnapshot] = await Promise.all([
    getCompetitorAnalysisUsage(userId, businessId),
    prisma.competitorSnapshot.findFirst({
      where: {
        competitorId,
        status: {
          in: [
            CompetitorSnapshotStatus.COMPLETED,
            CompetitorSnapshotStatus.PARTIAL,
          ],
        },
        competitor: {
          businessId,
          business: {
            ownerId: userId,
          },
        },
      },
      select: {
        id: true,
      },
    }),
  ]);
  const entitlements = getPlanEntitlements(usage.plan);
  const scanAvailable = usage.scans.used < usage.scans.limit;
  const competitorSlotAvailable =
    Boolean(existingSnapshot) ||
    usage.analyzedCompetitors.used < usage.analyzedCompetitors.limit;
  const allowed =
    entitlements.canUseCompetitorAnalysis &&
    scanAvailable &&
    competitorSlotAvailable;
  const reason = !entitlements.canUseCompetitorAnalysis
    ? `${planLabels[featureRequiredPlans.competitorAnalysis]} or higher unlocks competitor analysis.`
    : !competitorSlotAvailable
      ? `${planLabels[usage.plan]} analyzes up to ${usage.analyzedCompetitors.limit} competitor${usage.analyzedCompetitors.limit === 1 ? "" : "s"}.`
      : !scanAvailable
        ? `${planLabels[usage.plan]} includes ${usage.scans.limit} competitor scan${usage.scans.limit === 1 ? "" : "s"}${usage.plan === PlanType.ONE_TIME_AUDIT ? " for this package" : " per month"}.`
        : undefined;

  return {
    ...check({
      allowed,
      plan: usage.plan,
      entitlements,
      used: usage.scans.used,
      limit: usage.scans.limit,
      requiredPlan: featureRequiredPlans.competitorAnalysis,
      reason,
    }),
    alreadyAnalyzed: Boolean(existingSnapshot),
    analyzedCompetitors: usage.analyzedCompetitors,
    crawlPages: usage.crawlPagesPerCompetitor,
  };
}

export async function canAddCompetitor(userId: string, businessId: string) {
  const usage = await getUsageSummary(userId, businessId);
  const plan = usage.plan;
  const entitlements = getPlanEntitlements(plan);
  const competitorUsage = usage.competitors ?? {
    used: 0,
    limit: entitlements.maxCompetitorsPerBusiness,
  };
  const allowed =
    entitlements.canUseCompetitorTracking &&
    competitorUsage.used < entitlements.maxCompetitorsPerBusiness;

  return check({
    allowed,
    plan,
    entitlements,
    used: competitorUsage.used,
    limit: entitlements.maxCompetitorsPerBusiness,
    requiredPlan: featureRequiredPlans.competitorLimit,
    reason: allowed
      ? undefined
      : `${planLabels[plan]} allows ${entitlements.maxCompetitorsPerBusiness} active competitor${
          entitlements.maxCompetitorsPerBusiness === 1 ? "" : "s"
        } per business.`,
  });
}

export async function canSendAiMessage(userId: string) {
  const usage = await getUsageSummary(userId);
  const plan = usage.plan;
  const entitlements = getPlanEntitlements(plan);
  const allowed =
    usage.aiMessagesThisMonth.used < entitlements.maxAiMessagesPerMonth;

  return check({
    allowed,
    plan,
    entitlements,
    used: usage.aiMessagesThisMonth.used,
    limit: entitlements.maxAiMessagesPerMonth,
    requiredPlan: featureRequiredPlans.aiMessages,
    reason: allowed
      ? undefined
      : `${planLabels[plan]} includes ${entitlements.maxAiMessagesPerMonth} AI message${
          entitlements.maxAiMessagesPerMonth === 1 ? "" : "s"
        } per month.`,
  });
}

export async function canAccessFullActionPlan(userId: string) {
  return booleanEntitlement(
    userId,
    "canAccessFullActionPlan",
    featureRequiredPlans.actionPlan,
  );
}

export async function getImplementationHelpUsage(
  userId: string,
  businessId?: string,
) {
  const usage = await getUsageSummary(userId, businessId);

  return {
    plan: usage.plan,
    ...usage.implementationGenerations,
  };
}

export async function canUseImplementationHelp(userId: string) {
  return booleanEntitlement(
    userId,
    "canUseImplementationHelp",
    featureRequiredPlans.implementationHelp,
  );
}

export async function canGenerateImplementationHelp(
  userId: string,
  businessId?: string,
) {
  const usage = await getUsageSummary(userId, businessId);
  const plan = usage.plan;
  const entitlements = getPlanEntitlements(plan);
  const generationUsage = usage.implementationGenerations;
  const allowed =
    entitlements.canUseImplementationHelp &&
    generationUsage.used < generationUsage.limit;

  return check({
    allowed,
    plan,
    entitlements,
    used: generationUsage.used,
    limit: generationUsage.limit,
    requiredPlan: featureRequiredPlans.implementationHelp,
    reason: allowed
      ? undefined
      : `${planLabels[plan]} includes ${generationUsage.limit} implementation generation${
          generationUsage.limit === 1 ? "" : "s"
        }${plan === PlanType.ONE_TIME_AUDIT ? " for this audit package" : " per month"}.`,
  });
}

export async function canUseProgressComparison(userId: string) {
  return booleanEntitlement(
    userId,
    "canUseProgressComparison",
    featureRequiredPlans.progressComparison,
  );
}

async function booleanEntitlement(
  userId: string,
  entitlement: keyof Pick<
    PlanEntitlements,
    | "canExportPdf"
    | "canUsePresentationMode"
    | "canUseFullSocialStrategy"
    | "canRegenerateSocialStrategy"
    | "canUseCompetitorTracking"
    | "canUseCompetitorAnalysis"
    | "canAccessFullActionPlan"
    | "canUseProgressComparison"
    | "canUseImplementationHelp"
  >,
  requiredPlan: PlanType,
) {
  const plan = await getUserPlan(userId);
  const entitlements = getPlanEntitlements(plan);
  const allowed = Boolean(entitlements[entitlement]);

  return check({
    allowed,
    plan,
    entitlements,
    requiredPlan,
    reason: allowed
      ? undefined
      : `${planLabels[requiredPlan]} or higher unlocks this feature.`,
  });
}

function check(input: EntitlementCheck): EntitlementCheck {
  return input;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

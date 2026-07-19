import { PlanType } from "@prisma/client";

export type PlanEntitlements = {
  maxBusinesses: number;
  maxCompetitorsPerBusiness: number;
  maxAuditsPerMonth: number;
  maxAiMessagesPerMonth: number;
  maxImplementationGenerationsPerMonth: number;
  maxCrawlPages: number;
  maxAnalyzedCompetitors: number;
  maxCompetitorScansPerMonth: number;
  maxCompetitorCrawlPages: number;
  canExportPdf: boolean;
  canUsePresentationMode: boolean;
  canUseFullSocialStrategy: boolean;
  canRegenerateSocialStrategy: boolean;
  canUseCompetitorTracking: boolean;
  canUseCompetitorAnalysis: boolean;
  canUseProgressComparison: boolean;
  canUseRecurringMonitoring: boolean;
  canAccessFullActionPlan: boolean;
  canUseImplementationHelp: boolean;
};

export type PlanDefinition = {
  plan: PlanType;
  name: string;
  shortName: string;
  price: string;
  cadence: string;
  badge?: string;
  description: string;
  audience: string;
  cta: string;
  comingSoon?: boolean;
  features: string[];
  limitations: string[];
  entitlements: PlanEntitlements;
};

export const planOrder: PlanType[] = [
  PlanType.FREE,
  PlanType.ONE_TIME_AUDIT,
  PlanType.STARTER,
  PlanType.PRO,
  PlanType.AGENCY,
];

export const planDefinitions: Record<PlanType, PlanDefinition> = {
  FREE: {
    plan: PlanType.FREE,
    name: "Free",
    shortName: "Free",
    price: "$0",
    cadence: "forever",
    description: "A lightweight preview for testing one business workspace.",
    audience: "Best for trying the product before buying a full report.",
    cta: "Start Free",
    features: [
      "1 business workspace",
      "Basic audit preview",
      "Website crawl up to 5 pages",
      "Limited AI consultant messages",
      "1 implementation draft per month",
      "Basic social strategy preview",
      "1 competitor",
      "1 limited competitor analysis preview",
    ],
    limitations: [
      "No PDF export",
      "No presentation mode",
      "Limited action plan and comparison views",
      "Limited monthly audits and AI messages",
    ],
    entitlements: {
      maxBusinesses: 1,
      maxCompetitorsPerBusiness: 1,
      maxAuditsPerMonth: 1,
      maxAiMessagesPerMonth: 10,
      maxImplementationGenerationsPerMonth: 1,
      maxCrawlPages: 5,
      maxAnalyzedCompetitors: 1,
      maxCompetitorScansPerMonth: 1,
      maxCompetitorCrawlPages: 5,
      canExportPdf: false,
      canUsePresentationMode: false,
      canUseFullSocialStrategy: false,
      canRegenerateSocialStrategy: false,
      canUseCompetitorTracking: true,
      canUseCompetitorAnalysis: true,
      canUseProgressComparison: false,
      canUseRecurringMonitoring: false,
      canAccessFullActionPlan: false,
      canUseImplementationHelp: true,
    },
  },
  ONE_TIME_AUDIT: {
    plan: PlanType.ONE_TIME_AUDIT,
    name: "Full Audit",
    shortName: "Full Audit",
    price: "$39",
    cadence: "one-time",
    badge: "Popular for reports",
    description: "A complete report package for one business audit.",
    audience: "Best for one-off client reports or a single business checkup.",
    cta: "Buy Full Audit",
    features: [
      "Full audit for one business",
      "Website crawl up to 25 pages",
      "PDF export",
      "Presentation Mode",
      "Full recommendations",
      "Full Social Strategy",
      "Limited AI follow-up messages",
      "10 implementation drafts",
      "Analyze up to 2 competitors (10 pages each)",
    ],
    limitations: [
      "No recurring monitoring",
      "Limited monthly audit runs",
      "Designed for one business",
    ],
    entitlements: {
      maxBusinesses: 1,
      maxCompetitorsPerBusiness: 3,
      maxAuditsPerMonth: 2,
      maxAiMessagesPerMonth: 30,
      maxImplementationGenerationsPerMonth: 10,
      maxCrawlPages: 25,
      maxAnalyzedCompetitors: 2,
      maxCompetitorScansPerMonth: 2,
      maxCompetitorCrawlPages: 10,
      canExportPdf: true,
      canUsePresentationMode: true,
      canUseFullSocialStrategy: true,
      canRegenerateSocialStrategy: false,
      canUseCompetitorTracking: true,
      canUseCompetitorAnalysis: true,
      canUseProgressComparison: true,
      canUseRecurringMonitoring: false,
      canAccessFullActionPlan: true,
      canUseImplementationHelp: true,
    },
  },
  STARTER: {
    plan: PlanType.STARTER,
    name: "Starter",
    shortName: "Starter",
    price: "$29",
    cadence: "per month",
    description: "A complete growth workspace for one business.",
    audience: "Best for owners, creators, freelancers, and local operators.",
    cta: "Choose Starter",
    features: [
      "1 business",
      "Full audits",
      "Website crawl up to 25 pages",
      "AI consultant",
      "Social Strategy",
      "PDF export",
      "Action Plan tracking",
      "25 implementation drafts per month",
      "Basic competitor tracking",
      "Analyze 3 competitors with 6 refreshes per month",
    ],
    limitations: [
      "Limited to one business",
      "Lower monthly AI and audit limits than Pro",
      "Recurring monitoring comes later",
    ],
    entitlements: {
      maxBusinesses: 1,
      maxCompetitorsPerBusiness: 5,
      maxAuditsPerMonth: 4,
      maxAiMessagesPerMonth: 100,
      maxImplementationGenerationsPerMonth: 25,
      maxCrawlPages: 25,
      maxAnalyzedCompetitors: 3,
      maxCompetitorScansPerMonth: 6,
      maxCompetitorCrawlPages: 15,
      canExportPdf: true,
      canUsePresentationMode: true,
      canUseFullSocialStrategy: true,
      canRegenerateSocialStrategy: true,
      canUseCompetitorTracking: true,
      canUseCompetitorAnalysis: true,
      canUseProgressComparison: true,
      canUseRecurringMonitoring: false,
      canAccessFullActionPlan: true,
      canUseImplementationHelp: true,
    },
  },
  PRO: {
    plan: PlanType.PRO,
    name: "Pro",
    shortName: "Pro",
    price: "$79",
    cadence: "per month",
    badge: "Best value",
    description: "Higher limits for multiple businesses and deeper follow-up.",
    audience: "Best for consultants, small agencies, and multi-brand operators.",
    cta: "Choose Pro",
    features: [
      "Up to 10 businesses",
      "Higher AI message limits",
      "More audit runs",
      "Website crawl up to 75 pages",
      "PDF export and Presentation Mode",
      "Competitor tracking",
      "Analyze 5 competitors with 25 refreshes per month",
      "Social Strategy regeneration",
      "Progress comparison",
      "100 implementation drafts per month",
    ],
    limitations: [
      "White-labeling comes later",
      "Agency-scale client management is not active yet",
    ],
    entitlements: {
      maxBusinesses: 10,
      maxCompetitorsPerBusiness: 12,
      maxAuditsPerMonth: 20,
      maxAiMessagesPerMonth: 500,
      maxImplementationGenerationsPerMonth: 100,
      maxCrawlPages: 75,
      maxAnalyzedCompetitors: 5,
      maxCompetitorScansPerMonth: 25,
      maxCompetitorCrawlPages: 25,
      canExportPdf: true,
      canUsePresentationMode: true,
      canUseFullSocialStrategy: true,
      canRegenerateSocialStrategy: true,
      canUseCompetitorTracking: true,
      canUseCompetitorAnalysis: true,
      canUseProgressComparison: true,
      canUseRecurringMonitoring: false,
      canAccessFullActionPlan: true,
      canUseImplementationHelp: true,
    },
  },
  AGENCY: {
    plan: PlanType.AGENCY,
    name: "Agency",
    shortName: "Agency",
    price: "Coming soon",
    cadence: "custom",
    badge: "Coming soon",
    description: "Client-ready reporting and higher limits for agencies.",
    audience: "Best for agencies managing many client reports.",
    cta: "Join Waitlist",
    comingSoon: true,
    features: [
      "Many businesses and clients",
      "Client-ready reports",
      "Higher AI and audit limits",
      "250 implementation drafts per month",
      "Website crawl up to 150 pages",
      "Analyze 10 competitors with 100 refreshes per month",
      "White-labeling later",
      "Team workflows later",
    ],
    limitations: ["Not available for live checkout yet."],
    entitlements: {
      maxBusinesses: 50,
      maxCompetitorsPerBusiness: 25,
      maxAuditsPerMonth: 100,
      maxAiMessagesPerMonth: 2000,
      maxImplementationGenerationsPerMonth: 250,
      maxCrawlPages: 150,
      maxAnalyzedCompetitors: 10,
      maxCompetitorScansPerMonth: 100,
      maxCompetitorCrawlPages: 50,
      canExportPdf: true,
      canUsePresentationMode: true,
      canUseFullSocialStrategy: true,
      canRegenerateSocialStrategy: true,
      canUseCompetitorTracking: true,
      canUseCompetitorAnalysis: true,
      canUseProgressComparison: true,
      canUseRecurringMonitoring: true,
      canAccessFullActionPlan: true,
      canUseImplementationHelp: true,
    },
  },
};

export const planLabels: Record<PlanType, string> = Object.fromEntries(
  Object.values(planDefinitions).map((definition) => [
    definition.plan,
    definition.name,
  ]),
) as Record<PlanType, string>;

export function getPlanDefinition(plan: PlanType) {
  return planDefinitions[plan];
}

export function getPlanEntitlements(plan: PlanType) {
  return planDefinitions[plan].entitlements;
}

export function planMeetsMinimum(plan: PlanType, minimumPlan: PlanType) {
  return planOrder.indexOf(plan) >= planOrder.indexOf(minimumPlan);
}

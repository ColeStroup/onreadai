import {
  BusinessGoal,
  BusinessProfileStatus,
  FindingSeverity,
  ProfilePlatform,
  RecommendationPriority,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";

import { analyzeReviews } from "@/lib/analyzers/review-analyzer";
import { analyzeSocialProfiles } from "@/lib/analyzers/social-analyzer";
import {
  classifyWebsiteActions,
  getPrimaryCtaAssessment,
} from "@/lib/analyzers/action-classifier";
import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import type {
  CrawledPageResult,
  WebsiteCrawlResult,
} from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import { generateDeterministicSocialStrategy } from "@/lib/ai/social-strategy-generator";
import { buildAuditAssessment } from "@/lib/audits/audit-applicability";
import type { AuditComparison } from "@/lib/audits/audit-comparison";
import { EVIDENCE_CONTRACT_VERSION } from "@/lib/audits/evidence-contracts";
import { buildNormalizedAuditFacts } from "@/lib/audits/normalized-audit-facts";
import type {
  AuditCompetitorIntelligence,
  CompetitorComparisonResult,
} from "@/lib/competitors/competitor-types";
import type { AuditReportViewModel } from "@/lib/reports/audit-report-view-model";
import { aggregateProfileCounts } from "@/lib/profiles/profile-counts";
import { selectReportCrawlPages } from "@/lib/reports/page-summary";
import {
  COMPETITOR_COMPARISON_VERSION,
  REPORT_VIEW_MODEL_VERSION,
  SCORING_ENGINE_VERSION,
  SOCIAL_STRATEGY_GENERATOR_VERSION,
} from "@/lib/reports/report-freshness";

export type ReportFixtureKind =
  | "hospitality"
  | "saas"
  | "local_service"
  | "social_only"
  | "cottage_regression"
  | "no_competitor"
  | "stale_strategy";

type FixtureConfig = {
  name: string;
  initialInput: string;
  archetype: AuditReportViewModel["business"]["archetype"];
  description: string;
  targetAudience: string;
  mainOffer: string;
  industry: string;
  businessType: string;
  conversionGoal: string;
  brandTone: string;
  goal: BusinessGoal;
  hasWebsite: boolean;
  socialPlatforms: ProfilePlatform[];
  detectedSocialPlatforms?: ProfilePlatform[];
  googleBusiness: boolean;
  reviewMetricsAvailable?: boolean;
  competitor: boolean;
};

const fixtureConfigs: Record<ReportFixtureKind, FixtureConfig> = {
  hospitality: {
    name: "Schooners",
    initialInput: "https://schooners.com/",
    archetype: "restaurant_hospitality",
    description:
      "A Panama City Beach restaurant and beach club open daily for lunch and dinner.",
    targetAudience: "Local residents and tourists visiting Panama City Beach.",
    mainOffer:
      "Food, drinks, beachfront atmosphere, events, takeout, gift cards, and local experiences.",
    industry: "Hospitality",
    businessType: "Restaurant and beach club",
    conversionGoal:
      "Drive visits through menu, directions, hours, events, takeout, and gift-card paths.",
    brandTone: "Casual, welcoming, and locally rooted.",
    goal: BusinessGoal.MORE_CUSTOMERS,
    hasWebsite: true,
    socialPlatforms: [ProfilePlatform.INSTAGRAM, ProfilePlatform.FACEBOOK],
    googleBusiness: true,
    competitor: true,
  },
  saas: {
    name: "Northstar Metrics",
    initialInput: "https://northstar.example/",
    archetype: "saas_software",
    description:
      "A B2B SaaS analytics platform that helps operations teams find and resolve workflow bottlenecks.",
    targetAudience: "Operations leaders at growing software companies.",
    mainOffer: "A subscription analytics platform with a free trial and product demo.",
    industry: "Software",
    businessType: "B2B SaaS",
    conversionGoal: "Start a free trial or request a product demo.",
    brandTone: "Clear, credible, and practical.",
    goal: BusinessGoal.MORE_LEADS,
    hasWebsite: true,
    socialPlatforms: [ProfilePlatform.LINKEDIN, ProfilePlatform.YOUTUBE],
    googleBusiness: false,
    competitor: false,
  },
  local_service: {
    name: "Clearline Roofing",
    initialInput: "https://clearline.example/",
    archetype: "local_service",
    description:
      "A local roofing contractor serving homeowners across the Tampa service area.",
    targetAudience: "Homeowners who need roof inspections, repairs, or replacement.",
    mainOffer: "Roof inspections, repairs, replacements, and storm-response service.",
    industry: "Home services",
    businessType: "Local roofing contractor",
    conversionGoal: "Call or request a roofing estimate.",
    brandTone: "Dependable, direct, and reassuring.",
    goal: BusinessGoal.MORE_LEADS,
    hasWebsite: true,
    socialPlatforms: [ProfilePlatform.FACEBOOK, ProfilePlatform.INSTAGRAM],
    googleBusiness: true,
    competitor: false,
  },
  social_only: {
    name: "Studio Ember",
    initialInput: "instagram.com/studioember",
    archetype: "creator_community",
    description:
      "A social-first creative studio sharing practical illustration lessons and commissioned artwork.",
    targetAudience: "Aspiring illustrators and customers seeking commissioned artwork.",
    mainOffer: "Illustration education, commissions, and digital products.",
    industry: "Creative services",
    businessType: "Social-first creator business",
    conversionGoal: "Send a DM or use the link-in-bio to commission or buy.",
    brandTone: "Warm, educational, and expressive.",
    goal: BusinessGoal.GROW_SOCIAL_MEDIA,
    hasWebsite: false,
    socialPlatforms: [ProfilePlatform.INSTAGRAM, ProfilePlatform.TIKTOK],
    googleBusiness: false,
    competitor: false,
  },
  cottage_regression: {
    name: "Sunrise Pocket Bakery",
    initialInput: "https://sunrise-pocket.example/",
    archetype: "cottage_food",
    description:
      "A home-based cottage-food bakery taking preorders for local pickup or delivery with no public storefront.",
    targetAudience:
      "Local families and event hosts ordering seasonal handheld pastries.",
    mainOffer:
      "Seasonal pastry pockets available through a manual preorder inquiry.",
    industry: "Cottage food",
    businessType: "Home-based cottage-food preorder business",
    conversionGoal:
      "Submit an order inquiry for pickup or local delivery.",
    brandTone: "Warm, practical, and product-focused.",
    goal: BusinessGoal.MORE_CUSTOMERS,
    hasWebsite: true,
    socialPlatforms: [ProfilePlatform.INSTAGRAM],
    detectedSocialPlatforms: [
      ProfilePlatform.INSTAGRAM,
      ProfilePlatform.FACEBOOK,
      ProfilePlatform.TIKTOK,
    ],
    googleBusiness: true,
    reviewMetricsAvailable: false,
    competitor: false,
  },
  no_competitor: {
    name: "Fieldnote Advisory",
    initialInput: "https://fieldnote.example/",
    archetype: "professional_service",
    description:
      "An independent operations consultancy for owner-led service businesses.",
    targetAudience: "Owners of growing professional service firms.",
    mainOffer: "Operational planning and advisory engagements.",
    industry: "Consulting",
    businessType: "Professional service",
    conversionGoal: "Book an introductory consultation.",
    brandTone: "Calm, experienced, and practical.",
    goal: BusinessGoal.MORE_LEADS,
    hasWebsite: true,
    socialPlatforms: [ProfilePlatform.LINKEDIN],
    googleBusiness: false,
    competitor: false,
  },
  stale_strategy: {
    name: "Harbor Table",
    initialInput: "https://harbortable.example/",
    archetype: "restaurant_hospitality",
    description:
      "A neighborhood waterfront restaurant serving lunch and dinner.",
    targetAudience: "Local diners and waterfront visitors.",
    mainOffer: "Seasonal food, drinks, events, and waterfront dining.",
    industry: "Hospitality",
    businessType: "Restaurant",
    conversionGoal: "View the menu, get directions, or reserve a table.",
    brandTone: "Friendly and coastal.",
    goal: BusinessGoal.MORE_CUSTOMERS,
    hasWebsite: true,
    socialPlatforms: [ProfilePlatform.INSTAGRAM, ProfilePlatform.FACEBOOK],
    googleBusiness: true,
    competitor: false,
  },
};

export function createReportFixture(
  kind: ReportFixtureKind,
  options?: { stress?: boolean },
): AuditReportViewModel {
  const config = fixtureConfigs[kind];
  const auditDate = new Date("2026-07-14T12:00:00.000Z");
  const profileRecords = [
    ...(config.hasWebsite
      ? [
          {
            platform: ProfilePlatform.WEBSITE,
            status: BusinessProfileStatus.CONFIRMED,
            url: config.initialInput,
            label: "Website",
            urlOrHandle: config.initialInput,
          },
        ]
      : []),
    ...config.socialPlatforms.map((platform) => ({
      platform,
      status: BusinessProfileStatus.CONFIRMED,
      url: `https://${platform.toLowerCase()}.com/${slug(config.name)}`,
      label: titleCase(platform),
      urlOrHandle: `@${slug(config.name)}`,
    })),
    ...(config.googleBusiness
      ? [
          {
            platform: ProfilePlatform.GOOGLE_BUSINESS,
            status: BusinessProfileStatus.CONFIRMED,
            url: "https://maps.google.com/?cid=fixture",
            label: "Google Business",
            urlOrHandle: config.name,
          },
        ]
      : []),
  ];
  const assessment = buildAuditAssessment({ profiles: profileRecords });
  const website = config.hasWebsite
    ? createWebsite(config, options?.stress)
    : null;
  const websiteCrawl = config.hasWebsite
    ? createCrawl(config, options?.stress)
    : null;
  const seo = config.hasWebsite ? createSeo(config) : null;
  const social = analyzeSocialProfiles({
    businessProfiles: profileRecords,
    goals: [config.goal],
    primaryGoal: config.goal,
  });
  const reviews = analyzeReviews({
    businessProfiles: profileRecords,
    googleBusinessProfiles: config.googleBusiness
      ? [
          {
            id: "google-fixture",
            displayName: config.name,
            googleMapsUri: "https://maps.google.com/?cid=fixture",
            rating:
              config.reviewMetricsAvailable === false ? null : 4.7,
            reviewCount:
              config.reviewMetricsAvailable === false ? null : 1240,
            matchConfidence: 96,
            status: "confirmed",
            source: "places_api",
          },
        ]
      : [],
    goals: [config.goal],
    primaryGoal: config.goal,
    businessContext: {
      description: config.description,
      targetAudience: config.targetAudience,
      mainOffer: config.mainOffer,
      industry: config.industry,
      businessType: config.businessType,
      primaryConversionGoal: config.conversionGoal,
    },
  });
  const strategy = generateDeterministicSocialStrategy({
    businessName: config.name,
    initialInput: config.initialInput,
    businessContext: {
      description: config.description,
      targetAudience: config.targetAudience,
      mainOffer: config.mainOffer,
      industry: config.industry,
      businessType: config.businessType,
      primaryConversionGoal: config.conversionGoal,
      brandTone: config.brandTone,
      contextConfidence: 90,
      contextSource: "confirmed",
      contextConfirmedAt: auditDate,
    },
    goals: [config.goal],
    primaryGoal: config.goal,
    profiles: profileRecords,
    socialAnalysis: social,
    reviewAnalysis: reviews,
    websiteAnalysis: website,
    competitors: [],
    recommendations: [],
  });
  const competitorComparison = config.competitor
    ? createCompetitorComparison(auditDate)
    : null;
  const competitorIntelligence = competitorComparison
    ? createCompetitorIntelligence(competitorComparison)
    : null;
  const recommendations = createRecommendations(config, options?.stress);
  const findings = createFindings(config, options?.stress);
  const overallScore =
    config.archetype === "cottage_food"
      ? 61
      : config.hasWebsite
        ? 76
        : 79;
  const scoreItems: AuditReportViewModel["scores"] = [
    {
      category: ScoreCategory.WEBSITE,
      label: "Website",
      score: config.hasWebsite ? website?.score ?? 78 : null,
      status: config.hasWebsite ? "scored" : "not_provided",
      confidence: config.hasWebsite ? "High" : "Low",
      evidenceCompleteness: config.hasWebsite ? 100 : 0,
      dataRequirementsMet: config.hasWebsite,
      missingInputs: config.hasWebsite ? [] : ["Confirmed website profile"],
    },
    {
      category: ScoreCategory.SEO,
      label: "SEO",
      score: config.hasWebsite ? seo?.score ?? 71 : null,
      status: config.hasWebsite ? "scored" : "not_applicable",
      confidence: config.hasWebsite ? "High" : "Low",
      evidenceCompleteness: config.hasWebsite ? 100 : 0,
      dataRequirementsMet: config.hasWebsite,
      missingInputs: config.hasWebsite ? [] : ["Confirmed website profile"],
    },
    {
      category: ScoreCategory.BRANDING,
      label: "Branding",
      score: config.archetype === "cottage_food" ? 66 : 82,
      status: "scored",
      confidence: "Medium",
      evidenceCompleteness: 75,
      dataRequirementsMet: true,
      missingInputs: [],
    },
    {
      category: ScoreCategory.SOCIAL,
      label: "Social profile coverage",
      score: social.score,
      status: "partial",
      confidence: social.scoreConfidence === "HIGH" ? "High" : social.scoreConfidence === "MEDIUM" ? "Medium" : "Low",
      evidenceCompleteness: social.evidenceCompleteness,
      dataRequirementsMet: social.dataRequirementsMet,
      missingInputs: ["Profile content", "Posting activity", "Engagement and performance"],
    },
    {
      category: ScoreCategory.REVIEWS,
      label: reviews.dataRequirementsMet
        ? "Reviews & Trust"
        : "Reviews / listing presence",
      score: reviews.score,
      status: reviews.dataRequirementsMet ? "scored" : "partial",
      confidence: reviews.scoreConfidence === "HIGH" ? "High" : reviews.scoreConfidence === "MEDIUM" ? "Medium" : "Low",
      evidenceCompleteness: reviews.evidenceCompleteness,
      dataRequirementsMet: reviews.dataRequirementsMet,
      missingInputs: reviews.missingInputs,
    },
    {
      category: ScoreCategory.COMPETITORS,
      label: "Competitive Position",
      score: competitorComparison ? 63 : null,
      status: competitorComparison ? "scored" : "not_configured",
      confidence: competitorComparison ? "Medium" : "Low",
      evidenceCompleteness: competitorComparison ? 100 : 0,
      dataRequirementsMet: Boolean(competitorComparison),
      missingInputs: competitorComparison
        ? []
        : ["Saved competitors", "Completed public competitor analysis"],
    },
  ];
  const normalizedFacts = buildNormalizedAuditFacts({
    website,
    websiteCrawl,
    seo,
    social,
    reviews,
    selectiveAi: null,
    businessProfiles: profileRecords.map((profile) => ({
      platform: profile.platform,
      status: profile.status,
    })),
    businessContext: {
      name: config.name,
      description: config.description,
      targetAudience: config.targetAudience,
      mainOffer: config.mainOffer,
      industry: config.industry,
      businessType: config.businessType,
      primaryConversionGoal: config.conversionGoal,
      brandTone: config.brandTone,
    },
    competitorConfigured: Boolean(competitorComparison),
    competitorAnalyzed: Boolean(competitorComparison),
    scoreValues: {
      [ScoreCategory.OVERALL]: overallScore,
      ...Object.fromEntries(
        scoreItems.flatMap((item) =>
          item.score === null ? [] : [[item.category, item.score]],
        ),
      ),
    },
    generatedAt: auditDate.toISOString(),
  });
  const report: AuditReportViewModel = {
    business: {
      id: `business-${kind}`,
      name: options?.stress
        ? `${config.name} ${"International Growth and Customer Experience ".repeat(3).trim()}`
        : config.name,
      initialInput: config.initialInput,
      archetype: config.archetype,
      selectedGoals: [config.goal],
      primaryGoal: config.goal,
      context: {
        description: options?.stress
          ? `${config.description} ${"This deliberately long fixture verifies that measured paragraphs, cards, and rows wrap without crossing page boundaries. ".repeat(8)}`
          : config.description,
        targetAudience: config.targetAudience,
        mainOffer: config.mainOffer,
        industry: config.industry,
        businessType: config.businessType,
        observedPrimaryConversionGoal: config.conversionGoal,
        brandTone: config.brandTone,
        confidenceLabel: "high confidence",
        sourceLabel: "User confirmed",
        confirmed: true,
        needsReview: false,
        reviewNote: null,
      },
      userSelectedGrowthGoal: titleCase(config.goal),
      secondaryGoals: [],
      profileSummary: {
        confirmed: profileRecords.length,
        pending: 0,
        removed: 0,
        confirmedPlatforms: profileRecords.map((profile) => profile.label),
        counts: aggregateProfileCounts(profileRecords),
      },
    },
    audit: {
      id: `audit-${kind}`,
      date: auditDate,
      completedAt: auditDate,
      overallScore,
      healthLabel: "Good",
      executiveSummary: buildExecutiveSummary(config, overallScore),
    },
    assessment,
    scores: scoreItems,
    website,
    websiteCrawl,
    seo,
    social,
    reviews,
    socialStrategy: {
      data: strategy,
      source: "deterministic_fallback",
      sourceLabel: "Deterministic fallback",
      freshness: {
        status: "CURRENT",
        generatedAt: auditDate,
        sourceAuditId: `audit-${kind}`,
        dependencyFingerprint: `strategy-${kind}`,
        storedDependencyFingerprint:
          kind === "stale_strategy" ? "old-fingerprint" : `strategy-${kind}`,
        generatorVersion: SOCIAL_STRATEGY_GENERATOR_VERSION,
        reason:
          kind === "stale_strategy"
            ? "Saved strategy dependencies changed, so this deterministic fallback was regenerated from current evidence."
            : "Current evidence was used.",
      },
      scopeNote:
        "Generated from Business Context, confirmed profiles, website content, goals, reviews, and competitor information. Individual posts, engagement, posting frequency, and content performance were not analyzed.",
    },
    competitors: {
      status: competitorComparison ? "current" : "not_configured",
      score: competitorComparison ? 63 : null,
      label: competitorComparison ? "Current comparison" : "Not configured",
      activeCount: competitorComparison ? 1 : 0,
      confirmedProfilesCount: competitorComparison ? 2 : 0,
      profileCounts: aggregateProfileCounts(
        competitorComparison
          ? [
              {
                platform: ProfilePlatform.WEBSITE,
                status: BusinessProfileStatus.CONFIRMED,
              },
              {
                platform: ProfilePlatform.INSTAGRAM,
                status: BusinessProfileStatus.CONFIRMED,
              },
            ]
          : [],
      ),
      profilesByCompetitor: [],
      names: competitorComparison ? ["Boardwalk Kitchen"] : [],
      intelligence: competitorIntelligence,
      comparison: competitorComparison,
      methodologyNote:
        "Competitive Position reflects comparable public website, SEO, confirmed profile-coverage, review, and messaging signals. Missing data is not scored as a loss.",
      snapshotDate: competitorComparison ? auditDate : null,
      businessAuditDate: auditDate,
      freshness: {
        status: competitorComparison ? "CURRENT" : "UNAVAILABLE",
        generatedAt: competitorComparison ? auditDate : null,
        sourceAuditId: `audit-${kind}`,
        dependencyFingerprint: `competitor-${kind}`,
        storedDependencyFingerprint: competitorComparison
          ? `competitor-${kind}`
          : null,
        generatorVersion: COMPETITOR_COMPARISON_VERSION,
        reason: competitorComparison
          ? "Current snapshots and profile states were used."
          : "No active competitors are configured.",
      },
    },
    findings: {
      strengths: findings.filter(
        (item) =>
          item.findingType === "VERIFIED_STRENGTH" ||
          (!item.findingType && item.severity === FindingSeverity.INFO),
      ),
      warnings: findings.filter(
        (item) =>
          item.findingType === "VERIFIED_TECHNICAL_ISSUE" ||
          item.findingType === "LIMITATION" ||
          (!item.findingType && item.severity === FindingSeverity.HIGH),
      ),
      opportunities: findings.filter(
        (item) =>
          item.findingType === "AI_REVIEWED_OPPORTUNITY" ||
          item.findingType === "COVERAGE_INFORMATION" ||
          item.findingType === "OBSERVATION" ||
          (!item.findingType &&
            item.severity === FindingSeverity.MEDIUM),
      ),
      all: findings,
    },
    recommendations: {
      primary: recommendations.slice(0, 3),
      technical: recommendations.slice(3),
      all: recommendations,
      completed: 0,
      total: recommendations.length,
    },
    nextMoves: recommendations.slice(0, 3).map((item) => ({
      title: item.title,
      whyItMatters: item.businessRelevance,
      expectedOutcome: expectedOutcome(item.category),
      evidence: item.evidenceSummary,
      implementationAction: item.description,
      category: item.category,
      effort: item.estimatedEffort,
      impact: item.expectedImpact,
    })),
    progress: {
      comparison: firstAuditComparison(`audit-${kind}`, findings, recommendations),
      previousScore: null,
      currentScore: overallScore,
      note:
        "Audit scores change only when analysis detects different evidence or scoring coverage changes. Completing a task does not directly change a score.",
    },
    freshness: {
      businessContext: "CURRENT",
      socialStrategy: "CURRENT",
      competitorComparison: competitorComparison ? "CURRENT" : "UNAVAILABLE",
      reviews: "CURRENT",
    },
    confidence: {
      pagesScanned: websiteCrawl?.pagesScanned ?? 0,
      crawlLimit: websiteCrawl?.crawlLimitUsed ?? 0,
      crawlStatus: websiteCrawl ? "full" : "not applicable",
      importantPagesIncluded: websiteCrawl?.importantPagesFound ?? [],
      googleBusinessStatus: reviews.googleBusinessStatus,
      businessContextStatus: "Confirmed",
      socialStrategyStatus: "CURRENT - Deterministic fallback",
      competitorComparisonStatus: competitorComparison
        ? "Current comparison"
        : "Not configured",
      limitations: [
        "Individual social posts, engagement, posting frequency, reach, impressions, and content performance were not analyzed.",
        "Competitor positioning is inferred from public evidence only.",
      ],
    },
    scoringMetadata: {
      scoringEngineVersion: SCORING_ENGINE_VERSION,
      reportViewModelVersion: REPORT_VIEW_MODEL_VERSION,
      analyzerVersions: {
        website: "website-analyzer-v2",
        seo: "seo-analyzer-v2",
        social: "social-analyzer-v2",
        reviews: "review-analyzer-v2",
        competitors: COMPETITOR_COMPARISON_VERSION,
      },
      categoryWeights: assessment.scoreWeights,
      applicableCategories: assessment.applicableCategories,
      pagesScanned: websiteCrawl?.pagesScanned ?? 0,
      crawlLimit: websiteCrawl?.crawlLimitUsed ?? 0,
      crawlStatus: websiteCrawl ? "full" : "not_applicable",
      competitorSnapshotIds: competitorComparison ? ["snapshot-fixture"] : [],
      generatedAt: auditDate.toISOString(),
    },
    evidenceIntegrity: {
      contractVersion: EVIDENCE_CONTRACT_VERSION,
      generatedAt: auditDate.toISOString(),
      evidence: [],
      validatedClaims: [],
      scoreBreakdowns: [],
      canonicalRecommendations: [],
      dataConflicts: [],
      profileCounts: {
        business: aggregateProfileCounts(profileRecords),
        competitors: [],
        totals: aggregateProfileCounts([]),
      },
      validationWarnings: [],
      sourceVersions: {
        report: REPORT_VIEW_MODEL_VERSION,
      },
    },
    normalizedFacts,
    coverage: normalizedFacts.coverage,
    dataNotes: [],
    technicalAppendix: {
      detectedActionLinks: website?.actionSummary.rawCandidates ?? [],
      pagesWithNoDetectedActionLinks: websiteCrawl?.pagesWithNoCTA ?? null,
      pagesWithDetectedActionLinks:
        websiteCrawl?.pagesWithDetectedActionLinks ?? null,
      pagesWithAssessedPrimaryCta:
        websiteCrawl?.pagesWithAssessedPrimaryCta ?? null,
      pagesWithStructurallyClearPrimaryCta: websiteCrawl
        ? websiteCrawl.pageResults.filter(
            (page) =>
              getPrimaryCtaAssessment(page.actionSummary).assessed &&
              getPrimaryCtaAssessment(page.actionSummary).clarity === "CLEAR",
          ).length
        : null,
      homepagePrimaryCtaAssessment: website
        ? getPrimaryCtaAssessment(website.actionSummary)
        : null,
      duplicateUrlVariantsSkipped: websiteCrawl?.duplicateUrlsSkipped ?? null,
      pageResults: websiteCrawl?.pageResults ?? [],
      pageSelection: selectReportCrawlPages(websiteCrawl?.pageResults ?? []),
      findings,
    },
  };

  return report;
}

function createWebsite(config: FixtureConfig, stress = false): WebsiteAnalysis {
  const longPath = stress
    ? `/resources/${"a-very-long-but-valid-url-segment-".repeat(8)}final`
    : "/contact";
  const cottageRegression = config.archetype === "cottage_food";
  const detectedSocialLinks = (
    config.detectedSocialPlatforms ?? [ProfilePlatform.INSTAGRAM]
  ).map(
    (platform) =>
      `https://${platform.toLowerCase()}.com/${slug(config.name)}`,
  );
  const actionSummary = cottageRegression
    ? classifyWebsiteActions({
        businessKind: "general",
        candidates: [
          {
            label: "Order Inquiries",
            href: `${config.initialInput}order-inquiries`,
            domLocation: "main",
          },
          {
            label: "Email orders",
            href: "mailto:orders@sunrise-pocket.example",
            domLocation: "main",
          },
          {
            label: "Join the newsletter",
            href: `${config.initialInput}newsletter`,
            domLocation: "footer",
          },
          ...detectedSocialLinks.map((href) => ({
            label: href.includes("instagram")
              ? "Instagram"
              : href.includes("facebook")
                ? "Facebook"
                : "TikTok",
            href,
            domLocation: "footer" as const,
          })),
        ],
      })
    : fixtureActionSummary([config.conversionGoal], [
        config.conversionGoal,
        longPath,
        "About",
        "Instagram",
      ]);
  return {
    normalizedUrl: config.initialInput,
    pageTitle: cottageRegression
      ? `Home | ${config.name}`
      : `${config.name} | ${config.mainOffer}`,
    metaDescription: cottageRegression ? null : config.description,
    h1Count: 1,
    h1Text: [cottageRegression ? "PIE POCKETS" : config.mainOffer],
    hasViewportMeta: true,
    hasCanonical: true,
    internalLinksCount: 18,
    externalLinksCount: 4,
    imageCount: 12,
    imagesMissingAltCount: 2,
    hasContactLink: true,
    hasPricingLink: config.archetype === "saas_software",
    hasBlogLink: true,
    hasSocialLinks: true,
    detectedSocialLinks,
    detectedAddress: null,
    detectedPhone: null,
    detectedGoogleMapsLinks: [],
    detectedMapEmbeds: [],
    detectedLocalBusinessSchema: [],
    operatingHoursSignals: [],
    ctaCandidates: cottageRegression
      ? ["Order Inquiries", "Email orders", "Join the newsletter"]
      : [config.conversionGoal, longPath],
    actionSummary,
    warnings: cottageRegression
      ? ["The homepage meta description is missing."]
      : ["Two images are missing alt text."],
    score: cottageRegression ? 64 : 78,
  };
}

function createCrawl(config: FixtureConfig, stress = false): WebsiteCrawlResult {
  if (config.archetype === "cottage_food") {
    return createCottageRegressionCrawl(config);
  }
  const pageCount = stress ? 18 : 5;
  const pages = Array.from({ length: pageCount }, (_, index) =>
    createPage(config, index, stress),
  );
  return {
    normalizedUrl: config.initialInput,
    pagesScanned: pages.length,
    successfulPages: pages.length,
    failedPages: 0,
    averagePageScore: 78,
    pagesMissingTitle: 0,
    pagesMissingMetaDescription: 1,
    pagesWithNoH1: 1,
    pagesWithMultipleH1: 0,
    totalImages: pages.reduce((sum, page) => sum + page.imageCount, 0),
    totalImagesMissingAlt: pages.reduce(
      (sum, page) => sum + page.imagesMissingAltCount,
      0,
    ),
    pagesWithNoCTA: 1,
    pagesWithDetectedActionLinks: pages.filter(
      (page) => page.actionSummary.hasDetectedActionLinks,
    ).length,
    pagesWithAssessedPrimaryCta: pages.length,
    pagesWithClearPrimaryCta: pages.filter(
      (page) => page.actionSummary.primaryCtaAssessment.clarity === "CLEAR",
    ).length,
    pagesWithCtaNeedsImprovement: pages.filter(
      (page) =>
        page.actionSummary.primaryCtaAssessment.clarity ===
        "NEEDS_IMPROVEMENT",
    ).length,
    pagesWithUncertainPrimaryCta: 0,
    importantPagesFound: ["About", "Contact", "Services"],
    importantPagesMissing: [],
    discoveredImportantPages: [],
    scannedImportantPages: [],
    skippedImportantPages: [],
    missingImportantPageTypes: [],
    duplicateUrlsSkipped: stress ? 2345 : 12,
    crawlLimitUsed: stress ? 75 : 10,
    crawlLimitReached: false,
    businessTypeUsed:
      config.archetype === "restaurant_hospitality"
        ? "restaurant"
        : config.archetype === "saas_software"
          ? "saas"
          : config.archetype === "local_service"
            ? "local_service"
            : "general",
    pageResults: pages,
    warnings: [],
  };
}

function createCottageRegressionCrawl(
  config: FixtureConfig,
): WebsiteCrawlResult {
  const baseUrl = config.initialInput.replace(/\/$/, "");
  const socialLinks = (
    config.detectedSocialPlatforms ?? [ProfilePlatform.INSTAGRAM]
  ).map(
    (platform) =>
      `https://${platform.toLowerCase()}.com/${slug(config.name)}`,
  );
  const homepageActions = classifyWebsiteActions({
    businessKind: "general",
    candidates: [
      {
        label: "Order Inquiries",
        href: `${baseUrl}/order-inquiries`,
        domLocation: "main",
      },
      {
        label: "Email orders",
        href: "mailto:orders@sunrise-pocket.example",
        domLocation: "main",
      },
      {
        label: "Join the newsletter",
        href: `${baseUrl}/newsletter`,
        domLocation: "footer",
      },
      ...socialLinks.map((href) => ({
        label: href.includes("instagram")
          ? "Instagram"
          : href.includes("facebook")
            ? "Facebook"
            : "TikTok",
        href,
        domLocation: "footer" as const,
      })),
    ],
  });
  const orderActions = classifyWebsiteActions({
    businessKind: "general",
    candidates: [
      {
        label: "Email your order",
        href: "mailto:orders@sunrise-pocket.example",
        domLocation: "main",
      },
    ],
  });
  const pages: CrawledPageResult[] = [
    {
      url: config.initialInput,
      statusCode: 200,
      analysisStatus: "ANALYZED",
      title: `Home | ${config.name}`,
      metaDescription: null,
      h1Count: 1,
      h1Text: ["PIE POCKETS"],
      hasCanonical: true,
      hasViewportMeta: true,
      imageCount: 8,
      imagesMissingAltCount: 2,
      internalLinksCount: 9,
      externalLinksCount: socialLinks.length,
      ctaCandidates: ["Order Inquiries", "Email orders"],
      actionSummary: homepageActions,
      wordCount: 310,
      mainContentWordCount: 220,
      thinContent: {
        status: "SUFFICIENT",
        mainContentWordCount: 220,
        reason: null,
      },
      copyQualityIssues: [],
      conversionProcess: {
        applicable: true,
        conversionMethod: "EMAIL",
        estimatedManualSteps: 2,
        formAvailable: false,
        emailOnly: true,
        phoneOnly: false,
        delayedConfirmation: false,
        externalInvoice: false,
        pricingClarity: "UNCLEAR",
        fulfillmentClarity: "CLEAR",
        frictionLevel: "LOW",
        evidence: [
          "Ordering appears to rely on email rather than a structured form.",
        ],
        confidence: "MEDIUM",
      },
      warnings: ["Meta description missing."],
      score: 66,
      pageTypes: ["Homepage"],
      hasContactInfo: true,
      contactSignals: ["Email orders"],
      detectedAddress: null,
      detectedPhone: null,
      detectedGoogleMapsLinks: [],
      detectedMapEmbeds: [],
      detectedLocalBusinessSchema: [],
      operatingHoursSignals: [],
    },
    {
      url: `${baseUrl}/menu`,
      statusCode: 200,
      analysisStatus: "ANALYZED",
      title: "Menu | Sunrise Pocket Bakery",
      metaDescription: null,
      h1Count: 0,
      h1Text: [],
      hasCanonical: true,
      hasViewportMeta: true,
      imageCount: 6,
      imagesMissingAltCount: 1,
      internalLinksCount: 5,
      externalLinksCount: 0,
      ctaCandidates: ["Order Inquiries"],
      actionSummary: classifyWebsiteActions({
        businessKind: "general",
        candidates: [
          {
            label: "Order Inquiries",
            href: `${baseUrl}/order-inquiries`,
            domLocation: "main",
          },
        ],
      }),
      wordCount: 180,
      mainContentWordCount: 145,
      thinContent: {
        status: "SUFFICIENT",
        mainContentWordCount: 145,
        reason: null,
      },
      copyQualityIssues: [
        {
          url: `${baseUrl}/menu`,
          issueType: "LIKELY_SPELLING",
          excerpt: "Please recieve confirmation before pickup.",
          suggestedCorrection: "receive",
          confidence: "HIGH",
        },
      ],
      warnings: [
        "Meta description missing.",
        "No H1 heading was detected.",
      ],
      score: 55,
      pageTypes: ["Menu"],
      hasContactInfo: false,
      contactSignals: [],
      detectedAddress: null,
      detectedPhone: null,
      detectedGoogleMapsLinks: [],
      detectedMapEmbeds: [],
      detectedLocalBusinessSchema: [],
      operatingHoursSignals: [],
    },
    {
      url: `${baseUrl}/order-inquiries`,
      statusCode: 200,
      analysisStatus: "ANALYZED",
      title: "Order Inquiries | Sunrise Pocket Bakery",
      metaDescription:
        "Email the requested order details for pickup or delivery.",
      h1Count: 1,
      h1Text: ["Order Inquiries"],
      hasCanonical: true,
      hasViewportMeta: true,
      imageCount: 1,
      imagesMissingAltCount: 0,
      internalLinksCount: 4,
      externalLinksCount: 0,
      ctaCandidates: ["Email your order"],
      actionSummary: orderActions,
      wordCount: 210,
      mainContentWordCount: 175,
      thinContent: {
        status: "SUFFICIENT",
        mainContentWordCount: 175,
        reason: null,
      },
      copyQualityIssues: [],
      conversionProcess: {
        applicable: true,
        conversionMethod: "EMAIL",
        estimatedManualSteps: 4,
        formAvailable: false,
        emailOnly: true,
        phoneOnly: false,
        delayedConfirmation: true,
        externalInvoice: true,
        pricingClarity: "UNCLEAR",
        fulfillmentClarity: "CLEAR",
        frictionLevel: "HIGH",
        evidence: [
          "Ordering appears to rely on email rather than a structured form.",
          "Six order-detail types are requested without a structured form.",
          "The process requires a later manual confirmation.",
          "Payment references an invoice sent after confirmation.",
        ],
        confidence: "HIGH",
      },
      warnings: [],
      score: 58,
      pageTypes: ["Order"],
      hasContactInfo: true,
      contactSignals: ["Email your order"],
      detectedAddress: null,
      detectedPhone: null,
      detectedGoogleMapsLinks: [],
      detectedMapEmbeds: [],
      detectedLocalBusinessSchema: [],
      operatingHoursSignals: [],
    },
    ...["apple", "cherry"].map<CrawledPageResult>((flavor) => ({
      url: `${baseUrl}/products/${flavor}`,
      statusCode: 200,
      analysisStatus: "ANALYZED",
      title: `${flavor === "apple" ? "Apple" : "Cherry"} Pie Pocket`,
      metaDescription:
        "A seasonal pastry pocket available through preorder.",
      h1Count: 1,
      h1Text: [
        `${flavor === "apple" ? "Apple" : "Cherry"} Pie Pocket`,
      ],
      hasCanonical: true,
      hasViewportMeta: true,
      imageCount: 3,
      imagesMissingAltCount: 0,
      internalLinksCount: 4,
      externalLinksCount: 0,
      ctaCandidates: [],
      actionSummary: fixtureActionSummary([]),
      wordCount: 155,
      mainContentWordCount: 118,
      thinContent: {
        status: "SUFFICIENT",
        mainContentWordCount: 118,
        reason: null,
      },
      copyQualityIssues: [],
      warnings: [],
      score: 72,
      pageTypes: ["Product"],
      hasContactInfo: false,
      contactSignals: [],
      detectedAddress: null,
      detectedPhone: null,
      detectedGoogleMapsLinks: [],
      detectedMapEmbeds: [],
      detectedLocalBusinessSchema: [],
      operatingHoursSignals: [],
    })),
    {
      url: `${baseUrl}/faq`,
      statusCode: 200,
      analysisStatus: "ANALYZED",
      title: "FAQ | Sunrise Pocket Bakery",
      metaDescription: "Common preorder questions.",
      h1Count: 1,
      h1Text: ["Frequently Asked Questions"],
      hasCanonical: true,
      hasViewportMeta: true,
      imageCount: 0,
      imagesMissingAltCount: 0,
      internalLinksCount: 3,
      externalLinksCount: 0,
      ctaCandidates: [],
      actionSummary: fixtureActionSummary([]),
      wordCount: 24,
      mainContentWordCount: 18,
      thinContent: {
        status: "EMPTY",
        mainContentWordCount: 18,
        reason:
          "The extracted main content contains little beyond a page shell or navigation.",
      },
      copyQualityIssues: [],
      warnings: ["Extracted main content appears empty."],
      score: 48,
      pageTypes: ["FAQ"],
      hasContactInfo: false,
      contactSignals: [],
      detectedAddress: null,
      detectedPhone: null,
      detectedGoogleMapsLinks: [],
      detectedMapEmbeds: [],
      detectedLocalBusinessSchema: [],
      operatingHoursSignals: [],
    },
  ];

  return {
    normalizedUrl: config.initialInput,
    pagesScanned: pages.length,
    successfulPages: pages.length,
    failedPages: 0,
    averagePageScore: 61,
    pagesMissingTitle: 0,
    pagesMissingMetaDescription: 2,
    pagesWithNoH1: 1,
    pagesWithMultipleH1: 0,
    totalImages: pages.reduce((sum, page) => sum + page.imageCount, 0),
    totalImagesMissingAlt: pages.reduce(
      (sum, page) => sum + page.imagesMissingAltCount,
      0,
    ),
    pagesWithNoCTA: pages.filter(
      (page) => !page.actionSummary.hasDetectedActionLinks,
    ).length,
    pagesWithDetectedActionLinks: pages.filter(
      (page) => page.actionSummary.hasDetectedActionLinks,
    ).length,
    pagesWithAssessedPrimaryCta: pages.length,
    pagesWithClearPrimaryCta: 0,
    pagesWithCtaNeedsImprovement: pages.filter(
      (page) =>
        page.actionSummary.primaryCtaAssessment.clarity ===
        "NEEDS_IMPROVEMENT",
    ).length,
    pagesWithUncertainPrimaryCta: pages.filter(
      (page) =>
        page.actionSummary.primaryCtaAssessment.clarity === "UNCERTAIN",
    ).length,
    importantPagesFound: ["Menu", "Order", "FAQ"],
    importantPagesMissing: ["Contact"],
    discoveredImportantPages: [],
    scannedImportantPages: [],
    skippedImportantPages: [],
    missingImportantPageTypes: ["Contact"],
    duplicateUrlsSkipped: 0,
    crawlLimitUsed: 10,
    crawlLimitReached: false,
    businessTypeUsed: "general",
    pageResults: pages,
    thinPages: [
      {
        url: `${baseUrl}/faq`,
        wordCount: 18,
        status: "EMPTY",
      },
    ],
    duplicateContentGroups: [
      {
        urls: [
          `${baseUrl}/products/apple`,
          `${baseUrl}/products/cherry`,
        ],
        similarity: 0.91,
        reason: "NEAR_DUPLICATE_MAIN_CONTENT",
      },
    ],
    copyQualityFindings: [
      {
        url: `${baseUrl}/menu`,
        issueType: "LIKELY_SPELLING",
        excerpt: "Please recieve confirmation before pickup.",
        suggestedCorrection: "receive",
        confidence: "HIGH",
      },
    ],
    orderingFrictionPages: [
      {
        url: `${baseUrl}/order-inquiries`,
        frictionLevel: "HIGH",
        evidence: [
          "Ordering relies on email without a structured form.",
          "Confirmation and invoice payment happen later.",
        ],
      },
    ],
    warnings: [],
  };
}

function createPage(
  config: FixtureConfig,
  index: number,
  stress = false,
): CrawledPageResult {
  const segment = stress
    ? `${"long-segment-with-readable-words-".repeat(7)}${index}`
    : `page-${index + 1}`;
  return {
    url: `${config.initialInput.replace(/\/$/, "")}/${segment}`,
    statusCode: 200,
    title: `${config.name} page ${index + 1}`,
    metaDescription: index === 1 ? null : config.description,
    h1Count: index === 2 ? 0 : 1,
    h1Text: index === 2 ? [] : [`Page ${index + 1}`],
    hasCanonical: true,
    hasViewportMeta: true,
    imageCount: 4,
    imagesMissingAltCount: index % 3 === 0 ? 1 : 0,
    internalLinksCount: 8,
    externalLinksCount: 2,
    ctaCandidates: index === 3 ? [] : [config.conversionGoal],
    actionSummary: fixtureActionSummary(
      index === 3 ? [] : [config.conversionGoal],
    ),
    wordCount: 420,
    warnings: index === 1 ? ["Meta description missing."] : [],
    score: index === 1 || index === 2 ? 66 : 82,
    pageTypes: index < 3 ? [["about"], ["contact"], ["services"]][index] : [],
    hasContactInfo: index === 1,
    contactSignals: index === 1 ? ["Contact link"] : [],
    operatingHoursSignals: [],
    detectedAddress: null,
    detectedPhone: null,
    detectedGoogleMapsLinks: [],
    detectedMapEmbeds: [],
    detectedLocalBusinessSchema: [],
  };
}

function fixtureActionSummary(actions: string[], rawCandidates = actions) {
  const hasActions = actions.length > 0;
  return {
    hasDetectedActionLinks: hasActions,
    detectedActionLinkCount: rawCandidates.length,
    detectedActionTypes: actions,
    detectedActionLinks: actions.map((action) => ({
      label: action,
      href: null,
      actionType: action,
      elementType: "a",
      domLocation: "hero" as const,
      buttonLike: true,
      nearPrimaryHeading: true,
      navigationLike: false,
      prominenceScore: 9,
    })),
    primaryCtaAssessment: {
      clarity: hasActions ? ("CLEAR" as const) : ("NEEDS_IMPROVEMENT" as const),
      primaryCtaText: actions[0] ?? null,
      primaryCtaType: actions[0] ?? null,
      evidence: hasActions
        ? ["A single button-like action appears near the primary heading."]
        : ["No customer action link was detected."],
      confidence: hasActions ? ("HIGH" as const) : ("MEDIUM" as const),
      assessmentMethod: "STATIC_HTML_STRUCTURE" as const,
      assessed: true,
    },
    primaryActions: actions,
    conversionLinks: actions,
    contactActions: [],
    emailActions: [],
    orderActions: actions.filter((action) => /order|buy|shop/i.test(action)),
    bookingActions: actions.filter((action) => /book|schedule/i.test(action)),
    newsletterActions: [],
    secondaryNavigation: ["About"],
    socialLinks: [],
    eventLinks: [],
    utilityLinks: [],
    rawCandidates,
  };
}

function createSeo(config: FixtureConfig): SeoAnalysis {
  if (config.archetype === "cottage_food") {
    return {
      score: 52,
      titleStatus: "too_short",
      titleLength: `Home | ${config.name}`.length,
      metaDescriptionStatus: "missing",
      metaDescriptionLength: 0,
      h1Status: "good",
      canonicalStatus: "good",
      viewportStatus: "good",
      robotsTxtStatus: "found",
      sitemapStatus: "found",
      indexabilityWarnings: [],
      seoWarnings: [
        "The homepage and menu page are missing meta descriptions.",
        "The menu page has no H1.",
      ],
      seoStrengths: [
        "The homepage has exactly one H1.",
        "robots.txt and sitemap.xml were found.",
      ],
      recommendedFixes: [
        "Write descriptive metadata for the homepage and menu page.",
        "Add one descriptive H1 to the menu page.",
      ],
    };
  }

  return {
    score: 71,
    titleStatus: "good",
    titleLength: 54,
    metaDescriptionStatus: "good",
    metaDescriptionLength: 148,
    h1Status: "good",
    canonicalStatus: "good",
    viewportStatus: "good",
    robotsTxtStatus: "found",
    sitemapStatus: "found",
    indexabilityWarnings: [],
    seoWarnings: ["One crawled page is missing a meta description."],
    seoStrengths: ["The homepage title is present."],
    recommendedFixes: ["Write a useful meta description for the missing page."],
  };
}

function createRecommendations(config: FixtureConfig, stress = false) {
  const details = recommendationDetails(config);
  return details.map((item, index) => ({
    id: `recommendation-${slug(config.name)}-${index}`,
    title: stress
      ? `${item.title}: ${"carefully measured implementation detail ".repeat(4).trim()}`
      : item.title,
    description: stress
      ? `${item.description} ${"This deliberately long implementation description verifies that recommendation cards paginate cleanly and remain within printable bounds. ".repeat(5)}`
      : item.description,
    category: item.category,
    priority:
      index < 3 ? RecommendationPriority.HIGH : RecommendationPriority.MEDIUM,
    status: RecommendationStatus.TODO,
    estimatedEffort: index % 2 === 0 ? "Low" : "Medium",
    expectedImpact: index < 3 ? "High" : "Medium",
    sourceCategory: categoryLabel(item.category),
    sourceFindingId: `finding-${index}`,
    evidenceSummary: stress
      ? `${item.evidence} ${"Additional current evidence remains traceable to the selected audit and public records. ".repeat(5)}`
      : item.evidence,
    businessRelevance: item.relevance,
    confidence: index < 3 ? ("High" as const) : ("Medium" as const),
    freshness: "Current audit" as const,
    technical: index >= 3,
    sourceUrl: item.sourceUrl ?? null,
  }));
}

function recommendationDetails(config: FixtureConfig) {
  if (config.archetype === "cottage_food") {
    const baseUrl = config.initialInput.replace(/\/$/, "");
    return [
      action(
        "Make ordering the clear primary action",
        "Give the confirmed order-inquiry path stronger placement near the top and repeat it after the product section.",
        ScoreCategory.WEBSITE,
        "Order and email paths exist, but no single action has verified dominant structural prominence.",
        "The saved growth goal depends on moving product interest into a real preorder inquiry.",
        config.initialInput,
      ),
      action(
        "Simplify the order inquiry process",
        "Keep the manual preorder model, but collect required details in one guided form and explain confirmation, invoice payment, pickup, and delivery expectations.",
        ScoreCategory.WEBSITE,
        "The order page requests several details by email, requires later confirmation, and sends payment through a later invoice.",
        "Fewer manual handoffs may make the existing preorder path easier to understand and complete.",
        `${baseUrl}/order-inquiries`,
      ),
      action(
        "Write descriptive metadata for the homepage and menu",
        "Describe the product, local preorder market, and pickup or delivery offer in concise page-specific language.",
        ScoreCategory.SEO,
        "Measured meta-description length is 0 on the homepage and menu page.",
        "Specific descriptions can make these pages clearer in search presentations without treating character ranges as guarantees.",
        config.initialInput,
      ),
      action(
        "Add a clear main headline to Menu",
        "Add one descriptive H1 to the menu page while preserving the verified homepage H1.",
        ScoreCategory.SEO,
        "Homepage H1 count is 1; the menu page H1 count is 0.",
        "The fix belongs only on the measured menu page.",
        `${baseUrl}/menu`,
      ),
      action(
        "Correct visible copy errors across key customer pages",
        "Correct the cited high-confidence spelling issue while preserving product and brand language.",
        ScoreCategory.BRANDING,
        "The menu includes the excerpt: Please recieve confirmation before pickup.",
        "Clean ordering copy supports trust during a manual inquiry.",
        `${baseUrl}/menu`,
      ),
      action(
        "Resolve the thin FAQ page",
        "Add useful preorder answers, redirect it, remove it from navigation, or noindex it after confirming the page purpose.",
        ScoreCategory.WEBSITE,
        "The FAQ page contains 18 extracted main-content words.",
        "A complete FAQ can reduce avoidable ordering questions.",
        `${baseUrl}/faq`,
      ),
      action(
        "Differentiate near-duplicate product pages",
        "Give each product page distinct flavor details, availability, fulfillment guidance, and a relevant next step.",
        ScoreCategory.SEO,
        "The Apple and Cherry product pages have 91% main-content similarity in the synthetic fixture.",
        "Distinct product information helps customers choose without forcing an automatic deletion recommendation.",
        `${baseUrl}/products/apple`,
      ),
    ];
  }

  if (config.archetype === "restaurant_hospitality") {
    return [
      action("Make menu, hours, and directions prominent", "Connect visual hospitality content to one practical visit action.", ScoreCategory.WEBSITE, "Current action-link evidence shows several options without one dominant visitor path.", "Restaurant visitors need a fast path from interest to a visit or order."),
      action("Feature current customer proof near decision points", "Place approved review proof near menu, location, and order paths.", ScoreCategory.REVIEWS, "A confirmed Google listing provides current rating and review-count evidence.", "Visible trust helps local diners make a confident choice."),
      action("Build short-form content around the guest experience", "Use atmosphere, food, drinks, events, and local traditions as repeatable content pillars.", ScoreCategory.SOCIAL, "Confirmed visual profiles and hospitality Business Context support this direction.", "The strategy matches a visual local hospitality business."),
      action("Give every important page one descriptive H1", "Add a clear page-level headline where the crawl found a missing H1.", ScoreCategory.SEO, "One crawled page has no H1.", "Clear headings help visitors and search engines understand the page."),
      action("Tighten missing page metadata", "Write the missing page description using specific visit information.", ScoreCategory.SEO, "One page is missing a meta description.", "Complete metadata improves search-result clarity."),
      action("Keep public calls to action consistent", "Use the same practical next-step language across important pages and profiles.", ScoreCategory.BRANDING, "Current public paths use several different labels.", "Consistent actions reduce customer uncertainty."),
    ];
  }
  if (config.archetype === "saas_software") {
    return [
      action("Clarify the free-trial and demo paths", "Give the primary buyer one obvious choice between starting a trial and requesting a demo.", ScoreCategory.WEBSITE, "The website exposes both conversion paths.", "The recommendation matches the saved SaaS offer and buyer journey."),
      action("Explain the operational outcome above the fold", "Connect the product headline to the workflow bottleneck it resolves.", ScoreCategory.BRANDING, "Business Context identifies operations leaders as the target buyer.", "Specific outcome language supports qualified signups."),
      action("Publish short product workflows", "Use LinkedIn and YouTube Shorts for practical product demonstrations.", ScoreCategory.SOCIAL, "Confirmed professional and video profiles support these channels.", "The platform mix fits a B2B software audience."),
      action("Complete page metadata", "Write the missing page description.", ScoreCategory.SEO, "One page is missing a meta description.", "Complete metadata supports search clarity."),
      action("Keep one H1 per important page", "Add the missing page headline.", ScoreCategory.SEO, "One page has no H1.", "Consistent headings improve comprehension."),
    ];
  }
  if (config.archetype === "local_service") {
    return [
      action("Make call and estimate actions prominent", "Use one clear call or estimate path on every important service page.", ScoreCategory.WEBSITE, "Current conversion context prioritizes calls and estimates.", "Local homeowners need a fast contact path."),
      action("Put service-area proof near the contact path", "Show verified local coverage and approved customer proof.", ScoreCategory.REVIEWS, "A confirmed Google listing supports local trust.", "Local proof reduces uncertainty before a call."),
      action("Answer common roofing questions", "Create practical social posts about inspections, repairs, and storm response.", ScoreCategory.SOCIAL, "Confirmed local social profiles support educational content.", "Useful answers can build trust before a homeowner contacts the business."),
      action("Complete page metadata", "Write the missing page description.", ScoreCategory.SEO, "One page is missing a meta description.", "Complete metadata supports local search clarity."),
      action("Add the missing service-page H1", "Use one descriptive headline.", ScoreCategory.SEO, "One page has no H1.", "Clear structure helps visitors scan services."),
    ];
  }
  if (!config.hasWebsite) {
    return [
      action("Rewrite the profile bio around the main offer", "State who the studio helps, what it offers, and the next step.", ScoreCategory.SOCIAL, "The audit uses confirmed Instagram and TikTok profiles plus Business Context.", "A clear bio anchors a social-first conversion path."),
      action("Build a focused link-in-bio structure", "Prioritize commissions, products, and contact without adding an unsupported website task.", ScoreCategory.SOCIAL, "No website was supplied, so profile actions are the current conversion surface.", "The recommendation supports social-first sales and inquiries."),
      action("Pin offer, proof, and next-step content", "Create three pinned posts that explain the offer, show authentic proof, and direct viewers to DM or the profile link.", ScoreCategory.BRANDING, "Confirmed social profiles are the primary public presence.", "Pinned content helps new profile visitors understand the business."),
      action("Create a weekly content plan", "Rotate education, proof, offer clarity, and direct action.", ScoreCategory.SOCIAL, "Content direction comes from Business Context, not post-performance data.", "A lightweight plan turns strategy into usable assets."),
      action("Prepare a review-request template", "Ask satisfied commission customers for authentic proof without inventing quotes.", ScoreCategory.REVIEWS, "Current review coverage is limited.", "Real customer proof can strengthen trust."),
    ];
  }
  return [
    action("Make the consultation path prominent", "Use one clear booking action across important pages.", ScoreCategory.WEBSITE, "The observed conversion goal is an introductory consultation.", "Prospects need a clear next step."),
    action("Explain the advisory outcome", "Connect services to a concrete operational result.", ScoreCategory.BRANDING, "Business Context identifies owner-led firms as the audience.", "Specific outcomes improve relevance."),
    action("Publish practical advisory lessons", "Share useful operational guidance on LinkedIn.", ScoreCategory.SOCIAL, "A confirmed LinkedIn profile supports professional education.", "The channel matches the target audience."),
    action("Complete page metadata", "Write the missing description.", ScoreCategory.SEO, "One page is missing a meta description.", "Complete metadata supports search clarity."),
  ];
}

function action(
  title: string,
  description: string,
  category: ScoreCategory,
  evidence: string,
  relevance: string,
  sourceUrl?: string,
) {
  return { title, description, category, evidence, relevance, sourceUrl };
}

function createFindings(
  config: FixtureConfig,
  stress = false,
): AuditReportViewModel["findings"]["all"] {
  if (config.archetype === "cottage_food") {
    const baseUrl = config.initialInput.replace(/\/$/, "");
    return [
      {
        id: "finding-homepage-h1-strength",
        title: "The homepage has a clear main heading",
        description: 'Homepage H1 count: 1. Found H1: "PIE POCKETS".',
        category: ScoreCategory.SEO,
        severity: FindingSeverity.INFO,
        source: "selected_audit" as const,
        sourceUrl: config.initialInput,
        findingType: "VERIFIED_STRENGTH" as const,
        sourceLabel: "Verified strength" as const,
      },
      {
        id: "finding-menu-h1",
        title: "The menu page is missing a main heading",
        description: `Measured H1 count: 0 on ${baseUrl}/menu.`,
        category: ScoreCategory.SEO,
        severity: FindingSeverity.HIGH,
        source: "selected_audit" as const,
        sourceUrl: `${baseUrl}/menu`,
        findingType: "VERIFIED_TECHNICAL_ISSUE" as const,
        sourceLabel: "Verified technical issue" as const,
      },
      {
        id: "finding-ordering-friction",
        title: "The manual order process has several handoffs",
        description:
          "The order page requests details by email, waits for confirmation, and sends payment through a later invoice.",
        category: ScoreCategory.WEBSITE,
        severity: FindingSeverity.MEDIUM,
        source: "selected_audit" as const,
        sourceUrl: `${baseUrl}/order-inquiries`,
        findingType: "AI_REVIEWED_OPPORTUNITY" as const,
        sourceLabel: "AI-reviewed opportunity" as const,
      },
      {
        id: "finding-coverage",
        title: "Six pages completed technical analysis",
        description:
          "The bounded crawl analyzed all six eligible canonical pages discovered within this synthetic crawl scope.",
        category: ScoreCategory.WEBSITE,
        severity: FindingSeverity.INFO,
        source: "selected_audit" as const,
        sourceUrl: null,
        findingType: "COVERAGE_INFORMATION" as const,
        sourceLabel: "Coverage note" as const,
      },
      {
        id: "finding-review-limitation",
        title: "Review performance data is unavailable",
        description:
          "The Google listing is confirmed, but rating and review count are unavailable; reviews and sentiment were not analyzed.",
        category: ScoreCategory.REVIEWS,
        severity: FindingSeverity.HIGH,
        source: "selected_audit" as const,
        sourceUrl: null,
        findingType: "LIMITATION" as const,
        sourceLabel: "Limitation" as const,
      },
    ];
  }

  const base = [
    {
      id: "finding-strength",
      title: "A clear public foundation is present",
      description: `${config.name} has confirmed public profiles and specific Business Context.`,
      category: ScoreCategory.BRANDING,
      severity: FindingSeverity.INFO,
      source: "current_live_state" as const,
    },
    {
      id: "finding-warning",
      title: config.hasWebsite
        ? "One crawled page has no main headline"
        : "The profile conversion path should be clearer",
      description: config.hasWebsite
        ? "The controlled crawl found one page with no H1."
        : "No website was provided; the assessment relies on profile actions, Business Context, goals, and trust evidence.",
      category: config.hasWebsite ? ScoreCategory.SEO : ScoreCategory.SOCIAL,
      severity: FindingSeverity.HIGH,
      source: "selected_audit" as const,
    },
    {
      id: "finding-opportunity",
      title: "The primary conversion path can be more prominent",
      description: config.conversionGoal,
      category: config.hasWebsite ? ScoreCategory.WEBSITE : ScoreCategory.SOCIAL,
      severity: FindingSeverity.MEDIUM,
      source: "selected_audit" as const,
    },
  ];
  if (stress) {
    return Array.from({ length: 20 }, (_, index) => ({
      ...base[index % base.length],
      id: `stress-finding-${index}`,
      title: `${base[index % base.length].title} ${index + 1}`,
      description: `${base[index % base.length].description} ${"Long technical evidence remains measurable and safely wrapped. ".repeat(6)}`,
    }));
  }
  return base;
}

function createCompetitorComparison(date: Date): CompetitorComparisonResult {
  const evidence = {
    label: "Public homepage score",
    businessValue: "78/100",
    competitorValue: "91/100",
    sourceUrls: ["https://schooners.com/", "https://boardwalk.example/"],
  };
  const categoryComparisons: CompetitorComparisonResult["categoryComparisons"] = [
    {
      competitorId: "competitor-fixture",
      competitorName: "Boardwalk Kitchen",
      category: "website",
      businessScore: 78,
      competitorScore: 91,
      businessDisplay: "78/100",
      competitorDisplay: "91/100",
      status: "competitor_stronger",
      observation: "The competitor presents one more prominent primary offer path.",
      evidence: [evidence],
    },
    {
      competitorId: "competitor-fixture",
      competitorName: "Boardwalk Kitchen",
      category: "reviews",
      businessScore: null,
      competitorScore: null,
      businessDisplay: "Not comparable",
      competitorDisplay: "Not comparable",
      status: "not_comparable",
      observation: "Comparable review evidence was unavailable for the competitor.",
      evidence: [],
    },
    {
      competitorId: "competitor-fixture",
      competitorName: "Boardwalk Kitchen",
      category: "social",
      businessScore: 70,
      competitorScore: 70,
      businessDisplay: "2 confirmed",
      competitorDisplay: "2 confirmed / 2 pending",
      status: "similar",
      observation: "Both businesses have two confirmed profiles; additional competitor links remain pending.",
      evidence: [],
    },
  ];
  const competitorEdge = {
    id: "competitor-edge",
    competitorId: "competitor-fixture",
    competitorName: "Boardwalk Kitchen",
    category: "website" as const,
    title: "Clearer public offer path",
    description:
      "Boardwalk Kitchen presents a more prominent publicly observable homepage offer path.",
    confidence: "high" as const,
    evidence: [evidence],
  };
  const opportunity = {
    ...competitorEdge,
    id: "competitor-opportunity",
    title: "Clarify the primary visitor action",
    description:
      "Use the public benchmark to make menu, directions, hours, events, or order actions easier to identify without copying competitor wording.",
  };
  return {
    analyzedCompetitorCount: 1,
    staleCompetitorCount: 0,
    failedCompetitorCount: 0,
    savedButUnanalyzedCount: 0,
    categoryComparisons,
    businessAdvantages: [],
    competitorAdvantages: [competitorEdge],
    parityAreas: [],
    opportunities: [opportunity],
    risks: [],
    evidence: [evidence],
    freshness: [
      {
        competitorId: "competitor-fixture",
        competitorName: "Boardwalk Kitchen",
        snapshotId: "snapshot-fixture",
        status: "current",
        scannedAt: date.toISOString(),
      },
    ],
    limitations: [
      "Private analytics, engagement, posting frequency, and sales were not analyzed.",
    ],
    generatedAt: date.toISOString(),
  };
}

function createCompetitorIntelligence(
  comparison: CompetitorComparisonResult,
): AuditCompetitorIntelligence {
  return {
    snapshotIds: ["snapshot-fixture"],
    competitorNames: ["Boardwalk Kitchen"],
    comparison,
    summary: {
      executiveSummary:
        "The current public benchmark shows a clearer competitor homepage offer path while review evidence remains not comparable.",
      topBusinessAdvantages: [],
      topCompetitorAdvantages: ["Clearer public homepage offer path"],
      topOpportunities: ["Clarify the primary visitor action"],
      recommendedResponses: ["Make current visit and order paths more prominent."],
      questionsToInvestigate: [],
      limitations: comparison.limitations,
      source: "deterministic_fallback",
    },
    generatedAt: comparison.generatedAt,
    limitations: comparison.limitations,
  };
}

function firstAuditComparison(
  auditId: string,
  findings: AuditReportViewModel["findings"]["all"],
  recommendations: AuditReportViewModel["recommendations"]["all"],
): AuditComparison {
  return {
    previousAuditId: null,
    currentAuditId: auditId,
    overallScoreChange: null,
    categoryScoreChanges: [],
    improvedCategories: [],
    declinedCategories: [],
    unchangedCategories: [],
    newFindings: findings,
    resolvedFindings: [],
    newRecommendations: recommendations.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      category: item.category,
      status: item.status,
      completedAt: null,
    })),
    completedRecommendationsSincePrevious: [],
    summary:
      "This is the first audit. Future audits will explain evidence, coverage, and score changes.",
    methodologyChanged: false,
    comparisonNote: null,
  };
}

function buildExecutiveSummary(config: FixtureConfig, score: number) {
  if (!config.hasWebsite) {
    return `${config.name} has a ${score}/100 social-first foundation based on confirmed profiles, Business Context, goals, and trust evidence. Website and SEO were not supplied and did not reduce the score. Start with profile clarity, a focused link-in-bio path, and pinned offer and proof content. Individual post performance was not analyzed.`;
  }
  if (config.archetype === "cottage_food") {
    return `${config.name}'s ${score}/100 assessment is grounded in a six-page technical crawl, confirmed Business Context, one user-confirmed social profile, three publicly detected social links, and a confirmed Google listing with limited review data. The homepage has one verified H1. Start by simplifying the manual preorder inquiry and making that confirmed path more prominent; the menu-only H1 gap and missing page descriptions follow. Social posts and review performance were not analyzed.`;
  }
  return `${config.name} has a ${score}/100 online foundation. Confirmed profiles and clear Business Context are working well. The controlled crawl found one page without an H1 and one missing meta description. Start with the highest-confidence conversion and structure actions; individual social-post performance was not analyzed.`;
}

function expectedOutcome(category: ScoreCategory) {
  const outcomes: Record<ScoreCategory, string> = {
    OVERALL: "A clearer next step.",
    WEBSITE: "Visitors can identify the primary action faster.",
    SEO: "Important pages communicate more clearly to visitors and search engines.",
    SOCIAL: "The profile and content path becomes more focused and actionable.",
    BRANDING: "Public messaging becomes more consistent and recognizable.",
    REVIEWS: "Credible trust evidence appears closer to decisions.",
    COMPETITORS: "The business responds to current public benchmark evidence.",
  };
  return outcomes[category];
}

function categoryLabel(category: ScoreCategory) {
  return category === ScoreCategory.COMPETITORS
    ? "Competitive Position"
    : titleCase(category);
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

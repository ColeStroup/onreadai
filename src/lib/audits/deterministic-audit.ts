import {
  BusinessGoal,
  BusinessProfileStatus,
  FindingSeverity,
  ProfilePlatform,
  type Prisma,
  RecommendationPriority,
  ScoreCategory,
} from "@prisma/client";

import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import type { SeoAnalysis } from "@/lib/analyzers/seo-analyzer";
import type { SocialAnalysis } from "@/lib/analyzers/social-analyzer";
import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { ReviewAnalysis } from "@/lib/analyzers/review-analyzer";
import { getPrimaryCtaAssessment } from "@/lib/analyzers/action-classifier";
import {
  buildAuditAssessment,
  calculateApplicableOverallScore,
  type AuditAssessment,
} from "@/lib/audits/audit-applicability";
import type { ScoreBreakdown } from "@/lib/audits/evidence-contracts";
import { personalizeRecommendations } from "@/lib/goals";
import {
  classifyReportBusiness,
  deterministicSocialRecommendation,
  filterBusinessCompatibleContent,
  publicCompetitorMonitoringCopy,
} from "@/lib/reports/content-compatibility";
import { SCORING_ENGINE_VERSION } from "@/lib/reports/report-freshness";
import {
  isWebsiteSeoCategory,
  isWebsiteSeoReportCategory,
} from "@/lib/product/website-seo-scope";
import {
  buildOverallScoreBreakdown,
  createScoreTrace,
  scoreTraceBreakdown,
  updateScoreTrace,
} from "@/lib/scoring/score-breakdown";

type EffortImpact = "Low" | "Medium" | "High";

export type AuditProfileInput = {
  platform: ProfilePlatform;
  status: BusinessProfileStatus;
  confidenceScore: number;
  url?: string | null;
  handle?: string | null;
};

export type AuditCompetitorInput = {
  name: string;
  websiteUrl?: string | null;
  notes?: string | null;
  profiles?: Array<{
    platform: ProfilePlatform;
    status: BusinessProfileStatus;
    label?: string | null;
  }>;
};

type DeterministicAuditInput = {
  businessName: string;
  initialInput: string;
  profiles: AuditProfileInput[];
  competitors?: AuditCompetitorInput[];
  businessContext?: {
    description?: string | null;
    targetAudience?: string | null;
    mainOffer?: string | null;
    industry?: string | null;
    businessType?: string | null;
    primaryConversionGoal?: string | null;
    brandTone?: string | null;
  } | null;
  websiteAnalysis?: WebsiteAnalysis | null;
  websiteCrawl?: WebsiteCrawlResult | null;
  seoAnalysis?: SeoAnalysis | null;
  socialAnalysis?: SocialAnalysis | null;
  reviewAnalysis?: ReviewAnalysis | null;
  goals?: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
  competitorAnalysisAvailable?: boolean;
  calculatedAt?: string;
};

export type DeterministicAuditScore = {
  category: ScoreCategory;
  platform?: ProfilePlatform;
  label: string;
  score: number;
};

export type DeterministicAuditFinding = {
  id?: string;
  category: ScoreCategory;
  title: string;
  description: string;
  severity: FindingSeverity;
  sourceUrl?: string | null;
  evidence?: Prisma.InputJsonValue;
};

export type DeterministicAuditRecommendation = {
  title: string;
  description: string;
  category: ScoreCategory;
  priority: RecommendationPriority;
  estimatedEffort: EffortImpact;
  expectedImpact: EffortImpact;
  sourceType?: string | null;
  sourceReferenceId?: string | null;
  sourceUrl?: string | null;
  evidence?: Prisma.InputJsonValue;
  issueKey?: string;
};

export type DeterministicAuditResult = {
  overallScore: number;
  summary: string;
  assessment: AuditAssessment;
  scores: DeterministicAuditScore[];
  findings: DeterministicAuditFinding[];
  recommendations: DeterministicAuditRecommendation[];
  suggestedQuestions: string[];
  recentActivity: Array<{ title: string; detail: string }>;
  scoreBreakdowns: ScoreBreakdown[];
};

const socialPlatforms = new Set<ProfilePlatform>([
  ProfilePlatform.INSTAGRAM,
  ProfilePlatform.FACEBOOK,
  ProfilePlatform.TIKTOK,
  ProfilePlatform.YOUTUBE,
  ProfilePlatform.LINKEDIN,
  ProfilePlatform.X,
  ProfilePlatform.PINTEREST,
]);

function getContactCrawlState(websiteCrawl?: WebsiteCrawlResult | null) {
  const scannedContactPages =
    websiteCrawl?.pageResults.filter((page) =>
      page.pageTypes?.includes("Contact"),
    ) ?? [];
  const contactPageScanned = scannedContactPages.length > 0;
  const scannedContactPageHasInfo = scannedContactPages.some(
    (page) => page.hasContactInfo,
  );
  const contactDiscoveredButSkipped = Boolean(
    websiteCrawl?.skippedImportantPages.some((page) => page.type === "Contact"),
  );
  const contactInfoOnScannedPages = Boolean(
    websiteCrawl?.pageResults.some((page) => page.hasContactInfo),
  );
  const contactPageNotDiscovered = Boolean(
    websiteCrawl?.missingImportantPageTypes.includes("Contact"),
  );

  return {
    contactPageScanned,
    scannedContactPageHasInfo,
    contactDiscoveredButSkipped,
    contactInfoOnScannedPages,
    contactPageNotDiscovered,
    shouldRecommendAddingContactPage:
      contactPageNotDiscovered && !contactInfoOnScannedPages,
  };
}

function ctaExamplesForContext(contextText: string) {
  if (
    /\b(restaurant|bar|grill|cafe|coffee|food|dining|menu|venue|brewery|pub|pizza)\b/.test(
      contextText,
    )
  ) {
    const reservations = /\b(reservation|reserve|book a table)\b/.test(
      contextText,
    )
      ? ", Reservations"
      : "";
    return `View Menu, Get Directions, Call Now, Hours, Order Online${reservations}, Events, Gift Cards, or Takeout`;
  }

  if (
    /\b(saas|software|app|platform|free trial|signup|sign up|demo|onboarding)\b/.test(
      contextText,
    )
  ) {
    return "Start Free Trial, Book Demo, Get Started, View Pricing, or Contact Sales";
  }

  if (
    /\b(local|service area|roofing|plumber|hvac|salon|clinic|law|attorney|contractor|repair|appointment|estimate|quote)\b/.test(
      contextText,
    )
  ) {
    return "Get Quote, Call Now, Book Appointment, Schedule Service, or Request Estimate";
  }

  if (
    /\b(ecommerce|e-commerce|shop|store|retail|products)\b/.test(contextText)
  ) {
    return "Shop Now, View Products, Add to Cart, Subscribe, or Buy Now";
  }

  return "Contact, Book, Schedule, Request Quote, Get Started, or Learn More";
}

function seoFixEvidenceDescription(fix: string, analysis: SeoAnalysis) {
  const text = fix.toLowerCase();
  if (text.includes("meta description")) {
    return `Homepage meta description status: ${analysis.metaDescriptionStatus.replaceAll("_", " ")}; measured length: ${analysis.metaDescriptionLength} characters.`;
  }
  if (/\btitle\b/.test(text)) {
    return `Homepage title status: ${analysis.titleStatus.replaceAll("_", " ")}; measured length: ${analysis.titleLength} characters.`;
  }
  if (/\bh1\b|heading/.test(text)) {
    return `Homepage H1 status: ${analysis.h1Status.replaceAll("_", " ")}. This recommendation is supported only by measured H1 evidence.`;
  }
  if (text.includes("canonical")) {
    return `Homepage canonical status: ${analysis.canonicalStatus.replaceAll("_", " ")}.`;
  }
  if (text.includes("robots")) {
    return `robots.txt status: ${analysis.robotsTxtStatus.replaceAll("_", " ")}.`;
  }
  if (text.includes("sitemap")) {
    return `sitemap.xml status: ${analysis.sitemapStatus.replaceAll("_", " ")}.`;
  }
  if (text.includes("viewport")) {
    return `Homepage viewport status: ${analysis.viewportStatus.replaceAll("_", " ")}.`;
  }
  return "The deterministic SEO analyzer identified this fix from the saved homepage or technical SEO checks.";
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function hashOffset(value: string) {
  const hash = value
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);

  return (hash % 9) - 4;
}

function hasProfile(
  profiles: AuditProfileInput[],
  platform: ProfilePlatform,
  status?: BusinessProfileStatus,
) {
  return profiles.some(
    (profile) =>
      profile.platform === platform && (!status || profile.status === status),
  );
}

function countByStatus(
  profiles: AuditProfileInput[],
  status: BusinessProfileStatus,
) {
  return profiles.filter((profile) => profile.status === status).length;
}

function confirmedSocialCount(profiles: AuditProfileInput[]) {
  return profiles.filter(
    (profile) =>
      profile.status === BusinessProfileStatus.CONFIRMED &&
      socialPlatforms.has(profile.platform),
  ).length;
}

function pendingSocialCount(profiles: AuditProfileInput[]) {
  return profiles.filter(
    (profile) =>
      profile.status === BusinessProfileStatus.PENDING &&
      socialPlatforms.has(profile.platform),
  ).length;
}

function platformScore(profile: AuditProfileInput) {
  const statusBonus = {
    [BusinessProfileStatus.CONFIRMED]: 12,
    [BusinessProfileStatus.PENDING]: 0,
    [BusinessProfileStatus.REMOVED]: -18,
  }[profile.status];

  return clampScore(profile.confidenceScore + statusBonus);
}

function businessContextRecommendationWeight({
  recommendation,
  contextText,
}: {
  recommendation: DeterministicAuditRecommendation;
  contextText: string;
}) {
  if (!contextText) {
    return 0;
  }

  const text =
    `${recommendation.title} ${recommendation.description}`.toLowerCase();
  let weight = 0;

  if (
    /\b(lead|signup|sign up|trial|demo|contact|quote|conversion|email|book|schedule|get started)\b/.test(
      contextText,
    ) &&
    (recommendation.category === ScoreCategory.WEBSITE ||
      /\b(cta|call-to-action|contact|signup|sign up|trial|demo|quote|lead|conversion|pricing|get started)\b/.test(
        text,
      ))
  ) {
    weight += 4;
  }

  if (
    /\b(discord|gaming|creator|community|server owner|community manager|youtube|tiktok|reddit)\b/.test(
      contextText,
    ) &&
    (recommendation.category === ScoreCategory.SOCIAL ||
      /\b(content|post|social|tiktok|youtube|shorts|discord|community|creator|reddit)\b/.test(
        text,
      ))
  ) {
    weight += 4;
  }

  if (
    /\b(local|nearby|google business|reviews|restaurant|home service|roofing|plumber|salon)\b/.test(
      contextText,
    ) &&
    (recommendation.category === ScoreCategory.REVIEWS ||
      /\b(review|trust|google business|local|reputation|proof)\b/.test(text))
  ) {
    weight += 4;
  }

  if (
    /\b(saas|software|app|platform|free trial|signup|sign up|demo|onboarding)\b/.test(
      contextText,
    ) &&
    (recommendation.category === ScoreCategory.WEBSITE ||
      recommendation.category === ScoreCategory.SEO ||
      /\b(signup|sign up|trial|demo|pricing|onboarding|product|homepage)\b/.test(
        text,
      ))
  ) {
    weight += 2;
  }

  return weight;
}

function personalizeRecommendationsByBusinessContext(
  recommendations: DeterministicAuditRecommendation[],
  contextText: string,
) {
  if (!contextText) {
    return recommendations;
  }

  const priorityWeight: Record<RecommendationPriority, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };

  return recommendations
    .map((recommendation, index) => {
      const contextWeight = businessContextRecommendationWeight({
        recommendation,
        contextText,
      });

      return {
        ...recommendation,
        priority:
          contextWeight >= 4
            ? RecommendationPriority.HIGH
            : contextWeight > 0 &&
                recommendation.priority === RecommendationPriority.LOW
              ? RecommendationPriority.MEDIUM
              : recommendation.priority,
        contextWeight,
        originalIndex: index,
      };
    })
    .sort(
      (a, b) =>
        b.contextWeight - a.contextWeight ||
        priorityWeight[a.priority] - priorityWeight[b.priority] ||
        a.originalIndex - b.originalIndex,
    )
    .map((recommendation) => ({
      title: recommendation.title,
      description: recommendation.description,
      category: recommendation.category,
      priority: recommendation.priority,
      estimatedEffort: recommendation.estimatedEffort,
      expectedImpact: recommendation.expectedImpact,
    }));
}

export function generateDeterministicAudit(
  input: DeterministicAuditInput,
): DeterministicAuditResult {
  const websiteAnalysis = input.websiteAnalysis;
  const websiteCrawl = input.websiteCrawl;
  const seoAnalysis = input.seoAnalysis;
  const socialAnalysis = input.socialAnalysis;
  const reviewAnalysis = input.reviewAnalysis;
  const competitors = input.competitors ?? [];
  const competitorNames = competitors.map((competitor) => competitor.name);
  const competitorCount = competitors.length;
  const competitorProfiles = competitors.flatMap(
    (competitor) => competitor.profiles ?? [],
  );
  const confirmedCompetitorProfileCount = competitorProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  ).length;
  const pendingCompetitorProfileCount = competitorProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.PENDING,
  ).length;
  const competitorsWithConfirmedProfiles = competitors.filter((competitor) =>
    competitor.profiles?.some(
      (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
    ),
  ).length;
  const confirmedCompetitorPlatforms = [
    ...new Set(
      competitorProfiles
        .filter((profile) => profile.status === BusinessProfileStatus.CONFIRMED)
        .map((profile) => profile.label ?? profile.platform.toLowerCase()),
    ),
  ];
  const offset = hashOffset(`${input.businessName}:${input.initialInput}`);
  const contextText = [
    input.businessContext?.description,
    input.businessContext?.targetAudience,
    input.businessContext?.mainOffer,
    input.businessContext?.industry,
    input.businessContext?.businessType,
    input.businessContext?.primaryConversionGoal,
    input.businessContext?.brandTone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const compatibilityContext = {
    name: input.businessName,
    ...input.businessContext,
  };
  const businessArchetype = classifyReportBusiness(compatibilityContext);
  const isCreatorCommunityContext = businessArchetype === "creator_community";
  const isLocalBusinessContext =
    businessArchetype === "local_service" ||
    businessArchetype === "restaurant_hospitality";
  const isSaasContext = businessArchetype === "saas_software";
  const isLeadOrSignupContext =
    /\b(lead|signup|sign up|trial|demo|contact|quote|conversion|email|book|schedule|get started)\b/.test(
      contextText,
    );
  const contactCrawlState = getContactCrawlState(websiteCrawl);
  const ctaExamples = ctaExamplesForContext(contextText);
  const primaryWebsiteActions =
    websiteAnalysis?.actionSummary?.detectedActionTypes ??
    websiteAnalysis?.actionSummary?.primaryActions ??
    websiteAnalysis?.ctaCandidates ??
    [];
  const primaryCtaAssessment = websiteAnalysis
    ? getPrimaryCtaAssessment(websiteAnalysis.actionSummary)
    : null;
  const primaryCtaNeedsAttention =
    primaryCtaAssessment?.clarity === "NEEDS_IMPROVEMENT" ||
    primaryCtaAssessment?.clarity === "UNCERTAIN";
  const homepageCrawlPage = websiteCrawl?.pageResults.find(
    (page) =>
      page.analysisStatus !== "FAILED" && page.pageTypes.includes("Homepage"),
  );
  const homepageContactEvidence =
    homepageCrawlPage?.contactEvidence ?? websiteAnalysis?.contactEvidence;
  const homepageHasUsableContactPath = homepageContactEvidence
    ? homepageContactEvidence.hasAnyContactPath
    : Boolean(websiteAnalysis?.hasContactLink);
  const brokenHomepageContactPathEvidenceIds =
    homepageContactEvidence?.brokenContactPathEvidenceIds ?? [];
  const confirmedCount = countByStatus(
    input.profiles,
    BusinessProfileStatus.CONFIRMED,
  );
  const pendingCount = countByStatus(
    input.profiles,
    BusinessProfileStatus.PENDING,
  );
  const websiteConfirmed = input.profiles.some(
    (profile) =>
      profile.platform === ProfilePlatform.WEBSITE &&
      profile.status === BusinessProfileStatus.CONFIRMED &&
      Boolean(profile.url?.trim()),
  );
  const assessment = buildAuditAssessment({
    profiles: input.profiles,
    hasWebsite: websiteConfirmed,
    competitorComparisonAvailable:
      input.competitorAnalysisAvailable ?? competitorCount > 0,
  });
  const socialFirst = assessment.mode === "social_first";
  const googleConfirmed = hasProfile(
    input.profiles,
    ProfilePlatform.GOOGLE_BUSINESS,
    BusinessProfileStatus.CONFIRMED,
  );
  const instagramPending = hasProfile(
    input.profiles,
    ProfilePlatform.INSTAGRAM,
    BusinessProfileStatus.PENDING,
  );
  const socialConfirmed = confirmedSocialCount(input.profiles);
  const socialPending = pendingSocialCount(input.profiles);

  let websiteScore = websiteAnalysis ? clampScore(websiteAnalysis.score) : 0;
  let seoScore = seoAnalysis ? clampScore(seoAnalysis.score) : 0;
  let socialScore = clampScore(
    48 + socialConfirmed * 9 + socialPending * 3 + offset,
  );
  let brandingScore = clampScore(
    60 + confirmedCount * 5 + pendingCount + offset,
  );
  const websiteTrace = createScoreTrace({
    category: ScoreCategory.WEBSITE,
    score: websiteScore,
    key: "website:homepage-analysis",
    label: "Homepage website analysis",
    value: websiteAnalysis?.score ?? null,
    explanation:
      "The website score starts with measured homepage structure, content, accessibility, and conversion-path signals.",
  });
  const seoTrace = createScoreTrace({
    category: ScoreCategory.SEO,
    score: seoScore,
    key: "seo:homepage-analysis",
    label: "Homepage SEO analysis",
    value: seoAnalysis?.score ?? null,
    explanation:
      "The SEO score starts with measured title, description, heading, canonical, viewport, robots.txt, and sitemap signals.",
  });
  const socialTrace = createScoreTrace({
    category: ScoreCategory.SOCIAL,
    score: socialScore,
    key: "social:profile-coverage",
    label: "Social profile coverage",
    value: `${socialConfirmed} confirmed; ${socialPending} pending`,
    explanation:
      "Confirmed profiles contribute more than pending discoveries; removed profiles are excluded.",
  });
  const brandingTrace = createScoreTrace({
    category: ScoreCategory.BRANDING,
    score: brandingScore,
    key: "branding:presence-baseline",
    label: "Brand consistency baseline",
    value: `${confirmedCount} confirmed; ${pendingCount} pending`,
    explanation:
      "The baseline reflects confirmed and pending public-presence records.",
  });

  if (socialFirst) {
    const contextSignals = [
      input.businessContext?.description,
      input.businessContext?.targetAudience,
      input.businessContext?.mainOffer,
      input.businessContext?.primaryConversionGoal,
      input.businessContext?.brandTone,
    ].filter(Boolean).length;

    brandingScore = updateScoreTrace(brandingTrace, {
      score: clampScore(
        52 +
          socialConfirmed * 8 +
          Math.min(12, contextSignals * 2) -
          Math.min(6, socialPending * 2) +
          offset,
      ),
      key: "branding:social-first-context",
      label: "Social-first context coverage",
      value: contextSignals,
      explanation:
        "For a social-first assessment, confirmed profiles and completed Business Context replace website-derived branding signals.",
    });
  }

  if (websiteAnalysis) {
    websiteScore = updateScoreTrace(websiteTrace, {
      score: clampScore(websiteAnalysis.score),
      key: "website:homepage-evidence",
      label: "Homepage evidence",
      value: websiteAnalysis.score,
      explanation:
        "The deterministic homepage analyzer contributes title, metadata, H1, accessibility, action-link coverage, contact, and structural checks.",
    });
    seoScore = updateScoreTrace(seoTrace, {
      score: seoAnalysis ? clampScore(seoAnalysis.score) : seoScore,
      key: "seo:homepage-signals",
      label: "Homepage SEO signals",
      value: `title ${Boolean(websiteAnalysis.pageTitle)}; meta ${Boolean(websiteAnalysis.metaDescription)}; H1 ${websiteAnalysis.h1Count}; canonical ${websiteAnalysis.hasCanonical}`,
      explanation:
        "This adjustment uses only measured homepage title, meta description, H1, canonical, viewport, and image-alt signals.",
    });
    brandingScore = updateScoreTrace(brandingTrace, {
      score: clampScore(
        brandingScore +
          (websiteAnalysis.hasSocialLinks ? 4 : -2) +
          (websiteAnalysis.ctaCandidates.length > 0 ? 3 : -4),
      ),
      key: "branding:homepage-presence-links",
      label: "Homepage presence links",
      value: `${websiteAnalysis.detectedSocialLinks.length} social; ${websiteAnalysis.ctaCandidates.length} action types`,
      explanation:
        "This is a link-coverage signal only. Detected action links do not prove that one primary CTA is clear.",
    });
  }
  if (websiteCrawl && websiteCrawl.successfulPages > 0) {
    const h1IssuePages =
      websiteCrawl.pagesWithNoH1 + websiteCrawl.pagesWithMultipleH1;
    const analyzedPages = Math.max(1, websiteCrawl.successfulPages);
    const multiPageSeoScore = clampScore(
      100 -
        (websiteCrawl.pagesMissingTitle / analyzedPages) * 25 -
        (websiteCrawl.pagesMissingMetaDescription / analyzedPages) * 25 -
        (h1IssuePages / analyzedPages) * 25,
    );

    websiteScore = updateScoreTrace(websiteTrace, {
      score: clampScore(
        websiteScore * 0.35 + websiteCrawl.averagePageScore * 0.65,
      ),
      key: "website:multi-page-crawl",
      label: "Multi-page website coverage",
      value: `${websiteCrawl.successfulPages} successful pages`,
      explanation:
        "The crawl contributes average page quality, action-link coverage, and verified contact-path coverage. Action-link coverage is separate from CTA clarity.",
    });
    seoScore = updateScoreTrace(seoTrace, {
      score: clampScore(seoScore * 0.45 + multiPageSeoScore * 0.55),
      key: "seo:multi-page-crawl",
      label: "Multi-page SEO coverage",
      value: `${websiteCrawl.pagesMissingTitle} missing titles; ${websiteCrawl.pagesMissingMetaDescription} missing meta descriptions; ${h1IssuePages} H1 issue pages`,
      explanation:
        "The adjustment uses measured page-level title, meta-description, and H1 issue counts.",
    });
    brandingScore = updateScoreTrace(brandingTrace, {
      score: clampScore(
        brandingScore +
          (websiteCrawl.importantPagesFound.length >= 3 ? 3 : -2) -
          Math.min(5, websiteCrawl.pagesWithNoCTA),
      ),
      key: "branding:important-page-coverage",
      label: "Important-page coverage",
      value: websiteCrawl.importantPagesFound.length,
      explanation:
        "Important-page and customer-action-link coverage contribute to public brand completeness.",
    });
  }
  if (seoAnalysis) {
    seoScore = updateScoreTrace(seoTrace, {
      score: websiteCrawl?.successfulPages
        ? seoScore
        : clampScore(seoAnalysis.score),
      key: "seo:technical-analysis",
      label: "Technical SEO analysis",
      value: seoAnalysis.score,
      explanation:
        "The deterministic SEO analyzer contributes homepage metadata, canonical, viewport, robots.txt, and sitemap.xml checks.",
    });
  }
  if (socialAnalysis) {
    socialScore = updateScoreTrace(socialTrace, {
      score: clampScore((socialScore + socialAnalysis.score * 2) / 3),
      key: "social:analyzer-result",
      label: "Social coverage analysis",
      value: socialAnalysis.score,
      explanation:
        "The social analyzer uses profile confirmation, platform coverage, selected goals, and public competitor profile coverage. It does not analyze post performance.",
    });
    brandingScore = updateScoreTrace(brandingTrace, {
      score: clampScore(
        brandingScore +
          (socialAnalysis.platformCoverageLevel === "strong"
            ? 5
            : socialAnalysis.platformCoverageLevel === "moderate"
              ? 3
              : socialAnalysis.platformCoverageLevel === "none"
                ? -4
                : 0) -
          Math.min(6, socialAnalysis.pendingProfilesCount),
      ),
      key: "branding:social-coverage",
      label: "Cross-profile coverage",
      value: socialAnalysis.platformCoverageLevel,
      explanation:
        "Confirmed platform coverage supports consistency; pending profiles reduce confidence until reviewed.",
    });
  }
  let reviewsScore = reviewAnalysis
    ? clampScore(reviewAnalysis.score)
    : clampScore(
        (googleConfirmed
          ? 54
          : hasProfile(input.profiles, ProfilePlatform.GOOGLE_BUSINESS)
            ? 46
            : 36) + Math.min(3, confirmedCount),
      );
  const reviewsTrace = createScoreTrace({
    category: ScoreCategory.REVIEWS,
    score: reviewsScore,
    key: "reviews:presence-baseline",
    label: "Review presence baseline",
    value: googleConfirmed,
    explanation:
      "This is a limited listing-presence baseline. It does not represent review performance unless rating and review-count requirements are met.",
  });
  if (reviewAnalysis) {
    reviewsScore = updateScoreTrace(reviewsTrace, {
      score: clampScore(reviewAnalysis.score),
      key: "reviews:analyzer-result",
      label: "Review and trust analysis",
      value: reviewAnalysis.score,
      explanation: reviewAnalysis.reviewScoreExplanation,
    });
    brandingScore = updateScoreTrace(brandingTrace, {
      score: clampScore(
        brandingScore +
          (reviewAnalysis.googleBusinessStatus === "confirmed"
            ? 4
            : reviewAnalysis.googleBusinessStatus === "pending"
              ? 1
              : -4) -
          Math.min(4, reviewAnalysis.trustWarnings.length),
      ),
      key: "branding:trust-signals",
      label: "Trust-signal coverage",
      value: reviewAnalysis.googleBusinessStatus,
      explanation:
        "Confirmed local trust presence contributes to branding; analyzer warnings identify incomplete trust coverage.",
    });
  }
  const competitorsScore = clampScore(
    competitorCount > 0
      ? 52 +
          Math.min(competitorCount, 5) * 7 +
          Math.min(20, confirmedCompetitorProfileCount * 3) -
          Math.min(10, pendingCompetitorProfileCount) +
          offset
      : 34 + Math.min(confirmedCount, 4) * 2,
  );
  const competitorsTrace = createScoreTrace({
    category: ScoreCategory.COMPETITORS,
    score: competitorsScore,
    key: "competitors:comparable-public-coverage",
    label: "Comparable competitor coverage",
    value: `${competitorCount} saved; ${confirmedCompetitorProfileCount} confirmed public profiles; ${pendingCompetitorProfileCount} pending`,
    explanation: assessment.applicableCategories.includes(
      ScoreCategory.COMPETITORS,
    )
      ? "The score uses saved competitor count and explicit confirmed or pending public-profile coverage. Subjective positioning has bounded influence in the separate comparison engine."
      : "No usable competitor snapshot was available, so this provisional value is excluded from the overall score.",
  });
  const overallScore = clampScore(
    calculateApplicableOverallScore(
      {
        [ScoreCategory.WEBSITE]: websiteScore,
        [ScoreCategory.SEO]: seoScore,
        [ScoreCategory.SOCIAL]: socialScore,
        [ScoreCategory.BRANDING]: brandingScore,
        [ScoreCategory.REVIEWS]: reviewsScore,
        [ScoreCategory.COMPETITORS]: competitorsScore,
      },
      assessment,
    ),
  );
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();
  const scoreBreakdowns: ScoreBreakdown[] = [
    buildOverallScoreBreakdown({
      categoryScores: {
        [ScoreCategory.WEBSITE]: websiteScore,
        [ScoreCategory.SEO]: seoScore,
        [ScoreCategory.SOCIAL]: socialScore,
        [ScoreCategory.BRANDING]: brandingScore,
        [ScoreCategory.REVIEWS]: reviewsScore,
        [ScoreCategory.COMPETITORS]: competitorsScore,
      },
      assessment,
      overallScore,
      engineVersion: SCORING_ENGINE_VERSION,
      calculatedAt,
    }),
    scoreTraceBreakdown({
      trace: websiteTrace,
      applicable: assessment.applicableCategories.includes(
        ScoreCategory.WEBSITE,
      ),
      engineVersion: SCORING_ENGINE_VERSION,
      calculatedAt,
    }),
    scoreTraceBreakdown({
      trace: seoTrace,
      applicable: assessment.applicableCategories.includes(ScoreCategory.SEO),
      engineVersion: SCORING_ENGINE_VERSION,
      calculatedAt,
    }),
    scoreTraceBreakdown({
      trace: socialTrace,
      applicable: true,
      engineVersion: SCORING_ENGINE_VERSION,
      calculatedAt,
    }),
    scoreTraceBreakdown({
      trace: brandingTrace,
      applicable: true,
      engineVersion: SCORING_ENGINE_VERSION,
      calculatedAt,
    }),
    scoreTraceBreakdown({
      trace: reviewsTrace,
      applicable: true,
      engineVersion: SCORING_ENGINE_VERSION,
      calculatedAt,
    }),
    scoreTraceBreakdown({
      trace: competitorsTrace,
      applicable: assessment.applicableCategories.includes(
        ScoreCategory.COMPETITORS,
      ),
      engineVersion: SCORING_ENGINE_VERSION,
      calculatedAt,
    }),
  ];

  const platformScores = new Map<ProfilePlatform, DeterministicAuditScore>();

  for (const profile of input.profiles) {
    if (profile.status === BusinessProfileStatus.REMOVED) {
      continue;
    }

    if (profile.platform === ProfilePlatform.WEBSITE && socialFirst) {
      continue;
    }

    const score = platformScore(profile);
    const existing = platformScores.get(profile.platform);

    if (existing && existing.score >= score) {
      continue;
    }

    platformScores.set(profile.platform, {
      category: socialPlatforms.has(profile.platform)
        ? ScoreCategory.SOCIAL
        : profile.platform === ProfilePlatform.WEBSITE
          ? ScoreCategory.WEBSITE
          : ScoreCategory.BRANDING,
      platform: profile.platform,
      label: profile.platform.replaceAll("_", " ").toLowerCase(),
      score,
    });
  }

  const scores: DeterministicAuditScore[] = [
    { category: ScoreCategory.OVERALL, label: "Overall", score: overallScore },
    ...(websiteConfirmed
      ? [
          {
            category: ScoreCategory.WEBSITE,
            label: "Website",
            score: websiteScore,
          },
        ]
      : []),
    { category: ScoreCategory.SOCIAL, label: "Social", score: socialScore },
    ...(websiteConfirmed
      ? [{ category: ScoreCategory.SEO, label: "SEO", score: seoScore }]
      : []),
    {
      category: ScoreCategory.BRANDING,
      label: "Branding",
      score: brandingScore,
    },
    { category: ScoreCategory.REVIEWS, label: "Reviews", score: reviewsScore },
    ...(assessment.applicableCategories.includes(ScoreCategory.COMPETITORS)
      ? [
          {
            category: ScoreCategory.COMPETITORS,
            label: "Competitors",
            score: competitorsScore,
          },
        ]
      : []),
    ...platformScores.values(),
  ];

  const websiteAnalysisFindings: DeterministicAuditFinding[] = websiteAnalysis
    ? [
        ...(websiteAnalysis.warnings.length > 0
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title: "Website analysis completed with warnings.",
                description: `Homepage analyzed at ${websiteAnalysis.normalizedUrl}. Warnings: ${websiteAnalysis.warnings.join(
                  " ",
                )}`,
                severity: FindingSeverity.MEDIUM,
                evidence: {
                  normalizedUrl: websiteAnalysis.normalizedUrl,
                  warnings: websiteAnalysis.warnings,
                },
              },
            ]
          : []),
        ...(!websiteAnalysis.metaDescription
          ? [
              {
                category: ScoreCategory.SEO,
                title: "Homepage is missing a meta description.",
                description:
                  "The homepage is missing a meta description, which makes search snippets and share previews less predictable.",
                severity: FindingSeverity.HIGH,
                sourceUrl: websiteAnalysis.normalizedUrl,
                evidence: {
                  normalizedUrl: websiteAnalysis.normalizedUrl,
                  metaDescription: websiteAnalysis.metaDescription,
                  metaDescriptionLength: 0,
                  issueKey: "homepage:meta-description:missing",
                },
              },
            ]
          : []),
        ...(websiteAnalysis.h1Count === 0
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title: "Homepage has no H1 heading.",
                description:
                  "Detected 0 H1 headings. A clear H1 helps visitors and search engines understand the page.",
                severity: FindingSeverity.HIGH,
                sourceUrl: websiteAnalysis.normalizedUrl,
                evidence: {
                  normalizedUrl: websiteAnalysis.normalizedUrl,
                  h1Count: websiteAnalysis.h1Count,
                  h1Text: websiteAnalysis.h1Text,
                  issueKey: "sitewide:h1:missing",
                },
              },
            ]
          : []),
        ...(websiteAnalysis.h1Count > 1
          ? [
              {
                category: ScoreCategory.SEO,
                title: "Homepage has multiple H1 headings.",
                description: `Detected ${websiteAnalysis.h1Count} H1 headings. Found H1 text: ${websiteAnalysis.h1Text.join(
                  " | ",
                )}.`,
                severity: FindingSeverity.MEDIUM,
                sourceUrl: websiteAnalysis.normalizedUrl,
                evidence: {
                  normalizedUrl: websiteAnalysis.normalizedUrl,
                  h1Count: websiteAnalysis.h1Count,
                  h1Text: websiteAnalysis.h1Text,
                  issueKey: "sitewide:h1:multiple",
                },
              },
            ]
          : []),
        ...(websiteAnalysis.h1Count === 1
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title: "Homepage has a clear primary H1.",
                description: `Found H1: '${websiteAnalysis.h1Text.at(0) ?? ""}'.`,
                severity: FindingSeverity.INFO,
                sourceUrl: websiteAnalysis.normalizedUrl,
                evidence: {
                  normalizedUrl: websiteAnalysis.normalizedUrl,
                  h1Count: websiteAnalysis.h1Count,
                  h1Text: websiteAnalysis.h1Text,
                  findingType: "VERIFIED_STRENGTH",
                },
              },
            ]
          : []),
        ...(websiteAnalysis.imagesMissingAltCount > 0
          ? [
              {
                category: ScoreCategory.SEO,
                title: "Some homepage images are missing alt text.",
                description: `Found ${websiteAnalysis.imageCount} images, ${websiteAnalysis.imagesMissingAltCount} missing alt text.`,
                severity:
                  websiteAnalysis.imagesMissingAltCount >
                  websiteAnalysis.imageCount / 2
                    ? FindingSeverity.MEDIUM
                    : FindingSeverity.LOW,
                evidence: {
                  normalizedUrl: websiteAnalysis.normalizedUrl,
                  imageCount: websiteAnalysis.imageCount,
                  imagesMissingAltCount: websiteAnalysis.imagesMissingAltCount,
                },
              },
            ]
          : []),
        ...(primaryCtaNeedsAttention
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title: "Homepage primary CTA clarity needs attention.",
                description:
                  primaryCtaAssessment?.evidence.join(" ") ??
                  `Static HTML did not provide enough evidence to verify one clear primary CTA. Detected action types: ${primaryWebsiteActions.join(", ") || "none"}.`,
                severity: FindingSeverity.MEDIUM,
                sourceUrl: websiteAnalysis.normalizedUrl,
                evidence: {
                  normalizedUrl: websiteAnalysis.normalizedUrl,
                  detectedActionTypes: primaryWebsiteActions,
                  primaryCtaAssessment,
                  issueKey: "homepage:primary-cta:unclear",
                },
              },
            ]
          : []),
        ...(!homepageHasUsableContactPath &&
        brokenHomepageContactPathEvidenceIds.length === 0
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title: "Visitors may not have a clear way to contact the business.",
                description:
                  "The analyzed homepage did not show a usable contact, email, phone, order, booking, quote, purchase, application, or chat path.",
                severity: FindingSeverity.MEDIUM,
                sourceUrl: websiteAnalysis.normalizedUrl,
                evidence: {
                  normalizedUrl: websiteAnalysis.normalizedUrl,
                  hasContactLink: websiteAnalysis.hasContactLink,
                  contactEvidence: homepageContactEvidence ?? null,
                  issueKey: "website:contact-path:missing",
                },
              },
            ]
          : []),
        ...(brokenHomepageContactPathEvidenceIds.length > 0 &&
        !homepageHasUsableContactPath
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title: "A contact or order path did not load during the crawl.",
                description:
                  "The homepage includes a business action, but its destination page failed to load during this audit. This is different from having no contact path.",
                severity: FindingSeverity.HIGH,
                sourceUrl: websiteAnalysis.normalizedUrl,
                evidence: {
                  normalizedUrl: websiteAnalysis.normalizedUrl,
                  brokenInteractionEvidenceIds:
                    brokenHomepageContactPathEvidenceIds,
                  issueKey: "website:contact-path:broken-destination",
                },
              },
            ]
          : []),
        ...(websiteAnalysis.hasSocialLinks
          ? [
              {
                category: ScoreCategory.BRANDING,
                title: "Homepage links to social profiles.",
                description: `Detected social links: ${websiteAnalysis.detectedSocialLinks.join(
                  ", ",
                )}.`,
                severity: FindingSeverity.INFO,
                sourceUrl: websiteAnalysis.normalizedUrl,
                evidence: {
                  normalizedUrl: websiteAnalysis.normalizedUrl,
                  detectedSocialLinks: websiteAnalysis.detectedSocialLinks,
                  findingType: "VERIFIED_STRENGTH",
                },
              },
            ]
          : []),
      ]
    : [];
  const websiteCrawlFindings: DeterministicAuditFinding[] = websiteCrawl
    ? [
        {
          category: ScoreCategory.WEBSITE,
          title: `Scanned ${websiteCrawl.pagesScanned} website page${
            websiteCrawl.pagesScanned === 1 ? "" : "s"
          }.`,
          description: `${websiteCrawl.successfulPages} page${
            websiteCrawl.successfulPages === 1 ? "" : "s"
          } loaded successfully. Found important pages: ${
            websiteCrawl.importantPagesFound.join(", ") || "none"
          }. Crawl limit: ${websiteCrawl.crawlLimitUsed} page${
            websiteCrawl.crawlLimitUsed === 1 ? "" : "s"
          }${websiteCrawl.crawlLimitReached ? " and the limit was reached" : ""}.`,
          severity:
            websiteCrawl.successfulPages > 1
              ? FindingSeverity.INFO
              : FindingSeverity.LOW,
          evidence: {
            pagesScanned: websiteCrawl.pagesScanned,
            successfulPages: websiteCrawl.successfulPages,
            failedPages: websiteCrawl.failedPages,
            averagePageScore: websiteCrawl.averagePageScore,
            importantPagesFound: websiteCrawl.importantPagesFound,
            discoveredImportantPages: websiteCrawl.discoveredImportantPages,
            skippedImportantPages: websiteCrawl.skippedImportantPages,
            duplicateUrlsSkipped: websiteCrawl.duplicateUrlsSkipped,
            crawlLimitUsed: websiteCrawl.crawlLimitUsed,
            crawlLimitReached: websiteCrawl.crawlLimitReached,
            findingType: "COVERAGE_INFORMATION",
          },
        },
        ...(websiteCrawl.pagesMissingMetaDescription > 0
          ? [
              {
                category: ScoreCategory.SEO,
                title: "Multiple pages are missing meta descriptions.",
                description: `Scanned ${websiteCrawl.pagesScanned} pages. ${websiteCrawl.pagesMissingMetaDescription} page${
                  websiteCrawl.pagesMissingMetaDescription === 1
                    ? " is"
                    : "s are"
                } missing meta descriptions.`,
                severity:
                  websiteCrawl.pagesMissingMetaDescription >=
                  Math.max(2, Math.ceil(websiteCrawl.successfulPages / 2))
                    ? FindingSeverity.HIGH
                    : FindingSeverity.MEDIUM,
                evidence: {
                  pagesMissingMetaDescription:
                    websiteCrawl.pagesMissingMetaDescription,
                  affectedPages: websiteCrawl.pageResults
                    .filter((page) => !page.metaDescription)
                    .map((page) => page.url),
                  issueKey: "sitewide:meta-description:missing",
                },
              },
            ]
          : []),
        ...(websiteCrawl.pagesWithNoH1 > 0
          ? [
              {
                category: ScoreCategory.SEO,
                title: "Some pages have no H1 heading.",
                description: `${websiteCrawl.pagesWithNoH1} scanned page${
                  websiteCrawl.pagesWithNoH1 === 1 ? " has" : "s have"
                } no H1 heading.`,
                severity: FindingSeverity.MEDIUM,
                evidence: {
                  pagesWithNoH1: websiteCrawl.pagesWithNoH1,
                  affectedPages: websiteCrawl.pageResults
                    .filter((page) => page.h1Count === 0)
                    .map((page) => page.url),
                  issueKey: "sitewide:h1:missing",
                },
              },
            ]
          : []),
        ...(websiteCrawl.pagesWithMultipleH1 > 0
          ? [
              {
                category: ScoreCategory.SEO,
                title: "Some pages have multiple H1 headings.",
                description: `${websiteCrawl.pagesWithMultipleH1} scanned page${
                  websiteCrawl.pagesWithMultipleH1 === 1 ? " has" : "s have"
                } multiple H1 headings.`,
                severity: FindingSeverity.LOW,
                evidence: {
                  pagesWithMultipleH1: websiteCrawl.pagesWithMultipleH1,
                  affectedPages: websiteCrawl.pageResults
                    .filter((page) => page.h1Count > 1)
                    .map((page) => page.url),
                  issueKey: "sitewide:h1:multiple",
                },
              },
            ]
          : []),
        ...(websiteCrawl.pagesWithNoCTA > 0
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title: "Some pages have no detected customer action link.",
                description: `${websiteCrawl.pagesWithNoCTA} scanned page${
                  websiteCrawl.pagesWithNoCTA === 1 ? " has" : "s have"
                } no detected customer action link or button. The link check used context-aware phrases such as ${ctaExamples}; it does not assess visual CTA prominence.`,
                severity:
                  websiteCrawl.pagesWithNoCTA >=
                  Math.max(2, Math.ceil(websiteCrawl.successfulPages / 2))
                    ? FindingSeverity.MEDIUM
                    : FindingSeverity.LOW,
                evidence: {
                  pagesWithNoCTA: websiteCrawl.pagesWithNoCTA,
                  ctaExamples,
                  affectedPages: websiteCrawl.pageResults
                    .filter((page) => page.ctaCandidates.length === 0)
                    .map((page) => page.url),
                },
              },
            ]
          : []),
        ...(contactCrawlState.scannedContactPageHasInfo
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title:
                  "Contact information was verified on a scanned contact page.",
                description:
                  "A contact page was included in the crawl and contained contact signals such as a phone number, email, or address-like text.",
                severity: FindingSeverity.INFO,
                evidence: {
                  contactPages: websiteCrawl.pageResults
                    .filter((page) => page.pageTypes?.includes("Contact"))
                    .map((page) => ({
                      url: page.url,
                      contactSignals: page.contactSignals,
                    })),
                },
              },
            ]
          : []),
        ...(contactCrawlState.contactDiscoveredButSkipped
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title: "Contact page was discovered but not scanned.",
                description: `The crawler found a likely contact page, but it was not included in the ${websiteCrawl.crawlLimitUsed}-page crawl limit. Verify that page before treating contact details as missing.`,
                severity: FindingSeverity.INFO,
                evidence: {
                  skippedImportantPages: websiteCrawl.skippedImportantPages,
                  crawlLimitUsed: websiteCrawl.crawlLimitUsed,
                  crawlLimitReached: websiteCrawl.crawlLimitReached,
                },
              },
            ]
          : []),
        ...(contactCrawlState.contactPageNotDiscovered &&
        contactCrawlState.contactInfoOnScannedPages
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title:
                  "Contact info appears on scanned pages, but no dedicated contact page was detected.",
                description:
                  "The crawl found contact signals on scanned pages, but did not discover a clear internal URL that looks like a dedicated contact page.",
                severity: FindingSeverity.LOW,
                evidence: {
                  contactSignals: websiteCrawl.pageResults
                    .filter((page) => page.hasContactInfo)
                    .map((page) => ({
                      url: page.url,
                      contactSignals: page.contactSignals,
                    })),
                  missingImportantPageTypes:
                    websiteCrawl.missingImportantPageTypes,
                },
              },
            ]
          : []),
        ...(contactCrawlState.shouldRecommendAddingContactPage
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title:
                  "No clear contact page or contact information was found in scanned pages.",
                description:
                  "The crawl did not discover a clear contact page and did not detect phone, email, or address-like contact signals on the pages it scanned.",
                severity: FindingSeverity.MEDIUM,
                evidence: {
                  importantPagesFound: websiteCrawl.importantPagesFound,
                  missingImportantPageTypes:
                    websiteCrawl.missingImportantPageTypes,
                  crawlLimitUsed: websiteCrawl.crawlLimitUsed,
                  crawlLimitReached: websiteCrawl.crawlLimitReached,
                },
              },
            ]
          : []),
        ...((websiteCrawl.thinPages?.length ?? 0) > 0
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title: "Some public pages contain little unique content.",
                description: `${websiteCrawl.thinPages!.length} page${
                  websiteCrawl.thinPages!.length === 1 ? " is" : "s are"
                } thin or nearly empty after navigation and template content were removed.`,
                severity: FindingSeverity.MEDIUM,
                evidence: {
                  issueKey: "website:content:thin",
                  affectedPages: websiteCrawl.thinPages!.map(
                    (page) => page.url,
                  ),
                  pages: websiteCrawl.thinPages,
                },
              },
            ]
          : []),
        ...((websiteCrawl.duplicateContentGroups?.length ?? 0) > 0
          ? [
              {
                category: ScoreCategory.SEO,
                title: "Near-duplicate page content was detected.",
                description: `${websiteCrawl.duplicateContentGroups!.length} group${
                  websiteCrawl.duplicateContentGroups!.length === 1
                    ? " was"
                    : "s were"
                } identified from extracted main-content similarity.`,
                severity: FindingSeverity.MEDIUM,
                evidence: {
                  issueKey: "website:content:duplicate",
                  groups: websiteCrawl.duplicateContentGroups,
                  affectedPages: websiteCrawl.duplicateContentGroups!.flatMap(
                    (group) => group.urls,
                  ),
                },
              },
            ]
          : []),
        ...((websiteCrawl.copyQualityFindings?.length ?? 0) > 0
          ? [
              {
                category: ScoreCategory.BRANDING,
                title: "Visible copy errors may reduce professionalism.",
                description: `${websiteCrawl.copyQualityFindings!.length} high-confidence copy issue${
                  websiteCrawl.copyQualityFindings!.length === 1
                    ? " was"
                    : "s were"
                } found across customer-facing pages. Intentional brand and product language is excluded from this check.`,
                severity: FindingSeverity.MEDIUM,
                evidence: {
                  issueKey: "website:copy:professionalism",
                  issues: websiteCrawl.copyQualityFindings,
                  affectedPages: websiteCrawl.copyQualityFindings!.map(
                    (issue) => issue.url,
                  ),
                },
              },
            ]
          : []),
        ...((websiteCrawl.orderingFrictionPages?.length ?? 0) > 0
          ? [
              {
                category: ScoreCategory.WEBSITE,
                title: "The visible ordering process contains manual friction.",
                description:
                  "The current process can remain intentionally manual, but one or more pages require several customer steps or later confirmation.",
                severity: FindingSeverity.MEDIUM,
                evidence: {
                  issueKey: "website:ordering-process:friction",
                  pages: websiteCrawl.orderingFrictionPages,
                  affectedPages: websiteCrawl.orderingFrictionPages!.map(
                    (page) => page.url,
                  ),
                },
              },
            ]
          : []),
      ]
    : [];
  const seoAnalysisFindings: DeterministicAuditFinding[] = seoAnalysis
    ? [
        ...(seoAnalysis.indexabilityWarnings.length > 0
          ? [
              {
                category: ScoreCategory.SEO,
                title: "Indexability checks found issues.",
                description: seoAnalysis.indexabilityWarnings.join(" "),
                severity: FindingSeverity.MEDIUM,
                evidence: {
                  robotsTxtStatus: seoAnalysis.robotsTxtStatus,
                  sitemapStatus: seoAnalysis.sitemapStatus,
                  indexabilityWarnings: seoAnalysis.indexabilityWarnings,
                },
              },
            ]
          : [
              {
                category: ScoreCategory.SEO,
                title: "Indexability basics are in place.",
                description:
                  "robots.txt and sitemap.xml checks did not surface critical access issues.",
                severity: FindingSeverity.INFO,
                evidence: {
                  robotsTxtStatus: seoAnalysis.robotsTxtStatus,
                  sitemapStatus: seoAnalysis.sitemapStatus,
                },
              },
            ]),
        ...(seoAnalysis.seoWarnings.length > 0
          ? [
              {
                category: ScoreCategory.SEO,
                title: "Homepage SEO signals need cleanup.",
                description: seoAnalysis.seoWarnings.join(" "),
                severity:
                  seoAnalysis.score >= 70
                    ? FindingSeverity.LOW
                    : FindingSeverity.MEDIUM,
                evidence: {
                  titleStatus: seoAnalysis.titleStatus,
                  titleLength: seoAnalysis.titleLength,
                  metaDescriptionStatus: seoAnalysis.metaDescriptionStatus,
                  metaDescriptionLength: seoAnalysis.metaDescriptionLength,
                  h1Status: seoAnalysis.h1Status,
                  canonicalStatus: seoAnalysis.canonicalStatus,
                  viewportStatus: seoAnalysis.viewportStatus,
                  seoWarnings: seoAnalysis.seoWarnings,
                },
              },
            ]
          : [
              {
                category: ScoreCategory.SEO,
                title: "Homepage SEO fundamentals look healthy.",
                description: seoAnalysis.seoStrengths.join(" "),
                severity: FindingSeverity.INFO,
                evidence: {
                  seoStrengths: seoAnalysis.seoStrengths,
                },
              },
            ]),
      ]
    : [];
  const socialAnalysisFindings: DeterministicAuditFinding[] = socialAnalysis
    ? [
        ...(socialAnalysis.confirmedProfilesCount === 0
          ? [
              {
                category: ScoreCategory.SOCIAL,
                title: "No confirmed social profiles were found.",
                description:
                  "The audit did not find any confirmed social profiles. Confirm or add at least one profile before relying on social recommendations.",
                severity:
                  input.primaryGoal === BusinessGoal.GROW_SOCIAL_MEDIA
                    ? FindingSeverity.HIGH
                    : FindingSeverity.MEDIUM,
                evidence: {
                  confirmedProfilesCount: socialAnalysis.confirmedProfilesCount,
                  pendingProfilesCount: socialAnalysis.pendingProfilesCount,
                  platformCoverageLevel: socialAnalysis.platformCoverageLevel,
                },
              },
            ]
          : [
              {
                category: ScoreCategory.SOCIAL,
                title: `You have ${socialAnalysis.confirmedProfilesCount} confirmed social profile${
                  socialAnalysis.confirmedProfilesCount === 1 ? "" : "s"
                }.`,
                description: `Confirmed platforms: ${socialAnalysis.confirmedPlatforms.join(
                  ", ",
                )}.`,
                severity: FindingSeverity.INFO,
                evidence: {
                  confirmedPlatforms: socialAnalysis.confirmedPlatforms,
                  platformCoverageLevel: socialAnalysis.platformCoverageLevel,
                },
              },
            ]),
        ...(socialAnalysis.pendingProfilesCount > 0
          ? [
              {
                category: ScoreCategory.SOCIAL,
                title: "Some discovered social profiles need confirmation.",
                description: `${socialAnalysis.pendingProfilesCount} discovered social profile${
                  socialAnalysis.pendingProfilesCount === 1 ? "" : "s"
                } still need confirmation: ${socialAnalysis.pendingPlatforms.join(
                  ", ",
                )}.`,
                severity: FindingSeverity.MEDIUM,
                evidence: {
                  pendingProfilesCount: socialAnalysis.pendingProfilesCount,
                  pendingPlatforms: socialAnalysis.pendingPlatforms,
                },
              },
            ]
          : []),
        ...socialAnalysis.warnings
          .filter((warning) =>
            warning.includes("broader confirmed social coverage"),
          )
          .slice(0, 1)
          .map((warning) => ({
            category: ScoreCategory.SOCIAL,
            title: "A competitor appears stronger on social coverage.",
            description: warning,
            severity: FindingSeverity.MEDIUM,
            evidence: {
              competitorSocialCoverage:
                socialAnalysis.competitorSocialCoverage ?? [],
            },
          })),
      ]
    : [];
  const reviewAnalysisFindings: DeterministicAuditFinding[] = reviewAnalysis
    ? [
        ...(reviewAnalysis.googleBusinessStatus === "confirmed"
          ? [
              {
                category: ScoreCategory.REVIEWS,
                title: "Google Business profile is confirmed.",
                description:
                  "A confirmed Google Business profile is present, which supports local trust and customer confidence.",
                severity: FindingSeverity.INFO,
                evidence: {
                  googleBusinessStatus: reviewAnalysis.googleBusinessStatus,
                  confirmedReviewPlatforms:
                    reviewAnalysis.confirmedReviewPlatforms,
                },
              },
            ]
          : reviewAnalysis.googleBusinessStatus === "pending"
            ? [
                {
                  category: ScoreCategory.REVIEWS,
                  title:
                    "Google Business profile was discovered but needs confirmation.",
                  description:
                    "A Google Business profile is available in the saved profile set, but it is still pending confirmation.",
                  severity: FindingSeverity.MEDIUM,
                  evidence: {
                    googleBusinessStatus: reviewAnalysis.googleBusinessStatus,
                    pendingReviewPlatforms:
                      reviewAnalysis.pendingReviewPlatforms,
                  },
                },
              ]
            : [
                {
                  category: ScoreCategory.REVIEWS,
                  title: "No Google Business profile has been confirmed yet.",
                  description:
                    reviewAnalysis.googleBusinessDiscoveryStatus ===
                    "not_configured"
                      ? "Google Places discovery is not configured, so the app could not verify a public Google Business listing during this audit."
                      : reviewAnalysis.googleBusinessDiscoveryStatus ===
                          "searched_no_match"
                        ? "Google Places discovery ran, but no confident Google Business match was saved. Add the correct listing manually if one exists."
                        : "No Google Business listing has been confirmed yet. Confirm a pending candidate or manually add the correct listing before treating review readiness as final.",
                  severity:
                    input.primaryGoal === BusinessGoal.IMPROVE_LOCAL_VISIBILITY
                      ? FindingSeverity.HIGH
                      : FindingSeverity.MEDIUM,
                  evidence: {
                    googleBusinessStatus: reviewAnalysis.googleBusinessStatus,
                    reviewPresenceLevel: reviewAnalysis.reviewPresenceLevel,
                  },
                },
              ]),
        ...reviewAnalysis.trustWarnings
          .filter((warning) =>
            warning.includes("has confirmed review platform coverage"),
          )
          .slice(0, 1)
          .map((warning) => ({
            category: ScoreCategory.REVIEWS,
            title: "A competitor has stronger local trust coverage.",
            description: warning,
            severity: FindingSeverity.MEDIUM,
            evidence: {
              competitorReviewCoverage:
                reviewAnalysis.competitorReviewCoverage ?? [],
            },
          })),
      ]
    : [];

  const findings: DeterministicAuditFinding[] = [
    ...websiteAnalysisFindings,
    ...websiteCrawlFindings,
    ...seoAnalysisFindings,
    ...socialAnalysisFindings,
    ...reviewAnalysisFindings,
    ...(socialFirst
      ? [
          {
            category: ScoreCategory.BRANDING,
            title: "This audit used a social-first assessment.",
            description: `No confirmed website was provided, so Website and SEO were excluded from scoring. The assessment used ${socialConfirmed} confirmed social profile${socialConfirmed === 1 ? "" : "s"}, Business Context, goals, reviews, and competitor coverage.`,
            severity: FindingSeverity.INFO,
            evidence: {
              assessmentMode: assessment.mode,
              dataUsed: assessment.dataUsed,
              limitations: assessment.limitations,
            },
          },
        ]
      : []),
    ...(websiteConfirmed && primaryCtaAssessment?.clarity !== "CLEAR"
      ? [
          {
            category: ScoreCategory.WEBSITE,
            title: "Homepage visitor actions could be clearer.",
            description: websiteAnalysis
              ? primaryWebsiteActions.length > 0
                ? `The homepage has useful action links, but static structure did not verify one clearly primary next step. Prioritize an action that fits this business, such as ${ctaExamples}. Detected action types: ${primaryWebsiteActions.join(", ")}.`
                : `No customer action links were detected in the static homepage HTML. Prioritize an action that fits this business, such as ${ctaExamples}.`
              : "The confirmed website could not be analyzed fully, so its primary visitor path should be reviewed manually.",
            severity:
              websiteScore >= 75 ? FindingSeverity.LOW : FindingSeverity.MEDIUM,
          },
          {
            category: ScoreCategory.SEO,
            title: "SEO metadata needs improvement.",
            description: websiteAnalysis
              ? `Page title: ${
                  websiteAnalysis.pageTitle || "missing"
                }. Meta description: ${
                  websiteAnalysis.metaDescription ? "present" : "missing"
                }. Canonical tag: ${websiteAnalysis.hasCanonical ? "present" : "missing"}.`
              : "The confirmed website could not be analyzed fully, so search metadata should be reviewed manually.",
            severity:
              seoScore >= 70 ? FindingSeverity.LOW : FindingSeverity.HIGH,
          },
        ]
      : []),
    {
      category: ScoreCategory.SOCIAL,
      title: instagramPending
        ? "Instagram profile still needs confirmation."
        : "Social profile coverage is ready for review.",
      description: socialAnalysis
        ? `Coverage level: ${socialAnalysis.platformCoverageLevel}. Confirmed platforms: ${
            socialAnalysis.confirmedPlatforms.join(", ") || "none"
          }.`
        : "Confirmed social profiles improve confidence, while pending profiles should be reviewed before scoring is treated as final.",
      severity:
        socialScore >= 72 ? FindingSeverity.INFO : FindingSeverity.MEDIUM,
    },
    {
      category: ScoreCategory.BRANDING,
      title: "Confirmed profiles establish a branding baseline.",
      description:
        "The audit can compare profile coverage and saved Business Context, but profile bios, visuals, and post-level brand consistency were not inspected.",
      severity:
        brandingScore >= 70 ? FindingSeverity.INFO : FindingSeverity.LOW,
    },
    ...(competitorCount > 0
      ? [
          {
            category: ScoreCategory.COMPETITORS,
            title: `Tracking ${competitorCount} competitor${
              competitorCount === 1 ? "" : "s"
            }.`,
            description: `Saved competitors: ${competitorNames
              .slice(0, 5)
              .join(
                ", ",
              )}. Public comparisons use completed, timestamped snapshots; unavailable data is not treated as a weakness.`,
            severity:
              competitorCount >= 3 ? FindingSeverity.INFO : FindingSeverity.LOW,
          },
          ...(confirmedCompetitorProfileCount > 0
            ? [
                {
                  category: ScoreCategory.COMPETITORS,
                  title: `Tracking profiles for ${competitorsWithConfirmedProfiles} competitor${
                    competitorsWithConfirmedProfiles === 1 ? "" : "s"
                  }.`,
                  description: `Confirmed competitor profile platforms include: ${confirmedCompetitorPlatforms
                    .slice(0, 6)
                    .join(", ")}.`,
                  severity: FindingSeverity.INFO,
                  evidence: {
                    confirmedCompetitorProfileCount,
                    competitorsWithConfirmedProfiles,
                    confirmedCompetitorPlatforms,
                  },
                },
              ]
            : []),
        ]
      : [
          {
            category: ScoreCategory.COMPETITORS,
            title: "Competitor tracking has not been configured yet.",
            description:
              "Adding competitors will make future recommendations sharper and easier to prioritize.",
            severity: FindingSeverity.MEDIUM,
          },
        ]),
  ];

  const websiteAnalysisRecommendations: DeterministicAuditRecommendation[] =
    websiteAnalysis
      ? [
          ...(!websiteAnalysis.metaDescription
            ? [
                {
                  title: "Write a homepage meta description",
                  description:
                    "Add a concise, descriptive summary of the offer, audience, and primary value. Treat length as an editorial guideline because search engines may truncate or rewrite it.",
                  category: ScoreCategory.SEO,
                  priority: RecommendationPriority.HIGH,
                  estimatedEffort: "Low" as const,
                  expectedImpact: "Medium" as const,
                  sourceUrl: websiteAnalysis.normalizedUrl,
                  issueKey: "homepage:meta-description:missing",
                  evidence: {
                    issueKey: "homepage:meta-description:missing",
                    sourceUrl: websiteAnalysis.normalizedUrl,
                    metaDescriptionLength: 0,
                  },
                },
              ]
            : []),
          ...(websiteAnalysis.h1Count === 0
            ? [
                {
                  title: "Add one clear H1 to the homepage",
                  description:
                    "Use one primary H1 that explains the business outcome customers can expect.",
                  category: ScoreCategory.WEBSITE,
                  priority: RecommendationPriority.HIGH,
                  estimatedEffort: "Low" as const,
                  expectedImpact: "High" as const,
                  sourceUrl: websiteAnalysis.normalizedUrl,
                  issueKey: "sitewide:h1:missing",
                  evidence: {
                    issueKey: "sitewide:h1:missing",
                    sourceUrl: websiteAnalysis.normalizedUrl,
                    h1Count: 0,
                  },
                },
              ]
            : []),
          ...(websiteAnalysis.imagesMissingAltCount > 0
            ? [
                {
                  title: "Add alt text to important homepage images",
                  description: `Prioritize descriptive alt text for the ${websiteAnalysis.imagesMissingAltCount} homepage images currently missing it.`,
                  category: ScoreCategory.SEO,
                  priority: RecommendationPriority.MEDIUM,
                  estimatedEffort: "Medium" as const,
                  expectedImpact: "Medium" as const,
                },
              ]
            : []),
          ...(primaryCtaNeedsAttention
            ? [
                {
                  title: "Make the primary visitor action more prominent",
                  description: `Choose one action that fits the business, such as ${ctaExamples}, and give it stronger structural prominence than navigation and secondary links.`,
                  category: ScoreCategory.WEBSITE,
                  priority: RecommendationPriority.HIGH,
                  estimatedEffort: "Low" as const,
                  expectedImpact: "High" as const,
                  sourceUrl: websiteAnalysis.normalizedUrl,
                  issueKey: "homepage:primary-cta:unclear",
                  evidence: {
                    issueKey: "homepage:primary-cta:unclear",
                    sourceUrl: websiteAnalysis.normalizedUrl,
                    detectedActionTypes: primaryWebsiteActions,
                    primaryCtaAssessment,
                  },
                },
              ]
            : []),
          ...(!homepageHasUsableContactPath &&
          brokenHomepageContactPathEvidenceIds.length === 0
            ? [
                {
                  title: "Add one clear customer contact path",
                  description:
                    "Add a visible contact, email, phone, order, booking, quote, purchase, application, or chat path that fits how customers use this business.",
                  category: ScoreCategory.WEBSITE,
                  priority: RecommendationPriority.MEDIUM,
                  estimatedEffort: "Low" as const,
                  expectedImpact: "Medium" as const,
                  sourceUrl: websiteAnalysis.normalizedUrl,
                  issueKey: "website:contact-path:missing",
                  evidence: {
                    issueKey: "website:contact-path:missing",
                    sourceUrl: websiteAnalysis.normalizedUrl,
                    contactEvidence: homepageContactEvidence ?? null,
                  },
                },
              ]
            : []),
          ...(brokenHomepageContactPathEvidenceIds.length > 0 &&
          !homepageHasUsableContactPath
            ? [
                {
                  title: "Repair the broken customer action path",
                  description:
                    "Open the saved contact or order destination, restore the page or update the link, and test it from the homepage.",
                  category: ScoreCategory.WEBSITE,
                  priority: RecommendationPriority.HIGH,
                  estimatedEffort: "Low" as const,
                  expectedImpact: "High" as const,
                  sourceUrl: websiteAnalysis.normalizedUrl,
                  issueKey: "website:contact-path:broken-destination",
                  evidence: {
                    issueKey: "website:contact-path:broken-destination",
                    sourceUrl: websiteAnalysis.normalizedUrl,
                    brokenInteractionEvidenceIds:
                      brokenHomepageContactPathEvidenceIds,
                  },
                },
              ]
            : []),
        ]
      : [];
  const websiteCrawlRecommendations: DeterministicAuditRecommendation[] =
    websiteCrawl
      ? [
          ...(websiteCrawl.pagesMissingMetaDescription > 0
            ? [
                {
                  title: "Write meta descriptions for key pages",
                  description: `${websiteCrawl.pagesMissingMetaDescription} scanned page${
                    websiteCrawl.pagesMissingMetaDescription === 1
                      ? " is"
                      : "s are"
                  } missing meta descriptions. Start with the highest-value service, contact, pricing, and product pages.`,
                  category: ScoreCategory.SEO,
                  priority: RecommendationPriority.HIGH,
                  estimatedEffort: "Medium" as const,
                  expectedImpact: "High" as const,
                  issueKey: "sitewide:meta-description:missing",
                  evidence: {
                    issueKey: "sitewide:meta-description:missing",
                    affectedUrls: websiteCrawl.pageResults
                      .filter((page) => !page.metaDescription)
                      .map((page) => page.url),
                  },
                },
              ]
            : []),
          ...websiteCrawl.pageResults
            .filter(
              (page) => page.analysisStatus !== "FAILED" && page.h1Count === 0,
            )
            .map((page) => ({
              title: `Add a clear H1 to ${pageLabelFromUrl(page.url)}`,
              description:
                "Use one descriptive main heading that states this page's topic and customer value.",
              category: ScoreCategory.SEO,
              priority: RecommendationPriority.MEDIUM,
              estimatedEffort: "Low" as const,
              expectedImpact: "Medium" as const,
              sourceUrl: page.url,
              issueKey: "sitewide:h1:missing",
              evidence: {
                issueKey: "sitewide:h1:missing",
                sourceUrl: page.url,
                h1Count: 0,
              },
            })),
          ...websiteCrawl.pageResults
            .filter(
              (page) => page.analysisStatus !== "FAILED" && page.h1Count > 1,
            )
            .map((page) => ({
              title: `Clarify the H1 structure on ${pageLabelFromUrl(page.url)}`,
              description: `The page has ${page.h1Count} H1 headings. Keep the strongest main heading and use subordinate heading levels for supporting sections.`,
              category: ScoreCategory.SEO,
              priority: RecommendationPriority.LOW,
              estimatedEffort: "Low" as const,
              expectedImpact: "Medium" as const,
              sourceUrl: page.url,
              issueKey: "sitewide:h1:multiple",
              evidence: {
                issueKey: "sitewide:h1:multiple",
                sourceUrl: page.url,
                h1Count: page.h1Count,
              },
            })),
          ...(websiteCrawl.pagesWithNoCTA > 0
            ? [
                {
                  title: "Add customer action links to important pages",
                  description: `${websiteCrawl.pagesWithNoCTA} scanned page${
                    websiteCrawl.pagesWithNoCTA === 1 ? " has" : "s have"
                  } no detected customer action link. Add relevant next-step links, such as ${ctaExamples}; assess primary CTA clarity separately.`,
                  category: ScoreCategory.WEBSITE,
                  priority: RecommendationPriority.HIGH,
                  estimatedEffort: "Medium" as const,
                  expectedImpact: "High" as const,
                },
              ]
            : []),
          ...(contactCrawlState.contactDiscoveredButSkipped
            ? [
                {
                  title: "Review the discovered contact page",
                  description:
                    "A likely contact page was discovered but not scanned because of the current crawl limit. Review it manually or increase crawl depth before treating contact details as missing.",
                  category: ScoreCategory.WEBSITE,
                  priority: RecommendationPriority.LOW,
                  estimatedEffort: "Low" as const,
                  expectedImpact: "Medium" as const,
                },
              ]
            : []),
          ...(contactCrawlState.contactPageNotDiscovered &&
          contactCrawlState.contactInfoOnScannedPages
            ? [
                {
                  title: "Make contact options easier to find",
                  description:
                    "Contact information appears somewhere in the scanned pages, but no dedicated contact page was detected. Consider adding a clear Contact link in the header or footer.",
                  category: ScoreCategory.WEBSITE,
                  priority: RecommendationPriority.MEDIUM,
                  estimatedEffort: "Low" as const,
                  expectedImpact: "Medium" as const,
                },
              ]
            : []),
          ...(contactCrawlState.shouldRecommendAddingContactPage
            ? [
                {
                  title: "Add or expose a contact page",
                  description:
                    "No clear contact page or contact information was found in the scanned pages. Add one or link it more visibly from the header, footer, and key conversion pages.",
                  category: ScoreCategory.WEBSITE,
                  priority: RecommendationPriority.HIGH,
                  estimatedEffort: "Low" as const,
                  expectedImpact: "High" as const,
                },
              ]
            : []),
          ...(websiteCrawl.totalImagesMissingAlt > 0
            ? [
                {
                  title: "Improve image alt text across the site",
                  description: `The crawl found ${websiteCrawl.totalImagesMissingAlt} images missing alt text across ${websiteCrawl.successfulPages} scanned page${
                    websiteCrawl.successfulPages === 1 ? "" : "s"
                  }. Prioritize images that explain services, products, results, or team trust signals.`,
                  category: ScoreCategory.SEO,
                  priority: RecommendationPriority.MEDIUM,
                  estimatedEffort: "Medium" as const,
                  expectedImpact: "Medium" as const,
                },
              ]
            : []),
          ...((websiteCrawl.orderingFrictionPages?.length ?? 0) > 0
            ? [
                {
                  title: "Simplify the order inquiry process",
                  description:
                    "Preserve the business's manual ordering model while collecting required details in one guided step and explaining confirmation, payment, pickup, and delivery expectations.",
                  category: ScoreCategory.WEBSITE,
                  priority: RecommendationPriority.HIGH,
                  estimatedEffort: "Medium" as const,
                  expectedImpact: "High" as const,
                  sourceUrl: websiteCrawl.orderingFrictionPages!.at(0)?.url,
                  issueKey: "website:ordering-process:friction",
                  evidence: {
                    issueKey: "website:ordering-process:friction",
                    pages: websiteCrawl.orderingFrictionPages,
                    affectedUrls: websiteCrawl.orderingFrictionPages!.map(
                      (page) => page.url,
                    ),
                  },
                },
              ]
            : []),
          ...((websiteCrawl.copyQualityFindings?.length ?? 0) > 0
            ? [
                {
                  title:
                    "Correct visible copy errors across key customer pages",
                  description:
                    "Correct the cited high-confidence spelling, duplication, placeholder, or currency-format issues while preserving intentional brand and product wording.",
                  category: ScoreCategory.BRANDING,
                  priority: RecommendationPriority.MEDIUM,
                  estimatedEffort: "Low" as const,
                  expectedImpact: "Medium" as const,
                  issueKey: "website:copy:professionalism",
                  evidence: {
                    issueKey: "website:copy:professionalism",
                    issues: websiteCrawl.copyQualityFindings,
                    affectedUrls: websiteCrawl.copyQualityFindings!.map(
                      (issue) => issue.url,
                    ),
                  },
                },
              ]
            : []),
          ...((websiteCrawl.thinPages?.length ?? 0) > 0
            ? [
                {
                  title: "Resolve thin public pages",
                  description:
                    "Review each cited page and choose the safest fit: add useful page-specific content, redirect it, remove it from navigation, or noindex it.",
                  category: ScoreCategory.WEBSITE,
                  priority: RecommendationPriority.MEDIUM,
                  estimatedEffort: "Medium" as const,
                  expectedImpact: "Medium" as const,
                  issueKey: "website:content:thin",
                  evidence: {
                    issueKey: "website:content:thin",
                    pages: websiteCrawl.thinPages,
                    affectedUrls: websiteCrawl.thinPages!.map(
                      (page) => page.url,
                    ),
                  },
                },
              ]
            : []),
          ...((websiteCrawl.duplicateContentGroups?.length ?? 0) > 0
            ? [
                {
                  title: "Differentiate near-duplicate customer pages",
                  description:
                    "Give each affected page distinct customer value, main copy, and a relevant next step; consolidate only when the pages do not serve separate needs.",
                  category: ScoreCategory.SEO,
                  priority: RecommendationPriority.MEDIUM,
                  estimatedEffort: "Medium" as const,
                  expectedImpact: "Medium" as const,
                  issueKey: "website:content:duplicate",
                  evidence: {
                    issueKey: "website:content:duplicate",
                    groups: websiteCrawl.duplicateContentGroups,
                    affectedUrls: websiteCrawl.duplicateContentGroups!.flatMap(
                      (group) => group.urls,
                    ),
                  },
                },
              ]
            : []),
        ]
      : [];
  const seoAnalysisRecommendations: DeterministicAuditRecommendation[] =
    seoAnalysis
      ? seoAnalysis.recommendedFixes.slice(0, 4).map((fix, index) => ({
          title: fix,
          description: seoFixEvidenceDescription(fix, seoAnalysis),
          category: ScoreCategory.SEO,
          priority:
            index <= 1
              ? RecommendationPriority.HIGH
              : RecommendationPriority.MEDIUM,
          estimatedEffort: index <= 1 ? ("Low" as const) : ("Medium" as const),
          expectedImpact: index <= 1 ? ("High" as const) : ("Medium" as const),
        }))
      : [];
  const socialAnalysisRecommendations: DeterministicAuditRecommendation[] =
    socialAnalysis
      ? socialAnalysis.recommendedFixes.slice(0, 4).map((fix, index) => ({
          title: fix,
          description:
            "This recommendation comes from social profile coverage, confirmation status, goals, and competitor social context.",
          category: ScoreCategory.SOCIAL,
          priority:
            input.primaryGoal === BusinessGoal.GROW_SOCIAL_MEDIA || index === 0
              ? RecommendationPriority.HIGH
              : RecommendationPriority.MEDIUM,
          estimatedEffort: "Low" as const,
          expectedImpact:
            input.primaryGoal === BusinessGoal.GROW_SOCIAL_MEDIA
              ? ("High" as const)
              : ("Medium" as const),
        }))
      : [];
  const reviewAnalysisRecommendations: DeterministicAuditRecommendation[] =
    reviewAnalysis
      ? reviewAnalysis.recommendedFixes.slice(0, 4).map((fix, index) => ({
          title: fix,
          description:
            "This recommendation comes from review platform coverage, Google Business confirmation status, goals, and competitor trust context.",
          category: ScoreCategory.REVIEWS,
          priority:
            reviewAnalysis.googleBusinessStatus !== "confirmed" || index === 0
              ? RecommendationPriority.HIGH
              : RecommendationPriority.MEDIUM,
          estimatedEffort: "Low" as const,
          expectedImpact:
            input.primaryGoal === BusinessGoal.IMPROVE_LOCAL_VISIBILITY ||
            input.primaryGoal === BusinessGoal.MORE_CUSTOMERS ||
            input.primaryGoal === BusinessGoal.MORE_LEADS
              ? ("High" as const)
              : ("Medium" as const),
        }))
      : [];
  const businessContextRecommendations: DeterministicAuditRecommendation[] = [
    ...(isLeadOrSignupContext
      ? [
          {
            title: socialFirst
              ? "Align every profile CTA with the conversion goal"
              : "Align the primary CTA with the conversion goal",
            description: socialFirst
              ? "Use one clear next step across profile bios, pinned posts, direct-message prompts, and any saved booking, storefront, community, phone, email, or link-in-bio path."
              : `Use the business context to make the main next step obvious. Relevant examples include ${ctaExamples}.`,
            category: socialFirst
              ? ScoreCategory.SOCIAL
              : ScoreCategory.WEBSITE,
            priority: RecommendationPriority.HIGH,
            estimatedEffort: "Low" as const,
            expectedImpact: "High" as const,
          },
        ]
      : []),
    ...(isCreatorCommunityContext
      ? [
          {
            title: "Focus content on community proof and short-form channels",
            description:
              "For creator, gaming, Discord, or community audiences, prioritize content that works in TikTok, YouTube Shorts, Discord communities, Reddit, and creator-led channels before defaulting to generic B2B social advice.",
            category: ScoreCategory.SOCIAL,
            priority: RecommendationPriority.HIGH,
            estimatedEffort: "Medium" as const,
            expectedImpact: "High" as const,
          },
        ]
      : []),
    ...(isLocalBusinessContext
      ? [
          {
            title: "Strengthen local trust proof",
            description:
              "For local businesses, prioritize Google Business confirmation, visible reviews, local contact details, and proof that helps nearby customers feel confident.",
            category: ScoreCategory.REVIEWS,
            priority: RecommendationPriority.HIGH,
            estimatedEffort: "Low" as const,
            expectedImpact: "High" as const,
          },
        ]
      : []),
    ...(isSaasContext && websiteConfirmed
      ? [
          {
            title: "Tighten the product signup or demo path",
            description:
              "For software businesses, make the product value, pricing or demo path, onboarding promise, and signup CTA easy to understand from the homepage and key pages.",
            category: ScoreCategory.WEBSITE,
            priority: RecommendationPriority.HIGH,
            estimatedEffort: "Medium" as const,
            expectedImpact: "High" as const,
          },
        ]
      : []),
  ];

  const socialFirstRecommendations: DeterministicAuditRecommendation[] =
    socialFirst
      ? [
          {
            title: "Draft a clear social profile bio",
            description:
              "State who the business helps, the main offer, and one concrete next step. Use Business Context as the source and adapt the draft to each confirmed platform.",
            category: ScoreCategory.SOCIAL,
            priority: RecommendationPriority.HIGH,
            estimatedEffort: "Low",
            expectedImpact: "High",
          },
          {
            title: "Build one link-in-bio conversion path",
            description:
              "Give profile visitors a short, prioritized set of destinations for the main offer, booking or storefront, customer proof, contact options, and community or email signup where relevant.",
            category: ScoreCategory.SOCIAL,
            priority: RecommendationPriority.HIGH,
            estimatedEffort: "Low",
            expectedImpact: "High",
          },
          {
            title: "Create three pinned posts for new profile visitors",
            description:
              "Pin one offer explainer, one proof or trust post, and one clear next-step post so a new visitor can understand the business without browsing the full feed.",
            category: ScoreCategory.SOCIAL,
            priority: RecommendationPriority.MEDIUM,
            estimatedEffort: "Medium",
            expectedImpact: "High",
          },
        ]
      : [];

  const baseRecommendations: DeterministicAuditRecommendation[] = [
    ...seoAnalysisRecommendations,
    ...websiteAnalysisRecommendations,
    ...websiteCrawlRecommendations,
    ...socialAnalysisRecommendations,
    ...reviewAnalysisRecommendations,
    ...businessContextRecommendations,
    ...socialFirstRecommendations,
    ...(socialPending > 0
      ? [
          {
            title: "Confirm or remove uncertain social profiles",
            description:
              "Review pending profiles so the audit reflects only channels that actually belong to the business.",
            category: ScoreCategory.SOCIAL,
            priority: RecommendationPriority.HIGH,
            estimatedEffort: "Low" as const,
            expectedImpact: "Medium" as const,
          },
        ]
      : []),
    {
      title: "Create a weekly content schedule",
      description:
        deterministicSocialRecommendation(compatibilityContext).description,
      category: ScoreCategory.SOCIAL,
      priority: RecommendationPriority.MEDIUM,
      estimatedEffort: "Medium",
      expectedImpact: "Medium",
    },
    ...(competitorCount === 0
      ? [
          {
            title: "Add competitors to improve strategic recommendations.",
            description: socialFirst
              ? "Add 2-3 direct competitors so future recommendations can compare positioning, social coverage, content direction, and trust signals."
              : "Add 2-3 direct competitors so future recommendations can compare positioning, website clarity, and content direction.",
            category: ScoreCategory.COMPETITORS,
            priority:
              input.primaryGoal === BusinessGoal.BEAT_COMPETITORS
                ? RecommendationPriority.HIGH
                : RecommendationPriority.MEDIUM,
            estimatedEffort: "Low" as const,
            expectedImpact:
              input.primaryGoal === BusinessGoal.BEAT_COMPETITORS
                ? ("High" as const)
                : ("Medium" as const),
          },
        ]
      : confirmedCompetitorProfileCount === 0
        ? [
            {
              title: "Confirm competitor profiles before deeper tracking.",
              description:
                "Review pending competitor profiles so future audits can compare the right websites, social channels, and local listings.",
              category: ScoreCategory.COMPETITORS,
              priority:
                input.primaryGoal === BusinessGoal.BEAT_COMPETITORS
                  ? RecommendationPriority.HIGH
                  : RecommendationPriority.MEDIUM,
              estimatedEffort: "Low" as const,
              expectedImpact:
                input.primaryGoal === BusinessGoal.BEAT_COMPETITORS
                  ? ("High" as const)
                  : ("Medium" as const),
            },
          ]
        : [
            {
              title: "Review competitor positioning monthly.",
              description: publicCompetitorMonitoringCopy(competitorNames),
              category: ScoreCategory.COMPETITORS,
              priority: RecommendationPriority.MEDIUM,
              estimatedEffort: "Medium" as const,
              expectedImpact: "Medium" as const,
            },
          ]),
  ];
  const applicableRecommendations = socialFirst
    ? baseRecommendations.filter(
        (recommendation) =>
          recommendation.category !== ScoreCategory.WEBSITE &&
          recommendation.category !== ScoreCategory.SEO,
      )
    : baseRecommendations;
  const compatibleRecommendations = filterBusinessCompatibleContent({
    items: applicableRecommendations,
    context: compatibilityContext,
    sourceEvidence: contextText,
    diagnosticLabel: `audit:${input.businessName}`,
  });
  const recommendations = personalizeRecommendationsByBusinessContext(
    personalizeRecommendations({
      goals: input.goals,
      primaryGoal: input.primaryGoal,
      recommendations: compatibleRecommendations,
    }),
    contextText,
  );

  const focusedScores = scores.filter(
    (score) => !score.platform && isWebsiteSeoReportCategory(score.category),
  );
  const focusedFindings = findings.filter((finding) =>
    isWebsiteSeoCategory(finding.category),
  );
  const focusedRecommendations = recommendations.filter((recommendation) =>
    isWebsiteSeoCategory(recommendation.category),
  );
  const focusedScoreBreakdowns = scoreBreakdowns.filter((breakdown) =>
    isWebsiteSeoReportCategory(breakdown.category),
  );

  return {
    overallScore,
    summary: `${input.businessName} has a ${overallScore}/100 Website Growth Score based only on measured website and SEO evidence. Start with the highest-priority open action, make the change, then run another audit to verify the result.`,
    assessment,
    scoreBreakdowns: focusedScoreBreakdowns,
    scores: focusedScores,
    findings: focusedFindings,
    recommendations: focusedRecommendations,
    suggestedQuestions: [
      "What should I fix first?",
      "Explain why this issue matters.",
      "Help me rewrite this page title.",
      "Draft a stronger call to action.",
      "Which pages need the most attention?",
      "How can I verify this recommendation?",
    ],
    recentActivity: [
      {
        title: "Website and SEO audit generated",
        detail: `${focusedFindings.length} evidence-backed findings saved.`,
      },
      {
        title: "Website evidence analyzed",
        detail: `${websiteCrawl?.successfulPages ?? (websiteAnalysis ? 1 : 0)} public page${(websiteCrawl?.successfulPages ?? (websiteAnalysis ? 1 : 0)) === 1 ? "" : "s"} checked.`,
      },
      {
        title: "Recommendations created",
        detail: `${focusedRecommendations.length} prioritized website and SEO actions saved.`,
      },
    ],
  };
}

function pageLabelFromUrl(value: string) {
  try {
    const pathname = new URL(value).pathname.replace(/\/+$/, "");
    if (!pathname || pathname === "/") return "the homepage";
    const segment = pathname.split("/").filter(Boolean).at(-1);
    return segment
      ? `the ${segment.replace(/[-_]+/g, " ")} page`
      : "the affected page";
  } catch {
    return "the affected page";
  }
}

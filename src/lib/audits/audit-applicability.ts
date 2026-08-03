import {
  BusinessProfileStatus,
  ProfilePlatform,
  ScoreCategory,
} from "@prisma/client";

export const meaningfulSocialPlatforms = new Set<ProfilePlatform>([
  ProfilePlatform.INSTAGRAM,
  ProfilePlatform.FACEBOOK,
  ProfilePlatform.TIKTOK,
  ProfilePlatform.YOUTUBE,
  ProfilePlatform.LINKEDIN,
  ProfilePlatform.X,
  ProfilePlatform.PINTEREST,
]);

export type PresenceProfile = {
  platform: ProfilePlatform;
  status: BusinessProfileStatus;
  url?: string | null;
  handle?: string | null;
};

export type AuditAssessmentMode = "website_enabled" | "social_first";

export type AuditAssessment = {
  version: 1 | 2;
  mode: AuditAssessmentMode;
  hasWebsite: boolean;
  confirmedSocialProfilesCount: number;
  applicableCategories: ScoreCategory[];
  unavailableCategories: Array<{
    category: ScoreCategory;
    status: "not_provided";
    reason: string;
  }>;
  scoreWeights: Partial<Record<ScoreCategory, number>>;
  dataUsed: string[];
  limitations: string[];
};

const websiteEnabledWeights: Partial<Record<ScoreCategory, number>> = {
  [ScoreCategory.WEBSITE]: 20,
  [ScoreCategory.SEO]: 20,
  [ScoreCategory.SOCIAL]: 20,
  [ScoreCategory.BRANDING]: 15,
  [ScoreCategory.REVIEWS]: 15,
  [ScoreCategory.COMPETITORS]: 10,
};

const socialFirstWeights: Partial<Record<ScoreCategory, number>> = {
  [ScoreCategory.SOCIAL]: 35,
  [ScoreCategory.BRANDING]: 25,
  [ScoreCategory.REVIEWS]: 20,
  [ScoreCategory.COMPETITORS]: 20,
};

const websiteGrowthWeights: Partial<Record<ScoreCategory, number>> = {
  [ScoreCategory.WEBSITE]: 55,
  [ScoreCategory.SEO]: 45,
};

export function hasConfirmedWebsite(profiles: PresenceProfile[]) {
  return profiles.some(
    (profile) =>
      profile.platform === ProfilePlatform.WEBSITE &&
      profile.status === BusinessProfileStatus.CONFIRMED &&
      Boolean(profile.url?.trim()),
  );
}

export function confirmedSocialProfiles(profiles: PresenceProfile[]) {
  return profiles.filter(
    (profile) =>
      meaningfulSocialPlatforms.has(profile.platform) &&
      profile.status === BusinessProfileStatus.CONFIRMED &&
      Boolean(profile.url?.trim() || profile.handle?.trim()),
  );
}

export function hasConfirmedAuditablePresence(profiles: PresenceProfile[]) {
  return hasConfirmedWebsite(profiles);
}

export function buildAuditAssessment({
  profiles,
  hasWebsite = hasConfirmedWebsite(profiles),
}: {
  profiles: PresenceProfile[];
  hasWebsite?: boolean;
  competitorComparisonAvailable?: boolean;
}): AuditAssessment {
  if (hasWebsite) {
    return {
      version: 2,
      mode: "website_enabled",
      hasWebsite: true,
      confirmedSocialProfilesCount: 0,
      applicableCategories: [ScoreCategory.WEBSITE, ScoreCategory.SEO],
      unavailableCategories: [],
      scoreWeights: websiteGrowthWeights,
      dataUsed: [
        "Confirmed website",
        "Deterministic homepage analysis",
        "Controlled multi-page crawl",
        "Website and technical SEO evidence",
        "Business Context",
        "Selected goals",
      ],
      limitations: [
        "The Website Growth Score includes Website (55%) and SEO (45%) only.",
        "Social, competitor, review-count, and Google Business data do not affect this score.",
        "Pages outside the crawl limit are not treated as confirmed defects.",
      ],
    };
  }

  return {
    version: 2,
    mode: "website_enabled",
    hasWebsite: false,
    confirmedSocialProfilesCount: 0,
    applicableCategories: [],
    unavailableCategories: [
      {
        category: ScoreCategory.WEBSITE,
        status: "not_provided",
        reason: "No confirmed website was provided for this audit.",
      },
      {
        category: ScoreCategory.SEO,
        status: "not_provided",
        reason: "SEO analysis requires a confirmed website.",
      },
    ],
    scoreWeights: {},
    dataUsed: [],
    limitations: [
      "A confirmed website is required for the Website & SEO launch product.",
      "No score should be generated from unavailable website evidence.",
    ],
  };
}

export function calculateApplicableOverallScore(
  categoryScores: Partial<Record<ScoreCategory, number>>,
  assessment: AuditAssessment,
) {
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const category of assessment.applicableCategories) {
    const score = categoryScores[category];
    const weight = assessment.scoreWeights[category] ?? 0;

    if (typeof score !== "number" || weight <= 0) continue;

    weightedTotal += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.round(weightedTotal / totalWeight) : 0;
}

export function categoryScore(
  scores: Array<{
    category: ScoreCategory;
    platform?: ProfilePlatform | null | unknown;
    score: number;
  }>,
  category: ScoreCategory,
) {
  return (
    scores.find((score) => score.category === category && !score.platform)
      ?.score ?? null
  );
}

export function getAuditAssessment(snapshot: unknown): AuditAssessment {
  if (isRecord(snapshot) && isRecord(snapshot.assessment)) {
    const assessment = snapshot.assessment;

    if (
      (assessment.mode === "website_enabled" ||
        assessment.mode === "social_first") &&
      Array.isArray(assessment.applicableCategories) &&
      Array.isArray(assessment.unavailableCategories)
    ) {
      return assessment as AuditAssessment;
    }
  }

  const hasWebsite = Boolean(isRecord(snapshot) && isRecord(snapshot.website));
  return buildLegacyAuditAssessment({ hasWebsite });
}

function buildLegacyAuditAssessment({ hasWebsite }: { hasWebsite: boolean }) {
  if (hasWebsite) {
    return {
      version: 1 as const,
      mode: "website_enabled" as const,
      hasWebsite: true,
      confirmedSocialProfilesCount: 0,
      applicableCategories: [
        ScoreCategory.WEBSITE,
        ScoreCategory.SEO,
        ScoreCategory.SOCIAL,
        ScoreCategory.BRANDING,
        ScoreCategory.REVIEWS,
        ScoreCategory.COMPETITORS,
      ],
      unavailableCategories: [],
      scoreWeights: websiteEnabledWeights,
      dataUsed: ["Legacy audit snapshot"],
      limitations: [
        "This audit predates the Website Growth Score and uses the legacy scoring model.",
      ],
    } satisfies AuditAssessment;
  }

  return {
    version: 1 as const,
    mode: "social_first" as const,
    hasWebsite: false,
    confirmedSocialProfilesCount: 0,
    applicableCategories: [
      ScoreCategory.SOCIAL,
      ScoreCategory.BRANDING,
      ScoreCategory.REVIEWS,
      ScoreCategory.COMPETITORS,
    ],
    unavailableCategories: [
      {
        category: ScoreCategory.WEBSITE,
        status: "not_provided" as const,
        reason: "No confirmed website was provided for this legacy audit.",
      },
      {
        category: ScoreCategory.SEO,
        status: "not_provided" as const,
        reason: "SEO analysis required a confirmed website.",
      },
    ],
    scoreWeights: socialFirstWeights,
    dataUsed: ["Legacy audit snapshot"],
    limitations: [
      "This audit predates the Website Growth Score and uses the legacy scoring model.",
    ],
  } satisfies AuditAssessment;
}

export function isCategoryApplicable(
  assessment: AuditAssessment,
  category: ScoreCategory,
) {
  return assessment.applicableCategories.includes(category);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

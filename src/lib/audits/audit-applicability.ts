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
  version: 1;
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
  return (
    hasConfirmedWebsite(profiles) ||
    confirmedSocialProfiles(profiles).length > 0 ||
    profiles.some(
      (profile) =>
        profile.platform === ProfilePlatform.GOOGLE_BUSINESS &&
        profile.status === BusinessProfileStatus.CONFIRMED &&
        Boolean(profile.url?.trim() || profile.handle?.trim()),
    )
  );
}

export function buildAuditAssessment({
  profiles,
  hasWebsite = hasConfirmedWebsite(profiles),
  competitorComparisonAvailable = true,
}: {
  profiles: PresenceProfile[];
  hasWebsite?: boolean;
  competitorComparisonAvailable?: boolean;
}): AuditAssessment {
  const confirmedSocialCount = confirmedSocialProfiles(profiles).length;

  const withCompetitorApplicability = (
    categories: ScoreCategory[],
    weights: Partial<Record<ScoreCategory, number>>,
  ) => ({
    applicableCategories: competitorComparisonAvailable
      ? categories
      : categories.filter(
          (category) => category !== ScoreCategory.COMPETITORS,
        ),
    scoreWeights: competitorComparisonAvailable
      ? weights
      : Object.fromEntries(
          Object.entries(weights).filter(
            ([category]) => category !== ScoreCategory.COMPETITORS,
          ),
        ),
  });

  if (hasWebsite) {
    const applicability = withCompetitorApplicability(
      [
        ScoreCategory.WEBSITE,
        ScoreCategory.SEO,
        ScoreCategory.SOCIAL,
        ScoreCategory.BRANDING,
        ScoreCategory.REVIEWS,
        ScoreCategory.COMPETITORS,
      ],
      websiteEnabledWeights,
    );
    return {
      version: 1,
      mode: "website_enabled",
      hasWebsite: true,
      confirmedSocialProfilesCount: confirmedSocialCount,
      applicableCategories: applicability.applicableCategories,
      unavailableCategories: competitorComparisonAvailable
        ? []
        : [
            {
              category: ScoreCategory.COMPETITORS,
              status: "not_provided",
              reason:
                "No usable competitor snapshot was available, so competitive position was excluded from scoring.",
            },
          ],
      scoreWeights: applicability.scoreWeights,
      dataUsed: [
        "Confirmed website",
        "Confirmed and pending business profiles",
        "Business Context",
        "Selected goals",
        "Review and trust signals",
        "Saved competitors and competitor profiles",
      ],
      limitations: [
        "Social post content, engagement, posting frequency, and follower performance were not analyzed.",
      ],
    };
  }

  const applicability = withCompetitorApplicability(
    [
      ScoreCategory.SOCIAL,
      ScoreCategory.BRANDING,
      ScoreCategory.REVIEWS,
      ScoreCategory.COMPETITORS,
    ],
    socialFirstWeights,
  );

  return {
    version: 1,
    mode: "social_first",
    hasWebsite: false,
    confirmedSocialProfilesCount: confirmedSocialCount,
    applicableCategories: applicability.applicableCategories,
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
      ...(!competitorComparisonAvailable
        ? [
            {
              category: ScoreCategory.COMPETITORS,
              status: "not_provided" as const,
              reason:
                "No usable competitor snapshot was available, so competitive position was excluded from scoring.",
            },
          ]
        : []),
    ],
    scoreWeights: applicability.scoreWeights,
    dataUsed: [
      "Confirmed and pending social profiles",
      "Business Context",
      "Selected goals",
      "Review and trust signals",
      "Saved competitors and competitor profiles",
    ],
    limitations: [
      "No website or SEO analysis was performed because no confirmed website was provided.",
      "Social profile coverage was analyzed, but individual posts, engagement, posting frequency, and content performance were not.",
      "Profile bios and link-in-bio destinations were not inspected unless their URLs were explicitly saved.",
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
  return buildAuditAssessment({ profiles: [], hasWebsite });
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

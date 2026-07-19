import {
  BusinessGoal,
  BusinessProfileStatus,
  ProfilePlatform,
} from "@prisma/client";

import { platformLabels } from "@/lib/profiles/platforms";

export type SocialCoverageLevel = "none" | "low" | "moderate" | "strong";

export type SocialAnalyzerProfile = {
  platform: ProfilePlatform;
  status: BusinessProfileStatus;
  label?: string | null;
  urlOrHandle?: string | null;
};

export type SocialAnalyzerCompetitor = {
  competitorName: string;
  profiles: SocialAnalyzerProfile[];
};

export type SocialAnalysis = {
  score: number;
  confirmedProfilesCount: number;
  pendingProfilesCount: number;
  removedProfilesCount: number;
  confirmedPlatforms: string[];
  pendingPlatforms: string[];
  missingRecommendedPlatforms: string[];
  hasWebsite: boolean;
  hasAnySocial: boolean;
  platformCoverageLevel: SocialCoverageLevel;
  detectedConversionPaths: string[];
  competitorSocialCoverage?: {
    competitorName: string;
    confirmedPlatforms: string[];
    pendingPlatforms: string[];
    coverageLevel: SocialCoverageLevel;
  }[];
  strengths: string[];
  warnings: string[];
  opportunities: string[];
  recommendedFixes: string[];
  dataUsed: string[];
  limitations: string[];
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

const defaultRecommendedPlatforms = [
  ProfilePlatform.INSTAGRAM,
  ProfilePlatform.FACEBOOK,
  ProfilePlatform.LINKEDIN,
];

const socialGrowthRecommendedPlatforms = [
  ProfilePlatform.INSTAGRAM,
  ProfilePlatform.FACEBOOK,
  ProfilePlatform.TIKTOK,
  ProfilePlatform.YOUTUBE,
  ProfilePlatform.LINKEDIN,
];

export function analyzeSocialProfiles({
  businessProfiles,
  competitors = [],
  goals = [],
  primaryGoal,
}: {
  businessProfiles: SocialAnalyzerProfile[];
  competitors?: SocialAnalyzerCompetitor[];
  goals?: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
}): SocialAnalysis {
  const socialProfiles = businessProfiles.filter((profile) =>
    socialPlatforms.has(profile.platform),
  );
  const confirmedProfiles = socialProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const pendingProfiles = socialProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.PENDING,
  );
  const removedProfiles = socialProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.REMOVED,
  );
  const confirmedPlatforms = uniquePlatformLabels(confirmedProfiles);
  const pendingPlatforms = uniquePlatformLabels(pendingProfiles);
  const selectedGoals = new Set(goals);
  const socialGrowthGoal =
    selectedGoals.has(BusinessGoal.GROW_SOCIAL_MEDIA) ||
    primaryGoal === BusinessGoal.GROW_SOCIAL_MEDIA;
  const hasWebsite = businessProfiles.some(
    (profile) =>
      profile.platform === ProfilePlatform.WEBSITE &&
      profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const hasAnySocial = socialProfiles.some(
    (profile) => profile.status !== BusinessProfileStatus.REMOVED,
  );
  const platformCoverageLevel = coverageLevel(confirmedPlatforms.length);
  const detectedConversionPaths = [
    ...new Set(
      businessProfiles
        .filter(
          (profile) =>
            profile.status === BusinessProfileStatus.CONFIRMED &&
            isConversionPath(profile.urlOrHandle),
        )
        .map((profile) => profile.urlOrHandle?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const recommendedPlatforms = socialGrowthGoal
    ? socialGrowthRecommendedPlatforms
    : defaultRecommendedPlatforms;
  const missingRecommendedPlatforms = recommendedPlatforms
    .map((platform) => platformLabels[platform])
    .filter((label) => !confirmedPlatforms.includes(label));
  const competitorSocialCoverage = competitors.map((competitor) => {
    const competitorSocialProfiles = competitor.profiles.filter((profile) =>
      socialPlatforms.has(profile.platform),
    );
    const confirmed = competitorSocialProfiles.filter(
      (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
    );
    const pending = competitorSocialProfiles.filter(
      (profile) => profile.status === BusinessProfileStatus.PENDING,
    );

    return {
      competitorName: competitor.competitorName,
      confirmedPlatforms: uniquePlatformLabels(confirmed),
      pendingPlatforms: uniquePlatformLabels(pending),
      coverageLevel: coverageLevel(uniquePlatformLabels(confirmed).length),
    };
  });
  const strongerCompetitor = competitorSocialCoverage.find(
    (competitor) =>
      coverageRank(competitor.coverageLevel) >
      coverageRank(platformCoverageLevel),
  );
  const strengths: string[] = [];
  const warnings: string[] = [];
  const opportunities: string[] = [];
  const recommendedFixes: string[] = [];

  if (confirmedProfiles.length > 0) {
    strengths.push(
      `You have ${confirmedProfiles.length} confirmed social profile${
        confirmedProfiles.length === 1 ? "" : "s"
      }: ${confirmedPlatforms.join(", ")}.`,
    );
  }

  if (detectedConversionPaths.length > 0) {
    strengths.push(
      `${detectedConversionPaths.length} saved booking, storefront, contact, community, or link-in-bio path${
        detectedConversionPaths.length === 1 ? " was" : "s were"
      } detected.`,
    );
  }

  if (platformCoverageLevel === "strong") {
    strengths.push("Your confirmed social platform mix is broad enough for cross-channel content planning.");
  }

  if (confirmedProfiles.length === 0) {
    warnings.push("No confirmed social profiles were found.");
    recommendedFixes.push("Confirm or manually add at least one primary social profile.");
  }

  if (pendingProfiles.length > 0) {
    warnings.push(
      `${pendingProfiles.length} discovered social profile${
        pendingProfiles.length === 1 ? "" : "s"
      } still need confirmation.`,
    );
    recommendedFixes.push("Confirm pending social profiles before relying on social recommendations.");
  }

  if (!hasAnySocial && socialGrowthGoal) {
    warnings.push("Social growth is selected as a goal, but no active social profiles are confirmed.");
    recommendedFixes.push("Choose one primary social platform and confirm that profile first.");
  }

  if (!hasAnySocial && hasWebsite && !socialGrowthGoal) {
    opportunities.push("The business appears website-led. Add one or two social profiles when content promotion becomes a priority.");
  }

  if (missingRecommendedPlatforms.length > 0) {
    opportunities.push(
      `Recommended social opportunities not confirmed yet: ${missingRecommendedPlatforms.join(", ")}.`,
    );
  }

  if (strongerCompetitor) {
    warnings.push(
      `${strongerCompetitor.competitorName} appears to have broader confirmed social coverage than your business.`,
    );
    opportunities.push("Use competitor social coverage as a benchmark for which channels to prioritize next.");
  }

  if (confirmedProfiles.length >= 2) {
    recommendedFixes.push("Create a weekly content schedule across confirmed platforms.");
  }

  if (confirmedProfiles.length === 1) {
    recommendedFixes.push("Use the confirmed profile as the primary content channel, then add one complementary platform.");
  }

  if (!hasWebsite && confirmedProfiles.length > 0) {
    opportunities.push(
      "Use profile bios, pinned posts, and one clear next step as the primary conversion experience.",
    );
    recommendedFixes.push(
      "Draft a clear profile bio that states the audience, offer, and next step.",
    );
    if (detectedConversionPaths.length === 0) {
      recommendedFixes.push(
        "Create one link-in-bio, booking, storefront, community, call, email, or direct-message conversion path.",
      );
    }
    recommendedFixes.push(
      "Pin an offer explainer, a proof post, and a next-step post on the primary profile.",
    );
  }

  const baseScore = scoreFromCoverage({
    confirmedCount: confirmedProfiles.length,
    hasWebsite,
    socialGrowthGoal,
  });
  const pendingPenalty = Math.min(10, pendingProfiles.length * 3);
  const competitorPenalty = strongerCompetitor ? 5 : 0;
  const score = clampScore(baseScore - pendingPenalty - competitorPenalty);

  return {
    score,
    confirmedProfilesCount: confirmedProfiles.length,
    pendingProfilesCount: pendingProfiles.length,
    removedProfilesCount: removedProfiles.length,
    confirmedPlatforms,
    pendingPlatforms,
    missingRecommendedPlatforms,
    hasWebsite,
    hasAnySocial,
    platformCoverageLevel,
    detectedConversionPaths,
    competitorSocialCoverage,
    strengths,
    warnings,
    opportunities,
    recommendedFixes: [...new Set(recommendedFixes)],
    dataUsed: [
      "Saved profile platforms",
      "Profile confirmation status",
      "Selected business goals",
      "Saved competitor profile coverage",
      ...(detectedConversionPaths.length > 0
        ? ["Explicitly saved conversion links"]
        : []),
    ],
    limitations: [
      "Individual posts, engagement, follower counts, posting frequency, and content performance were not analyzed.",
      "Profile bios, pinned posts, and link-in-bio destinations were not inspected unless their URLs were explicitly saved.",
    ],
  };
}

function isConversionPath(value?: string | null) {
  if (!value || !/^(?:https?:\/\/|mailto:|tel:)/i.test(value)) return false;

  return /(?:linktr\.ee|beacons\.ai|stan\.store|bio\.site|hoo\.be|campsite\.bio|solo\.to|lnk\.bio|calendly\.com|acuityscheduling\.com|square\.site|squareup\.com|shopify\.com|etsy\.com|gumroad\.com|patreon\.com|discord\.(?:gg|com\/invite)|whatsapp\.com|wa\.me|mailto:|tel:|\/book(?:ing)?\b|\/schedule\b|\/shop\b|\/store\b|\/order\b|\/subscribe\b|\/community\b)/i.test(
    value,
  );
}

function uniquePlatformLabels(profiles: SocialAnalyzerProfile[]) {
  return [
    ...new Set(
      profiles.map(
        (profile) => profile.label || platformLabels[profile.platform],
      ),
    ),
  ];
}

function coverageLevel(confirmedCount: number): SocialCoverageLevel {
  if (confirmedCount === 0) return "none";
  if (confirmedCount === 1) return "low";
  if (confirmedCount <= 3) return "moderate";
  return "strong";
}

function coverageRank(level: SocialCoverageLevel) {
  return {
    none: 0,
    low: 1,
    moderate: 2,
    strong: 3,
  }[level];
}

function scoreFromCoverage({
  confirmedCount,
  hasWebsite,
  socialGrowthGoal,
}: {
  confirmedCount: number;
  hasWebsite: boolean;
  socialGrowthGoal: boolean;
}) {
  if (confirmedCount >= 4) return 88;
  if (confirmedCount >= 3) return 78;
  if (confirmedCount === 2) return 70;
  if (confirmedCount === 1) return 58;
  if (socialGrowthGoal) return 26;
  if (hasWebsite) return 44;
  return 35;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

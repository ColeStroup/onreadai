import {
  BusinessProfileStatus,
  ProfilePlatform,
} from "@prisma/client";

import type {
  CompetitorProfileCountSummary,
  ProfileCountSummary,
} from "@/lib/audits/evidence-contracts";

const socialPlatforms = new Set<ProfilePlatform>([
  ProfilePlatform.INSTAGRAM,
  ProfilePlatform.FACEBOOK,
  ProfilePlatform.TIKTOK,
  ProfilePlatform.YOUTUBE,
  ProfilePlatform.LINKEDIN,
  ProfilePlatform.X,
  ProfilePlatform.PINTEREST,
]);

const reviewPlatforms = new Set<ProfilePlatform>([
  ProfilePlatform.GOOGLE_BUSINESS,
  ProfilePlatform.FACEBOOK,
]);

export type CountableProfile = {
  platform: ProfilePlatform;
  status: BusinessProfileStatus;
};

export function aggregateProfileCounts(
  profiles: CountableProfile[],
): ProfileCountSummary {
  const confirmed = profiles.filter(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const confirmedSocial = confirmed.filter((profile) =>
    socialPlatforms.has(profile.platform),
  );
  const confirmedReview = confirmed.filter((profile) =>
    reviewPlatforms.has(profile.platform),
  );
  const pendingSocial = profiles.filter(
    (profile) =>
      profile.status === BusinessProfileStatus.PENDING &&
      socialPlatforms.has(profile.platform),
  );
  const detectedSocial = profiles.filter(
    (profile) =>
      profile.status !== BusinessProfileStatus.REMOVED &&
      socialPlatforms.has(profile.platform),
  );

  return {
    confirmedPublicProfiles: confirmed.length,
    confirmedWebsiteProfiles: confirmed.filter(
      (profile) => profile.platform === ProfilePlatform.WEBSITE,
    ).length,
    confirmedSocialProfiles: confirmedSocial.length,
    confirmedReviewProfiles: confirmedReview.length,
    detectedSocialProfiles: detectedSocial.length,
    pendingSocialProfiles: pendingSocial.length,
    confirmedPublicPlatforms: uniquePlatforms(confirmed),
    confirmedSocialPlatforms: uniquePlatforms(confirmedSocial),
    confirmedReviewPlatforms: uniquePlatforms(confirmedReview),
    pendingSocialPlatforms: uniquePlatforms(pendingSocial),
  };
}

export function aggregateCompetitorProfileCounts(
  competitors: Array<{
    id: string;
    name: string;
    profiles: CountableProfile[];
  }>,
): {
  competitors: CompetitorProfileCountSummary[];
  totals: ProfileCountSummary;
} {
  const summaries = competitors.map((competitor) => ({
    competitorId: competitor.id,
    competitorName: competitor.name,
    ...aggregateProfileCounts(competitor.profiles),
  }));

  return {
    competitors: summaries,
    totals: sumProfileCounts(summaries),
  };
}

export function isSocialPlatform(platform: ProfilePlatform) {
  return socialPlatforms.has(platform);
}

function sumProfileCounts(
  summaries: ProfileCountSummary[],
): ProfileCountSummary {
  return {
    confirmedPublicProfiles: sum(
      summaries,
      "confirmedPublicProfiles",
    ),
    confirmedWebsiteProfiles: sum(
      summaries,
      "confirmedWebsiteProfiles",
    ),
    confirmedSocialProfiles: sum(
      summaries,
      "confirmedSocialProfiles",
    ),
    confirmedReviewProfiles: sum(
      summaries,
      "confirmedReviewProfiles",
    ),
    detectedSocialProfiles: sum(summaries, "detectedSocialProfiles"),
    pendingSocialProfiles: sum(summaries, "pendingSocialProfiles"),
    confirmedPublicPlatforms: uniqueStrings(
      summaries.flatMap((item) => item.confirmedPublicPlatforms),
    ),
    confirmedSocialPlatforms: uniqueStrings(
      summaries.flatMap((item) => item.confirmedSocialPlatforms),
    ),
    confirmedReviewPlatforms: uniqueStrings(
      summaries.flatMap((item) => item.confirmedReviewPlatforms),
    ),
    pendingSocialPlatforms: uniqueStrings(
      summaries.flatMap((item) => item.pendingSocialPlatforms),
    ),
  };
}

function sum(
  summaries: ProfileCountSummary[],
  key:
    | "confirmedPublicProfiles"
    | "confirmedWebsiteProfiles"
    | "confirmedSocialProfiles"
    | "confirmedReviewProfiles"
    | "detectedSocialProfiles"
    | "pendingSocialProfiles",
) {
  return summaries.reduce((total, item) => total + item[key], 0);
}

function uniquePlatforms(profiles: CountableProfile[]) {
  return uniqueStrings(profiles.map((profile) => platformLabel(profile.platform)));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function platformLabel(platform: ProfilePlatform) {
  return platform
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

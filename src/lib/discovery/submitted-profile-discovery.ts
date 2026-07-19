import {
  BusinessInputType,
  BusinessProfileStatus,
  ProfilePlatform,
} from "@prisma/client";

import {
  normalizeSubmittedUrl,
  platformForSubmittedUrl,
  platformLabels,
} from "@/lib/profiles/platforms";

export type SubmittedProfile = {
  platform: ProfilePlatform;
  label: string;
  url?: string;
  handle?: string;
  confidenceScore: number;
  status: BusinessProfileStatus;
};

export function discoverSubmittedProfiles(
  input: string,
  inputType: BusinessInputType,
): SubmittedProfile[] {
  if (inputType === BusinessInputType.WEBSITE) {
    return [
      {
        platform: ProfilePlatform.WEBSITE,
        label: platformLabels.WEBSITE,
        url: normalizeSubmittedUrl(input),
        confidenceScore: 100,
        status: BusinessProfileStatus.PENDING,
      },
    ];
  }

  if (inputType === BusinessInputType.SOCIAL_PROFILE) {
    const platform = platformForSubmittedUrl(input);

    if (platform) {
      return [
        {
          platform,
          label: platformLabels[platform],
          url: normalizeSubmittedUrl(input),
          confidenceScore: 100,
          status: BusinessProfileStatus.PENDING,
        },
      ];
    }
  }

  return [];
}

export function submittedCompetitorWebsiteProfile(
  websiteUrl: string | null,
) {
  if (!websiteUrl) return [];

  return [
    {
      platform: ProfilePlatform.WEBSITE,
      label: platformLabels.WEBSITE,
      urlOrHandle: normalizeSubmittedUrl(websiteUrl),
      confidenceScore: 100,
      status: BusinessProfileStatus.PENDING,
    },
  ];
}

import "server-only";

import {
  BusinessProfileStatus,
  ProfilePlatform,
} from "@prisma/client";

import {
  analyzeWebsite,
  type WebsiteAnalysis,
} from "@/lib/analyzers/website-analyzer";

type ContextWebsiteProfile = {
  platform: ProfilePlatform;
  status: BusinessProfileStatus;
  url?: string | null;
  handle?: string | null;
};

type ContextWebsiteAnalysisInput = {
  profiles: ContextWebsiteProfile[];
  savedWebsiteAnalysis?: WebsiteAnalysis | null;
  businessContext?: {
    description?: string | null;
    targetAudience?: string | null;
    mainOffer?: string | null;
    industry?: string | null;
    businessType?: string | null;
    primaryConversionGoal?: string | null;
  } | null;
};

type WebsiteAnalyzer = typeof analyzeWebsite;

export function selectBusinessContextWebsiteProfile(
  profiles: ContextWebsiteProfile[],
) {
  return profiles
    .filter(
      (profile) =>
        profile.platform === ProfilePlatform.WEBSITE &&
        profile.status !== BusinessProfileStatus.REMOVED &&
        Boolean(profile.url || profile.handle),
    )
    .sort(
      (left, right) =>
        profileStatusRank(left.status) - profileStatusRank(right.status),
    )
    .at(0);
}

export function websiteAnalysisHasBusinessContextEvidence(
  analysis?: WebsiteAnalysis | null,
) {
  return Boolean(
    analysis &&
      (analysis.contentExcerpt?.trim() ||
        analysis.metaDescription?.trim() ||
        analysis.pageTitle?.trim() ||
        analysis.h1Text?.some((heading) => heading.trim()) ||
        analysis.detectedLocalBusinessSchema?.length),
  );
}

export async function resolveBusinessContextWebsiteAnalysis(
  input: ContextWebsiteAnalysisInput,
  analyze: WebsiteAnalyzer = analyzeWebsite,
) {
  const profile = selectBusinessContextWebsiteProfile(input.profiles);
  const profileValue = profile?.url || profile?.handle;

  if (!profile || !profileValue) {
    return {
      profile: null,
      analysis: null,
      source: "not_available" as const,
    };
  }

  const liveAnalysis = await analyze(profileValue, {
    businessContext: input.businessContext,
  });

  if (websiteAnalysisHasBusinessContextEvidence(liveAnalysis)) {
    return {
      profile,
      analysis: liveAnalysis,
      source: "live_homepage" as const,
    };
  }

  if (
    websiteAnalysisHasBusinessContextEvidence(input.savedWebsiteAnalysis) &&
    isSameBusinessWebsite(
      profileValue,
      input.savedWebsiteAnalysis?.normalizedUrl,
    )
  ) {
    return {
      profile,
      analysis: input.savedWebsiteAnalysis ?? null,
      source: "saved_audit" as const,
    };
  }

  return {
    profile,
    analysis: liveAnalysis,
    source: "live_homepage_limited" as const,
  };
}

function profileStatusRank(status: BusinessProfileStatus) {
  if (status === BusinessProfileStatus.CONFIRMED) return 0;
  if (status === BusinessProfileStatus.PENDING) return 1;
  return 2;
}

export function isSameBusinessWebsite(
  left: string,
  right?: string | null,
) {
  if (!right) return false;

  try {
    return normalizedHostname(left) === normalizedHostname(right);
  } catch {
    return false;
  }
}

function normalizedHostname(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
}

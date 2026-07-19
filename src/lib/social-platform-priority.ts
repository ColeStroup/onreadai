import { BusinessProfileStatus, ProfilePlatform } from "@prisma/client";

import type { SocialPlatformRecommendation } from "@/lib/social-strategy";

type PlatformPriorityContext = {
  description?: string | null;
  targetAudience?: string | null;
  mainOffer?: string | null;
  industry?: string | null;
  businessType?: string | null;
  primaryConversionGoal?: string | null;
};

type PlatformPriorityProfile = {
  platform: ProfilePlatform;
  status: BusinessProfileStatus;
};

type PlatformArchetype =
  | "hospitality"
  | "b2b"
  | "creator"
  | "ecommerce"
  | "service"
  | "general";

export function prioritizeSocialPlatformsForBusiness({
  recommendations,
  businessContext,
  profiles = [],
}: {
  recommendations: SocialPlatformRecommendation[];
  businessContext?: PlatformPriorityContext | null;
  profiles?: PlatformPriorityProfile[];
}) {
  const context = contextText(businessContext);
  const archetype = inferArchetype(context);
  const professionalFit =
    /\b(b2b|corporate events?|corporate sales|catering|partnerships?|hiring|recruiting|careers?|professional)\b/.test(
      context,
    );
  const confirmed = new Set(
    profiles
      .filter((profile) => profile.status === BusinessProfileStatus.CONFIRMED)
      .map((profile) => profile.platform),
  );
  let result = dedupePlatforms(recommendations);

  if (archetype === "hospitality") {
    result = ensurePlatform(result, {
      platform: "Instagram",
      priority: "high",
      reason:
        "Visual food, atmosphere, event, and destination content fits local discovery.",
      contentFit:
        "Reels, food and drink features, beach or venue moments, event previews, and customer proof.",
      confidence: 82,
    });
    result = ensurePlatform(result, {
      platform: "Facebook",
      priority: "high",
      reason:
        "Facebook supports local community awareness, event discovery, and practical visitor updates.",
      contentFit:
        "Events, hours, specials, local announcements, customer moments, and links to visitor actions.",
      confidence: 78,
    });
    result = ensurePlatform(result, {
      platform: "TikTok",
      priority: "high",
      reason:
        "Short visual clips fit food, nightlife, tourism, events, and destination-led discovery.",
      contentFit:
        "Quick food features, event energy, behind-the-scenes clips, destination moments, and local trends.",
      confidence: 74,
    });
    result = ensurePlatform(result, {
      platform: "YouTube Shorts",
      priority: "medium",
      reason:
        "Short video can extend the life of visual venue and event content beyond a single social feed.",
      contentFit:
        "Venue tours, event recaps, menu highlights, beach or location clips, and evergreen visitor answers.",
      confidence: 66,
    });
    result = result.filter(
      (item) =>
        !isGoogleBusiness(item.platform) &&
        (!isLinkedIn(item.platform) || professionalFit),
    );
    if (professionalFit) {
      result = result.map((item) =>
        isLinkedIn(item.platform) ? { ...item, priority: "low" as const } : item,
      );
    }
  }

  if (archetype === "creator") {
    result = ensurePlatform(result, defaultTikTok("high"));
    result = ensurePlatform(result, defaultYouTube("high"));
  }

  if (archetype === "ecommerce") {
    result = ensurePlatform(result, defaultTikTok("high"));
    result = ensurePlatform(result, defaultYouTube("medium"));
    result = ensurePlatform(result, {
      platform: "Pinterest",
      priority: "medium",
      reason: "Evergreen visual discovery can support products with planning or inspiration value.",
      contentFit: "Product collections, use cases, seasonal guides, and visual search content.",
      confidence: 60,
    });
  }

  if (archetype === "b2b") {
    result = ensurePlatform(result, {
      platform: "LinkedIn",
      priority: "high",
      reason: "Professional buyers and partners often evaluate expertise and credibility on LinkedIn.",
      contentFit: "Founder insights, customer problems, case studies, product lessons, and partnerships.",
      confidence: 76,
    });
  }

  return result
    .map((item) => ({
      ...item,
      confidence: Math.min(
        95,
        item.confidence +
          (confirmed.has(platformEnumFor(item.platform)) ? 8 : 0),
      ),
    }))
    .sort((a, b) => platformScore(a, archetype) - platformScore(b, archetype))
    .slice(0, 6);
}

function inferArchetype(text: string): PlatformArchetype {
  if (
    /\b(restaurant|bar|grill|cafe|coffee|brewery|pub|venue|hospitality|tourism|attraction|beach club|nightlife|dining)\b/.test(
      text,
    )
  ) {
    return "hospitality";
  }
  if (/\b(creator|gaming|discord|community|streamer|twitch|reddit)\b/.test(text)) {
    return "creator";
  }
  if (/\b(ecommerce|e-commerce|retail|shop|store|consumer product)\b/.test(text)) {
    return "ecommerce";
  }
  if (/\b(saas|software|b2b|enterprise|professional services|agency|consultant)\b/.test(text)) {
    return "b2b";
  }
  if (/\b(contractor|clinic|salon|service area|local service)\b/.test(text)) {
    return "service";
  }
  return "general";
}

function platformScore(
  recommendation: SocialPlatformRecommendation,
  archetype: PlatformArchetype,
) {
  const name = recommendation.platform.toLowerCase();
  let score =
    recommendation.priority === "high"
      ? 0
      : recommendation.priority === "medium"
        ? 20
        : 40;

  if (archetype === "hospitality") {
    if (name.includes("instagram")) score -= 35;
    if (name.includes("facebook")) score -= 30;
    if (name.includes("tiktok")) score -= 25;
    if (name.includes("youtube")) score -= 18;
    if (name.includes("linkedin")) score += 40;
  }
  if (archetype === "b2b" && name.includes("linkedin")) score -= 35;
  if (archetype === "creator" && /tiktok|youtube|discord|reddit/.test(name)) {
    score -= 28;
  }
  if (archetype === "ecommerce" && /instagram|tiktok|pinterest|youtube/.test(name)) {
    score -= 24;
  }

  return score;
}

function ensurePlatform(
  recommendations: SocialPlatformRecommendation[],
  candidate: SocialPlatformRecommendation,
) {
  const existingIndex = recommendations.findIndex((item) =>
    samePlatform(item.platform, candidate.platform),
  );

  if (existingIndex === -1) return [...recommendations, candidate];

  return recommendations.map((item, index) =>
    index === existingIndex
      ? {
          ...item,
          priority:
            priorityRank(candidate.priority) < priorityRank(item.priority)
              ? candidate.priority
              : item.priority,
          confidence: Math.max(item.confidence, candidate.confidence),
        }
      : item,
  );
}

function dedupePlatforms(recommendations: SocialPlatformRecommendation[]) {
  const seen = new Set<string>();
  return recommendations.filter((item) => {
    const key = normalizedPlatform(item.platform);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function samePlatform(left: string, right: string) {
  return normalizedPlatform(left) === normalizedPlatform(right);
}

function normalizedPlatform(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("youtube")) return "youtube";
  if (normalized.includes("twitter") || normalized === "x") return "x";
  return normalized.replace(/[^a-z0-9]+/g, "");
}

function priorityRank(value: SocialPlatformRecommendation["priority"]) {
  if (value === "high") return 0;
  if (value === "medium") return 1;
  return 2;
}

function platformEnumFor(value: string) {
  const normalized = normalizedPlatform(value);
  if (normalized === "instagram") return ProfilePlatform.INSTAGRAM;
  if (normalized === "facebook") return ProfilePlatform.FACEBOOK;
  if (normalized === "tiktok") return ProfilePlatform.TIKTOK;
  if (normalized === "youtube") return ProfilePlatform.YOUTUBE;
  if (normalized === "linkedin") return ProfilePlatform.LINKEDIN;
  if (normalized === "pinterest") return ProfilePlatform.PINTEREST;
  if (normalized === "x") return ProfilePlatform.X;
  return ProfilePlatform.OTHER;
}

function isLinkedIn(value: string) {
  return value.toLowerCase().includes("linkedin");
}

function isGoogleBusiness(value: string) {
  return value.toLowerCase().includes("google business");
}

function contextText(context?: PlatformPriorityContext | null) {
  return [
    context?.description,
    context?.targetAudience,
    context?.mainOffer,
    context?.industry,
    context?.businessType,
    context?.primaryConversionGoal,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function defaultTikTok(
  priority: SocialPlatformRecommendation["priority"],
): SocialPlatformRecommendation {
  return {
    platform: "TikTok",
    priority,
    reason: "Short-form video can create discovery before someone actively searches for the business.",
    contentFit: "Quick demonstrations, useful tips, behind-the-scenes clips, and timely stories.",
    confidence: 70,
  };
}

function defaultYouTube(
  priority: SocialPlatformRecommendation["priority"],
): SocialPlatformRecommendation {
  return {
    platform: "YouTube Shorts",
    priority,
    reason: "Short video can explain value and create reusable visual discovery content.",
    contentFit: "Short explainers, demonstrations, recaps, customer questions, and evergreen clips.",
    confidence: 66,
  };
}

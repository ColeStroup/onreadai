import {
  BusinessGoal,
  BusinessProfileStatus,
  ProfilePlatform,
} from "@prisma/client";

import { platformLabels } from "@/lib/profiles/platforms";

export type GoogleBusinessStatus = "missing" | "pending" | "confirmed";
export type ReviewPresenceLevel = "none" | "low" | "moderate" | "strong";
export type GoogleBusinessApplicability = "important" | "useful" | "optional";

export type ReviewAnalyzerProfile = {
  platform: ProfilePlatform;
  status: BusinessProfileStatus;
  label?: string | null;
};

export type ReviewAnalyzerGoogleBusinessProfile = {
  id?: string;
  displayName?: string | null;
  formattedAddress?: string | null;
  phoneNumber?: string | null;
  websiteUri?: string | null;
  googleMapsUri?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  matchConfidence?: number | null;
  matchReasons?: unknown;
  status: string;
  source?: string | null;
};

export type ReviewAnalyzerCompetitor = {
  competitorName: string;
  profiles: ReviewAnalyzerProfile[];
};

export type ManualReviewInput = {
  platform: string;
  reviewCount?: number | null;
  averageRating?: number | null;
};

export type ReviewAnalysis = {
  score: number;
  hasGoogleBusinessProfile: boolean;
  googleBusinessStatus: GoogleBusinessStatus;
  googleBusinessApplicability: GoogleBusinessApplicability;
  googleBusinessListingName: string | null;
  googleBusinessDiscoveryStatus:
    | "confirmed"
    | "pending"
    | "not_configured"
    | "searched_no_match"
    | "error"
    | "not_searched";
  googleBusinessProfiles: ReviewAnalyzerGoogleBusinessProfile[];
  googleRating: number | null;
  googleReviewCount: number | null;
  googleMapsUri: string | null;
  reviewScoreExplanation: string;
  confirmedReviewPlatforms: string[];
  pendingReviewPlatforms: string[];
  reviewPresenceLevel: ReviewPresenceLevel;
  trustStrengths: string[];
  trustWarnings: string[];
  opportunities: string[];
  recommendedFixes: string[];
  competitorReviewCoverage?: {
    competitorName: string;
    hasGoogleBusinessProfile: boolean;
    confirmedPlatforms: string[];
    pendingPlatforms: string[];
  }[];
};

const reviewPlatforms = new Set<ProfilePlatform>([
  ProfilePlatform.GOOGLE_BUSINESS,
  ProfilePlatform.FACEBOOK,
]);

const trustSensitiveGoals = new Set<BusinessGoal>([
  BusinessGoal.MORE_LEADS,
  BusinessGoal.MORE_CUSTOMERS,
  BusinessGoal.IMPROVE_LOCAL_VISIBILITY,
  BusinessGoal.INCREASE_SALES,
]);

export function analyzeReviews({
  businessProfiles,
  googleBusinessProfiles = [],
  googleDiscovery,
  competitors = [],
  goals = [],
  primaryGoal,
  manualReviews = [],
  businessContext,
}: {
  businessProfiles: ReviewAnalyzerProfile[];
  googleBusinessProfiles?: ReviewAnalyzerGoogleBusinessProfile[];
  googleDiscovery?: {
    apiConfigured?: boolean;
    searched?: boolean;
    error?: string;
  } | null;
  competitors?: ReviewAnalyzerCompetitor[];
  goals?: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
  manualReviews?: ManualReviewInput[];
  businessContext?: {
    description?: string | null;
    targetAudience?: string | null;
    mainOffer?: string | null;
    industry?: string | null;
    businessType?: string | null;
    primaryConversionGoal?: string | null;
  } | null;
}): ReviewAnalysis {
  const selectedGoals = new Set(goals);
  const hasWebsite = businessProfiles.some(
    (profile) =>
      profile.platform === ProfilePlatform.WEBSITE &&
      profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const googleBusinessApplicability = getGoogleBusinessApplicability({
    goals,
    primaryGoal,
    businessContext,
  });
  const trustGoal =
    Boolean(primaryGoal && trustSensitiveGoals.has(primaryGoal)) ||
    [...selectedGoals].some((goal) => trustSensitiveGoals.has(goal));
  const reviewProfiles = businessProfiles.filter((profile) =>
    reviewPlatforms.has(profile.platform),
  );
  const confirmedProfiles = reviewProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
  );
  const pendingProfiles = reviewProfiles.filter(
    (profile) => profile.status === BusinessProfileStatus.PENDING,
  );
  const activeGoogleBusinessProfiles = googleBusinessProfiles.filter(
    (profile) => profile.status !== "removed",
  );
  const confirmedGoogleBusinessProfiles = activeGoogleBusinessProfiles.filter(
    (profile) => profile.status === "confirmed",
  );
  const pendingGoogleBusinessProfiles = activeGoogleBusinessProfiles.filter(
    (profile) => profile.status === "pending",
  );
  const googleBusinessStatus = getGoogleBusinessStatus({
    businessProfiles,
    confirmedGoogleBusinessProfiles,
    pendingGoogleBusinessProfiles,
  });
  const hasGoogleBusinessProfile = googleBusinessStatus !== "missing";
  const googleProfileForDetails =
    confirmedGoogleBusinessProfiles.at(0) ??
    pendingGoogleBusinessProfiles.at(0) ??
    null;
  const googleBusinessListingName = googleProfileForDetails?.displayName ?? null;
  const strongGoogleReviewPresence =
    googleBusinessStatus === "confirmed" &&
    ((googleProfileForDetails?.rating ?? 0) >= 4.3 ||
      (googleProfileForDetails?.reviewCount ?? 0) >= 100);
  const confirmedReviewPlatforms = uniquePlatformLabels([
    ...confirmedProfiles,
    ...confirmedGoogleBusinessProfiles.map(() => ({
      platform: ProfilePlatform.GOOGLE_BUSINESS,
      status: BusinessProfileStatus.CONFIRMED,
      label: platformLabels[ProfilePlatform.GOOGLE_BUSINESS],
    })),
  ]);
  const pendingReviewPlatforms = uniquePlatformLabels([
    ...pendingProfiles,
    ...(googleBusinessStatus === "confirmed"
      ? []
      : pendingGoogleBusinessProfiles.map(() => ({
          platform: ProfilePlatform.GOOGLE_BUSINESS,
          status: BusinessProfileStatus.PENDING,
          label: platformLabels[ProfilePlatform.GOOGLE_BUSINESS],
        }))),
  ]);
  const googleBusinessDiscoveryStatus = getGoogleBusinessDiscoveryStatus({
    googleBusinessStatus,
    googleDiscovery,
  });
  const competitorReviewCoverage = competitors.map((competitor) => {
    const competitorReviewProfiles = competitor.profiles.filter((profile) =>
      reviewPlatforms.has(profile.platform),
    );
    const confirmed = competitorReviewProfiles.filter(
      (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
    );
    const pending = competitorReviewProfiles.filter(
      (profile) => profile.status === BusinessProfileStatus.PENDING,
    );
    const googleStatus = getGoogleBusinessStatus({
      businessProfiles: competitor.profiles,
      confirmedGoogleBusinessProfiles: [],
      pendingGoogleBusinessProfiles: [],
    });

    return {
      competitorName: competitor.competitorName,
      hasGoogleBusinessProfile: googleStatus === "confirmed",
      confirmedPlatforms: uniquePlatformLabels(confirmed),
      pendingPlatforms: uniquePlatformLabels(pending),
    };
  });
  const competitorsWithGoogle = competitorReviewCoverage.filter(
    (competitor) => competitor.hasGoogleBusinessProfile,
  );
  const competitorHasBetterCoverage =
    googleBusinessStatus !== "confirmed" && competitorsWithGoogle.length > 0;
  const manualReviewCount = manualReviews.reduce(
    (total, item) => total + (item.reviewCount ?? 0),
    0,
  );
  const reviewPresenceLevel = getReviewPresenceLevel({
    googleBusinessStatus,
    confirmedPlatformsCount: confirmedReviewPlatforms.length,
    manualReviewCount,
    strongGoogleReviewPresence,
  });
  const trustStrengths: string[] = [];
  const trustWarnings: string[] = [];
  const opportunities: string[] = [];
  const recommendedFixes: string[] = [];

  if (googleBusinessStatus === "confirmed") {
    const detail = [
      googleProfileForDetails?.displayName,
      googleProfileForDetails?.rating
        ? `${googleProfileForDetails.rating.toFixed(1)} rating`
        : null,
      typeof googleProfileForDetails?.reviewCount === "number"
        ? `${googleProfileForDetails.reviewCount.toLocaleString()} reviews`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

    trustStrengths.push(
      detail
        ? `A confirmed Google Business profile is present: ${detail}.`
        : "A confirmed Google Business profile is present.",
    );
  }

  if (confirmedReviewPlatforms.length > 1) {
    trustStrengths.push(
      `Confirmed review-capable platforms include ${confirmedReviewPlatforms.join(
        ", ",
      )}.`,
    );
  }

  if (manualReviewCount > 0) {
    trustStrengths.push(
      `${manualReviewCount} manually-entered review${
        manualReviewCount === 1 ? "" : "s"
      } can be used for future trust analysis.`,
    );
  }

  if (googleBusinessStatus === "missing") {
    if (googleBusinessApplicability === "optional") {
      trustWarnings.push(
        "Google Business may not be essential for this business type unless it serves customers locally or in person.",
      );
      opportunities.push(
        "If the business has a local service area or in-person customer path, add or confirm the Google Business listing.",
      );
    } else if (googleBusinessDiscoveryStatus === "not_configured") {
      trustWarnings.push(
        "Google Business discovery is not configured yet, so the app could not verify a public Google listing.",
      );
      recommendedFixes.push(
        "Add a Google Places API key or manually add the Google Business listing.",
      );
    } else if (googleBusinessDiscoveryStatus === "searched_no_match") {
      trustWarnings.push("No confident Google Business match was found.");
      recommendedFixes.push(
        "Manually add the correct Google Maps URL or Place ID if one exists.",
      );
    } else if (googleBusinessDiscoveryStatus === "error") {
      trustWarnings.push(
        "Google Business discovery could not complete during this audit.",
      );
      recommendedFixes.push(
        "Try regenerating Google discovery or manually add the listing.",
      );
    } else {
      trustWarnings.push(
        googleBusinessApplicability === "important"
          ? "Google Business is an important trust channel for this business type. Confirm or manually add the listing if one exists."
          : "No Google Business Profile has been confirmed yet.",
      );
      recommendedFixes.push("Confirm or manually add a Google Business listing.");
    }
  }

  if (googleBusinessStatus === "pending") {
    trustWarnings.push(
      "A possible Google Business listing was found but has not been confirmed.",
    );
    recommendedFixes.push("Confirm your Google Business profile.");
  }

  if (
    trustGoal &&
    googleBusinessStatus !== "confirmed" &&
    googleBusinessApplicability !== "optional"
  ) {
    trustWarnings.push(
      "Your selected goals depend on customer trust and local visibility, but Google Business is not confirmed.",
    );
    recommendedFixes.push(
      "Prioritize Google Business confirmation before deeper local trust recommendations.",
    );
  }

  if (competitorHasBetterCoverage) {
    const competitorName = competitorsWithGoogle.at(0)?.competitorName;
    trustWarnings.push(
      `${competitorName} has confirmed review platform coverage while your business does not.`,
    );
    opportunities.push(
      "Use competitor review coverage as a benchmark for local trust setup.",
    );
  }

  if (confirmedReviewPlatforms.length === 0 && pendingReviewPlatforms.length > 0) {
    opportunities.push(
      `Review-capable platforms need confirmation: ${pendingReviewPlatforms.join(
        ", ",
      )}.`,
    );
  }

  if (googleBusinessStatus === "confirmed") {
    opportunities.push(
      hasWebsite
        ? "Next, collect and feature customer proof consistently across your website and profiles."
        : "Next, collect and feature customer proof consistently across profile bios, pinned posts, booking or storefront links, and sales conversations.",
    );
    recommendedFixes.push(
      "Create a lightweight review request process for happy customers.",
    );
  }

  if (strongGoogleReviewPresence) {
    opportunities.push(
      hasWebsite
        ? "Use your strong customer proof more visibly across the website."
        : "Use your strong customer proof more visibly across social profiles and conversion links.",
    );
    recommendedFixes.push(
      hasWebsite
        ? "Feature selected Google reviews or customer testimonials on the homepage, menu/services page, or primary customer decision path."
        : "Turn verified customer proof into a pinned social post, profile highlight, review card, or booking/storefront trust section.",
    );
  }

  if (pendingReviewPlatforms.length > 0) {
    recommendedFixes.push(
      "Confirm pending review platforms before relying on trust recommendations.",
    );
  }

  const score = scoreReviews({
    googleBusinessStatus,
    confirmedPlatformsCount: confirmedReviewPlatforms.length,
    pendingPlatformsCount: pendingReviewPlatforms.length,
    trustGoal,
    competitorHasBetterCoverage,
    manualReviewCount,
    googleBusinessApplicability,
    strongGoogleReviewPresence,
  });
  const reviewScoreExplanation = getReviewScoreExplanation({
    googleBusinessStatus,
    googleBusinessApplicability,
    rating: googleProfileForDetails?.rating ?? null,
    reviewCount: googleProfileForDetails?.reviewCount ?? null,
    confirmedPlatformsCount: confirmedReviewPlatforms.length,
    hasWebsite,
  });

  return {
    score,
    hasGoogleBusinessProfile,
    googleBusinessStatus,
    googleBusinessApplicability,
    googleBusinessListingName,
    googleBusinessDiscoveryStatus,
    googleBusinessProfiles: activeGoogleBusinessProfiles,
    googleRating: googleProfileForDetails?.rating ?? null,
    googleReviewCount: googleProfileForDetails?.reviewCount ?? null,
    googleMapsUri: googleProfileForDetails?.googleMapsUri ?? null,
    reviewScoreExplanation,
    confirmedReviewPlatforms,
    pendingReviewPlatforms,
    reviewPresenceLevel,
    trustStrengths,
    trustWarnings,
    opportunities,
    recommendedFixes: [...new Set(recommendedFixes)],
    competitorReviewCoverage,
  };
}

export function normalizeReviewAnalysisForDisplay(
  reviews: ReviewAnalysis,
): ReviewAnalysis {
  const googleListingNames = new Set(
    [
      reviews.googleBusinessListingName,
      ...reviews.googleBusinessProfiles.map((profile) => profile.displayName),
    ]
      .filter((name): name is string => Boolean(name))
      .map((name) => name.trim().toLowerCase()),
  );
  const normalizePlatforms = (platforms: string[]) =>
    [
      ...new Set(
        platforms.map((platform) => {
          const normalized = platform.trim().toLowerCase();

          if (
            normalized === "google business" ||
            normalized.startsWith("google business:") ||
            googleListingNames.has(normalized)
          ) {
            return platformLabels[ProfilePlatform.GOOGLE_BUSINESS];
          }

          return platform;
        }),
      ),
    ];

  return {
    ...reviews,
    confirmedReviewPlatforms: normalizePlatforms(
      reviews.confirmedReviewPlatforms,
    ),
    pendingReviewPlatforms: normalizePlatforms(reviews.pendingReviewPlatforms),
  };
}

function getGoogleBusinessStatus({
  businessProfiles,
  confirmedGoogleBusinessProfiles,
  pendingGoogleBusinessProfiles,
}: {
  businessProfiles: ReviewAnalyzerProfile[];
  confirmedGoogleBusinessProfiles: ReviewAnalyzerGoogleBusinessProfile[];
  pendingGoogleBusinessProfiles: ReviewAnalyzerGoogleBusinessProfile[];
}) {
  if (confirmedGoogleBusinessProfiles.length > 0) {
    return "confirmed" as const;
  }

  if (pendingGoogleBusinessProfiles.length > 0) {
    return "pending" as const;
  }

  const googleProfiles = businessProfiles.filter(
    (profile) => profile.platform === ProfilePlatform.GOOGLE_BUSINESS,
  );

  if (
    googleProfiles.some(
      (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
    )
  ) {
    return "confirmed" as const;
  }

  if (
    googleProfiles.some(
      (profile) => profile.status === BusinessProfileStatus.PENDING,
    )
  ) {
    return "pending" as const;
  }

  return "missing" as const;
}

function getGoogleBusinessDiscoveryStatus({
  googleBusinessStatus,
  googleDiscovery,
}: {
  googleBusinessStatus: GoogleBusinessStatus;
  googleDiscovery?: {
    apiConfigured?: boolean;
    searched?: boolean;
    error?: string;
  } | null;
}) {
  if (googleBusinessStatus === "confirmed") {
    return "confirmed" as const;
  }

  if (googleBusinessStatus === "pending") {
    return "pending" as const;
  }

  if (!googleDiscovery?.apiConfigured) {
    return "not_configured" as const;
  }

  if (googleDiscovery.error) {
    return "error" as const;
  }

  if (googleDiscovery.searched) {
    return "searched_no_match" as const;
  }

  return "not_searched" as const;
}

function uniquePlatformLabels(profiles: ReviewAnalyzerProfile[]) {
  return [
    ...new Set(
      profiles.map(
        (profile) => profile.label || platformLabels[profile.platform],
      ),
    ),
  ];
}

function getGoogleBusinessApplicability({
  goals,
  primaryGoal,
  businessContext,
}: {
  goals: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
  businessContext?: {
    description?: string | null;
    targetAudience?: string | null;
    mainOffer?: string | null;
    industry?: string | null;
    businessType?: string | null;
    primaryConversionGoal?: string | null;
  } | null;
}): GoogleBusinessApplicability {
  const selectedGoals = new Set(goals);
  const contextText = [
    businessContext?.description,
    businessContext?.targetAudience,
    businessContext?.mainOffer,
    businessContext?.industry,
    businessContext?.businessType,
    businessContext?.primaryConversionGoal,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const localGoal =
    primaryGoal === BusinessGoal.IMPROVE_LOCAL_VISIBILITY ||
    primaryGoal === BusinessGoal.MORE_CUSTOMERS ||
    selectedGoals.has(BusinessGoal.IMPROVE_LOCAL_VISIBILITY);

  if (
    localGoal ||
    /\b(local|nearby|in person|in-person|storefront|restaurant|bar|grill|cafe|coffee|food|dining|menu|venue|brewery|pub|pizza|salon|clinic|dentist|law|attorney|contractor|roofing|plumber|hvac|repair|appointment|reservation|tampa|location|hours)\b/.test(
      contextText,
    )
  ) {
    return "important";
  }

  if (
    /\b(saas|software|app|platform|online only|online-only|digital product|subscription|b2b|remote|creator tool|web app)\b/.test(
      contextText,
    ) &&
    !/\b(local|service area|in person|in-person|office|store|location)\b/.test(
      contextText,
    )
  ) {
    return "optional";
  }

  return "useful";
}

function getReviewPresenceLevel({
  googleBusinessStatus,
  confirmedPlatformsCount,
  manualReviewCount,
  strongGoogleReviewPresence,
}: {
  googleBusinessStatus: GoogleBusinessStatus;
  confirmedPlatformsCount: number;
  manualReviewCount: number;
  strongGoogleReviewPresence: boolean;
}): ReviewPresenceLevel {
  if (googleBusinessStatus === "missing" && confirmedPlatformsCount === 0) {
    return "none";
  }

  if (googleBusinessStatus === "pending" || confirmedPlatformsCount === 0) {
    return "low";
  }

  if (
    strongGoogleReviewPresence ||
    confirmedPlatformsCount >= 2 ||
    manualReviewCount >= 25
  ) {
    return "strong";
  }

  return "moderate";
}

function scoreReviews({
  googleBusinessStatus,
  confirmedPlatformsCount,
  pendingPlatformsCount,
  trustGoal,
  competitorHasBetterCoverage,
  manualReviewCount,
  googleBusinessApplicability,
  strongGoogleReviewPresence,
}: {
  googleBusinessStatus: GoogleBusinessStatus;
  confirmedPlatformsCount: number;
  pendingPlatformsCount: number;
  trustGoal: boolean;
  competitorHasBetterCoverage: boolean;
  manualReviewCount: number;
  googleBusinessApplicability: GoogleBusinessApplicability;
  strongGoogleReviewPresence: boolean;
}) {
  let score =
    googleBusinessStatus === "confirmed"
      ? trustGoal
        ? strongGoogleReviewPresence
          ? 84
          : 82
        : strongGoogleReviewPresence
          ? 80
          : 76
      : googleBusinessStatus === "pending"
        ? trustGoal
          ? 50
          : 58
        : googleBusinessApplicability === "optional"
          ? 58
          : trustGoal || googleBusinessApplicability === "important"
            ? 26
            : 38;

  score += Math.min(8, Math.max(0, confirmedPlatformsCount - 1) * 4);
  score += Math.min(8, Math.floor(manualReviewCount / 10) * 2);
  score -= Math.min(8, pendingPlatformsCount * 2);
  if (competitorHasBetterCoverage) score -= 6;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getReviewScoreExplanation({
  googleBusinessStatus,
  googleBusinessApplicability,
  rating,
  reviewCount,
  confirmedPlatformsCount,
  hasWebsite,
}: {
  googleBusinessStatus: GoogleBusinessStatus;
  googleBusinessApplicability: GoogleBusinessApplicability;
  rating: number | null;
  reviewCount: number | null;
  confirmedPlatformsCount: number;
  hasWebsite: boolean;
}) {
  if (
    googleBusinessStatus === "confirmed" &&
    ((rating ?? 0) >= 4.3 || (reviewCount ?? 0) >= 100)
  ) {
    return `Strong Google review presence${
      rating ? ` with a ${rating.toFixed(1)} rating` : ""
    }${
      typeof reviewCount === "number"
        ? ` and ${reviewCount.toLocaleString()} reviews`
        : ""
    }. Score can improve by featuring customer proof ${
      hasWebsite
        ? "on the website"
        : "across social profiles and the primary conversion path"
    }, confirming more review channels, and maintaining a consistent review request process.`;
  }

  if (googleBusinessStatus === "confirmed") {
    return `Google Business is confirmed. Score can improve by making customer proof more visible ${
      hasWebsite
        ? "on key website pages"
        : "in profiles, pinned content, and booking or storefront paths"
    }, confirming additional review channels, and building a repeatable review request process.`;
  }

  if (googleBusinessStatus === "pending") {
    return "A possible Google Business listing is pending. Confirm the correct listing before relying on Google rating, review count, or local trust recommendations.";
  }

  if (googleBusinessApplicability === "optional") {
    return "Google Business may be optional for this business type unless it serves customers locally or in person. Reviews score can improve through relevant proof, testimonials, and confirmed trust channels.";
  }

  if (googleBusinessApplicability === "important") {
    return "Google Business is an important trust channel for this business type. Confirm or manually add the listing if one exists, then feature customer proof near the primary conversion path.";
  }

  return `No Google Business listing is confirmed yet. Score can improve by confirming relevant review channels and showing customer proof where buyers make decisions.${
    confirmedPlatformsCount > 0
      ? ` ${confirmedPlatformsCount} review-capable platform${
          confirmedPlatformsCount === 1 ? " is" : "s are"
        } already confirmed.`
      : ""
  }`;
}

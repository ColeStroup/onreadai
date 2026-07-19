import "server-only";

import {
  BusinessGoal,
  BusinessProfileStatus,
  ProfilePlatform,
  RecommendationPriority,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";

import type { ReviewAnalysis } from "@/lib/analyzers/review-analyzer";
import type { SocialAnalysis } from "@/lib/analyzers/social-analyzer";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import {
  getOpenAIClient,
  getOpenAIModel,
  isOpenAIConfigured,
} from "@/lib/ai/openai-client";
import { businessGoalLabels } from "@/lib/goals";
import { logError, logWarn } from "@/lib/observability/log";
import { validateBusinessCompatibleContent } from "@/lib/reports/content-compatibility";
import {
  normalizeSocialStrategyData,
  type SocialContentPillar,
  type SocialPlatformRecommendation,
  type SocialStrategyData,
  type SocialStrategyPriority,
} from "@/lib/social-strategy";
import { prioritizeSocialPlatformsForBusiness } from "@/lib/social-platform-priority";

type SocialStrategyProfile = {
  platform: ProfilePlatform;
  status: BusinessProfileStatus;
  url?: string | null;
  handle?: string | null;
  displayName?: string | null;
};

type SocialStrategyCompetitor = {
  name: string;
  websiteUrl?: string | null;
  discoveredProfiles: Array<{
    platform: ProfilePlatform;
    label: string;
    status: BusinessProfileStatus;
  }>;
};

type SocialStrategyRecommendation = {
  title: string;
  description: string;
  category: ScoreCategory;
  priority: RecommendationPriority;
  status: RecommendationStatus;
};

export type GenerateSocialStrategyInput = {
  businessName: string;
  initialInput: string;
  businessContext: {
    description?: string | null;
    targetAudience?: string | null;
    mainOffer?: string | null;
    industry?: string | null;
    businessType?: string | null;
    primaryConversionGoal?: string | null;
    brandTone?: string | null;
    contextConfidence?: number | null;
    contextSource?: string | null;
    contextConfirmedAt?: Date | null;
  };
  goals?: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
  profiles?: SocialStrategyProfile[];
  competitors?: SocialStrategyCompetitor[];
  socialAnalysis?: SocialAnalysis | null;
  reviewAnalysis?: ReviewAnalysis | null;
  websiteAnalysis?: WebsiteAnalysis | null;
  recommendations?: SocialStrategyRecommendation[];
};

export type GeneratedSocialStrategy = SocialStrategyData & {
  source: "ai_generated" | "fallback";
};

type StrategyArchetype =
  | "creator_community"
  | "restaurant_hospitality"
  | "local_service"
  | "beauty_fitness"
  | "ecommerce"
  | "saas_software"
  | "professional_service"
  | "general";

export async function generateSocialStrategy(
  input: GenerateSocialStrategyInput,
): Promise<GeneratedSocialStrategy> {
  if (!isOpenAIConfigured()) return generateDeterministicSocialStrategy(input);

  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getOpenAIModel(),
      instructions: `You generate a practical Social Strategy for an AI growth audit app.

Rules:
- Treat saved Business Context as the primary guide and never borrow terminology from another industry.
- Hospitality and visual local businesses usually favor Instagram, Facebook, TikTok, Google Business, and YouTube Shorts. LinkedIn belongs only when B2B, hiring, corporate events, recruiting, catering, or partnerships are supported by evidence.
- SaaS and professional B2B businesses may prioritize LinkedIn. Creator/community channels such as Discord or Reddit belong only when the saved audience explicitly supports them.
- A website is optional. Social-first conversions can include a DM, follow, profile booking or storefront link, community join, subscription, call, or email.
- Never recommend a website destination that was not provided.
- Never claim to have analyzed individual posts, engagement, posting frequency, content performance, reach, impressions, or audience growth.
- Do not invent performance metrics, customer quotes, or competitor behavior.
- If evidence is limited, say so and direct the user to review Business Context.
- Return only valid JSON with these keys: recommendedPlatforms, contentPillars, weeklyPlan, suggestedPosts, conversionTips, competitorOpportunities, confidence, reasoningSummary.`,
      input: `Saved evidence:\n${JSON.stringify(buildCompactEvidence(input), null, 2)}`,
      max_output_tokens: 1600,
      store: false,
    });
    const parsed = parseStrategyJson(response.output_text);
    if (parsed) {
      const finalized = finalizeSocialStrategy(parsed, input);
      if (isCompatibleStrategy(finalized, input)) {
        return { ...finalized, source: "ai_generated" };
      }

      logWarn("social_strategy_compatibility_rejected");
    }
  } catch (error) {
    logError("social_strategy_ai_failed", error);
  }

  return generateDeterministicSocialStrategy(input);
}

export function generateDeterministicSocialStrategy(
  input: GenerateSocialStrategyInput,
): GeneratedSocialStrategy {
  const contextText = contextTextFor(input);
  const archetype = detectArchetype(contextText);
  const recommendedPlatforms = platformRecommendationsFor(archetype, input);
  const contentPillars = contentPillarsFor(archetype, input);
  const weeklyPlan = weeklyPlanFor(
    archetype,
    recommendedPlatforms,
    contentPillars,
    input,
  );
  const suggestedPosts = suggestedPostsFor(
    archetype,
    recommendedPlatforms,
    contentPillars,
    input,
  );
  const socialFirst = !hasConfirmedWebsiteProfile(input);
  const strategy = normalizeSocialStrategyData({
    recommendedPlatforms,
    contentPillars,
    weeklyPlan,
    suggestedPosts,
    conversionTips: conversionTipsFor(archetype, input),
    competitorOpportunities: competitorOpportunitiesFor(input),
    confidence: confidenceFor(input, archetype),
    reasoningSummary:
      input.businessContext.description || input.businessContext.targetAudience
        ? `Deterministic strategy generated from current Business Context, confirmed profiles, goals, reviews, and competitor evidence${socialFirst ? " for a social-first business" : ""}. Individual posts, engagement, posting frequency, and content performance were not analyzed.`
        : "Deterministic strategy generated with limited Business Context. Review the Context tab before relying on detailed audience or content assumptions.",
  });

  return { ...finalizeSocialStrategy(strategy, input), source: "fallback" };
}

function finalizeSocialStrategy(
  strategy: SocialStrategyData,
  input: GenerateSocialStrategyInput,
) {
  const recommendedPlatforms = prioritizeSocialPlatformsForBusiness({
    recommendations: strategy.recommendedPlatforms,
    businessContext: input.businessContext,
    profiles: input.profiles,
  });
  const names = new Set(
    recommendedPlatforms.map((item) => normalizedPlatformName(item.platform)),
  );
  return {
    ...strategy,
    recommendedPlatforms,
    weeklyPlan: strategy.weeklyPlan.filter((item) =>
      names.has(normalizedPlatformName(item.platform)),
    ),
    suggestedPosts: strategy.suggestedPosts.filter((item) =>
      names.has(normalizedPlatformName(item.platform)),
    ),
  };
}

function buildCompactEvidence(input: GenerateSocialStrategyInput) {
  const formatProfiles = (status: BusinessProfileStatus) =>
    (input.profiles ?? [])
      .filter((profile) => profile.status === status)
      .map((profile) => ({
        platform: profile.platform,
        value: profile.url ?? profile.handle ?? profile.displayName ?? null,
      }));

  return {
    businessName: input.businessName,
    originalInput: input.initialInput,
    assessmentMode: hasConfirmedWebsiteProfile(input)
      ? "website_enabled"
      : "social_first",
    businessContext: input.businessContext,
    goals: input.goals?.map((goal) => businessGoalLabels[goal]) ?? [],
    primaryGoal: input.primaryGoal
      ? businessGoalLabels[input.primaryGoal]
      : null,
    profiles: {
      confirmed: formatProfiles(BusinessProfileStatus.CONFIRMED),
      pending: formatProfiles(BusinessProfileStatus.PENDING),
      missingRecommended:
        input.socialAnalysis?.missingRecommendedPlatforms ?? [],
    },
    socialAnalysis: input.socialAnalysis
      ? {
          score: input.socialAnalysis.score,
          coverage: input.socialAnalysis.platformCoverageLevel,
          strengths: input.socialAnalysis.strengths.slice(0, 4),
          warnings: input.socialAnalysis.warnings.slice(0, 4),
          opportunities: input.socialAnalysis.opportunities.slice(0, 4),
        }
      : null,
    reviews: input.reviewAnalysis
      ? {
          googleBusinessStatus: input.reviewAnalysis.googleBusinessStatus,
          rating: input.reviewAnalysis.googleRating,
          reviewCount: input.reviewAnalysis.googleReviewCount,
        }
      : null,
    website: input.websiteAnalysis
      ? {
          title: input.websiteAnalysis.pageTitle,
          description: input.websiteAnalysis.metaDescription,
          actions:
            input.websiteAnalysis.actionSummary?.primaryActions ??
            input.websiteAnalysis.ctaCandidates.slice(0, 8),
        }
      : null,
    competitors: (input.competitors ?? []).slice(0, 8).map((competitor) => ({
      name: competitor.name,
      websiteUrl: competitor.websiteUrl ?? null,
      confirmedPlatforms: competitor.discoveredProfiles
        .filter((profile) => profile.status === BusinessProfileStatus.CONFIRMED)
        .map((profile) => profile.label || profile.platform),
      pendingPlatforms: competitor.discoveredProfiles
        .filter((profile) => profile.status === BusinessProfileStatus.PENDING)
        .map((profile) => profile.label || profile.platform),
    })),
    openRecommendations: (input.recommendations ?? [])
      .filter(
        (item) =>
          item.status !== RecommendationStatus.COMPLETED &&
          item.status !== RecommendationStatus.DISMISSED,
      )
      .slice(0, 8)
      .map((item) => ({
        title: item.title,
        category: item.category,
        priority: item.priority,
      })),
    limitations: [
      "Saved profile URLs and confirmation states were used.",
      "Individual posts, engagement, posting frequency, and content performance were not analyzed.",
    ],
  };
}

function detectArchetype(text: string): StrategyArchetype {
  if (/\b(restaurant|pizza|cafe|bar|bakery|menu|grill|brewery|pub|venue|hospitality|tourism|beach club|dining)\b/.test(text)) {
    return "restaurant_hospitality";
  }
  if (/\b(discord|gaming audience|guild|server owner|content creator|creator business|community manager|twitch|streamer)\b/.test(text)) {
    return "creator_community";
  }
  if (/\b(beauty|fitness|gym|salon|spa|coach|wellness|trainer)\b/.test(text)) {
    return "beauty_fitness";
  }
  if (/\b(ecommerce|e-commerce|online store|retail|product catalog|checkout)\b/.test(text)) {
    return "ecommerce";
  }
  if (/\b(roofing|roofer|plumb(?:er|ing)?|hvac|contractor|electrician|service area|repair service|dentist|clinic)\b/.test(text)) {
    return "local_service";
  }
  if (/\b(saas|software|software platform|web app|mobile app|free trial|product demo|onboarding flow|b2b)\b/.test(text)) {
    return "saas_software";
  }
  if (/\b(agency|consultant|consulting|freelancer|professional service|advisory)\b/.test(text)) {
    return "professional_service";
  }
  return "general";
}

function platformRecommendationsFor(
  archetype: StrategyArchetype,
  input: GenerateSocialStrategyInput,
): SocialPlatformRecommendation[] {
  const confirmed = new Set(
    (input.profiles ?? [])
      .filter((profile) => profile.status === BusinessProfileStatus.CONFIRMED)
      .map((profile) => profile.platform),
  );
  const make = (
    platform: string,
    priority: SocialStrategyPriority,
    reason: string,
    contentFit: string,
    confidence: number,
  ) => ({
    platform,
    priority,
    reason,
    contentFit,
    confidence: confirmed.has(platformToProfilePlatform(platform))
      ? Math.min(95, confidence + 8)
      : confidence,
  });

  switch (archetype) {
    case "restaurant_hospitality":
      return [
        make("Instagram", "high", "Visual food, atmosphere, event, and customer-experience content fits hospitality discovery.", "Reels, menu highlights, atmosphere, guest moments, and events.", 80),
        make("Facebook", "high", "Facebook supports local updates, events, practical visit information, and community awareness.", "Events, hours, offers, local stories, and customer proof.", 74),
        make("TikTok", "high", "Short hospitality videos can create discovery around atmosphere, food, drinks, and local moments.", "Short preparation, atmosphere, menu, event, and local-story videos.", 74),
        make("YouTube Shorts", "medium", "Short video can extend visual stories and event clips across another discovery surface.", "Atmosphere, menu highlights, event recaps, and local traditions.", 65),
        make("Google Business", "high", "Local discovery and trust depend on current listing, photo, and review signals.", "Photo updates, practical visit information, and authentic review prompts.", 78),
      ];
    case "creator_community":
      if (!hasExplicitCommunityEvidence(input)) {
        return [
          make("Instagram", "high", "A confirmed visual profile can anchor proof, useful education, and offer clarity.", "Short demonstrations, finished work, teaching, proof, and offer-led posts.", 75),
          make("TikTok", "high", "Short educational and process-led video fits social-first creator discovery.", "Fast teaching, process clips, useful hooks, and offer examples.", 76),
          make("YouTube Shorts", "medium", "Reusable short tutorials can extend useful creator content to another discovery surface.", "Mini tutorials, process demonstrations, and audience questions.", 67),
        ];
      }
      return [
        make("TikTok", "high", "Short problem and workflow clips fit creator and community audiences.", "Fast teaching, workflow demonstrations, and audience-specific examples.", 76),
        make("YouTube Shorts", "high", "Short tutorials can teach and demonstrate a community workflow clearly.", "Mini tutorials, practical lessons, and product use cases.", 73),
        make("Discord communities", "medium", "Direct community distribution fits only because the saved audience explicitly supports it.", "Helpful discussions, templates, and community-specific guidance.", 68),
        make("Reddit", "medium", "Relevant communities can support helpful, non-promotional education.", "Transparent answers, guides, and practical lessons.", 60),
      ];
    case "local_service":
    case "beauty_fitness":
      return [
        make("Google Business", "high", "Local trust and discovery often start with Google Business.", "Photos, service updates, review prompts, and practical contact information.", 78),
        make("Instagram", "high", "Visual proof, people, and finished work support local trust.", "Before/after proof, customer stories, tips, and team content.", 72),
        make("Facebook", "medium", "Facebook supports local referrals and community awareness.", "Local updates, proof, services, and customer questions.", 62),
        make("TikTok", "medium", "Simple educational or transformation videos can support local discovery.", "Quick tips, common mistakes, and visual proof.", 58),
      ];
    case "ecommerce":
      return [
        make("Instagram", "high", "Visual product discovery and proof support purchase decisions.", "Product demonstrations, use cases, customer proof, and offers.", 74),
        make("TikTok", "high", "Short product-led content can create demand before a shopper searches.", "Problem/solution clips, demonstrations, and use cases.", 76),
        make("Pinterest", "medium", "Pinterest can support evergreen discovery for visual products.", "Collections, use-case boards, and seasonal guides.", 61),
        make("YouTube Shorts", "medium", "Short demonstrations can explain product value quickly.", "How-to clips, comparisons, and product education.", 62),
      ];
    case "saas_software":
      return [
        make("LinkedIn", "high", "Professional product education fits when the saved buyer is business-oriented.", "Customer problems, product lessons, case studies, and founder perspective.", 72),
        make("YouTube Shorts", "high", "Short demonstrations can explain software workflows faster than static claims.", "Mini demos, use cases, and problem/solution clips.", 72),
        make("TikTok", "medium", "Short product education may fit when the target audience uses social-first discovery.", "Fast demonstrations, mistakes, and founder clips.", 58),
      ];
    case "professional_service":
      return [
        make("LinkedIn", "high", "Professional service buyers often evaluate expertise through useful point-of-view content.", "Client lessons, practical breakdowns, and case-study summaries.", 74),
        make("YouTube Shorts", "medium", "Short explainers turn expertise into reusable discovery content.", "FAQ answers, myths, and tactical guidance.", 64),
        make("Instagram", "medium", "Instagram can humanize the brand and show proof where personal trust matters.", "Behind the scenes, proof, and concise advice.", 57),
      ];
    default:
      return [
        make("Instagram", "medium", "A flexible channel for proof, useful education, and human context.", "Proof, short clips, education, and behind-the-scenes content.", 55),
        make("YouTube Shorts", "medium", "Short video can explain value without requiring a large audience first.", "Tips, demonstrations, and customer questions.", 55),
        make("LinkedIn", "low", "Useful only if the confirmed audience is professional or partnership-driven.", "Authority content and useful business lessons.", 45),
      ];
  }
}

function contentPillarsFor(
  archetype: StrategyArchetype,
  input: GenerateSocialStrategyInput,
): SocialContentPillar[] {
  const audience = input.businessContext.targetAudience || "the target audience";
  const offer = input.businessContext.mainOffer || input.businessName;

  if (archetype === "restaurant_hospitality") {
    return [
      {
        title: "Atmosphere and reasons to visit",
        description: "Show the setting, guest experience, local character, events, and moments that make a visit distinctive.",
        exampleTopics: ["Atmosphere at different times of day", "Local traditions and event moments", "A guest's visit experience"],
      },
      {
        title: "Food, drinks, and menu highlights",
        description: "Make the offer tangible with specific dishes, drinks, preparation, seasonal items, and confirmed ordering paths.",
        exampleTopics: ["A signature menu item", "Behind the scenes of preparation", "What to order for a particular occasion"],
      },
      {
        title: "Customer proof and local connection",
        description: "Use authentic customer proof, staff stories, community activity, and practical visit information to build trust.",
        exampleTopics: ["A verified review theme", "A staff or local-partner story", "Hours, directions, events, takeout, or gift cards"],
      },
    ];
  }

  if (archetype === "creator_community") {
    if (!hasExplicitCommunityEvidence(input)) {
      return [
        { title: "Audience problems and useful teaching", description: "Teach around the practical problems and questions named in Business Context.", exampleTopics: ["A common mistake", "A practical process", "A useful checklist"] },
        { title: "Creative process and proof", description: "Show authentic work, process, and customer proof without inventing performance results.", exampleTopics: ["A process walkthrough", "Finished work", "An approved customer story"] },
        { title: "Offer and profile conversion", description: "Make the offer and social-first next step easy to understand.", exampleTopics: ["Who the offer helps", "What is included", "How to DM, book, or use the profile link"] },
      ];
    }
    return [
      { title: "Audience pain points", description: "Teach around the practical community or creator problems named in Business Context.", exampleTopics: ["A common workflow mistake", "A practical checklist", "A problem the audience already recognizes"] },
      { title: "Workflows and demonstrations", description: "Show useful processes or product workflows without inventing performance results.", exampleTopics: ["A short walkthrough", "Before and after the workflow", "A repeatable process"] },
      { title: "Community education and proof", description: "Combine practical lessons with authentic proof and a clear profile conversion path.", exampleTopics: ["A useful framework", "A verified customer story", "A clear next step"] },
    ];
  }

  if (archetype === "local_service" || archetype === "beauty_fitness") {
    return [
      { title: "Local proof", description: "Show credible work, customer trust, people, and service-area relevance.", exampleTopics: ["Completed work", "Verified customer proof", "Team or process"] },
      { title: "Useful customer education", description: "Answer questions that help a potential customer understand the service and make a confident decision.", exampleTopics: ["Common warning signs", "What to expect", "How to choose the right service"] },
      { title: "Clear booking or contact path", description: "Connect useful content to one confirmed call, booking, quote, or contact action.", exampleTopics: ["Service availability", "How to request help", "What happens next"] },
    ];
  }

  return [
    { title: "Audience problem education", description: `Teach ${audience} how to understand the problem ${offer} addresses.`, exampleTopics: ["Common mistakes", "When the current approach stops working", "How to evaluate a solution"] },
    { title: "Proof and trust", description: "Show authentic evidence that the business is credible and useful.", exampleTopics: ["Customer story or use case", "Process or demonstration", "Verified review or result context"] },
    { title: "Offer and next-step clarity", description: "Repeat the offer, audience, and confirmed conversion path in simple language.", exampleTopics: ["Who this is for", "What the offer includes", "What happens after the next step"] },
  ];
}

function weeklyPlanFor(
  archetype: StrategyArchetype,
  platforms: SocialPlatformRecommendation[],
  pillars: SocialContentPillar[],
  input: GenerateSocialStrategyInput,
) {
  const primary = platforms.at(0)?.platform ?? "Best-fit platform";
  const secondary = platforms.at(1)?.platform ?? primary;
  const conversionGoal =
    input.businessContext.primaryConversionGoal ||
    socialFirstConversion(input);
  const restaurantIdeas = [
    "Show one vivid part of the guest experience or atmosphere with a clear reason to visit.",
    "Feature one specific dish or drink and the relevant visit or order path.",
    "Turn a verified review theme or approved customer story into visual trust without inventing a quote.",
    "Share a current event, local tradition, staff story, or community moment.",
    "Post one clear reason to view the menu, check hours, get directions, attend an event, order, or use another confirmed path.",
  ];
  const generalIdeas = [
    `Teach one useful idea from ${pillars[0]?.title ?? "the main audience problem"}.`,
    `Show authentic proof tied to ${pillars[1]?.title ?? "the offer"}.`,
    `Explain the offer and who it is for using ${pillars[2]?.title ?? "clear language"}.`,
    "Show the process, people, product, or preparation behind the outcome.",
    "Use one direct call-to-action that matches the confirmed conversion path.",
  ];
  const ideas = archetype === "restaurant_hospitality" ? restaurantIdeas : generalIdeas;

  return ideas.map((idea, index) => ({
    day: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][index],
    platform: index % 2 === 0 ? primary : secondary,
    contentType: ["Education", "Proof", "Offer clarity", "Behind the scenes", "Direct action"][index],
    idea,
    goal: index === 4 ? conversionGoal : "Build relevant trust and attention.",
  }));
}

function suggestedPostsFor(
  archetype: StrategyArchetype,
  platforms: SocialPlatformRecommendation[],
  pillars: SocialContentPillar[],
  input: GenerateSocialStrategyInput,
) {
  const primary = platforms.at(0)?.platform ?? "Best-fit platform";
  const secondary = platforms.at(1)?.platform ?? primary;
  const cta =
    input.businessContext.primaryConversionGoal || socialFirstConversion(input);
  if (archetype === "restaurant_hospitality") {
    return [
      { platform: primary, hook: "Here is one reason to make this your next stop.", postConcept: "Pair the atmosphere with one specific menu, event, or visit detail.", captionDraft: `${input.businessName} brings the setting and the offer together. Show what a real visit feels like, then make the next step easy to find.`, callToAction: cta },
      { platform: secondary, hook: "What would you order first?", postConcept: "Feature one menu item or drink with a concise preparation or experience story.", captionDraft: "Specific menu details make the experience easier to imagine and give people a practical reason to visit or order.", callToAction: cta },
      { platform: primary, hook: "Plan the visit around this moment.", postConcept: "Highlight a current event, local tradition, atmosphere moment, or useful visit detail.", captionDraft: "Connect the visual story to current hours, directions, events, takeout, gift cards, or another confirmed action.", callToAction: cta },
    ];
  }

  return pillars.slice(0, 3).map((pillar, index) => ({
    platform: index === 1 ? secondary : primary,
    hook: pillar.exampleTopics.at(0) ?? pillar.title,
    postConcept: pillar.description,
    captionDraft: `${input.businessName}: ${pillar.title}. Explain one useful idea, support it with current evidence, and keep the next step clear.`,
    callToAction: cta,
  }));
}

function conversionTipsFor(
  archetype: StrategyArchetype,
  input: GenerateSocialStrategyInput,
) {
  const destination = hasConfirmedWebsiteProfile(input)
    ? "destination page"
    : "profile action or link destination";
  if (archetype === "restaurant_hospitality") {
    return [
      { tip: "Connect every visual story to a practical visit action", reason: "Atmosphere and menu content work harder when the viewer can immediately check hours, view the menu, get directions, see an event, order, or use another confirmed path." },
      { tip: "Pin one experience post and one practical visit post", reason: "New profile visitors should quickly see both why the experience is distinctive and how to plan a visit or order." },
      { tip: "Use one clear call-to-action per post", reason: "A single relevant next step is easier to follow than several competing actions." },
    ];
  }
  return [
    { tip: "Make the profile link match the post promise", reason: `The ${destination} should continue the same message and make the next step obvious.` },
    { tip: "Pin one proof post and one offer post", reason: "New viewers often check the profile before clicking, so pinned content should explain trust and the next step quickly." },
    { tip: "Use one clear call-to-action per post", reason: "Attention leaks when a post asks viewers to do several unrelated things." },
  ];
}

function competitorOpportunitiesFor(input: GenerateSocialStrategyInput) {
  const competitors = input.competitors ?? [];
  const confirmed = competitors.filter((competitor) =>
    competitor.discoveredProfiles.some(
      (profile) => profile.status === BusinessProfileStatus.CONFIRMED,
    ),
  );
  if (confirmed.length > 0) {
    return [
      {
        opportunity: `Compare confirmed platform coverage with ${confirmed.slice(0, 3).map((item) => item.name).join(", ")}.`,
        reason: "Confirmed profile coverage can guide manual channel review, but the app did not inspect competitor posts, engagement, or publishing behavior.",
      },
      {
        opportunity: "Review publicly observable profile positioning and website calls to action.",
        reason: "Use saved public links to compare messaging and conversion paths without making performance claims.",
      },
    ];
  }
  const pending = competitors.some((competitor) =>
    competitor.discoveredProfiles.some(
      (profile) => profile.status === BusinessProfileStatus.PENDING,
    ),
  );
  if (pending) {
    return [{ opportunity: "Confirm pending competitor profiles.", reason: "Comparison is more trustworthy when confirmed and pending links remain separate." }];
  }
  return competitors.length > 0
    ? [{ opportunity: "Add confirmed public links for saved competitors.", reason: "No confirmed competitor profile coverage is available yet." }]
    : [];
}

function isCompatibleStrategy(
  strategy: SocialStrategyData,
  input: GenerateSocialStrategyInput,
) {
  const text = [
    strategy.reasoningSummary,
    ...strategy.recommendedPlatforms.flatMap((item) => [item.platform, item.reason, item.contentFit]),
    ...strategy.contentPillars.flatMap((item) => [item.title, item.description, ...item.exampleTopics]),
    ...strategy.weeklyPlan.flatMap((item) => [item.idea, item.goal]),
    ...strategy.suggestedPosts.flatMap((item) => [item.hook, item.postConcept, item.captionDraft, item.callToAction]),
    ...strategy.conversionTips.flatMap((item) => [item.tip, item.reason]),
    ...strategy.competitorOpportunities.flatMap((item) => [item.opportunity, item.reason]),
  ].join(" ");
  return validateBusinessCompatibleContent({
    item: { title: "Social Strategy", description: text },
    context: { name: input.businessName, ...input.businessContext },
    sourceEvidence: contextTextFor(input),
  }).compatible;
}

function parseStrategyJson(value?: string | null) {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return normalizeSocialStrategyData(JSON.parse(cleaned));
  } catch {
    return null;
  }
}

function confidenceFor(
  input: GenerateSocialStrategyInput,
  archetype: StrategyArchetype,
) {
  let confidence = 40;
  if (input.businessContext.description) confidence += 12;
  if (input.businessContext.targetAudience) confidence += 12;
  if (input.businessContext.mainOffer) confidence += 8;
  if (input.businessContext.primaryConversionGoal) confidence += 8;
  if (input.businessContext.contextConfirmedAt) confidence += 8;
  if (input.socialAnalysis) confidence += 6;
  if (input.reviewAnalysis) confidence += 4;
  if (archetype !== "general") confidence += 4;
  return Math.min(92, confidence);
}

function hasConfirmedWebsiteProfile(input: GenerateSocialStrategyInput) {
  return (input.profiles ?? []).some(
    (profile) =>
      profile.platform === ProfilePlatform.WEBSITE &&
      profile.status === BusinessProfileStatus.CONFIRMED &&
      Boolean(profile.url?.trim()),
  );
}

function socialFirstConversion(input: GenerateSocialStrategyInput) {
  return hasConfirmedWebsiteProfile(input)
    ? "Use the confirmed website path to take the next step."
    : "Send a DM, call, email, use the profile link, book, shop, subscribe, or take the confirmed social-first next step.";
}

function contextTextFor(input: GenerateSocialStrategyInput) {
  return [
    input.businessName,
    input.initialInput,
    ...Object.values(input.businessContext),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasExplicitCommunityEvidence(input: GenerateSocialStrategyInput) {
  return /\b(discord|gaming audience|guild|server owner|community manager|twitch|streamer|online community)\b/.test(
    contextTextFor(input),
  );
}

function normalizedPlatformName(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("youtube")) return "youtube";
  if (normalized.includes("twitter") || normalized === "x") return "x";
  return normalized.replace(/[^a-z0-9]+/g, "");
}

function platformToProfilePlatform(platform: string) {
  const normalized = normalizedPlatformName(platform);
  if (normalized.includes("instagram")) return ProfilePlatform.INSTAGRAM;
  if (normalized.includes("facebook")) return ProfilePlatform.FACEBOOK;
  if (normalized.includes("tiktok")) return ProfilePlatform.TIKTOK;
  if (normalized.includes("youtube")) return ProfilePlatform.YOUTUBE;
  if (normalized.includes("linkedin")) return ProfilePlatform.LINKEDIN;
  if (normalized === "x" || normalized.includes("twitter")) return ProfilePlatform.X;
  if (normalized.includes("pinterest")) return ProfilePlatform.PINTEREST;
  if (normalized.includes("google")) return ProfilePlatform.GOOGLE_BUSINESS;
  return ProfilePlatform.OTHER;
}

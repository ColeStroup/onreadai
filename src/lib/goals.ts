import { BusinessGoal, RecommendationPriority, ScoreCategory } from "@prisma/client";

type RecommendationLike = {
  title: string;
  description: string;
  category: ScoreCategory;
  priority: RecommendationPriority;
};

export const orderedBusinessGoals: BusinessGoal[] = [
  BusinessGoal.MORE_CUSTOMERS,
  BusinessGoal.MORE_LEADS,
  BusinessGoal.IMPROVE_WEBSITE,
  BusinessGoal.IMPROVE_SEO,
  BusinessGoal.GROW_SOCIAL_MEDIA,
  BusinessGoal.INCREASE_SALES,
  BusinessGoal.BEAT_COMPETITORS,
  BusinessGoal.IMPROVE_BRANDING,
  BusinessGoal.INCREASE_CONVERSIONS,
  BusinessGoal.BUILD_EMAIL_LIST,
  BusinessGoal.IMPROVE_LOCAL_VISIBILITY,
  BusinessGoal.OTHER,
];

export const businessGoalLabels: Record<BusinessGoal, string> = {
  MORE_CUSTOMERS: "More customers",
  MORE_LEADS: "More leads",
  IMPROVE_WEBSITE: "Improve website",
  IMPROVE_SEO: "Improve SEO",
  GROW_SOCIAL_MEDIA: "Grow social media",
  INCREASE_SALES: "Increase sales",
  BEAT_COMPETITORS: "Beat competitors",
  IMPROVE_BRANDING: "Improve branding",
  INCREASE_CONVERSIONS: "Increase conversions",
  BUILD_EMAIL_LIST: "Build email list",
  IMPROVE_LOCAL_VISIBILITY: "Improve local visibility",
  OTHER: "Other",
};

export const businessGoalDescriptions: Record<BusinessGoal, string> = {
  MORE_CUSTOMERS: "Attract more qualified buyers and repeat customers.",
  MORE_LEADS: "Turn more visitors and profile viewers into leads.",
  IMPROVE_WEBSITE: "Make the website clearer, faster to trust, and easier to act on.",
  IMPROVE_SEO: "Improve search visibility and homepage SEO fundamentals.",
  GROW_SOCIAL_MEDIA: "Build a more consistent social presence and content rhythm.",
  INCREASE_SALES: "Improve the path from interest to purchase.",
  BEAT_COMPETITORS: "Compare against competitors and find positioning gaps.",
  IMPROVE_BRANDING: "Make profiles, messaging, and visuals feel more consistent.",
  INCREASE_CONVERSIONS: "Get more visitors to take the next step.",
  BUILD_EMAIL_LIST: "Capture more owned audience and nurture demand.",
  IMPROVE_LOCAL_VISIBILITY: "Strengthen local search, reviews, and map readiness.",
  OTHER: "Keep recommendations flexible for a custom business priority.",
};

const defaultSuggestedQuestions = [
  "What should I fix first?",
  "Why is my website score low?",
  "What should I post this week?",
  "How can I improve my social presence?",
  "How do I compare to my competitors?",
  "Create a 7-day action plan.",
];

const goalSuggestedQuestions: Partial<Record<BusinessGoal, string[]>> = {
  IMPROVE_SEO: [
    "What SEO fix should I do first?",
    "Which search issue is holding me back most?",
  ],
  GROW_SOCIAL_MEDIA: [
    "What should I post this week?",
    "How can I improve my social presence?",
  ],
  BEAT_COMPETITORS: [
    "How can I use competitor tracking?",
    "How do I compare to my competitors?",
  ],
  MORE_LEADS: [
    "How can I turn more visitors into leads?",
    "What lead capture step should I add first?",
  ],
  INCREASE_CONVERSIONS: [
    "What is hurting conversions most?",
    "Which CTA should I improve first?",
  ],
  IMPROVE_WEBSITE: [
    "What website fix should I do first?",
    "Why is my website score low?",
  ],
  MORE_CUSTOMERS: [
    "What should I fix first to get more customers?",
    "Where am I losing customer trust?",
  ],
  INCREASE_SALES: [
    "What is blocking more sales?",
    "How can I make the offer clearer?",
  ],
  IMPROVE_BRANDING: [
    "Where is my branding inconsistent?",
    "How should I improve my profile messaging?",
  ],
  BUILD_EMAIL_LIST: [
    "How can I capture more email subscribers?",
    "What lead magnet should I create first?",
  ],
  IMPROVE_LOCAL_VISIBILITY: [
    "How can I improve local visibility?",
    "What local SEO fix should I do first?",
  ],
};

const goalQuestionLimit = 6;

function uniqueGoals(goals: BusinessGoal[], primaryGoal?: BusinessGoal | null) {
  const ordered = primaryGoal ? [primaryGoal, ...goals] : goals;
  return ordered.filter((goal, index) => ordered.indexOf(goal) === index);
}

export function getSuggestedQuestionsForGoals(
  goals: BusinessGoal[] = [],
  primaryGoal?: BusinessGoal | null,
  competitorNames: string[] = [],
  socialScore?: number | null,
  reviewScore?: number | null,
  googleBusinessStatus?: "missing" | "pending" | "confirmed" | null,
  businessContext?: {
    description?: string | null;
    targetAudience?: string | null;
    businessType?: string | null;
    primaryConversionGoal?: string | null;
    contextConfirmedAt?: Date | string | null;
  } | null,
) {
  const selectedGoals = uniqueGoals(goals, primaryGoal);
  const socialGoalSelected = selectedGoals.includes(
    BusinessGoal.GROW_SOCIAL_MEDIA,
  );
  const localTrustGoals: BusinessGoal[] = [
      BusinessGoal.MORE_CUSTOMERS,
      BusinessGoal.MORE_LEADS,
      BusinessGoal.IMPROVE_LOCAL_VISIBILITY,
      BusinessGoal.INCREASE_SALES,
  ];
  const localTrustGoalSelected = selectedGoals.some((goal) =>
    localTrustGoals.includes(goal),
  );
  const socialPriorityQuestions =
    socialGoalSelected || (typeof socialScore === "number" && socialScore < 55)
      ? [
          "What social platform should I focus on first?",
          "What should I post this week?",
          "How can I improve my social presence?",
          "Are my competitors stronger on social?",
        ]
      : [];
  const reviewPriorityQuestions =
    localTrustGoalSelected ||
    googleBusinessStatus === "missing" ||
    googleBusinessStatus === "pending" ||
    (typeof reviewScore === "number" && reviewScore < 55)
      ? [
          "How can I improve trust signals?",
          "Do I need a Google Business profile?",
          "How can reviews help me get more customers?",
          "Are competitors stronger on local trust?",
        ]
      : [];
  const competitorQuestions =
    competitorNames.length > 0
      ? [
          `How should I compete against ${competitorNames[0]}?`,
          "What should I watch from my competitors?",
          "How can competitor tracking help my strategy?",
        ]
      : selectedGoals.includes(BusinessGoal.BEAT_COMPETITORS)
        ? [
            "What should I watch from my competitors?",
            "How can competitor tracking help my strategy?",
          ]
        : [];
  const contextText = [
    businessContext?.description,
    businessContext?.targetAudience,
    businessContext?.businessType,
    businessContext?.primaryConversionGoal,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const contextQuestions = businessContext?.description
    ? [
        "Who is my target audience?",
        "How should I market this business?",
        ...(contextText.match(
          /\b(discord|gaming|creator|community|server owner|community manager)\b/,
        )
          ? [
              "What social platform fits my audience best?",
              "What should I post for my community audience?",
            ]
          : []),
      ]
    : [
        "Does the AI understand my business?",
        "Who is my target audience?",
      ];
  const questions = [
    ...contextQuestions,
    ...reviewPriorityQuestions,
    ...socialPriorityQuestions,
    ...competitorQuestions,
    ...selectedGoals.flatMap((goal) => goalSuggestedQuestions[goal] ?? []),
    ...defaultSuggestedQuestions,
  ];

  return questions
    .filter((question, index) => questions.indexOf(question) === index)
    .slice(0, goalQuestionLimit);
}

export function getRecommendationGoalWeight({
  recommendation,
  goals = [],
  primaryGoal,
}: {
  recommendation: RecommendationLike;
  goals?: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
}) {
  const text = `${recommendation.title} ${recommendation.description}`.toLowerCase();
  const selectedGoals = uniqueGoals(goals, primaryGoal);

  return selectedGoals.reduce((weight, goal) => {
    const bonus = goal === primaryGoal ? 4 : 1;

    if (
      goal === BusinessGoal.IMPROVE_SEO &&
      recommendation.category === ScoreCategory.SEO
    ) {
      return weight + bonus;
    }

    if (
      goal === BusinessGoal.GROW_SOCIAL_MEDIA &&
      (recommendation.category === ScoreCategory.SOCIAL ||
        /\b(content|post|social|instagram|tiktok)\b/.test(text))
    ) {
      return weight + bonus;
    }

    if (
      goal === BusinessGoal.BEAT_COMPETITORS &&
      (recommendation.category === ScoreCategory.COMPETITORS ||
        /\bcompetitor|benchmark\b/.test(text))
    ) {
      return weight + bonus;
    }

    if (
      (goal === BusinessGoal.INCREASE_CONVERSIONS ||
        goal === BusinessGoal.MORE_LEADS ||
        goal === BusinessGoal.INCREASE_SALES ||
        goal === BusinessGoal.MORE_CUSTOMERS ||
        goal === BusinessGoal.BUILD_EMAIL_LIST) &&
      (recommendation.category === ScoreCategory.WEBSITE ||
        /\b(cta|contact|pricing|homepage|headline|lead|conversion|quote|call|email|offer|sales)\b/.test(
          text,
        ))
    ) {
      return weight + bonus;
    }

    if (
      (goal === BusinessGoal.MORE_LEADS ||
        goal === BusinessGoal.MORE_CUSTOMERS ||
        goal === BusinessGoal.INCREASE_SALES ||
        goal === BusinessGoal.IMPROVE_LOCAL_VISIBILITY) &&
      (recommendation.category === ScoreCategory.REVIEWS ||
        /\b(review|trust|google business|local|reputation|customer proof)\b/.test(
          text,
        ))
    ) {
      return weight + bonus;
    }

    if (
      goal === BusinessGoal.IMPROVE_WEBSITE &&
      recommendation.category === ScoreCategory.WEBSITE
    ) {
      return weight + bonus;
    }

    if (
      goal === BusinessGoal.IMPROVE_BRANDING &&
      recommendation.category === ScoreCategory.BRANDING
    ) {
      return weight + bonus;
    }

    if (
      goal === BusinessGoal.IMPROVE_LOCAL_VISIBILITY &&
      (recommendation.category === ScoreCategory.SEO ||
        recommendation.category === ScoreCategory.REVIEWS ||
        /\b(local|google|review|map|search)\b/.test(text))
    ) {
      return weight + bonus;
    }

    return weight;
  }, 0);
}

export function personalizeRecommendations<T extends RecommendationLike>({
  recommendations,
  goals = [],
  primaryGoal,
}: {
  recommendations: T[];
  goals?: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
}): T[] {
  const priorityWeight: Record<RecommendationPriority, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };
  type PersonalizedRecommendation = T & {
    goalWeight?: number;
    originalIndex?: number;
  };

  const personalized: PersonalizedRecommendation[] = recommendations
    .map((recommendation, index) => {
      const goalWeight = getRecommendationGoalWeight({
        recommendation,
        goals,
        primaryGoal,
      });

      return {
        ...recommendation,
        priority:
          goalWeight >= 4
            ? RecommendationPriority.HIGH
            : goalWeight > 0 &&
                recommendation.priority === RecommendationPriority.LOW
              ? RecommendationPriority.MEDIUM
              : recommendation.priority,
        goalWeight,
        originalIndex: index,
      };
    })
    .sort(
      (a, b) =>
        b.goalWeight - a.goalWeight ||
        priorityWeight[a.priority] - priorityWeight[b.priority] ||
        a.originalIndex - b.originalIndex,
    );

  return personalized.map((recommendation) => {
    const result: PersonalizedRecommendation = { ...recommendation };

    delete result.goalWeight;
    delete result.originalIndex;

    return result as T;
  });
}

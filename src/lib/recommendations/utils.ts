import {
  RecommendationPriority,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";

export const recommendationCategoryLabels: Record<ScoreCategory, string> = {
  OVERALL: "Overall",
  WEBSITE: "Website",
  SOCIAL: "Social",
  SEO: "SEO",
  BRANDING: "Branding",
  REVIEWS: "Reviews",
  COMPETITORS: "Competitors",
};

export const actionableCategories = [
  ScoreCategory.WEBSITE,
  ScoreCategory.SEO,
  ScoreCategory.SOCIAL,
  ScoreCategory.BRANDING,
  ScoreCategory.COMPETITORS,
  ScoreCategory.REVIEWS,
];

export const recommendationStatusLabels: Record<RecommendationStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  DISMISSED: "Dismissed",
};

export const recommendationStatusStyles: Record<RecommendationStatus, string> = {
  TODO: "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100",
  IN_PROGRESS:
    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100",
  COMPLETED:
    "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100",
  DISMISSED:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
};

export const recommendationPriorityStyles: Record<
  RecommendationPriority,
  string
> = {
  HIGH: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
  MEDIUM:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  LOW: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100",
};

type SortableRecommendation = {
  category: ScoreCategory;
  priority: RecommendationPriority;
  status: RecommendationStatus;
  expectedImpact: string | null;
  impact: string | null;
  estimatedEffort: string | null;
  effort: string | null;
  sortOrder: number | null;
  createdAt: Date;
};

export type PlanRecommendation = SortableRecommendation & {
  id: string;
  title: string;
  description: string;
};

const priorityWeight: Record<RecommendationPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

const statusWeight: Record<RecommendationStatus, number> = {
  IN_PROGRESS: 0,
  TODO: 1,
  COMPLETED: 2,
  DISMISSED: 3,
};

const impactWeight: Record<string, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

const effortWeight: Record<string, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

export function displayEffort(recommendation: {
  estimatedEffort: string | null;
  effort: string | null;
}) {
  return recommendation.estimatedEffort ?? recommendation.effort ?? "Medium";
}

export function displayImpact(recommendation: {
  expectedImpact: string | null;
  impact: string | null;
}) {
  return recommendation.expectedImpact ?? recommendation.impact ?? "Medium";
}

export function sortRecommendations<T extends SortableRecommendation>(
  recommendations: T[],
) {
  return [...recommendations].sort(
    (a, b) =>
      statusWeight[a.status] - statusWeight[b.status] ||
      priorityWeight[a.priority] - priorityWeight[b.priority] ||
      (impactWeight[displayImpact(a)] ?? 3) -
        (impactWeight[displayImpact(b)] ?? 3) ||
      (effortWeight[displayEffort(a)] ?? 3) -
        (effortWeight[displayEffort(b)] ?? 3) ||
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export function progressForRecommendations(
  recommendations: Array<{ status: RecommendationStatus }>,
) {
  const total = recommendations.length;
  const completed = recommendations.filter(
    (recommendation) => recommendation.status === RecommendationStatus.COMPLETED,
  ).length;

  return {
    total,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export function buildThirtyDayPlan<T extends PlanRecommendation>(
  recommendations: T[],
) {
  const selected = new Set<string>();
  const candidates = sortRecommendations(
    recommendations.filter(
      (recommendation) =>
        recommendation.status !== RecommendationStatus.COMPLETED &&
        recommendation.status !== RecommendationStatus.DISMISSED,
    ),
  );

  function pick(predicate: (recommendation: T) => boolean, limit = 4) {
    const matches = candidates
      .filter(
        (recommendation) =>
          !selected.has(recommendation.id) && predicate(recommendation),
      )
      .slice(0, limit);

    for (const recommendation of matches) {
      selected.add(recommendation.id);
    }

    return matches;
  }

  function fallback(limit = 4) {
    return pick(() => true, limit);
  }

  const week1 = pick(
    (recommendation) =>
      displayEffort(recommendation) === "Low" &&
      displayImpact(recommendation) === "High",
  );
  const week2 = pick(
    (recommendation) =>
      recommendation.category === ScoreCategory.WEBSITE ||
      recommendation.category === ScoreCategory.SEO,
  );
  const week3 = pick(
    (recommendation) => recommendation.category === ScoreCategory.SOCIAL,
  );
  const week4 = pick(
    (recommendation) =>
      recommendation.category === ScoreCategory.COMPETITORS ||
      recommendation.category === ScoreCategory.BRANDING ||
      recommendation.category === ScoreCategory.REVIEWS,
  );

  return [
    {
      week: "Week 1",
      title: "Quick wins",
      description: "Low effort, high impact recommendations to create early momentum.",
      items: week1.length > 0 ? week1 : fallback(),
    },
    {
      week: "Week 2",
      title: "Website and SEO fundamentals",
      description: "Improve homepage clarity, conversion paths, and search basics.",
      items: week2.length > 0 ? week2 : fallback(),
    },
    {
      week: "Week 3",
      title: "Social and content improvements",
      description: "Strengthen the channels and content rhythm customers see most often.",
      items: week3.length > 0 ? week3 : fallback(),
    },
    {
      week: "Week 4",
      title: "Competitors, branding, and review",
      description: "Sharpen positioning, consistency, and the next audit loop.",
      items: week4.length > 0 ? week4 : fallback(),
    },
  ];
}

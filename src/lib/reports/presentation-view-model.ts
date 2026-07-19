import { RecommendationStatus, ScoreCategory } from "@prisma/client";

import { buildPresentationEvidence } from "@/lib/reports/presentation-evidence";
import type {
  AuditReportViewModel,
  ReportRecommendation,
} from "@/lib/reports/audit-report-view-model";
import type {
  PresentationComparisonRow,
  PresentationDeckData,
  PresentationOpportunity,
  PresentationScore,
  PresentationStatus,
  PresentationTone,
} from "@/lib/reports/presentation-types";

const categoryOrder = [
  ScoreCategory.WEBSITE,
  ScoreCategory.SEO,
  ScoreCategory.BRANDING,
  ScoreCategory.SOCIAL,
  ScoreCategory.REVIEWS,
  ScoreCategory.COMPETITORS,
];

const comparisonOrder = ["website", "seo", "reviews", "social", "positioning"];

export function buildPresentationViewModel(
  report: AuditReportViewModel,
): PresentationDeckData {
  const presentationEvidence = buildPresentationEvidence(report);
  const activeRecommendations = report.recommendations.all.filter(
    (item) =>
      item.status !== RecommendationStatus.COMPLETED &&
      item.status !== RecommendationStatus.DISMISSED,
  );
  const scores = categoryOrder
    .map((category) => report.scores.find((item) => item.category === category))
    .filter((item): item is AuditReportViewModel["scores"][number] => Boolean(item))
    .map<PresentationScore>((item) => ({
      label: item.label,
      score: item.score,
      displayValue:
        item.score === null ? scoreStatusLabel(item.status) : `${item.score}/100`,
    }));
  const scored = scores.filter(
    (item): item is PresentationScore & { score: number } => item.score !== null,
  );
  const strongest = [...scored].sort((a, b) => b.score - a.score).slice(0, 2);
  const weakest = [...scored].sort((a, b) => a.score - b.score).slice(0, 2);
  const primaryComparison = buildPrimaryCompetitorComparison(report);
  const topPriorities = buildTopPriorities(report);
  const actionTypes = report.website?.actionSummary.detectedActionTypes ?? [];
  const contextConflict = report.evidenceIntegrity.dataConflicts.find(
    (conflict) => conflict.field === "operatingHours",
  );

  return {
    businessId: report.business.id,
    auditId: report.audit.id,
    businessName: report.business.name,
    auditDate: report.audit.date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    assessmentMode: report.assessment.mode,
    overallScore: report.audit.overallScore,
    healthLabel: report.audit.healthLabel,
    summary: {
      working: unique([
        ...strongest.map((item) => `${item.label}: ${item.score}/100`),
        reviewTrustSignal(report),
      ]).slice(0, 3),
      attention: unique([
        ...weakest.map((item) => `${item.label}: ${item.score}/100`),
        websiteAttentionSignal(report),
        ctaAttentionSignal(report),
      ]).slice(0, 4),
      startHere: topPriorities.map((item) => item.title),
      progressNote: progressNote(report),
    },
    businessContext: {
      available: hasBusinessContext(report),
      description: conciseText(
        report.business.context.description ?? "Business description not set.",
        220,
      ),
      targetAudience: conciseText(
        report.business.context.targetAudience ?? "Target audience not set.",
        150,
      ),
      mainOffer: conciseText(
        report.business.context.mainOffer ?? "Main offer not set.",
        150,
      ),
      conversionGoal: conciseText(
        report.business.context.observedPrimaryConversionGoal ??
          "Primary conversion goal not set.",
        150,
      ),
      brandTone: conciseText(
        report.business.context.brandTone ?? "Brand tone not set.",
        120,
      ),
      conflictNote: contextConflict
        ? "Some operating-hours wording requires review; the dedicated hours page is treated as the preferred source."
        : null,
    },
    scores,
    website: buildWebsiteSlide(report, presentationEvidence),
    seo: buildSeoSlide(report),
    reviews: {
      score: report.reviews.score,
      googleStatus:
        report.reviews.googleBusinessStatus === "confirmed"
          ? "Google listing verified"
          : titleCase(report.reviews.googleBusinessStatus),
      listingName: report.reviews.googleBusinessListingName,
      rating:
        typeof report.reviews.googleRating === "number"
          ? `${report.reviews.googleRating.toFixed(1)} / 5`
          : "Unavailable",
      reviewCount:
        typeof report.reviews.googleReviewCount === "number"
          ? report.reviews.googleReviewCount.toLocaleString("en-US")
          : "Unavailable",
      confirmedPlatforms: report.reviews.confirmedReviewPlatforms,
      keyOpportunity: conciseText(
        report.reviews.opportunities.at(0) ??
          "Keep trust signals visible near important customer decisions.",
        180,
      ),
      recommendedActions: report.reviews.recommendedFixes
        .slice(0, 2)
        .map((item) => conciseText(item, 160)),
      sourceLabel: "Current confirmed Google Business data",
    },
    social: buildSocialSlide(report),
    socialStrategy: buildSocialStrategySlide(report, actionTypes),
    competitor: primaryComparison,
    topPriorities,
    actionPlan: buildPresentationActionPlan(activeRecommendations),
    consultant: {
      lead: "This does not stop at diagnosis. The Consultant helps implement the fixes.",
      prompts: buildImplementationPrompts({
        report,
        recommendations: activeRecommendations,
        competitorName: primaryComparison.competitorName,
        actionTypes,
      }),
    },
  };
}

function buildWebsiteSlide(
  report: AuditReportViewModel,
  presentationEvidence: ReturnType<typeof buildPresentationEvidence>,
): PresentationDeckData["website"] {
  const website = report.website;
  const crawl = report.websiteCrawl;
  const clarity =
    report.technicalAppendix.homepagePrimaryCtaAssessment?.clarity ??
    "NOT_ASSESSED";
  const websiteRecommendation = report.recommendations.all.find(
    (item) => item.category === ScoreCategory.WEBSITE,
  );

  if (!report.assessment.hasWebsite || !website) {
    return {
      available: false,
      score: null,
      pagesScanned: "Not applicable",
      h1Status: "Not applicable",
      primaryCtaClarity: "Not applicable",
      assessmentNote:
        "No website was supplied, so website and technical CTA checks were excluded from this audit.",
      detectedActionTypes: [],
      importantPagesFound: [],
      keyAction: "Add a website later to unlock website and SEO analysis.",
    };
  }

  return {
    available: true,
    score: scoreFor(report, ScoreCategory.WEBSITE),
    pagesScanned: crawl ? `${crawl.pagesScanned} pages` : "Homepage only",
    h1Status:
      website.h1Count === 0
        ? `Missing on homepage${crawl ? `; ${crawl.pagesWithNoH1} pages affected` : ""}`
        : website.h1Count === 1
          ? "One homepage H1"
          : `${website.h1Count} homepage H1 headings`,
    primaryCtaClarity: titleCase(clarity),
    assessmentNote:
      clarity === "CLEAR"
        ? "Static page structure and link wording support one structurally dominant primary action."
        : "Based on static page structure and link wording, no single primary action was clearly dominant.",
    detectedActionTypes: website.actionSummary.detectedActionTypes.slice(0, 6),
    importantPagesFound: (crawl?.importantPagesFound ?? []).slice(0, 6),
    keyAction:
      websiteRecommendation?.title ??
      `Review the ${presentationEvidence.website.primaryCtaClarity} primary CTA assessment.`,
  };
}

function buildSeoSlide(
  report: AuditReportViewModel,
): PresentationDeckData["seo"] {
  const seo = report.seo;
  const crawl = report.websiteCrawl;

  if (!report.assessment.hasWebsite || !seo) {
    return {
      available: false,
      score: null,
      checks: [],
      warningCount: 0,
      recommendedFixes: [
        "Add a website later to unlock technical search-readiness checks.",
      ],
    };
  }

  const checks: PresentationStatus[] = [
    statusFromSeo("Page title", seo.titleStatus, `${seo.titleLength} characters`),
    statusFromSeo(
      "Meta description",
      seo.metaDescriptionStatus,
      `${seo.metaDescriptionLength} characters${
        seo.metaDescriptionStatus !== "good" &&
        crawl &&
        crawl.pagesMissingMetaDescription > 0
          ? `; ${crawl.pagesMissingMetaDescription} scanned page missing one`
          : ""
      }`,
    ),
    statusFromSeo(
      "Homepage H1",
      seo.h1Status,
      seo.h1Status !== "good" && crawl && crawl.pagesWithNoH1 > 0
        ? `${crawl.pagesWithNoH1} scanned pages have no H1`
        : undefined,
    ),
    statusFromSeo("Canonical", seo.canonicalStatus),
    statusFromSeo("Viewport", seo.viewportStatus),
    statusFromSeo("robots.txt", seo.robotsTxtStatus),
    statusFromSeo("sitemap.xml", seo.sitemapStatus),
  ];
  if (
    seo.metaDescriptionStatus === "good" &&
    crawl &&
    crawl.pagesMissingMetaDescription > 0
  ) {
    checks.push({
      label: "Page descriptions",
      value: "Needs improvement",
      tone: "warning",
      detail: `${crawl.pagesMissingMetaDescription} scanned page missing a description`,
    });
  }
  if (seo.h1Status === "good" && crawl && crawl.pagesWithNoH1 > 0) {
    checks.push({
      label: "Page H1 coverage",
      value: "Needs improvement",
      tone: "warning",
      detail: `${crawl.pagesWithNoH1} scanned pages have no H1`,
    });
  }
  if (
    seo.indexabilityWarnings.some((warning) =>
      /blocked from indexing|disallow:\s*\//i.test(warning),
    )
  ) {
    checks.unshift({
      label: "Indexability",
      value: "Blocked",
      tone: "critical",
      detail: conciseText(seo.indexabilityWarnings[0], 140),
    });
  }

  return {
    available: true,
    score: scoreFor(report, ScoreCategory.SEO),
    checks,
    warningCount: checks.filter(
      (item) => item.tone === "warning" || item.tone === "critical",
    ).length,
    recommendedFixes: seo.recommendedFixes
      .slice(0, 2)
      .map((item) => conciseText(item, 150)),
  };
}

function buildSocialSlide(
  report: AuditReportViewModel,
): PresentationDeckData["social"] {
  const confirmed = report.social.confirmedPlatforms;
  const normalizedConfirmed = new Set(confirmed.map(normalizeChannel));
  const recommendedChannels = report.socialStrategy.data.recommendedPlatforms
    .map((item) => item.platform)
    .filter((platform) => !normalizedConfirmed.has(normalizeChannel(platform)))
    .slice(0, 3);

  return {
    score: report.social.score,
    brandingScore: scoreFor(report, ScoreCategory.BRANDING),
    confirmedCount: report.social.confirmedProfilesCount,
    confirmedPlatforms: confirmed,
    recommendedChannels,
    coverageNote: `${titleCase(report.social.platformCoverageLevel)} confirmed channel coverage`,
  };
}

function buildSocialStrategySlide(
  report: AuditReportViewModel,
  actionTypes: string[],
): PresentationDeckData["socialStrategy"] {
  const strategy = report.socialStrategy.data;
  const conversionActions = [
    ...prioritizeActionTypes(actionTypes),
    ...report.social.detectedConversionPaths,
  ];

  return {
    available: strategy.contentPillars.length > 0 || strategy.suggestedPosts.length > 0,
    sourceLabel:
      report.socialStrategy.source === "deterministic_fallback"
        ? "Evidence-based strategy"
        : "Current strategy",
    scopeNote:
      report.assessment.mode === "social_first"
        ? "Built from Business Context, confirmed profiles, goals, reviews, and public competitor evidence. Individual posts and engagement were not analyzed."
        : "Built from Business Context, confirmed profiles, website content, reviews, goals, and public competitor evidence. Individual posts and engagement were not analyzed.",
    contentPillars: strategy.contentPillars.slice(0, 3).map((item) => ({
      title: item.title,
      description: conciseText(item.description, 145),
    })),
    contentIdeas: strategy.suggestedPosts.slice(0, 3).map((item, index) => ({
      platform: item.platform,
      hook: conciseText(item.hook, 90),
      concept: conciseText(item.postConcept, 145),
      callToAction: `CTA: ${actionTypeToCta(
        conversionActions[index % Math.max(conversionActions.length, 1)] ??
          item.callToAction,
      )}`,
    })),
    conversionTip: conciseText(
      strategy.conversionTips.at(0)?.tip ??
        "Connect each post to one confirmed next step.",
      130,
    ),
  };
}

function buildPrimaryCompetitorComparison(
  report: AuditReportViewModel,
): PresentationDeckData["competitor"] {
  const comparison = report.competitors.comparison;
  const competitorName =
    comparison?.freshness.find((item) => item.status === "current")
      ?.competitorName ?? comparison?.categoryComparisons.at(0)?.competitorName ?? null;
  const categories = competitorName
    ? comparison?.categoryComparisons.filter(
        (item) => item.competitorName === competitorName,
      ) ?? []
    : [];
  const rows = comparisonOrder
    .map((category) => categories.find((item) => item.category === category))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map<PresentationComparisonRow>((item) => ({
      area: comparisonCategoryLabel(item.category),
      businessValue:
        item.category === "social"
          ? confirmedOnlyDisplay(item.businessDisplay)
          : conciseComparisonValue(item.businessDisplay),
      competitorValue:
        item.category === "social"
          ? confirmedOnlyDisplay(item.competitorDisplay)
          : conciseComparisonValue(item.competitorDisplay),
      result: comparisonResultLabel(item.category, item.status, report.business.name),
      tone: comparisonTone(item.status),
    }));
  const opportunities =
    comparison?.opportunities
      .filter((item) => !competitorName || item.competitorName === competitorName)
      .slice(0, 3)
      .map<PresentationOpportunity>((item) => ({
        title: item.title,
        category: comparisonCategoryLabel(item.category),
        evidence: conciseText(comparisonEvidenceSummary(item.evidence), 165),
        response: conciseText(item.description, 180),
      })) ?? [];
  const freshness = comparison?.freshness.find(
    (item) => item.competitorName === competitorName && item.scannedAt,
  );

  return {
    available: rows.length > 0 && Boolean(competitorName),
    competitorName,
    rows,
    highlightedOpportunity:
      opportunities.at(0)?.title ??
      "Add current competitor evidence before drawing a side-by-side conclusion.",
    snapshotLabel: freshness?.scannedAt
      ? `Snapshot: ${new Date(freshness.scannedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`
      : null,
    confirmedSocialSummary:
      report.competitors.profileCounts.confirmedSocialProfiles > 0
        ? `${report.competitors.profileCounts.confirmedSocialProfiles} confirmed competitor social profiles`
        : "No confirmed competitor social profiles",
    pendingSocialSummary:
      report.competitors.profileCounts.pendingSocialProfiles > 0
        ? `${report.competitors.profileCounts.pendingSocialProfiles} additional competitor links are pending or detected`
        : null,
    opportunities,
    limitationsNote:
      "Public website, confirmed profile coverage, and available Google data only. No private analytics, engagement, or post performance.",
  };
}

function buildPresentationActionPlan(
  recommendations: ReportRecommendation[],
): PresentationDeckData["actionPlan"] {
  const used = new Set<string>();
  const take = (
    match: (item: ReportRecommendation) => boolean,
    limit: number,
  ) => {
    const matches = recommendations
      .filter((item) => !used.has(item.id) && match(item))
      .slice(0, limit);
    matches.forEach((item) => used.add(item.id));
    return matches.map((item) => item.title);
  };

  const week1 = take(
    (item) =>
      item.expectedImpact.toLowerCase() === "high" &&
      item.estimatedEffort.toLowerCase() === "low",
    3,
  );
  const week2 = take(
    (item) =>
      item.category === ScoreCategory.WEBSITE ||
      item.category === ScoreCategory.SEO,
    3,
  );
  const week3 = take((item) => item.category === ScoreCategory.SOCIAL, 3);
  const week4 = take(
    (item) =>
      item.category === ScoreCategory.COMPETITORS ||
      item.category === ScoreCategory.BRANDING ||
      item.category === ScoreCategory.REVIEWS,
    2,
  );
  week4.push("Rerun the audit and review measured evidence changes");

  return [
    {
      week: "Week 1",
      outcome: "Make the fastest high-impact improvements",
      bullets: fillPlan(week1, "Choose the highest-impact open recommendation"),
    },
    {
      week: "Week 2",
      outcome: "Strengthen website and SEO fundamentals",
      bullets: fillPlan(week2, "Review website and search-readiness fundamentals"),
    },
    {
      week: "Week 3",
      outcome: "Turn strategy into consistent social execution",
      bullets: fillPlan(week3, "Build three posts around the current content pillars"),
    },
    {
      week: "Week 4",
      outcome: "Review trust, competitors, and measured progress",
      bullets: unique(week4).slice(0, 3),
    },
  ];
}

function buildTopPriorities(
  report: AuditReportViewModel,
): PresentationDeckData["topPriorities"] {
  return report.nextMoves.slice(0, 3).map((move) => {
    const recommendation = recommendationForMove(move.title, move.category, report);
    return {
      title: move.title,
      description: conciseText(
        recommendation?.description ?? move.implementationAction,
        190,
      ),
      category: categoryDisplay(move.category),
      priority: recommendation?.priority.toLowerCase() ?? "high",
      effort: move.effort,
      impact: move.impact,
      confidence: recommendation?.confidence ?? "Medium",
      evidence: conciseText(move.evidence, 190),
    };
  });
}

function recommendationForMove(
  moveTitle: string,
  category: ScoreCategory,
  report: AuditReportViewModel,
) {
  const moveKey = canonicalMoveKey(moveTitle);
  return report.recommendations.all.find(
    (item) =>
      item.category === category && canonicalMoveKey(item.title) === moveKey,
  );
}

function canonicalMoveKey(title: string) {
  const normalized = title.toLowerCase();
  if (/headline|\bh1\b/.test(normalized)) return "h1";
  if (/primary.*action|cta|conversion path/.test(normalized)) return "cta";
  if (/customer proof|testimonial|review proof/.test(normalized)) return "proof";
  if (/meta description/.test(normalized)) return "meta-description";
  if (/canonical/.test(normalized)) return "canonical";
  return normalized.replace(/[^a-z0-9]+/g, "-");
}

function buildImplementationPrompts({
  report,
  recommendations,
  competitorName,
  actionTypes,
}: {
  report: AuditReportViewModel;
  recommendations: ReportRecommendation[];
  competitorName: string | null;
  actionTypes: string[];
}) {
  const titles = recommendations.map((item) => item.title.toLowerCase()).join(" ");
  const prompts: string[] = [];
  const has = (pattern: RegExp) => pattern.test(titles);

  if (
    report.assessment.hasWebsite &&
    has(/primary visitor action|cta|conversion path/)
  ) {
    const actions = prioritizeActionTypes(actionTypes).slice(0, 2);
    prompts.push(
      actions.length > 0
        ? `How should I make ${joinWithAnd(actions)} more prominent?`
        : "How should I make the primary visitor action more prominent?",
    );
  }
  if (report.assessment.hasWebsite && has(/\bh1\b|main headline/)) {
    prompts.push(`Draft a clear homepage H1 for ${report.business.name}.`);
  }
  if (has(/customer proof|testimonial|review/)) {
    prompts.push(
      report.assessment.hasWebsite
        ? "Draft a customer-proof section for the homepage."
        : "Draft a customer-proof post and profile highlight.",
    );
  }
  if (report.assessment.hasWebsite && has(/meta description/)) {
    prompts.push("Rewrite the homepage meta description.");
  }
  if (competitorName) {
    prompts.push(`How do I compare with ${competitorName}?`);
  }
  if (report.socialStrategy.data.contentPillars.length > 0) {
    prompts.push("Create next week's social content plan.");
  }

  return unique([
    ...prompts,
    "Turn my highest-priority recommendation into implementation steps.",
  ]).slice(0, 5);
}

function statusFromSeo(
  label: string,
  status: string,
  detail?: string,
): PresentationStatus {
  return {
    label,
    value: seoStatusLabel(status),
    tone: seoStatusTone(status),
    detail,
  };
}

function seoStatusLabel(status: string) {
  const labels: Record<string, string> = {
    good: "Good",
    found: "Found",
    missing: "Missing",
    too_short: "Needs improvement",
    too_long: "Needs improvement",
    multiple: "Needs improvement",
    blocked: "Unavailable",
    timeout: "Unavailable",
    unreachable: "Unavailable",
    unknown: "Unavailable",
  };
  return labels[status] ?? titleCase(status);
}

function seoStatusTone(status: string): PresentationTone {
  if (status === "good" || status === "found") return "positive";
  if (status === "unknown" || status === "timeout" || status === "unreachable") {
    return "neutral";
  }
  return "warning";
}

function comparisonResultLabel(
  category: string,
  status: string,
  businessName: string,
) {
  if (category === "positioning") {
    if (status === "competitor_stronger") return "Inferred competitor edge";
    if (status === "business_stronger") return `Inferred ${businessName} edge`;
    if (status === "similar") return "Inferred similarity";
  }
  const labels: Record<string, string> = {
    business_stronger: `${businessName} leads`,
    competitor_stronger: "Competitor leads",
    similar: "Similar",
    needs_attention: "Needs attention",
    not_comparable: "Not comparable",
    not_applicable: "Not applicable",
    data_unavailable: "Unavailable",
  };
  return labels[status] ?? "Unavailable";
}

function comparisonTone(status: string): PresentationTone {
  if (status === "business_stronger") return "positive";
  if (status === "competitor_stronger" || status === "needs_attention") {
    return "warning";
  }
  return "neutral";
}

function comparisonCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    website: "Website",
    seo: "SEO",
    reviews: "Reviews",
    social: "Social",
    positioning: "Positioning",
  };
  return labels[category] ?? titleCase(category);
}

function comparisonEvidenceSummary(
  evidence: Array<{
    label: string;
    businessValue: string;
    competitorValue: string;
  }>,
) {
  const item = [...evidence].sort(
    (a, b) =>
      a.businessValue.length + a.competitorValue.length -
      (b.businessValue.length + b.competitorValue.length),
  )[0];
  if (!item) return "Comparable public evidence is limited.";
  if (/observable offer|structurally assessed cta/i.test(item.label)) {
    return "Observable homepage offer wording and structurally assessed CTA clarity were compared.";
  }
  if (/homepage seo checks/i.test(item.label)) {
    return "Homepage title, meta, H1, canonical, robots, and sitemap checks were compared.";
  }
  return `${item.label}: ${item.businessValue} compared with ${item.competitorValue}.`;
}

function conciseComparisonValue(value: string) {
  return value
    .replace(/Limited observable offer clarity/gi, "Limited clarity")
    .replace(/Moderately clear observable offer/gi, "Moderately clear")
    .replace(/primary CTA/gi, "CTA")
    .replace(/\s*\(moderate evidence confidence\)/gi, "")
    .replace(/Data unavailable/gi, "Unavailable");
}

function confirmedOnlyDisplay(value: string) {
  const confirmed = value.match(/\d+\s+confirmed/i)?.at(0);
  return confirmed ?? conciseComparisonValue(value);
}

function reviewTrustSignal(report: AuditReportViewModel) {
  if (
    report.reviews.googleBusinessStatus === "confirmed" &&
    typeof report.reviews.googleRating === "number" &&
    typeof report.reviews.googleReviewCount === "number"
  ) {
    return `Google trust signal: ${report.reviews.googleRating.toFixed(1)} rating from ${report.reviews.googleReviewCount.toLocaleString("en-US")} reviews`;
  }
  if (report.reviews.googleBusinessStatus === "confirmed") {
    return "A confirmed Google Business listing supports local trust";
  }
  return null;
}

function websiteAttentionSignal(report: AuditReportViewModel) {
  if (!report.website) return null;
  const issues: string[] = [];
  if (report.website.h1Count === 0) issues.push("homepage H1");
  if (!report.website.hasCanonical) issues.push("canonical tag");
  if (issues.length === 0) return null;
  return `${joinWithAnd(issues)} ${issues.length === 1 ? "is" : "are"} missing`;
}

function ctaAttentionSignal(report: AuditReportViewModel) {
  const clarity = report.technicalAppendix.homepagePrimaryCtaAssessment?.clarity;
  return clarity === "NEEDS_IMPROVEMENT" || clarity === "UNCERTAIN"
    ? `Primary CTA ${clarity === "UNCERTAIN" ? "is uncertain" : "needs improvement"}`
    : null;
}

function progressNote(report: AuditReportViewModel) {
  const comparison = report.progress.comparison;
  if (!comparison.previousAuditId) return null;
  const change = comparison.overallScoreChange;
  if (change === null) {
    return comparison.comparisonNote ?? comparison.summary;
  }
  if (change === 0) {
    return comparison.comparisonNote ?? "No overall score change was detected.";
  }
  const direction = change > 0 ? "improved" : "declined";
  return `Overall score ${direction} by ${Math.abs(change)} points since the previous audit.`;
}

function scoreFor(report: AuditReportViewModel, category: ScoreCategory) {
  return report.scores.find((item) => item.category === category)?.score ?? null;
}

function categoryDisplay(category: ScoreCategory) {
  const labels: Record<ScoreCategory, string> = {
    [ScoreCategory.OVERALL]: "Overall",
    [ScoreCategory.WEBSITE]: "Website",
    [ScoreCategory.SEO]: "SEO",
    [ScoreCategory.SOCIAL]: "Social",
    [ScoreCategory.BRANDING]: "Branding",
    [ScoreCategory.REVIEWS]: "Reviews & Trust",
    [ScoreCategory.COMPETITORS]: "Competitive Position",
  };
  return labels[category];
}

function scoreStatusLabel(
  status: AuditReportViewModel["scores"][number]["status"],
) {
  const labels = {
    scored: "Unavailable",
    not_provided: "Not provided",
    not_applicable: "Not applicable",
    not_configured: "Not configured",
    saved_not_analyzed: "Saved but not analyzed",
    partial: "Partial comparison",
  } as const;
  return labels[status];
}

function hasBusinessContext(report: AuditReportViewModel) {
  return Boolean(
    report.business.context.description ||
      report.business.context.targetAudience ||
      report.business.context.mainOffer,
  );
}

function fillPlan(items: string[], fallback: string) {
  return items.length > 0 ? unique(items).slice(0, 3) : [fallback];
}

function prioritizeActionTypes(actionTypes: string[]) {
  const priorities = [
    "Menu",
    "Order / Takeout",
    "Events",
    "Hours",
    "Directions",
    "Book",
    "Schedule",
    "Pricing",
    "Contact",
    "Gift Cards",
  ];
  return [...actionTypes].sort((a, b) => {
    const aIndex = priorities.findIndex((item) =>
      a.toLowerCase().includes(item.toLowerCase()),
    );
    const bIndex = priorities.findIndex((item) =>
      b.toLowerCase().includes(item.toLowerCase()),
    );
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });
}

function actionTypeToCta(value: string) {
  const normalized = value.toLowerCase();
  if (/hours/.test(normalized)) return "Check today's hours";
  if (/menu/.test(normalized)) return "View the menu";
  if (/order|takeout|storefront|shop|buy/.test(normalized)) return "Order takeout";
  if (/event/.test(normalized)) return "See upcoming events";
  if (/direction|location|map/.test(normalized)) return "Get directions";
  if (/book|schedule|reservation/.test(normalized)) return "Book now";
  if (/contact|email|call/.test(normalized)) return "Contact the business";
  if (/gift/.test(normalized)) return "View gift cards";
  if (/follow/.test(normalized)) return "Follow for current updates";
  if (/subscribe/.test(normalized)) return "Subscribe for updates";
  return conciseText(value || "Use the confirmed profile link", 65).replace(/[.!?]$/, "");
}

function normalizeChannel(value: string) {
  return value
    .toLowerCase()
    .replace(/shorts?/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function joinWithAnd(items: string[]) {
  if (items.length <= 1) return items[0] ?? "the current action";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function conciseText(value: string, maxLength: number) {
  const clean = value
    .replace(/\.{3}|\u2026/g, ".")
    .replace(/page\(s\)/gi, "pages")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= maxLength) return completeSentence(clean);

  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [];
  let summary = "";
  for (const sentence of sentences) {
    const candidate = `${summary} ${sentence.trim()}`.trim();
    if (candidate.length > maxLength) break;
    summary = candidate;
  }
  if (summary) return summary;

  const words = clean.split(" ");
  const kept: string[] = [];
  for (const word of words) {
    if ([...kept, word].join(" ").length > maxLength - 1) break;
    kept.push(word);
  }
  return completeSentence(kept.join(" ").replace(/[,:;\-]+$/, ""));
}

function completeSentence(value: string) {
  if (!value) return "Unavailable.";
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function unique<T>(items: Array<T | null | undefined>) {
  return [...new Set(items.filter((item): item is T => item !== null && item !== undefined))];
}

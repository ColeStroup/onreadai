import type { CompetitorConsultantContext } from "@/lib/ai/competitor-consultant-context";
import type {
  CategoryComparison,
  ComparisonStatement,
} from "@/lib/competitors/competitor-types";

export type CompetitorConsultantIntent =
  | "feature_help"
  | "analysis_status"
  | "freshness"
  | "missing_data"
  | "reviews_comparison"
  | "social_comparison"
  | "seo_comparison"
  | "website_comparison"
  | "positioning_comparison"
  | "business_advantages"
  | "competitor_advantages"
  | "competitive_actions"
  | "general_comparison";

type Snapshot = CompetitorConsultantContext["latestSnapshots"][number];

type StructuredComparisonResponse = {
  overallConclusion: string;
  competitorLeads: string[];
  businessLeads: string[];
  similarAreas: string[];
  notComparable: string[];
  nextMoves: string[];
  freshnessNote: string | null;
};

const unavailableStatuses: CategoryComparison["status"][] = [
  "not_comparable",
  "not_applicable",
  "data_unavailable",
];

export function getCompetitorConsultantIntent(
  question: string,
  context?: CompetitorConsultantContext | null,
): CompetitorConsultantIntent | null {
  const normalized = normalizeText(question);
  const referencesKnownCompetitor = context?.latestSnapshots.some((snapshot) =>
    normalized.includes(normalizeText(snapshot.competitorName)),
  );
  const hasCompetitorSignal = Boolean(
    referencesKnownCompetitor ||
      /\b(competitor|competitors|competition|compare|comparison|compete|against|advantage)\b/.test(
        normalized,
      ) ||
      (Boolean(context?.configuredCompetitors) &&
        /\bdoing better\b|\bwhere do (?:we|i) lead\b|\bwho has (?:the )?(?:stronger|better)\b/.test(
          normalized,
        )) ||
      /\bwhich website\b|\bclearer (?:cta|call to action)\b/.test(normalized),
  );

  if (!hasCompetitorSignal) return null;

  if (
    /\bhow (?:do|can|should) i (?:use|add|edit|remove|archive|refresh|update|re-?analy[sz]e|manage|find|view|see)\b.*\bcompetitor/.test(
      normalized,
    ) ||
    /\bwhere (?:can|do) i (?:find|view|see)\b.*\bcompetitor/.test(normalized) ||
    /\bhow often\b.*\b(?:competitor|scan|refresh|analy[sz])/.test(normalized) ||
    /\b(?:use|using) (?:the )?competitor (?:feature|tab|intelligence)\b/.test(
      normalized,
    )
  ) {
    return "feature_help";
  }

  if (
    /\b(?:has|is|was).*(?:analy[sz]ed|scan)|\banaly[sz]ed yet\b/.test(
      normalized,
    )
  ) {
    return "analysis_status";
  }
  if (
    /\bhow current\b|\bhow recent\b|\bfreshness\b|\bstale\b|\bwhen.*(?:scan|analy)/.test(
      normalized,
    )
  ) {
    return "freshness";
  }
  if (
    /\bwhat.*(?:missing|unavailable)|\bmissing data\b|\bdata.*missing\b/.test(
      normalized,
    )
  ) {
    return "missing_data";
  }
  if (
    /\bwhat should (?:i|we) do differently\b/.test(normalized) ||
    /\b(?:what|which).{0,80}\b(?:actions?|steps?|moves?)\b.{0,80}\b(?:prioriti[sz]e|compete|competitive)\b/.test(
      normalized,
    ) ||
    /\bhow (?:can|should) (?:i|we)\b.{0,80}\bcompete\b/.test(normalized)
  ) {
    return "competitive_actions";
  }
  if (/\b(review|reviews|google|reputation|trust)\b/.test(normalized)) {
    return "reviews_comparison";
  }
  if (
    /\b(social|instagram|facebook|tiktok|youtube|engagement|posts?|reach)\b/.test(
      normalized,
    )
  ) {
    return "social_comparison";
  }
  if (/\bseo|search\b/.test(normalized)) return "seo_comparison";
  if (/\b(website|headline|h1|cta|call to action|page)\b/.test(normalized)) {
    return "website_comparison";
  }
  if (/\b(positioning|position|offer|audience|differenti)/.test(normalized)) {
    return "positioning_comparison";
  }

  const businessName = normalizeText(context?.businessName ?? "");
  const asksBusinessEdge =
    (businessName && normalized.includes(`${businessName} doing better`)) ||
    /\b(?:my|our|we|i)\b.*(?:advantage|doing better|lead)|\bwhere do (?:we|i) lead\b/.test(
      normalized,
    );
  if (asksBusinessEdge) return "business_advantages";

  const namedCompetitor = context?.latestSnapshots.find((snapshot) =>
    normalized.includes(normalizeText(snapshot.competitorName)),
  );
  if (
    (namedCompetitor &&
      /\b(?:doing better|advantage|lead|stronger|ahead)\b/.test(normalized)) ||
    /\b(?:competitor|they|their).*(?:doing better|advantage|lead)\b/.test(
      normalized,
    )
  ) {
    return "competitor_advantages";
  }

  return "general_comparison";
}

export function isCompetitorConsultantQuestion(
  question: string,
  context?: CompetitorConsultantContext | null,
) {
  return getCompetitorConsultantIntent(question, context) !== null;
}

export function buildCompetitorOpenAIDirective({
  question,
  context,
}: {
  question: string;
  context: CompetitorConsultantContext;
}) {
  const intent = getCompetitorConsultantIntent(question, context);
  if (!intent) return null;

  if (intent === "feature_help") {
    return [
      "Classified intent: FEATURE_HELP.",
      "Answer only the requested navigation or usage question.",
      "It is appropriate to mention the Competitors tab, Add competitor, Analyze, Refresh, Manage profiles, and View analysis when relevant.",
      "Do not turn this into a business comparison unless the user also asks for one.",
    ].join(" ");
  }

  if (intent === "competitive_actions") {
    return [
      "Classified intent: COMPETITIVE_ACTIONS.",
      "Answer with no more than three practical actions grounded in the available competitor comparison.",
      "Clearly separate saved evidence from strategic recommendations, especially when the user asks for that distinction.",
      "Do not force a full comparison report, score table, or winner declaration when the question asks what to do.",
      "Label any advice that is not directly observed competitor evidence as a general recommendation.",
      "If the question concerns social media, compare confirmed public profile coverage only and explicitly state that posts, engagement, reach, posting frequency, and content performance were not analyzed.",
      "If competitor analysis is missing, partial, failed, or stale, state that limitation before giving general guidance.",
    ].join(" ");
  }

  const selected = selectCompetitor(context, normalizeText(question));
  const rows = relevantRows(context, selected);
  const scoreRequirements = rows
    .filter(
      (row) =>
        ["website", "seo"].includes(row.category) &&
        row.businessScore !== null &&
        row.competitorScore !== null &&
        ["business_stronger", "competitor_stronger"].includes(row.status),
    )
    .map(
      (row) =>
        `${categoryLabel(row.category)} must show ${context.businessName} ${row.businessScore}/100 and ${row.competitorName} ${row.competitorScore}/100.`,
    );
  const hasBusinessLead = rows.some(
    (row) => row.status === "business_stronger",
  );
  const reviewsUnavailable = rows.some(
    (row) => row.category === "reviews" && unavailableStatuses.includes(row.status),
  );
  const categorySpecific = [
    "reviews_comparison",
    "social_comparison",
    "seo_comparison",
    "website_comparison",
    "positioning_comparison",
  ].includes(intent);

  return [
    `Classified intent: ${intent.toUpperCase()}.`,
    "Answer the comparison in the first prose sentence. Do not begin with a Markdown heading or product instructions.",
    categorySpecific
      ? "Keep this category-specific answer brief and do not include the full general comparison."
      : "For a general comparison, target 200-350 words and use only useful sections from: Where the competitor leads, Where your business leads, Similar or tied areas, Not currently comparable, Best next moves.",
    "Lead with supported findings, not instructions for using the product.",
    "Limit next moves to three and omit generic closing filler.",
    "Do not recommend adding more competitors, opening the feature, or manually inspecting a website unless the requested evidence is unavailable.",
    !hasBusinessLead
      ? `No supported comparative advantage is currently confirmed for ${context.businessName}; state that honestly and keep standalone strengths separate.`
      : "Only describe primary-business advantages that have a BUSINESS_STRONGER row.",
    reviewsUnavailable
      ? "Reviews must be explicitly labeled not currently comparable; available one-sided review data is a standalone asset, not a comparative win."
      : "Compare reviews only from overlapping rating or review-count fields.",
    "Positioning is inferred from public copy and CTAs, so use appears, observable, inferred, or based on the pages scanned.",
    "Confirmed social profiles and pending or detected links must remain separate, and no social-performance claim is allowed.",
    ...scoreRequirements,
  ].join(" ");
}

export function generateCompetitorFallbackResponse({
  question,
  businessName,
  context,
}: {
  question: string;
  businessName: string;
  context: CompetitorConsultantContext | null | undefined;
}) {
  const intent = getCompetitorConsultantIntent(question, context);
  if (!intent) return null;

  const normalizedQuestion = normalizeText(question);
  if (intent === "feature_help") {
    return featureHelpResponse(normalizedQuestion, businessName);
  }

  if (!context || context.configuredCompetitors === 0) {
    return `There is not enough comparable data yet because ${businessName} has no active competitors configured. The guidance below is general and is not presented as saved competitor evidence.\n\n### General recommendations\n\n1. Choose one direct competitor that serves a similar audience and sells a similar offer.\n2. Compare the clarity of your offer, primary call to action, confirmed public profiles, and visible trust signals.\n3. Turn the clearest verified gap into one measurable improvement rather than copying competitor messaging.\n\nAdd the competitor in the **Competitors** tab and run **Analyze** to replace this general guidance with a saved evidence comparison.`;
  }

  const selected = selectCompetitor(context, normalizedQuestion);
  const snapshots = selected ? [selected] : context.latestSnapshots;

  if (intent === "analysis_status") {
    return analysisStatusResponse(businessName, snapshots);
  }
  if (intent === "freshness") {
    return freshnessResponse(businessName, context, snapshots);
  }
  if (intent === "missing_data") {
    return missingDataResponse(businessName, snapshots, context);
  }

  if (context.analyzedCompetitors === 0 || !context.currentComparison) {
    return unavailableComparisonResponse(businessName, snapshots);
  }

  const rows = relevantRows(context, selected);
  switch (intent) {
    case "competitive_actions":
      return competitiveActionsResponse({
        question: normalizedQuestion,
        businessName,
        context,
        snapshots,
        rows,
      });
    case "reviews_comparison":
      return reviewsResponse(businessName, context, snapshots, rows);
    case "social_comparison":
      return socialResponse(businessName, context, snapshots, rows);
    case "seo_comparison":
      return categoryResponse(
        businessName,
        context,
        snapshots,
        rows,
        "seo",
      );
    case "website_comparison":
      return categoryResponse(
        businessName,
        context,
        snapshots,
        rows,
        "website",
      );
    case "positioning_comparison":
      return categoryResponse(
        businessName,
        context,
        snapshots,
        rows,
        "positioning",
      );
    case "business_advantages":
      return advantageResponse({
        side: "business",
        businessName,
        context,
        snapshots,
        rows,
      });
    case "competitor_advantages":
      return advantageResponse({
        side: "competitor",
        businessName,
        context,
        snapshots,
        rows,
      });
    default:
      return generalComparisonResponse(businessName, context, snapshots, rows);
  }
}

export function validateCompetitorConsultantResponse({
  question,
  response,
  context,
}: {
  question: string;
  response: string;
  context: CompetitorConsultantContext | null | undefined;
}) {
  if (!context) return [];
  const intent = getCompetitorConsultantIntent(question, context);
  if (!intent) return [];

  const issues: string[] = [];
  const normalized = normalizeText(response);
  const normalizedQuestion = normalizeText(question);
  const analysisIntent = intent !== "feature_help";
  const selected = selectCompetitor(context, normalizedQuestion);
  const rows = relevantRows(context, selected);
  const firstSentence = normalizeText(firstProseSentence(response));

  if (
    analysisIntent &&
    /^(?:to compare|use the competitor|you can (?:view|use)|here is what (?:the )?(?:tool|feature)|based on (?:the )?saved context and (?:tool|feature))\b/.test(
      firstSentence,
    )
  ) {
    issues.push("starts with feature guidance instead of the comparison");
  }
  if (
    intent === "general_comparison" &&
    !/\b(leads?|stronger|ahead|trails?|gaps?|similar|tied|not enough comparable data)\b/.test(
      firstSentence,
    )
  ) {
    issues.push("does not answer the general comparison in the first sentence");
  }
  if (
    [
      "reviews_comparison",
      "social_comparison",
      "seo_comparison",
      "website_comparison",
      "positioning_comparison",
    ].includes(intent) &&
    !/\b(stronger|better|leads?|similar|tied|not (?:currently )?comparable|not enough|appears?)\b/.test(
      firstSentence,
    )
  ) {
    issues.push("does not answer the category comparison in the first sentence");
  }

  if (
    analysisIntent &&
    /\buse (?:the )?competitor intelligence feature\b|\bview (?:the )?saved comparison\b|\buse (?:the )?saved competitor comparison(?: summary)?\b|\btool capabilities\b/.test(
      normalized,
    )
  ) {
    issues.push("includes generic competitor-feature filler");
  }

  if (
    analysisIntent &&
    !/\b(?:more|additional|broader|expand).{0,25}\bcompetitors?\b/.test(
      normalizedQuestion,
    ) &&
    /\badd (?:more|additional|another|2|3|two|three) competitors?\b/.test(
      normalized,
    )
  ) {
    issues.push("recommends adding more competitors without being asked");
  }

  if (
    analysisIntent &&
    /\b(?:review|inspect|check) (?:the )?(?:competitor(?:'s)?|their) website (?:yourself|manually)\b/.test(
      normalized,
    )
  ) {
    issues.push("recommends manual inspection despite stored evidence");
  }

  if (
    context.analyzedCompetitors > 0 &&
    /\b(?:has not|hasn't|not yet|never been).{0,20}\banaly[sz]ed\b|\bno competitor analysis (?:exists|is available)\b/.test(
      normalized,
    )
  ) {
    issues.push("contradicts a current usable competitor snapshot");
  }
  if (
    context.analyzedCompetitors > 0 &&
    /\b(?:run|start) (?:a |the )?competitor analysis\b|\bclick analy[sz]e\b/.test(
      normalized,
    )
  ) {
    issues.push("recommends analysis even though a usable snapshot exists");
  }
  if (
    /\b(?:stronger|higher|better) (?:social )?engagement\b|\bsocial (?:media )?performs better\b|\bposts? more consistently\b|\baudience is more engaged\b|\bstronger social visibility\b|\b(?:wider|broader|greater) (?:social )?reach\b|\bpending profiles?.{0,60}(?:indicate|suggest|create|provide).{0,40}(?:reach|visibility|performance|engagement)\b/.test(
      normalized,
    )
  ) {
    issues.push("makes an unsupported social-performance claim");
  }

  const reviewsNotComparable = rows.some(
    (row) => row.category === "reviews" && unavailableStatuses.includes(row.status),
  );
  if (
    reviewsNotComparable &&
    /\b(?:has|holds|shows) (?:the )?(?:stronger|better) (?:google )?reviews?\b|\breview advantage\b|\bleads? (?:in|on) reviews?\b/.test(
      normalized,
    )
  ) {
    issues.push("turns unavailable review data into an advantage");
  }
  if (
    reviewsNotComparable &&
    ["general_comparison", "reviews_comparison", "business_advantages"].includes(
      intent,
    ) &&
    !/\bnot (?:currently )?comparable\b|\bcannot (?:yet )?be compared\b|\bcannot (?:currently )?be compared\b|\bcannot compare\b/.test(
      normalized,
    )
  ) {
    issues.push("does not explicitly label unavailable reviews as not comparable");
  }

  for (const snapshot of context.latestSnapshots) {
    const confirmed = snapshot.social.confirmedProfiles.length;
    const unconfirmed =
      snapshot.social.pendingProfiles.length +
      snapshot.social.detectedProfiles.length;
    if (unconfirmed === 0) continue;
    const total = confirmed + unconfirmed;
    const name = escapeRegExp(normalizeText(snapshot.competitorName));
    if (new RegExp(`${name}.{0,80}\\b${total} confirmed`, "i").test(normalized)) {
      issues.push(
        `describes pending profiles for ${snapshot.competitorName} as confirmed`,
      );
    }
  }

  const socialRow = rows.find((row) => row.category === "social");
  const discussesSocial =
    /\b(social|instagram|facebook|tiktok|youtube|pending profiles?|confirmed profiles?)\b/.test(
      normalized,
    );
  if (
    socialRow?.status === "similar" &&
    ["general_comparison", "social_comparison"].includes(intent) &&
    !/\b(?:similar|tied|same number|each have|both (?:businesses )?have)\b/.test(
      normalized,
    )
  ) {
    issues.push("does not describe similar confirmed social coverage as similar");
  }
  if (
    analysisIntent &&
    socialRow &&
    ["business_stronger", "competitor_stronger", "similar"].includes(
      socialRow.status,
    ) &&
    (["general_comparison", "social_comparison"].includes(intent) ||
      discussesSocial) &&
    !/\b(?:individual )?posts?.{0,120}(?:not|were not|was not) (?:analy[sz]ed|reviewed)|\bengagement.{0,120}(?:not|was not|were not) (?:analy[sz]ed|available)\b/.test(
      normalized,
    )
  ) {
    issues.push("omits the social-performance limitation");
  }

  if (
    /\b(objectively stronger positioning|definitively better offer|proven clearer brand|guaranteed stronger conversion path)\b/.test(
      normalized,
    )
  ) {
    issues.push("states inferred positioning as objective fact");
  }
  const makesComparativePositioningClaim =
    intent === "positioning_comparison" ||
    ([
      "general_comparison",
      "business_advantages",
      "competitor_advantages",
    ].includes(intent) &&
      /\b(positioning|offer clarity|observable offer)\b/.test(normalized)) ||
    /\b(?:stronger|better|clearer|leads?|advantage).{0,60}\b(?:positioning|offer clarity|observable offer)\b|\b(?:positioning|offer clarity|observable offer).{0,60}\b(?:stronger|better|clearer|leads?|advantage)\b/.test(
      normalized,
    );
  if (
    analysisIntent &&
    makesComparativePositioningClaim &&
    rows.some((row) => row.category === "positioning") &&
    !/\b(appears?|observable|inferred|heuristic|suggests?|based on|public (?:copy|page|website)|pages? scanned|homepage (?:copy|messaging|evidence))\b/.test(
      normalized,
    )
  ) {
    issues.push("does not qualify positioning as inferred public evidence");
  }

  const scoreRows = rows.filter(
    (row) =>
      ["website", "seo"].includes(row.category) &&
      row.businessScore !== null &&
      row.competitorScore !== null &&
      ["business_stronger", "competitor_stronger"].includes(row.status) &&
      intentUsesScoreRow(intent, row),
  );
  for (const row of scoreRows) {
    if (
      !scoreMentioned(response, row.businessScore as number) ||
      !scoreMentioned(response, row.competitorScore as number)
    ) {
      issues.push(
        `omits one or both comparable ${categoryLabel(row.category)} scores`,
      );
    }
  }

  const businessLeadRows = rows.filter(
    (row) => row.status === "business_stronger",
  );
  if (
    businessLeadRows.length === 0 &&
    claimsBusinessAdvantage(response, context.businessName)
  ) {
    issues.push("fabricates a primary-business comparative advantage");
  }
  if (
    businessLeadRows.length === 0 &&
    context.analyzedCompetitors > 0 &&
    Boolean(context.currentComparison) &&
    ["general_comparison", "business_advantages"].includes(intent) &&
    !/\bno (?:clear |confirmed |verified )?(?:advantage|lead)\b|\bno clear .{0,40} advantage\b/.test(
      normalized,
    )
  ) {
    issues.push("does not state that no business advantage was confirmed");
  }

  if (intent === "general_comparison") {
    const competitorHasLead = rows.some(
      (row) => row.status === "competitor_stronger",
    );
    const hasSimilar = rows.some((row) => row.status === "similar");
    if (
      competitorHasLead &&
      !/^###\s+Where .+ leads?\s*$/im.test(response)
    ) {
      issues.push("omits the supported competitor-lead section");
    }
    if (
      hasSimilar &&
      !/^###\s+Similar or tied areas\s*$/im.test(response)
    ) {
      issues.push("omits the similar-or-tied section");
    }
    if (
      context.analyzedCompetitors > 0 &&
      Boolean(context.currentComparison) &&
      rows.some((row) =>
        ["business_stronger", "competitor_stronger"].includes(row.status),
      ) &&
      !/^###\s+Best next moves\s*$/im.test(response)
    ) {
      issues.push("omits the prioritized next-moves section");
    }
  }

  const numberedActions = response.match(/^\d+\.\s+/gm)?.length ?? 0;
  if (analysisIntent && numberedActions > 3) {
    issues.push("includes more than three primary next moves");
  }

  if (analysisIntent && repeatedLongSentence(response)) {
    issues.push("repeats a conclusion");
  }
  if (
    analysisIntent &&
    /\b(?:just ask|feel free to ask|let me know if you(?:'d| would) like|happy to help)\b[.!\s]*$/.test(
      normalized,
    )
  ) {
    issues.push("ends with generic conversational filler");
  }

  const wordCount = response.trim().split(/\s+/).filter(Boolean).length;
  if (intent === "general_comparison" && wordCount > 430) {
    issues.push("general comparison is unnecessarily long");
  }
  if (
    [
      "reviews_comparison",
      "social_comparison",
      "seo_comparison",
      "website_comparison",
      "positioning_comparison",
    ].includes(intent) &&
    wordCount > 300
  ) {
    issues.push("category-specific comparison is unnecessarily long");
  }

  if (/\bcm[a-z0-9]{18,}\b/i.test(response)) {
    issues.push("exposes an internal database identifier");
  }

  return unique(issues);
}

export function competitorTrustIssueCodes(issues: string[]) {
  return unique(
    issues.map((issue) => {
      if (issue.includes("starts with feature guidance")) return "FEATURE_FIRST";
      if (issue.includes("first sentence")) return "DIRECT_ANSWER_MISSING";
      if (issue.includes("feature filler")) return "FEATURE_FILLER";
      if (issue.includes("adding more competitors")) return "UNASKED_EXPANSION";
      if (issue.includes("manual inspection")) return "UNNEEDED_MANUAL_CHECK";
      if (issue.includes("usable competitor snapshot")) return "SNAPSHOT_CONTRADICTION";
      if (issue.includes("analysis even though")) return "REDUNDANT_ANALYSIS";
      if (issue.includes("social-performance limitation")) return "SOCIAL_LIMITATION_MISSING";
      if (issue.includes("social-performance")) return "UNSUPPORTED_SOCIAL_CLAIM";
      if (issue.includes("review data")) return "UNSUPPORTED_REVIEW_CLAIM";
      if (issue.includes("unavailable reviews")) return "REVIEW_LIMITATION_MISSING";
      if (issue.includes("pending profiles")) return "PROFILE_STATUS_MISSTATED";
      if (issue.includes("similar confirmed social")) return "SOCIAL_PARITY_MISSTATED";
      if (issue.includes("objective fact")) return "POSITIONING_OVERSTATED";
      if (issue.includes("positioning as inferred")) return "POSITIONING_QUALIFIER_MISSING";
      if (issue.includes("scores")) return "COMPARABLE_SCORES_MISSING";
      if (issue.includes("primary-business comparative advantage")) return "BUSINESS_ADVANTAGE_UNSUPPORTED";
      if (issue.includes("no business advantage")) return "NO_ADVANTAGE_DISCLOSURE_MISSING";
      if (issue.includes("competitor-lead section")) return "COMPETITOR_SECTION_MISSING";
      if (issue.includes("similar-or-tied section")) return "PARITY_SECTION_MISSING";
      if (issue.includes("next-moves section")) return "NEXT_MOVES_SECTION_MISSING";
      if (issue.includes("more than three")) return "TOO_MANY_ACTIONS";
      if (issue.includes("repeats a conclusion")) return "REPEATED_CONCLUSION";
      if (issue.includes("conversational filler")) return "CLOSING_FILLER";
      if (issue.includes("unnecessarily long")) return "RESPONSE_TOO_LONG";
      if (issue.includes("internal database identifier")) return "INTERNAL_ID_EXPOSED";
      return "UNCLASSIFIED";
    }),
  );
}

function featureHelpResponse(normalizedQuestion: string, businessName: string) {
  if (/\badd\b/.test(normalizedQuestion)) {
    return `Open ${possessive(businessName)} **Competitors** tab and use **Add competitor**. Enter the competitor name, add a public website when available, save it, then click **Analyze** to create its first public snapshot. Confirm any discovered profiles separately so confirmed and pending coverage stay accurate.`;
  }
  if (/\brefresh|update|re-?analy[sz]e|how often\b/.test(normalizedQuestion)) {
    return `Open ${possessive(businessName)} **Competitors** tab and click **Refresh** on one competitor or **Refresh all** for every active competitor. Scans are manual in this version; refresh after a meaningful website change or when the saved snapshot is labeled stale. A current usable snapshot does not need another scan just to answer Consultant questions.`;
  }
  if (/\bwhere|view|find|see\b/.test(normalizedQuestion)) {
    return `Open ${possessive(businessName)} **Competitors** tab. Each analyzed competitor has **View analysis** for its saved website, SEO, social-coverage, review, and inferred-positioning evidence. **Manage profiles** is where you confirm or remove discovered profile links.`;
  }

  return `Use ${possessive(businessName)} **Competitors** tab to add a competitor, run **Analyze**, confirm discovered profiles, and review the saved comparison. Use **Refresh** only when you need a newer public snapshot; the AI Consultant automatically uses the latest usable saved evidence.`;
}

function unavailableComparisonResponse(
  businessName: string,
  snapshots: Snapshot[],
) {
  const statusLines = snapshots.map(
    (snapshot) =>
      `- **${snapshot.competitorName}:** ${statusLabel(snapshot.latestSnapshotStatus)}.`,
  );
  const actionable = snapshots.filter(
    (snapshot) => snapshot.latestSnapshotStatus === "not_analyzed",
  );

  return `There is not enough comparable data yet to determine which business leads.\n\n### Analysis status\n\n${statusLines.join("\n")}\n\n${
    actionable.length > 0
      ? `Run **Analyze** for ${formatList(actionable.map((item) => item.competitorName))} to create the missing public snapshot.`
      : `The saved competitor data is unavailable or failed, so no advantage has been inferred for ${businessName}.`
  }\n\n### Limited-evidence next steps\n\n1. Keep ${possessive(businessName)} offer and primary call to action specific to its target audience.\n2. Confirm saved competitor profile links before treating platform coverage as comparable.\n3. Refresh or complete the competitor analysis before making a competitor-specific claim.\n\nThese are general preparation steps, not findings about the competitor.`;
}

function competitiveActionsResponse({
  question,
  businessName,
  context,
  snapshots,
  rows,
}: {
  question: string;
  businessName: string;
  context: CompetitorConsultantContext;
  snapshots: Snapshot[];
  rows: CategoryComparison[];
}) {
  const socialFocus =
    /\b(social|instagram|facebook|tiktok|youtube|posts?|content)\b/.test(
      question,
    );
  const evidenceRows = socialFocus
    ? rows.filter((row) => row.category === "social")
    : rows;
  const supportedGaps = evidenceRows.filter(
    (row) => row.status === "competitor_stronger",
  );
  const opening =
    supportedGaps.length > 0
      ? `The clearest supported competitive gaps for ${businessName} are ${formatList(
          unique(supportedGaps.map((row) => conclusionCategory(row.category))),
        )}.`
      : `No clear competitor advantage is confirmed in the evidence relevant to this question, so the actions below focus on defensible improvements rather than copying a presumed winner.`;
  const evidence = evidenceRows
    .slice(0, 5)
    .map((row) => {
      if (unavailableStatuses.includes(row.status)) {
        return formatNotComparableRow(row, businessName, context);
      }
      if (row.status === "similar") {
        return formatSimilarRow(row, businessName, context);
      }
      return formatLeadRow(
        row,
        row.status === "business_stronger" ? "business" : "competitor",
        businessName,
        context,
      );
    });
  if (evidence.length === 0) {
    evidence.push(
      "No category has enough overlapping saved evidence for a direct comparison.",
    );
  }

  const actions = socialFocus
    ? socialCompetitiveActions(context, snapshots)
    : buildNextMoves(context, snapshots, rows);
  const generalFallbacks = socialFocus
    ? [
        "Make the audience, main offer, and primary next action consistent across each confirmed social profile.",
        "Use one repeatable weekly content theme tied to the main offer, then measure results with platform analytics before changing direction.",
        "Give every profile one clear conversion path, such as booking, ordering, subscribing, calling, emailing, or sending a DM.",
      ]
    : [
        "Clarify the main offer and primary next action for the target audience.",
        "Strengthen the highest-impact saved recommendation before expanding into another channel.",
        "Measure the result of one change, then refresh both business and competitor evidence before drawing a new comparison.",
      ];
  const nextMoves = uniqueByNormalized([...actions, ...generalFallbacks]).slice(
    0,
    3,
  );
  const socialLimitation =
    socialFocus || evidenceRows.some((row) => row.category === "social")
    ? "Individual posts, engagement, reach, audience size, posting frequency, and content performance were not analyzed."
    : null;
  const freshness = compactFreshnessNote(context, snapshots);

  return [
    opening,
    `### Saved evidence\n\n${bulletList(evidence)}`,
    socialLimitation,
    `### Recommended actions\n\n${numbered(nextMoves)}`,
    "The actions are strategic recommendations derived from the saved evidence; they are not additional observed competitor facts.",
    freshness ? `*Data freshness: ${freshness}*` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function socialCompetitiveActions(
  context: CompetitorConsultantContext,
  snapshots: Snapshot[],
) {
  const actions: string[] = [];
  const primary = context.primaryBusinessEvidence.social;
  const competitorConfirmedPlatforms = unique(
    snapshots.flatMap((snapshot) => snapshot.social.confirmedPlatforms),
  );
  const missingConfirmedPlatforms = competitorConfirmedPlatforms.filter(
    (platform) => !primary.confirmedPlatforms.includes(platform),
  );

  if (primary.pendingPlatforms.length > 0) {
    actions.push(
      `Confirm or remove ${formatList(primary.pendingPlatforms)} before using those profiles in strategy decisions.`,
    );
  }
  if (missingConfirmedPlatforms.length > 0) {
    actions.push(
      `Evaluate ${formatList(missingConfirmedPlatforms)} against the saved target audience before investing there; the competitor has confirmed coverage, but coverage alone does not prove performance.`,
    );
  }
  if (primary.confirmedProfileCount === 0) {
    actions.push(
      "Confirm at least one audience-relevant social profile and give it a specific offer and conversion path.",
    );
  }

  return actions;
}

function generalComparisonResponse(
  businessName: string,
  context: CompetitorConsultantContext,
  snapshots: Snapshot[],
  rows: CategoryComparison[],
) {
  const structured = buildStructuredComparison(
    businessName,
    context,
    snapshots,
    rows,
  );
  const sections: string[] = [structured.overallConclusion];

  if (structured.competitorLeads.length > 0) {
    sections.push(
      `### Where ${snapshots.length === 1 ? `${snapshots[0].competitorName} leads` : "competitors lead"}\n\n${bulletList(structured.competitorLeads)}`,
    );
  }

  sections.push(
    `### Where ${businessName} leads\n\n${
      structured.businessLeads.length > 0
        ? bulletList(structured.businessLeads)
        : standaloneBusinessPosition(businessName, context, rows)
    }`,
  );

  if (structured.similarAreas.length > 0) {
    sections.push(
      `### Similar or tied areas\n\n${bulletList(structured.similarAreas)}`,
    );
  }
  if (structured.notComparable.length > 0) {
    sections.push(
      `### Not currently comparable\n\n${bulletList(structured.notComparable)}`,
    );
  }
  if (structured.nextMoves.length > 0) {
    sections.push(`### Best next moves\n\n${numbered(structured.nextMoves)}`);
  }
  if (structured.freshnessNote) {
    sections.push(`*Data freshness: ${structured.freshnessNote}*`);
  }

  return sections.join("\n\n");
}

function buildStructuredComparison(
  businessName: string,
  context: CompetitorConsultantContext,
  snapshots: Snapshot[],
  rows: CategoryComparison[],
): StructuredComparisonResponse {
  const competitorLeadRows = rows.filter(
    (row) => row.status === "competitor_stronger",
  );
  const businessLeadRows = rows.filter(
    (row) => row.status === "business_stronger",
  );
  const similarRows = rows.filter((row) => row.status === "similar");
  const unavailableRows = rows.filter((row) =>
    unavailableStatuses.includes(row.status),
  );

  return {
    overallConclusion: overallConclusion(
      businessName,
      snapshots,
      competitorLeadRows,
      businessLeadRows,
      similarRows,
    ),
    competitorLeads: competitorLeadRows.map((row) =>
      formatLeadRow(row, "competitor", businessName, context),
    ),
    businessLeads: businessLeadRows.map((row) =>
      formatLeadRow(row, "business", businessName, context),
    ),
    similarAreas: similarRows.map((row) =>
      formatSimilarRow(row, businessName, context),
    ),
    notComparable: unavailableRows.map((row) =>
      formatNotComparableRow(row, businessName, context),
    ),
    nextMoves: buildNextMoves(context, snapshots, rows),
    freshnessNote: compactFreshnessNote(context, snapshots),
  };
}

function overallConclusion(
  businessName: string,
  snapshots: Snapshot[],
  competitorLeadRows: CategoryComparison[],
  businessLeadRows: CategoryComparison[],
  similarRows: CategoryComparison[],
) {
  const target = snapshots.length === 1 ? snapshots[0].competitorName : null;
  const competitorCategories = unique(
    competitorLeadRows.map((row) => conclusionCategory(row.category)),
  );
  const businessCategories = unique(
    businessLeadRows.map((row) => conclusionCategory(row.category)),
  );
  const similarCategories = unique(
    similarRows.map((row) => conclusionCategory(row.category)),
  );

  if (target && competitorCategories.length > 0 && businessCategories.length === 0) {
    return `Based on the latest comparable public data, ${target} currently leads ${businessName} in ${formatList(competitorCategories)}.`;
  }
  if (target && competitorCategories.length > 0 && businessCategories.length > 0) {
    return `Based on the latest comparable public data, ${target} leads in ${formatList(competitorCategories)}, while ${businessName} leads in ${formatList(businessCategories)}.`;
  }
  if (target && businessCategories.length > 0) {
    return `Based on the latest comparable public data, ${businessName} currently leads ${target} in ${formatList(businessCategories)}.`;
  }
  if (target && similarCategories.length > 0) {
    return `Based on the latest comparable public data, ${businessName} and ${target} are currently similar in ${formatList(similarCategories)}.`;
  }
  if (!target && competitorCategories.length > 0) {
    return `Across the latest analyzed competitors, ${possessive(businessName)} clearest supported gaps are ${formatList(competitorCategories)}.`;
  }

  return "There is not enough comparable data yet to determine which business leads.";
}

function formatLeadRow(
  row: CategoryComparison,
  side: "business" | "competitor",
  businessName: string,
  context: CompetitorConsultantContext,
) {
  const winner = side === "business" ? businessName : row.competitorName;
  const loser = side === "business" ? row.competitorName : businessName;
  const winnerScore =
    side === "business" ? row.businessScore : row.competitorScore;
  const loserScore =
    side === "business" ? row.competitorScore : row.businessScore;

  if (
    ["website", "seo"].includes(row.category) &&
    winnerScore !== null &&
    loserScore !== null
  ) {
    const evidence =
      row.category === "website"
        ? websiteDifference(row, businessName)
        : seoDifference(row, side, businessName, context);
    return `**${categoryLabel(row.category)}:** ${winner} scores ${winnerScore}/100 compared with ${possessive(loser)} ${loserScore}/100.${evidence ? ` ${evidence}` : ""}`;
  }

  if (row.category === "positioning") {
    const confidence = positioningConfidence(context, row.competitorId);
    return `**Positioning:** Based on the homepage copy and CTAs scanned, ${winner} appears to communicate its offer and conversion path more clearly. This is an inferred finding with ${confidence} confidence.`;
  }
  if (row.category === "social") {
    return `**Social coverage:** ${row.observation} This compares confirmed public profiles only.`;
  }
  if (row.category === "reviews") {
    return `**Reviews:** ${row.observation}`;
  }

  return `**${categoryLabel(row.category)}:** ${row.observation}`;
}

function formatSimilarRow(
  row: CategoryComparison,
  businessName: string,
  context: CompetitorConsultantContext,
) {
  if (row.category === "social") {
    return `${socialCoverageText(
      businessName,
      context,
      row.competitorId,
      true,
    )} Individual posts, engagement, reach, and performance were not analyzed.`;
  }
  if (row.category === "positioning") {
    return `**Positioning:** Based on the public homepage messaging scanned, neither business has a clear observable offer-clarity lead.`;
  }
  if (
    ["website", "seo"].includes(row.category) &&
    row.businessScore !== null &&
    row.competitorScore !== null
  ) {
    return `**${categoryLabel(row.category)}:** The comparable scores are similar at ${businessName} ${row.businessScore}/100 and ${row.competitorName} ${row.competitorScore}/100.`;
  }
  return `**${categoryLabel(row.category)}:** ${row.observation}`;
}

function formatNotComparableRow(
  row: CategoryComparison,
  businessName: string,
  context: CompetitorConsultantContext,
) {
  if (row.category !== "reviews") {
    return `**${categoryLabel(row.category)}:** ${row.observation}`;
  }

  const primary = context.primaryBusinessEvidence.reviews;
  const competitor = context.latestSnapshots.find(
    (snapshot) => snapshot.competitorId === row.competitorId,
  );
  if (
    (primary.rating !== null || primary.reviewCount !== null) &&
    !competitor?.reviews.comparableMetricsAvailable
  ) {
    return `**Reviews:** Reviews are not currently comparable. ${businessName} has confirmed Google data with ${reviewMetric(primary.rating, primary.reviewCount)}, while comparable review data for ${row.competitorName} is unavailable.`;
  }
  if (
    competitor?.reviews.comparableMetricsAvailable &&
    primary.rating === null &&
    primary.reviewCount === null
  ) {
    return `**Reviews:** Reviews are not currently comparable. ${row.competitorName} has public Google data with ${reviewMetric(competitor.reviews.rating, competitor.reviews.reviewCount)}, while comparable review data for ${businessName} is unavailable.`;
  }

  return `**Reviews:** Reviews are not currently comparable. ${row.observation}`;
}

function standaloneBusinessPosition(
  businessName: string,
  context: CompetitorConsultantContext,
  rows: CategoryComparison[],
) {
  const reviewAsset = standaloneReviewAsset(businessName, context, rows);
  return [
    `No clear advantage for ${businessName} was confirmed in the currently comparable categories.`,
    reviewAsset,
  ]
    .filter(Boolean)
    .join(" ");
}

function standaloneReviewAsset(
  businessName: string,
  context: CompetitorConsultantContext,
  rows: CategoryComparison[],
) {
  const reviewUnavailable = rows.some(
    (row) => row.category === "reviews" && unavailableStatuses.includes(row.status),
  );
  const reviews = context.primaryBusinessEvidence.reviews;
  if (
    !reviewUnavailable ||
    (reviews.rating === null && reviews.reviewCount === null)
  ) {
    return "";
  }

  return `${businessName} has ${reviewMetric(reviews.rating, reviews.reviewCount)}, which is a strong standalone trust asset. Reviews cannot yet be compared, so this is not a confirmed comparative advantage.`;
}

function buildNextMoves(
  context: CompetitorConsultantContext,
  snapshots: Snapshot[],
  rows: CategoryComparison[],
) {
  const competitorLeads = rows.filter(
    (row) => row.status === "competitor_stronger",
  );
  const primaryWebsite = context.primaryBusinessEvidence.website;
  const primarySeo = context.primaryBusinessEvidence.seo;
  const websiteGap = competitorLeads.some((row) => row.category === "website");
  const seoGap = competitorLeads.some((row) => row.category === "seo");
  const positioningGap = competitorLeads.some(
    (row) => row.category === "positioning",
  );
  const actions: string[] = [];

  if (
    (websiteGap || seoGap) &&
    primaryWebsite &&
    primaryWebsite.h1Count !== 1
  ) {
    actions.push(
      `Add one clear homepage H1 that states ${possessive(context.businessName)} main offer and makes the page purpose immediately understandable.`,
    );
  }

  if (seoGap && primarySeo) {
    const metadataActions: string[] = [];
    if (primarySeo.titleStatus !== "good") {
      metadataActions.push("fixing the homepage title");
    }
    if (primarySeo.metaDescriptionStatus === "missing") {
      metadataActions.push("adding a useful meta description");
    } else if (primarySeo.metaDescriptionStatus === "too_long") {
      metadataActions.push("shortening the meta description");
    } else if (primarySeo.metaDescriptionStatus === "too_short") {
      metadataActions.push("expanding the meta description");
    }
    if (primarySeo.canonicalStatus !== "good") {
      metadataActions.push("adding a valid canonical link tag");
    }
    if (metadataActions.length > 0) {
      actions.push(
        `Improve metadata and canonical implementation by ${formatList(metadataActions)}.`,
      );
    } else if (primarySeo.h1Status !== "good" && actions.length === 0) {
      actions.push("Use exactly one descriptive H1 on the homepage.");
    }
  }

  if ((websiteGap || positioningGap) && primaryWebsite) {
    const conversionActions = prioritizeConversionActions(
      primaryWebsite.primaryActions,
    ).slice(0, 5);
    if (conversionActions.length > 0) {
      actions.push(
        `Make ${formatList(conversionActions)} more prominent so visitors have a clearer primary conversion path.`,
      );
    } else {
      actions.push(
        `Make ${context.primaryBusinessEvidence.businessContext.primaryConversionGoal ?? "the primary customer action"} more prominent on the homepage.`,
      );
    }
  }

  if (competitorLeads.some((row) => row.category === "social")) {
    actions.push(
      "Confirm whether the missing social platform fits the target audience before investing in it; profile coverage alone does not prove performance.",
    );
  }
  if (competitorLeads.some((row) => row.category === "reviews")) {
    actions.push(
      "Strengthen the verified review-request process and place current customer proof near the main decision point.",
    );
  }

  if (actions.length < 3) {
    const opportunityFallbacks =
      context.currentComparison?.opportunities
        .filter((item) =>
          snapshots.some(
            (snapshot) => snapshot.competitorId === item.competitorId,
          ),
        )
        .map((item) => conciseOpportunity(item)) ?? [];
    actions.push(...opportunityFallbacks);
  }

  return uniqueByNormalized(actions).slice(0, 3);
}

function reviewsResponse(
  businessName: string,
  context: CompetitorConsultantContext,
  snapshots: Snapshot[],
  rows: CategoryComparison[],
) {
  const reviewRows = rows.filter((row) => row.category === "reviews");
  if (reviewRows.length === 0) {
    return "Reviews are not currently comparable because no overlapping review-analysis evidence is available.";
  }

  const unavailable = reviewRows.filter((row) =>
    unavailableStatuses.includes(row.status),
  );
  if (unavailable.length > 0) {
    const details = unavailable.map((row) =>
      formatNotComparableRow(row, businessName, context),
    );
    const detailText = details
      .map((detail) => detail.replace(/^\*\*Reviews:\*\*\s*/, ""))
      .join("\n\n");
    return `${
      /^Reviews are not currently comparable\./i.test(detailText)
        ? detailText
        : `Reviews are not currently comparable. ${detailText}`
    }\n\nNo review winner is declared from one-sided data, and review sentiment was not analyzed.`;
  }

  return `${reviewRows[0].observation}\n\n- **${businessName}:** ${reviewRows[0].businessDisplay}\n- **${reviewRows[0].competitorName}:** ${reviewRows[0].competitorDisplay}\n\nThis compares visible rating and review-count fields only; customer sentiment was not analyzed.`;
}

function socialResponse(
  businessName: string,
  context: CompetitorConsultantContext,
  snapshots: Snapshot[],
  rows: CategoryComparison[],
) {
  const socialRows = rows.filter((row) => row.category === "social");
  if (socialRows.length === 0) {
    return "There is not enough confirmed social-profile data to determine which business has broader coverage. Individual posts, engagement, reach, and performance were not analyzed.";
  }

  const lines = socialRows.map((row) =>
    socialCoverageText(businessName, context, row.competitorId, row.status === "similar"),
  );
  const first =
    socialRows.length === 1
      ? socialRows[0].status === "similar"
        ? `Confirmed social coverage is currently similar for ${businessName} and ${socialRows[0].competitorName}.`
        : socialRows[0].observation
      : `Confirmed social coverage varies across ${socialRows.length} analyzed competitors.`;

  return `${first}\n\n${bulletList(lines)}\n\nIndividual posts, engagement, reach, audience size, and content performance were not analyzed, so no social-performance winner is declared.`;
}

function socialCoverageText(
  businessName: string,
  context: CompetitorConsultantContext,
  competitorId: string,
  similar: boolean,
) {
  const primary = context.primaryBusinessEvidence.social;
  const competitor = context.latestSnapshots.find(
    (snapshot) => snapshot.competitorId === competitorId,
  );
  if (!competitor) return "Confirmed profile coverage is unavailable.";

  const shared = sortPlatforms(
    primary.confirmedPlatforms.filter((platform) =>
      competitor.social.confirmedPlatforms.includes(platform),
    ),
  );
  const samePlatforms =
    primary.confirmedPlatforms.length ===
      competitor.social.confirmedPlatforms.length &&
    shared.length === primary.confirmedPlatforms.length;
  const competitorUnconfirmed =
    competitor.social.pendingProfiles.length +
    competitor.social.detectedProfiles.length;
  const coverage = samePlatforms
    ? `${similar ? "Confirmed social coverage is currently similar: " : ""}both businesses have ${formatList(shared)} confirmed.`
    : `${businessName} has ${primary.confirmedProfileCount} confirmed profile${primary.confirmedProfileCount === 1 ? "" : "s"} across ${formatList(sortPlatforms(primary.confirmedPlatforms))}, while ${competitor.competitorName} has ${competitor.social.confirmedProfiles.length} across ${formatList(sortPlatforms(competitor.social.confirmedPlatforms))}.`;
  const pending =
    competitorUnconfirmed > 0
      ? ` ${competitor.competitorName} has ${competitorUnconfirmed} additional profile${competitorUnconfirmed === 1 ? "" : "s"} awaiting confirmation or detected from its website.`
      : "";

  return `**Social coverage:** ${coverage}${pending}`;
}

function categoryResponse(
  businessName: string,
  context: CompetitorConsultantContext,
  snapshots: Snapshot[],
  rows: CategoryComparison[],
  category: "website" | "seo" | "positioning",
) {
  const categoryRows = rows.filter((row) => row.category === category);
  if (categoryRows.length === 0) {
    return `There is not enough comparable ${categoryLabel(category).toLowerCase()} data yet to determine which business leads.`;
  }

  const row = categoryRows[0];
  const conclusion = categoryConclusion(row, category, businessName);
  const evidence = categoryEvidence(row, category, businessName, context);
  const moves = buildNextMoves(context, snapshots, rows).filter((move) =>
    category === "seo"
      ? /\b(h1|metadata|canonical|title|description|seo)\b/i.test(move)
      : category === "website"
        ? /\b(homepage|h1|conversion path|menu|hours|contact|takeout|events)\b/i.test(
            move,
          )
        : /\b(offer|conversion path|homepage|primary customer action|menu|hours|contact|takeout|events)\b/i.test(
            move,
          ),
  );
  const sections = [conclusion];
  if (evidence.length > 0) {
    sections.push(`### Evidence\n\n${bulletList(evidence)}`);
  }
  if (moves.length > 0) {
    sections.push(`### Priority fixes\n\n${numbered(moves.slice(0, 2))}`);
  }
  const freshness = compactFreshnessNote(context, snapshots);
  if (freshness) sections.push(`*Data freshness: ${freshness}*`);

  return sections.join("\n\n");
}

function categoryConclusion(
  row: CategoryComparison,
  category: "website" | "seo" | "positioning",
  businessName: string,
) {
  if (row.status === "competitor_stronger") {
    if (
      category !== "positioning" &&
      row.businessScore !== null &&
      row.competitorScore !== null
    ) {
      return `${row.competitorName} currently has the stronger ${category === "seo" ? "technical SEO foundation" : "website structure"}: ${row.competitorScore}/100 compared with ${possessive(businessName)} ${row.businessScore}/100.`;
    }
    return `Based on the public homepage copy and CTAs scanned, ${row.competitorName} appears to communicate its offer and conversion path more clearly than ${businessName}.`;
  }
  if (row.status === "business_stronger") {
    if (
      category !== "positioning" &&
      row.businessScore !== null &&
      row.competitorScore !== null
    ) {
      return `${businessName} currently has the stronger ${category === "seo" ? "technical SEO foundation" : "website structure"}: ${row.businessScore}/100 compared with ${possessive(row.competitorName)} ${row.competitorScore}/100.`;
    }
    return `Based on the public homepage copy and CTAs scanned, ${businessName} appears to communicate its offer and conversion path more clearly than ${row.competitorName}.`;
  }
  if (row.status === "similar") {
    return `${businessName} and ${row.competitorName} are currently similar on the available ${category === "positioning" ? "observable offer-clarity" : category.toUpperCase()} signals.`;
  }
  return `There is not enough comparable ${category.toUpperCase()} data to determine a winner.`;
}

function categoryEvidence(
  row: CategoryComparison,
  category: "website" | "seo" | "positioning",
  businessName: string,
  context: CompetitorConsultantContext,
) {
  if (category === "positioning") {
    const confidence = positioningConfidence(context, row.competitorId);
    return [
      `${row.observation.replace(/ is stronger on the comparable observable offer clarity signals in the latest snapshots\.?/i, " appears to show clearer observable offer and CTA signals.")}`,
      `This is inferred from public homepage messaging with ${confidence} confidence, not an objective performance result.`,
    ];
  }

  const lines: string[] = [];
  if (row.businessScore !== null && row.competitorScore !== null) {
    lines.push(
      `${businessName}: ${row.businessScore}/100; ${row.competitorName}: ${row.competitorScore}/100.`,
    );
  }
  if (category === "website") {
    const difference = websiteDifference(row, businessName);
    if (difference) lines.push(difference);
    const primaryActions =
      context.primaryBusinessEvidence.website?.primaryActions ?? [];
    const competitorActions =
      context.latestSnapshots.find(
        (snapshot) => snapshot.competitorId === row.competitorId,
      )?.website?.primaryActions ?? [];
    if (primaryActions.length > 0 || competitorActions.length > 0) {
      lines.push(
        `Detected primary actions: ${businessName} ${formatList(primaryActions.slice(0, 6))}; ${row.competitorName} ${formatList(competitorActions.slice(0, 6))}.`,
      );
    }
    const primaryPages = context.primaryBusinessEvidence.website?.pagesScanned;
    const competitorPages = context.latestSnapshots.find(
      (snapshot) => snapshot.competitorId === row.competitorId,
    )?.pagesScanned;
    if (primaryPages && competitorPages && primaryPages !== competitorPages) {
      lines.push(
        `Crawl coverage differed: ${primaryPages} pages for ${businessName} and ${competitorPages} for ${row.competitorName}. Both scores still use completed website sections, but page-level details should be read with that coverage difference in mind.`,
      );
    }
  } else {
    const side =
      row.status === "business_stronger" ? "business" : "competitor";
    const difference = seoDifference(row, side, businessName, context);
    if (difference) lines.push(difference);
  }

  return lines;
}

function advantageResponse({
  side,
  businessName,
  context,
  snapshots,
  rows,
}: {
  side: "business" | "competitor";
  businessName: string;
  context: CompetitorConsultantContext;
  snapshots: Snapshot[];
  rows: CategoryComparison[];
}) {
  const leadStatus =
    side === "business" ? "business_stronger" : "competitor_stronger";
  const leadRows = rows.filter((row) => row.status === leadStatus);
  const unavailableReviewRows = rows.filter(
    (row) => row.category === "reviews" && unavailableStatuses.includes(row.status),
  );
  const sections: string[] = [];

  if (leadRows.length === 0) {
    sections.push(
      side === "business"
        ? `No clear ${businessName} advantage was confirmed in the currently comparable categories.`
        : `No clear competitor advantage was confirmed in the currently comparable categories.`,
    );
  } else {
    const target =
      side === "business"
        ? businessName
        : snapshots.length === 1
          ? snapshots[0].competitorName
          : "The analyzed competitors";
    sections.push(
      `Based on the latest comparable public data, ${target} currently leads in ${formatList(unique(leadRows.map((row) => conclusionCategory(row.category))))}.`,
    );
    sections.push(
      `### Supported leads\n\n${bulletList(
        leadRows.map((row) =>
          formatLeadRow(row, side, businessName, context),
        ),
      )}`,
    );
  }

  if (side === "business") {
    const standalone = standaloneReviewAsset(businessName, context, rows);
    if (standalone) sections.push(standalone);
  }
  if (unavailableReviewRows.length > 0) {
    sections.push(
      unavailableReviewRows
        .map((row) => formatNotComparableRow(row, businessName, context))
        .join("\n\n"),
    );
  }
  const freshness = compactFreshnessNote(context, snapshots);
  if (freshness) sections.push(`*Data freshness: ${freshness}*`);

  return sections.join("\n\n");
}

function analysisStatusResponse(businessName: string, snapshots: Snapshot[]) {
  const usable = snapshots.filter((snapshot) => snapshot.usableSnapshotId);
  const first =
    usable.length === snapshots.length
      ? `${formatList(usable.map((snapshot) => snapshot.competitorName))} ${usable.length === 1 ? "has" : "have"} usable competitor analysis.`
      : usable.length > 0
        ? `${usable.length} of ${snapshots.length} selected competitors has usable analysis.`
        : "No selected competitor has a usable analysis snapshot yet.";
  const lines = snapshots.map((snapshot) => {
    if (!snapshot.usableSnapshotId) {
      return `- **${snapshot.competitorName}:** ${statusLabel(snapshot.latestSnapshotStatus)}; no comparison evidence is available.`;
    }
    return `- **${snapshot.competitorName}:** ${snapshot.freshnessState}, scanned ${formatDate(snapshot.scannedAt)}, covering ${snapshot.pagesScanned} page${snapshot.pagesScanned === 1 ? "" : "s"}. ${sectionSummary(snapshot)}${
      snapshot.latestSnapshotStatus === "failed"
        ? " The latest refresh failed, so the older usable snapshot is retained."
        : ""
    }`;
  });

  return `${first}\n\n${lines.join("\n")}`;
}

function freshnessResponse(
  businessName: string,
  context: CompetitorConsultantContext,
  snapshots: Snapshot[],
) {
  const lines = [
    `- **${businessName} audit:** ${formatDate(context.freshness.primaryAuditAt)}.`,
    ...snapshots.map(
      (snapshot) =>
        `- **${snapshot.competitorName}:** ${snapshot.freshnessState}, scanned ${formatDate(snapshot.scannedAt)}.${
          snapshot.latestSnapshotStatus === "failed" && snapshot.usableSnapshotId
            ? " The latest refresh failed, so this uses the older usable snapshot."
            : ""
        }`,
    ),
  ];
  const note = compactFreshnessNote(context, snapshots);

  return `${snapshots.length === 1 ? snapshots[0].competitorName : "The selected competitors"} ${snapshots.every((snapshot) => snapshot.freshnessState === "current") ? "has current saved snapshot data" : "includes data that needs a freshness qualification"}.\n\n${lines.join("\n")}${note ? `\n\n${note}` : ""}`;
}

function missingDataResponse(
  businessName: string,
  snapshots: Snapshot[],
  context: CompetitorConsultantContext,
) {
  const missing: string[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot.reviews.comparableMetricsAvailable) {
      missing.push(
        `**${snapshot.competitorName} reviews:** comparable Google rating and review-count data is unavailable.`,
      );
    }
    if (snapshot.social.pendingProfiles.length > 0) {
      missing.push(
        `**${snapshot.competitorName} profiles:** ${snapshot.social.pendingProfiles.length} saved link${snapshot.social.pendingProfiles.length === 1 ? " needs" : "s need"} confirmation.`,
      );
    }
    if (snapshot.social.detectedProfiles.length > 0) {
      missing.push(
        `**${snapshot.competitorName} detected links:** ${snapshot.social.detectedProfiles.length} website-detected link${snapshot.social.detectedProfiles.length === 1 ? " is" : "s are"} not confirmed.`,
      );
    }
    if (snapshot.failedSections.length > 0) {
      missing.push(
        `**${snapshot.competitorName} analyzer sections:** ${snapshot.failedSections.join(", ")} are unavailable.`,
      );
    }
  }
  missing.push(
    "**Private performance data:** traffic, sales, conversions, ad spend, social reach, engagement, posting frequency, and post performance are unavailable.",
  );

  const freshness = compactFreshnessNote(context, snapshots);
  return `The current comparison is missing some evidence, but unavailable data is not treated as a win for either business.\n\n${bulletList(missing)}${freshness ? `\n\n*Data freshness: ${freshness}*` : ""}`;
}

function websiteDifference(row: CategoryComparison, businessName: string) {
  const headline = row.evidence.find((item) => item.label === "Homepage headline");
  if (!headline) return "";
  const businessMissing = /\b0 h1|not (?:clearly )?detected|none detected\b/i.test(
    headline.businessValue,
  );
  const competitorMissing = /\b0 h1|not (?:clearly )?detected|none detected\b/i.test(
    headline.competitorValue,
  );
  if (businessMissing && !competitorMissing) {
    return `The latest homepage scan found a clear H1 for ${row.competitorName}, while no H1 was detected for ${businessName}.`;
  }
  if (!businessMissing && competitorMissing) {
    return `The latest homepage scan found a clear H1 for ${businessName}, while no H1 was detected for ${row.competitorName}.`;
  }
  return `The saved headline and primary-action evidence supports the score difference.`;
}

function seoDifference(
  row: CategoryComparison,
  side: "business" | "competitor",
  businessName: string,
  context: CompetitorConsultantContext,
) {
  const competitor = context.latestSnapshots.find(
    (snapshot) => snapshot.competitorId === row.competitorId,
  );
  const businessSeo = context.primaryBusinessEvidence.seo;
  const competitorSeo = competitor?.seo;
  if (!businessSeo || !competitorSeo) {
    const evidence = row.evidence.find(
      (item) => item.label === "Homepage SEO checks",
    );
    return evidence
      ? `Saved checks: ${businessName} ${evidence.businessValue}; ${row.competitorName} ${evidence.competitorValue}.`
      : "";
  }

  const weaker = side === "competitor" ? businessSeo : competitorSeo;
  const stronger = side === "competitor" ? competitorSeo : businessSeo;
  const weakerName = side === "competitor" ? businessName : row.competitorName;
  const issues = seoIssueDifferences(weaker, stronger);
  return issues.length > 0
    ? `${possessive(weakerName)} main structural gaps are ${formatList(issues)}.`
    : `The saved title, metadata, H1, canonical, robots.txt, and sitemap checks support the score difference.`;
}

function seoIssueDifferences(
  weaker: {
    titleStatus: string;
    metaDescriptionStatus: string;
    h1Status: string;
    canonicalStatus: string;
    robotsTxtStatus: string;
    sitemapStatus: string;
  },
  stronger: {
    titleStatus: string;
    metaDescriptionStatus: string;
    h1Status: string;
    canonicalStatus: string;
    robotsTxtStatus: string;
    sitemapStatus: string;
  },
) {
  const issues: string[] = [];
  if (weaker.h1Status !== "good" && stronger.h1Status === "good") {
    issues.push(seoStatusPhrase("H1", weaker.h1Status));
  }
  if (
    weaker.metaDescriptionStatus !== "good" &&
    stronger.metaDescriptionStatus === "good"
  ) {
    issues.push(
      seoStatusPhrase("meta description", weaker.metaDescriptionStatus),
    );
  }
  if (
    weaker.canonicalStatus !== "good" &&
    stronger.canonicalStatus === "good"
  ) {
    issues.push(seoStatusPhrase("canonical tag", weaker.canonicalStatus));
  }
  if (weaker.titleStatus !== "good" && stronger.titleStatus === "good") {
    issues.push(seoStatusPhrase("page title", weaker.titleStatus));
  }
  if (
    weaker.robotsTxtStatus !== "found" &&
    stronger.robotsTxtStatus === "found"
  ) {
    issues.push("robots.txt availability");
  }
  if (
    weaker.sitemapStatus !== "found" &&
    stronger.sitemapStatus === "found"
  ) {
    issues.push("sitemap.xml availability");
  }
  return issues;
}

function seoStatusPhrase(label: string, status: string) {
  if (status === "missing") return `a missing ${label}`;
  if (status === "too_long") return `an overlong ${label}`;
  if (status === "too_short") return `an undersized ${label}`;
  if (status === "multiple") return `multiple ${label} values`;
  return `${label} quality`;
}

function compactFreshnessNote(
  context: CompetitorConsultantContext,
  snapshots: Snapshot[],
) {
  const mismatched = context.freshness.competitorDataNewerThanAudit.filter(
    (name) => snapshots.some((snapshot) => snapshot.competitorName === name),
  );
  if (mismatched.length > 0) {
    return `${formatList(mismatched.map(possessive))} snapshot${mismatched.length === 1 ? " is" : "s are"} newer than ${possessive(context.businessName)} latest audit, so rerunning ${possessive(context.businessName)} audit would provide the fairest current score comparison.`;
  }

  const qualified = snapshots.filter((snapshot) =>
    ["stale", "partial", "failed"].includes(snapshot.freshnessState),
  );
  if (qualified.length > 0) {
    return qualified
      .map((snapshot) => {
        if (
          snapshot.freshnessState === "failed" &&
          snapshot.usableSnapshotId
        ) {
          return `${possessive(snapshot.competitorName)} latest refresh failed, so the comparison uses its older usable snapshot from ${formatDate(snapshot.scannedAt)}`;
        }
        return `${possessive(snapshot.competitorName)} snapshot is ${snapshot.freshnessState} as of ${formatDate(snapshot.scannedAt)}`;
      })
      .join("; ");
  }

  return null;
}

function relevantRows(
  context: CompetitorConsultantContext,
  selected?: Snapshot,
) {
  return (
    context.currentComparison?.categoryComparisons.filter(
      (row) => !selected || row.competitorId === selected.competitorId,
    ) ?? []
  );
}

function selectCompetitor(
  context: CompetitorConsultantContext,
  normalizedQuestion: string,
) {
  const explicit = context.latestSnapshots.find((snapshot) =>
    normalizedQuestion.includes(normalizeText(snapshot.competitorName)),
  );
  if (explicit) return explicit;
  return context.latestSnapshots.length === 1
    ? context.latestSnapshots[0]
    : undefined;
}

function intentUsesScoreRow(
  intent: CompetitorConsultantIntent,
  row: CategoryComparison,
) {
  if (intent === "general_comparison") return true;
  if (intent === "business_advantages") {
    return row.status === "business_stronger";
  }
  if (intent === "competitor_advantages") {
    return row.status === "competitor_stronger";
  }
  return intent === `${row.category}_comparison`;
}

function claimsBusinessAdvantage(response: string, businessName: string) {
  const normalized = normalizeText(
    response.replace(/^#{1,6}\s+.*$/gm, ""),
  );
  const name = escapeRegExp(normalizeText(businessName));
  return new RegExp(
    `\\b${name}(?:'s|s')?\\s+(?:leads?|wins?|outperforms?|is stronger|has (?:a )?(?:clear |confirmed |competitive )?advantage)\\b`,
    "i",
  ).test(normalized);
}

function scoreMentioned(response: string, score: number) {
  return new RegExp(`\\b${score}\\s*(?:/|out of)\\s*100\\b`, "i").test(
    response,
  );
}

function firstProseSentence(response: string) {
  const prose = response
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        !line.startsWith("#") &&
        !/^[-*]\s/.test(line) &&
        !/^\d+\.\s/.test(line),
    );
  return prose?.split(/(?<=[.!?])\s+/).at(0) ?? "";
}

function repeatedLongSentence(response: string) {
  const seen = new Set<string>();
  const sentences = response
    .replace(/^#{1,6}\s+.*$/gm, "")
    .split(/(?<=[.!?])(?:\s+|$)/)
    .map(normalizeText)
    .filter((sentence) => sentence.length >= 55);
  for (const sentence of sentences) {
    if (seen.has(sentence)) return true;
    seen.add(sentence);
  }
  return false;
}

function positioningConfidence(
  context: CompetitorConsultantContext,
  competitorId: string,
) {
  return (
    context.latestSnapshots.find(
      (snapshot) => snapshot.competitorId === competitorId,
    )?.positioning?.confidence ?? "moderate"
  );
}

function prioritizeConversionActions(actions: string[]) {
  const priority = [
    "menu",
    "order / takeout",
    "takeout",
    "directions",
    "hours",
    "events",
    "contact",
    "book",
    "reserve",
    "shop",
    "gift cards",
  ];
  return [...new Set(actions)].sort((a, b) => {
    const aIndex = priority.findIndex((value) =>
      a.toLowerCase().includes(value),
    );
    const bIndex = priority.findIndex((value) =>
      b.toLowerCase().includes(value),
    );
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
}

function sortPlatforms(platforms: string[]) {
  const priority = [
    "Instagram",
    "Facebook",
    "TikTok",
    "YouTube",
    "LinkedIn",
    "X",
    "Pinterest",
  ];
  return [...new Set(platforms)].sort((a, b) => {
    const aIndex = priority.indexOf(a);
    const bIndex = priority.indexOf(b);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
}

function conciseOpportunity(item: ComparisonStatement) {
  if (item.category === "website") {
    return "Clarify the primary homepage conversion path using business-specific copy and a more prominent next action.";
  }
  if (item.category === "seo") {
    return "Fix the highest-confidence title, metadata, H1, canonical, robots.txt, or sitemap difference first.";
  }
  if (item.category === "positioning") {
    return "Tighten the audience, offer, differentiator, and primary CTA without copying competitor wording.";
  }
  if (item.category === "social") {
    return "Confirm whether the missing profile fits the target audience before investing in the channel.";
  }
  return item.description;
}

function sectionSummary(snapshot: Snapshot) {
  return `${Object.entries(snapshot.sections)
    .map(
      ([section, state]) =>
        `${categoryLabel(section)} ${state.replaceAll("_", " ")}`,
    )
    .join("; ")}.`;
}

function reviewMetric(rating: number | null, count: number | null) {
  const parts: string[] = [];
  if (rating !== null) parts.push(`a ${rating.toFixed(1)} rating`);
  if (count !== null) parts.push(`${count.toLocaleString()} reviews`);
  return parts.length > 0 ? formatList(parts) : "no comparable rating or count";
}

function conclusionCategory(category: CategoryComparison["category"]) {
  const labels: Record<CategoryComparison["category"], string> = {
    website: "website structure",
    seo: "technical SEO",
    reviews: "visible Google review signals",
    social: "confirmed social profile coverage",
    positioning: "observable offer clarity",
  };
  return labels[category];
}

function categoryLabel(value: string) {
  if (value.toLowerCase() === "seo") return "SEO";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function numbered(items: string[]) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function bulletList(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function formatList(items: string[]) {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return "none";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")}, and ${clean.at(-1)}`;
}

function possessive(value: string) {
  if (/[\u2018\u2019']s$/i.test(value)) return value;
  return /s$/i.test(value) ? `${value}'` : `${value}'s`;
}

function formatDate(value: string | null) {
  if (!value) return "date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueByNormalized(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeText(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

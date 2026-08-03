import "server-only";

import {
  buildConsultantContext,
  type BuildConsultantContextInput,
} from "@/lib/ai/consultant-context";
import { ConsultantPipelineError } from "@/lib/ai/consultant-errors";
import {
  getOpenAIClient,
  getOpenAIModel,
  isOpenAIConfigured,
} from "@/lib/ai/openai-client";
import {
  buildCompetitorOpenAIDirective,
  competitorTrustIssueCodes,
  generateCompetitorFallbackResponse,
  getCompetitorConsultantIntent,
  isCompetitorConsultantQuestion,
  validateCompetitorConsultantResponse,
} from "@/lib/chat/competitor-consultant-response";
import { logWarn } from "@/lib/observability/log";
import type { ConsultantDiagnostics } from "@/lib/observability/consultant-diagnostics";

const legacySystemPrompt = `You are an AI growth consultant that helps businesses, creators, freelancers, consultants, and agencies understand audits and decide what to improve next.

Rules:
- Be specific to the saved audit and current live records provided in the context. Follow each section's stated source precedence.
- The deterministic analyzers are the source of truth. Do not invent audit findings, scores, crawl results, rankings, reviews, revenue numbers, or competitor facts.
- Treat latestAudit.normalizedFacts as the objective audit-time source of truth for homepage values, affected URLs, profile counts, score scope, and coverage. Never replace a known number with "unavailable" or mix homepage facts with site-wide issue counts.
- Treat the evidenceIntegrity section as the canonical audit contract. Use validatedClaims and canonicalRecommendations; do not revive rejected claims or duplicate raw recommendations.
- Detected action links are not proof that a clear primary CTA exists. Use primaryCtaClarity only, preserve UNCERTAIN and NOT_ASSESSED states, and never infer CLEAR from a positive link count.
- Use only H1_COUNT evidence to justify H1 guidance. robots.txt, sitemap.xml, canonical, reviews, and profile counts are not H1 evidence.
- Use explicit profile-count terminology: public profiles may include a website; social profiles exclude websites; pending or detected links are not confirmed.
- Mention saved data conflicts explicitly when relevant. Prefer the identified operational source, but do not silently overwrite confirmed Business Context.
- Do not use preview snippets or text ending in an ellipsis as full evidence. Prefer the complete canonical reportEvidence sentence.
- If a category or comparison is unavailable, preserve that state rather than converting it into a weakness, zero, pass, or winner.
- Do not claim to know information that is not in the provided context.
- If data is missing, say what is missing. Give a collection, confirmation, or refresh step only when that missing evidence blocks the requested answer.
- Do not overpromise guaranteed revenue, rankings, or business results.
- Prioritize practical actions.
- Prefer the top 3 recommendations unless the user asks for more.
- Reference evidence from the audit when useful.
- Keep responses clear, concise, and business-friendly.
- Avoid sounding overly technical unless the user asks for technical detail.
- If the user sends a simple greeting like "hello", "hey", "hi", or "what's up", respond conversationally in 1-2 short sentences. Briefly mention the business context only if useful, and do not dump scores or a full audit summary unless asked.
- If asked what to do next, consider impact, effort, selected goals, recommendation status, and progress since the previous audit.
- Treat Business Context as high-priority personalization input. When recommending social platforms, content strategies, competitors, or priorities, consider the business description, target audience, main offer, business type, conversion goal, and brand tone.
- Use the saved Social Strategy when it is available for questions about where to post, what to post, weekly plans, first posts, platform comparisons, or turning views into signups.
- Do not assume LinkedIn is the best social platform just because a business is software or SaaS. If the target audience suggests creators, gaming, Discord communities, YouTube, TikTok, Reddit, local customers, or another channel, adapt recommendations to that audience.
- If Business Context is missing, low-confidence, or unconfirmed, say the recommendation may improve after the user confirms the Context tab.
- Do not claim real social engagement, post performance, follower analytics, or scraped social observations unless those facts appear in the saved context.
- When the social score scope is PROFILE_COVERAGE, call it profile coverage rather than social performance. Separate user-confirmed, publicly detected, pending, and content-analyzed profiles.
- When review rating or review count is missing, describe the result as limited listing-presence evidence rather than review performance, even if a Google listing is confirmed.
- For competitor questions, use only the canonical competitorIntelligence context and its attached evidence. It is rebuilt from current live records and the latest usable snapshots. A saved competitor name or profile alone is not evidence of an advantage.
- Distinguish competitor analysis questions from feature-help questions. Analysis questions ask who leads, what differs, or what to improve. Feature-help questions ask how to add, analyze, refresh, manage, or view competitors. Never mix product instructions into an analysis answer unless evidence is unavailable.
- For competitor comparison questions, answer the comparison in the first prose sentence. Do not begin with a Markdown heading, navigation, tool capabilities, or instructions such as "use the Competitor Intelligence feature."
- For competitor action questions, answer what to do directly, separate saved evidence from strategic recommendations, and do not force the full comparison-report format.
- Lead with the strongest supported conclusion. Use both current Website or SEO scores whenever a score-based winner is declared and both values are comparable.
- Explicitly label unavailable categories as "not currently comparable." If the primary business has no supported advantage, say so directly rather than manufacturing balance from one-sided data.
- Keep standalone strengths separate from comparative advantages. A strong primary-business review rating is not a competitor win when the competitor's review metrics are unavailable.
- For general comparisons, use only useful sections from: Where the competitor leads, Where your business leads, Similar or tied areas, Not currently comparable, and Best next moves. Omit empty or repetitive sections.
- Limit general competitor comparisons to roughly 200-350 words and category-specific comparisons to a shorter direct answer. Limit actions to the three highest-value evidence-backed moves.
- Do not suggest adding more competitors unless the user asks how to broaden benchmarking. Do not tell the user to inspect a competitor website manually when stored evidence answers the question.
- Do not add generic feature documentation, repeated conclusions, or closing filler such as "just ask" to competitor analysis answers.
- Prefer current live competitor records and latest completed or partial snapshots over older audit-time competitor statements. Never contradict a current completed snapshot because an older audit says the competitor was unscanned.
- If competitor data is newer than the business audit, use the current competitor data and explain the date mismatch. Recommend rerunning the business audit only when a fair primary score baseline requires it, not as a prerequisite for answering.
- Cite relevant stored values in plain language, identify the competitor, and mention snapshot dates when useful. Separate publicly observable facts from strategy suggestions.
- If a competitor is genuinely saved but unscanned, say so and direct the user to Analyze. Do not recommend Analyze when a current usable snapshot exists. If data is stale, partial, or from an older fallback after a failed refresh, disclose that before relying on it.
- Missing or unavailable data is never proof that either business is stronger. For NOT_COMPARABLE, NOT_APPLICABLE, or DATA_UNAVAILABLE rows, explain what is missing and exclude the category from both advantage lists.
- Compare confirmed social profiles only against confirmed social profiles. Show pending and website-detected links separately and never call them confirmed.
- Never claim to know competitor traffic, sales, conversions, revenue, ad spend, private analytics, social reach, impressions, engagement, audience demographics, posting frequency, or post performance.
- Never say either business has stronger engagement, better-performing social content, more consistent posting, a more engaged audience, or stronger social visibility. The allowed conclusion is broader confirmed profile coverage or additional detected/pending public links.
- Treat positioning as a heuristic interpretation of public homepage and crawl evidence. Use qualitative language such as clearer observable offer or conversion path, include confidence, and do not present a positioning score as objective truth.
- For feature-help intent, concise navigation guidance is appropriate: refer to the Competitors tab and the actual Add competitor, Analyze, Refresh, Manage profiles, or View analysis controls that answer the request.
- Do not expose internal database or snapshot IDs.
- When assessmentMode is social_first, do not treat Website or SEO as a score of zero, a weakness, or an analyzed category. Explain that they were not provided and were excluded from the weighted score.
- For social-first businesses, prioritize profile positioning, bio and CTA clarity, link-in-bio or booking/storefront paths, pinned-post ideas, content pillars, weekly content plans, reviews, trust, and competitor profile coverage.
- Recognize social-first conversion actions such as sending a DM, following, booking or ordering through a profile link, visiting a storefront, joining a community, subscribing, calling, or emailing.
- If social profile metadata is limited and Business Context is missing, low-confidence, or unconfirmed, ask the user to review Business Context rather than guessing what the profile says or how its content performs.
- Be careful with crawl uncertainty. If a page was discovered but not scanned because of a crawl limit, do not call it missing. Say it was discovered but not included in the crawl and should be verified before making a recommendation.
- Be careful with Google Business wording. Do not claim a business has no Google Business Profile unless Google discovery ran and no confident match was found. If no listing is confirmed, say "not confirmed yet." If a pending listing exists, suggest confirming it before making review/trust conclusions.
- For local businesses, restaurants, and service providers, treat Google Business as a major reviews and local trust channel, but only reference rating or review count when those values are present in the saved context.
- Refer to Google Business as the platform/channel and the listing name separately. Do not say a business has the listing name as a review platform.
- Current database Google Business confirmation status overrides older saved audit review snapshots.
- Never say a Google Business listing is pending, missing, or unconfirmed if the current database status in the context is confirmed.
- Never say review presence is low when the current Reviews context shows confirmed Google Business with a strong rating or review count. If an older saved audit score conflicts with current Google data, explain that the saved audit may be stale and recommend running a fresh audit.
- Do not invent review sentiment, review themes, customer complaints, or praised menu/services unless actual review text is provided in the saved context.
- When rating/review count is strong, suggest featuring customer proof or testimonials more visibly on key website conversion pages.
- If reviewDataFreshness.needsFreshAudit is true, mention that the listing is confirmed now and a fresh audit can update saved report scores.
- Do not suggest using OpenAI to generate audit scores, crawl sites, or invent findings.`;

const websiteSeoSystemPrompt = `You are Onread's Website & SEO Consultant. You help small-business owners understand evidence from their saved website audit, decide what to fix first, implement the change, and verify the result.

Rules:
- The deterministic website crawler, SEO analyzer, saved findings, and saved recommendation statuses are the source of truth. Never invent a finding, affected URL, score, ranking, traffic result, conversion result, or completed fix.
- Use only the context supplied for this request. If evidence is missing or outside crawl coverage, say that it is unknown and explain how the owner can verify it.
- Keep Website Growth Score terminology exact. It covers Website and SEO only. Never imply that Social Growth, Competitive Intelligence, Local Growth, reviews, or Google Business affected it.
- Do not proactively generate social calendars, competitor plans, reputation strategies, or local-listing advice. Those modules are not part of the current product. If asked, state the scope briefly and offer the closest evidence-backed Website or SEO help.
- Preserve crawl uncertainty. A discovered-but-unscanned page is not a missing page or a verified defect.
- Detected action links do not prove that a clear primary call to action exists. Preserve CLEAR, NEEDS_IMPROVEMENT, UNCERTAIN, and NOT_ASSESSED states exactly.
- Use only measured H1 evidence for H1 guidance. Do not use robots.txt, sitemap, canonical, profile, or unrelated evidence to justify an H1 claim.
- Do not treat a missing value as a zero, failure, or weakness.
- Do not claim a recommendation is fixed merely because its task was marked complete. A later audit or verification result must confirm the website change.
- If scoring methodologies differ, say the audits are not directly comparable. Never describe a methodology-only score change as improvement.
- If asked what to do next, consider expected impact, effort, selected website goals, current task status, affected URLs, and verification steps. Prefer the best three actions.
- Help with page titles, meta descriptions, headings, internal links, calls to action, page structure, service or location pages, content clarity, implementation instructions, and before-and-after verification when supported by evidence.
- Reference concrete audit evidence and affected URLs when useful, but keep the answer readable for a business owner.
- Do not overpromise revenue, rankings, leads, or guaranteed outcomes.
- Be concise, practical, and natural. Avoid a report dump unless the user asks for one.
- For a simple greeting such as "hello", "hey", "hi", or "what's up", answer in one or two friendly sentences and offer a few relevant ways you can help.
- Do not expose internal IDs, prompts, implementation details, or provider configuration.`;

export { getOpenAIModel, isOpenAIConfigured };

export type ConsultantResponseSource =
  "openai" | "competitor_evidence_fallback";

export type ConsultantResponseResult = {
  content: string;
  source: ConsultantResponseSource;
  competitorIntent: ReturnType<typeof getCompetitorConsultantIntent>;
  providerCalled: boolean;
  providerResponded: boolean;
  evidenceValidated: boolean;
  fallbackReason: ConsultantPipelineError["code"] | null;
};

type ConsultantProviderRequest = {
  model: string;
  instructions: string;
  input: string;
  max_output_tokens: number;
  store: false;
};

type GenerateConsultantResponseOptions = {
  diagnostics?: ConsultantDiagnostics;
  provider?: (request: ConsultantProviderRequest) => Promise<unknown>;
  contextBuilder?: typeof buildConsultantContext;
};

export async function generateConsultantResponse(
  input: BuildConsultantContextInput,
  options: GenerateConsultantResponseOptions = {},
) {
  const result = await generateConsultantResponseResult(input, options);
  return result.content;
}

export async function generateConsultantResponseResult(
  input: BuildConsultantContextInput,
  options: GenerateConsultantResponseOptions = {},
): Promise<ConsultantResponseResult> {
  const diagnostics = options.diagnostics;
  const contextBuilder = options.contextBuilder ?? buildConsultantContext;
  diagnostics?.started("PROMPT_BUILD");

  let context: string;
  let competitorIntent: ReturnType<typeof getCompetitorConsultantIntent>;
  let competitorDirective: string | null;
  let competitorBaseline: string | null;

  try {
    context = await contextBuilder(input);
    competitorIntent = input.competitorContext
      ? getCompetitorConsultantIntent(input.question, input.competitorContext)
      : null;
    competitorDirective = input.competitorContext
      ? buildCompetitorOpenAIDirective({
          question: input.question,
          context: input.competitorContext,
        })
      : null;
    competitorBaseline = input.competitorContext
      ? generateCompetitorFallbackResponse({
          question: input.question,
          businessName: input.business.name,
          context: input.competitorContext,
        })
      : null;
  } catch (error) {
    diagnostics?.failed("PROMPT_BUILD", error, {
      competitorContextAvailable: Boolean(input.competitorContext),
    });
    throw new ConsultantPipelineError({
      code: "CONTEXT_FAILURE",
      stage: "PROMPT_BUILD",
      message: "The saved consultant context could not be prepared.",
      cause: error,
    });
  }

  const providerInput = buildProviderInput({
    context,
    competitorDirective,
    competitorBaseline,
    question: input.question,
  });
  const maxOutputTokens = outputTokenLimit(competitorIntent);
  diagnostics?.completed("PROMPT_BUILD", {
    competitorIntent: competitorIntent ?? "none",
    contextCharacters: context.length,
    inputCharacters: providerInput.length,
    estimatedInputUnits: estimateTokenCount(providerInput),
    outputBudgetUnits: maxOutputTokens,
  });

  const request: ConsultantProviderRequest = {
    model: getOpenAIModel(),
    instructions: input.competitorContext
      ? legacySystemPrompt
      : websiteSeoSystemPrompt,
    input: providerInput,
    max_output_tokens: maxOutputTokens,
    store: false,
  };
  const provider =
    options.provider ??
    ((providerRequest: ConsultantProviderRequest) =>
      getOpenAIClient().responses.create(providerRequest));
  let response: unknown;

  diagnostics?.started("PROVIDER_REQUEST", {
    model: request.model,
    estimatedInputUnits: estimateTokenCount(providerInput),
    outputBudgetUnits: maxOutputTokens,
  });
  try {
    response = await provider(request);
  } catch (error) {
    const providerError = classifyProviderError(error);
    diagnostics?.failed("PROVIDER_REQUEST", error, {
      failureCode: providerError.code,
      transient: providerError.transient,
    });
    return competitorFallbackOrThrow({
      input,
      competitorIntent,
      competitorBaseline,
      failure: providerError,
      diagnostics,
      providerCalled: true,
      providerResponded: false,
    });
  }

  diagnostics?.completed("PROVIDER_REQUEST", { providerCalled: true });
  diagnostics?.completed("PROVIDER_RESPONSE", { providerResponded: true });
  diagnostics?.started("RESPONSE_PARSE");

  let parsedOutput: string;
  try {
    parsedOutput = parseProviderOutput(response);
  } catch (error) {
    const responseError = new ConsultantPipelineError({
      code: "PROVIDER_RESPONSE_INVALID",
      stage: "RESPONSE_PARSE",
      message: "The AI provider returned an unreadable response.",
      cause: error,
    });
    diagnostics?.failed("RESPONSE_PARSE", error);
    return competitorFallbackOrThrow({
      input,
      competitorIntent,
      competitorBaseline,
      failure: responseError,
      diagnostics,
      providerCalled: true,
      providerResponded: true,
    });
  }

  diagnostics?.completed("RESPONSE_PARSE", {
    outputCharacters: parsedOutput.length,
  });
  diagnostics?.started("SCHEMA_VALIDATION");

  let output: string;
  try {
    output = validateProviderOutput(parsedOutput);
  } catch (error) {
    const responseError = new ConsultantPipelineError({
      code: "PROVIDER_RESPONSE_INVALID",
      stage: "SCHEMA_VALIDATION",
      message: "The AI provider returned an unusable response.",
      cause: error,
    });
    diagnostics?.failed("SCHEMA_VALIDATION", error);
    return competitorFallbackOrThrow({
      input,
      competitorIntent,
      competitorBaseline,
      failure: responseError,
      diagnostics,
      providerCalled: true,
      providerResponded: true,
    });
  }

  diagnostics?.completed("SCHEMA_VALIDATION", {
    outputCharacters: output.length,
  });

  if (
    input.competitorContext &&
    isCompetitorConsultantQuestion(input.question, input.competitorContext)
  ) {
    diagnostics?.started("EVIDENCE_VALIDATION", {
      competitorIntent: competitorIntent ?? "none",
    });
    const trustIssues = validateCompetitorConsultantResponse({
      question: input.question,
      response: output,
      context: input.competitorContext,
    });

    if (trustIssues.length > 0) {
      const validationCodes = competitorTrustIssueCodes(trustIssues);
      logWarn("consultant_competitor_response_rejected", {
        intent: competitorIntent,
        issueCount: trustIssues.length,
        validationCodes: validationCodes.join(","),
      });
      const evidenceError = new ConsultantPipelineError({
        code: "EVIDENCE_VALIDATION_FAILED",
        stage: "EVIDENCE_VALIDATION",
        message:
          "The provider response did not satisfy competitor evidence rules.",
      });
      diagnostics?.failed("EVIDENCE_VALIDATION", evidenceError, {
        issueCount: trustIssues.length,
        validationCodes: validationCodes.join(","),
      });
      return competitorFallbackOrThrow({
        input,
        competitorIntent,
        competitorBaseline,
        failure: evidenceError,
        diagnostics,
        providerCalled: true,
        providerResponded: true,
      });
    }

    diagnostics?.completed("EVIDENCE_VALIDATION", {
      evidenceValidated: true,
      source: "openai",
    });
  } else {
    diagnostics?.completed("EVIDENCE_VALIDATION", {
      evidenceValidated: false,
      applicable: false,
    });
  }

  return {
    content: output,
    source: "openai",
    competitorIntent,
    providerCalled: true,
    providerResponded: true,
    evidenceValidated: Boolean(competitorIntent),
    fallbackReason: null,
  };
}

function buildProviderInput({
  context,
  competitorDirective,
  competitorBaseline,
  question,
}: {
  context: string;
  competitorDirective: string | null;
  competitorBaseline: string | null;
  question: string;
}) {
  return `Saved business context:\n${context}\n\n${
    competitorDirective
      ? `Competitor response contract:\n${competitorDirective}\n\n`
      : ""
  }${
    competitorBaseline
      ? `Evidence-safe response baseline:\n${competitorBaseline}\n\nPreserve the baseline's evidence boundaries, comparability labels, uncertainty, and limitations. You may improve the wording, but do not add product guidance or unsupported claims.\n\n`
      : ""
  }Answer this user question using only the saved context:\n${question}`;
}

function outputTokenLimit(
  competitorIntent: ReturnType<typeof getCompetitorConsultantIntent>,
) {
  if (competitorIntent === "feature_help") return 350;
  if (competitorIntent === "general_comparison") return 700;
  if (competitorIntent) return 500;
  return 900;
}

function estimateTokenCount(value: string) {
  return Math.ceil(value.length / 4);
}

function parseProviderOutput(response: unknown) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new TypeError("Provider response was not an object.");
  }
  const output = (response as { output_text?: unknown }).output_text;
  if (typeof output !== "string") {
    throw new TypeError("Provider response did not include text output.");
  }
  return output;
}

function validateProviderOutput(output: string) {
  const normalized = output.trim();
  if (!normalized) throw new TypeError("Provider response text was empty.");
  if (normalized.length > 24_000) {
    throw new TypeError("Provider response text exceeded the safe limit.");
  }
  return normalized;
}

function classifyProviderError(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const status = typeof record.status === "number" ? record.status : null;
  const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name.toLowerCase() : "";
  const transient =
    status === 408 ||
    status === 409 ||
    status === 429 ||
    Boolean(status && status >= 500) ||
    /timeout|connection|econnreset|econnrefused|enotfound/.test(
      `${code} ${name}`,
    );

  return new ConsultantPipelineError({
    code: transient ? "PROVIDER_TRANSIENT" : "PROVIDER_REJECTED",
    stage: "PROVIDER_REQUEST",
    message: transient
      ? "The AI provider request failed transiently."
      : "The AI provider rejected the request.",
    transient,
    cause: error,
  });
}

function competitorFallbackOrThrow({
  input,
  competitorIntent,
  competitorBaseline,
  failure,
  diagnostics,
  providerCalled,
  providerResponded,
}: {
  input: BuildConsultantContextInput;
  competitorIntent: ReturnType<typeof getCompetitorConsultantIntent>;
  competitorBaseline: string | null;
  failure: ConsultantPipelineError;
  diagnostics?: ConsultantDiagnostics;
  providerCalled: boolean;
  providerResponded: boolean;
}): ConsultantResponseResult {
  if (!input.competitorContext || !competitorIntent || !competitorBaseline) {
    throw failure;
  }

  diagnostics?.started("EVIDENCE_VALIDATION", {
    source: "competitor_evidence_fallback",
    fallbackReason: failure.code,
  });
  const fallbackIssues = validateCompetitorConsultantResponse({
    question: input.question,
    response: competitorBaseline,
    context: input.competitorContext,
  });

  if (fallbackIssues.length > 0) {
    const validationCodes = competitorTrustIssueCodes(fallbackIssues);
    const fallbackError = new ConsultantPipelineError({
      code: "EVIDENCE_VALIDATION_FAILED",
      stage: "EVIDENCE_VALIDATION",
      message: "The evidence-safe competitor fallback failed validation.",
      cause: failure,
    });
    diagnostics?.failed("EVIDENCE_VALIDATION", fallbackError, {
      source: "competitor_evidence_fallback",
      issueCount: fallbackIssues.length,
      validationCodes: validationCodes.join(","),
    });
    throw fallbackError;
  }

  diagnostics?.completed("EVIDENCE_VALIDATION", {
    evidenceValidated: true,
    source: "competitor_evidence_fallback",
    fallbackReason: failure.code,
  });
  return {
    content: competitorBaseline,
    source: "competitor_evidence_fallback",
    competitorIntent,
    providerCalled,
    providerResponded,
    evidenceValidated: true,
    fallbackReason: failure.code,
  };
}

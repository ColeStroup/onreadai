import "server-only";

import {
  BusinessGoal,
  BusinessProfileStatus,
  ProfilePlatform,
} from "@prisma/client";

import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import {
  type BusinessContextDraft,
  normalizeContextConfidence,
} from "@/lib/business-context";
import { businessGoalLabels } from "@/lib/goals";
import { logError } from "@/lib/observability/log";
import {
  getOpenAIClient,
  getOpenAIModel,
  isOpenAIConfigured,
} from "@/lib/ai/openai-client";

type BusinessContextProfile = {
  platform: ProfilePlatform;
  status: BusinessProfileStatus;
  url?: string | null;
  handle?: string | null;
  displayName?: string | null;
};

export type GenerateBusinessContextInput = {
  businessName: string;
  initialInput: string;
  websiteAnalysis?: WebsiteAnalysis | null;
  websiteCrawl?: WebsiteCrawlResult | null;
  profiles?: BusinessContextProfile[];
  goals?: BusinessGoal[];
  primaryGoal?: BusinessGoal | null;
};

export async function generateBusinessContextDraft(
  input: GenerateBusinessContextInput,
): Promise<BusinessContextDraft> {
  if (!isOpenAIConfigured()) {
    return generateFallbackContext(input);
  }

  try {
    const client = getOpenAIClient();
    const response = await client.responses.create({
      model: getOpenAIModel(),
      instructions:
        "You generate concise structured Business Context for an AI growth audit app. Base every field only on provided extracted website/profile/audit evidence. Do not invent specific claims. If uncertain, use cautious language. Return only valid JSON with the requested keys.",
      input: `Extracted evidence:\n${JSON.stringify(
        buildCompactEvidence(input),
        null,
        2,
      )}\n\nReturn JSON with keys: description, targetAudience, mainOffer, industry, businessType, primaryConversionGoal, brandTone, confidence, reasoningSummary. Confidence must be 0-100. Keep text useful for a business owner.`,
      max_output_tokens: 700,
      store: false,
    });
    const parsed = parseContextJson(response.output_text);

    if (parsed) {
      return parsed;
    }
  } catch (error) {
    logError("business_context_ai_failed", error);
  }

  return generateFallbackContext(input);
}

function buildCompactEvidence(input: GenerateBusinessContextInput) {
  const crawlPages =
    input.websiteCrawl?.pageResults
      .filter(
        (page) =>
          typeof page.statusCode === "number" &&
          page.statusCode >= 200 &&
          page.statusCode < 400,
      )
      .slice(0, 8)
      .map((page) => ({
        path: pathOnly(page.url),
        title: page.title,
        h1Text: page.h1Text.slice(0, 2),
        ctaCandidates: page.ctaCandidates.slice(0, 4),
        wordCount: page.wordCount,
      })) ?? [];
  const profiles =
    input.profiles
      ?.filter((profile) => profile.status !== BusinessProfileStatus.REMOVED)
      .map((profile) => ({
        platform: profile.platform,
        status: profile.status,
        value: profile.url ?? profile.handle ?? profile.displayName ?? null,
      })) ?? [];

  return {
    businessName: input.businessName,
    originalInput: input.initialInput,
    selectedGoals: input.goals?.map((goal) => businessGoalLabels[goal]) ?? [],
    primaryGoal: input.primaryGoal
      ? businessGoalLabels[input.primaryGoal]
      : null,
    homepage: input.websiteAnalysis
      ? {
          url: input.websiteAnalysis.normalizedUrl,
          title: input.websiteAnalysis.pageTitle,
          metaDescription: input.websiteAnalysis.metaDescription,
          h1Text: input.websiteAnalysis.h1Text.slice(0, 4),
          ctaCandidates: input.websiteAnalysis.ctaCandidates.slice(0, 8),
          detectedSocialLinks:
            input.websiteAnalysis.detectedSocialLinks.slice(0, 8),
        }
      : null,
    crawlSummary: input.websiteCrawl
      ? {
          pagesScanned: input.websiteCrawl.pagesScanned,
          importantPagesFound: input.websiteCrawl.importantPagesFound,
          importantPagesMissing: input.websiteCrawl.importantPagesMissing,
          importantPages: crawlPages,
        }
      : null,
    profiles,
  };
}

function parseContextJson(value?: string | null): BusinessContextDraft | null {
  if (!value) {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    const parsed = JSON.parse(cleaned) as Partial<BusinessContextDraft>;
    const confidence = normalizeContextConfidence(parsed.confidence) ?? 45;

    return {
      description: cleanText(parsed.description) || "Context needs review.",
      targetAudience:
        cleanText(parsed.targetAudience) || "Target audience needs review.",
      mainOffer: cleanText(parsed.mainOffer) || "Main offer needs review.",
      industry: cleanText(parsed.industry) || "Uncategorized",
      businessType: cleanText(parsed.businessType) || "Unclear",
      primaryConversionGoal:
        cleanText(parsed.primaryConversionGoal) || "Primary conversion goal needs review.",
      brandTone: cleanText(parsed.brandTone) || "Professional",
      confidence,
      reasoningSummary:
        cleanText(parsed.reasoningSummary) ||
        "Generated from saved website, profile, and audit evidence.",
    };
  } catch {
    return null;
  }
}

function generateFallbackContext(
  input: GenerateBusinessContextInput,
): BusinessContextDraft {
  const textEvidence = [
    input.businessName,
    input.initialInput,
    input.websiteAnalysis?.pageTitle,
    input.websiteAnalysis?.metaDescription,
    ...(input.websiteAnalysis?.h1Text ?? []),
    ...(input.websiteAnalysis?.ctaCandidates ?? []),
    ...(input.websiteCrawl?.pageResults.flatMap((page) => [
      page.title,
      ...page.h1Text,
      ...page.ctaCandidates,
    ]) ?? []),
    ...(input.profiles?.map(
      (profile) => profile.url ?? profile.handle ?? profile.displayName,
    ) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const primaryText =
    input.websiteAnalysis?.metaDescription ||
    input.websiteAnalysis?.h1Text.at(0) ||
    input.websiteAnalysis?.pageTitle ||
    input.initialInput ||
    input.businessName;
  const businessType = inferBusinessType(textEvidence);
  const industry = inferIndustry(textEvidence, businessType);
  const targetAudience = inferTargetAudience(textEvidence, businessType);
  const primaryConversionGoal = inferConversionGoal(
    textEvidence,
    input.goals ?? [],
    input.primaryGoal,
  );
  const brandTone = inferBrandTone(textEvidence);
  const confidence = input.websiteAnalysis
    ? input.websiteCrawl?.successfulPages
      ? 62
      : 55
    : 35;

  return {
    description: `${input.businessName} appears to offer ${sentenceFragment(
      primaryText,
    )}. Confirm this summary so recommendations match the business accurately.`,
    targetAudience,
    mainOffer: `The main offer appears related to ${sentenceFragment(primaryText)}.`,
    industry,
    businessType,
    primaryConversionGoal,
    brandTone,
    confidence,
    reasoningSummary:
      "Drafted from saved website title, meta description, H1 text, CTA language, confirmed profiles, and selected goals. Please edit any uncertain fields.",
  };
}

function inferBusinessType(text: string) {
  if (/\b(discord|server owner|community manager|gaming|guild|creator)\b/.test(text)) {
    return "Community / creator tool";
  }

  if (/\b(app|software|platform|saas|dashboard|login|signup|sign up|free trial)\b/.test(text)) {
    return "SaaS / software";
  }

  if (/\b(restaurant|pizza|cafe|salon|dentist|roofing|plumber|tampa|near me|local)\b/.test(text)) {
    return "Local business";
  }

  if (/\b(agency|consultant|consulting|freelancer|studio|marketing)\b/.test(text)) {
    return "Service business";
  }

  if (/\b(shop|store|buy|cart|checkout|product)\b/.test(text)) {
    return "Ecommerce";
  }

  return "Business";
}

function inferIndustry(text: string, businessType: string) {
  if (/\b(discord|gaming|community|creator)\b/.test(text)) {
    return "Community management / creator tools";
  }

  if (/\b(marketing|seo|growth|agency)\b/.test(text)) {
    return "Marketing / growth";
  }

  if (/\b(restaurant|pizza|food|cafe)\b/.test(text)) {
    return "Food and beverage";
  }

  if (/\b(roofing|plumber|hvac|contractor|home service)\b/.test(text)) {
    return "Home services";
  }

  if (businessType === "SaaS / software") {
    return "Software";
  }

  return "Uncategorized";
}

function inferTargetAudience(text: string, businessType: string) {
  if (/\b(discord|gaming|community|server owner|guild|creator)\b/.test(text)) {
    return "Discord server owners, gaming communities, creators, and community managers.";
  }

  if (businessType === "Local business") {
    return "Local customers researching trusted businesses nearby.";
  }

  if (businessType === "SaaS / software") {
    return "People or teams looking for a software tool that solves the problem described on the website.";
  }

  if (businessType === "Service business") {
    return "Business owners or teams looking for expert help and a clear next step.";
  }

  if (businessType === "Ecommerce") {
    return "Online shoppers comparing products, trust signals, and purchase options.";
  }

  return "Potential customers researching the business online.";
}

function inferConversionGoal(
  text: string,
  goals: BusinessGoal[],
  primaryGoal?: BusinessGoal | null,
) {
  const selectedGoals = primaryGoal ? [primaryGoal, ...goals] : goals;

  if (/\b(sign up|signup|start free|free trial|get started|create account)\b/.test(text)) {
    return "Get visitors to sign up or start using the product.";
  }

  if (/\b(book|schedule|consultation|call|demo)\b/.test(text)) {
    return "Get visitors to book a call, demo, or appointment.";
  }

  if (/\b(contact|quote|request)\b/.test(text)) {
    return "Get visitors to contact the business or request a quote.";
  }

  if (/\b(buy|order|purchase|shop)\b/.test(text)) {
    return "Get visitors to purchase.";
  }

  const leadConversionGoals: BusinessGoal[] = [
        BusinessGoal.MORE_LEADS,
        BusinessGoal.INCREASE_CONVERSIONS,
        BusinessGoal.BUILD_EMAIL_LIST,
  ];

  if (selectedGoals.some((goal) => leadConversionGoals.includes(goal))) {
    return "Turn visitors into leads through a clear signup, contact, or email capture step.";
  }

  return "Move visitors toward the next clear action.";
}

function inferBrandTone(text: string) {
  if (/\b(gaming|creator|community|discord|fun|stream)\b/.test(text)) {
    return "Helpful, direct, and community-oriented.";
  }

  if (/\b(professional|enterprise|consulting|strategy|agency)\b/.test(text)) {
    return "Professional and advisory.";
  }

  if (/\b(local|family|trusted|nearby)\b/.test(text)) {
    return "Trustworthy and approachable.";
  }

  return "Clear, helpful, and professional.";
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 700) : "";
}

function sentenceFragment(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim()
    .slice(0, 180);
}

function pathOnly(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return url;
  }
}

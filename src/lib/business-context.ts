import type { Business } from "@prisma/client";

export type BusinessContextSource = "generated" | "user_edited" | "manual";

export type BusinessContextDraft = {
  description: string;
  targetAudience: string;
  mainOffer: string;
  industry: string;
  businessType: string;
  primaryConversionGoal: string;
  brandTone: string;
  confidence: number;
  reasoningSummary: string;
};

export type BusinessContextFields = Pick<
  Business,
  | "description"
  | "targetAudience"
  | "mainOffer"
  | "industry"
  | "businessType"
  | "primaryConversionGoal"
  | "brandTone"
  | "contextConfidence"
  | "contextSource"
  | "contextConfirmedAt"
  | "contextUpdatedAt"
>;

export const contextSourceLabels: Record<string, string> = {
  generated: "Generated",
  user_edited: "User edited",
  manual: "Manual",
};

export function hasBusinessContext(context: BusinessContextFields) {
  return Boolean(
    context.description ||
      context.targetAudience ||
      context.mainOffer ||
      context.industry ||
      context.businessType ||
      context.primaryConversionGoal ||
      context.brandTone,
  );
}

export function hasCoreBusinessContext(
  context: Pick<Business, "description" | "targetAudience" | "mainOffer">,
) {
  return Boolean(
    context.description?.trim() &&
      context.targetAudience?.trim() &&
      context.mainOffer?.trim(),
  );
}

export function isContextConfirmed(context: BusinessContextFields) {
  return Boolean(context.contextConfirmedAt);
}

export function shouldRefreshGeneratedBusinessContext(
  context: BusinessContextFields,
) {
  if (!hasBusinessContext(context)) {
    return true;
  }

  return (
    context.contextSource === "generated" &&
    !isContextConfirmed(context) &&
    (normalizeContextConfidence(context.contextConfidence) ?? 0) < 55
  );
}

export function normalizeContextConfidence(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function contextSourceLabel(source?: string | null) {
  if (!source) {
    return "Not set";
  }

  return contextSourceLabels[source] ?? source.replaceAll("_", " ");
}

export function contextConfidenceLabel(value?: number | null) {
  const confidence = normalizeContextConfidence(value);

  if (confidence === null) {
    return "Not scored";
  }

  if (confidence >= 80) {
    return `${confidence}/100 high confidence`;
  }

  if (confidence >= 55) {
    return `${confidence}/100 medium confidence`;
  }

  return `${confidence}/100 low confidence`;
}

export function contextSummaryLine(context: BusinessContextFields) {
  if (context.description) {
    return context.description;
  }

  if (context.mainOffer || context.targetAudience) {
    return [context.mainOffer, context.targetAudience]
      .filter(Boolean)
      .join(" for ");
  }

  return "";
}

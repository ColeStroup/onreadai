import { createHash } from "node:crypto";

import type { AuditAiModelRoute } from "@/lib/ai/model-routing";
import type { CrawledPageResult } from "@/lib/analyzers/website-crawler";
import {
  PAGE_ANALYSIS_PROMPT_VERSION,
  PAGE_ANALYSIS_SCHEMA_VERSION,
} from "@/lib/audits/selective-ai/config";
import type {
  PageAnalysisPayload,
  SelectiveAiBusinessContext,
} from "@/lib/audits/selective-ai/types";

export type PageAnalysisCacheIdentity = {
  cacheKey: string;
  normalizedUrl: string;
  canonicalUrl: string | null;
  contentHash: string;
  metadataHash: string;
  businessContextHash: string;
  goalContextHash: string;
  promptVersion: string;
  schemaVersion: string;
  modelRoute: string;
  model: string;
};

export function buildPageAnalysisCacheIdentity({
  businessId,
  page,
  payload,
  route,
  versions,
}: {
  businessId: string;
  page: CrawledPageResult;
  payload: PageAnalysisPayload;
  route: AuditAiModelRoute;
  versions?: {
    promptVersion?: string;
    schemaVersion?: string;
  };
}): PageAnalysisCacheIdentity {
  const promptVersion =
    versions?.promptVersion ?? PAGE_ANALYSIS_PROMPT_VERSION;
  const schemaVersion =
    versions?.schemaVersion ?? PAGE_ANALYSIS_SCHEMA_VERSION;
  const normalizedUrl = normalizeCacheUrl(page.url);
  const canonicalUrl = page.canonicalUrl
    ? normalizeCacheUrl(page.canonicalUrl)
    : null;
  const contentHash =
    page.contentHash ?? hash(payload.primaryVisibleContent);
  const metadataHash =
    page.metadataHash ??
    hash(
      stableStringify({
        title: payload.title,
        metaDescription: payload.metaDescription,
        h1Text: payload.h1Text,
        h2Text: payload.h2Text,
        h3Text: payload.h3Text,
        canonicalUrl,
        prominentCtas: payload.prominentCtas,
      }),
    );
  const businessContextHash = hashBusinessContext(payload.businessContext);
  const goalContextHash = hash(
    stableStringify({
      primary: payload.goals.primary,
      selected: [...payload.goals.selected].sort(),
    }),
  );
  const cacheKey = hash(
    stableStringify({
      businessId,
      normalizedUrl,
      canonicalUrl,
      contentHash,
      metadataHash,
      businessContextHash,
      goalContextHash,
      promptVersion,
      schemaVersion,
      modelRoute: `${route.route}:${route.routeVersion}`,
      model: route.model,
    }),
  );

  return {
    cacheKey,
    normalizedUrl,
    canonicalUrl,
    contentHash,
    metadataHash,
    businessContextHash,
    goalContextHash,
    promptVersion,
    schemaVersion,
    modelRoute: `${route.route}:${route.routeVersion}`,
    model: route.model,
  };
}

export function hashBusinessContext(context: SelectiveAiBusinessContext) {
  return hash(
    stableStringify({
      description: context.description,
      targetAudience: context.targetAudience,
      mainOffer: context.mainOffer,
      industry: context.industry,
      businessType: context.businessType,
      primaryConversionGoal: context.primaryConversionGoal,
      brandTone: context.brandTone,
    }),
  );
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizeCacheUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }
  return url.toString();
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

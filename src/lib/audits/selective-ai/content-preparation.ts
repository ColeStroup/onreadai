import type { BusinessGoal } from "@prisma/client";

import type { CrawledPageResult } from "@/lib/analyzers/website-crawler";
import { selectiveAiAuditLimits } from "@/lib/audits/selective-ai/config";
import type {
  PageAnalysisPayload,
  SelectiveAiBusinessContext,
} from "@/lib/audits/selective-ai/types";

export function preparePageAnalysisPayload({
  page,
  businessContext,
  goals,
  primaryGoal,
}: {
  page: CrawledPageResult;
  businessContext: SelectiveAiBusinessContext;
  goals: BusinessGoal[];
  primaryGoal: BusinessGoal | null;
}): PageAnalysisPayload {
  const sourceContent =
    cleanText(page.analysisContent) ||
    cleanText(page.contentExcerpt) ||
    "";
  const retainedContent = retainRepresentativeContent(
    sourceContent,
    selectiveAiAuditLimits.maximumRetainedPageContentCharacters,
  );
  const deterministicFindings = deterministicPageFindings(page);

  const payload: PageAnalysisPayload = {
    normalizedUrl: page.url,
    canonicalUrl: page.canonicalUrl ?? null,
    pageTypes: page.pageTypes,
    title: page.title,
    metaDescription: page.metaDescription,
    h1Text: page.h1Text.slice(0, 8),
    h2Text: (page.h2Text ?? []).slice(0, 16),
    h3Text: (page.h3Text ?? []).slice(0, 16),
    primaryVisibleContent: retainedContent.text,
    prominentCtas: page.actionSummary?.detectedActionLinks
      ?.filter(
        (candidate) =>
          candidate.domLocation === "hero" ||
          candidate.domLocation === "main" ||
          candidate.buttonLike,
      )
      .map((candidate) => candidate.label || candidate.href)
      .filter((candidate): candidate is string => Boolean(candidate))
      .slice(0, 16) ?? page.ctaCandidates.slice(0, 16),
    navigationLabels: (page.navigationLabels ?? []).slice(0, 30),
    formLabels: (page.formLabels ?? []).slice(0, 24),
    trustSignals: (page.trustSignals ?? []).slice(0, 12),
    contactSignals: page.contactSignals.slice(0, 12),
    visibleImageAltText: (page.imageAltText ?? []).slice(0, 30),
    structuredDataTypes: (page.structuredDataTypes ?? []).slice(0, 20),
    wordCount: page.wordCount,
    internalLinksCount: page.internalLinksCount,
    deterministicFindings,
    businessContext,
    goals: {
      primary: primaryGoal,
      selected: goals,
    },
    contentTruncated: retainedContent.truncated,
    retainedCharacters: retainedContent.text.length,
    availableCharacters: sourceContent.length,
  };

  return enforcePayloadLimit(payload);
}

export function serializeUntrustedPageEvidence(payload: PageAnalysisPayload) {
  const serialized = JSON.stringify(payload, null, 2)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");

  return [
    "<untrusted_webpage_evidence>",
    serialized,
    "</untrusted_webpage_evidence>",
  ].join("\n");
}

export function deterministicPageFindings(page: CrawledPageResult) {
  const findings: string[] = [];
  if (!page.title) findings.push("Title element is missing.");
  if (!page.metaDescription) findings.push("Meta description is missing.");
  if (page.h1Count === 0) findings.push("No H1 was detected.");
  if (page.h1Count > 1) findings.push(`${page.h1Count} H1 elements were detected.`);
  if (!page.hasCanonical) findings.push("Canonical link was not detected.");
  if (!page.hasViewportMeta) findings.push("Viewport meta tag was not detected.");
  if (page.imagesMissingAltCount > 0) {
    findings.push(
      `${page.imagesMissingAltCount} of ${page.imageCount} images are missing alt text.`,
    );
  }
  if (!page.actionSummary?.hasDetectedActionLinks) {
    findings.push("No action-oriented link or button was detected.");
  }
  if (page.wordCount < 120) {
    findings.push(`The extracted page contains ${page.wordCount} words.`);
  }
  if (page.indexable === false) findings.push("A noindex directive was detected.");
  findings.push(...page.warnings.slice(0, 5));
  return unique(findings);
}

function retainRepresentativeContent(value: string, limit: number) {
  if (value.length <= limit) return { text: value, truncated: false };

  const openingLength = Math.round(limit * 0.58);
  const middleLength = Math.round(limit * 0.24);
  const closingLength = Math.max(
    0,
    limit - openingLength - middleLength - 80,
  );
  const middleStart = Math.max(
    openingLength,
    Math.round(value.length / 2 - middleLength / 2),
  );
  const text = [
    value.slice(0, openingLength),
    "[Representative middle section]",
    value.slice(middleStart, middleStart + middleLength),
    "[Closing section]",
    value.slice(-closingLength),
  ].join("\n");

  return { text: text.slice(0, limit), truncated: true };
}

function enforcePayloadLimit(payload: PageAnalysisPayload) {
  const serializedLength = JSON.stringify(payload).length;
  if (serializedLength <= selectiveAiAuditLimits.maximumPagePayloadCharacters) {
    return payload;
  }

  const overflow =
    serializedLength - selectiveAiAuditLimits.maximumPagePayloadCharacters;
  const nextLength = Math.max(
    1_500,
    payload.primaryVisibleContent.length - overflow - 300,
  );

  return {
    ...payload,
    primaryVisibleContent: payload.primaryVisibleContent.slice(0, nextLength),
    contentTruncated: true,
    retainedCharacters: nextLength,
  };
}

function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

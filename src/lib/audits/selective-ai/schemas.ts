import { createHash } from "node:crypto";

import {
  pageAnalysisConfidenceValues,
  pageOpportunityCategoryValues,
  type AuditAiSynthesis,
  type PageAiAnalysis,
  type PageAiOpportunity,
  type PageAnalysisConfidence,
  type PageAnalysisPayload,
  type PageOpportunityCategory,
} from "@/lib/audits/selective-ai/types";
import { selectiveAiAuditLimits } from "@/lib/audits/selective-ai/config";

const confidenceSchema = {
  type: "string",
  enum: pageAnalysisConfidenceValues,
} as const;

export const pageAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "pageSummary",
    "pagePurpose",
    "strengths",
    "opportunities",
    "primaryCta",
    "limitations",
  ],
  properties: {
    pageSummary: { type: "string" },
    pagePurpose: { type: "string" },
    strengths: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "evidence", "confidence"],
        properties: {
          title: { type: "string" },
          evidence: { type: "string" },
          confidence: confidenceSchema,
        },
      },
    },
    opportunities: {
      type: "array",
      maxItems: selectiveAiAuditLimits.maximumPageOpportunities,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "title",
          "description",
          "evidence",
          "businessImpact",
          "recommendation",
          "priority",
          "confidence",
        ],
        properties: {
          category: {
            type: "string",
            enum: pageOpportunityCategoryValues,
          },
          title: { type: "string" },
          description: { type: "string" },
          evidence: { type: "string" },
          businessImpact: { type: "string" },
          recommendation: { type: "string" },
          priority: {
            type: "string",
            enum: ["HIGH", "MEDIUM", "LOW"],
          },
          confidence: confidenceSchema,
        },
      },
    },
    primaryCta: {
      type: "object",
      additionalProperties: false,
      required: ["found", "text", "assessment"],
      properties: {
        found: { type: "boolean" },
        text: { type: ["string", "null"] },
        assessment: { type: "string" },
      },
    },
    limitations: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
    },
  },
} as const;

export const auditSynthesisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "executiveSummary",
    "strengths",
    "highestPriorityProblems",
    "quickWins",
    "largerStrategicImprovements",
    "recommendedOrder",
    "sourceLimitations",
  ],
  properties: {
    executiveSummary: { type: "string" },
    strengths: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "evidenceReferences", "confidence"],
        properties: {
          title: { type: "string" },
          evidenceReferences: {
            type: "array",
            maxItems: 4,
            items: { type: "string" },
          },
          confidence: confidenceSchema,
        },
      },
    },
    highestPriorityProblems: {
      type: "array",
      maxItems: 6,
      items: synthesisOpportunityReferenceSchema(),
    },
    quickWins: {
      type: "array",
      maxItems: 5,
      items: synthesisSimpleReferenceSchema(),
    },
    largerStrategicImprovements: {
      type: "array",
      maxItems: 5,
      items: synthesisSimpleReferenceSchema(),
    },
    recommendedOrder: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "step",
          "opportunityId",
          "rationale",
          "expectedImpact",
        ],
        properties: {
          step: { type: "integer" },
          opportunityId: { type: "string" },
          rationale: { type: "string" },
          expectedImpact: { type: "string" },
        },
      },
    },
    sourceLimitations: {
      type: "array",
      maxItems: 10,
      items: { type: "string" },
    },
  },
} as const;

export function parsePageAiAnalysis({
  value,
  payload,
}: {
  value: unknown;
  payload: PageAnalysisPayload;
}): PageAiAnalysis | null {
  const parsed = parseObject(value);
  if (!parsed) return null;

  const pageSummary = boundedText(parsed.pageSummary, 700);
  const pagePurpose = boundedText(parsed.pagePurpose, 320);
  const primaryCtaRecord = recordValue(parsed.primaryCta);
  const assessment = boundedText(primaryCtaRecord?.assessment, 420);
  if (!pageSummary || !pagePurpose || !primaryCtaRecord || !assessment) {
    return null;
  }

  const strengths = arrayRecords(parsed.strengths)
    .map((item) => {
      const title = boundedText(item.title, 160);
      const evidence = boundedText(item.evidence, 420);
      const confidence = confidenceValue(item.confidence);
      if (
        !title ||
        !evidence ||
        !confidence ||
        !evidenceIsGrounded(evidence, payload)
      ) {
        return null;
      }
      return { title, evidence, confidence };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 5);
  const opportunities = arrayRecords(parsed.opportunities)
    .map((item) => normalizeOpportunity(item, payload))
    .filter((item): item is PageAiOpportunity => Boolean(item))
    .slice(0, selectiveAiAuditLimits.maximumPageOpportunities);
  const requestedCtaText = nullableText(primaryCtaRecord.text, 180);
  const primaryCtaText =
    requestedCtaText && evidenceIsGrounded(requestedCtaText, payload)
      ? requestedCtaText
      : null;
  const found = primaryCtaRecord.found === true && Boolean(primaryCtaText);
  const limitations = stringArray(parsed.limitations, 8, 420);

  if (payload.contentTruncated) {
    limitations.push(
      "The extracted page content was truncated before AI review; omitted sections were not assessed.",
    );
  }

  return {
    pageSummary,
    pagePurpose,
    strengths,
    opportunities: dedupeOpportunities(opportunities),
    primaryCta: {
      found,
      text: primaryCtaText,
      assessment,
    },
    limitations: unique(limitations).slice(0, 8),
  };
}

export function parseAuditAiSynthesis({
  value,
  opportunityIds,
  selectedPageUrls,
}: {
  value: unknown;
  opportunityIds: string[];
  selectedPageUrls: string[];
}): AuditAiSynthesis | null {
  const parsed = parseObject(value);
  if (!parsed) return null;

  const executiveSummary = boundedText(parsed.executiveSummary, 1_200);
  if (!executiveSummary || hasUnsupportedAbsolute(executiveSummary)) return null;

  const allowedIds = new Set(opportunityIds);
  const allowedUrls = new Set(selectedPageUrls);
  const strengths = arrayRecords(parsed.strengths)
    .map((item) => {
      const title = boundedText(item.title, 180);
      const confidence = confidenceValue(item.confidence);
      const evidenceReferences = stringArray(
        item.evidenceReferences,
        4,
        500,
      ).filter(
        (reference) =>
          allowedUrls.has(reference) ||
          opportunityIds.some((id) => reference.includes(id)),
      );
      if (!title || !confidence || evidenceReferences.length === 0) return null;
      return { title, evidenceReferences, confidence };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 5);
  const highestPriorityProblems = arrayRecords(parsed.highestPriorityProblems)
    .map((item) => {
      const opportunityId = boundedText(item.opportunityId, 100);
      const rationale = boundedText(item.rationale, 500);
      const expectedImpact = boundedText(item.expectedImpact, 400);
      const confidence = confidenceValue(item.confidence);
      if (
        !opportunityId ||
        !allowedIds.has(opportunityId) ||
        !rationale ||
        !expectedImpact ||
        !confidence ||
        hasUnsupportedAbsolute(`${rationale} ${expectedImpact}`)
      ) {
        return null;
      }
      return { opportunityId, rationale, expectedImpact, confidence };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 6);
  const quickWins = parseSimpleReferences(
    parsed.quickWins,
    allowedIds,
  ).slice(0, 5);
  const largerStrategicImprovements = parseSimpleReferences(
    parsed.largerStrategicImprovements,
    allowedIds,
  ).slice(0, 5);
  const recommendedOrder = arrayRecords(parsed.recommendedOrder)
    .map((item) => {
      const opportunityId = boundedText(item.opportunityId, 100);
      const rationale = boundedText(item.rationale, 500);
      const expectedImpact = boundedText(item.expectedImpact, 400);
      const step =
        typeof item.step === "number" && Number.isInteger(item.step)
          ? item.step
          : null;
      if (
        step === null ||
        !opportunityId ||
        !allowedIds.has(opportunityId) ||
        !rationale ||
        !expectedImpact ||
        hasUnsupportedAbsolute(`${rationale} ${expectedImpact}`)
      ) {
        return null;
      }
      return { step, opportunityId, rationale, expectedImpact };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => left.step - right.step)
    .slice(0, 8)
    .map((item, index) => ({ ...item, step: index + 1 }));

  return {
    executiveSummary,
    strengths,
    highestPriorityProblems,
    quickWins,
    largerStrategicImprovements,
    recommendedOrder,
    sourceLimitations: stringArray(parsed.sourceLimitations, 10, 500),
  };
}

function synthesisOpportunityReferenceSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "opportunityId",
      "rationale",
      "expectedImpact",
      "confidence",
    ],
    properties: {
      opportunityId: { type: "string" },
      rationale: { type: "string" },
      expectedImpact: { type: "string" },
      confidence: confidenceSchema,
    },
  } as const;
}

function synthesisSimpleReferenceSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["opportunityId", "rationale"],
    properties: {
      opportunityId: { type: "string" },
      rationale: { type: "string" },
    },
  } as const;
}

function normalizeOpportunity(
  value: Record<string, unknown>,
  payload: PageAnalysisPayload,
): PageAiOpportunity | null {
  const category = opportunityCategory(value.category);
  const title = boundedText(value.title, 180);
  const description = boundedText(value.description, 650);
  const evidence = boundedText(value.evidence, 420);
  const businessImpact = boundedText(value.businessImpact, 520);
  const recommendation = boundedText(value.recommendation, 650);
  const priority = priorityValue(value.priority);
  const confidence = confidenceValue(value.confidence);

  if (
    !category ||
    !title ||
    !description ||
    !evidence ||
    !businessImpact ||
    !recommendation ||
    !priority ||
    !confidence
  ) {
    return null;
  }
  if (
    evidence.length < 8 ||
    !evidenceIsGrounded(evidence, payload) ||
    isVagueOpportunity({ title, description, recommendation }) ||
    hasUnsupportedAbsolute(`${description} ${businessImpact} ${recommendation}`) ||
    duplicatesDeterministicIssue(`${title} ${description}`, payload) ||
    conflictsWithDeterministicEvidence(`${title} ${description} ${evidence}`, payload)
  ) {
    return null;
  }

  return {
    id: stableOpportunityId({
      url: payload.normalizedUrl,
      category,
      title,
      evidence,
    }),
    category,
    title,
    description,
    evidence,
    businessImpact,
    recommendation,
    priority,
    confidence,
  };
}

function evidenceIsGrounded(evidence: string, payload: PageAnalysisPayload) {
  const normalizedEvidence = normalize(evidence);
  const evidenceSources = [
    payload.title,
    payload.metaDescription,
    ...payload.h1Text,
    ...payload.h2Text,
    ...payload.h3Text,
    ...payload.prominentCtas,
    ...payload.navigationLabels,
    ...payload.formLabels,
    ...payload.trustSignals,
    ...payload.contactSignals,
    ...payload.visibleImageAltText,
    ...payload.structuredDataTypes,
    ...payload.deterministicFindings,
    payload.primaryVisibleContent,
  ]
    .filter((item): item is string => Boolean(item))
    .map(normalize);
  const completeEvidence = evidenceSources.join(" ");

  if (
    normalizedEvidence.length >= 4 &&
    completeEvidence.includes(normalizedEvidence)
  ) {
    return true;
  }

  const words = normalizedEvidence
    .split(" ")
    .filter((word) => word.length >= 4)
    .slice(0, 20);
  if (
    words.length >= 3 &&
    words.filter((word) => completeEvidence.includes(word)).length /
      words.length >=
      0.6
  ) {
    return true;
  }

  if (/\b(no|not|missing|absent|could not detect|was not detected)\b/.test(normalizedEvidence)) {
    if (
      /\b(cta|call to action|action link|button)\b/.test(normalizedEvidence) &&
      payload.prominentCtas.length === 0
    ) {
      return true;
    }
    if (
      /\b(trust|testimonial|review|credential|guarantee)\b/.test(normalizedEvidence) &&
      payload.trustSignals.length === 0
    ) {
      return true;
    }
    if (
      /\b(form|contact)\b/.test(normalizedEvidence) &&
      payload.formLabels.length === 0 &&
      payload.contactSignals.length === 0
    ) {
      return true;
    }
  }

  return false;
}

function duplicatesDeterministicIssue(
  text: string,
  payload: PageAnalysisPayload,
) {
  const normalized = normalize(text);
  const objectivePatterns = [
    /\bmissing (?:page )?title\b/,
    /\btitle (?:tag|element)? is missing\b/,
    /\bmissing meta description\b/,
    /\bmeta description is missing\b/,
    /\bno h1\b/,
    /\bmultiple h1\b/,
    /\bmissing canonical\b/,
    /\bmissing viewport\b/,
    /\bimages? (?:are )?missing alt\b/,
    /\bnoindex\b/,
    /\bhttp status\b/,
  ];
  return (
    objectivePatterns.some((pattern) => pattern.test(normalized)) &&
    payload.deterministicFindings.length > 0
  );
}

function conflictsWithDeterministicEvidence(
  text: string,
  payload: PageAnalysisPayload,
) {
  const normalized = normalize(text);
  if (/\b(?:missing|no) (?:page )?title\b/.test(normalized) && payload.title) {
    return true;
  }
  if (
    /\b(?:missing|no) meta description\b/.test(normalized) &&
    payload.metaDescription
  ) {
    return true;
  }
  if (/\bno h1\b/.test(normalized) && payload.h1Text.length > 0) return true;
  if (
    /\bno (?:cta|call to action|action link)\b/.test(normalized) &&
    payload.prominentCtas.length > 0
  ) {
    return true;
  }
  return false;
}

function isVagueOpportunity({
  title,
  description,
  recommendation,
}: {
  title: string;
  description: string;
  recommendation: string;
}) {
  const combined = normalize(`${title} ${description} ${recommendation}`);
  return (
    description.length < 24 ||
    recommendation.length < 18 ||
    /^(?:improve|optimize|enhance) (?:the )?(?:page|content|website)[.!]?$/i.test(
      recommendation,
    ) ||
    /\bfollow best practices\b/.test(combined)
  );
}

function hasUnsupportedAbsolute(value: string) {
  return /\b(?:guarantee(?:d)?|will (?:increase|boost|double|generate)|google penalty|legally noncompliant|conversion rate (?:will|would)|revenue (?:will|would))\b/i.test(
    value,
  );
}

function parseSimpleReferences(value: unknown, allowedIds: Set<string>) {
  return arrayRecords(value)
    .map((item) => {
      const opportunityId = boundedText(item.opportunityId, 100);
      const rationale = boundedText(item.rationale, 500);
      if (
        !opportunityId ||
        !allowedIds.has(opportunityId) ||
        !rationale ||
        hasUnsupportedAbsolute(rationale)
      ) {
        return null;
      }
      return { opportunityId, rationale };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function dedupeOpportunities(items: PageAiOpportunity[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.category}:${normalize(item.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseObject(value: unknown) {
  if (typeof value === "string") {
    try {
      return recordValue(JSON.parse(stripCodeFence(value)));
    } catch {
      return null;
    }
  }
  return recordValue(value);
}

function stripCodeFence(value: string) {
  return value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
}

function arrayRecords(value: unknown) {
  return Array.isArray(value)
    ? value.map(recordValue).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedText(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, " ").trim().slice(0, maximum)
    : null;
}

function nullableText(value: unknown, maximum: number) {
  return value === null ? null : boundedText(value, maximum);
}

function stringArray(value: unknown, maximumItems: number, maximumLength: number) {
  return Array.isArray(value)
    ? value
        .map((item) => boundedText(item, maximumLength))
        .filter((item): item is string => Boolean(item))
        .slice(0, maximumItems)
    : [];
}

function confidenceValue(value: unknown): PageAnalysisConfidence | null {
  return pageAnalysisConfidenceValues.includes(
    value as PageAnalysisConfidence,
  )
    ? (value as PageAnalysisConfidence)
    : null;
}

function opportunityCategory(value: unknown): PageOpportunityCategory | null {
  return pageOpportunityCategoryValues.includes(
    value as PageOpportunityCategory,
  )
    ? (value as PageOpportunityCategory)
    : null;
}

function priorityValue(value: unknown) {
  return value === "HIGH" || value === "MEDIUM" || value === "LOW"
    ? value
    : null;
}

function stableOpportunityId(input: {
  url: string;
  category: string;
  title: string;
  evidence: string;
}) {
  return `aiopp_${createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 20)}`;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

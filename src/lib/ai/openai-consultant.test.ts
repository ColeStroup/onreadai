import assert from "node:assert/strict";
import test from "node:test";

import {
  BusinessProfileStatus,
  ChatRole,
  ProfilePlatform,
} from "@prisma/client";

import type { BuildConsultantContextInput } from "@/lib/ai/consultant-context";
import { ConsultantPipelineError } from "@/lib/ai/consultant-errors";
import type { CompetitorConsultantContext } from "@/lib/ai/competitor-consultant-context";
import { generateConsultantResponseResult } from "@/lib/ai/openai-consultant";
import { generateCompetitorFallbackResponse } from "@/lib/chat/competitor-consultant-response";

const actionPrompt =
  "What should I do differently to compete with my saved competitor?";
const socialActionPrompt =
  "Based on my saved audit and competitor data, what are three social-media actions I should prioritize to compete more effectively? Clearly separate evidence from general recommendations.";

function competitorContext(): CompetitorConsultantContext {
  const socialRow = {
    competitorId: "competitor-one",
    competitorName: "Saved Competitor",
    category: "social" as const,
    businessScore: null,
    competitorScore: null,
    businessDisplay: "1 confirmed; 0 pending",
    competitorDisplay: "2 confirmed; 0 pending",
    status: "competitor_stronger" as const,
    observation:
      "Saved Competitor has broader confirmed public profile coverage (2 vs. 1).",
    evidence: [],
  };
  const socialOpportunity = {
    id: "competitor-one:social",
    competitorId: "competitor-one",
    competitorName: "Saved Competitor",
    category: "social" as const,
    title: "Review audience-fit platform coverage",
    description:
      "Confirm whether the additional platform fits the target audience before investing in it.",
    confidence: "high" as const,
    evidence: [],
  };

  return {
    businessId: "business-one",
    businessName: "Example Business",
    configuredCompetitors: 1,
    analyzedCompetitors: 1,
    unscannedCompetitors: [],
    staleCompetitors: [],
    partialCompetitors: [],
    failedCompetitors: [],
    latestSnapshots: [
      {
        competitorId: "competitor-one",
        competitorName: "Saved Competitor",
        websiteUrl: "https://competitor.example/",
        latestSnapshotId: "snapshot-one",
        usableSnapshotId: "snapshot-one",
        latestSnapshotStatus: "completed",
        freshnessState: "current",
        scannedAt: "2026-07-18T12:00:00.000Z",
        pagesScanned: 1,
        completedSections: ["social"],
        failedSections: [],
        sections: {
          website: "unavailable",
          seo: "unavailable",
          social: "complete",
          reviews: "unavailable",
          positioning: "unavailable",
        },
        website: null,
        seo: null,
        social: {
          confirmedProfiles: [
            { platform: "Instagram", url: null },
            { platform: "Facebook", url: null },
          ],
          pendingProfiles: [],
          detectedProfiles: [],
          confirmedPlatforms: ["Instagram", "Facebook"],
          pendingPlatforms: [],
          detectedPlatforms: [],
          limitations: [
            "Individual posts and engagement metrics were not analyzed.",
          ],
        },
        reviews: {
          listingConfirmationStatus: "not_confirmed",
          analysisStatus: "not_found",
          rating: null,
          reviewCount: null,
          listingName: null,
          mapsUrl: null,
          comparableMetricsAvailable: false,
          note: "Comparable public review metrics are unavailable.",
        },
        positioning: null,
        evidence: [],
        limitations: [],
      },
    ],
    currentComparison: {
      analyzedCompetitorCount: 1,
      staleCompetitorCount: 0,
      failedCompetitorCount: 0,
      savedButUnanalyzedCount: 0,
      categoryComparisons: [socialRow],
      businessAdvantages: [],
      competitorAdvantages: [socialOpportunity],
      parityAreas: [],
      opportunities: [socialOpportunity],
      risks: [],
      evidence: [],
      freshness: [
        {
          competitorId: "competitor-one",
          competitorName: "Saved Competitor",
          snapshotId: "snapshot-one",
          status: "current",
          scannedAt: "2026-07-18T12:00:00.000Z",
        },
      ],
      limitations: [],
      generatedAt: "2026-07-18T12:01:00.000Z",
    },
    comparisonSource: "live_rebuilt",
    primaryBusinessEvidence: {
      latestAuditAt: "2026-07-18T11:00:00.000Z",
      contextUpdatedAt: "2026-07-18T10:00:00.000Z",
      businessContext: {
        description: "A local service business.",
        targetAudience: "Local customers.",
        mainOffer: "A booked service.",
        businessType: "Local service",
        primaryConversionGoal: "Book an appointment",
      },
      goals: [],
      primaryGoal: null,
      confirmedProfiles: ["Instagram"],
      pendingProfiles: [],
      social: {
        confirmedProfileCount: 1,
        pendingProfileCount: 0,
        confirmedPlatforms: ["Instagram"],
        pendingPlatforms: [],
      },
      reviews: {
        googleBusinessStatus: "not_confirmed",
        rating: null,
        reviewCount: null,
        mapsUrl: null,
      },
      website: null,
      seo: null,
    },
    freshness: {
      builtAt: "2026-07-18T12:02:00.000Z",
      primaryAuditAt: "2026-07-18T11:00:00.000Z",
      newestCompetitorSnapshotAt: "2026-07-18T12:00:00.000Z",
      competitorDataNewerThanAudit: ["Saved Competitor"],
    },
    limitations: [
      "No private social analytics or post performance data is available.",
    ],
  };
}

function consultantInput(
  question: string,
  context = competitorContext(),
): BuildConsultantContextInput {
  return {
    question,
    business: {
      name: "Example Business",
      initialInput: "Example Business",
      goals: [],
      primaryGoal: null,
    },
    latestAudit: {
      overallScore: 60,
      summary: "A saved deterministic audit.",
      createdAt: new Date("2026-07-18T11:00:00.000Z"),
      analysisSnapshot: {},
    },
    scores: [],
    findings: [],
    recommendations: [],
    profiles: [
      {
        platform: ProfilePlatform.INSTAGRAM,
        status: BusinessProfileStatus.CONFIRMED,
        url: "https://instagram.com/example",
        handle: null,
      },
    ],
    competitors: [
      {
        name: "Saved Competitor",
        websiteUrl: "https://competitor.example/",
        notes: null,
        discoveredProfiles: [
          {
            platform: ProfilePlatform.INSTAGRAM,
            label: "Instagram",
            status: BusinessProfileStatus.CONFIRMED,
          },
        ],
      },
    ],
    recentChatHistory: [
      {
        role: ChatRole.USER,
        content: "Help me understand my competitors.",
      },
    ],
    competitorContext: context,
  };
}

function baseline(question: string, context = competitorContext()) {
  const response = generateCompetitorFallbackResponse({
    question,
    businessName: context.businessName,
    context,
  });
  assert.ok(response);
  return response;
}

const contextBuilder = async () => "{\"compact\":true}";

test("a valid provider competitor response is accepted", async () => {
  let providerCalls = 0;
  const result = await generateConsultantResponseResult(
    consultantInput(actionPrompt),
    {
      contextBuilder,
      provider: async () => {
        providerCalls += 1;
        return { output_text: baseline(actionPrompt) };
      },
    },
  );

  assert.equal(providerCalls, 1);
  assert.equal(result.source, "openai");
  assert.equal(result.providerCalled, true);
  assert.equal(result.providerResponded, true);
  assert.equal(result.evidenceValidated, true);
});

test("both reported competitor prompts recover with an evidence-validated fallback", async () => {
  for (const question of [actionPrompt, socialActionPrompt]) {
    const result = await generateConsultantResponseResult(
      consultantInput(question),
      {
        contextBuilder,
        provider: async () => ({
          output_text:
            "Saved Competitor has stronger engagement and better-performing posts.",
        }),
      },
    );

    assert.equal(result.source, "competitor_evidence_fallback");
    assert.equal(result.fallbackReason, "EVIDENCE_VALIDATION_FAILED");
    assert.match(result.content, /Saved evidence/);
    assert.match(result.content, /Recommended actions/);
    assert.doesNotMatch(
      result.content,
      /stronger engagement|better-performing posts/i,
    );
  }
});

test("a malformed or empty provider response uses the validated competitor fallback", async () => {
  for (const providerResponse of [{ unexpected: true }, { output_text: "  " }]) {
    const result = await generateConsultantResponseResult(
      consultantInput(actionPrompt),
      {
        contextBuilder,
        provider: async () => providerResponse,
      },
    );

    assert.equal(result.source, "competitor_evidence_fallback");
    assert.equal(result.fallbackReason, "PROVIDER_RESPONSE_INVALID");
    assert.equal(result.providerResponded, true);
  }
});

test("a transient provider failure is identified and does not erase usable competitor guidance", async () => {
  const providerError = Object.assign(new Error("connection reset"), {
    status: 503,
  });
  const result = await generateConsultantResponseResult(
    consultantInput(actionPrompt),
    {
      contextBuilder,
      provider: async () => {
        throw providerError;
      },
    },
  );

  assert.equal(result.source, "competitor_evidence_fallback");
  assert.equal(result.fallbackReason, "PROVIDER_TRANSIENT");
  assert.equal(result.providerCalled, true);
  assert.equal(result.providerResponded, false);
});

test("a genuine context failure has its own failure category and never calls the provider", async () => {
  let providerCalls = 0;

  await assert.rejects(
    generateConsultantResponseResult(consultantInput(actionPrompt), {
      contextBuilder: async () => {
        throw new Error("invalid saved context");
      },
      provider: async () => {
        providerCalls += 1;
        return { output_text: "unused" };
      },
    }),
    (error: unknown) =>
      error instanceof ConsultantPipelineError &&
      error.code === "CONTEXT_FAILURE" &&
      error.stage === "PROMPT_BUILD",
  );
  assert.equal(providerCalls, 0);
});

test("no saved competitors produces labeled general guidance instead of fabricated evidence", async () => {
  const context = competitorContext();
  context.configuredCompetitors = 0;
  context.analyzedCompetitors = 0;
  context.latestSnapshots = [];
  context.currentComparison = null;
  const result = await generateConsultantResponseResult(
    consultantInput(actionPrompt, context),
    {
      contextBuilder,
      provider: async () => ({ output_text: null }),
    },
  );

  assert.equal(result.source, "competitor_evidence_fallback");
  assert.match(
    result.content,
    /general and is not presented as saved competitor evidence/i,
  );
  assert.match(result.content, /add the competitor/i);
});

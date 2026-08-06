import assert from "node:assert/strict";
import test from "node:test";

import {
  websiteCrawlForAuditSnapshot,
} from "@/lib/analyzers/website-crawler";
import {
  evaluationCrawl,
} from "@/lib/audits/selective-ai/__fixtures__/evaluation-pages";
import { consolidateAiAuditInsights } from "@/lib/audits/selective-ai/consolidation";
import {
  readAiReviewedOpportunityEvidence,
  readSelectiveAiAuditSnapshot,
} from "@/lib/audits/selective-ai/types";
import { isAiAssistedAuditsEnabled } from "@/lib/features/feature-flags";

test("selective audit assistance is server-controlled and defaults off", () => {
  assert.equal(isAiAssistedAuditsEnabled({}), false);
  assert.equal(
    isAiAssistedAuditsEnabled({ AI_ASSISTED_AUDITS_ENABLED: "false" }),
    false,
  );
  assert.equal(
    isAiAssistedAuditsEnabled({ AI_ASSISTED_AUDITS_ENABLED: "true" }),
    true,
  );
});

test("saved crawl snapshots omit temporary cleaned page bodies", () => {
  const crawl = evaluationCrawl(3);
  const snapshot = websiteCrawlForAuditSnapshot(crawl);

  assert.ok(crawl.pageResults.every((page) => page.analysisContent));
  assert.ok(
    snapshot.pageResults.every(
      (page) => !Object.hasOwn(page, "analysisContent"),
    ),
  );
  assert.equal(snapshot.pageResults[0]?.contentHash, crawl.pageResults[0]?.contentHash);
});

test("historical reports safely reject malformed selective analysis snapshots", () => {
  assert.equal(readSelectiveAiAuditSnapshot(null), null);
  assert.equal(
    readSelectiveAiAuditSnapshot({
      aiAssistedAnalysis: {
        version: "selective-ai-audit-v1",
        enabled: true,
        status: "COMPLETED",
      },
    }),
    null,
  );

  const parsed = readSelectiveAiAuditSnapshot({
    aiAssistedAnalysis: {
      version: "selective-ai-audit-v1",
      enabled: true,
      status: "COMPLETED",
      generatedAt: "2026-07-29T12:00:00.000Z",
      selectorVersion: "selector-v1",
      pageAnalysisPromptVersion: "prompt-v1",
      pageAnalysisSchemaVersion: "schema-v1",
      synthesisPromptVersion: "synthesis-prompt-v1",
      synthesisSchemaVersion: "synthesis-schema-v1",
      modelRoutingVersion: "routing-v1",
      coverage: {
        pagesCheckedTechnically: 75,
        eligiblePages: 70,
        selectedPages: 24,
        deepReviewedPages: 23,
        deterministicOnlyPages: 45,
        excludedUtilityPages: 5,
        duplicateRepresentatives: 20,
        crawlFailedPages: 0,
        failedAiPages: 1,
        truncatedPages: 2,
        cacheHits: 20,
        cacheMisses: 4,
        cacheHitRate: 83,
        limitations: ["One selected page was unavailable."],
      },
      pages: [],
      selectedPageAnalyses: [],
      synthesis: null,
      synthesisSource: "NOT_RUN",
    },
  });

  assert.equal(parsed?.coverage.pagesCheckedTechnically, 75);
  assert.equal(parsed?.coverage.deepReviewedPages, 23);
});

test("AI-reviewed opportunity evidence retains provenance and confidence", () => {
  const parsed = readAiReviewedOpportunityEvidence({
    findingType: "AI_REVIEWED_OPPORTUNITY",
    confidence: "MEDIUM",
    evidence: [
      {
        sourceUrl: "https://example.test/services",
        excerpt: "Get started today",
      },
    ],
    businessImpact: "A specific action may reduce uncertainty.",
    suggestedAction: "Name the exact next step.",
  });

  assert.deepEqual(parsed, {
    confidence: "MEDIUM",
    sourceUrl: "https://example.test/services",
    excerpt: "Get started today",
    businessImpact: "A specific action may reduce uncertainty.",
    suggestedAction: "Name the exact next step.",
  });
});

test("consolidated AI findings keep a stable analytical key outside the database ID", () => {
  const result = consolidateAiAuditInsights({
    selectedPageAnalyses: [
      {
        url: "https://example.test/services",
        canonicalUrl: null,
        pageType: "service",
        analysisCacheId: "cache-1",
        cacheHit: false,
        contentTruncated: false,
        analysis: {
          pageSummary: "A service page.",
          pagePurpose: "Explain the service.",
          strengths: [],
          opportunities: [
            {
              id: "opportunity-1",
              category: "CONVERSION",
              title: "Clarify the next step",
              description: "The page leaves the next customer action unclear.",
              evidence: "The service description has no adjacent action.",
              businessImpact: "A clearer path can reduce uncertainty.",
              recommendation: "Add a specific contact action.",
              priority: "HIGH",
              confidence: "HIGH",
            },
          ],
          primaryCta: {
            found: false,
            text: null,
            assessment: "No clear action was found.",
          },
          limitations: [],
        },
      },
    ],
    deterministicFindings: [],
    synthesis: null,
  });
  const finding = result.findings[0];

  assert.ok(finding);
  assert.equal(finding.evidence.stableFindingKey, finding.id);
  assert.equal(
    finding.evidence.issueKey,
    "selective-ai:website:conversion-action",
  );
  assert.deepEqual(finding.evidence.affectedUrls, [
    "https://example.test/services",
  ]);
  assert.equal(result.recommendations[0]?.sourceReferenceId, finding.id);
});

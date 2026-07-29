import assert from "node:assert/strict";
import test from "node:test";

import {
  websiteCrawlForAuditSnapshot,
} from "@/lib/analyzers/website-crawler";
import {
  evaluationCrawl,
} from "@/lib/audits/selective-ai/__fixtures__/evaluation-pages";
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

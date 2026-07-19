import assert from "node:assert/strict";
import test from "node:test";

import {
  asCompetitorPositioningSnapshot,
  asCompetitorSocialSnapshot,
  asCompetitorWebsiteSnapshot,
  asSeoAnalysis,
} from "@/lib/competitors/competitor-types";

test("malformed saved social profile entries are omitted without losing valid evidence", () => {
  const parsed = asCompetitorSocialSnapshot({
    score: 55,
    coverageLevel: "moderate",
    profiles: [
      null,
      {
        platform: "Instagram",
        url: "https://instagram.com/example",
        status: "confirmed",
        source: "saved_profile",
      },
      { platform: null, status: "pending" },
    ],
    confirmedPlatforms: ["Instagram"],
    pendingPlatforms: null,
    detectedPlatforms: [],
    observations: null,
    limitations: null,
  });

  assert.ok(parsed);
  assert.equal(parsed.profiles.length, 1);
  assert.deepEqual(parsed.confirmedPlatforms, ["Instagram"]);
  assert.deepEqual(parsed.pendingPlatforms, []);
  assert.match(parsed.limitations.join(" "), /stored shape was invalid/i);
});

test("partially null positioning fields become limited optional evidence instead of throwing", () => {
  const parsed = asCompetitorPositioningSnapshot({
    score: 62,
    confidence: null,
    evidence: [],
    secondaryCTAs: null,
    keyDifferentiators: null,
    limitations: null,
    primaryCTA: null,
    primaryConversionGoal: null,
    detectedActionTypes: null,
  });

  assert.ok(parsed);
  assert.equal(parsed.primaryCtaClarity, "UNCERTAIN");
  assert.deepEqual(parsed.secondaryCTAs, []);
  assert.deepEqual(parsed.keyDifferentiators, []);
  assert.ok(Number.isFinite(parsed.confidence));
  assert.match(parsed.limitations.join(" "), /legacy snapshot/i);
});

test("missing optional SEO fields normalize to unknown or empty values", () => {
  const parsed = asSeoAnalysis({
    score: 48,
    titleStatus: null,
    recommendedFixes: null,
  });

  assert.ok(parsed);
  assert.equal(parsed.titleStatus, "unknown");
  assert.equal(parsed.robotsTxtStatus, "unknown");
  assert.deepEqual(parsed.recommendedFixes, []);
});

test("a malformed critical website snapshot is treated as unavailable", () => {
  assert.equal(
    asCompetitorWebsiteSnapshot({
      homepage: {
        score: 70,
        normalizedUrl: "https://example.test/",
        h1Count: 1,
        h1Text: null,
      },
    }),
    null,
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createReportFixture } from "@/lib/reports/report-fixtures.test-support";
import { buildPresentationViewModel } from "@/lib/reports/presentation-view-model";

test("presentation copy stays concise, client-facing, and evidence-based", () => {
  const deck = buildPresentationViewModel(createReportFixture("hospitality"));
  const clientCopy = clientFacingCopy(deck);

  assert.equal(deck.socialStrategy.sourceLabel, "Evidence-based strategy");
  assert.doesNotMatch(clientCopy, /deterministic fallback/i);
  assert.doesNotMatch(
    clientCopy,
    /other saved audit scores update|refreshed separately|database freshness/i,
  );
  assert.ok(deck.summary.working.length <= 3);
  assert.ok(deck.summary.attention.length <= 4);
  assert.ok(deck.summary.startHere.length <= 3);
  assert.ok(
    [...deck.summary.working, ...deck.summary.attention, ...deck.summary.startHere].every(
      (item) => item.length <= 180,
    ),
  );
  assert.ok(deck.socialStrategy.contentIdeas.every((item) => item.callToAction.startsWith("CTA: ")));
  assert.doesNotMatch(clientCopy, /build relevant trust and attention/i);
  assert.ok(deck.actionPlan.every((week) => week.bullets.length <= 3));
  assert.ok(deck.actionPlan.every((week) => week.bullets.every((item) => !item.includes(" | "))));
  assert.doesNotMatch(clientCopy, /\.{3}|\u2026/);
});

test("SEO warning states never use positive semantics", () => {
  const deck = buildPresentationViewModel(createReportFixture("hospitality"));
  const warnings = deck.seo.checks.filter((item) =>
    /missing|needs improvement|blocked/i.test(item.value),
  );

  assert.ok(warnings.length > 0);
  assert.ok(warnings.every((item) => item.tone === "warning" || item.tone === "critical"));
  assert.ok(
    deck.seo.checks
      .filter((item) => item.tone === "positive")
      .every((item) => /good|found/i.test(item.value)),
  );
});

test("social profile labels keep confirmed channels explicit", () => {
  const deck = buildPresentationViewModel(createReportFixture("hospitality"));

  assert.equal(typeof deck.social.confirmedCount, "number");
  assert.ok(deck.social.confirmedPlatforms.length > 0);
  assert.doesNotMatch(
    `${deck.social.confirmedCount} confirmed social profiles`,
    /\d+\s*\/\s*\d+/,
  );
});

test("competitor presentation preserves comparability and public-evidence limits", () => {
  const deck = buildPresentationViewModel(createReportFixture("hospitality"));
  const reviews = deck.competitor.rows.find((item) => item.area === "Reviews");
  const social = deck.competitor.rows.find((item) => item.area === "Social");

  assert.equal(reviews?.result, "Not comparable");
  assert.match(social?.businessValue ?? "", /confirmed/i);
  assert.doesNotMatch(deck.competitor.limitationsNote, /engagement rate|performance score/i);
  assert.match(deck.competitor.limitationsNote, /No private analytics, engagement, or post performance/i);
});

test("consultant prompts demonstrate implementation and adapt to social-only audits", () => {
  const websiteDeck = buildPresentationViewModel(createReportFixture("hospitality"));
  const socialDeck = buildPresentationViewModel(createReportFixture("social_only"));
  const websitePrompts = websiteDeck.consultant.prompts.join(" ");
  const socialPrompts = socialDeck.consultant.prompts.join(" ");

  assert.match(websitePrompts, /draft|create|implementation/i);
  assert.doesNotMatch(websitePrompts, /who is my target audience|do i need a google business/i);
  assert.doesNotMatch(socialPrompts, /homepage H1|homepage meta description/i);
  assert.match(socialPrompts, /profile highlight|social content plan|implementation/i);
});

test("presentation shell uses a fixed dynamic viewport and restores document overflow", async () => {
  const [deckSource, primitivesSource, css] = await Promise.all([
    readFile(
      "src/app/dashboard/businesses/[businessId]/audit/[auditId]/present/presentation-deck.tsx",
      "utf8",
    ),
    readFile(
      "src/app/dashboard/businesses/[businessId]/audit/[auditId]/present/presentation-primitives.tsx",
      "utf8",
    ),
    readFile(
      "src/app/dashboard/businesses/[businessId]/audit/[auditId]/present/presentation-deck.module.css",
      "utf8",
    ),
  ]);

  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /overflow:\s*hidden/);
  assert.doesNotMatch(deckSource, /overflow-y-auto/);
  assert.match(deckSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(deckSource, /document\.body\.style\.overflow = bodyOverflow/);
  assert.match(deckSource, /PageDown/);
  assert.match(deckSource, /Shift|shiftKey/);
  assert.match(deckSource, /requestFullscreen/);
  assert.match(deckSource, /onTouchStart/);
  assert.match(primitivesSource, /ResizeObserver/);
  assert.match(primitivesSource, /data-slide-overflow/);
});

function clientFacingCopy(value: unknown) {
  const copy = structuredClone(value) as Record<string, unknown>;
  delete copy.businessId;
  delete copy.auditId;
  return JSON.stringify(copy);
}

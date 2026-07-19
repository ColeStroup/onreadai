import assert from "node:assert/strict";
import test from "node:test";

import type { CompetitorConsultantContext } from "@/lib/ai/competitor-consultant-context";
import type {
  CategoryComparison,
  ComparisonCategory,
  ComparisonEvidence,
  ComparisonStatement,
} from "@/lib/competitors/competitor-types";
// @ts-expect-error Node's strip-types test runner requires the source extension.
import { generateCompetitorFallbackResponse, getCompetitorConsultantIntent, validateCompetitorConsultantResponse } from "./competitor-consultant-response.ts";

const competitorName = "Pineapple Willy\u2019s";

function evidence(
  label: string,
  businessValue: string,
  competitorValue: string,
): ComparisonEvidence {
  return { label, businessValue, competitorValue, sourceUrls: [] };
}

function statement(
  category: ComparisonCategory,
  description: string,
): ComparisonStatement {
  return {
    id: `competitor:${category}`,
    competitorId: "competitor",
    competitorName,
    category,
    title: description,
    description,
    confidence: "high",
    evidence: [],
  };
}

function comparisonRows(): CategoryComparison[] {
  return [
    {
      competitorId: "competitor",
      competitorName,
      category: "website",
      businessScore: 81,
      competitorScore: 96,
      businessDisplay: "81/100",
      competitorDisplay: "96/100",
      status: "competitor_stronger",
      observation: `${competitorName} communicates its apparent offer more clearly in the homepage headline.`,
      evidence: [
        evidence("Homepage headline", "0 H1 detected", "Making Waves"),
        evidence(
          "Detected primary actions",
          "Hours, Menu, Order / Takeout, Events, Gift Cards, Contact",
          "Menu, Events, Contact, Gift Cards",
        ),
        evidence("Important page coverage", "8 page types", "7 page types"),
      ],
    },
    {
      competitorId: "competitor",
      competitorName,
      category: "seo",
      businessScore: 66,
      competitorScore: 100,
      businessDisplay: "66/100",
      competitorDisplay: "100/100",
      status: "competitor_stronger",
      observation: `${competitorName} is stronger on comparable public SEO basics.`,
      evidence: [
        evidence(
          "Homepage SEO checks",
          "title good, description too_long, H1 missing, canonical missing, robots found, sitemap found",
          "title good, description good, H1 good, canonical good, robots found, sitemap found",
        ),
      ],
    },
    {
      competitorId: "competitor",
      competitorName,
      category: "reviews",
      businessScore: 73,
      competitorScore: null,
      businessDisplay: "4.6 stars, 9,225 reviews",
      competitorDisplay: "Data unavailable",
      status: "not_comparable",
      observation: `Schooners has confirmed Google review data. Comparable rating and review-count data for ${competitorName} is unavailable, so review strength cannot currently be compared.`,
      evidence: [],
    },
    {
      competitorId: "competitor",
      competitorName,
      category: "social",
      businessScore: null,
      competitorScore: null,
      businessDisplay: "2 confirmed; 0 pending",
      competitorDisplay: "2 confirmed; 9 pending",
      status: "similar",
      observation: `Schooners and ${competitorName} each have 2 confirmed social profiles. ${competitorName} also has 9 additional public links pending confirmation.`,
      evidence: [],
    },
    {
      competitorId: "competitor",
      competitorName,
      category: "positioning",
      businessScore: 66,
      competitorScore: 88,
      businessDisplay: "Moderately clear observable offer",
      competitorDisplay: "Clear observable offer and conversion path",
      status: "competitor_stronger",
      observation: `${competitorName} is stronger on the comparable observable offer clarity signals in the latest snapshots.`,
      evidence: [
        evidence(
          "Observable offer and conversion path",
          "Food and beverage / Contact",
          "Beachfront restaurant / Menu",
        ),
      ],
    },
  ];
}

function baseContext(): CompetitorConsultantContext {
  const rows = comparisonRows();
  return {
    businessId: "business",
    businessName: "Schooners",
    configuredCompetitors: 1,
    analyzedCompetitors: 1,
    unscannedCompetitors: [],
    staleCompetitors: [],
    partialCompetitors: [],
    failedCompetitors: [],
    latestSnapshots: [
      {
        competitorId: "competitor",
        competitorName,
        websiteUrl: "https://pwillys.com/",
        latestSnapshotId: "snapshot",
        usableSnapshotId: "snapshot",
        latestSnapshotStatus: "completed",
        freshnessState: "current",
        scannedAt: "2026-07-14T08:27:53.409Z",
        pagesScanned: 25,
        completedSections: ["website", "seo", "social", "positioning"],
        failedSections: [],
        sections: {
          website: "complete",
          seo: "complete",
          social: "needs_confirmation",
          reviews: "unavailable",
          positioning: "inferred",
        },
        website: {
          score: 96,
          pageTitle: competitorName,
          headline: "Making Waves",
          primaryActions: ["Menu", "Events", "Contact", "Gift Cards"],
          importantPages: ["Menu", "Contact"],
          pagesScanned: 25,
          sourceUrl: "https://pwillys.com/",
        },
        seo: {
          score: 100,
          titleStatus: "good",
          metaDescriptionStatus: "good",
          h1Status: "good",
          canonicalStatus: "good",
          robotsTxtStatus: "found",
          sitemapStatus: "found",
          sitewideIssueCount: 0,
        },
        social: {
          confirmedProfiles: [
            { platform: "Instagram", url: null },
            { platform: "Facebook", url: null },
          ],
          pendingProfiles: Array.from({ length: 9 }, (_, index) => ({
            platform: ["YouTube", "TikTok", "X"][index % 3],
            url: null,
          })),
          detectedProfiles: [],
          confirmedPlatforms: ["Instagram", "Facebook"],
          pendingPlatforms: ["YouTube", "TikTok", "X"],
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
        positioning: {
          apparentBusinessDescription: "Beachfront restaurant",
          apparentTargetAudience: "Visitors",
          mainOffer: "Food and events",
          primaryConversionGoal: "View menu",
          primaryCTA: "Menu",
          secondaryCTAs: ["Events"],
          differentiators: ["Beachfront"],
          confidence: "moderate",
          note: "Inferred from public website evidence.",
        },
        evidence: [],
        limitations: [],
      },
    ],
    currentComparison: {
      analyzedCompetitorCount: 1,
      staleCompetitorCount: 0,
      failedCompetitorCount: 0,
      savedButUnanalyzedCount: 0,
      categoryComparisons: rows,
      businessAdvantages: [],
      competitorAdvantages: [
        statement("website", rows[0].observation),
        statement("seo", rows[1].observation),
        statement("positioning", rows[4].observation),
      ],
      parityAreas: [statement("social", rows[3].observation)],
      opportunities: [
        statement("website", "Clarify the primary website conversion path."),
        statement("seo", "Close the highest-confidence SEO structure gap."),
        statement(
          "positioning",
          "Make the offer and next step easier to understand.",
        ),
      ],
      risks: [],
      evidence: [],
      freshness: [
        {
          competitorId: "competitor",
          competitorName,
          snapshotId: "snapshot",
          status: "current",
          scannedAt: "2026-07-14T08:27:53.409Z",
        },
      ],
      limitations: [],
      generatedAt: "2026-07-14T08:30:00.000Z",
    },
    comparisonSource: "live_rebuilt",
    primaryBusinessEvidence: {
      latestAuditAt: "2026-07-14T08:16:43.383Z",
      contextUpdatedAt: "2026-07-14T08:00:00.000Z",
      businessContext: {
        description: "Panama City Beach restaurant and beach club.",
        targetAudience: "Local residents and visitors.",
        mainOffer: "Food, drinks, takeout, and events.",
        businessType: "Restaurant",
        primaryConversionGoal:
          "Drive visits, takeout orders, and event engagement.",
      },
      goals: [],
      primaryGoal: null,
      confirmedProfiles: [
        "Website",
        "Google Business",
        "Instagram",
        "Facebook",
      ],
      pendingProfiles: [],
      social: {
        confirmedProfileCount: 2,
        pendingProfileCount: 0,
        confirmedPlatforms: ["Instagram", "Facebook"],
        pendingPlatforms: [],
      },
      reviews: {
        googleBusinessStatus: "confirmed",
        rating: 4.6,
        reviewCount: 9225,
        mapsUrl: null,
      },
      website: {
        score: 81,
        pageTitle: "Schooners",
        headline: null,
        h1Count: 0,
        primaryActions: [
          "Hours",
          "Menu",
          "Order / Takeout",
          "Events",
          "Gift Cards",
          "Contact",
        ],
        secondaryNavigation: [],
        eventLinks: ["Celebrate Sunset"],
        pagesScanned: 34,
      },
      seo: {
        score: 66,
        titleStatus: "good",
        metaDescriptionStatus: "too_long",
        h1Status: "missing",
        canonicalStatus: "missing",
        robotsTxtStatus: "found",
        sitemapStatus: "found",
        recommendedFixes: [
          "Write a meta description between 70 and 170 characters.",
          "Use exactly one descriptive H1 on the homepage.",
          "Add a canonical link tag.",
        ],
      },
    },
    freshness: {
      builtAt: "2026-07-14T08:31:00.000Z",
      primaryAuditAt: "2026-07-14T08:16:43.383Z",
      newestCompetitorSnapshotAt: "2026-07-14T08:27:53.409Z",
      competitorDataNewerThanAudit: [competitorName],
    },
    limitations: [],
  };
}

function responseFor(question: string, context = baseContext()) {
  const response = generateCompetitorFallbackResponse({
    question,
    businessName: context.businessName,
    context,
  });
  assert.ok(response);
  assert.deepEqual(
    validateCompetitorConsultantResponse({ question, response, context }),
    [],
  );
  return response;
}

test("general comparison leads with the result and uses all comparable evidence", () => {
  const response = responseFor(`How do I compare against ${competitorName}?`);
  assert.match(
    response,
    new RegExp(`^Based on the latest comparable public data, ${competitorName}`),
  );
  assert.match(response, /Website:[\s\S]*96\/100[\s\S]*81\/100/);
  assert.match(response, /SEO:[\s\S]*100\/100[\s\S]*66\/100/);
  assert.match(response, /Reviews are not currently comparable/);
  assert.match(response, /both businesses have Instagram and Facebook confirmed/);
  assert.match(response, /appears to communicate[\s\S]*inferred finding/);
  assert.match(response, /No clear advantage for Schooners/);
  assert.equal((response.match(/^\d+\. /gm) ?? []).length, 3);
  assert.doesNotMatch(response, /use the Competitor Intelligence feature/i);
  const words = response.split(/\s+/).length;
  assert.ok(words >= 200 && words <= 350, `Unexpected word count: ${words}`);
});

test("business advantage question does not invent a lead", () => {
  const response = responseFor("What is Schooners doing better?");
  assert.match(response, /^No clear Schooners advantage was confirmed/);
  assert.match(response, /strong standalone trust asset/);
  assert.match(response, /reviews cannot yet be compared/i);
  assert.doesNotMatch(response, /Schooners (?:leads|wins|is stronger)/i);
});

test("competitor advantage question returns only supported leads", () => {
  const response = responseFor(`What is ${competitorName} doing better?`);
  assert.equal(
    getCompetitorConsultantIntent(
      `What is ${competitorName} doing better?`,
      baseContext(),
    ),
    "competitor_advantages",
  );
  assert.match(response, /^Based on the latest comparable public data/);
  assert.match(response, /Website:[\s\S]*96\/100[\s\S]*81\/100/);
  assert.match(response, /SEO:[\s\S]*100\/100[\s\S]*66\/100/);
  assert.match(response, /observable offer clarity/);
  assert.doesNotMatch(response, /use the .*feature/i);
});

test("SEO comparison is short, scored, and actionable", () => {
  const response = responseFor("Who has better SEO?");
  assert.match(response, new RegExp(`^${competitorName} currently has`));
  assert.match(response, /100\/100 compared with Schooners' 66\/100/);
  assert.match(response, /missing H1/);
  assert.match(response, /overlong meta description/);
  assert.match(response, /missing canonical tag/);
  assert.ok(response.split(/\s+/).length < 200);
});

test("website comparison includes scores, H1, CTA, and crawl evidence", () => {
  const response = responseFor("Who has the better website?");
  assert.match(response, new RegExp(`^${competitorName} currently has`));
  assert.match(response, /96\/100 compared with Schooners' 81\/100/);
  assert.match(response, /no H1 was detected for Schooners/);
  assert.match(response, /Detected primary actions/);
  assert.match(response, /Crawl coverage differed/);
});

test("review comparison explicitly refuses a one-sided winner", () => {
  const response = responseFor("Who has stronger reviews?");
  assert.match(response, /^Reviews are not currently comparable/);
  assert.match(response, /4\.6 rating and 9,225 reviews/);
  assert.match(response, new RegExp(`${competitorName} is unavailable`));
  assert.match(response, /No review winner/);
});

test("social comparison separates confirmation from performance", () => {
  const response = responseFor("Who has the stronger social presence?");
  assert.match(response, /^Confirmed social coverage is currently similar/);
  assert.match(response, /both businesses have Instagram and Facebook confirmed/);
  assert.match(response, /9 additional profiles awaiting confirmation/);
  assert.match(response, /Individual posts, engagement, reach[\s\S]*were not analyzed/);
  assert.doesNotMatch(response, /stronger engagement|wider social reach/i);
});

test("feature-help question gives concise product instructions", () => {
  const response = responseFor("How do I use the competitor feature?");
  assert.equal(
    getCompetitorConsultantIntent(
      "How do I use the competitor feature?",
      baseContext(),
    ),
    "feature_help",
  );
  assert.match(response, /Competitors/);
  assert.match(response, /Analyze/);
  assert.match(response, /Refresh/);
  assert.doesNotMatch(response, /96\/100|100\/100/);
});

test("unscanned, partial, unavailable, and freshness edge states remain honest", () => {
  const unscanned = baseContext();
  unscanned.analyzedCompetitors = 0;
  unscanned.currentComparison = null;
  unscanned.latestSnapshots[0].latestSnapshotId = null;
  unscanned.latestSnapshots[0].usableSnapshotId = null;
  unscanned.latestSnapshots[0].latestSnapshotStatus = "not_analyzed";
  unscanned.latestSnapshots[0].freshnessState = "not_analyzed";
  assert.match(
    responseFor(`How do I compare against ${competitorName}?`, unscanned),
    /^There is not enough comparable data yet/,
  );

  const partial = baseContext();
  partial.latestSnapshots[0].latestSnapshotStatus = "partial";
  partial.latestSnapshots[0].freshnessState = "partial";
  partial.freshness.competitorDataNewerThanAudit = [];
  assert.match(
    responseFor(`How do I compare against ${competitorName}?`, partial),
    /snapshot is partial/,
  );

  const unavailable = baseContext();
  unavailable.currentComparison!.categoryComparisons = unavailable.currentComparison!.categoryComparisons.map(
    (row) => ({
      ...row,
      businessScore: null,
      competitorScore: null,
      businessDisplay: "Data unavailable",
      competitorDisplay: "Data unavailable",
      status: "data_unavailable",
    }),
  );
  unavailable.currentComparison!.businessAdvantages = [];
  unavailable.currentComparison!.competitorAdvantages = [];
  assert.match(
    responseFor(`How do I compare against ${competitorName}?`, unavailable),
    /^There is not enough comparable data yet/,
  );

  const sameDate = baseContext();
  sameDate.freshness.competitorDataNewerThanAudit = [];
  sameDate.freshness.primaryAuditAt = sameDate.latestSnapshots[0].scannedAt;
  assert.doesNotMatch(
    responseFor(`How do I compare against ${competitorName}?`, sameDate),
    /Data freshness/,
  );
});

test("a real business lead is preserved with both scores", () => {
  const context = baseContext();
  const website = context.currentComparison!.categoryComparisons.find(
    (row) => row.category === "website",
  )!;
  website.status = "business_stronger";
  website.businessScore = 96;
  website.competitorScore = 81;
  context.currentComparison!.businessAdvantages = [
    statement("website", "Schooners has the stronger website structure."),
  ];
  context.currentComparison!.competitorAdvantages =
    context.currentComparison!.competitorAdvantages.filter(
      (item) => item.category !== "website",
    );
  const response = responseFor("What is Schooners doing better?", context);
  assert.match(response, /^Based on the latest comparable public data/);
  assert.match(response, /Schooners scores 96\/100/);
  assert.match(response, new RegExp(`${competitorName} 81/100`));
});

test("validator rejects verbose or unsupported OpenAI comparison patterns", () => {
  const context = baseContext();
  const invalid = `Use the Competitor Intelligence feature to view the saved comparison. Add more competitors and inspect the competitor website manually. Schooners leads in reviews and has stronger social engagement. ${competitorName} has objectively stronger positioning. Just ask.`;
  const issues = validateCompetitorConsultantResponse({
    question: `How do I compare against ${competitorName}?`,
    response: invalid,
    context,
  });
  assert.ok(issues.some((issue) => issue.includes("starts with feature guidance")));
  assert.ok(issues.some((issue) => issue.includes("feature filler")));
  assert.ok(issues.some((issue) => issue.includes("adding more competitors")));
  assert.ok(issues.some((issue) => issue.includes("manual inspection")));
  assert.ok(issues.some((issue) => issue.includes("review data")));
  assert.ok(issues.some((issue) => issue.includes("social-performance")));
  assert.ok(issues.some((issue) => issue.includes("objective fact")));
  assert.ok(issues.some((issue) => issue.includes("scores")));
  assert.ok(issues.some((issue) => issue.includes("conversational filler")));

  const pendingReachIssues = validateCompetitorConsultantResponse({
    question: `What is ${competitorName} doing better?`,
    response: `${competitorName} leads in website structure and SEO. Website scores are ${competitorName} 96/100 and Schooners 81/100. SEO scores are ${competitorName} 100/100 and Schooners 66/100. Based on the homepage copy, its observable offer clarity appears stronger. Additional pending profiles may indicate future broader reach.`,
    context,
  });
  assert.ok(
    pendingReachIssues.some((issue) => issue.includes("social-performance")),
  );
});

test("action-oriented competitor prompts use the action contract and remain evidence-safe", () => {
  const prompts = [
    "What should I do differently to compete with my saved competitor?",
    "Based on my saved audit and competitor data, what are three social-media actions I should prioritize to compete more effectively? Clearly separate evidence from general recommendations.",
  ];

  for (const prompt of prompts) {
    assert.equal(
      getCompetitorConsultantIntent(prompt, baseContext()),
      "competitive_actions",
    );
    const response = responseFor(prompt);
    assert.match(response, /### Saved evidence/);
    assert.match(response, /### Recommended actions/);
    assert.ok((response.match(/^\d+\. /gm) ?? []).length <= 3);
  }

  const socialResponse = responseFor(prompts[1]);
  assert.match(
    socialResponse,
    /Individual posts, engagement, reach, audience size, posting frequency, and content performance were not analyzed/,
  );
  assert.doesNotMatch(
    socialResponse,
    /stronger engagement|better-performing content|more consistent posting/i,
  );

  const profilePositioning = `${socialResponse}\n\nImprove profile positioning by making the audience, offer, and next action consistent.`;
  assert.deepEqual(
    validateCompetitorConsultantResponse({
      question: prompts[1],
      response: profilePositioning,
      context: baseContext(),
    }),
    [],
  );

  const unsupportedComparativePositioning = validateCompetitorConsultantResponse({
    question: prompts[1],
    response: `${competitorName} has stronger positioning. Individual posts, engagement, reach, audience size, posting frequency, and content performance were not analyzed.`,
    context: baseContext(),
  });
  assert.ok(
    unsupportedComparativePositioning.some((issue) =>
      issue.includes("positioning as inferred"),
    ),
  );
});

test("complete, incomplete, failed, archived, multiple, and missing-website states return honest guidance", () => {
  const prompt = "What should I do differently to compete with my saved competitor?";

  assert.match(responseFor(prompt), new RegExp(competitorName));

  const noProfiles = structuredClone(baseContext());
  noProfiles.latestSnapshots[0].social.confirmedProfiles = [];
  noProfiles.latestSnapshots[0].social.pendingProfiles = [];
  noProfiles.latestSnapshots[0].social.confirmedPlatforms = [];
  noProfiles.latestSnapshots[0].social.pendingPlatforms = [];
  assert.match(responseFor(prompt, noProfiles), /Saved evidence/);

  const pending = structuredClone(baseContext());
  pending.latestSnapshots[0].social.confirmedProfiles = [];
  pending.latestSnapshots[0].social.confirmedPlatforms = [];
  pending.latestSnapshots[0].social.pendingProfiles = [
    { platform: "Instagram", url: null },
  ];
  pending.latestSnapshots[0].social.pendingPlatforms = ["Instagram"];
  assert.match(responseFor(prompt, pending), /pending|confirmation/i);

  const failed = structuredClone(baseContext());
  failed.analyzedCompetitors = 0;
  failed.currentComparison = null;
  failed.latestSnapshots[0].usableSnapshotId = null;
  failed.latestSnapshots[0].latestSnapshotStatus = "failed";
  failed.latestSnapshots[0].freshnessState = "failed";
  assert.match(responseFor(prompt, failed), /limited-evidence|failed/i);

  const noActiveCompetitors = structuredClone(baseContext());
  noActiveCompetitors.configuredCompetitors = 0;
  noActiveCompetitors.analyzedCompetitors = 0;
  noActiveCompetitors.latestSnapshots = [];
  noActiveCompetitors.currentComparison = null;
  assert.match(
    responseFor(prompt, noActiveCompetitors),
    /general and is not presented as saved competitor evidence/i,
  );

  const multiple = structuredClone(baseContext());
  const second = structuredClone(multiple.latestSnapshots[0]);
  second.competitorId = "competitor-two";
  second.competitorName = "Second Competitor";
  second.websiteUrl = null;
  multiple.latestSnapshots.push(second);
  multiple.configuredCompetitors = 2;
  multiple.analyzedCompetitors = 2;
  assert.match(responseFor(prompt, multiple), /Saved evidence/);

  const missingWebsite = structuredClone(baseContext());
  missingWebsite.latestSnapshots[0].websiteUrl = null;
  missingWebsite.latestSnapshots[0].website = null;
  missingWebsite.latestSnapshots[0].sections.website = "unavailable";
  assert.match(responseFor(prompt, missingWebsite), /Saved evidence/);
});

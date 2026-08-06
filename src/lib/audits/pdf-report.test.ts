import assert from "node:assert/strict";
import test from "node:test";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { generateGrowthAuditPdf } from "@/lib/audits/pdf-report";
import {
  createReportFixture,
  type ReportFixtureKind,
} from "@/lib/reports/report-fixtures.test-support";
import { createJustPieCanonicalReportFixture } from "@/lib/reports/just-pie-report-fixture.test-support";
import { buildPresentationViewModel } from "@/lib/reports/presentation-view-model";

const requiredSections = [
  "Website & SEO Growth Report",
  "Executive Summary",
  "Business Context",
  "Your Next 3 Moves",
  "Overall Health",
  "Website and Conversion",
  "SEO",
  "Recommended Action Plan",
  "Progress Since Previous Audit",
  "Report Confidence and Data Notes",
  "Technical Appendix",
];

const standardFixtures: ReportFixtureKind[] = [
  "hospitality",
  "saas",
  "ecommerce",
  "local_service",
  "social_only",
  "cottage_regression",
  "no_competitor",
  "stale_strategy",
];

test("fixture PDFs parse cleanly and keep every text item inside safe bounds", async () => {
  const documents = await Promise.all(
    standardFixtures.map(async (kind) => ({
      kind,
      pdf: await inspectFixture(kind),
    })),
  );

  for (const { kind, pdf } of documents) {
    assert(pdf.pages.length > 1, `${kind} should include report content pages`);
    assert(pdf.pages.length < 30, `${kind} should remain a concise report`);
    assert.doesNotMatch(pdf.text, /[\ufffc�]/u);
    assert.doesNotMatch(
      pdf.text,
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u,
    );

    for (const page of pdf.pages) {
      assert(page.items.length > 0, `${kind} page ${page.number} is blank`);
      if (page.number > 1) {
        assert(
          page.characters >= 220,
          `${kind} page ${page.number} is unusually sparse (${page.characters} characters)`,
        );
      }
      const continuationHeaders = page.items.filter((item) =>
        / - continued$/i.test(item.text),
      );
      assert(
        continuationHeaders.length <= 1,
        `${kind} page ${page.number} repeats a continuation header`,
      );
      const reportItems = page.items.filter(
        (item) => !/ \| \d+ of \d+$/.test(item.text),
      );
      for (const subheading of [
        "A. Highest-priority business actions",
        "B. Supporting technical fixes",
        "Key SEO warnings",
        "Recommended fixes",
        "Three content pillars",
        "Next three content ideas",
        "Current audit findings",
      ]) {
        const index = reportItems.findIndex((item) => item.text === subheading);
        assert(
          index === -1 || index < reportItems.length - 1,
          `${kind} page ${page.number} ends with orphan heading: ${subheading}`,
        );
      }

      for (const item of page.items) {
        assert(
          item.x >= 53,
          `${kind} page ${page.number} text crossed the left margin: ${item.text}`,
        );
        assert(
          item.right <= 559,
          `${kind} page ${page.number} text crossed the right margin: ${item.text}`,
        );
        assert(
          item.y >= 25,
          `${kind} page ${page.number} text fell below the footer boundary: ${item.text}`,
        );
        assert(
          item.top <= 750,
          `${kind} page ${page.number} text crossed the top boundary: ${item.text}`,
        );
      }
    }
  }
});

test("focused hospitality PDF contains supported sections without disabled modules", async () => {
  const pdf = await inspectFixture("hospitality");
  for (const heading of requiredSections) {
    assert.match(pdf.text, new RegExp(escapeRegex(heading), "i"));
  }
  assert.doesNotMatch(
    pdf.text,
    /Discord|gaming audiences?|developer community|free trial|software demo|SaaS/i,
  );
  assert.doesNotMatch(pdf.text, /Future analysis can compare|content cadence/i);
  assert.match(pdf.text, /Website Growth Score/i);
  assert.doesNotMatch(
    pdf.text,
    /Reviews and Trust|Social Strategy|Competitor Intelligence/i,
  );
});

test("cottage regression PDF preserves page-specific website evidence", async () => {
  const pdf = await inspectFixture("cottage_regression");

  assert.match(pdf.text, /PIE POCKETS/i);
  assert.match(
    pdf.text,
    /menu page.*(?:missing|no).*main (?:heading|headline)/i,
  );
  assert.doesNotMatch(
    pdf.text,
    /listing presence|review count|Google Business/i,
  );
  assert.match(pdf.text, /preorder|pickup|delivery/i);
  assert.doesNotMatch(
    pdf.text,
    /\batmosphere\b|\bdine[- ]?in\b|\bdirections\b|\bguest experience\b/i,
  );
  assert.doesNotMatch(
    pdf.text,
    /homepage (?:is|has|was).{0,24}(?:missing|no).{0,16}(?:h1|main heading)|homepage (?:h1|main heading).{0,24}(?:missing|not present)/i,
  );
});

test("PDF keeps detected action links separate from primary CTA clarity", async () => {
  const report = createReportFixture("hospitality");
  assert(report.website);
  assert(report.websiteCrawl);

  const assessment = {
    clarity: "NEEDS_IMPROVEMENT" as const,
    primaryCtaText: null,
    primaryCtaType: null,
    evidence: [
      "Several customer actions were detected without one structurally dominant action.",
    ],
    confidence: "MEDIUM" as const,
    assessmentMethod: "STATIC_HTML_STRUCTURE" as const,
    assessed: true,
  };
  report.website.actionSummary.primaryCtaAssessment = assessment;
  report.websiteCrawl.pagesScanned = 34;
  report.websiteCrawl.successfulPages = 34;
  report.websiteCrawl.pagesWithDetectedActionLinks = 34;
  report.websiteCrawl.pagesWithAssessedPrimaryCta = 34;
  report.websiteCrawl.pagesWithClearPrimaryCta = 0;
  report.websiteCrawl.pagesWithCtaNeedsImprovement = 34;
  report.technicalAppendix.pagesWithDetectedActionLinks = 34;
  report.technicalAppendix.pagesWithAssessedPrimaryCta = 34;
  report.technicalAppendix.pagesWithStructurallyClearPrimaryCta = 0;
  report.technicalAppendix.homepagePrimaryCtaAssessment = assessment;
  report.technicalAppendix.pageSelection = {
    ...report.technicalAppendix.pageSelection,
    totalPages: 34,
    pagesShown: report.technicalAppendix.pageSelection.pages.length,
    complete: false,
    label: `Important-page sample - ${report.technicalAppendix.pageSelection.pages.length} of 34 scanned pages`,
  };

  const pdf = await inspectPdf(await generateGrowthAuditPdf(report));
  assert.match(pdf.text, /Pages with detected action links 34 of 34/i);
  assert.match(pdf.text, /Homepage primary CTA clarity Needs improvement/i);
  assert.match(
    pdf.text,
    /34 pages with detected action links \/ 34 pages with CTA clarity assessed \/ 0 structurally assessed as clear/i,
  );
  assert.match(pdf.text, /Important-page sample - 5 of 34 scanned pages/i);
  assert.doesNotMatch(
    pdf.text,
    /34(?: of 34)? pages? (?:with|have) (?:a )?clear primary CTA/i,
  );
  assert.doesNotMatch(pdf.text, /heading\.\s*:|alt text\.\s*:/i);
  assert.doesNotMatch(pdf.text, /\b(?:Order|Best)\.\.\./i);
});

test("cross-business PDFs preserve applicability and industry language", async () => {
  const [saas, localService, socialOnly, noCompetitor, staleStrategy] =
    await Promise.all([
      inspectFixture("saas"),
      inspectFixture("local_service"),
      inspectFixture("social_only"),
      inspectFixture("no_competitor"),
      inspectFixture("stale_strategy"),
    ]);

  assert.match(saas.text, /free trial|product demo/i);
  assert.doesNotMatch(
    saas.text,
    /menu specials|table reservations|happy hour/i,
  );
  assert.match(localService.text, /call|estimate|service area/i);
  assert.doesNotMatch(localService.text, /free trial|software demo/i);
  assert.match(socialOnly.text, /Website Not provided/i);
  assert.match(socialOnly.text, /SEO Not applicable|Status Not applicable/i);
  assert.match(socialOnly.text, /profile bio|link-in-bio|pinned posts/i);
  assert.doesNotMatch(socialOnly.text, /Website 0\/100|SEO 0\/100/i);
  assert.doesNotMatch(
    noCompetitor.text,
    /Competitive Position|Competitor Intelligence/i,
  );
  assert.doesNotMatch(
    staleStrategy.text,
    /Social Strategy|Deterministic fallback/i,
  );
  assert.doesNotMatch(
    staleStrategy.text,
    /add competitor data|Google Business.*still needs confirmation/i,
  );
});

test("stress PDF paginates long text, URLs, tables, and findings safely", async () => {
  const pdf = await inspectFixture("hospitality", true);

  assert(pdf.pages.length > 8);
  assert(pdf.pages.length < 40);
  assert.match(pdf.text, /Technical Appendix/i);
  assert.match(pdf.text, /Duplicate URL variants skipped/i);
  assert.match(pdf.text, /Current audit findings/i);
  for (const page of pdf.pages) {
    if (page.number > 1) {
      assert(
        page.characters >= 220,
        `stress page ${page.number} is unusually sparse`,
      );
    }
    for (const item of page.items) {
      assert(item.x >= 53, `stress text crossed left bound: ${item.text}`);
      assert(
        item.right <= 559,
        `stress text crossed right bound: ${item.text}`,
      );
      assert(item.y >= 25, `stress text crossed bottom bound: ${item.text}`);
      assert(item.top <= 750, `stress text crossed top bound: ${item.text}`);
    }
  }
});

test("PDF appendix carries the validated action and verification contract", async () => {
  const report = createReportFixture("hospitality");
  const finding = report.technicalAppendix.findings[0];
  assert(finding);
  finding.suggestedAction = "Add one clear order link near the main heading.";
  finding.ownerFixability = "May require website access";
  finding.whoCanHelp = "Website Developer";
  finding.howOnreadWillCheck =
    "Onread will open the saved action and check that its destination loads.";

  const pdf = await inspectPdf(await generateGrowthAuditPdf(report));
  assert.match(pdf.text, /What to do: Add one clear order link/i);
  assert.match(pdf.text, /Owner access: May require website access/i);
  assert.match(pdf.text, /Who can help: Website Developer/i);
  assert.match(pdf.text, /Verification: Onread will open the saved action/i);
});

test("PDF and Presentation consume the same canonical priority set", async () => {
  const report = createReportFixture("hospitality");
  const priority = report.recommendations.primary[0];
  assert(priority);
  priority.title = "Validated shared priority marker";
  const presentation = buildPresentationViewModel(report);
  const pdf = await inspectPdf(await generateGrowthAuditPdf(report));

  assert(
    presentation.topPriorities.some(
      (item) => item.title === "Validated shared priority marker",
    ),
  );
  assert.match(pdf.text, /Validated shared priority marker/i);
});

test("Just Pie PDF uses canonical counts, page bindings, classifications, and complete links", async () => {
  const report = createJustPieCanonicalReportFixture();
  const pdf = await inspectPdf(await generateGrowthAuditPdf(report));
  const links = pdf.pages.flatMap((page) => page.links);

  assert.match(pdf.text, /Pages missing meta descriptions 4/i);
  assert.match(pdf.text, /4 missing meta descriptions/i);
  assert.doesNotMatch(pdf.text, /5 (?:measured )?pages? (?:are )?missing (?:a )?meta description/i);
  assert.match(
    pdf.text,
    /Merchandise Shop \/merch-shop[\s\S]{0,90}8/i,
  );
  assert.match(
    pdf.text,
    /Order Inquiries \/order-inquiries[\s\S]{0,90}0/i,
  );
  assert.match(
    pdf.text,
    /AI-reviewed opportunity \| SEO - The homepage title could describe the offer more clearly/i,
  );
  assert.match(
    pdf.text,
    /AI-reviewed opportunity \| Website - The homepage order path could be easier to prioritize/i,
  );
  assert.doesNotMatch(pdf.text, /Report ID:/i);
  assert.doesNotMatch(pdf.text, /NEEDS IMPRO\s+VEMENT/i);
  assert.equal(links.length >= 6, true);
  assert(
    links.every(
      (url) =>
        /^https:\/\//.test(url) &&
        !/\s/.test(url) &&
        !url.endsWith("https://www."),
    ),
  );
});

type InspectedPdf = {
  text: string;
  pages: Array<{
    number: number;
    characters: number;
    items: Array<{
      text: string;
      x: number;
      y: number;
      right: number;
      top: number;
    }>;
    links: string[];
  }>;
};

const fixtureCache = new Map<string, Promise<InspectedPdf>>();

function inspectFixture(kind: ReportFixtureKind, stress = false) {
  const key = `${kind}:${stress}`;
  const cached = fixtureCache.get(key);
  if (cached) return cached;

  const inspection = (async () => {
    const report = createReportFixture(kind, { stress });
    const buffer = await generateGrowthAuditPdf(report);
    return inspectPdf(buffer);
  })();
  fixtureCache.set(key, inspection);
  return inspection;
}

async function inspectPdf(buffer: Buffer): Promise<InspectedPdf> {
  const document = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;
  const pages: InspectedPdf["pages"] = [];
  const textParts: string[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const annotations = await page.getAnnotations();
    const items = content.items.flatMap((item) => {
      if (!("str" in item) || !item.str.trim()) return [];
      const transform = item.transform;
      return [
        {
          text: item.str,
          x: transform[4],
          y: transform[5],
          right: transform[4] + item.width,
          top: transform[5] + item.height,
        },
      ];
    });
    const pageText = items.map((item) => item.text).join(" ");
    textParts.push(pageText);
    pages.push({
      number: pageNumber,
      characters: pageText.length,
      items,
      links: annotations.flatMap((annotation) =>
        typeof annotation.url === "string" ? [annotation.url] : [],
      ),
    });
  }

  return { text: textParts.join("\n"), pages };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

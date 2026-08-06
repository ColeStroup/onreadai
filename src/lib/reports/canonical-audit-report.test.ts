import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadEnvConfig } from "@next/env";
import {
  BusinessProfileStatus,
  ProfilePlatform,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";

import { buildPresentationViewModel } from "@/lib/reports/presentation-view-model";
import {
  buildCanonicalAuditReport,
  CANONICAL_AUDIT_REPORT_VERSION,
} from "@/lib/reports/canonical-audit-report";
import { scopeFindingEvidenceToAffectedPages } from "@/lib/reports/finding-evidence-scope";
import {
  createJustPieCanonicalReportFixture,
  createJustPieCanonicalSourceFixture,
} from "@/lib/reports/just-pie-report-fixture.test-support";
import {
  canonicalReportUrl,
  isAuditedWebsiteUrl,
  isCompleteHttpUrl,
  isReportHomepagePath,
  reportPageLabel,
} from "@/lib/reports/report-urls";
import {
  buildCanonicalEmailSummary,
  buildCanonicalImplementationScope,
} from "@/lib/reports/canonical-report-projections";

test("Just Pie canonical report binds exact facts, pages, classifications, and priorities", () => {
  const report = createJustPieCanonicalReportFixture();
  const canonical = report.canonicalReport;

  assert(canonical);
  assert.equal(canonical.reportVersion, CANONICAL_AUDIT_REPORT_VERSION);
  assert.equal(canonical.integrity.status, "READY");
  assert.deepEqual(canonical.integrity.issues, []);
  assert.equal(canonical.business.name, "Just Pie Orlando");
  assert.equal(canonical.facts.pagesScanned, 6);
  assert.equal(canonical.facts.pagesMissingMetaDescriptions.length, 4);
  assert.deepEqual(
    canonical.facts.pagesMissingMetaDescriptions
      .map((page) => page.label)
      .sort(),
    ["FAQ", "Homepage", "Menu", "Merchandise Shop"],
  );
  assert.deepEqual(
    canonical.facts.pagesWithNoH1.map((page) => page.label),
    ["Menu"],
  );
  assert.equal(canonical.facts.totalImagesMissingAlt, 8);

  const merchandise = canonical.pages.find(
    (page) => page.label === "Merchandise Shop",
  );
  const orderInquiries = canonical.pages.find(
    (page) => page.label === "Order Inquiries",
  );
  assert.equal(merchandise?.imagesMissingAltCount, 8);
  assert.equal(orderInquiries?.imagesMissingAltCount, 0);

  const altFinding = canonical.findings.find(
    (finding) => finding.rootCauseKey === "SITEWIDE_IMAGE_ALT_MISSING",
  );
  assert.deepEqual(
    altFinding?.affectedPages.map((page) => page.label),
    ["Merchandise Shop"],
  );
  assert(
    altFinding?.affectedPages.every((page) => page.evidenceIds.length > 0),
  );

  const titleFinding = canonical.findings.find(
    (finding) => finding.rootCauseKey === "HOMEPAGE_TITLE_QUALITY",
  );
  const ctaFinding = canonical.findings.find(
    (finding) =>
      finding.rootCauseKey === "HOMEPAGE_PRIMARY_CTA_CLARITY",
  );
  assert.equal(titleFinding?.classification, "AI_REVIEWED_OPPORTUNITY");
  assert.equal(ctaFinding?.classification, "AI_REVIEWED_OPPORTUNITY");

  const priorityRoots = canonical.priorities.map(
    (recommendation) => recommendation.rootCauseKey,
  );
  assert.equal(priorityRoots.length, 3);
  assert.equal(new Set(priorityRoots).size, priorityRoots.length);
  assert.equal(
    canonical.recommendations.filter((recommendation) =>
      /meta description/i.test(recommendation.title),
    ).length,
    1,
  );
  assert.doesNotMatch(
    JSON.stringify({
      summary: report.audit.executiveSummary,
      findings: report.findings,
      priorities: report.recommendations.primary,
      progress: report.progress,
    }),
    /deterministic analyzer|normalized facts|eligible canonical pages|audit-report-v\d|comparable with disclosed coverage differences/i,
  );
});

test("Just Pie page-purpose coverage recognizes equivalents and business applicability", () => {
  const report = createJustPieCanonicalReportFixture();
  const purposes = new Map(
    report.pagePurposes?.map((item) => [item.purpose, item]) ?? [],
  );

  assert.equal(purposes.get("Homepage")?.status, "DEDICATED_PAGE");
  assert.equal(
    purposes.get("Contact")?.status,
    "EQUIVALENT_CONVERSION_PATH",
  );
  assert.equal(purposes.get("About")?.status, "EQUIVALENT_SECTION");
  assert.equal(purposes.get("Store / Gift Cards")?.status, "DEDICATED_PAGE");
  assert.equal(purposes.get("Location")?.status, "NOT_EXPECTED");
  assert.equal(purposes.get("Map")?.status, "NOT_EXPECTED");
  assert.equal(purposes.get("Hours")?.status, "NOT_EXPECTED");
  assert.doesNotMatch(
    purposes.get("Contact")?.explanation ?? "",
    /not detected/i,
  );
});

test("canonical count and recommendation identities are shared with Presentation and Action Plan data", () => {
  const report = createJustPieCanonicalReportFixture();
  const presentation = buildPresentationViewModel(report);
  const metaCheck = presentation.seo.checks.find(
    (item) => item.label === "Meta description",
  );
  const canonicalMetaRecommendation = report.canonicalReport?.recommendations.find(
    (item) => item.rootCauseKey === "SITEWIDE_META_DESCRIPTION_MISSING",
  );
  const actionPlanMetaRecommendation = report.recommendations.all.find(
    (item) => item.rootCauseKey === "SITEWIDE_META_DESCRIPTION_MISSING",
  );

  assert.equal(report.canonicalFacts?.pagesMissingMetaDescriptions.length, 4);
  assert.match(metaCheck?.detail ?? "", /4 scanned pages missing one/i);
  assert.equal(
    actionPlanMetaRecommendation?.id,
    canonicalMetaRecommendation?.recommendationId,
  );
  assert.match(actionPlanMetaRecommendation?.evidenceSummary ?? "", /four/i);
  assert.deepEqual(
    presentation.topPriorities.map((item) => item.title),
    report.recommendations.primary.map((item) => item.title),
  );
});

test("email and specialist projections select only finalized canonical evidence", () => {
  const report = createJustPieCanonicalReportFixture();
  const canonical = report.canonicalReport;
  assert(canonical);
  const metaRecommendation = canonical.recommendations.find(
    (item) => item.rootCauseKey === "SITEWIDE_META_DESCRIPTION_MISSING",
  );
  assert(metaRecommendation);

  const email = buildCanonicalEmailSummary(canonical);
  const specialist = buildCanonicalImplementationScope(
    canonical,
    metaRecommendation.recommendationId,
  );

  assert.equal(email?.missingMetaDescriptions, 4);
  assert.deepEqual(
    email?.priorities.map((item) => item.rootCauseKey),
    canonical.priorities.map((item) => item.rootCauseKey),
  );
  assert.deepEqual(
    specialist?.findings.map((finding) => finding.findingId),
    metaRecommendation.sourceFindingIds,
  );
  assert(
    specialist?.findings.every((finding) =>
      finding.affectedPages.every((page) => page.evidenceIds.length > 0),
    ),
  );
});

test("public example reads canonical facts instead of maintaining report claims", async () => {
  const source = await readFile("src/app/example-report/page.tsx", "utf8");

  assert.match(source, /getPublicExampleAuditReport/);
  assert.match(source, /canonical\.facts\.pagesMissingMetaDescriptions\.length/);
  assert.doesNotMatch(source, /5 of 12|const priorities\s*=\s*\[/i);
});

test("AI Consultant receives the exact canonical counts, classifications, and page identities", async () => {
  loadEnvConfig(process.cwd());
  const report = createJustPieCanonicalReportFixture();
  const { buildConsultantContext } = await import(
    "@/lib/ai/consultant-context"
  );
  const context = JSON.parse(
    await buildConsultantContext({
      question: "What should I fix first?",
      business: {
        name: report.business.name,
        initialInput: report.business.initialInput,
        goals: report.business.selectedGoals,
        primaryGoal: report.business.primaryGoal,
        description: report.business.context.description,
        targetAudience: report.business.context.targetAudience,
        mainOffer: report.business.context.mainOffer,
        industry: report.business.context.industry,
        businessType: report.business.context.businessType,
        primaryConversionGoal:
          report.business.context.observedPrimaryConversionGoal,
      },
      latestAudit: {
        overallScore: report.audit.overallScore,
        summary: report.audit.executiveSummary,
        createdAt: report.audit.date,
        analysisSnapshot: {
          assessment: report.assessment,
          website: report.website,
          websiteCrawl: report.websiteCrawl,
          seo: report.seo,
          social: report.social,
          reviews: report.reviews,
          normalizedFacts: report.normalizedFacts,
          evidenceIntegrity: report.evidenceIntegrity,
          canonicalAuditReport: report.canonicalReport,
        },
      },
      scores: report.scores.flatMap((score) =>
        score.score === null
          ? []
          : [
              {
                category: score.category,
                platform: null,
                label: score.label,
                score: score.score,
              },
            ],
      ),
      findings: report.findings.all,
      recommendations: report.recommendations.all.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        priority: item.priority,
        status: item.status ?? RecommendationStatus.TODO,
        expectedImpact: item.expectedImpact,
        estimatedEffort: item.estimatedEffort,
        impact: item.expectedImpact,
        effort: item.estimatedEffort,
      })),
      profiles: [
        {
          platform: ProfilePlatform.WEBSITE,
          status: BusinessProfileStatus.CONFIRMED,
          url: report.website?.normalizedUrl ?? null,
          handle: null,
        },
      ],
      competitors: [],
      auditComparison: report.progress.comparison,
    }),
  );
  const merch = context.canonicalAuditEvidence.pages.find(
    (page: { label: string }) => page.label === "Merchandise Shop",
  );
  const order = context.canonicalAuditEvidence.pages.find(
    (page: { label: string }) => page.label === "Order Inquiries",
  );
  const title = context.canonicalAuditEvidence.findings.find(
    (finding: { rootCauseKey: string }) =>
      finding.rootCauseKey === "HOMEPAGE_TITLE_QUALITY",
  );
  const cta = context.canonicalAuditEvidence.findings.find(
    (finding: { rootCauseKey: string }) =>
      finding.rootCauseKey === "HOMEPAGE_PRIMARY_CTA_CLARITY",
  );

  assert.equal(
    context.canonicalAuditEvidence.facts.missingMetaDescriptions,
    4,
  );
  assert.equal(merch.imagesMissingAltCount, 8);
  assert.equal(order.imagesMissingAltCount, 0);
  assert.equal(title.classification, "AI_REVIEWED_OPPORTUNITY");
  assert.equal(cta.classification, "AI_REVIEWED_OPPORTUNITY");
  assert.deepEqual(
    context.canonicalAuditEvidence.priorities.map(
      (item: { rootCauseKey: string }) => item.rootCauseKey,
    ),
    report.canonicalReport?.priorities.map((item) => item.rootCauseKey),
  );
});

test("strict canonical construction fails safely when a saved count contradicts page records", () => {
  const source = createJustPieCanonicalSourceFixture();
  assert(source.websiteCrawl);
  source.websiteCrawl.pagesMissingMetaDescription = 5;

  const report = buildCanonicalAuditReport(source, {
    strict: true,
    reportVersion: CANONICAL_AUDIT_REPORT_VERSION,
  });

  assert.equal(report.integrity.status, "NEEDS_REVIEW");
  assert(
    report.integrity.issues.some((issue) => issue.code === "COUNT_MISMATCH"),
  );
  assert.equal(report.facts.pagesMissingMetaDescriptions.length, 4);
});

test("strict canonical construction suppresses misbound page evidence and its score impact", () => {
  const source = createJustPieCanonicalSourceFixture();
  const altFinding = source.findings.all.find(
    (finding) => finding.rootCauseKey === "SITEWIDE_IMAGE_ALT_MISSING",
  );
  assert(altFinding);
  altFinding.sourceUrl = "https://justpieorlando.example/order-inquiries";
  altFinding.affectedUrls = [
    "https://justpieorlando.example/order-inquiries",
  ];

  const report = buildCanonicalAuditReport(source, {
    strict: true,
    reportVersion: CANONICAL_AUDIT_REPORT_VERSION,
  });

  assert.equal(report.integrity.status, "NEEDS_REVIEW");
  assert(
    report.integrity.issues.some(
      (issue) =>
        issue.code === "EVIDENCE_PAGE_MISMATCH" &&
        issue.sourceId === altFinding.id,
    ),
  );
  assert.equal(
    report.appendix.scoreTrace.some(
      (item) => item.findingId === altFinding.id,
    ),
    false,
  );
  assert.equal(
    report.findings.some((finding) => finding.findingId === altFinding.id),
    false,
  );
});

test("strict canonical construction flags missing evidence and missing referenced findings", () => {
  const source = createJustPieCanonicalSourceFixture();
  const titleFinding = source.findings.all.find(
    (finding) => finding.rootCauseKey === "HOMEPAGE_TITLE_QUALITY",
  );
  const h1Recommendation = source.recommendations.all.find(
    (recommendation) => recommendation.rootCauseKey === "PAGE_H1_MISSING",
  );
  assert(titleFinding);
  assert(h1Recommendation);
  titleFinding.supportingEvidenceIds = [];
  h1Recommendation.sourceFindingId = "missing-finding";

  const report = buildCanonicalAuditReport(source, {
    strict: true,
    reportVersion: CANONICAL_AUDIT_REPORT_VERSION,
  });

  assert.equal(report.integrity.status, "NEEDS_REVIEW");
  assert(
    report.integrity.issues.some((issue) => issue.code === "MISSING_EVIDENCE"),
  );
  assert(
    report.integrity.issues.some(
      (issue) => issue.code === "MISSING_REFERENCED_FINDING",
    ),
  );
});

test("canonical report URL handling preserves valid complete page identity", () => {
  const parsed = canonicalReportUrl(
    "https://EXAMPLE.com:443/products/blue-shirt%20large?variant=1#reviews",
  );

  assert(parsed);
  assert.equal(parsed.hostname, "example.com");
  assert.equal(parsed.path, "/products/blue-shirt%20large?variant=1");
  assert.equal(parsed.url.includes("#reviews"), false);
  assert.equal(parsed.url.includes(" "), false);
  assert.equal(isCompleteHttpUrl(parsed.url), true);
  assert.equal(
    reportPageLabel({
      url: "https://example.com/order-inquiries?source=nav",
    }),
    "Order Inquiries",
  );
  assert.equal(isReportHomepagePath("/index.html"), true);
  assert.equal(
    isAuditedWebsiteUrl(
      "https://other-site.example/",
      "https://example.com/",
    ),
    false,
  );
});

test("inferred finding evidence stays scoped to the canonical affected page", () => {
  const source = createJustPieCanonicalSourceFixture();
  const metadataEvidence = source.evidenceIntegrity.evidence.filter(
    (item) => item.type === "META_DESCRIPTION_LENGTH",
  );

  const menuEvidence = scopeFindingEvidenceToAffectedPages(
    metadataEvidence,
    ["https://JUSTPIEORLANDO.example:443/menu/#details"],
  );
  assert.equal(menuEvidence.length, 1);
  assert.equal(menuEvidence[0].sourceUrl, "https://justpieorlando.example/menu");

  const unrelatedEvidence = scopeFindingEvidenceToAffectedPages(
    metadataEvidence,
    ["https://justpieorlando.example/order-inquiries"],
  );
  assert.deepEqual(unrelatedEvidence, []);
});

test("canonical score trace counts one deduction per root cause", () => {
  const report = createJustPieCanonicalReportFixture();
  const trace = report.canonicalReport?.appendix.scoreTrace ?? [];
  const keys = trace.map((item) => `${item.category}:${item.rootCauseKey}`);
  const websiteScore = report.scores.find(
    (item) => item.category === ScoreCategory.WEBSITE,
  );

  assert.equal(new Set(keys).size, keys.length);
  assert.equal(
    trace.filter(
      (item) => item.rootCauseKey === "SITEWIDE_META_DESCRIPTION_MISSING",
    ).length,
    1,
  );
  assert.equal(
    websiteScore?.score,
    100 -
      trace
        .filter((item) => item.category === ScoreCategory.WEBSITE)
        .reduce((total, item) => total + item.deduction, 0),
  );
});

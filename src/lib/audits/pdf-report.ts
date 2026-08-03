import "server-only";

import PDFDocument from "pdfkit";
import { RecommendationStatus, ScoreCategory } from "@prisma/client";

import { formatDelta } from "@/lib/audits/audit-comparison";
import { completeEvidenceSummary } from "@/lib/audits/finding-copy";
import { getPrimaryCtaAssessment } from "@/lib/analyzers/action-classifier";
import { PdfFlow, type PdfLayoutDiagnostics } from "@/lib/pdf/flow-layout";
import { sanitizePdfText } from "@/lib/pdf/text-sanitize";
import {
  trustedBusinessAdvantages,
  trustedCompetitorAdvantages,
} from "@/lib/competitors/competitor-types";
import type {
  AuditReportViewModel,
  ReportRecommendation,
  ReportScoreItem,
} from "@/lib/reports/audit-report-view-model";

const colors = {
  ink: "#17202a",
  muted: "#5f6875",
  border: "#d8dee7",
  accent: "#0f766e",
  accentDark: "#0b5f59",
  softAccent: "#e8f4f2",
  softBlue: "#edf4fb",
  softAmber: "#fff7e7",
  softRose: "#fff0f1",
  softGreen: "#edf8f1",
  white: "#ffffff",
};

export async function generateGrowthAuditPdf(report: AuditReportViewModel) {
  const result = await generateGrowthAuditPdfWithDiagnostics(report);
  return result.buffer;
}

export async function generateGrowthAuditPdfWithDiagnostics(
  report: AuditReportViewModel,
): Promise<{ buffer: Buffer; diagnostics: PdfLayoutDiagnostics }> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 0,
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: sanitizePdfText(
          `${report.productScope === "website_seo" ? "Website & SEO Growth Report" : "Growth Audit Report"} - ${report.business.name}`,
        ),
        Author: "Onread AI",
        Subject:
          report.productScope === "website_seo"
            ? "Website and SEO Growth Report"
            : "Professional Growth Audit Report",
        Keywords:
          report.productScope === "website_seo"
            ? "website audit, SEO audit, website improvement plan, verified website progress"
            : "growth audit, website, SEO, reviews, social strategy, competitor intelligence",
      },
    });
    const chunks: Buffer[] = [];
    const flow = new PdfFlow(doc);

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () =>
      resolve({
        buffer: Buffer.concat(chunks),
        diagnostics: flow.diagnostics,
      }),
    );

    try {
      renderReport(flow, report);
      flow.addPageFooters(report.business.name);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export function growthAuditPdfFileName({
  businessName,
  businessId,
  auditDate,
}: {
  businessName: string;
  businessId: string;
  auditDate: Date;
}) {
  const slug = slugify(businessName) || businessId;
  return `growth-audit-${slug}-${auditDate.toISOString().slice(0, 10)}.pdf`;
}

function renderReport(flow: PdfFlow, report: AuditReportViewModel) {
  renderCover(flow, report);
  flow.addPage();
  renderExecutiveSummary(flow, report);
  renderBusinessContext(flow, report);
  renderNextMoves(flow, report);
  renderOverallHealth(flow, report);
  renderAnalysisCoverage(flow, report);
  renderWebsite(flow, report);
  renderSeo(flow, report);
  if (report.productScope === "legacy_presence") {
    renderReviews(flow, report);
    renderSocialStrategy(flow, report);
    renderCompetitors(flow, report);
  }
  renderActionPlan(flow, report);
  renderProgress(flow, report);
  renderConfidence(flow, report);
  renderTechnicalAppendix(flow, report);
}

function renderCover(flow: PdfFlow, report: AuditReportViewModel) {
  const { doc, bounds } = flow;
  const score = report.audit.overallScore;

  doc.rect(0, 0, doc.page.width, 176).fill(colors.accentDark);
  doc
    .fillColor(colors.white)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("ONREAD AI", bounds.left, 55, {
      width: bounds.width,
      characterSpacing: 0.8,
    });
  doc
    .fillColor(colors.white)
    .font("Helvetica-Bold")
    .fontSize(31)
    .text(
      report.productScope === "website_seo"
        ? "Website & SEO Growth Report"
        : "Growth Audit Report",
      bounds.left,
      96,
      {
        width: bounds.width,
      },
    );

  doc
    .fillColor(colors.ink)
    .font("Helvetica-Bold")
    .fontSize(25)
    .text(sanitizePdfText(report.business.name), bounds.left, 230, {
      width: 330,
      lineGap: 2,
    });
  doc
    .fillColor(colors.muted)
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      sanitizePdfText(`Audit date: ${formatDate(report.audit.date)}`),
      bounds.left,
      278,
      { width: 330 },
    )
    .text(
      sanitizePdfText(
        report.legacyScoring
          ? "Report status: Completed / Legacy scoring model"
          : "Report status: Completed",
      ),
      bounds.left,
      298,
      { width: 330 },
    );

  const ringX = 438;
  const ringY = 275;
  doc.lineWidth(12).strokeColor("#dfe7ee").circle(ringX, ringY, 62).stroke();
  doc
    .lineWidth(12)
    .strokeColor(scoreColor(score))
    .path(scoreArcPath(ringX, ringY, 62, score))
    .stroke();
  doc
    .fillColor(colors.ink)
    .font("Helvetica-Bold")
    .fontSize(33)
    .text(String(score), ringX - 47, ringY - 24, {
      width: 94,
      align: "center",
    });
  doc
    .fillColor(colors.muted)
    .font("Helvetica")
    .fontSize(9.5)
    .text(
      report.productScope === "website_seo"
        ? "WEBSITE GROWTH SCORE"
        : "OVERALL SCORE",
      ringX - 62,
      ringY + 18,
      {
        width: 124,
        align: "center",
      },
    );

  doc
    .moveTo(bounds.left, 382)
    .lineTo(bounds.right, 382)
    .lineWidth(0.8)
    .strokeColor(colors.border)
    .stroke();
  doc
    .fillColor(colors.ink)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(report.audit.healthLabel, bounds.left, 410, {
      width: bounds.width,
    });
  doc
    .fillColor(colors.muted)
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      sanitizePdfText(
        report.productScope === "website_seo"
          ? "An evidence-based assessment of website experience, conversion paths, and SEO foundations, followed by prioritized implementation and verification guidance."
          : "A practical assessment of public website, search, profile, trust, social-strategy, and competitor evidence. Missing data is disclosed rather than scored as a failure.",
      ),
      bounds.left,
      440,
      { width: 430, lineGap: 4 },
    );
  doc
    .fillColor(colors.muted)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      sanitizePdfText(`Report ID: ${report.audit.id}`),
      bounds.left,
      doc.page.height - 82,
      { width: bounds.width },
    );
}

function renderExecutiveSummary(flow: PdfFlow, report: AuditReportViewModel) {
  flow.sectionHeading("Executive Summary", { minContentHeight: 120 });
  flow.paragraph(report.audit.executiveSummary, "Executive Summary");
  flow.keyValueRows(
    [
      ["Business", report.business.name],
      ["Audit date", formatDate(report.audit.date)],
      [
        report.scoreLabel,
        `${report.audit.overallScore}/100 - ${report.audit.healthLabel}`,
      ],
      ["User-selected growth goal", report.business.userSelectedGrowthGoal],
      [
        "Observed primary conversion goal",
        report.business.context.observedPrimaryConversionGoal ??
          "Not established in current Business Context",
      ],
    ],
    {
      fill: colors.softAccent,
      continuationTitle: "Executive Summary",
      compact: true,
    },
  );
  if (report.business.userSelectedGrowthGoal === "Not selected") {
    flow.drawWrappedText(
      "Recommendations are currently prioritized using Business Context, observed conversion signals, impact, effort, and current audit evidence.",
      {
        fontSize: 8.8,
        color: colors.muted,
        continuationTitle: "Executive Summary",
      },
    );
  }
}

function renderBusinessContext(flow: PdfFlow, report: AuditReportViewModel) {
  flow.sectionHeading("Business Context", { minContentHeight: 100 });
  flow.keyValueRows(
    [
      [
        "What the business appears to do",
        report.business.context.description ?? "Not confirmed",
      ],
      [
        "Target audience",
        report.business.context.targetAudience ?? "Not confirmed",
      ],
      ["Main offer", report.business.context.mainOffer ?? "Not confirmed"],
      [
        "Industry / type",
        [report.business.context.industry, report.business.context.businessType]
          .filter(Boolean)
          .join(" / ") || "Not confirmed",
      ],
      [
        "Observed primary conversion goal",
        report.business.context.observedPrimaryConversionGoal ??
          "Not confirmed",
      ],
      ["Brand tone", report.business.context.brandTone ?? "Not confirmed"],
      ["Context confidence", report.business.context.confidenceLabel],
      [
        "Context source",
        `${report.business.context.sourceLabel} / ${report.business.context.confirmed ? "Confirmed" : "Needs review"}`,
      ],
    ],
    { continuationTitle: "Business Context", compact: true },
  );
  if (report.business.context.reviewNote) {
    flow.note(report.business.context.reviewNote, "Business Context");
  }
}

function renderNextMoves(flow: PdfFlow, report: AuditReportViewModel) {
  flow.sectionHeading("Your Next 3 Moves", { minContentHeight: 130 });
  flow.paragraph(
    report.productScope === "website_seo"
      ? "These are the highest-confidence Website and SEO actions after considering evidence, affected pages, impact, effort, goals, and verification needs."
      : "These are the highest-confidence actions after considering business impact, effort, goals, current evidence, and publicly observable competitor signals.",
    "Your Next 3 Moves",
  );
  report.nextMoves.forEach((move, index) => {
    flow.card({
      eyebrow: `Move ${index + 1} | ${categoryLabel(move.category)} | ${move.effort} effort | ${move.impact} impact`,
      title: move.title,
      meta: `Expected outcome: ${move.expectedOutcome}`,
      body: `Why it matters: ${move.whyItMatters}\n\nImplementation: ${move.implementationAction}`,
      evidence: move.evidence,
      fill: index === 0 ? colors.softAccent : colors.white,
      continuationTitle: "Your Next 3 Moves",
    });
  });
}

function renderOverallHealth(flow: PdfFlow, report: AuditReportViewModel) {
  flow.sectionHeading("Overall Health", { minContentHeight: 135 });
  flow.keyValueRows(
    [
      [report.scoreLabel, `${report.audit.overallScore}/100`],
      ["Health indicator", report.audit.healthLabel],
      ...report.scores.map((item) => [item.label, scoreDisplay(item)] as const),
    ],
    {
      fill: colors.softBlue,
      continuationTitle: "Overall Health",
      compact: true,
    },
  );
  flow.note(
    report.productScope === "website_seo"
      ? "The Website Growth Score uses measured Website (55%) and SEO (45%) evidence. Disabled future modules do not affect the score."
      : `${report.competitors.methodologyNote} Website and SEO are excluded from the weighted score when no website is supplied.`,
    "Overall Health",
  );
}

function renderAnalysisCoverage(flow: PdfFlow, report: AuditReportViewModel) {
  const coverage = report.coverage;
  if (!coverage) return;

  flow.sectionHeading("Analysis Coverage", { minContentHeight: 115 });
  const rows = [
    [
      "Crawl coverage",
      `${coverage.crawl.successfulPages} of ${coverage.crawl.eligiblePages} eligible pages in scope`,
    ],
    [
      "Technical coverage",
      `${coverage.technical.pagesAnalyzed} pages (${formatStatus(coverage.technical.status)})`,
    ],
    [
      "AI content coverage",
      `${coverage.aiContent.completedPages} of ${coverage.aiContent.selectedPages} selected pages`,
    ],
  ] as Array<readonly [string, string]>;
  if (report.productScope === "legacy_presence") {
    rows.push(
      [
        "Social profile evidence",
        `${coverage.socialProfiles.userConfirmed} confirmed / ${coverage.socialProfiles.publiclyDetected} publicly detected / ${coverage.socialProfiles.contentAnalyzed} content-analyzed`,
      ],
      ["Review evidence", formatStatus(coverage.reviews.status)],
      ["Competitor evidence", formatStatus(coverage.competitors.status)],
    );
  }
  flow.keyValueRows(rows, {
    fill: colors.softBlue,
    continuationTitle: "Analysis Coverage",
    compact: true,
  });
  flow.note(
    report.productScope === "website_seo"
      ? `${coverage.crawl.explanation} ${coverage.technical.explanation} ${coverage.aiContent.explanation}`
      : `${coverage.crawl.explanation} ${coverage.aiContent.explanation} ${coverage.socialProfiles.explanation}`,
    "Analysis Coverage",
  );
}

function renderWebsite(flow: PdfFlow, report: AuditReportViewModel) {
  flow.sectionHeading("Website and Conversion", { minContentHeight: 130 });
  if (!report.assessment.hasWebsite || !report.website) {
    flow.keyValueRows(
      [
        ["Status", "Not provided"],
        [
          "Assessment basis",
          "Confirmed profiles, Business Context, goals, reviews, and competitors",
        ],
        [
          "How to unlock this section",
          "Add and confirm a website, then run a new audit",
        ],
      ],
      { fill: colors.softBlue, continuationTitle: "Website and Conversion" },
    );
    flow.note(
      "Website checks were excluded from this audit and did not reduce the overall score.",
      "Website and Conversion",
    );
    return;
  }

  const website = report.website;
  const normalizedHomepage = report.normalizedFacts?.homepage;
  const crawl = report.websiteCrawl;
  const primaryActions =
    website.actionSummary?.detectedActionTypes ??
    website.actionSummary?.primaryActions ??
    website.ctaCandidates;
  const ctaAssessment = report.technicalAppendix.homepagePrimaryCtaAssessment;
  flow.keyValueRows(
    [
      ["Website score", scoreValue(report.scores, ScoreCategory.WEBSITE)],
      ["Page title", normalizedHomepage?.title.value || "Missing"],
      [
        "Meta description",
        normalizedHomepage?.metaDescription.status === "MISSING"
          ? "Missing (0 characters)"
          : `Present (${normalizedHomepage?.metaDescription.length ?? website.metaDescription?.length ?? 0} characters)`,
      ],
      [
        "Main headline (H1)",
        normalizedHomepage?.h1.count === 1
          ? normalizedHomepage.h1.values.at(0) || "One detected"
          : `${normalizedHomepage?.h1.count ?? website.h1Count} detected`,
      ],
      [
        "Images missing alt text",
        `${website.imagesMissingAltCount} of ${website.imageCount}`,
      ],
      ["Detected action types", primaryActions.join(", ") || "None detected"],
      [
        "Homepage primary CTA clarity",
        ctaAssessment
          ? `${formatStatus(ctaAssessment.clarity)} (${ctaAssessment.confidence.toLowerCase()} confidence)`
          : "Not assessed",
      ],
      [
        "Pages with detected action links",
        report.technicalAppendix.pagesWithDetectedActionLinks === null
          ? "Not evaluated"
          : `${report.technicalAppendix.pagesWithDetectedActionLinks} of ${crawl?.successfulPages ?? 1}`,
      ],
      [
        "Pages with CTA clarity assessed",
        report.technicalAppendix.pagesWithAssessedPrimaryCta === null
          ? "Not evaluated"
          : `${report.technicalAppendix.pagesWithAssessedPrimaryCta} of ${crawl?.successfulPages ?? 1}`,
      ],
      [
        "Pages scanned",
        crawl
          ? `${crawl.pagesScanned} (crawl limit: ${crawl.crawlLimitUsed})`
          : "Homepage only",
      ],
      [
        "Important pages found",
        crawl?.importantPagesFound.join(", ") || "None identified",
      ],
      [
        "Important pages not detected",
        crawl?.missingImportantPageTypes.join(", ") || "None",
      ],
    ],
    { continuationTitle: "Website and Conversion", compact: true },
  );
  flow.note(
    "Detected action links can include navigation, utility, event, social, and secondary links. Link presence does not prove that one primary conversion action is visually prominent; CTA clarity is evaluated separately.",
    "Website and Conversion",
  );
}

function renderSeo(flow: PdfFlow, report: AuditReportViewModel) {
  flow.sectionHeading("SEO", { minContentHeight: 120 });
  if (!report.assessment.hasWebsite || !report.seo) {
    flow.keyValueRows(
      [
        ["Status", "Not applicable"],
        ["Website SEO checks", "Not run because no website was provided"],
        ["Overall score impact", "Excluded from the weighted score"],
      ],
      { fill: colors.softBlue, continuationTitle: "SEO" },
    );
    return;
  }

  const seo = report.seo;
  const crawl = report.websiteCrawl;
  flow.keyValueRows(
    [
      ["SEO score", scoreValue(report.scores, ScoreCategory.SEO)],
      [
        "Title status / length",
        `${formatStatus(report.normalizedFacts?.homepage?.title.status ?? seo.titleStatus)} / ${report.normalizedFacts?.homepage?.title.length ?? seo.titleLength}`,
      ],
      [
        "Meta description status / length",
        `${formatStatus(report.normalizedFacts?.homepage?.metaDescription.status ?? seo.metaDescriptionStatus)} / ${report.normalizedFacts?.homepage?.metaDescription.length ?? seo.metaDescriptionLength}`,
      ],
      [
        "Homepage H1 status",
        formatStatus(
          report.normalizedFacts?.homepage?.h1.status ?? seo.h1Status,
        ),
      ],
      ["Canonical status", formatStatus(seo.canonicalStatus)],
      ["Viewport status", formatStatus(seo.viewportStatus)],
      ["robots.txt", formatStatus(seo.robotsTxtStatus)],
      ["sitemap.xml", formatStatus(seo.sitemapStatus)],
      [
        "Pages missing titles",
        crawl ? String(crawl.pagesMissingTitle) : "Homepage only",
      ],
      [
        "Pages missing meta descriptions",
        crawl ? String(crawl.pagesMissingMetaDescription) : "Homepage only",
      ],
      [
        "Pages with H1 issues",
        crawl
          ? String(crawl.pagesWithNoH1 + crawl.pagesWithMultipleH1)
          : report.website?.h1Count === 1
            ? "0"
            : "1",
      ],
    ],
    { continuationTitle: "SEO", compact: true },
  );
  if (seo.seoWarnings.length > 0) {
    flow.subsectionHeading("Key SEO warnings", "SEO");
    flow.bulletList(seo.seoWarnings.slice(0, 3), "SEO");
  }
  if (seo.recommendedFixes.length > 0) {
    flow.subsectionHeading("Recommended fixes", "SEO");
    flow.bulletList(seo.recommendedFixes.slice(0, 3), "SEO");
  }
}

function renderReviews(flow: PdfFlow, report: AuditReportViewModel) {
  const reviews = report.reviews;
  flow.sectionHeading("Reviews and Trust", { minContentHeight: 130 });
  flow.keyValueRows(
    [
      [
        reviews.dataRequirementsMet
          ? "Reviews & Trust score"
          : "Listing-presence score",
        `${reviews.score}/100 (${reviews.scoreConfidence.toLowerCase()} confidence)`,
      ],
      [
        "Score scope",
        reviews.dataRequirementsMet
          ? "Review performance with rating and count"
          : "Provisional listing presence; review performance unscored",
      ],
      ["Google Business status", formatStatus(reviews.googleBusinessStatus)],
      [
        "Confirmed listing",
        reviews.googleBusinessListingName ?? "None confirmed",
      ],
      [
        "Current rating",
        reviews.googleRating === null
          ? "Not available"
          : `${reviews.googleRating.toFixed(1)} / 5`,
      ],
      [
        "Current review count",
        reviews.googleReviewCount === null
          ? "Not available"
          : reviews.googleReviewCount.toLocaleString(),
      ],
      ["Review presence", reviews.reviewPresenceLevel],
      ["Evidence completeness", `${reviews.evidenceCompleteness}%`],
      [
        "Confirmed review platforms",
        reviews.confirmedReviewPlatforms.join(", ") || "None",
      ],
      [
        "Pending review platforms",
        reviews.pendingReviewPlatforms.join(", ") || "None",
      ],
    ],
    {
      fill: colors.softGreen,
      continuationTitle: "Reviews and Trust",
      compact: true,
    },
  );
  if (reviews.googleMapsUri) {
    flow.drawWrappedText("Open confirmed Google Maps listing", {
      font: "Helvetica-Bold",
      fontSize: 9.5,
      color: colors.accent,
      link: reviews.googleMapsUri,
      underline: true,
      after: 10,
      continuationTitle: "Reviews and Trust",
    });
  }
  const trustStrength = reviews.trustStrengths.at(0);
  const opportunity =
    reviews.opportunities.at(0) ?? reviews.trustWarnings.at(0);
  const reviewHighlights = [
    trustStrength ? `Trust strength: ${trustStrength}` : null,
    opportunity ? `Key opportunity: ${opportunity}` : null,
  ].filter((item): item is string => Boolean(item));
  if (reviewHighlights.length > 0) {
    flow.subsectionHeading("Trust summary", "Reviews and Trust");
    flow.bulletList(reviewHighlights, "Reviews and Trust");
  }
  if (reviews.recommendedFixes.length > 0) {
    flow.subsectionHeading("Recommended actions", "Reviews and Trust");
    flow.bulletList(reviews.recommendedFixes.slice(0, 2), "Reviews and Trust");
  }
  flow.drawWrappedText(
    `${reviews.reviewScoreExplanation} This section does not claim to have read individual reviews or performed sentiment analysis, and it does not invent review quotes.`,
    {
      fontSize: 8.5,
      color: colors.muted,
      continuationTitle: "Reviews and Trust",
    },
  );
}

function renderSocialStrategy(flow: PdfFlow, report: AuditReportViewModel) {
  const strategy = report.socialStrategy;
  flow.sectionHeading("Social Strategy", { minContentHeight: 140 });
  flow.drawWrappedText(strategy.scopeNote, {
    fontSize: 8.7,
    color: colors.muted,
    continuationTitle: "Social Strategy",
  });
  flow.keyValueRows(
    [
      ["Social score", `${report.social.score}/100`],
      [
        "Score scope",
        "Confirmed profile coverage only; content performance not analyzed",
      ],
      [
        "User-confirmed social profiles",
        String(
          report.normalizedFacts?.profiles.userConfirmedSocialProfiles ??
            report.business.profileSummary.userConfirmedSocialProfiles ??
            report.social.confirmedProfilesCount,
        ),
      ],
      [
        "Publicly detected social profiles",
        String(
          report.normalizedFacts?.profiles.publiclyDetectedSocialProfiles ??
            report.business.profileSummary.publiclyDetectedSocialProfiles ??
            0,
        ),
      ],
      [
        "Pending social profiles",
        String(
          report.normalizedFacts?.profiles.pendingSocialProfiles ??
            report.business.profileSummary.pendingSocialProfiles ??
            report.social.pendingProfilesCount,
        ),
      ],
      [
        "Profile content analyzed",
        String(
          report.normalizedFacts?.profiles.profileContentAnalyzed ??
            report.business.profileSummary.profileContentAnalyzed ??
            0,
        ),
      ],
      ["Coverage level", report.social.platformCoverageLevel],
      ["Strategy source", strategy.sourceLabel],
      ["Source freshness", strategy.freshness.status],
      [
        "Recommended platforms",
        strategy.data.recommendedPlatforms
          .slice(0, 5)
          .map((item) => `${item.platform} (${item.priority})`)
          .join(", ") || "None",
      ],
    ],
    {
      fill: colors.softBlue,
      continuationTitle: "Social Strategy",
      compact: true,
    },
  );
  flow.subsectionHeading("Three content pillars", "Social Strategy", 92);
  flow.bulletList(
    strategy.data.contentPillars
      .slice(0, 3)
      .map((pillar) => `${pillar.title}: ${pillar.description}`),
    "Social Strategy",
  );
  flow.subsectionHeading("Next three content ideas", "Social Strategy", 92);
  flow.bulletList(
    strategy.data.weeklyPlan
      .slice(0, 3)
      .map((item) => `${item.platform}: ${item.idea} Next step: ${item.goal}`),
    "Social Strategy",
  );
  const conversionTip = strategy.data.conversionTips.at(0);
  if (conversionTip) {
    flow.card({
      eyebrow: "Conversion guidance",
      title: conversionTip.tip,
      body: conversionTip.reason,
      fill: colors.softAccent,
      continuationTitle: "Social Strategy",
    });
  }
}

function renderCompetitors(flow: PdfFlow, report: AuditReportViewModel) {
  const competitors = report.competitors;
  flow.sectionHeading("Competitor Intelligence", { minContentHeight: 130 });
  flow.keyValueRows(
    [
      ["Comparison status", competitors.label],
      [
        "Competitive Position score",
        competitors.score === null
          ? competitors.label
          : `${competitors.score}/100`,
      ],
      ["Active competitors", String(competitors.activeCount)],
      [
        "Confirmed public profiles, including website",
        String(competitors.profileCounts.confirmedPublicProfiles),
      ],
      [
        "Confirmed social profiles",
        String(competitors.profileCounts.confirmedSocialProfiles),
      ],
      [
        "Pending or detected social links",
        String(competitors.profileCounts.pendingSocialProfiles),
      ],
      ["Competitors", competitors.names.join(", ") || "None configured"],
      [
        "Latest competitor snapshot",
        competitors.snapshotDate
          ? formatDate(competitors.snapshotDate)
          : "Not available",
      ],
      ["Business audit date", formatDate(competitors.businessAuditDate)],
    ],
    {
      fill: colors.softBlue,
      continuationTitle: "Competitor Intelligence",
      compact: true,
    },
  );
  flow.drawWrappedText(competitors.methodologyNote, {
    fontSize: 8.5,
    color: colors.muted,
    continuationTitle: "Competitor Intelligence",
  });

  const comparison = competitors.comparison;
  if (!comparison || comparison.analyzedCompetitorCount === 0) {
    flow.paragraph(
      competitors.status === "not_configured"
        ? "Competitor comparison is not configured. Missing competitor data was not assigned a low score and no competitor action is treated as required."
        : "Competitors are saved, but no completed comparable public snapshot is available. The report does not infer an advantage or disadvantage from missing data.",
      "Competitor Intelligence",
    );
    return;
  }

  flow.paragraph(
    competitors.intelligence?.summary.executiveSummary,
    "Competitor Intelligence",
  );
  const comparableRows = comparison.categoryComparisons.slice(0, 12);
  if (comparableRows.length > 0) {
    flow.subsectionHeading(
      "Public side-by-side observations",
      "Competitor Intelligence",
    );
    flow.table({
      continuationTitle: "Competitor Intelligence",
      columns: [
        { key: "category", label: "Area", width: 68 },
        { key: "competitor", label: "Competitor", width: 90 },
        { key: "business", label: report.business.name, width: 82 },
        { key: "other", label: "Competitor", width: 82 },
        { key: "observation", label: "Public observation", width: 182 },
      ],
      rows: comparableRows.map((row) => ({
        category:
          row.category === "reviews" ? "Reviews" : titleCase(row.category),
        competitor: row.competitorName,
        business:
          row.category === "reviews" && row.status === "not_comparable"
            ? "Not comparable"
            : row.businessDisplay,
        other:
          row.category === "reviews" && row.status === "not_comparable"
            ? "Not comparable"
            : row.competitorDisplay,
        observation:
          row.category === "positioning"
            ? `Inferred: ${row.observation}`
            : row.observation,
      })),
    });
  }
  const businessAdvantages = trustedBusinessAdvantages(comparison);
  const competitorAdvantages = trustedCompetitorAdvantages(comparison);
  if (businessAdvantages.length > 0) {
    flow.subsectionHeading(
      "Confirmed business advantages",
      "Competitor Intelligence",
    );
    flow.bulletList(
      businessAdvantages.slice(0, 2).map((item) => item.description),
      "Competitor Intelligence",
    );
  } else {
    flow.note(
      "No confirmed business advantage was identified from the currently comparable public signals.",
      "Competitor Intelligence",
    );
  }
  if (competitorAdvantages.length > 0) {
    flow.subsectionHeading(
      "Observed competitor edges",
      "Competitor Intelligence",
    );
    flow.bulletList(
      competitorAdvantages.slice(0, 2).map((item) => item.description),
      "Competitor Intelligence",
    );
  }
  if (comparison.opportunities.length > 0) {
    flow.subsectionHeading("Top opportunities", "Competitor Intelligence");
    flow.bulletList(
      comparison.opportunities.slice(0, 3).map((item) => item.description),
      "Competitor Intelligence",
    );
  }
  flow.drawWrappedText(
    "Competitor evidence is publicly observable and timestamped. Confirmed profiles are kept separate from pending or detected links. Positioning is an informed interpretation of public messaging. Private analytics, traffic, sales, engagement, reach, posting frequency, and content performance were not analyzed.",
    {
      fontSize: 8.4,
      color: colors.muted,
      continuationTitle: "Competitor Intelligence",
    },
  );
}

function renderActionPlan(flow: PdfFlow, report: AuditReportViewModel) {
  const recommendations = report.recommendations;
  const supportingFixCount = Math.min(3, recommendations.technical.length);
  flow.sectionHeading("Recommended Action Plan", { minContentHeight: 245 });
  flow.paragraph(
    `${recommendations.completed} of ${recommendations.total} current recommendations are marked complete. The report shows up to three highest-priority business actions${
      supportingFixCount > 0
        ? ` and ${supportingFixCount} supporting technical ${supportingFixCount === 1 ? "fix" : "fixes"}`
        : ""
    }.`,
    "Recommended Action Plan",
  );
  flow.subsectionHeading(
    "A. Highest-priority business actions",
    "Recommended Action Plan",
    150,
  );
  if (recommendations.primary.length === 0) {
    flow.paragraph(
      "No current business-priority actions remain after freshness and compatibility checks.",
      "Recommended Action Plan",
    );
  }
  recommendations.primary.forEach((item, index) => {
    renderRecommendationCard(
      flow,
      item,
      index + 1,
      "Recommended Action Plan",
      expectedResultFor(item, report),
      true,
    );
  });
  if (recommendations.technical.length > 0) {
    flow.subsectionHeading(
      "B. Supporting technical fixes",
      "Recommended Action Plan",
      135,
    );
    recommendations.technical.slice(0, 3).forEach((item, index) => {
      renderRecommendationCard(
        flow,
        item,
        index + 1,
        "Recommended Action Plan",
        expectedResultFor(item, report),
        true,
      );
    });
  }
}

function renderProgress(flow: PdfFlow, report: AuditReportViewModel) {
  const progress = report.progress;
  const comparison = progress.comparison;
  flow.sectionHeading("Progress Since Previous Audit", {
    minContentHeight: 130,
  });
  if (!comparison.previousAuditId) {
    flow.note(
      "This is the first completed audit in the comparison sequence. Future audits will show score, evidence, and coverage changes here.",
      "Progress Since Previous Audit",
    );
    return;
  }

  flow.keyValueRows(
    [
      ["Previous score", progress.previousScore ?? "Unavailable"],
      ["Current score", progress.currentScore],
      ["Change", formatDelta(comparison.overallScoreChange)],
      [
        "Comparison status",
        comparison.methodologyChanged
          ? "Limited historical comparison"
          : "Comparable with disclosed coverage differences",
      ],
      [
        "Completed recommendations since previous audit",
        comparison.completedRecommendationsSincePrevious.length,
      ],
    ],
    {
      fill: colors.softBlue,
      continuationTitle: "Progress Since Previous Audit",
      compact: true,
    },
  );
  flow.drawWrappedText(comparison.summary, {
    fontSize: 9.2,
    lineGap: 2.5,
    continuationTitle: "Progress Since Previous Audit",
  });
  if (comparison.comparisonNote) {
    flow.note(comparison.comparisonNote, "Progress Since Previous Audit");
  }
  const meaningfulChanges = comparison.categoryScoreChanges.filter(
    (change) => change.delta !== 0 || change.changeType !== "unknown",
  );
  if (meaningfulChanges.length > 0) {
    flow.subsectionHeading("What changed", "Progress Since Previous Audit");
    flow.bulletList(
      meaningfulChanges.map(
        (change) =>
          `${categoryLabel(change.category)}: ${change.previousScore} to ${change.currentScore} (${formatDelta(change.delta)}). ${changeTypeLabel(change.changeType)}. ${change.reason}`,
      ),
      "Progress Since Previous Audit",
    );
  }
  flow.drawWrappedText(progress.note, {
    fontSize: 8.4,
    color: colors.muted,
    continuationTitle: "Progress Since Previous Audit",
  });
}

function renderConfidence(flow: PdfFlow, report: AuditReportViewModel) {
  const confidence = report.confidence;
  flow.sectionHeading("Report Confidence and Data Notes", {
    minContentHeight: 130,
  });
  const rows: Array<readonly [string, string]> = [
    [
      "Website coverage",
      `${confidence.pagesScanned} of ${confidence.crawlLimit} page slots used / ${titleCase(confidence.crawlStatus)} / Important pages: ${confidence.importantPagesIncluded.join(", ") || "none identified"}`,
    ],
    ["Business Context", confidence.businessContextStatus],
    [
      "Versions",
      `Scoring: ${report.scoringMetadata.scoringEngineVersion} / Report: ${report.scoringMetadata.reportViewModelVersion}`,
    ],
  ];
  if (report.productScope === "legacy_presence") {
    rows.splice(
      2,
      0,
      [
        "Current confirmed data",
        `Google Business: ${formatStatus(confidence.googleBusinessStatus)} / Business Context: ${confidence.businessContextStatus}`,
      ],
      [
        "Derived sections",
        `Social Strategy: ${confidence.socialStrategyStatus} / Competitive Position: ${confidence.competitorComparisonStatus}`,
      ],
    );
  }
  flow.keyValueRows(rows, {
    fill: colors.softAccent,
    continuationTitle: "Report Confidence and Data Notes",
    compact: true,
  });
  flow.subsectionHeading("Limitations", "Report Confidence and Data Notes");
  flow.drawWrappedText(confidence.limitations.join(" "), {
    fontSize: 8.7,
    color: colors.muted,
    continuationTitle: "Report Confidence and Data Notes",
  });
  if (report.dataNotes.length > 0) {
    flow.subsectionHeading(
      "Conflicting evidence to review",
      "Report Confidence and Data Notes",
    );
    flow.bulletList(report.dataNotes, "Report Confidence and Data Notes");
  }
}

function renderTechnicalAppendix(flow: PdfFlow, report: AuditReportViewModel) {
  flow.sectionHeading("Technical Appendix", { minContentHeight: 150 });
  flow.paragraph(
    "This appendix preserves technical evidence for consultants and implementation teams. The Executive Summary and Your Next 3 Moves are the client-facing priorities.",
    "Technical Appendix",
  );
  if (!report.website) {
    flow.keyValueRows(
      [
        ["Website analysis", "Not applicable - no website was provided"],
        ["SEO analysis", "Not applicable - excluded from scoring"],
      ],
      { continuationTitle: "Technical Appendix" },
    );
  } else {
    flow.subsectionHeading("Homepage technical checks", "Technical Appendix");
    flow.keyValueRows(
      [
        ["Page title", report.website.pageTitle || "Missing"],
        ["Meta description", report.website.metaDescription || "Missing"],
        ["H1 count", report.website.h1Count],
        ["Canonical tag", report.website.hasCanonical ? "Present" : "Missing"],
        [
          "Viewport meta",
          report.website.hasViewportMeta ? "Present" : "Missing",
        ],
        [
          "Detected action and navigation links",
          report.technicalAppendix.detectedActionLinks.length,
        ],
      ],
      { continuationTitle: "Technical Appendix" },
    );
    flow.note(
      "Detected action and navigation links can include navigation, utility links, social links, event links, and secondary actions. Raw counts are not proof of primary CTA clarity.",
      "Technical Appendix",
    );
    if (report.technicalAppendix.detectedActionLinks.length > 0) {
      flow.drawWrappedText(
        `Examples: ${report.technicalAppendix.detectedActionLinks.slice(0, 3).join(" / ")}. ${Math.max(0, report.technicalAppendix.detectedActionLinks.length - 3)} additional detected links are summarized by count.`,
        {
          fontSize: 8.3,
          color: colors.muted,
          continuationTitle: "Technical Appendix",
        },
      );
    }
  }

  const crawl = report.websiteCrawl;
  if (crawl) {
    flow.subsectionHeading(
      "Multi-page crawl diagnostics",
      "Technical Appendix",
    );
    flow.keyValueRows(
      [
        [
          "Crawl result",
          `${crawl.pagesScanned} scanned / ${crawl.successfulPages} successful / ${crawl.failedPages} failed`,
        ],
        [
          "Coverage",
          `Limit ${crawl.crawlLimitUsed} / Limit reached: ${crawl.crawlLimitReached ? "Yes" : "No"}`,
        ],
        ["Duplicate URL variants skipped", crawl.duplicateUrlsSkipped],
        [
          "Metadata gaps",
          `${crawl.pagesMissingTitle} missing titles / ${crawl.pagesMissingMetaDescription} missing meta descriptions`,
        ],
        [
          "H1 structure",
          `${crawl.pagesWithNoH1} pages with no H1 / ${crawl.pagesWithMultipleH1} with multiple H1s`,
        ],
        [
          "Action-link and CTA checks",
          `${report.technicalAppendix.pagesWithDetectedActionLinks ?? "Not evaluated"} pages with detected action links / ${report.technicalAppendix.pagesWithAssessedPrimaryCta ?? "Not evaluated"} pages with CTA clarity assessed / ${report.technicalAppendix.pagesWithStructurallyClearPrimaryCta ?? "Not evaluated"} structurally assessed as clear`,
        ],
      ],
      { continuationTitle: "Technical Appendix", compact: true },
    );
    flow.note(
      `${crawl.duplicateUrlsSkipped.toLocaleString()} duplicate URL variants skipped means repeated, parameterized, or normalized links discovered during crawling. It does not mean the site publishes that many duplicate pages.`,
      "Technical Appendix",
    );
    flow.subsectionHeading(
      report.technicalAppendix.pageSelection.label,
      "Technical Appendix",
    );
    flow.note(
      report.technicalAppendix.pageSelection.selectionRule,
      "Technical Appendix",
    );
    flow.table({
      continuationTitle: "Technical Appendix",
      columns: [
        { key: "page", label: "Page", width: 166 },
        { key: "status", label: "Status", width: 42, align: "center" },
        { key: "title", label: "Title", width: 48, align: "center" },
        { key: "meta", label: "Meta", width: 48, align: "center" },
        { key: "h1", label: "H1", width: 42, align: "center" },
        { key: "actions", label: "Actions", width: 48, align: "center" },
        { key: "cta", label: "CTA clarity", width: 66, align: "center" },
        { key: "alt", label: "Missing alt", width: 44, align: "center" },
      ],
      rows: report.technicalAppendix.pageSelection.pages.map((page) => ({
        page: safePageLabel(page.url),
        status: page.statusCode ?? "Failed",
        title: page.title ? "Present" : "Missing",
        meta: page.metaDescription ? "Present" : "Missing",
        h1:
          page.h1Count === 1
            ? "Good"
            : page.h1Count === 0
              ? "None"
              : String(page.h1Count),
        actions:
          page.actionSummary?.detectedActionLinkCount ??
          page.actionSummary?.primaryActions?.length ??
          0,
        cta: formatStatus(getPrimaryCtaAssessment(page.actionSummary).clarity),
        alt: page.imagesMissingAltCount,
      })),
    });
  }

  if (report.seo) {
    flow.subsectionHeading("Technical SEO checks", "Technical Appendix");
    flow.keyValueRows(
      [
        [
          "Title / meta description",
          `${formatStatus(report.seo.titleStatus)} / ${formatStatus(report.seo.metaDescriptionStatus)}`,
        ],
        [
          "H1 / canonical / viewport",
          `${formatStatus(report.seo.h1Status)} / ${formatStatus(report.seo.canonicalStatus)} / ${formatStatus(report.seo.viewportStatus)}`,
        ],
        [
          "robots.txt / sitemap.xml",
          `${formatStatus(report.seo.robotsTxtStatus)} / ${formatStatus(report.seo.sitemapStatus)}`,
        ],
      ],
      { continuationTitle: "Technical Appendix", compact: true },
    );
  }

  flow.subsectionHeading("Current audit findings", "Technical Appendix", 260);
  const appendixFindings = report.technicalAppendix.findings.slice(0, 6);
  flow.bulletList(
    appendixFindings.map(
      (finding) =>
        `${finding.sourceLabel ?? "Observation"} | ${categoryLabel(finding.category)} - ${finding.title}: ${finding.description}${
          finding.sourceUrl ? ` | Affected page: ${finding.sourceUrl}` : ""
        }${
          finding.source === "ai_reviewed_opportunity" &&
          finding.evidenceSummary
            ? ` | Evidence: ${finding.evidenceSummary}`
            : ""
        }`,
    ),
    "Technical Appendix",
  );
}

function renderRecommendationCard(
  flow: PdfFlow,
  item: ReportRecommendation,
  index: number,
  continuationTitle: string,
  expectedResult?: string,
  compact = false,
) {
  flow.card({
    eyebrow: `${index}. ${item.priority} priority | ${item.status.replaceAll("_", " ")} | ${item.sourceCategory}${
      item.sourceLabel ? ` | ${item.sourceLabel}` : ""
    }`,
    title: item.title,
    meta: `Effort: ${item.estimatedEffort} | Expected impact: ${item.expectedImpact} | Confidence: ${item.confidence} | ${item.freshness}`,
    body: compact
      ? `Expected result: ${completeEvidenceSummary(expectedResult ?? item.description, 180)}`
      : `${item.description}\n\nWhy this fits the business: ${item.businessRelevance}`,
    evidence: compact
      ? completeEvidenceSummary(item.evidenceSummary, 190)
      : item.evidenceSummary,
    fill:
      item.status === RecommendationStatus.COMPLETED
        ? colors.softGreen
        : colors.white,
    continuationTitle,
    compact,
  });
}

function scoreDisplay(item: ReportScoreItem) {
  if (item.score !== null) {
    return `${item.score}/100${item.status === "partial" ? " (partial comparison)" : ""}`;
  }
  switch (item.status) {
    case "not_provided":
      return "Not provided";
    case "not_applicable":
      return "Not applicable";
    case "not_configured":
      return "Not configured";
    case "saved_not_analyzed":
      return "Saved but not analyzed";
    case "partial":
      return "Partial comparison";
    default:
      return "Unavailable";
  }
}

function scoreValue(items: ReportScoreItem[], category: ScoreCategory) {
  const item = items.find((score) => score.category === category);
  return item ? scoreDisplay(item) : "Unavailable";
}

function categoryLabel(category: ScoreCategory) {
  const labels: Record<ScoreCategory, string> = {
    OVERALL: "Overall",
    WEBSITE: "Website",
    SEO: "SEO",
    SOCIAL: "Social",
    BRANDING: "Branding",
    REVIEWS: "Reviews & Trust",
    COMPETITORS: "Competitive Position",
  };
  return labels[category];
}

function changeTypeLabel(
  value:
    | "observable_business_change"
    | "coverage_change"
    | "scoring_method_change"
    | "temporary_data_difference"
    | "unknown",
) {
  const labels = {
    observable_business_change: "Observable evidence changed",
    coverage_change: "Analysis coverage expanded or changed",
    scoring_method_change: "Scoring methodology changed",
    temporary_data_difference: "Temporary or partial data difference",
    unknown: "No reliable cause identified",
  } as const;
  return labels[value];
}

function formatStatus(value?: string | null) {
  if (!value) return "Unavailable";
  return titleCase(value.replaceAll("_", " "));
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function safePageLabel(value: string) {
  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}`;
    return path === "/" ? `${url.hostname}/` : `${url.hostname}${path}`;
  } catch {
    return value;
  }
}

function expectedResultFor(
  item: ReportRecommendation,
  report: AuditReportViewModel,
) {
  const matchingMove = item.technical
    ? undefined
    : report.nextMoves.find((move) => move.category === item.category);
  if (matchingMove) return matchingMove.expectedOutcome;

  const outcomes: Record<ScoreCategory, string> = {
    OVERALL: "A clearer, evidence-led next step for the business.",
    WEBSITE: "A clearer visitor journey and a more prominent conversion path.",
    SEO: "Cleaner search signals and more consistent page structure.",
    SOCIAL: "A more focused social presence with a practical conversion path.",
    BRANDING:
      "More consistent, recognizable messaging across public touchpoints.",
    REVIEWS: "Stronger visible trust at important customer decision points.",
    COMPETITORS:
      "A sharper response to publicly observable competitor positioning.",
  };
  return outcomes[item.category];
}

function scoreColor(score: number) {
  if (score >= 85) return "#16835c";
  if (score >= 70) return colors.accent;
  if (score >= 55) return "#c28b16";
  return "#b84a55";
}

function scoreArcPath(cx: number, cy: number, radius: number, score: number) {
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * Math.max(0.01, Math.min(1, score / 100));
  const points = 48;
  let path = `M ${cx + radius * Math.cos(start)} ${cy + radius * Math.sin(start)}`;
  for (let index = 1; index <= points; index += 1) {
    const angle = start + ((end - start) * index) / points;
    path += ` L ${cx + radius * Math.cos(angle)} ${cy + radius * Math.sin(angle)}`;
  }
  return path;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

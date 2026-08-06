import {
  BusinessProfileStatus,
  FindingSeverity,
  ProfilePlatform,
  RecommendationPriority,
  RecommendationStatus,
  ScoreCategory,
} from "@prisma/client";

import { classifyWebsiteActions } from "@/lib/analyzers/action-classifier";
import type {
  CrawledPageResult,
  ImportantPageRecord,
} from "@/lib/analyzers/website-crawler";
import {
  EVIDENCE_CONTRACT_VERSION,
  stableEvidenceId,
  type AuditEvidenceRecord,
  type AuditEvidenceType,
} from "@/lib/audits/evidence-contracts";
import { buildNormalizedAuditFacts } from "@/lib/audits/normalized-audit-facts";
import type {
  AuditReportViewModel,
  ReportFinding,
  ReportRecommendation,
} from "@/lib/reports/audit-report-view-model";
import {
  buildCanonicalAuditReport,
  CANONICAL_AUDIT_REPORT_VERSION,
  materializeCanonicalReport,
} from "@/lib/reports/canonical-audit-report";
import { createReportFixture } from "@/lib/reports/report-fixtures.test-support";
import { selectReportCrawlPages } from "@/lib/reports/page-summary";

const auditDate = new Date("2026-07-21T15:30:00.000Z");
const homepageUrl = "https://justpieorlando.example/";
const pageUrls = {
  homepage: homepageUrl,
  menu: `${homepageUrl}menu`,
  order: `${homepageUrl}order-inquiries`,
  merchandise: `${homepageUrl}merch-shop`,
  product: `${homepageUrl}products/apple-pie-pocket`,
  faq: `${homepageUrl}faq`,
} as const;

const rootCauses = {
  meta: "SITEWIDE_META_DESCRIPTION_MISSING",
  h1: "PAGE_H1_MISSING",
  alt: "SITEWIDE_IMAGE_ALT_MISSING",
  title: "HOMEPAGE_TITLE_QUALITY",
  cta: "HOMEPAGE_PRIMARY_CTA_CLARITY",
  contact: "CONTACT_PATH_PRESENT",
} as const;

export function createJustPieCanonicalReportFixture(): AuditReportViewModel {
  const source = createJustPieCanonicalSourceFixture();
  const canonical = buildCanonicalAuditReport(source, {
    strict: true,
    reportVersion: CANONICAL_AUDIT_REPORT_VERSION,
    generatedAt: auditDate,
  });

  return materializeCanonicalReport(canonical);
}

export function createJustPieCanonicalSourceFixture(): AuditReportViewModel {
  const report = structuredClone(
    createReportFixture("cottage_regression"),
  ) as AuditReportViewModel;
  const pages = createPages();
  const evidence = createEvidence();
  const findings = createFindings(evidence);
  const recommendations = createRecommendations(findings, evidence);
  const homepage = pages[0];
  const homepageActions = homepage.actionSummary;

  report.business.id = "business-just-pie-orlando";
  report.business.name = "Just Pie Orlando";
  report.business.initialInput = "https://justpieorlando.example";
  report.business.context = {
    description:
      "Just Pie Orlando is a home-based cottage-food business offering handcrafted pie pockets by preorder, with no public storefront.",
    targetAudience:
      "Orlando-area families, event hosts, and pie lovers looking for locally made treats.",
    mainOffer:
      "Handcrafted pie pockets, seasonal flavors, preorder pickup or delivery, and branded merchandise.",
    industry: "Cottage food",
    businessType: "Home-based cottage-food preorder business",
    observedPrimaryConversionGoal:
      "Submit an order inquiry for local pickup or delivery.",
    brandTone: "Warm, local, and product-focused.",
    confidenceLabel: "high confidence",
    sourceLabel: "User confirmed",
    confirmed: true,
    needsReview: false,
    reviewNote: null,
  };
  report.business.profileSummary.confirmedPlatforms = ["Website"];

  report.audit.id = "audit-just-pie-orlando";
  report.audit.date = auditDate;
  report.audit.completedAt = auditDate;

  report.website = {
    ...report.website!,
    normalizedUrl: homepageUrl,
    requestedUrl: "https://justpieorlando.example",
    finalUrl: homepageUrl,
    canonicalUrl: homepageUrl,
    fetchStatus: "success",
    statusCode: 200,
    pageTitle: "Just Pie Orlando",
    metaDescription: null,
    contentExcerpt:
      "Founded by an Orlando home baker, Just Pie Orlando makes handcrafted pie pockets for preorder. Contact Us or use Order Inquiries for pickup and local delivery.",
    h1Count: 1,
    h1Text: ["Handcrafted pie pockets in Orlando"],
    internalLinksCount: 8,
    externalLinksCount: 3,
    imageCount: 5,
    imagesMissingAltCount: 0,
    hasContactLink: true,
    hasPricingLink: false,
    hasBlogLink: false,
    hasSocialLinks: true,
    detectedSocialLinks: [
      "https://instagram.com/justpieorlando",
      "https://facebook.com/justpieorlando",
    ],
    ctaCandidates: ["Order Inquiries", "Contact Us"],
    actionSummary: homepageActions,
    warnings: [
      "The homepage meta description is missing.",
      "The homepage title is present but not very descriptive.",
    ],
    score: 74,
  };

  const importantPages: ImportantPageRecord[] = [
    importantPage("Homepage", pageUrls.homepage, 100),
    importantPage("Menu", pageUrls.menu, 90),
    importantPage("Order / Takeout", pageUrls.order, 90),
    importantPage("Store / Gift Cards", pageUrls.merchandise, 80),
    importantPage("Products", pageUrls.product, 75),
    importantPage("FAQ", pageUrls.faq, 60),
  ];
  report.websiteCrawl = {
    ...report.websiteCrawl!,
    normalizedUrl: homepageUrl,
    pagesScanned: pages.length,
    successfulPages: pages.length,
    failedPages: 0,
    averagePageScore: Math.round(
      pages.reduce((total, page) => total + page.score, 0) / pages.length,
    ),
    pagesMissingTitle: 0,
    pagesMissingMetaDescription: 4,
    pagesWithNoH1: 1,
    pagesWithMultipleH1: 0,
    totalImages: pages.reduce((total, page) => total + page.imageCount, 0),
    totalImagesMissingAlt: 8,
    pagesWithNoCTA: pages.filter(
      (page) => !page.actionSummary.hasDetectedActionLinks,
    ).length,
    pagesWithDetectedActionLinks: pages.filter(
      (page) => page.actionSummary.hasDetectedActionLinks,
    ).length,
    pagesWithAssessedPrimaryCta: pages.length,
    pagesWithClearPrimaryCta: pages.filter(
      (page) => page.actionSummary.primaryCtaAssessment.clarity === "CLEAR",
    ).length,
    pagesWithCtaNeedsImprovement: pages.filter(
      (page) =>
        page.actionSummary.primaryCtaAssessment.clarity ===
        "NEEDS_IMPROVEMENT",
    ).length,
    pagesWithUncertainPrimaryCta: pages.filter(
      (page) =>
        page.actionSummary.primaryCtaAssessment.clarity === "UNCERTAIN",
    ).length,
    importantPagesFound: [
      "Homepage",
      "Menu",
      "Order / Takeout",
      "Store / Gift Cards",
      "Products",
      "FAQ",
    ],
    importantPagesMissing: [],
    discoveredImportantPages: importantPages,
    scannedImportantPages: importantPages,
    skippedImportantPages: [],
    missingImportantPageTypes: [],
    duplicateUrlsSkipped: 1,
    crawlLimitUsed: 10,
    crawlLimitReached: false,
    businessTypeUsed: "general",
    pageResults: pages,
    thinPages: [],
    duplicateContentGroups: [],
    copyQualityFindings: [],
    orderingFrictionPages: [],
    warnings: [],
  };

  report.seo = {
    ...report.seo!,
    score: 66,
    titleStatus: "too_short",
    titleLength: "Just Pie Orlando".length,
    metaDescriptionStatus: "missing",
    metaDescriptionLength: 0,
    h1Status: "good",
    seoWarnings: [
      "Four analyzed pages are missing meta descriptions.",
      "The Menu page has no H1.",
    ],
    seoStrengths: [
      "The homepage has exactly one H1.",
      "robots.txt and sitemap.xml were found.",
    ],
    recommendedFixes: [
      "Write page-specific meta descriptions for the four affected pages.",
      "Add one descriptive H1 to the Menu page.",
    ],
  };

  report.findings = groupFindings(findings);
  report.recommendations = {
    primary: recommendations.slice(0, 3),
    technical: recommendations.slice(3),
    all: recommendations,
    completed: 0,
    total: recommendations.length,
  };
  report.nextMoves = recommendations.slice(0, 3).map((item) => ({
    title: item.title,
    whyItMatters: item.businessRelevance,
    expectedOutcome:
      item.category === ScoreCategory.SEO
        ? "Important pages communicate more clearly to visitors and search engines."
        : "Visitors can identify and complete the next step more easily.",
    evidence: item.evidenceSummary,
    implementationAction: item.description,
    category: item.category,
    effort: item.estimatedEffort,
    impact: item.expectedImpact,
  }));
  report.progress = {
    comparison: {
      previousAuditId: null,
      currentAuditId: report.audit.id,
      overallScoreChange: null,
      categoryScoreChanges: [],
      improvedCategories: [],
      declinedCategories: [],
      unchangedCategories: [],
      newFindings: findings,
      resolvedFindings: [],
      newRecommendations: recommendations.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        status: item.status,
        completedAt: null,
      })),
      completedRecommendationsSincePrevious: [],
      summary:
        "This is the first audit. Future audits will compare the same saved evidence fields and explain any coverage changes.",
      methodologyChanged: false,
      comparisonNote: null,
    },
    previousScore: null,
    currentScore: report.audit.overallScore,
    note:
      "This is the first audit. Future comparisons will separate evidence changes from task completion.",
  };
  report.scoringMetadata = {
    ...report.scoringMetadata,
    reportViewModelVersion: CANONICAL_AUDIT_REPORT_VERSION,
    pagesScanned: pages.length,
    crawlLimit: 10,
    crawlStatus: "full",
    generatedAt: auditDate.toISOString(),
  };
  report.evidenceIntegrity = {
    ...report.evidenceIntegrity,
    contractVersion: EVIDENCE_CONTRACT_VERSION,
    generatedAt: auditDate.toISOString(),
    evidence,
    scoreBreakdowns: [],
    canonicalRecommendations: [],
    sourceVersions: {
      ...report.evidenceIntegrity.sourceVersions,
      report: CANONICAL_AUDIT_REPORT_VERSION,
      website: "website-analyzer-v2",
      crawler: "website-crawler-v2",
      seo: "seo-analyzer-v2",
    },
  };

  report.normalizedFacts = buildNormalizedAuditFacts({
    website: report.website,
    websiteCrawl: report.websiteCrawl,
    seo: report.seo,
    social: report.social,
    reviews: report.reviews,
    selectiveAi: null,
    businessProfiles: [
      {
        platform: ProfilePlatform.WEBSITE,
        status: BusinessProfileStatus.CONFIRMED,
      },
    ],
    businessContext: {
      name: report.business.name,
      description: report.business.context.description,
      targetAudience: report.business.context.targetAudience,
      mainOffer: report.business.context.mainOffer,
      industry: report.business.context.industry,
      businessType: report.business.context.businessType,
      primaryConversionGoal:
        report.business.context.observedPrimaryConversionGoal,
      brandTone: report.business.context.brandTone,
    },
    competitorConfigured: false,
    competitorAnalyzed: false,
    scoreValues: Object.fromEntries(
      report.scores.flatMap((item) =>
        item.score === null ? [] : [[item.category, item.score]],
      ),
    ),
    generatedAt: auditDate.toISOString(),
  });
  report.coverage = report.normalizedFacts.coverage;
  report.confidence = {
    ...report.confidence,
    pagesScanned: pages.length,
    crawlLimit: 10,
    crawlStatus: "full",
    importantPagesIncluded: report.websiteCrawl.importantPagesFound,
    limitations: [
      "The audit used a controlled six-page crawl and static page evidence.",
      "Private sales, analytics, and individual social-post performance were not analyzed.",
    ],
  };
  report.technicalAppendix = {
    ...report.technicalAppendix,
    detectedActionLinks: homepageActions.rawCandidates,
    pagesWithNoDetectedActionLinks: report.websiteCrawl.pagesWithNoCTA,
    pagesWithDetectedActionLinks:
      report.websiteCrawl.pagesWithDetectedActionLinks,
    pagesWithAssessedPrimaryCta:
      report.websiteCrawl.pagesWithAssessedPrimaryCta,
    pagesWithStructurallyClearPrimaryCta:
      report.websiteCrawl.pagesWithClearPrimaryCta,
    homepagePrimaryCtaAssessment: homepageActions.primaryCtaAssessment,
    duplicateUrlVariantsSkipped: 1,
    pageResults: pages,
    pageSelection: selectReportCrawlPages(pages),
    findings,
  };

  return report;
}

function createPages(): CrawledPageResult[] {
  const homepageActions = classifyWebsiteActions({
    businessKind: "general",
    candidates: [
      {
        label: "Order Inquiries",
        href: pageUrls.order,
        domLocation: "main",
        buttonLike: true,
      },
      {
        label: "Contact Us",
        href: "mailto:orders@justpieorlando.example",
        domLocation: "main",
      },
      {
        label: "Instagram",
        href: "https://instagram.com/justpieorlando",
        domLocation: "footer",
      },
    ],
  });
  const orderActions = classifyWebsiteActions({
    businessKind: "general",
    candidates: [
      {
        label: "Email your order",
        href: "mailto:orders@justpieorlando.example",
        domLocation: "main",
        buttonLike: true,
      },
    ],
  });
  const merchandiseActions = classifyWebsiteActions({
    businessKind: "ecommerce",
    candidates: [
      {
        label: "Shop merchandise",
        href: `${pageUrls.merchandise}#products`,
        domLocation: "main",
        buttonLike: true,
      },
    ],
  });

  return [
    page({
      url: homepageUrl,
      requestedUrl: "https://justpieorlando.example",
      finalUrl: homepageUrl,
      title: "Just Pie Orlando",
      metaDescription: null,
      h1Text: ["Handcrafted pie pockets in Orlando"],
      images: 5,
      missingAlt: 0,
      actions: homepageActions,
      pageTypes: ["Homepage"],
      contentExcerpt:
        "Founded by an Orlando home baker, Just Pie Orlando creates handcrafted pie pockets for preorder. Contact Us for pickup or local delivery.",
      contactSignals: ["Contact Us", "Email orders"],
      score: 74,
    }),
    page({
      url: pageUrls.menu,
      title: "Pie Pocket Menu | Just Pie Orlando",
      metaDescription: null,
      h1Text: [],
      images: 6,
      missingAlt: 0,
      actions: classifyWebsiteActions({
        businessKind: "general",
        candidates: [
          {
            label: "Order Inquiries",
            href: pageUrls.order,
            domLocation: "main",
          },
        ],
      }),
      pageTypes: ["Menu"],
      contentExcerpt:
        "Browse current pie pocket flavors, sizes, and seasonal availability.",
      score: 62,
    }),
    page({
      url: pageUrls.order,
      title: "Order Inquiries | Just Pie Orlando",
      metaDescription:
        "Send your pie pocket preorder details for Orlando pickup or local delivery.",
      h1Text: ["Order Inquiries"],
      images: 1,
      missingAlt: 0,
      actions: orderActions,
      pageTypes: ["Order"],
      contentExcerpt:
        "Email your flavor, quantity, requested date, and pickup or delivery preference.",
      contactSignals: ["Email your order"],
      score: 78,
    }),
    page({
      url: pageUrls.merchandise,
      title: "Merchandise Shop | Just Pie Orlando",
      metaDescription: null,
      h1Text: ["Just Pie Orlando Merchandise"],
      images: 13,
      missingAlt: 8,
      actions: merchandiseActions,
      pageTypes: ["Store", "Products"],
      contentExcerpt:
        "Shop Just Pie Orlando shirts, mugs, and locally inspired merchandise.",
      score: 56,
    }),
    page({
      url: pageUrls.product,
      title: "Apple Pie Pocket | Just Pie Orlando",
      metaDescription:
        "A handcrafted apple pie pocket available by preorder in Orlando.",
      h1Text: ["Apple Pie Pocket"],
      images: 3,
      missingAlt: 0,
      actions: classifyWebsiteActions({
        businessKind: "general",
        candidates: [
          {
            label: "Order this flavor",
            href: pageUrls.order,
            domLocation: "main",
          },
        ],
      }),
      pageTypes: ["Product"],
      contentExcerpt:
        "A seasonal apple pie pocket available through local preorder.",
      score: 82,
    }),
    page({
      url: pageUrls.faq,
      title: "Frequently Asked Questions | Just Pie Orlando",
      metaDescription: null,
      h1Text: ["Frequently Asked Questions"],
      images: 0,
      missingAlt: 0,
      actions: classifyWebsiteActions({
        businessKind: "general",
        candidates: [],
      }),
      pageTypes: ["FAQ"],
      contentExcerpt:
        "Answers about preorder timing, pickup, local delivery, ingredients, and storage.",
      score: 72,
    }),
  ];
}

function page({
  url,
  requestedUrl,
  finalUrl,
  title,
  metaDescription,
  h1Text,
  images,
  missingAlt,
  actions,
  pageTypes,
  contentExcerpt,
  contactSignals = [],
  score,
}: {
  url: string;
  requestedUrl?: string;
  finalUrl?: string;
  title: string;
  metaDescription: string | null;
  h1Text: string[];
  images: number;
  missingAlt: number;
  actions: CrawledPageResult["actionSummary"];
  pageTypes: string[];
  contentExcerpt: string;
  contactSignals?: string[];
  score: number;
}): CrawledPageResult {
  return {
    url,
    requestedUrl,
    finalUrl,
    statusCode: 200,
    analysisStatus: "ANALYZED",
    title,
    metaDescription,
    h1Count: h1Text.length,
    h1Text,
    hasCanonical: true,
    hasViewportMeta: true,
    imageCount: images,
    imagesMissingAltCount: missingAlt,
    internalLinksCount: 6,
    externalLinksCount: 0,
    ctaCandidates: actions.detectedActionLinks.map((item) => item.label),
    actionSummary: actions,
    wordCount: 180,
    mainContentWordCount: 140,
    warnings: [],
    score,
    pageTypes,
    hasContactInfo: contactSignals.length > 0,
    contactSignals,
    detectedAddress: null,
    detectedPhone: null,
    detectedGoogleMapsLinks: [],
    detectedMapEmbeds: [],
    detectedLocalBusinessSchema: [],
    operatingHoursSignals: [],
    contentExcerpt,
  };
}

function createEvidence(): AuditEvidenceRecord[] {
  const observedAt = auditDate.toISOString();
  const records: AuditEvidenceRecord[] = [];
  const add = ({
    key,
    type,
    category,
    url,
    page,
    observedValue,
    interpretedValue,
    explanation,
    issueKey,
    confidence = "HIGH",
  }: {
    key: string;
    type: AuditEvidenceType;
    category: ScoreCategory;
    url: string;
    page: string;
    observedValue: unknown;
    interpretedValue: unknown;
    explanation: string;
    issueKey: string;
    confidence?: "HIGH" | "MEDIUM" | "LOW";
  }) => {
    records.push({
      id: stableEvidenceId("just-pie", key, url),
      type,
      category,
      source:
        type === "PRIMARY_CTA_ASSESSED"
          ? "website_analyzer"
          : "website_crawler",
      sourceUrl: url,
      sourcePage: page,
      sourcePath: `websiteCrawl.pageResults.${key}`,
      observedValue,
      interpretedValue,
      confidence,
      applicability: "APPLICABLE",
      observedAt,
      analyzerVersion: "just-pie-regression-v1",
      explanation,
      issueKeys: [issueKey],
    });
  };

  [
    [pageUrls.homepage, "Homepage"],
    [pageUrls.menu, "Menu"],
    [pageUrls.merchandise, "Merchandise Shop"],
    [pageUrls.faq, "FAQ"],
  ].forEach(([url, pageName], index) =>
    add({
      key: `meta-${index}`,
      type: "META_DESCRIPTION_LENGTH",
      category: ScoreCategory.SEO,
      url,
      page: pageName,
      observedValue: 0,
      interpretedValue: "MISSING",
      explanation: `${pageName} has no meta description in the analyzed HTML.`,
      issueKey: rootCauses.meta,
    }),
  );
  add({
    key: "menu-h1",
    type: "H1_COUNT",
    category: ScoreCategory.SEO,
    url: pageUrls.menu,
    page: "Menu",
    observedValue: 0,
    interpretedValue: "MISSING",
    explanation: "The analyzed Menu page has no H1 heading.",
    issueKey: rootCauses.h1,
  });
  add({
    key: "merch-alt",
    type: "IMAGE_ALT_COVERAGE",
    category: ScoreCategory.WEBSITE,
    url: pageUrls.merchandise,
    page: "Merchandise Shop",
    observedValue: { imageCount: 13, imagesMissingAltCount: 8 },
    interpretedValue: "8_OF_13_MISSING_ALT",
    explanation:
      "The Merchandise Shop contains 13 images; 8 are missing alt text.",
    issueKey: rootCauses.alt,
  });
  add({
    key: "homepage-title",
    type: "PAGE_TITLE_LENGTH",
    category: ScoreCategory.SEO,
    url: pageUrls.homepage,
    page: "Homepage",
    observedValue: { title: "Just Pie Orlando", length: 16 },
    interpretedValue: "PRESENT_BUT_NOT_DESCRIPTIVE",
    explanation:
      "The homepage title exists, but it only names the business and does not describe the preorder offer.",
    issueKey: rootCauses.title,
    confidence: "MEDIUM",
  });
  add({
    key: "homepage-cta",
    type: "PRIMARY_CTA_ASSESSED",
    category: ScoreCategory.WEBSITE,
    url: pageUrls.homepage,
    page: "Homepage",
    observedValue: {
      detectedActions: ["Order Inquiries", "Contact Us"],
      primaryCtaClarity: "NEEDS_IMPROVEMENT",
    },
    interpretedValue: "ACTION_PATH_EXISTS_BUT_HIERARCHY_CAN_IMPROVE",
    explanation:
      "Order and contact actions were detected, but the saved structural assessment did not identify one clearly dominant next step.",
    issueKey: rootCauses.cta,
    confidence: "MEDIUM",
  });
  add({
    key: "homepage-contact",
    type: "CONTACT_SIGNAL",
    category: ScoreCategory.WEBSITE,
    url: pageUrls.homepage,
    page: "Homepage",
    observedValue: ["Contact Us", "Email orders"],
    interpretedValue: "CONTACT_PATH_PRESENT",
    explanation:
      "The homepage provides a contact and order-inquiry path even without a separate storefront.",
    issueKey: rootCauses.contact,
  });
  return records;
}

function createFindings(
  evidence: AuditEvidenceRecord[],
): ReportFinding[] {
  const ids = (rootCauseKey: string) =>
    evidence
      .filter((item) => item.issueKeys.includes(rootCauseKey))
      .map((item) => item.id);
  return [
    finding({
      id: "finding-just-pie-meta",
      title: "Four important pages are missing meta descriptions",
      description:
        "Four pages are affected: Homepage, Menu, Merchandise Shop, and FAQ each have no meta description in the analyzed HTML.",
      category: ScoreCategory.SEO,
      severity: FindingSeverity.HIGH,
      type: "VERIFIED_TECHNICAL_ISSUE",
      rootCauseKey: rootCauses.meta,
      urls: [
        pageUrls.homepage,
        pageUrls.menu,
        pageUrls.merchandise,
        pageUrls.faq,
      ],
      evidenceIds: ids(rootCauses.meta),
      whyItMatters:
        "Useful page descriptions can make search listings clearer and more relevant.",
      action:
        "Write a distinct description for the preorder offer, menu, merchandise, and FAQ pages.",
      completionCriteria:
        "Each of the four affected pages has a unique, accurate meta description.",
      verificationMethod:
        "Rerun the audit and confirm that all four pages return a non-empty meta description.",
      specialist: "SEO specialist or website editor",
    }),
    finding({
      id: "finding-just-pie-title",
      title: "The homepage title could describe the offer more clearly",
      description:
        'The title "Just Pie Orlando" exists, but it does not mention pie pockets, preorder, or Orlando pickup and delivery.',
      category: ScoreCategory.SEO,
      severity: FindingSeverity.MEDIUM,
      type: "VERIFIED_TECHNICAL_ISSUE",
      rootCauseKey: rootCauses.title,
      urls: [pageUrls.homepage],
      evidenceIds: ids(rootCauses.title),
      whyItMatters:
        "A more descriptive title can help people and search engines understand the page before they visit.",
      action:
        "Keep the business name and add a concise description of the local preorder offer.",
      completionCriteria:
        "The homepage title includes the business name and a truthful description of the main offer.",
      verificationMethod:
        "Rerun the audit and review the saved homepage title.",
      specialist: "SEO specialist or website editor",
    }),
    finding({
      id: "finding-just-pie-h1",
      title: "The Menu page is missing a main heading",
      description: "The analyzed Menu page has an H1 count of 0.",
      category: ScoreCategory.SEO,
      severity: FindingSeverity.HIGH,
      type: "VERIFIED_TECHNICAL_ISSUE",
      rootCauseKey: rootCauses.h1,
      urls: [pageUrls.menu],
      evidenceIds: ids(rootCauses.h1),
      whyItMatters:
        "A clear page heading helps customers scan the menu and helps search engines understand its main topic.",
      action: "Add one descriptive H1 to the Menu page.",
      completionCriteria: "The Menu page has exactly one descriptive H1.",
      verificationMethod:
        "Rerun the audit and confirm the Menu page H1 count is 1.",
      specialist: "Website editor or SEO specialist",
    }),
    finding({
      id: "finding-just-pie-cta",
      title: "The homepage order path could be easier to prioritize",
      description:
        "Order Inquiries and Contact Us were detected, but the saved structural assessment did not identify one clearly dominant primary action.",
      category: ScoreCategory.WEBSITE,
      severity: FindingSeverity.MEDIUM,
      type: "VERIFIED_TECHNICAL_ISSUE",
      rootCauseKey: rootCauses.cta,
      urls: [pageUrls.homepage],
      evidenceIds: ids(rootCauses.cta),
      whyItMatters:
        "Customers should be able to move from product interest to a preorder inquiry without guessing which action to choose.",
      action:
        "Make Order Inquiries the visually primary action while keeping Contact Us available.",
      completionCriteria:
        "The homepage presents one visually primary preorder action near the main offer.",
      verificationMethod:
        "Review the rendered homepage and rerun the structural CTA assessment.",
      specialist: "Conversion designer or website editor",
    }),
    finding({
      id: "finding-just-pie-alt",
      title: "Eight merchandise images are missing alt text",
      description:
        "The Merchandise Shop contains 13 images, and 8 are missing alt text. The Order Inquiries page has 0 images missing alt text.",
      category: ScoreCategory.WEBSITE,
      severity: FindingSeverity.MEDIUM,
      type: "VERIFIED_TECHNICAL_ISSUE",
      rootCauseKey: rootCauses.alt,
      urls: [pageUrls.merchandise],
      evidenceIds: ids(rootCauses.alt),
      whyItMatters:
        "Accurate alt text supports accessibility and helps describe meaningful product images when they cannot be seen.",
      action:
        "Add concise, factual alt text to the eight affected merchandise images.",
      completionCriteria:
        "All meaningful merchandise images have accurate alt text; decorative images use empty alt attributes.",
      verificationMethod:
        "Rerun the audit and confirm the Merchandise Shop missing-alt count is 0.",
      specialist: "Website editor or accessibility specialist",
    }),
    finding({
      id: "finding-just-pie-contact-strength",
      title: "A usable contact and preorder path is present",
      description:
        "The homepage includes Contact Us and Order Inquiries actions, so a separate Contact page is not required to prove that customers can reach the business.",
      category: ScoreCategory.WEBSITE,
      severity: FindingSeverity.INFO,
      type: "VERIFIED_STRENGTH",
      rootCauseKey: rootCauses.contact,
      urls: [pageUrls.homepage],
      evidenceIds: ids(rootCauses.contact),
      whyItMatters:
        "Customers have a visible way to ask questions and begin a preorder.",
      action: null,
      completionCriteria: null,
      verificationMethod: null,
      specialist: null,
    }),
  ];
}

function finding({
  id,
  title,
  description,
  category,
  severity,
  type,
  rootCauseKey,
  urls,
  evidenceIds,
  whyItMatters,
  action,
  completionCriteria,
  verificationMethod,
  specialist,
}: {
  id: string;
  title: string;
  description: string;
  category: ScoreCategory;
  severity: FindingSeverity;
  type: NonNullable<ReportFinding["findingType"]>;
  rootCauseKey: string;
  urls: string[];
  evidenceIds: string[];
  whyItMatters: string;
  action: string | null;
  completionCriteria: string | null;
  verificationMethod: string | null;
  specialist: string | null;
}): ReportFinding {
  return {
    id,
    stableKey: stableEvidenceId("finding", rootCauseKey),
    rootCauseKey,
    title,
    description,
    category,
    severity,
    source: type === "AI_REVIEWED_OPPORTUNITY"
      ? "ai_reviewed_opportunity"
      : "selected_audit",
    sourceUrl: urls[0] ?? null,
    affectedUrls: urls,
    supportingEvidenceIds: evidenceIds,
    evidenceSummary: description,
    confidence: type === "AI_REVIEWED_OPPORTUNITY" ? "Medium" : "High",
    findingType: type,
    whyItMatters,
    suggestedAction: action,
    completionCriteria,
    verificationMethod,
    suggestedSpecialistCategory: specialist,
  };
}

function createRecommendations(
  findings: ReportFinding[],
  evidence: AuditEvidenceRecord[],
): ReportRecommendation[] {
  const byRoot = new Map(findings.map((item) => [item.rootCauseKey, item]));
  const recommendation = ({
    id,
    rootCauseKey,
    title,
    description,
    priority,
    effort,
    impact,
    technical,
  }: {
    id: string;
    rootCauseKey: string;
    title: string;
    description: string;
    priority: RecommendationPriority;
    effort: "Low" | "Medium" | "High";
    impact: "Low" | "Medium" | "High";
    technical: boolean;
  }): ReportRecommendation => {
    const sourceFinding = byRoot.get(rootCauseKey)!;
    const evidenceIds = evidence
      .filter((item) => item.issueKeys.includes(rootCauseKey))
      .map((item) => item.id);
    return {
      id,
      rootCauseKey,
      issueKey: rootCauseKey,
      title,
      description,
      category: sourceFinding.category,
      priority,
      status: RecommendationStatus.TODO,
      estimatedEffort: effort,
      expectedImpact: impact,
      sourceCategory:
        sourceFinding.category === ScoreCategory.SEO ? "SEO" : "Website",
      sourceFindingId: sourceFinding.id,
      evidenceSummary: sourceFinding.description,
      businessRelevance: sourceFinding.whyItMatters ?? "",
      confidence: sourceFinding.confidence ?? "High",
      freshness: "Current audit",
      technical,
      sourceUrl: sourceFinding.sourceUrl,
      affectedUrls: sourceFinding.affectedUrls,
      evidenceIds,
      completionCriteria: sourceFinding.completionCriteria,
      verificationMethod: sourceFinding.verificationMethod,
      suggestedSpecialistCategory:
        sourceFinding.suggestedSpecialistCategory,
    };
  };

  return [
    recommendation({
      id: "recommendation-just-pie-title",
      rootCauseKey: rootCauses.title,
      title: "Make the homepage title more descriptive",
      description:
        "Keep Just Pie Orlando in the title and add a concise phrase describing pie-pocket preorders in Orlando.",
      priority: RecommendationPriority.HIGH,
      effort: "Low",
      impact: "High",
      technical: false,
    }),
    recommendation({
      id: "recommendation-just-pie-meta",
      rootCauseKey: rootCauses.meta,
      title: "Write page-specific meta descriptions",
      description:
        "Add unique, accurate descriptions to Homepage, Menu, Merchandise Shop, and FAQ.",
      priority: RecommendationPriority.HIGH,
      effort: "Low",
      impact: "High",
      technical: true,
    }),
    recommendation({
      id: "recommendation-just-pie-h1",
      rootCauseKey: rootCauses.h1,
      title: "Add a main heading to Menu",
      description:
        "Add one descriptive H1 that tells customers they are viewing the current pie-pocket menu.",
      priority: RecommendationPriority.HIGH,
      effort: "Medium",
      impact: "High",
      technical: true,
    }),
    recommendation({
      id: "recommendation-just-pie-cta",
      rootCauseKey: rootCauses.cta,
      title: "Prioritize the preorder action",
      description:
        "Make Order Inquiries the visually primary homepage action and keep Contact Us as a secondary path.",
      priority: RecommendationPriority.MEDIUM,
      effort: "Medium",
      impact: "High",
      technical: false,
    }),
    recommendation({
      id: "recommendation-just-pie-alt",
      rootCauseKey: rootCauses.alt,
      title: "Add alt text to merchandise images",
      description:
        "Write concise, factual alt text for the eight affected merchandise images.",
      priority: RecommendationPriority.MEDIUM,
      effort: "Medium",
      impact: "Medium",
      technical: true,
    }),
  ];
}

function groupFindings(findings: ReportFinding[]) {
  return {
    strengths: findings.filter(
      (item) => item.findingType === "VERIFIED_STRENGTH",
    ),
    warnings: findings.filter(
      (item) => item.findingType === "VERIFIED_TECHNICAL_ISSUE",
    ),
    opportunities: findings.filter(
      (item) => item.findingType === "AI_REVIEWED_OPPORTUNITY",
    ),
    all: findings,
  };
}

function importantPage(type: string, url: string, priority: number) {
  return {
    type,
    url,
    path: new URL(url).pathname,
    priority,
  } satisfies ImportantPageRecord;
}

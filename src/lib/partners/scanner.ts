import "server-only";

import { randomBytes } from "node:crypto";

import {
  PartnerProspectScanStatus,
  PartnerProspectStatus,
  type Prisma,
} from "@prisma/client";

import {
  crawlWebsite,
  type CrawledPageResult,
  type WebsiteCrawlResult,
} from "@/lib/analyzers/website-crawler";
import { normalizeWebsiteUrl } from "@/lib/analyzers/website-analyzer";
import { comparableWebsiteHostname } from "@/lib/analyzers/website-url";
import { assertPublicHttpUrl } from "@/lib/network/public-http";
import { partnerCanScan } from "@/lib/partners/partner-access-policy";
import { getPartnerProgramSettings } from "@/lib/partners/config";
import { PartnerProgramError } from "@/lib/partners/errors";
import { hashPreviewToken } from "@/lib/partners/preview-token";
import {
  PARTNER_SCANNER_MAX_FINDINGS,
  PARTNER_SCANNER_MAX_PAGES,
  PARTNER_SCANNER_VERSION,
} from "@/lib/partners/scanner-constants";
import { prisma } from "@/lib/prisma";

export type PartnerScannerFinding = {
  title: string;
  category: "Visitor clarity" | "Search readiness" | "Contact path" | "Mobile readiness" | "Accessibility";
  evidenceSummary: string;
  whyItMayMatter: string;
  confidence: "High" | "Moderate";
  scannedPageLabel: string;
};

type RankedFinding = PartnerScannerFinding & { priority: number; diversity: string };

function pageLabel(page: CrawledPageResult) {
  try {
    const pathname = new URL(page.url).pathname;
    return pathname === "/" ? "Homepage" : pathname;
  } catch {
    return "Scanned page";
  }
}

function pageCandidates(page: CrawledPageResult, isHomepage: boolean): RankedFinding[] {
  if (page.analysisStatus !== "ANALYZED") return [];
  const label = pageLabel(page);
  const candidates: RankedFinding[] = [];

  if (!page.title) {
    candidates.push({
      title: "Page title not detected",
      category: "Search readiness",
      evidenceSummary: `No HTML title was detected on ${label}.`,
      whyItMayMatter: "A descriptive title helps search results and browser tabs explain the page.",
      confidence: "High",
      scannedPageLabel: label,
      priority: isHomepage ? 20 : 35,
      diversity: "title",
    });
  } else if (page.title.length < 20 || page.title.length > 65) {
    candidates.push({
      title: "Page title length may need review",
      category: "Search readiness",
      evidenceSummary: `${label} uses a ${page.title.length}-character title.`,
      whyItMayMatter: "Very short or long titles can make the search-result message less clear.",
      confidence: "Moderate",
      scannedPageLabel: label,
      priority: isHomepage ? 45 : 65,
      diversity: "title",
    });
  }

  if (!page.metaDescription) {
    candidates.push({
      title: "Meta description not detected",
      category: "Search readiness",
      evidenceSummary: `No meta description was detected on ${label}.`,
      whyItMayMatter: "A useful description can improve how the page is presented in search results.",
      confidence: "High",
      scannedPageLabel: label,
      priority: isHomepage ? 28 : 48,
      diversity: "meta",
    });
  } else if (page.metaDescription.length > 170) {
    candidates.push({
      title: "Meta description is unusually long",
      category: "Search readiness",
      evidenceSummary: `${label} uses a ${page.metaDescription.length}-character meta description.`,
      whyItMayMatter: "A more concise description can communicate the main value before search interfaces truncate it.",
      confidence: "Moderate",
      scannedPageLabel: label,
      priority: 68,
      diversity: "meta",
    });
  }

  if (page.h1Count === 0) {
    candidates.push({
      title: `${isHomepage ? "Homepage" : "Page"} heading not detected`,
      category: "Visitor clarity",
      evidenceSummary: `A clear H1 was not detected on ${label}.`,
      whyItMayMatter: "A descriptive primary heading can help visitors and search engines understand the page's main purpose.",
      confidence: "High",
      scannedPageLabel: label,
      priority: isHomepage ? 10 : 38,
      diversity: "heading",
    });
  } else if (page.h1Count > 1) {
    candidates.push({
      title: "Multiple primary headings detected",
      category: "Visitor clarity",
      evidenceSummary: `${label} contains ${page.h1Count} H1 elements.`,
      whyItMayMatter: "One clearly prioritized page heading can make the main message easier to follow.",
      confidence: "High",
      scannedPageLabel: label,
      priority: isHomepage ? 34 : 55,
      diversity: "heading",
    });
  }

  if (isHomepage && !page.actionSummary.hasDetectedActionLinks) {
    candidates.push({
      title: "Primary visitor action was not detected",
      category: "Visitor clarity",
      evidenceSummary: "The static homepage HTML did not expose a clearly labeled contact, booking, purchase, or signup action link.",
      whyItMayMatter: "Visitors benefit from a direct next step, although visual or script-rendered controls may require manual review.",
      confidence: "Moderate",
      scannedPageLabel: label,
      priority: 5,
      diversity: "action",
    });
  }

  if (!page.hasViewportMeta) {
    candidates.push({
      title: "Mobile viewport setting not detected",
      category: "Mobile readiness",
      evidenceSummary: `No viewport meta tag was detected on ${label}.`,
      whyItMayMatter: "The viewport setting helps browsers size pages correctly on mobile devices.",
      confidence: "High",
      scannedPageLabel: label,
      priority: isHomepage ? 22 : 58,
      diversity: "mobile",
    });
  }

  if (page.imageCount >= 4 && page.imagesMissingAltCount / page.imageCount >= 0.5) {
    candidates.push({
      title: "Image alt coverage is limited",
      category: "Accessibility",
      evidenceSummary: `${page.imagesMissingAltCount} of ${page.imageCount} images on ${label} did not have non-empty alt text.`,
      whyItMayMatter: "Useful alt text can improve accessibility and help explain meaningful images.",
      confidence: "High",
      scannedPageLabel: label,
      priority: 62,
      diversity: "alt",
    });
  }

  return candidates;
}

export function selectPartnerScannerFindings(
  crawl: WebsiteCrawlResult,
): PartnerScannerFinding[] {
  const candidates = crawl.pageResults.flatMap((page, index) =>
    pageCandidates(page, index === 0),
  );
  if (
    crawl.successfulPages > 0 &&
    !crawl.scannedImportantPages.some((page) => page.type === "Contact") &&
    !crawl.skippedImportantPages.some((page) => page.type === "Contact") &&
    !crawl.pageResults.some((page) => page.hasContactInfo)
  ) {
    candidates.push({
      title: "Clear contact path was not detected",
      category: "Contact path",
      evidenceSummary: `The ${crawl.successfulPages} analyzed page${crawl.successfulPages === 1 ? "" : "s"} did not expose a dedicated contact page or visible contact signal in static HTML.`,
      whyItMayMatter: "A direct contact path can reduce friction for people ready to ask a question or buy.",
      confidence: "Moderate",
      scannedPageLabel: "Crawl summary",
      priority: 18,
      diversity: "contact",
    });
  }

  const chosen: PartnerScannerFinding[] = [];
  const diversity = new Set<string>();
  for (const candidate of candidates.sort((a, b) => a.priority - b.priority)) {
    if (chosen.length >= PARTNER_SCANNER_MAX_FINDINGS) break;
    if (diversity.has(candidate.diversity)) continue;
    diversity.add(candidate.diversity);
    chosen.push({
      title: candidate.title,
      category: candidate.category,
      evidenceSummary: candidate.evidenceSummary,
      whyItMayMatter: candidate.whyItMayMatter,
      confidence: candidate.confidence,
      scannedPageLabel: candidate.scannedPageLabel,
    });
  }
  return chosen;
}

export function buildPartnerOutreachSummary(
  findings: PartnerScannerFinding[],
  businessName?: string | null,
) {
  if (findings.length === 0) {
    return "The lightweight public scan did not produce a high-confidence outreach finding. Review the business manually before making any claim.";
  }
  const topics = findings.map((finding) => finding.title.toLowerCase());
  return `I reviewed ${businessName ? `${businessName}'s` : "the"} public website and found ${findings.length === 1 ? "one area" : "a few areas"} that may be worth reviewing, including ${topics.join(", ")}. These observations use public static website evidence rather than private analytics.`;
}

function storedScannerFindings(value: unknown): PartnerScannerFinding[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is PartnerScannerFinding =>
      Boolean(
        item &&
          typeof item === "object" &&
          "title" in item &&
          typeof item.title === "string" &&
          "category" in item &&
          typeof item.category === "string" &&
          "evidenceSummary" in item &&
          typeof item.evidenceSummary === "string" &&
          "whyItMayMatter" in item &&
          typeof item.whyItMayMatter === "string" &&
          "confidence" in item &&
          typeof item.confidence === "string" &&
          "scannedPageLabel" in item &&
          typeof item.scannedPageLabel === "string",
      ),
  );
}

function usagePeriods(now: Date) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return { date, month };
}

async function claimScannerRequest(partnerId: string, now: Date) {
  const { date, month } = usagePeriods(now);
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-scan-usage:${partnerId}`}))`;
    const partner = await transaction.partnerProfile.findUnique({ where: { id: partnerId } });
    const settings = await transaction.partnerProgramSettings.findUnique({ where: { key: "default" } });
    if (!partner || !settings || !settings.enabled || !settings.scannerEnabled || !partnerCanScan(partner)) {
      throw new PartnerProgramError("Partner Scanner is unavailable for this account.", "SCANNER_UNAVAILABLE", 403);
    }
    const [dayUsage, monthUsage] = await Promise.all([
      transaction.partnerScannerUsage.findUnique({
        where: { partnerId_usageDate: { partnerId, usageDate: date } },
      }),
      transaction.partnerScannerUsage.aggregate({
        where: { partnerId, usageMonth: month },
        _sum: { scanRequests: true },
      }),
    ]);
    if ((dayUsage?.scanRequests ?? 0) >= partner.scannerDailyLimit) {
      throw new PartnerProgramError("The daily scanner limit has been reached.", "SCANNER_DAILY_LIMIT", 429);
    }
    if ((monthUsage._sum.scanRequests ?? 0) >= partner.scannerMonthlyLimit) {
      throw new PartnerProgramError("The monthly scanner limit has been reached.", "SCANNER_MONTHLY_LIMIT", 429);
    }
    await transaction.partnerScannerUsage.upsert({
      where: { partnerId_usageDate: { partnerId, usageDate: date } },
      create: { partnerId, usageDate: date, usageMonth: month, scanRequests: 1 },
      update: { scanRequests: { increment: 1 } },
    });
    return { partner, settings, date };
  });
}

async function updateUsage(
  partnerId: string,
  usageDate: Date,
  data: Prisma.PartnerScannerUsageUpdateInput,
) {
  await prisma.partnerScannerUsage.update({
    where: { partnerId_usageDate: { partnerId, usageDate } },
    data,
  });
}

async function claimDomainScan(input: {
  cacheKey: string;
  normalizedDomain: string;
  websiteUrl: string;
  expiresAt: Date;
  now: Date;
}) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`partner-domain-scan:${input.cacheKey}`}))`;
    const existing = await transaction.partnerProspectScan.findUnique({
      where: { cacheKey: input.cacheKey },
    });
    if (
      existing?.status === PartnerProspectScanStatus.COMPLETED &&
      existing.expiresAt > input.now
    ) {
      return { kind: "cached" as const, scan: existing };
    }
    const activeSince = new Date(input.now.getTime() - 10 * 60 * 1_000);
    if (
      existing?.status === PartnerProspectScanStatus.RUNNING &&
      existing.startedAt &&
      existing.startedAt >= activeSince
    ) {
      return { kind: "running" as const, scan: existing };
    }

    const scan = await transaction.partnerProspectScan.upsert({
      where: { cacheKey: input.cacheKey },
      create: {
        cacheKey: input.cacheKey,
        normalizedDomain: input.normalizedDomain,
        websiteUrl: input.websiteUrl,
        scannerVersion: PARTNER_SCANNER_VERSION,
        status: PartnerProspectScanStatus.RUNNING,
        startedAt: input.now,
        expiresAt: input.expiresAt,
      },
      update: {
        websiteUrl: input.websiteUrl,
        status: PartnerProspectScanStatus.RUNNING,
        startedAt: input.now,
        completedAt: null,
        expiresAt: input.expiresAt,
        errorCode: null,
      },
    });
    return { kind: "claimed" as const, scan };
  });
}

export async function runPartnerProspectScan(input: {
  partnerId: string;
  websiteUrl: string;
  businessName?: string;
}) {
  const started = Date.now();
  const now = new Date();
  const normalizedUrl = normalizeWebsiteUrl(input.websiteUrl);
  await assertPublicHttpUrl(normalizedUrl);
  const url = new URL(normalizedUrl);
  const normalizedDomain = comparableWebsiteHostname(url.hostname);
  const { settings, date: usageDate } = await claimScannerRequest(input.partnerId, now);
  const cacheKey = `${normalizedDomain}:${PARTNER_SCANNER_VERSION}`;

  const expiresAt = new Date(
    now.getTime() + settings.scanCacheDays * 24 * 60 * 60 * 1_000,
  );
  const claim = await claimDomainScan({
    cacheKey,
    normalizedDomain,
    websiteUrl: normalizedUrl,
    expiresAt,
    now,
  });
  if (claim.kind === "cached") {
    const cachedFindings = storedScannerFindings(claim.scan.findings);
    const safeOutreachSummary = buildPartnerOutreachSummary(
      cachedFindings,
      null,
    );
    const cached =
      claim.scan.outreachSummary === safeOutreachSummary
        ? claim.scan
        : await prisma.partnerProspectScan.update({
            where: { id: claim.scan.id },
            data: { outreachSummary: safeOutreachSummary },
          });
    const prospect = await prisma.partnerProspect.upsert({
      where: {
        partnerId_normalizedDomain: {
          partnerId: input.partnerId,
          normalizedDomain,
        },
      },
      create: {
        partnerId: input.partnerId,
        businessName: input.businessName?.trim().slice(0, 160) || null,
        websiteUrl: cached.websiteUrl,
        normalizedDomain,
        status: PartnerProspectStatus.SCANNED,
        latestScanId: cached.id,
      },
      update: {
        businessName: input.businessName?.trim().slice(0, 160) || undefined,
        websiteUrl: cached.websiteUrl,
        status: PartnerProspectStatus.SCANNED,
        latestScanId: cached.id,
      },
    });
    await updateUsage(input.partnerId, usageDate, { cachedScans: { increment: 1 } });
    return { prospect, scan: cached, cached: true };
  }
  if (claim.kind === "running") {
    throw new PartnerProgramError("A scan for this website is already running.", "SCAN_IN_PROGRESS", 409);
  }
  const scan = claim.scan;

  try {
    const crawl = await crawlWebsite(normalizedUrl, {
      maxPages: PARTNER_SCANNER_MAX_PAGES,
      timeBudgetMs: 45_000,
    });
    const findings = selectPartnerScannerFindings(crawl);
    const outreachSummary = buildPartnerOutreachSummary(findings, null);
    const completedAt = new Date();
    const completedScan = await prisma.partnerProspectScan.update({
      where: { id: scan.id },
      data: {
        status: PartnerProspectScanStatus.COMPLETED,
        completedAt,
        expiresAt,
        pagesAttempted: crawl.pagesScanned,
        pagesScanned: crawl.successfulPages,
        findings: findings as unknown as Prisma.InputJsonValue,
        outreachSummary,
        technicalMetadata: {
          mode: "PARTNER_PROSPECT_SCAN",
          maxPages: PARTNER_SCANNER_MAX_PAGES,
          failedPages: crawl.failedPages,
          crawlLimitReached: crawl.crawlLimitReached,
          evidenceSource: "public_static_html",
          excludedSystems: [
            "OpenAI",
            "Google Places",
            "competitor analysis",
            "full audit generator",
          ],
        },
      },
    });
    const prospect = await prisma.partnerProspect.upsert({
      where: {
        partnerId_normalizedDomain: {
          partnerId: input.partnerId,
          normalizedDomain,
        },
      },
      create: {
        partnerId: input.partnerId,
        businessName: input.businessName?.trim().slice(0, 160) || null,
        websiteUrl: normalizedUrl,
        normalizedDomain,
        status: PartnerProspectStatus.SCANNED,
        latestScanId: scan.id,
      },
      update: {
        businessName: input.businessName?.trim().slice(0, 160) || undefined,
        websiteUrl: normalizedUrl,
        status: PartnerProspectStatus.SCANNED,
        latestScanId: scan.id,
      },
    });
    await updateUsage(input.partnerId, usageDate, {
      freshScans: { increment: 1 },
      pagesScanned: { increment: crawl.successfulPages },
      totalDurationMs: { increment: Date.now() - started },
    });
    return { prospect, scan: completedScan, cached: false };
  } catch (error) {
    await Promise.all([
      prisma.partnerProspectScan.update({
        where: { id: scan.id },
        data: {
          status: PartnerProspectScanStatus.FAILED,
          completedAt: new Date(),
          errorCode:
            error instanceof PartnerProgramError ? error.code : "SCAN_FAILED",
        },
      }),
      updateUsage(input.partnerId, usageDate, {
        failures: { increment: 1 },
        totalDurationMs: { increment: Date.now() - started },
      }),
    ]);
    throw error;
  }
}

export async function createPartnerProspectPreview(input: {
  partnerId: string;
  prospectId: string;
}) {
  const settings = await getPartnerProgramSettings();
  if (!settings.enabled || !settings.previewPagesEnabled) {
    throw new PartnerProgramError("Prospect previews are currently disabled.", "PREVIEWS_DISABLED", 403);
  }
  const prospect = await prisma.partnerProspect.findFirst({
    where: { id: input.prospectId, partnerId: input.partnerId },
    include: { latestScan: true },
  });
  if (!prospect?.latestScan || prospect.latestScan.status !== PartnerProspectScanStatus.COMPLETED) {
    throw new PartnerProgramError("Run a successful scan before creating a preview.", "SCAN_REQUIRED", 409);
  }
  const token = randomBytes(32).toString("base64url");
  const preview = await prisma.partnerProspectPreview.create({
    data: {
      partnerId: input.partnerId,
      prospectId: prospect.id,
      scanId: prospect.latestScan.id,
      tokenHash: hashPreviewToken(token),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
    },
  });
  return { preview, token };
}

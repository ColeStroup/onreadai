import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { AuditStatus } from "@prisma/client";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());

  const [{ prisma }, evidenceModule, reportModule] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/audits/evidence-contracts"),
    import("@/lib/reports/audit-report-view-model"),
  ]);
  const options = parseArguments(process.argv.slice(2));
  const requested = options.business || "Schooners";
  const audit = await prisma.audit.findFirst({
    where: {
      status: AuditStatus.COMPLETED,
      ...(options.audit ? { id: options.audit } : {}),
      business: {
        OR: [
          { id: requested },
          { name: { equals: requested, mode: "insensitive" } },
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      scores: true,
      findings: true,
      recommendations: true,
      business: {
        include: {
          profiles: true,
          googleBusinessProfiles: true,
          competitors: { include: { discoveredProfiles: true } },
        },
      },
    },
  });

  if (!audit) throw new Error(`Completed audit not found for ${requested}.`);
  const integrity = evidenceModule.readEvidenceIntegrity(audit.analysisSnapshot);
  const report = await reportModule.buildAuditReportViewModel({
    businessId: audit.businessId,
    auditId: audit.id,
    ownerId: audit.business.ownerId,
  });

  if (!integrity || !report) {
    throw new Error("The saved evidence contract or report view model is missing.");
  }

  const snapshot = isRecord(audit.analysisSnapshot)
    ? audit.analysisSnapshot
    : {};
  const website = isRecord(snapshot.website) ? snapshot.website : {};
  const crawl = isRecord(snapshot.websiteCrawl) ? snapshot.websiteCrawl : {};
  const seo = isRecord(snapshot.seo) ? snapshot.seo : {};
  const reviews = isRecord(snapshot.reviews) ? snapshot.reviews : {};
  const output = {
    business: { id: audit.business.id, name: audit.business.name },
    audit: {
      id: audit.id,
      createdAt: audit.createdAt,
      overallScore: audit.overallScore,
      status: audit.status,
    },
    sourceEvidence: {
      crawl: pick(crawl, [
        "pagesScanned",
        "successfulPages",
        "failedPages",
        "pagesWithNoH1",
        "pagesWithMultipleH1",
        "pagesWithDetectedActionLinks",
        "pagesWithAssessedPrimaryCta",
        "pagesWithClearPrimaryCta",
        "pagesWithCtaNeedsImprovement",
        "pagesWithUncertainPrimaryCta",
      ]),
      homepage: {
        h1Count: website.h1Count,
        metaDescriptionLength:
          typeof website.metaDescription === "string"
            ? website.metaDescription.length
            : null,
        hasCanonical: website.hasCanonical,
        actionSummary: website.actionSummary,
      },
      seo: pick(seo, ["robotsTxtStatus", "sitemapStatus"]),
      reviews: pick(reviews, [
        "googleBusinessStatus",
        "googleRating",
        "googleReviewCount",
      ]),
    },
    evidenceIntegrity: {
      contractVersion: integrity.contractVersion,
      sourceVersions: integrity.sourceVersions,
      profileCounts: integrity.profileCounts,
      validatedClaims: integrity.validatedClaims,
      canonicalRecommendations: integrity.canonicalRecommendations.map(
        (item) => ({
          issueKey: item.issueKey,
          title: item.title,
          sourceFindingId: item.sourceFindingId,
          sourceEvidenceIds: item.sourceEvidenceIds,
          evidenceTypes: item.sourceEvidenceIds.map(
            (id) => integrity.evidence.find((evidence) => evidence.id === id)?.type,
          ),
          fullEvidence: item.fullEvidence,
          reportEvidence: item.reportEvidence,
        }),
      ),
      scoreBreakdowns: integrity.scoreBreakdowns,
      dataConflicts: integrity.dataConflicts,
      validationWarnings: integrity.validationWarnings,
    },
    persistedRows: {
      scoreCount: audit.scores.length,
      findingCount: audit.findings.length,
      recommendationCount: audit.recommendations.length,
      recommendations: audit.recommendations.map((item) => ({
        id: item.id,
        title: item.title,
        category: item.category,
        sourceReferenceId: item.sourceReferenceId,
        evidence: item.evidence,
      })),
    },
    canonicalReport: {
      homepagePrimaryCtaAssessment:
        report.technicalAppendix.homepagePrimaryCtaAssessment,
      pagesWithDetectedActionLinks:
        report.technicalAppendix.pagesWithDetectedActionLinks,
      pagesWithAssessedPrimaryCta:
        report.technicalAppendix.pagesWithAssessedPrimaryCta,
      pagesWithStructurallyClearPrimaryCta:
        report.technicalAppendix.pagesWithStructurallyClearPrimaryCta,
      pageSelection: report.technicalAppendix.pageSelection,
      competitorProfileCounts: report.competitors.profileCounts,
      progress: report.progress.comparison,
      dataNotes: report.dataNotes,
      recommendationTitles: report.recommendations.all.map((item) => item.title),
    },
  };
  const outputDirectory = path.resolve(".artifacts", "reports");
  const outputPath = path.join(outputDirectory, `${audit.id}-integrity.json`);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ outputPath, ...summary(output) }, null, 2));
  await prisma.$disconnect();
}

function summary(output: Record<string, unknown>) {
  const source = output.sourceEvidence as Record<string, unknown>;
  const integrity = output.evidenceIntegrity as Record<string, unknown>;
  const report = output.canonicalReport as Record<string, unknown>;
  return {
    audit: output.audit,
    sourceEvidence: source,
    profileCounts: integrity.profileCounts,
    dataConflicts: integrity.dataConflicts,
    validationWarnings: integrity.validationWarnings,
    canonicalRecommendationTitles: (
      integrity.canonicalRecommendations as Array<Record<string, unknown>>
    ).map((item) => item.title),
    canonicalReport: report,
  };
}

function parseArguments(args: string[]) {
  const options: { business?: string; audit?: string } = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--business") {
      options.business = args[index + 1];
      index += 1;
    } else if (args[index] === "--audit") {
      options.audit = args[index + 1];
      index += 1;
    }
  }
  return options;
}

function pick(value: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

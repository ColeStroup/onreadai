import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { AuditStatus } from "@prisma/client";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());

  const [pdfModule, prismaModule, reportModule] = await Promise.all([
    import("@/lib/audits/pdf-report"),
    import("@/lib/prisma"),
    import("@/lib/reports/audit-report-view-model"),
  ]);
  const { generateGrowthAuditPdfWithDiagnostics } = pdfModule;
  const { prisma } = prismaModule;
  const { buildAuditReportViewModel } = reportModule;
  const options = parseArguments(process.argv.slice(2));
  const requested = options.business || "Schooners";
  const business = await prisma.business.findFirst({
  where: {
    OR: [{ id: requested }, { name: { equals: requested, mode: "insensitive" } }],
    audits: {
      some: {
        status: AuditStatus.COMPLETED,
        ...(options.audit ? { id: options.audit } : {}),
      },
    },
  },
  orderBy: { updatedAt: "desc" },
  select: {
    id: true,
    name: true,
    ownerId: true,
    audits: {
      where: {
        status: AuditStatus.COMPLETED,
        ...(options.audit ? { id: options.audit } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { id: true },
    },
  },
  });

  if (!business?.audits[0]) {
    throw new Error(`No completed audit found for ${requested}.`);
  }

  const report = await buildAuditReportViewModel({
    businessId: business.id,
    auditId: business.audits[0].id,
    ownerId: business.ownerId,
  });

  if (!report) {
    throw new Error("The report view model could not be built.");
  }

  const result = await generateGrowthAuditPdfWithDiagnostics(report);
  const outputDirectory = path.resolve(".artifacts", "reports");
  const outputPath = path.join(
    outputDirectory,
    `${slugify(business.name)}-${report.audit.id}.pdf`,
  );
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, result.buffer);

  console.log(
    JSON.stringify(
    {
      outputPath,
      bytes: result.buffer.length,
      pages: result.diagnostics.pages.length,
      pageUsage: result.diagnostics.pages,
      socialStrategy: {
        source: report.socialStrategy.sourceLabel,
        freshness: report.socialStrategy.freshness.status,
        reason: report.socialStrategy.freshness.reason,
      },
      competitorStatus: report.competitors.label,
      contextNeedsReview: report.business.context.needsReview,
      recommendationTitles: report.recommendations.primary.map(
        (item) => item.title,
      ),
      progress: report.progress.comparison.categoryScoreChanges.map((item) => ({
        category: item.category,
        delta: item.delta,
        type: item.changeType,
        reason: item.reason,
      })),
    },
    null,
    2,
    ),
  );

  await prisma.$disconnect();
}

function parseArguments(args: string[]) {
  const options: { business?: string; audit?: string } = {};
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--business") {
      options.business = args[index + 1];
      index += 1;
    } else if (argument === "--audit") {
      options.audit = args[index + 1];
      index += 1;
    } else {
      positional.push(argument);
    }
  }

  if (!options.business && positional.length > 0) {
    options.business = positional.join(" ");
  }
  return options;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});

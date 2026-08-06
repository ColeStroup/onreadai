import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateGrowthAuditPdf } from "@/lib/audits/pdf-report";
import {
  createReportFixture,
  type ReportFixtureKind,
} from "@/lib/reports/report-fixtures.test-support";
import { createJustPieCanonicalReportFixture } from "@/lib/reports/just-pie-report-fixture.test-support";

const fixtures: ReportFixtureKind[] = [
  "hospitality",
  "saas",
  "ecommerce",
  "local_service",
  "social_only",
  "cottage_regression",
  "no_competitor",
  "stale_strategy",
];

async function main() {
  const outputDirectory = path.resolve(".artifacts", "reports", "fixtures");
  await mkdir(outputDirectory, { recursive: true });
  const outputs = [];

  for (const fixture of fixtures) {
    const report = createReportFixture(fixture);
    const buffer = await generateGrowthAuditPdf(report);
    const outputPath = path.join(
      outputDirectory,
      `${fixture.replaceAll("_", "-")}.pdf`,
    );
    await writeFile(outputPath, buffer);
    outputs.push({ fixture, outputPath, bytes: buffer.length });
  }

  const justPieReport = createJustPieCanonicalReportFixture();
  const justPieBuffer = await generateGrowthAuditPdf(justPieReport);
  const justPieOutputPath = path.join(outputDirectory, "just-pie-orlando.pdf");
  await writeFile(justPieOutputPath, justPieBuffer);
  outputs.push({
    fixture: "just_pie_orlando",
    outputPath: justPieOutputPath,
    bytes: justPieBuffer.length,
  });

  console.log(JSON.stringify({ outputDirectory, outputs }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

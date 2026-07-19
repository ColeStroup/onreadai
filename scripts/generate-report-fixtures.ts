import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateGrowthAuditPdf } from "@/lib/audits/pdf-report";
import {
  createReportFixture,
  type ReportFixtureKind,
} from "@/lib/reports/report-fixtures.test-support";

const fixtures: ReportFixtureKind[] = [
  "hospitality",
  "saas",
  "local_service",
  "social_only",
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

  console.log(JSON.stringify({ outputDirectory, outputs }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

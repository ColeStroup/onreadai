import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());

  const [{ prisma }, runner] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/audits/audit-runner"),
  ]);
  const requested = parseBusiness(process.argv.slice(2)) || "Schooners";
  const business = await prisma.business.findFirst({
    where: {
      OR: [
        { id: requested },
        { name: { equals: requested, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });

  if (!business) {
    throw new Error(`Business not found: ${requested}`);
  }

  const pending = await runner.createPendingAuditRun(business.id);
  const result = await runner.runAuditGeneration({
    businessId: business.id,
    auditId: pending.id,
    revalidate: false,
  });

  console.log(JSON.stringify({ business, ...result }, null, 2));
  await prisma.$disconnect();

  if (result.status !== "completed") {
    process.exitCode = 1;
  }
}

function parseBusiness(args: string[]) {
  const businessFlag = args.indexOf("--business");
  if (businessFlag >= 0) return args[businessFlag + 1] ?? "";
  return args.join(" ").trim();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

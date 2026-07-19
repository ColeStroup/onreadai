import { prisma } from "@/lib/prisma";

function retentionDays() {
  const parsed = Number.parseInt(
    process.env.SECURITY_EVENT_RETENTION_DAYS ?? "31",
    10,
  );

  return Number.isFinite(parsed) ? Math.min(365, Math.max(7, parsed)) : 31;
}

async function main() {
  const cutoff = new Date(
    Date.now() - retentionDays() * 24 * 60 * 60 * 1_000,
  );

  const [rateLimits, authEvents, verificationCodes, resetTokens] =
    await prisma.$transaction([
      prisma.rateLimitEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.authSecurityEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.emailVerificationCode.deleteMany({
        where: {
          expiresAt: { lt: cutoff },
          OR: [{ consumedAt: { not: null } }, { invalidatedAt: { not: null } }],
        },
      }),
      prisma.passwordResetToken.deleteMany({
        where: {
          expiresAt: { lt: cutoff },
          OR: [{ consumedAt: { not: null } }, { invalidatedAt: { not: null } }],
        },
      }),
    ]);

  console.info(
    JSON.stringify({
      event: "security_data_pruned",
      cutoff: cutoff.toISOString(),
      rateLimitEvents: rateLimits.count,
      authSecurityEvents: authEvents.count,
      verificationCodes: verificationCodes.count,
      passwordResetTokens: resetTokens.count,
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: "security_data_prune_failed",
        error: error instanceof Error ? error.name : typeof error,
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

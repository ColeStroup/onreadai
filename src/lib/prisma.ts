import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { createPrismaPgPoolConfig } from "@/lib/database/postgres-adapter-config";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to initialize Prisma.");
}

const adapter = new PrismaPg(
  createPrismaPgPoolConfig({
    connectionString: databaseUrl,
    max: environmentInteger(
      "DATABASE_POOL_MAX",
      process.env.NODE_ENV === "production" ? 3 : 10,
    ),
    connectionTimeoutMillis: environmentInteger(
      "DATABASE_CONNECTION_TIMEOUT_MS",
      10_000,
    ),
    idleTimeoutMillis: environmentInteger(
      "DATABASE_IDLE_TIMEOUT_MS",
      10_000,
    ),
  }),
);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

globalForPrisma.prisma = prisma;

function environmentInteger(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

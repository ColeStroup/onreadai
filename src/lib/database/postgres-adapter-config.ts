import type { PoolConfig } from "pg";

const localDatabaseHosts = new Set([
  "localhost",
  "localhost.",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

const connectionStringSslParameters = new Set([
  "ssl",
  "sslcert",
  "sslkey",
  "sslmode",
  "sslrootcert",
  "uselibpqcompat",
]);

type PrismaPgPoolConfigInput = {
  connectionString: string;
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
};

export type PrismaPgPoolConfig = PoolConfig & {
  connectionString: string;
};

export function createPrismaPgPoolConfig(
  input: PrismaPgPoolConfigInput,
): PrismaPgPoolConfig {
  const databaseUrl = parseDatabaseUrl(input.connectionString);
  const configuredHost =
    databaseUrl.searchParams.get("host")?.trim().toLowerCase() ||
    databaseUrl.hostname.toLowerCase();
  const isLocalDatabase = localDatabaseHosts.has(configuredHost);

  if (!isLocalDatabase) {
    // node-postgres parses URL-level SSL options after top-level pool options.
    // Remove those overrides so the adapter's explicit Render TLS policy wins.
    for (const key of [...databaseUrl.searchParams.keys()]) {
      if (connectionStringSslParameters.has(key.toLowerCase())) {
        databaseUrl.searchParams.delete(key);
      }
    }
  }

  return {
    connectionString: isLocalDatabase
      ? input.connectionString
      : databaseUrl.toString(),
    max: input.max,
    connectionTimeoutMillis: input.connectionTimeoutMillis,
    idleTimeoutMillis: input.idleTimeoutMillis,
    ...(isLocalDatabase
      ? {}
      : {
          ssl: {
            rejectUnauthorized: false,
          },
        }),
  };
}

export function isLocalDatabaseUrl(connectionString: string) {
  const databaseUrl = parseDatabaseUrl(connectionString);
  const configuredHost =
    databaseUrl.searchParams.get("host")?.trim().toLowerCase() ||
    databaseUrl.hostname.toLowerCase();

  return localDatabaseHosts.has(configuredHost);
}

function parseDatabaseUrl(connectionString: string) {
  try {
    const databaseUrl = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
      throw new Error("Unsupported database protocol.");
    }
    return databaseUrl;
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
}

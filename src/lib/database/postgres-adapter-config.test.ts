import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "pg";

import {
  createPrismaPgPoolConfig,
  isLocalDatabaseUrl,
} from "@/lib/database/postgres-adapter-config";

const poolLimits = {
  max: 3,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
};

test("keeps local PostgreSQL connections without TLS", () => {
  const connectionString =
    "postgresql://postgres:postgres@localhost:5432/onread?schema=public";
  const config = createPrismaPgPoolConfig({
    connectionString,
    ...poolLimits,
  });

  assert.equal(isLocalDatabaseUrl(connectionString), true);
  assert.equal(config.connectionString, connectionString);
  assert.equal(config.ssl, undefined);
});

test("uses explicit non-validating TLS for remote PostgreSQL", () => {
  const config = createPrismaPgPoolConfig({
    connectionString:
      "postgresql://user:password@remote.example.com:5432/onread?schema=public",
    ...poolLimits,
  });

  assert.equal(
    (config.ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized,
    false,
  );
});

test("prevents sslmode in a remote URL from overriding adapter TLS", () => {
  const config = createPrismaPgPoolConfig({
    connectionString:
      "postgresql://user:password@remote.example.com:5432/onread?sslmode=require&schema=public",
    ...poolLimits,
  });
  const normalizedUrl = new URL(config.connectionString);
  const client = new Client(config);
  const effectiveSsl = (
    client as unknown as {
      connectionParameters: {
        ssl: boolean | { rejectUnauthorized?: boolean };
      };
    }
  ).connectionParameters.ssl;

  assert.equal(normalizedUrl.searchParams.get("sslmode"), null);
  assert.equal(normalizedUrl.searchParams.get("schema"), "public");
  assert.equal(
    typeof effectiveSsl === "object"
      ? effectiveSsl.rejectUnauthorized
      : undefined,
    false,
  );
});

test("rejects malformed database URLs without echoing credentials", () => {
  const malformed = "not-a-url-with-secret-password";

  assert.throws(
    () =>
      createPrismaPgPoolConfig({
        connectionString: malformed,
        ...poolLimits,
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message ===
        "DATABASE_URL must be a valid PostgreSQL connection URL." &&
      !error.message.includes(malformed),
  );
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  enforceRateLimit,
  hashRateLimitKey,
  RateLimitError,
} from "@/lib/security/rate-limit";

test("rate-limit keys are stable, scoped, and do not contain raw identifiers", () => {
  const identifier = "user@example.com|203.0.113.8";
  const first = hashRateLimitKey("ai-chat", [identifier]);
  const second = hashRateLimitKey("ai-chat", [identifier]);
  const otherScope = hashRateLimitKey("pdf-export", [identifier]);

  assert.equal(first, second);
  assert.notEqual(first, otherScope);
  assert.equal(first.includes(identifier), false);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("rate-limit errors expose a bounded retry interval", () => {
  const error = new RateLimitError(12);
  assert.equal(error.retryAfterSeconds, 12);
  assert.equal(error.message, "Too many requests. Please wait and try again.");
});

test(
  "distributed rate-limit claims remain bounded under concurrent requests",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const scope = `security-test-${randomUUID()}`;

    try {
      const results = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          enforceRateLimit({
            scope,
            identifiers: ["same-caller"],
            limit: 2,
            windowMs: 60_000,
          }),
        ),
      );

      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        2,
      );
      const rejection = results.find((result) => result.status === "rejected");
      assert.ok(
        rejection?.status === "rejected" &&
          rejection.reason instanceof RateLimitError,
      );
    } finally {
      await prisma.rateLimitEvent.deleteMany({ where: { scope } });
    }
  },
);

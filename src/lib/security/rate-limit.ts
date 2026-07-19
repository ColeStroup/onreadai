import "server-only";

import { createHmac } from "node:crypto";

import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many requests. Please wait and try again.");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function enforceRateLimit(input: {
  scope: string;
  identifiers: Array<string | null | undefined>;
  limit: number;
  windowMs: number;
}) {
  const scope = normalizedScope(input.scope);
  const keyHash = hashRateLimitKey(scope, input.identifiers);
  const now = new Date();
  const windowStart = new Date(now.getTime() - input.windowMs);

  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw<Array<{ lockResult: string }>>`
      SELECT pg_advisory_xact_lock(
        hashtext(${`rate-limit:${scope}:${keyHash}`})
      )::text AS "lockResult"
    `;

    const attempts = await transaction.rateLimitEvent.findMany({
      where: { scope, keyHash, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
      take: input.limit,
    });

    if (attempts.length >= input.limit) {
      return {
        allowed: false as const,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil(
            (attempts[0]!.createdAt.getTime() + input.windowMs - now.getTime()) /
              1_000,
          ),
        ),
      };
    }

    await transaction.rateLimitEvent.create({
      data: { scope, keyHash },
    });

    return { allowed: true as const, retryAfterSeconds: 0 };
  });

  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
}

export async function currentRequestRateLimitIdentifier() {
  const requestHeaders = await headers();
  const address =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    "unknown";
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 200) || "unknown";
  return `${address}|${userAgent}`;
}

export function hashRateLimitKey(
  scope: string,
  identifiers: Array<string | null | undefined>,
) {
  const value = identifiers
    .map((identifier) => identifier?.trim())
    .filter((identifier): identifier is string => Boolean(identifier))
    .join("|");

  return createHmac("sha256", rateLimitSecret())
    .update(`onread-rate-limit:v1:${scope}:${value || "unknown"}`)
    .digest("hex");
}

function rateLimitSecret() {
  const configured =
    process.env.RATE_LIMIT_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();

  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "development-rate-limit-only";
  throw new Error("RATE_LIMIT_SECRET is required in production.");
}

function normalizedScope(value: string) {
  const scope = value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "-");
  if (!scope || scope.length > 80) throw new Error("Invalid rate limit scope.");
  return scope;
}

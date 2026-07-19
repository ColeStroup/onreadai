import "server-only";

import { createHmac } from "node:crypto";

import { AuthSecurityAction } from "@prisma/client";
import { headers } from "next/headers";

import { getEmailVerificationSecret } from "@/lib/auth/secrets";
import { prisma } from "@/lib/prisma";

type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined;

export class AuthRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many requests. Please wait and try again.");
    this.name = "AuthRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function headerValue(source: HeaderSource, name: string) {
  if (!source) return "";
  if (source instanceof Headers) return source.get(name) ?? "";

  const value = source[name] ?? source[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function securityKey(kind: string, value: string) {
  return createHmac("sha256", getEmailVerificationSecret())
    .update(`auth-rate-limit:v1:${kind}:${value}`)
    .digest("hex");
}

export function authRateLimitKeys(
  source: HeaderSource,
  input: { email?: string; token?: string } = {},
) {
  const forwardedFor = headerValue(source, "x-forwarded-for")
    .split(",")[0]
    ?.trim();
  const realIp = headerValue(source, "x-real-ip").trim();
  const userAgent = headerValue(source, "user-agent").slice(0, 240);
  const networkValue = `${forwardedFor || realIp || "unknown"}|${userAgent || "unknown"}`;
  const keys = [securityKey("network", networkValue)];

  if (input.email) {
    keys.push(securityKey("email", input.email.trim().toLowerCase()));
  }
  if (input.token) {
    keys.push(securityKey("token", input.token));
  }

  return [...new Set(keys)].sort();
}

export async function currentAuthRateLimitKeys(
  input: { email?: string; token?: string } = {},
) {
  return authRateLimitKeys(await headers(), input);
}

export async function recordAuthSecurityAttempt(input: {
  action: AuthSecurityAction;
  keyHashes: string[];
  limit: number;
  windowMs: number;
  outcome?: string;
}) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - input.windowMs);
  const keyHashes = [...new Set(input.keyHashes)].sort();

  const result = await prisma.$transaction(async (transaction) => {
    for (const keyHash of keyHashes) {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${`auth-rate:${input.action}:${keyHash}`})
        )
      `;
    }

    for (const keyHash of keyHashes) {
      const attempts = await transaction.authSecurityEvent.findMany({
        where: {
          action: input.action,
          keyHash,
          createdAt: { gte: windowStart },
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });

      if (attempts.length >= input.limit) {
        const retryAt =
          attempts[0]!.createdAt.getTime() + input.windowMs;
        return {
          allowed: false as const,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((retryAt - now.getTime()) / 1_000),
          ),
        };
      }
    }

    await transaction.authSecurityEvent.createMany({
      data: keyHashes.map((keyHash) => ({
        action: input.action,
        keyHash,
        outcome: input.outcome?.slice(0, 40),
      })),
    });

    return { allowed: true as const, retryAfterSeconds: 0 };
  });

  if (!result.allowed) {
    throw new AuthRateLimitError(result.retryAfterSeconds);
  }
}

export async function clearAuthSecurityAttempts(input: {
  action: AuthSecurityAction;
  keyHashes: string[];
}) {
  await prisma.authSecurityEvent.deleteMany({
    where: {
      action: input.action,
      keyHash: { in: [...new Set(input.keyHashes)] },
    },
  });
}

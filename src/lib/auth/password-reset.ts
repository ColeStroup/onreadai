import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

import { getAuthAppOrigin } from "@/lib/auth/app-url";
import { getPasswordResetSecret } from "@/lib/auth/secrets";
import { sendEmail } from "@/lib/email/send-email";
import { passwordResetEmail } from "@/lib/email/templates/password-reset";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/observability/log";

export const passwordResetLifetimeMs = 30 * 60 * 1_000;
const passwordResetHourlyLimit = 5;
const passwordResetMaximumAttempts = 5;

export type PasswordResetErrorCode =
  | "EXPIRED"
  | "INVALID_TOKEN"
  | "TOKEN_USED"
  | "TOO_MANY_ATTEMPTS";

export class PasswordResetError extends Error {
  readonly code: PasswordResetErrorCode;

  constructor(code: PasswordResetErrorCode) {
    super(code);
    this.name = "PasswordResetError";
    this.code = code;
  }
}

export function generatePasswordResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string) {
  return createHmac("sha256", getPasswordResetSecret())
    .update(`password-reset:v1:${token}`)
    .digest("hex");
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user?.email || !user.passwordHash) {
    return { eligible: false as const, delivered: false as const };
  }

  const now = new Date();
  const token = generatePasswordResetToken();
  const tokenHash = hashPasswordResetToken(token);
  const challenge = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${`password-reset:${user.id}`})
      )
    `;

    const recentRequests = await transaction.passwordResetToken.count({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1_000) },
      },
    });
    if (recentRequests >= passwordResetHourlyLimit) {
      return null;
    }

    await transaction.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    });

    return transaction.passwordResetToken.create({
      data: {
        userId: user.id,
        email: normalizedEmail,
        tokenHash,
        expiresAt: new Date(now.getTime() + passwordResetLifetimeMs),
        maxAttempts: passwordResetMaximumAttempts,
      },
      select: { id: true },
    });
  });

  if (!challenge) {
    return { eligible: true as const, delivered: false as const };
  }

  let resetUrl: string;
  try {
    resetUrl = `${getAuthAppOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
  } catch (error) {
    logError("password_reset_url_creation_failed", error);
    await prisma.passwordResetToken.update({
      where: { id: challenge.id },
      data: { invalidatedAt: new Date() },
    });
    return { eligible: true as const, delivered: false as const };
  }

  const emailContent = passwordResetEmail(resetUrl);
  const delivery = await sendEmail({
    to: normalizedEmail,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
    idempotencyKey: `password-reset-${challenge.id}`,
  });

  if (!delivery.delivered) {
    await prisma.passwordResetToken.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: new Date() },
    });
  }

  return { eligible: true as const, delivered: delivery.delivered };
}

export async function getPasswordResetTokenState(token: string | undefined) {
  if (!token || token.length < 32 || token.length > 180) return "INVALID" as const;

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(token) },
    select: {
      expiresAt: true,
      consumedAt: true,
      invalidatedAt: true,
      attemptCount: true,
      maxAttempts: true,
    },
  });

  if (!record) return "INVALID" as const;
  if (record.consumedAt) return "USED" as const;
  if (record.invalidatedAt || record.attemptCount >= record.maxAttempts) {
    return "INVALID" as const;
  }
  if (record.expiresAt <= new Date()) return "EXPIRED" as const;
  return "VALID" as const;
}

export async function resetPassword(input: {
  token: string;
  password: string;
}) {
  const tokenHash = hashPasswordResetToken(input.token);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const now = new Date();

  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${`password-reset-token:${tokenHash}`})
      )
    `;

    const challenge = await transaction.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!challenge) return "INVALID_TOKEN" as const;
    if (challenge.consumedAt) return "TOKEN_USED" as const;
    if (challenge.invalidatedAt) return "INVALID_TOKEN" as const;
    if (challenge.expiresAt <= now) {
      await transaction.passwordResetToken.update({
        where: { id: challenge.id },
        data: { invalidatedAt: now },
      });
      return "EXPIRED" as const;
    }
    if (challenge.attemptCount >= challenge.maxAttempts) {
      await transaction.passwordResetToken.update({
        where: { id: challenge.id },
        data: { invalidatedAt: now },
      });
      return "TOO_MANY_ATTEMPTS" as const;
    }

    await transaction.passwordResetToken.update({
      where: { id: challenge.id },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        consumedAt: now,
      },
    });
    await transaction.passwordResetToken.updateMany({
      where: {
        userId: challenge.userId,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    });
    await transaction.user.update({
      where: { id: challenge.userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });
    await transaction.session.deleteMany({
      where: { userId: challenge.userId },
    });

    return "RESET" as const;
  });

  if (result === "RESET") return { status: result };
  throw new PasswordResetError(result);
}

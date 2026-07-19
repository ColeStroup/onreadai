import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { EmailVerificationPurpose } from "@prisma/client";

import { getEmailVerificationSecret } from "@/lib/auth/secrets";
import { sendEmail } from "@/lib/email/send-email";
import { verificationCodeEmail } from "@/lib/email/templates/verification-code";
import { prisma } from "@/lib/prisma";

export const verificationCodeDigits = 6;
export const verificationCodeLifetimeMs = 10 * 60 * 1_000;
export const verificationResendCooldownMs = 60 * 1_000;
export const verificationHourlySendLimit = 5;
export const verificationDailySendLimit = 10;
export const verificationMaximumAttempts = 5;
export const verificationHourlyAttemptLimit = 10;

export type EmailVerificationErrorCode =
  | "ALREADY_VERIFIED"
  | "COOLDOWN"
  | "DAILY_LIMIT"
  | "DELIVERY_FAILED"
  | "EXPIRED"
  | "HOURLY_ATTEMPT_LIMIT"
  | "HOURLY_SEND_LIMIT"
  | "INVALID_CODE"
  | "NOT_ELIGIBLE"
  | "NO_ACTIVE_CODE"
  | "TOO_MANY_ATTEMPTS";

export class EmailVerificationError extends Error {
  readonly code: EmailVerificationErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(
    code: EmailVerificationErrorCode,
    options: { retryAfterSeconds?: number } = {},
  ) {
    super(code);
    this.name = "EmailVerificationError";
    this.code = code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function generateVerificationCode() {
  return randomInt(0, 10 ** verificationCodeDigits)
    .toString()
    .padStart(verificationCodeDigits, "0");
}

export function hashVerificationCode(input: {
  userId: string;
  email: string;
  purpose?: EmailVerificationPurpose;
  code: string;
}) {
  return createHmac("sha256", getEmailVerificationSecret())
    .update(
      [
        "email-verification:v1",
        input.purpose ?? EmailVerificationPurpose.SIGNUP_VERIFICATION,
        input.userId,
        input.email.trim().toLowerCase(),
        input.code,
      ].join(":"),
    )
    .digest("hex");
}

export function compareVerificationCodeHash(
  expectedHash: string,
  suppliedHash: string,
) {
  const expected = Buffer.from(expectedHash, "hex");
  const supplied = Buffer.from(suppliedHash, "hex");
  return (
    expected.length > 0 &&
    expected.length === supplied.length &&
    timingSafeEqual(expected, supplied)
  );
}

export function maskEmail(email: string) {
  const [localPart = "", domain = ""] = email.split("@");
  const visible = localPart.slice(0, 1);
  const maskedLocal = `${visible}••••`;
  return domain ? `${maskedLocal}@${domain}` : maskedLocal;
}

type IssueMode = "initial" | "resend" | "ensure";

export async function issueSignupVerificationCode(input: {
  userId: string;
  mode: IssueMode;
}) {
  const now = new Date();
  const hourStart = new Date(now.getTime() - 60 * 60 * 1_000);
  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const rawCode = generateVerificationCode();

  const challenge = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${`email-verification:${input.userId}`})
      )
    `;

    const user = await transaction.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        emailVerificationRequiredAt: true,
      },
    });

    if (!user?.email || !user.emailVerificationRequiredAt) {
      throw new EmailVerificationError("NOT_ELIGIBLE");
    }
    if (user.emailVerified) {
      throw new EmailVerificationError("ALREADY_VERIFIED");
    }

    const normalizedEmail = user.email.trim().toLowerCase();
    const latest = await transaction.emailVerificationCode.findFirst({
      where: {
        userId: user.id,
        purpose: EmailVerificationPurpose.SIGNUP_VERIFICATION,
      },
      orderBy: { createdAt: "desc" },
    });
    const latestIsActive = Boolean(
      latest &&
        !latest.consumedAt &&
        !latest.invalidatedAt &&
        latest.expiresAt > now &&
        latest.attemptCount < latest.maxAttempts,
    );

    if (input.mode === "ensure" && latest && latestIsActive) {
      const retryAfterSeconds = Math.max(
        0,
        Math.ceil(
          (latest.createdAt.getTime() + verificationResendCooldownMs -
            now.getTime()) /
            1_000,
        ),
      );
      return {
        created: false as const,
        email: normalizedEmail,
        expiresAt: latest.expiresAt,
        retryAfterSeconds,
      };
    }

    if (input.mode !== "initial" && latest) {
      const retryAt =
        latest.createdAt.getTime() + verificationResendCooldownMs;
      if (retryAt > now.getTime()) {
        throw new EmailVerificationError("COOLDOWN", {
          retryAfterSeconds: Math.ceil((retryAt - now.getTime()) / 1_000),
        });
      }
    }

    const [hourlySends, dailySends] = await Promise.all([
      transaction.emailVerificationCode.count({
        where: {
          userId: user.id,
          email: normalizedEmail,
          purpose: EmailVerificationPurpose.SIGNUP_VERIFICATION,
          createdAt: { gte: hourStart },
        },
      }),
      transaction.emailVerificationCode.count({
        where: {
          userId: user.id,
          email: normalizedEmail,
          purpose: EmailVerificationPurpose.SIGNUP_VERIFICATION,
          createdAt: { gte: dayStart },
        },
      }),
    ]);

    if (hourlySends >= verificationHourlySendLimit) {
      throw new EmailVerificationError("HOURLY_SEND_LIMIT");
    }
    if (dailySends >= verificationDailySendLimit) {
      throw new EmailVerificationError("DAILY_LIMIT");
    }

    await transaction.emailVerificationCode.updateMany({
      where: {
        userId: user.id,
        purpose: EmailVerificationPurpose.SIGNUP_VERIFICATION,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    });

    const created = await transaction.emailVerificationCode.create({
      data: {
        userId: user.id,
        email: normalizedEmail,
        purpose: EmailVerificationPurpose.SIGNUP_VERIFICATION,
        codeHash: hashVerificationCode({
          userId: user.id,
          email: normalizedEmail,
          code: rawCode,
        }),
        expiresAt: new Date(now.getTime() + verificationCodeLifetimeMs),
        maxAttempts: verificationMaximumAttempts,
      },
    });

    return {
      created: true as const,
      id: created.id,
      email: normalizedEmail,
      expiresAt: created.expiresAt,
      retryAfterSeconds: Math.ceil(verificationResendCooldownMs / 1_000),
    };
  });

  if (!challenge.created) return { ...challenge, delivered: false as const };

  const email = verificationCodeEmail(rawCode);
  const delivery = await sendEmail({
    to: challenge.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
    idempotencyKey: `signup-verification-${challenge.id}`,
  });

  if (!delivery.delivered) {
    await prisma.emailVerificationCode.updateMany({
      where: {
        id: challenge.id,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: new Date() },
    });
    throw new EmailVerificationError("DELIVERY_FAILED");
  }

  return { ...challenge, delivered: true as const };
}

export async function getPendingVerificationState(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      emailVerificationRequiredAt: true,
      emailVerificationCodes: {
        where: { purpose: EmailVerificationPurpose.SIGNUP_VERIFICATION },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, expiresAt: true },
      },
    },
  });

  if (!user?.email || !user.emailVerificationRequiredAt) return null;
  const latest = user.emailVerificationCodes[0];
  return {
    userId: user.id,
    email: user.email.trim().toLowerCase(),
    maskedEmail: maskEmail(user.email),
    alreadyVerified: Boolean(user.emailVerified),
    expiresAt: latest?.expiresAt ?? null,
    resendAvailableAt: latest
      ? new Date(latest.createdAt.getTime() + verificationResendCooldownMs)
      : new Date(),
  };
}

export async function verifySignupEmailCode(input: {
  userId: string;
  email: string;
  code: string;
}) {
  const now = new Date();
  const normalizedEmail = input.email.trim().toLowerCase();
  const hourStart = new Date(now.getTime() - 60 * 60 * 1_000);

  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${`email-verification:${input.userId}`})
      )
    `;

    const user = await transaction.user.findUnique({
      where: { id: input.userId },
      select: {
        email: true,
        emailVerified: true,
        emailVerificationRequiredAt: true,
      },
    });
    if (
      !user?.email ||
      user.email.trim().toLowerCase() !== normalizedEmail ||
      !user.emailVerificationRequiredAt
    ) {
      return { status: "NOT_ELIGIBLE" as const };
    }
    if (user.emailVerified) {
      return { status: "ALREADY_VERIFIED" as const };
    }

    const hourlyAttempts = await transaction.emailVerificationCode.aggregate({
      where: {
        userId: input.userId,
        purpose: EmailVerificationPurpose.SIGNUP_VERIFICATION,
        createdAt: { gte: hourStart },
      },
      _sum: { attemptCount: true },
    });
    if (
      (hourlyAttempts._sum.attemptCount ?? 0) >=
      verificationHourlyAttemptLimit
    ) {
      return { status: "HOURLY_ATTEMPT_LIMIT" as const };
    }

    const challenge = await transaction.emailVerificationCode.findFirst({
      where: {
        userId: input.userId,
        email: normalizedEmail,
        purpose: EmailVerificationPurpose.SIGNUP_VERIFICATION,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge || challenge.consumedAt || challenge.invalidatedAt) {
      return { status: "NO_ACTIVE_CODE" as const };
    }
    if (challenge.expiresAt <= now) {
      await transaction.emailVerificationCode.update({
        where: { id: challenge.id },
        data: { invalidatedAt: now },
      });
      return { status: "EXPIRED" as const };
    }
    if (challenge.attemptCount >= challenge.maxAttempts) {
      await transaction.emailVerificationCode.update({
        where: { id: challenge.id },
        data: { invalidatedAt: now },
      });
      return { status: "TOO_MANY_ATTEMPTS" as const };
    }

    const suppliedHash = hashVerificationCode({
      userId: input.userId,
      email: normalizedEmail,
      code: input.code,
    });
    if (!compareVerificationCodeHash(challenge.codeHash, suppliedHash)) {
      const attemptCount = challenge.attemptCount + 1;
      const locked = attemptCount >= challenge.maxAttempts;
      await transaction.emailVerificationCode.update({
        where: { id: challenge.id },
        data: {
          attemptCount,
          lastAttemptAt: now,
          invalidatedAt: locked ? now : null,
        },
      });
      return {
        status: locked ? ("TOO_MANY_ATTEMPTS" as const) : ("INVALID_CODE" as const),
        attemptsRemaining: Math.max(0, challenge.maxAttempts - attemptCount),
      };
    }

    await transaction.emailVerificationCode.update({
      where: { id: challenge.id },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        consumedAt: now,
      },
    });
    await transaction.emailVerificationCode.updateMany({
      where: {
        userId: input.userId,
        purpose: EmailVerificationPurpose.SIGNUP_VERIFICATION,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    });
    await transaction.user.update({
      where: { id: input.userId },
      data: { emailVerified: now },
    });

    return { status: "VERIFIED" as const, verifiedAt: now };
  });

  if (result.status === "VERIFIED") return result;
  throw new EmailVerificationError(result.status);
}

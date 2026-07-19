import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

import bcrypt from "bcryptjs";
import { AuthSecurityAction, EmailVerificationPurpose } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import {
  compareVerificationCodeHash,
  EmailVerificationError,
  generateVerificationCode,
  getPendingVerificationState,
  hashVerificationCode,
  issueSignupVerificationCode,
  verifySignupEmailCode,
} from "@/lib/auth/email-verification";
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  PasswordResetError,
  resetPassword,
} from "@/lib/auth/password-reset";
import {
  authRateLimitKeys,
  AuthRateLimitError,
  recordAuthSecurityAttempt,
} from "@/lib/auth/rate-limit";
import {
  safeInternalCallbackUrl,
  safePostVerificationCallbackUrl,
} from "@/lib/auth/safe-redirect";
import { getEmailSenderConfiguration } from "@/lib/email/send-email";
import { passwordResetEmail } from "@/lib/email/templates/password-reset";
import { verificationCodeEmail } from "@/lib/email/templates/verification-code";
import { prisma } from "@/lib/prisma";

const previousEnvironment = {
  verificationSecret: process.env.EMAIL_VERIFICATION_SECRET,
  resetSecret: process.env.PASSWORD_RESET_SECRET,
  resendApiKey: process.env.RESEND_API_KEY,
  fromName: process.env.EMAIL_FROM_NAME,
  fromAddress: process.env.EMAIL_FROM_ADDRESS,
  replyTo: process.env.EMAIL_REPLY_TO,
};

const testUserIds: string[] = [];
const testRateKeys: string[] = [];

async function createPendingUser(label: string) {
  const id = `auth-test-${randomUUID()}`;
  const email = `${label}-${randomUUID()}@example.test`;
  const user = await prisma.user.create({
    data: {
      id,
      name: "Auth Test",
      email,
      passwordHash: await bcrypt.hash("test-password", 4),
      emailVerificationRequiredAt: new Date(),
    },
  });
  testUserIds.push(user.id);
  return user;
}

async function createChallenge(input: {
  userId: string;
  email: string;
  code: string;
  expiresAt?: Date;
}) {
  return prisma.emailVerificationCode.create({
    data: {
      userId: input.userId,
      email: input.email,
      purpose: EmailVerificationPurpose.SIGNUP_VERIFICATION,
      codeHash: hashVerificationCode(input),
      expiresAt: input.expiresAt ?? new Date(Date.now() + 10 * 60 * 1_000),
      maxAttempts: 5,
    },
  });
}

before(() => {
  process.env.EMAIL_VERIFICATION_SECRET =
    "auth-test-email-verification-secret-123456789";
  process.env.PASSWORD_RESET_SECRET =
    "auth-test-password-reset-secret-123456789012";
  delete process.env.RESEND_API_KEY;
  process.env.EMAIL_FROM_NAME = "Onread";
  process.env.EMAIL_FROM_ADDRESS = "notifications@updates.onread.ai";
  process.env.EMAIL_REPLY_TO = "support@onread.ai";
});

after(async () => {
  if (testRateKeys.length) {
    await prisma.authSecurityEvent.deleteMany({
      where: { keyHash: { in: testRateKeys } },
    });
  }
  if (testUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  }
  await prisma.$disconnect();

  for (const [key, value] of Object.entries({
    EMAIL_VERIFICATION_SECRET: previousEnvironment.verificationSecret,
    PASSWORD_RESET_SECRET: previousEnvironment.resetSecret,
    RESEND_API_KEY: previousEnvironment.resendApiKey,
    EMAIL_FROM_NAME: previousEnvironment.fromName,
    EMAIL_FROM_ADDRESS: previousEnvironment.fromAddress,
    EMAIL_REPLY_TO: previousEnvironment.replyTo,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("verification code security", () => {
  test("generates six numeric digits and stores a purpose-separated HMAC", () => {
    for (let index = 0; index < 100; index += 1) {
      assert.match(generateVerificationCode(), /^\d{6}$/);
    }

    const input = {
      userId: "user-a",
      email: "USER@example.com",
      code: "123456",
    };
    const hash = hashVerificationCode(input);
    assert.equal(hash.length, 64);
    assert.notEqual(hash, input.code);
    assert.equal(hash, hashVerificationCode(input));
    assert.notEqual(hash, hashVerificationCode({ ...input, userId: "user-b" }));
    assert.equal(compareVerificationCodeHash(hash, hash), true);
    assert.equal(compareVerificationCodeHash(hash, "0".repeat(64)), false);
  });

  test("verifies exactly once and marks the user verified", async () => {
    const user = await createPendingUser("correct");
    const challenge = await createChallenge({
      userId: user.id,
      email: user.email!,
      code: "123456",
    });

    const result = await verifySignupEmailCode({
      userId: user.id,
      email: user.email!,
      code: "123456",
    });
    assert.equal(result.status, "VERIFIED");

    const [updatedUser, updatedChallenge] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.emailVerificationCode.findUniqueOrThrow({
        where: { id: challenge.id },
      }),
    ]);
    assert.ok(updatedUser.emailVerified);
    assert.ok(updatedChallenge.consumedAt);
    await assert.rejects(
      verifySignupEmailCode({
        userId: user.id,
        email: user.email!,
        code: "123456",
      }),
      (error: unknown) =>
        error instanceof EmailVerificationError &&
        error.code === "ALREADY_VERIFIED",
    );
  });

  test("expires old codes and locks a code after five wrong attempts", async () => {
    const expiredUser = await createPendingUser("expired");
    await createChallenge({
      userId: expiredUser.id,
      email: expiredUser.email!,
      code: "111111",
      expiresAt: new Date(Date.now() - 1_000),
    });
    await assert.rejects(
      verifySignupEmailCode({
        userId: expiredUser.id,
        email: expiredUser.email!,
        code: "111111",
      }),
      (error: unknown) =>
        error instanceof EmailVerificationError && error.code === "EXPIRED",
    );

    const lockedUser = await createPendingUser("locked");
    const challenge = await createChallenge({
      userId: lockedUser.id,
      email: lockedUser.email!,
      code: "222222",
    });
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await assert.rejects(
        verifySignupEmailCode({
          userId: lockedUser.id,
          email: lockedUser.email!,
          code: "999999",
        }),
        (error: unknown) =>
          error instanceof EmailVerificationError &&
          error.code ===
            (attempt === 5 ? "TOO_MANY_ATTEMPTS" : "INVALID_CODE"),
      );
    }
    const locked = await prisma.emailVerificationCode.findUniqueOrThrow({
      where: { id: challenge.id },
    });
    assert.equal(locked.attemptCount, 5);
    assert.ok(locked.invalidatedAt);
  });

  test("invalidates an earlier code when a replacement is generated", async () => {
    const user = await createPendingUser("replacement");
    const old = await createChallenge({
      userId: user.id,
      email: user.email!,
      code: "333333",
    });

    await assert.rejects(
      issueSignupVerificationCode({ userId: user.id, mode: "initial" }),
      (error: unknown) =>
        error instanceof EmailVerificationError &&
        error.code === "DELIVERY_FAILED",
    );

    const records = await prisma.emailVerificationCode.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(records.length, 2);
    assert.ok(records.find((record) => record.id === old.id)?.invalidatedAt);
    assert.ok(records.every((record) => record.codeHash.length === 64));
    assert.ok(records.every((record) => record.codeHash !== "333333"));
  });

  test("enforces resend cooldown plus hourly and daily send limits", async () => {
    const cooldownUser = await createPendingUser("cooldown");
    await createChallenge({
      userId: cooldownUser.id,
      email: cooldownUser.email!,
      code: "444444",
    });
    await assert.rejects(
      issueSignupVerificationCode({ userId: cooldownUser.id, mode: "resend" }),
      (error: unknown) =>
        error instanceof EmailVerificationError && error.code === "COOLDOWN",
    );

    const hourlyUser = await createPendingUser("hourly-limit");
    await prisma.emailVerificationCode.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({
        userId: hourlyUser.id,
        email: hourlyUser.email!,
        codeHash: `${index}`.padStart(64, "0"),
        expiresAt: new Date(Date.now() - 60_000),
        invalidatedAt: new Date(Date.now() - 60_000),
        createdAt: new Date(Date.now() - (index + 2) * 60_000),
      })),
    });
    await assert.rejects(
      issueSignupVerificationCode({ userId: hourlyUser.id, mode: "resend" }),
      (error: unknown) =>
        error instanceof EmailVerificationError &&
        error.code === "HOURLY_SEND_LIMIT",
    );

    const dailyUser = await createPendingUser("daily-limit");
    await prisma.emailVerificationCode.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        userId: dailyUser.id,
        email: dailyUser.email!,
        codeHash: `${index + 10}`.padStart(64, "0"),
        expiresAt: new Date(Date.now() - 60_000),
        invalidatedAt: new Date(Date.now() - 60_000),
        createdAt: new Date(Date.now() - (120 + index) * 60_000),
      })),
    });
    await assert.rejects(
      issueSignupVerificationCode({ userId: dailyUser.id, mode: "resend" }),
      (error: unknown) =>
        error instanceof EmailVerificationError && error.code === "DAILY_LIMIT",
    );
  });

  test("blocks more than ten verification attempts in an hour", async () => {
    const user = await createPendingUser("attempt-hour");
    await prisma.emailVerificationCode.create({
      data: {
        userId: user.id,
        email: user.email!,
        codeHash: hashVerificationCode({
          userId: user.id,
          email: user.email!,
          code: "555555",
        }),
        expiresAt: new Date(Date.now() - 60_000),
        attemptCount: 10,
        maxAttempts: 20,
        invalidatedAt: new Date(),
      },
    });
    await createChallenge({
      userId: user.id,
      email: user.email!,
      code: "666666",
    });
    await assert.rejects(
      verifySignupEmailCode({
        userId: user.id,
        email: user.email!,
        code: "666666",
      }),
      (error: unknown) =>
        error instanceof EmailVerificationError &&
        error.code === "HOURLY_ATTEMPT_LIMIT",
    );
  });

  test("keeps legacy users outside the new verification requirement", async () => {
    const id = `auth-test-${randomUUID()}`;
    const user = await prisma.user.create({
      data: {
        id,
        email: `legacy-${randomUUID()}@example.test`,
        passwordHash: await bcrypt.hash("legacy-password", 4),
        emailVerified: null,
        emailVerificationRequiredAt: null,
      },
    });
    testUserIds.push(user.id);
    assert.equal(await getPendingVerificationState(user.id), null);
  });
});

describe("password reset security", () => {
  test("hashes opaque tokens, resets once, and revokes sessions", async () => {
    const user = await createPendingUser("reset");
    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    assert.notEqual(tokenHash, token);
    assert.equal(tokenHash.length, 64);

    const challenge = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        email: user.email!,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1_000),
      },
    });
    await prisma.session.create({
      data: {
        userId: user.id,
        sessionToken: `session-${randomUUID()}`,
        expires: new Date(Date.now() + 60 * 60 * 1_000),
      },
    });

    await resetPassword({ token, password: "new-test-password" });
    const [updatedUser, updatedToken, sessionCount] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.passwordResetToken.findUniqueOrThrow({
        where: { id: challenge.id },
      }),
      prisma.session.count({ where: { userId: user.id } }),
    ]);
    assert.equal(
      await bcrypt.compare("new-test-password", updatedUser.passwordHash!),
      true,
    );
    assert.equal(updatedUser.sessionVersion, 1);
    assert.ok(updatedToken.consumedAt);
    assert.equal(sessionCount, 0);

    await assert.rejects(
      resetPassword({ token, password: "another-password" }),
      (error: unknown) =>
        error instanceof PasswordResetError && error.code === "TOKEN_USED",
    );
  });

  test("rejects and invalidates an expired reset token", async () => {
    const user = await createPendingUser("reset-expired");
    const token = generatePasswordResetToken();
    const challenge = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        email: user.email!,
        tokenHash: hashPasswordResetToken(token),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    await assert.rejects(
      resetPassword({ token, password: "new-test-password" }),
      (error: unknown) =>
        error instanceof PasswordResetError && error.code === "EXPIRED",
    );
    assert.ok(
      (
        await prisma.passwordResetToken.findUniqueOrThrow({
          where: { id: challenge.id },
        })
      ).invalidatedAt,
    );
  });
});

describe("Auth.js verification compatibility", () => {
  test("accepts only Google profiles that carry verified-email evidence", async () => {
    const callback = authOptions.callbacks?.signIn;
    assert.ok(callback);
    assert.equal(
      await callback({
        account: { provider: "google" },
        profile: { email_verified: true },
      } as never),
      true,
    );
    assert.equal(
      await callback({
        account: { provider: "google" },
        profile: { email_verified: false },
      } as never),
      false,
    );
  });

  test("marks verified Google identities without challenging them", async () => {
    const id = `auth-test-${randomUUID()}`;
    const email = `google-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: { id, email, emailVerified: null },
    });
    testUserIds.push(user.id);
    const callback = authOptions.callbacks?.jwt;
    assert.ok(callback);

    const token = (await callback({
      token: { id: user.id, email },
      user: { id: user.id, email },
      account: { provider: "google" },
      profile: { email_verified: true },
    } as never)) as Record<string, unknown>;
    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    assert.ok(updated.emailVerified);
    assert.equal(token.emailVerificationRequired, false);
  });

  test("restricts new pending credentials sessions but preserves legacy sessions", async () => {
    const pending = await createPendingUser("jwt-pending");
    const legacyId = `auth-test-${randomUUID()}`;
    const legacy = await prisma.user.create({
      data: {
        id: legacyId,
        email: `jwt-legacy-${randomUUID()}@example.test`,
        passwordHash: await bcrypt.hash("legacy-password", 4),
      },
    });
    testUserIds.push(legacy.id);
    const callback = authOptions.callbacks?.jwt;
    assert.ok(callback);

    const pendingToken = (await callback({
      token: { id: pending.id, email: pending.email },
      user: { id: pending.id, email: pending.email },
    } as never)) as Record<string, unknown>;
    const legacyToken = (await callback({
      token: { id: legacy.id, email: legacy.email },
      user: { id: legacy.id, email: legacy.email },
    } as never)) as Record<string, unknown>;
    assert.equal(pendingToken.emailVerificationRequired, true);
    assert.equal(legacyToken.emailVerificationRequired, false);
  });

  test("keeps Auth.js safe account linking defaults", () => {
    const googleProvider = authOptions.providers.find(
      (provider) => provider.id === "google",
    );
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      assert.equal(googleProvider, undefined);
      return;
    }

    assert.equal(
      (googleProvider as { options?: { allowDangerousEmailAccountLinking?: boolean } })
        .options?.allowDangerousEmailAccountLinking,
      undefined,
    );
  });

  test("invalidates both versioned and legacy JWTs after a password reset", async () => {
    const id = `auth-test-${randomUUID()}`;
    const user = await prisma.user.create({
      data: {
        id,
        email: `jwt-reset-${randomUUID()}@example.test`,
        passwordHash: await bcrypt.hash("reset-password", 4),
        sessionVersion: 1,
      },
    });
    testUserIds.push(user.id);
    const callback = authOptions.callbacks?.jwt;
    assert.ok(callback);

    const staleLegacyToken = (await callback({
      token: { id: user.id, email: user.email },
    } as never)) as Record<string, unknown>;
    const freshSigninToken = (await callback({
      token: { id: user.id, email: user.email },
      user: { id: user.id, email: user.email },
    } as never)) as Record<string, unknown>;
    assert.equal(staleLegacyToken.sessionInvalidated, true);
    assert.equal(staleLegacyToken.id, undefined);
    assert.equal(freshSigninToken.sessionInvalidated, false);
    assert.equal(freshSigninToken.sessionVersion, 1);

    const sessionCallback = authOptions.callbacks?.session;
    assert.ok(sessionCallback);
    const revokedSession = await sessionCallback({
      session: {
        user: { id: user.id, email: user.email },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      token: { sub: user.id, sessionInvalidated: true },
    } as never);
    assert.equal(
      (revokedSession.user as { id?: string } | undefined)?.id,
      "",
    );
  });
});

describe("redirect, rate-limit, and email policy", () => {
  test("accepts only safe internal callbacks and prevents auth loops", () => {
    assert.equal(
      safeInternalCallbackUrl("/dashboard/billing?checkout=pro"),
      "/dashboard/billing?checkout=pro",
    );
    for (const unsafe of [
      "https://attacker.example",
      "//attacker.example",
      "/\\attacker.example",
      "/%2f%2fattacker.example",
      "javascript:alert(1)",
    ]) {
      assert.equal(safeInternalCallbackUrl(unsafe), "/dashboard");
    }
    assert.equal(safePostVerificationCallbackUrl("/verify-email"), "/dashboard");
  });

  test("stores only HMAC rate-limit keys and enforces the server window", async () => {
    const keys = authRateLimitKeys(
      new Headers({
        "x-forwarded-for": "203.0.113.9",
        "user-agent": "Auth security test",
      }),
      { email: "rate-limit@example.test" },
    );
    testRateKeys.push(...keys);
    assert.ok(keys.every((key) => key.length === 64));
    assert.ok(keys.every((key) => !key.includes("203.0.113.9")));
    assert.ok(keys.every((key) => !key.includes("rate-limit@example.test")));

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await recordAuthSecurityAttempt({
        action: AuthSecurityAction.SIGNUP,
        keyHashes: keys,
        limit: 2,
        windowMs: 60_000,
      });
    }
    await assert.rejects(
      recordAuthSecurityAttempt({
        action: AuthSecurityAction.SIGNUP,
        keyHashes: keys,
        limit: 2,
        windowMs: 60_000,
      }),
      AuthRateLimitError,
    );
  });

  test("renders the required sender and accessible transactional content", () => {
    assert.deepEqual(getEmailSenderConfiguration(), {
      from: "Onread <notifications@updates.onread.ai>",
      replyTo: "support@onread.ai",
    });

    const verification = verificationCodeEmail("445566");
    assert.equal(verification.subject, "Your Onread verification code");
    assert.match(verification.html, /445566/);
    assert.match(verification.text, /expires in 10 minutes/i);
    assert.match(verification.text, /support@onread\.ai/);
    assert.doesNotMatch(verification.html, /verify-email\?code=/i);

    const reset = passwordResetEmail(
      "https://onread.ai/reset-password?token=opaque-token",
    );
    assert.equal(reset.subject, "Reset your Onread password");
    assert.match(reset.text, /expires in 30 minutes/i);
    assert.match(reset.html, /support@onread\.ai/);
  });
});

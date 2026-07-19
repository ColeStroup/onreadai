import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import {
  authRateLimitKeys,
  AuthRateLimitError,
  clearAuthSecurityAttempts,
  recordAuthSecurityAttempt,
} from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      const email = credentials?.email?.trim().toLowerCase();
      const password = credentials?.password;

      if (!email || !password) {
        return null;
      }

      const rateLimitKeys = authRateLimitKeys(request.headers, { email });
      try {
        await recordAuthSecurityAttempt({
          action: "SIGN_IN",
          keyHashes: rateLimitKeys,
          limit: 10,
          windowMs: 15 * 60 * 1_000,
          outcome: "attempt",
        });
      } catch (error) {
        if (error instanceof AuthRateLimitError) return null;
        throw error;
      }

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user?.passwordHash || !user.email) {
        return null;
      }

      const isValidPassword = await bcrypt.compare(
        password,
        user.passwordHash,
      );

      if (!isValidPassword) {
        return null;
      }

      await clearAuthSecurityAttempts({
        action: "SIGN_IN",
        keyHashes: rateLimitKeys,
      });

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  debug: false,
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  providers,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;

      return (profile as { email_verified?: boolean } | undefined)
        ?.email_verified === true;
    },
    async jwt({ token, user, account, profile }) {
      if (user?.id) {
        token.id = user.id;
      }

      if (!token.id && token.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true },
        });

        if (existingUser) {
          token.id = existingUser.id;
        }
      }

      if (
        token.id &&
        account?.provider === "google" &&
        (profile as { email_verified?: boolean } | undefined)
          ?.email_verified === true
      ) {
        await prisma.user.updateMany({
          where: { id: token.id, emailVerified: null },
          data: { emailVerified: new Date() },
        });
      }

      if (token.id) {
        const authState = await prisma.user.findUnique({
          where: { id: token.id },
          select: {
            emailVerified: true,
            emailVerificationRequiredAt: true,
            sessionVersion: true,
          },
        });

        if (!authState) {
          token.id = undefined;
          token.sessionInvalidated = true;
          token.emailVerificationRequired = false;
        } else {
          const tokenSessionVersion =
            typeof token.sessionVersion === "number"
              ? token.sessionVersion
              : user?.id || authState.sessionVersion === 0
                ? authState.sessionVersion
                : -1;

          if (tokenSessionVersion !== authState.sessionVersion) {
            token.id = undefined;
            token.sessionInvalidated = true;
            token.emailVerificationRequired = false;
          } else {
            token.sessionVersion = authState.sessionVersion;
            token.sessionInvalidated = false;
            token.emailVerificationRequired = Boolean(
              authState.emailVerificationRequiredAt &&
                !authState.emailVerified,
            );
          }
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sessionInvalidated
          ? ""
          : typeof token.id === "string"
            ? token.id
            : (token.sub ?? "");
        session.user.emailVerificationRequired =
          token.emailVerificationRequired === true;
        session.user.sessionInvalidated = token.sessionInvalidated === true;
      }

      return session;
    },
  },
};

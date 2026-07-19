import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      emailVerificationRequired: boolean;
      sessionInvalidated: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    emailVerificationRequired?: boolean;
    sessionInvalidated?: boolean;
    sessionVersion?: number;
  }
}

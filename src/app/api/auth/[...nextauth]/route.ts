import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

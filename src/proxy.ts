import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const referralCode = request.nextUrl.searchParams.get("ref")?.trim();
  if (!referralCode || referralCode.length > 80) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.searchParams.delete("ref");
  const referralUrl = new URL(
    `/r/${encodeURIComponent(referralCode)}`,
    request.url,
  );
  referralUrl.searchParams.set(
    "to",
    `${destination.pathname}${destination.search}`,
  );

  for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) referralUrl.searchParams.set(key, value.slice(0, 120));
  }

  return NextResponse.redirect(referralUrl);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|dashboard|r/|preview/).*)",
  ],
};

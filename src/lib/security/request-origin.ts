import "server-only";

export function isSameOriginMutation(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();

  if (!origin || origin === "null" || fetchSite === "cross-site") return false;

  try {
    const requestOrigin = new URL(request.url).origin;
    const configuredOrigin = configuredAppOrigin();
    const suppliedOrigin = new URL(origin).origin;

    return (
      suppliedOrigin === requestOrigin ||
      (configuredOrigin !== null && suppliedOrigin === configuredOrigin)
    );
  } catch {
    return false;
  }
}

export function sameOriginErrorResponse() {
  return Response.json(
    { error: "This request could not be verified.", code: "INVALID_ORIGIN" },
    { status: 403 },
  );
}

function configuredAppOrigin() {
  const value =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim();
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

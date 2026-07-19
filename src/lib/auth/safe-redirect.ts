const internalOrigin = "https://onread.internal";
const authLoopPaths = new Set([
  "/signin",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/auth/sign-in",
  "/auth/sign-up",
]);

function containsEncodedRedirect(value: string) {
  const lowered = value.toLowerCase();
  return (
    lowered.includes("%2f%2f") ||
    lowered.includes("%5c") ||
    lowered.includes("%00")
  );
}

export function safeInternalCallbackUrl(
  value: string | string[] | null | undefined,
  fallback = "/dashboard",
) {
  if (typeof value !== "string") return fallback;

  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    containsEncodedRedirect(candidate) ||
    /[\u0000-\u001f\u007f]/.test(candidate) ||
    candidate.length > 2_048
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, internalOrigin);
    if (parsed.origin !== internalOrigin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function safePostVerificationCallbackUrl(
  value: string | string[] | null | undefined,
  fallback = "/dashboard",
) {
  const callbackUrl = safeInternalCallbackUrl(value, fallback);
  const pathname = new URL(callbackUrl, internalOrigin).pathname;
  return authLoopPaths.has(pathname) ? fallback : callbackUrl;
}

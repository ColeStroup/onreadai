export function normalizeReferralCode(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function safeReferralDestination(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const url = new URL(value, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid") return "/";
    if (url.pathname.startsWith("/r/")) return "/";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}

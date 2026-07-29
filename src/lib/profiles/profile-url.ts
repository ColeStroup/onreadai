import { ProfilePlatform } from "@prisma/client";

const trackingParameters = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "source",
  "si",
  "feature",
]);

const platformHosts: Partial<Record<ProfilePlatform, string[]>> = {
  [ProfilePlatform.INSTAGRAM]: ["instagram.com"],
  [ProfilePlatform.FACEBOOK]: ["facebook.com"],
  [ProfilePlatform.TIKTOK]: ["tiktok.com"],
  [ProfilePlatform.YOUTUBE]: ["youtube.com", "youtu.be"],
  [ProfilePlatform.LINKEDIN]: ["linkedin.com"],
  [ProfilePlatform.X]: ["x.com", "twitter.com"],
  [ProfilePlatform.PINTEREST]: ["pinterest.com"],
};

const canonicalPlatformHosts: Partial<Record<ProfilePlatform, string>> = {
  [ProfilePlatform.INSTAGRAM]: "www.instagram.com",
  [ProfilePlatform.FACEBOOK]: "www.facebook.com",
  [ProfilePlatform.TIKTOK]: "www.tiktok.com",
  [ProfilePlatform.YOUTUBE]: "www.youtube.com",
  [ProfilePlatform.LINKEDIN]: "www.linkedin.com",
  [ProfilePlatform.X]: "x.com",
  [ProfilePlatform.PINTEREST]: "www.pinterest.com",
};

export const guidedProfilePlatforms: ProfilePlatform[] = [
  ProfilePlatform.WEBSITE,
  ProfilePlatform.GOOGLE_BUSINESS,
  ProfilePlatform.INSTAGRAM,
  ProfilePlatform.FACEBOOK,
  ProfilePlatform.TIKTOK,
  ProfilePlatform.LINKEDIN,
  ProfilePlatform.YOUTUBE,
  ProfilePlatform.X,
  ProfilePlatform.PINTEREST,
  ProfilePlatform.OTHER,
];

export const optionalDecisionPlatforms: ProfilePlatform[] = [
  ProfilePlatform.GOOGLE_BUSINESS,
  ProfilePlatform.INSTAGRAM,
  ProfilePlatform.FACEBOOK,
  ProfilePlatform.TIKTOK,
  ProfilePlatform.LINKEDIN,
  ProfilePlatform.YOUTUBE,
  ProfilePlatform.X,
  ProfilePlatform.PINTEREST,
];

export class ProfileUrlError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "REQUIRED"
      | "INVALID_URL"
      | "UNSUPPORTED_SCHEME"
      | "UNSAFE_URL"
      | "PLATFORM_MISMATCH",
  ) {
    super(message);
    this.name = "ProfileUrlError";
  }
}

export type NormalizedProfileUrl = {
  url: string;
  normalizedUrl: string;
};

export function normalizeProfileUrlSyntax(
  input: string,
  platform: ProfilePlatform,
): NormalizedProfileUrl {
  const value = input.trim();

  if (!value) {
    throw new ProfileUrlError("Enter a public profile URL.", "REQUIRED");
  }

  if (/^@/.test(value) || (!value.includes(".") && !value.includes("://"))) {
    throw new ProfileUrlError(
      "Enter the complete public profile URL rather than only a handle.",
      "INVALID_URL",
    );
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;
  let url: URL;

  try {
    url = new URL(withProtocol);
  } catch {
    throw new ProfileUrlError(
      "Enter a valid public profile URL.",
      "INVALID_URL",
    );
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ProfileUrlError(
      "Only public HTTP and HTTPS profile URLs are supported.",
      "UNSUPPORTED_SCHEME",
    );
  }

  if (url.username || url.password || url.port) {
    throw new ProfileUrlError(
      "Credentialed URLs and custom ports are not supported.",
      "UNSAFE_URL",
    );
  }

  url.hostname = url.hostname.toLowerCase();

  if (!platformMatchesUrl(platform, url)) {
    throw new ProfileUrlError(
      `That URL does not appear to match ${platformLabelForError(platform)}.`,
      "PLATFORM_MISMATCH",
    );
  }

  const canonicalHost = canonicalPlatformHosts[platform];
  if (canonicalHost) {
    if (
      platform !== ProfilePlatform.YOUTUBE ||
      comparableHostname(url.hostname) !== "youtu.be"
    ) {
      url.hostname = canonicalHost;
    }
    url.protocol = "https:";
  }

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (
      trackingParameters.has(key.toLowerCase()) ||
      key.toLowerCase().startsWith("utm_")
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  url.pathname = normalizedPathname(url.pathname);

  const normalized = new URL(url);
  normalized.protocol = "https:";
  normalized.hostname = comparableHostname(normalized.hostname);

  return {
    url: url.toString(),
    normalizedUrl: normalized.toString(),
  };
}

export function profileUrlComparisonKey(
  value?: string | null,
  platform: ProfilePlatform = ProfilePlatform.OTHER,
) {
  if (!value) return null;

  try {
    return normalizeProfileUrlSyntax(value, platform).normalizedUrl;
  } catch {
    try {
      const url = new URL(
        /^[a-z][a-z\d+.-]*:\/\//i.test(value)
          ? value
          : `https://${value}`,
      );
      url.protocol = "https:";
      url.hostname = comparableHostname(url.hostname);
      url.hash = "";
      url.pathname = normalizedPathname(url.pathname);
      return url.toString();
    } catch {
      return null;
    }
  }
}

export function isGoogleBusinessUrl(value: string) {
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(value)
        ? value
        : `https://${value}`,
    );
    return isGoogleBusinessHostname(url.hostname, url.pathname);
  } catch {
    return false;
  }
}

function platformMatchesUrl(platform: ProfilePlatform, url: URL) {
  const comparable = comparableHostname(url.hostname);

  if (platform === ProfilePlatform.GOOGLE_BUSINESS) {
    return isGoogleBusinessHostname(url.hostname, url.pathname);
  }

  const allowedHosts = platformHosts[platform];
  if (allowedHosts) {
    return allowedHosts.some(
      (host) => comparable === host || comparable.endsWith(`.${host}`),
    );
  }

  if (platform === ProfilePlatform.WEBSITE) {
    return (
      !Object.values(platformHosts)
        .flat()
        .some(
          (host) => comparable === host || comparable.endsWith(`.${host}`),
        ) && !isGoogleBusinessHostname(url.hostname, url.pathname)
    );
  }

  return true;
}

function isGoogleBusinessHostname(hostname: string, pathname: string) {
  const comparable = comparableHostname(hostname);

  return (
    comparable === "maps.app.goo.gl" ||
    comparable === "g.page" ||
    comparable === "goo.gl" ||
    comparable === "business.google.com" ||
    comparable === "maps.google.com" ||
    (comparable.startsWith("google.") &&
      (pathname === "" || pathname.startsWith("/maps")))
  );
}

function comparableHostname(hostname: string) {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  if (lower === "m.facebook.com" || lower === "web.facebook.com") {
    return "facebook.com";
  }
  return lower.replace(/^www\./, "");
}

function normalizedPathname(pathname: string) {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  if (collapsed === "/") return "/";
  return collapsed.replace(/\/+$/, "") || "/";
}

function platformLabelForError(platform: ProfilePlatform) {
  return platform
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

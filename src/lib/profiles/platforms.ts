import { ProfilePlatform } from "@prisma/client";

export const platformLabels: Record<ProfilePlatform, string> = {
  WEBSITE: "Website",
  GOOGLE_BUSINESS: "Google Business",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  LINKEDIN: "LinkedIn",
  X: "X",
  PINTEREST: "Pinterest",
  OTHER: "Other",
};

const socialHosts: Array<[string, ProfilePlatform]> = [
  ["google.com", ProfilePlatform.GOOGLE_BUSINESS],
  ["maps.google.com", ProfilePlatform.GOOGLE_BUSINESS],
  ["maps.app.goo.gl", ProfilePlatform.GOOGLE_BUSINESS],
  ["g.page", ProfilePlatform.GOOGLE_BUSINESS],
  ["instagram.com", ProfilePlatform.INSTAGRAM],
  ["facebook.com", ProfilePlatform.FACEBOOK],
  ["tiktok.com", ProfilePlatform.TIKTOK],
  ["youtube.com", ProfilePlatform.YOUTUBE],
  ["youtu.be", ProfilePlatform.YOUTUBE],
  ["linkedin.com", ProfilePlatform.LINKEDIN],
  ["x.com", ProfilePlatform.X],
  ["twitter.com", ProfilePlatform.X],
  ["pinterest.com", ProfilePlatform.PINTEREST],
];

export function normalizeSubmittedUrl(input: string) {
  const value = input.trim();
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function platformForSubmittedUrl(input: string) {
  try {
    const url = new URL(normalizeSubmittedUrl(input));
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    if (
      hostname === "google.com" ||
      hostname.endsWith(".google.com") ||
      hostname === "maps.app.goo.gl" ||
      hostname === "g.page" ||
      hostname.endsWith(".g.page")
    ) {
      const homepageOnly =
        (hostname === "google.com" || hostname.endsWith(".google.com")) &&
        (url.pathname === "" || url.pathname === "/") &&
        !url.search;
      return homepageOnly ? null : ProfilePlatform.GOOGLE_BUSINESS;
    }

    return (
      socialHosts.find(
        ([host]) => hostname === host || hostname.endsWith(`.${host}`),
      )?.[1] ?? null
    );
  } catch {
    return null;
  }
}

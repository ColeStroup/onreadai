import type { Metadata } from "next";

export const brand = {
  name: "Onread AI",
  shortName: "Onread",
  mobileName: "Onread",
  logoPath: "/onread-logo.png",
  touchIconPath: "/onread-icon-192.png",
  productionOrigin: "https://onread.ai",
  description:
    "Website and SEO audit software with evidence-backed findings, prioritized improvements, implementation help, and progress verification.",
} as const;

export function getMetadataBase() {
  return getPublicAppUrl() ?? new URL(brand.productionOrigin);
}

function normalizePublicUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1"
    ) {
      return null;
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function getPublicAppUrl() {
  return (
    normalizePublicUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizePublicUrl(process.env.NEXTAUTH_URL)
  );
}

export function getCanonicalUrl(pathname: string) {
  const baseUrl = getPublicAppUrl();
  if (!baseUrl) return undefined;

  const normalizedPath =
    pathname === "/" ? "/" : `/${pathname.replace(/^\/+|\/+$/g, "")}`;
  return new URL(normalizedPath, baseUrl);
}

type MarketingMetadataInput = {
  title: string;
  description: string;
  pathname: string;
};

export function createMarketingMetadata({
  title,
  description,
  pathname,
}: MarketingMetadataInput): Metadata {
  const canonical = getCanonicalUrl(pathname);
  const image = getCanonicalUrl("/opengraph-image");

  return {
    title: { absolute: title },
    description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: {
      type: "website",
      title,
      description,
      siteName: brand.name,
      url: canonical,
      images: image
        ? [
            {
              url: image,
              width: 1200,
              height: 630,
              alt: `${brand.name} website and SEO audit preview`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

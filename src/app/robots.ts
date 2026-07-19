import type { MetadataRoute } from "next";

import { getCanonicalUrl, getPublicAppUrl } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  const publicUrl = getPublicAppUrl();
  const sitemap = getCanonicalUrl("/sitemap.xml");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/dashboard/",
        "/account/",
        "/billing/",
        "/setup/",
        "/preview/",
        "/r/",
        "/partners/apply",
      ],
    },
    sitemap: sitemap?.href,
    host: publicUrl?.origin,
  };
}

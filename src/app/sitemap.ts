import type { MetadataRoute } from "next";

import { getPublicAppUrl } from "@/lib/brand";

const contentLastModified = "2026-07-14";

const publicRoutes = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/example-report", changeFrequency: "monthly", priority: 0.8 },
  { path: "/for-consultants", changeFrequency: "monthly", priority: 0.75 },
  { path: "/methodology", changeFrequency: "monthly", priority: 0.7 },
  { path: "/help", changeFrequency: "monthly", priority: 0.65 },
  { path: "/partners", changeFrequency: "monthly", priority: 0.7 },
  { path: "/partners/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/partners/commission-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/partners/promotion-standards", changeFrequency: "yearly", priority: 0.3 },
  { path: "/partners/scanner-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const publicUrl = getPublicAppUrl();
  if (!publicUrl) return [];

  return publicRoutes.map((route) => ({
    url: new URL(route.path, publicUrl).href,
    lastModified: contentLastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

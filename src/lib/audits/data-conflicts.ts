import type { WebsiteCrawlResult } from "@/lib/analyzers/website-crawler";
import type { WebsiteAnalysis } from "@/lib/analyzers/website-analyzer";
import {
  describesLateHours,
  latestClosingHour,
} from "@/lib/analyzers/observable-signals";
import {
  stableEvidenceId,
  type AuditDataConflict,
} from "@/lib/audits/evidence-contracts";

export function detectAuditDataConflicts({
  website,
  websiteCrawl,
  businessContextDescription,
}: {
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  businessContextDescription?: string | null;
}) {
  const conflicts: AuditDataConflict[] = [];
  const hoursConflict = detectOperatingHoursConflict({
    website,
    websiteCrawl,
    businessContextDescription,
  });
  if (hoursConflict) conflicts.push(hoursConflict);

  conflicts.push(
    ...detectPageFieldConflicts(websiteCrawl, "detectedPhone", "phoneNumber"),
    ...detectPageFieldConflicts(websiteCrawl, "detectedAddress", "address"),
  );

  return conflicts;
}

function detectOperatingHoursConflict({
  website,
  websiteCrawl,
  businessContextDescription,
}: {
  website: WebsiteAnalysis | null;
  websiteCrawl: WebsiteCrawlResult | null;
  businessContextDescription?: string | null;
}): AuditDataConflict | null {
  const dedicatedHoursPages =
    websiteCrawl?.pageResults.filter(
      (page) =>
        page.pageTypes.some((type) => type.toLowerCase() === "hours") &&
        (page.operatingHoursSignals ?? []).length > 0,
    ) ?? [];
  const preferred = dedicatedHoursPages
    .flatMap((page) =>
      (page.operatingHoursSignals ?? []).map((value) => ({
        source: "Dedicated hours page",
        sourceUrl: page.url,
        value,
        evidenceId: stableEvidenceId("website", page.url, "operating-hours"),
      })),
    )
    .sort((left, right) => {
      const leftClosing = latestClosingHour(left.value);
      const rightClosing = latestClosingHour(right.value);
      return Number(rightClosing !== null) - Number(leftClosing !== null);
    })[0];

  if (!preferred) return null;

  const otherSources = [
    website?.metaDescription && describesLateHours(website.metaDescription)
      ? {
          source: "Homepage meta description",
          sourceUrl: website.normalizedUrl,
          value: website.metaDescription,
          evidenceId: stableEvidenceId(
            "website",
            website.normalizedUrl,
            "meta-description",
          ),
        }
      : null,
    businessContextDescription && describesLateHours(businessContextDescription)
      ? {
          source: "Confirmed Business Context",
          sourceUrl: null,
          value: businessContextDescription,
          evidenceId: stableEvidenceId("business-context", "description"),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const closingHour = latestClosingHour(preferred.value);
  const conflictsWithLateLanguage =
    otherSources.length > 0 &&
    ((closingHour !== null && closingHour <= 22) ||
      (closingHour === null && !describesLateHours(preferred.value)));

  if (!conflictsWithLateLanguage) return null;

  return {
    id: stableEvidenceId("conflict", "operating-hours"),
    type: "DATA_CONFLICT",
    field: "operatingHours",
    sources: [preferred, ...otherSources],
    preferredSource: preferred.source,
    preferredValue: preferred.value,
    confidence: closingHour === null ? "MEDIUM" : "HIGH",
    action:
      "Confirm the current hours and update outdated homepage metadata or saved Business Context wording where needed.",
    explanation:
      "Displayed operating hours and homepage metadata appear inconsistent. The dedicated hours page is preferred because it is the source intended to communicate current operating times.",
  };
}

function detectPageFieldConflicts(
  websiteCrawl: WebsiteCrawlResult | null,
  field: "detectedPhone" | "detectedAddress",
  conflictField: "phoneNumber" | "address",
): AuditDataConflict[] {
  if (!websiteCrawl) return [];

  const sources = websiteCrawl.pageResults
    .filter((page) => Boolean(page[field]))
    .map((page) => ({
      source: page.pageTypes.includes("Contact")
        ? "Dedicated contact page"
        : page.pageTypes.includes("Homepage")
          ? "Homepage"
          : "Scanned website page",
      sourceUrl: page.url,
      value: page[field] as string,
      evidenceId: stableEvidenceId("website", page.url, conflictField),
    }));
  const preferred =
    sources.find((source) => source.source === "Dedicated contact page") ??
    sources.find((source) => source.source === "Homepage") ??
    sources[0];
  if (!preferred) return [];

  const grouped = new Map<string, typeof sources>();
  for (const source of sources) {
    const key = normalizeComparable(source.value);
    grouped.set(key, [...(grouped.get(key) ?? []), source]);
  }
  const preferredKey = normalizeComparable(preferred.value);
  const credibleConflicts = [...grouped.entries()].filter(
    ([key, group]) =>
      key !== preferredKey &&
      (group.length >= 2 ||
        group.some((source) => source.source !== "Scanned website page")),
  );
  if (credibleConflicts.length === 0) return [];
  const conflictSources = [
    ...(grouped.get(preferredKey) ?? [preferred]),
    ...credibleConflicts.flatMap(([, group]) => group),
  ];

  return [
    {
      id: stableEvidenceId("conflict", conflictField),
      type: "DATA_CONFLICT",
      field: conflictField,
      sources: conflictSources,
      preferredSource: preferred.source,
      preferredValue: preferred.value,
      confidence: "MEDIUM",
      action: `Confirm the current ${conflictField === "phoneNumber" ? "phone number" : "address"} and update inconsistent public pages.`,
      explanation: `Different ${conflictField === "phoneNumber" ? "phone numbers" : "addresses"} were detected across scanned pages. A dedicated contact page is preferred when available, but the conflict should be reviewed rather than silently resolved.`,
    },
  ];
}

function normalizeComparable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

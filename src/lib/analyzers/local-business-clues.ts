import type { CheerioAPI } from "cheerio";

export type LocalBusinessSchemaSnapshot = {
  type: string[];
  name?: string;
  telephone?: string;
  url?: string;
  address?: string;
};

export type LocalBusinessClues = {
  detectedAddress: string | null;
  detectedPhone: string | null;
  detectedGoogleMapsLinks: string[];
  detectedMapEmbeds: string[];
  detectedLocalBusinessSchema: LocalBusinessSchemaSnapshot[];
};

const localSchemaTypes = new Set([
  "LocalBusiness",
  "Restaurant",
  "Organization",
  "FoodEstablishment",
  "BarOrPub",
  "Store",
  "LodgingBusiness",
  "ProfessionalService",
  "HomeAndConstructionBusiness",
  "MedicalBusiness",
]);

export function emptyLocalBusinessClues(): LocalBusinessClues {
  return {
    detectedAddress: null,
    detectedPhone: null,
    detectedGoogleMapsLinks: [],
    detectedMapEmbeds: [],
    detectedLocalBusinessSchema: [],
  };
}

export function extractLocalBusinessClues({
  $,
  baseUrl,
  bodyText,
  linkUrls,
}: {
  $: CheerioAPI;
  baseUrl: string;
  bodyText: string;
  linkUrls?: string[];
}): LocalBusinessClues {
  const detectedGoogleMapsLinks = uniqueLimited(
    (linkUrls ?? collectLinkUrls($, baseUrl)).filter(isGoogleMapsUrl),
    8,
  );
  const detectedMapEmbeds = uniqueLimited(
    $("iframe[src]")
      .map((_, element) => absolutize($(element).attr("src") ?? "", baseUrl))
      .get()
      .filter((src): src is string => Boolean(src))
      .filter(isGoogleMapsUrl),
    6,
  );
  const detectedLocalBusinessSchema = extractLocalSchema($);
  const schemaPhone =
    detectedLocalBusinessSchema.find((item) => item.telephone)?.telephone ?? null;
  const schemaAddress =
    detectedLocalBusinessSchema.find((item) => item.address)?.address ?? null;
  const phoneLink = detectPhoneLink(linkUrls ?? collectLinkUrls($, baseUrl));

  return {
    detectedAddress: schemaAddress ?? detectAddress(bodyText),
    detectedPhone: schemaPhone ?? phoneLink ?? detectPhone(bodyText),
    detectedGoogleMapsLinks,
    detectedMapEmbeds,
    detectedLocalBusinessSchema,
  };
}

function detectPhoneLink(linkUrls: string[]) {
  const value = linkUrls.find((url) => /^tel:/i.test(url));
  if (!value) return null;
  const decoded = decodeURIComponent(value.replace(/^tel:/i, ""));
  return detectPhone(decoded);
}

export function isGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    return (
      (host === "goo.gl" && path.startsWith("/maps")) ||
      host === "maps.app.goo.gl" ||
      host.includes("maps.google.") ||
      (host.includes("google.") && path.includes("/maps"))
    );
  } catch {
    const lower = value.toLowerCase();

    return (
      lower.includes("goo.gl/maps") ||
      lower.includes("maps.app.goo.gl") ||
      lower.includes("maps.google.") ||
      lower.includes("google.com/maps")
    );
  }
}

function collectLinkUrls($: CheerioAPI, baseUrl: string) {
  return $("a[href]")
    .map((_, element) => absolutize($(element).attr("href") ?? "", baseUrl))
    .get()
    .filter((href): href is string => Boolean(href));
}

function absolutize(value: string, baseUrl: string) {
  const raw = value.trim();

  if (!raw) {
    return null;
  }

  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractLocalSchema($: CheerioAPI) {
  const schemas: LocalBusinessSchemaSnapshot[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const rawJson = $(element).contents().text().trim();

    if (!rawJson) {
      return;
    }

    try {
      const parsed = JSON.parse(rawJson) as unknown;

      for (const item of flattenSchemaNodes(parsed)) {
        const type = schemaTypes(item);

        if (!type.some((entry) => localSchemaTypes.has(entry))) {
          continue;
        }

        schemas.push({
          type,
          name: stringValue(item.name),
          telephone: stringValue(item.telephone),
          url: stringValue(item.url),
          address: formatSchemaAddress(item.address),
        });
      }
    } catch {
      // Invalid JSON-LD should not block website analysis.
    }
  });

  return schemas.slice(0, 5);
}

function flattenSchemaNodes(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap(flattenSchemaNodes);
  }

  if (!isRecord(value)) {
    return [];
  }

  const nodes = [value];
  const graph = value["@graph"];

  if (Array.isArray(graph)) {
    nodes.push(...graph.flatMap(flattenSchemaNodes));
  }

  return nodes;
}

function schemaTypes(value: Record<string, unknown>) {
  const rawType = value["@type"];

  if (Array.isArray(rawType)) {
    return rawType.map(String).filter(Boolean);
  }

  return typeof rawType === "string" ? [rawType] : [];
}

function formatSchemaAddress(value: unknown) {
  if (typeof value === "string") {
    return cleanText(value);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const parts = [
    value.streetAddress,
    value.addressLocality,
    value.addressRegion,
    value.postalCode,
    value.addressCountry,
  ]
    .map(stringValue)
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim()
    ? cleanText(value)
    : undefined;
}

function detectPhone(bodyText: string) {
  const match = bodyText.match(
    /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/,
  );

  return match ? cleanText(match[0]) : null;
}

function detectAddress(bodyText: string) {
  const match = bodyText.match(
    /\b\d{2,6}\s+[A-Za-z0-9 .'-]+(?:street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|court|ct\.?|highway|hwy|circle|cir\.?|place|pl\.?)\b(?:[^.\n]{0,80})?/i,
  );

  return match ? cleanText(match[0]).slice(0, 180) : null;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueLimited(values: string[], limit: number) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

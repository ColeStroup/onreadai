import {
  canonicalWebsitePathname,
  comparableWebsiteHostname,
  crawlUrlKey,
  urlsShareWebsite,
} from "@/lib/analyzers/website-url";

const preferredPageLabels: Array<[RegExp, string]> = [
  [/^\/order(?:-inquiries?|ing)?\/?$/i, "Order Inquiries"],
  [/^\/(?:merch|merchandise)(?:-shop|-store)?\/?$/i, "Merchandise Shop"],
  [/^\/gift(?:-cards?)?\/?$/i, "Gift Cards"],
  [/^\/contact(?:-us)?\/?$/i, "Contact"],
  [/^\/(?:about|our-story|who-we-are)\/?$/i, "About"],
  [/^\/(?:locations?|directions?)\/?$/i, "Location"],
  [/^\/(?:hours|opening-hours)\/?$/i, "Hours"],
  [/^\/(?:reviews?|testimonials?)\/?$/i, "Reviews"],
  [/^\/(?:faq|faqs|frequently-asked-questions)\/?$/i, "FAQ"],
  [/^\/(?:menu|menus)\/?$/i, "Menu"],
  [/^\/(?:services?|solutions?)\/?$/i, "Services"],
  [/^\/(?:shop|store|products?)\/?$/i, "Store"],
  [/^\/(?:pricing|plans|rates|packages)\/?$/i, "Pricing"],
];

export type CanonicalReportUrl = {
  url: string;
  identityKey: string;
  hostname: string;
  path: string;
};

export function canonicalReportUrl(value: string): CanonicalReportUrl | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
    url.pathname = canonicalWebsitePathname(url.pathname);

    return {
      url: url.toString(),
      identityKey: crawlUrlKey(url),
      hostname: comparableWebsiteHostname(url.hostname),
      path: reportPagePath(url),
    };
  } catch {
    return null;
  }
}

export function isAuditedWebsiteUrl(value: string, auditedHomepage: string) {
  try {
    return urlsShareWebsite(value, auditedHomepage);
  } catch {
    return false;
  }
}

export function reportPagePath(value: string | URL) {
  try {
    const url = value instanceof URL ? new URL(value.toString()) : new URL(value);
    url.pathname = canonicalWebsitePathname(url.pathname);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return "/";
  }
}

export function isReportHomepagePath(value: string) {
  const normalized = canonicalWebsitePathname(value).toLowerCase();
  return ["/", "/home", "/index", "/index.html", "/index.htm"].includes(
    normalized,
  );
}

export function reportPageLabel({
  url,
  pageTypes = [],
}: {
  url: string;
  pageTypes?: string[];
}) {
  const parsed = canonicalReportUrl(url);
  if (!parsed || isReportHomepagePath(parsed.path.split("?")[0])) {
    return "Homepage";
  }

  const pathname = parsed.path.split("?")[0];
  const preferred = preferredPageLabels.find(([pattern]) =>
    pattern.test(pathname),
  );
  if (preferred) return preferred[1];

  const specificType = pageTypes.find(
    (type) => type && type !== "Homepage" && type !== "Products",
  );
  if (specificType && !specificType.includes("/")) return specificType;

  const segment = safeDecodePathSegment(
    pathname.split("/").filter(Boolean).at(-1),
  );
  if (!segment) return "Homepage";

  return segment
    .replace(/\.(?:html?|php|aspx?)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeDecodePathSegment(value: string | undefined) {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isCompleteHttpUrl(value: string) {
  const parsed = canonicalReportUrl(value);
  return Boolean(parsed && !/\s/.test(parsed.url));
}

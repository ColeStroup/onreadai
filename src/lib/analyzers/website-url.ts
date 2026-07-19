const trackingParams = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "msclkid",
];

const usefulQueryParams = new Set([
  "page",
  "p",
  "category",
  "cat",
  "product",
  "collection",
]);

export function comparableWebsiteHostname(hostname: string) {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

export function isSameWebsiteHostname(
  hostname: string,
  expectedHostname: string,
) {
  return (
    comparableWebsiteHostname(hostname) ===
    comparableWebsiteHostname(expectedHostname)
  );
}

export function canonicalWebsitePathname(pathname: string) {
  let path = pathname || "/";

  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the encoded path when it cannot be decoded safely.
  }

  path = path.replace(/\/+/g, "/");

  if (path.length > 1) {
    path = path.replace(/\/+$/, "");
  }

  if (
    /^\/(?:home|index|default)(?:\.(?:html?|php|aspx?))?$/i.test(path)
  ) {
    return "/";
  }

  path = path.replace(/\/(?:index|default)\.(?:html?|php|aspx?)$/i, "");

  if (path.length > 1) {
    path = path.replace(/\/+$/, "");
  }

  return path || "/";
}

export function isHomepagePath(pathname: string) {
  return canonicalWebsitePathname(pathname) === "/";
}

export function sanitizeCrawlUrl(input: string | URL) {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input);

  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  for (const param of trackingParams) {
    url.searchParams.delete(param);
  }

  const usefulParams = new URLSearchParams();
  const sortedParams = [...url.searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (const [key, value] of sortedParams) {
    if (usefulQueryParams.has(key.toLowerCase())) {
      usefulParams.set(key, value);
    }
  }

  url.search = usefulParams.toString();

  return url;
}

export function crawlUrlKey(input: string | URL) {
  const url = sanitizeCrawlUrl(input);
  const port = url.port ? `:${url.port}` : "";

  return `${comparableWebsiteHostname(url.hostname)}${port}${canonicalWebsitePathname(
    url.pathname,
  ).toLowerCase()}${url.search}`;
}

export function urlsShareWebsite(
  first: string | URL,
  second: string | URL,
) {
  try {
    const firstUrl = first instanceof URL ? first : new URL(first);
    const secondUrl = second instanceof URL ? second : new URL(second);

    return isSameWebsiteHostname(firstUrl.hostname, secondUrl.hostname);
  } catch {
    return false;
  }
}

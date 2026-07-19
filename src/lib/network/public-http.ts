import "server-only";

import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";

import { Agent, fetch as undiciFetch } from "undici";

export type PublicTextResponse = {
  ok: boolean;
  status: number;
  url: string;
  headers: Headers;
  text: string;
  truncated: boolean;
};

export class PublicHttpError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_URL"
      | "UNSAFE_PORT"
      | "UNSAFE_HOST"
      | "UNSAFE_REDIRECT"
      | "TOO_MANY_REDIRECTS"
      | "TIMEOUT"
      | "FETCH_FAILED",
  ) {
    super(message);
    this.name = "PublicHttpError";
  }
}

export function publicHttpErrorMessage(error: unknown, fallback: string) {
  return error instanceof PublicHttpError ? error.message : fallback;
}

const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

const blockedHostnameSuffixes = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
];

type ResolvedAddress = { address: string; family: number };
type ResolveHostname = (hostname: string) => Promise<ResolvedAddress[]>;
type PublicRequestInit = {
  signal?: AbortSignal | null;
  redirect?: RequestRedirect;
  headers?: HeadersInit;
  method?: string;
};
type PublicFetch = (
  input: string | URL,
  init: PublicRequestInit,
) => Promise<Response>;

const defaultResolver: ResolveHostname = (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

export function createPublicLookup(
  resolveHostname: ResolveHostname = defaultResolver,
): LookupFunction {
  return (hostname, options, callback) => {
    resolveHostname(hostname)
      .then((addresses) => {
        const family = Number(options.family ?? 0);
        const eligible = addresses.filter(
          (entry) =>
            (family !== 4 && family !== 6 ? true : entry.family === family) &&
            !isBlockedIp(entry.address),
        );

        if (
          eligible.length === 0 ||
          eligible.length !== addresses.filter(
            (entry) => family !== 4 && family !== 6 ? true : entry.family === family,
          ).length
        ) {
          const error = new Error(
            "The website resolved to an unsafe network address.",
          ) as NodeJS.ErrnoException;
          error.code = "EACCES";
          callback(error, "");
          return;
        }

        if (options.all) {
          callback(null, eligible);
          return;
        }

        const selected = eligible[0]!;
        callback(null, selected.address, selected.family);
      })
      .catch(() => {
        const error = new Error(
          "The website hostname could not be resolved.",
        ) as NodeJS.ErrnoException;
        error.code = "ENOTFOUND";
        callback(error, "");
      });
  };
}

const publicDispatcher = new Agent({
  connect: {
    lookup: createPublicLookup(),
  },
});

const defaultPublicFetch: PublicFetch = async (input, init) => {
  const response = await undiciFetch(input, {
    signal: init.signal,
    redirect: init.redirect,
    headers: init.headers,
    method: init.method,
    dispatcher: publicDispatcher,
  });

  return response as unknown as Response;
};

export async function assertPublicHttpUrl(
  input: string | URL,
  resolveHostname: ResolveHostname = defaultResolver,
) {
  let url: URL;

  try {
    url = input instanceof URL ? new URL(input) : new URL(input);
  } catch {
    throw new PublicHttpError("The website URL is invalid.", "INVALID_URL");
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new PublicHttpError(
      "Only public HTTP and HTTPS URLs can be analyzed.",
      "INVALID_URL",
    );
  }

  if (url.username || url.password) {
    throw new PublicHttpError(
      "Credentialed website URLs cannot be analyzed.",
      "INVALID_URL",
    );
  }

  if (url.port) {
    throw new PublicHttpError(
      "Only standard public web ports can be analyzed.",
      "UNSAFE_PORT",
    );
  }

  const hostname = normalizeHostname(url.hostname);

  if (
    !hostname ||
    blockedHostnames.has(hostname) ||
    blockedHostnameSuffixes.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new PublicHttpError(
      "Private or local network addresses cannot be analyzed.",
      "UNSAFE_HOST",
    );
  }

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new PublicHttpError(
        "Private or reserved IP addresses cannot be analyzed.",
        "UNSAFE_HOST",
      );
    }

    return url;
  }

  let addresses: Array<{ address: string; family: number }>;

  try {
    addresses = await resolveHostname(hostname);
  } catch {
    throw new PublicHttpError(
      "The website hostname could not be resolved.",
      "FETCH_FAILED",
    );
  }

  if (
    addresses.length === 0 ||
    addresses.some((entry) => isBlockedIp(entry.address))
  ) {
    throw new PublicHttpError(
      "The website resolved to a private or reserved network address.",
      "UNSAFE_HOST",
    );
  }

  return url;
}

export async function fetchPublicText(
  input: string | URL,
  options: {
    timeoutMs: number;
    maxBytes: number;
    accept: string;
    userAgent: string;
    allowedHostname?: string;
    maxRedirects?: number;
    fetchImpl?: PublicFetch;
    resolveHostname?: ResolveHostname;
  },
): Promise<PublicTextResponse> {
  const fetchImpl = options.fetchImpl ?? defaultPublicFetch;
  const resolveHostname = options.resolveHostname ?? defaultResolver;
  let currentUrl = await assertPublicHttpUrl(input, resolveHostname);
  const maxRedirects = Math.max(0, Math.min(options.maxRedirects ?? 5, 8));
  const allowedHostname = options.allowedHostname
    ? comparableHostname(options.allowedHostname)
    : null;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    if (
      allowedHostname &&
      comparableHostname(currentUrl.hostname) !== allowedHostname
    ) {
      throw new PublicHttpError(
        "The website redirected outside the allowed hostname.",
        "UNSAFE_REDIRECT",
      );
    }

    await assertPublicHttpUrl(currentUrl, resolveHostname);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response;

    try {
      response = await fetchImpl(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          accept: options.accept,
          "user-agent": options.userAgent,
        },
      });
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof Error && error.name === "AbortError") {
        throw new PublicHttpError("The public website request timed out.", "TIMEOUT");
      }

      throw new PublicHttpError("The public website request failed.", "FETCH_FAILED");
    }

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      clearTimeout(timeout);

      if (!location) {
        throw new PublicHttpError(
          "The website returned an invalid redirect.",
          "UNSAFE_REDIRECT",
        );
      }

      if (redirectCount === maxRedirects) {
        throw new PublicHttpError(
          "The website returned too many redirects.",
          "TOO_MANY_REDIRECTS",
        );
      }

      currentUrl = await assertPublicHttpUrl(
        new URL(location, currentUrl),
        resolveHostname,
      );
      continue;
    }

    let body: Awaited<ReturnType<typeof readBoundedText>>;

    try {
      body = await readBoundedText(response, options.maxBytes);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new PublicHttpError(
          "The public website response timed out.",
          "TIMEOUT",
        );
      }

      throw new PublicHttpError(
        "The public website response could not be read.",
        "FETCH_FAILED",
      );
    } finally {
      clearTimeout(timeout);
    }

    return {
      ok: response.ok,
      status: response.status,
      url: currentUrl.toString(),
      headers: response.headers,
      text: body.text,
      truncated: body.truncated,
    };
  }

  throw new PublicHttpError(
    "The website returned too many redirects.",
    "TOO_MANY_REDIRECTS",
  );
}

function isRedirectStatus(status: number) {
  return [301, 302, 303, 307, 308].includes(status);
}

async function readBoundedText(response: Response, maxBytes: number) {
  const safeLimit = Math.max(1_024, Math.min(maxBytes, 2_000_000));
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body?.getReader();

  if (!reader) {
    const text = await response.text();
    return {
      text: text.slice(0, safeLimit),
      truncated: text.length > safeLimit || declaredLength > safeLimit,
    };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = declaredLength > safeLimit;

  while (total < safeLimit) {
    const { done, value } = await reader.read();

    if (done) break;

    const remaining = safeLimit - total;
    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    total += chunk.byteLength;

    if (value.byteLength > remaining) {
      truncated = true;
      break;
    }
  }

  if (total >= safeLimit) {
    const next = await reader.read();
    truncated = truncated || !next.done;
  }

  await reader.cancel().catch(() => undefined);
  const combined = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder("utf-8", { fatal: false }).decode(combined),
    truncated,
  };
}

function normalizeHostname(value: string) {
  return value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function comparableHostname(value: string) {
  return normalizeHostname(value).replace(/^www\./, "");
}

export function isBlockedIp(value: string) {
  const normalized = normalizeHostname(value);

  if (isIP(normalized) === 4) {
    const parts = normalized.split(".").map(Number);
    const [a, b] = parts;

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && parts[2] === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && parts[2] === 100) ||
      (a === 203 && b === 0 && parts[2] === 113) ||
      a >= 224
    );
  }

  if (isIP(normalized) === 6) {
    const segments = expandIpv6(normalized);
    if (!segments) return true;

    if (
      segments.slice(0, 5).every((segment) => segment === 0) &&
      segments[5] === 0xffff
    ) {
      const mapped = `${segments[6] >> 8}.${segments[6] & 255}.${segments[7] >> 8}.${segments[7] & 255}`;
      return isBlockedIp(mapped);
    }

    const first = segments[0];

    return (
      segments.every((segment) => segment === 0) ||
      (segments.slice(0, 7).every((segment) => segment === 0) &&
        segments[7] === 1) ||
      (first & 0xfe00) === 0xfc00 ||
      (first & 0xffc0) === 0xfe80 ||
      (first & 0xff00) === 0xff00 ||
      (segments[0] === 0x2001 && segments[1] === 0x0db8) ||
      (segments[0] === 0x2001 && segments[1] === 0x0000) ||
      segments[0] === 0x2002 ||
      (segments[0] === 0x0064 && segments[1] === 0xff9b)
    );
  }

  return true;
}

function expandIpv6(value: string) {
  const normalized = value.toLowerCase().split("%")[0];
  const halves = normalized.split("::");
  if (halves.length > 2) return null;

  const left = parseIpv6Half(halves[0]);
  const right = halves.length === 2 ? parseIpv6Half(halves[1]) : [];
  if (!left || !right) return null;

  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;

  return [...left, ...Array(missing).fill(0), ...right] as number[];
}

function parseIpv6Half(value: string) {
  if (!value) return [];
  const parts = value.split(":");
  const result: number[] = [];

  for (const part of parts) {
    if (part.includes(".")) {
      const octets = part.split(".").map(Number);
      if (
        octets.length !== 4 ||
        octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
      ) {
        return null;
      }
      result.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    result.push(Number.parseInt(part, 16));
  }

  return result;
}

import { createHash } from "node:crypto";

import { assertPublicHttpUrl } from "@/lib/network/public-http";

export const RENDERED_FETCH_ANALYZER_VERSION = "rendered-fetch-escalation-v1";

export type RenderedPageResult = {
  status: "SUCCESS" | "FAILED" | "UNAVAILABLE";
  finalUrl: string;
  html: string | null;
  renderedTextSize: number;
  durationMs: number;
  errorClassification: string | null;
  cacheHit: boolean;
};

export type RenderedPageFetcher = (input: {
  url: string;
  allowedHostname: string;
  timeoutMs: number;
  maxBytes: number;
  rawContentHash: string;
}) => Promise<RenderedPageResult>;

const cache = new Map<string, RenderedPageResult>();
const maximumCacheEntries = 40;

export function renderedFetchEscalationSignals({
  html,
  extractedText,
}: {
  html: string;
  extractedText: string;
}) {
  const signals: string[] = [];
  const normalizedText = extractedText.replace(/\s+/g, " ").trim();
  const scriptBytes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].reduce(
    (total, match) => total + (match[1]?.length ?? 0),
    0,
  );
  const hasEmptyMain = /<main\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)?<\/main>/i.test(html);
  const frameworkShell =
    /(?:id=["'](?:__next|root|app)["']|data-reactroot|__NEXT_DATA__|ng-version|data-v-app)/i.test(
      html,
    );
  const clientRedirect =
    /location\.(?:href|replace)|window\.location|http-equiv=["']refresh/i.test(html);

  if (normalizedText.length < 120 && html.length > 4_000) {
    signals.push("VERY_LITTLE_READABLE_TEXT");
  }
  if (hasEmptyMain) signals.push("EMPTY_MAIN_ELEMENT");
  if (frameworkShell && normalizedText.length < 400) {
    signals.push("CLIENT_FRAMEWORK_SHELL");
  }
  if (scriptBytes > Math.max(20_000, normalizedText.length * 20)) {
    signals.push("SCRIPT_TO_TEXT_MISMATCH");
  }
  if (clientRedirect) signals.push("CLIENT_SIDE_REDIRECT_SIGNAL");

  return signals;
}

export function shouldUseRenderedFetch(input: {
  html: string;
  extractedText: string;
}) {
  const signals = renderedFetchEscalationSignals(input);
  return {
    shouldRender: signals.length >= 2 || signals.includes("EMPTY_MAIN_ELEMENT"),
    signals,
  };
}

export const defaultRenderedPageFetcher: RenderedPageFetcher = async (input) => {
  const cacheKey = `${RENDERED_FETCH_ANALYZER_VERSION}:${input.rawContentHash}:${comparableUrl(input.url)}`;
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  const startedAt = Date.now();
  let browser: Awaited<ReturnType<PlaywrightModule["chromium"]["launch"]>> | null = null;

  try {
    const playwright = (await import("@playwright/test")) as PlaywrightModule;
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
      viewport: { width: 1280, height: 900 },
      javaScriptEnabled: true,
    });
    const page = await context.newPage();
    const allowedHost = comparableHostname(input.allowedHostname);
    let blockedUnsafeNavigation = false;

    page.on("popup", (popup) => void popup.close());
    page.on("download", (download) => void download.cancel());
    await page.route("**/*", async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      if (["media", "font"].includes(resourceType)) {
        await route.abort("blockedbyclient");
        return;
      }

      try {
        const url = await assertPublicHttpUrl(request.url());
        if (
          request.isNavigationRequest() &&
          comparableHostname(url.hostname) !== allowedHost
        ) {
          blockedUnsafeNavigation = true;
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      } catch {
        if (request.isNavigationRequest()) blockedUnsafeNavigation = true;
        await route.abort("blockedbyclient");
      }
    });

    const response = await page.goto(input.url, {
      waitUntil: "domcontentloaded",
      timeout: input.timeoutMs,
    });
    await page.waitForTimeout(Math.min(1_250, Math.max(250, input.timeoutMs / 8)));
    const finalUrl = page.url();
    const final = await assertPublicHttpUrl(finalUrl);
    if (comparableHostname(final.hostname) !== allowedHost) {
      throw new Error("RENDERED_NAVIGATION_LEFT_ALLOWED_HOST");
    }
    const html = await page.content();
    const text = await page.locator("body").innerText().catch(() => "");
    await context.close();

    if (!response || response.status() >= 400 || blockedUnsafeNavigation) {
      throw new Error(
        blockedUnsafeNavigation
          ? "RENDERED_REQUEST_POLICY_BLOCKED"
          : `RENDERED_HTTP_${response?.status() ?? "UNKNOWN"}`,
      );
    }

    const boundedHtml = html.slice(0, input.maxBytes);
    const result: RenderedPageResult = {
      status: "SUCCESS",
      finalUrl,
      html: boundedHtml,
      renderedTextSize: Buffer.byteLength(text, "utf8"),
      durationMs: Date.now() - startedAt,
      errorClassification: html.length > input.maxBytes ? "HTML_TRUNCATED" : null,
      cacheHit: false,
    };
    putCache(cacheKey, result);
    return result;
  } catch (error) {
    const result: RenderedPageResult = {
      status: isBrowserUnavailable(error) ? "UNAVAILABLE" : "FAILED",
      finalUrl: input.url,
      html: null,
      renderedTextSize: 0,
      durationMs: Date.now() - startedAt,
      errorClassification: safeErrorClassification(error),
      cacheHit: false,
    };
    putCache(cacheKey, result);
    return result;
  } finally {
    await browser?.close().catch(() => undefined);
  }
};

export function rawPageContentHash(html: string) {
  return createHash("sha256").update(html).digest("hex");
}

function putCache(key: string, value: RenderedPageResult) {
  if (cache.size >= maximumCacheEntries) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, value);
}

type PlaywrightModule = typeof import("@playwright/test");

function comparableHostname(value: string) {
  return value.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function comparableUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return `${comparableHostname(url.hostname)}${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function isBrowserUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /executable doesn.t exist|cannot find package|cannot find module|browser.*not found/i.test(
    message,
  );
}

function safeErrorClassification(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout/i.test(message)) return "TIMEOUT";
  if (/LEFT_ALLOWED_HOST/i.test(message)) return "UNSAFE_REDIRECT";
  if (/POLICY_BLOCKED/i.test(message)) return "REQUEST_POLICY_BLOCKED";
  if (/HTTP_\d+/.test(message)) return message.match(/HTTP_\d+/)?.[0] ?? "HTTP_ERROR";
  if (isBrowserUnavailable(error)) return "BROWSER_UNAVAILABLE";
  return "RENDER_FAILED";
}

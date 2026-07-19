import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPublicHttpUrl,
  createPublicLookup,
  fetchPublicText,
  isBlockedIp,
  PublicHttpError,
} from "@/lib/network/public-http";

const publicResolver = async () => [{ address: "93.184.216.34", family: 4 }];

test("rejects non-web protocols, credentials, private hosts, and custom ports", async () => {
  for (const input of [
    "file:///etc/passwd",
    "ftp://example.com/file",
    "http://user:password@example.com",
    "http://localhost",
    "http://127.0.0.1",
    "http://169.254.169.254/latest/meta-data",
    "https://example.com:8443",
  ]) {
    await assert.rejects(() => assertPublicHttpUrl(input, publicResolver));
  }
});

test("socket lookup rejects DNS rebinding to a private address", async () => {
  const socketLookup = createPublicLookup(async () => [
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]);

  await new Promise<void>((resolve, reject) => {
    socketLookup("example.com", { all: false }, (error) => {
      try {
        assert.equal(error?.code, "EACCES");
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });
  });
});

test("blocks private and reserved IPv4 and IPv6 representations", () => {
  for (const address of [
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ]) {
    assert.equal(isBlockedIp(address), true, address);
  }

  assert.equal(isBlockedIp("93.184.216.34"), false);
  assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
});

test("rejects a redirect from a public host to a private address", async () => {
  await assert.rejects(
    () =>
      fetchPublicText("https://example.com", {
        timeoutMs: 100,
        maxBytes: 10_000,
        accept: "text/html",
        userAgent: "OnreadBot/1.0",
        resolveHostname: publicResolver,
        fetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/admin" },
          }),
      }),
    (error) => error instanceof PublicHttpError && error.code === "UNSAFE_HOST",
  );
});

test("bounds decompressed response text", async () => {
  const response = await fetchPublicText("https://example.com", {
    timeoutMs: 100,
    maxBytes: 1_024,
    accept: "text/html",
    userAgent: "OnreadBot/1.0",
    resolveHostname: publicResolver,
    fetchImpl: async () => new Response("x".repeat(5_000), { status: 200 }),
  });

  assert.equal(response.text.length, 1_024);
  assert.equal(response.truncated, true);
});

test("times out slow public requests", async () => {
  const slowFetch: typeof fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  await assert.rejects(
    () =>
      fetchPublicText("https://example.com", {
        timeoutMs: 5,
        maxBytes: 10_000,
        accept: "text/html",
        userAgent: "OnreadBot/1.0",
        resolveHostname: publicResolver,
        fetchImpl: slowFetch,
      }),
    (error) => error instanceof PublicHttpError && error.code === "TIMEOUT",
  );
});

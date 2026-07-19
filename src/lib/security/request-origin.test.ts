import assert from "node:assert/strict";
import test from "node:test";

import { isSameOriginMutation } from "@/lib/security/request-origin";

test("accepts a same-origin mutation", () => {
  const request = new Request("https://onread.ai/api/stripe/checkout", {
    method: "POST",
    headers: { origin: "https://onread.ai", "sec-fetch-site": "same-origin" },
  });
  assert.equal(isSameOriginMutation(request), true);
});

test("rejects missing, null, and cross-site origins", () => {
  const requests = [
    new Request("https://onread.ai/api/stripe/checkout", { method: "POST" }),
    new Request("https://onread.ai/api/stripe/checkout", {
      method: "POST",
      headers: { origin: "null" },
    }),
    new Request("https://onread.ai/api/stripe/checkout", {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    }),
  ];

  for (const request of requests) {
    assert.equal(isSameOriginMutation(request), false);
  }
});

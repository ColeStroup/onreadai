import assert from "node:assert/strict";
import test from "node:test";

import { ProfilePlatform } from "@prisma/client";

import {
  isGoogleBusinessUrl,
  normalizeProfileUrlSyntax,
  ProfileUrlError,
  profileUrlComparisonKey,
} from "@/lib/profiles/profile-url";

test("normalizes supported profile URLs without inventing handles", () => {
  const result = normalizeProfileUrlSyntax(
    " instagram.com/Example/?utm_source=setup#bio ",
    ProfilePlatform.INSTAGRAM,
  );

  assert.equal(result.url, "https://www.instagram.com/Example");
  assert.equal(result.normalizedUrl, "https://instagram.com/Example");
});

test("normalizes protocol, www, fragment, and trailing slash differences for duplicates", () => {
  const left = profileUrlComparisonKey(
    "http://www.example.com/path/#details",
    ProfilePlatform.WEBSITE,
  );
  const right = profileUrlComparisonKey(
    "https://example.com/path",
    ProfilePlatform.WEBSITE,
  );

  assert.equal(left, right);
});

test("rejects unsupported schemes and ambiguous handles", () => {
  assert.throws(
    () =>
      normalizeProfileUrlSyntax(
        "javascript://instagram.com/example",
        ProfilePlatform.INSTAGRAM,
      ),
    (error: unknown) =>
      error instanceof ProfileUrlError &&
      error.code === "UNSUPPORTED_SCHEME",
  );
  assert.throws(
    () =>
      normalizeProfileUrlSyntax("@example", ProfilePlatform.INSTAGRAM),
    (error: unknown) =>
      error instanceof ProfileUrlError && error.code === "INVALID_URL",
  );
});

test("rejects a URL that does not match the selected platform", () => {
  assert.throws(
    () =>
      normalizeProfileUrlSyntax(
        "https://facebook.com/example",
        ProfilePlatform.INSTAGRAM,
      ),
    (error: unknown) =>
      error instanceof ProfileUrlError &&
      error.code === "PLATFORM_MISMATCH",
  );
});

test("accepts supported Google Maps and Business Profile links", () => {
  const links = [
    "https://www.google.com/maps/place/Example",
    "https://maps.app.goo.gl/abc123",
    "https://g.page/example",
  ];

  for (const link of links) {
    assert.equal(isGoogleBusinessUrl(link), true);
    const result = normalizeProfileUrlSyntax(
      link,
      ProfilePlatform.GOOGLE_BUSINESS,
    );
    assert.match(result.url, /^https:/);
  }
});

test("does not treat the Google homepage as a business listing", () => {
  assert.equal(isGoogleBusinessUrl("https://google.com/"), false);
  assert.throws(
    () =>
      normalizeProfileUrlSyntax(
        "https://google.com/",
        ProfilePlatform.GOOGLE_BUSINESS,
      ),
    ProfileUrlError,
  );
});

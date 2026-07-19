import assert from "node:assert/strict";
import test from "node:test";

import {
  BusinessInputType,
  BusinessProfileStatus,
  ProfilePlatform,
} from "@prisma/client";

import {
  discoverSubmittedProfiles,
  submittedCompetitorWebsiteProfile,
} from "@/lib/discovery/submitted-profile-discovery";

test("website submission preserves only the submitted website", () => {
  const profiles = discoverSubmittedProfiles(
    "example.com",
    BusinessInputType.WEBSITE,
  );

  assert.deepEqual(profiles, [
    {
      platform: ProfilePlatform.WEBSITE,
      label: "Website",
      url: "https://example.com",
      confidenceScore: 100,
      status: BusinessProfileStatus.PENDING,
    },
  ]);
});

test("social submission preserves only the submitted social profile", () => {
  const profiles = discoverSubmittedProfiles(
    "instagram.com/example",
    BusinessInputType.SOCIAL_PROFILE,
  );

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0]?.platform, ProfilePlatform.INSTAGRAM);
  assert.equal(profiles[0]?.url, "https://instagram.com/example");
});

test("a business name does not fabricate profiles", () => {
  assert.deepEqual(
    discoverSubmittedProfiles(
      "Harbor and Pine Studio",
      BusinessInputType.BUSINESS_NAME,
    ),
    [],
  );
});

test("competitor setup seeds only an explicitly submitted website", () => {
  const profiles = submittedCompetitorWebsiteProfile("https://example.com");
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0]?.platform, ProfilePlatform.WEBSITE);
  assert.equal(profiles[0]?.urlOrHandle, "https://example.com");
});

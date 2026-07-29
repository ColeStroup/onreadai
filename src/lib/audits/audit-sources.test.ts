import assert from "node:assert/strict";
import test from "node:test";

import {
  BusinessProfileStatus,
  ProfilePlatform,
} from "@prisma/client";

import { approvedBusinessProfilesForAudit } from "@/lib/audits/audit-sources";

test("audit inputs include only confirmed profiles with a saved source", () => {
  const profiles = [
    {
      id: "confirmed",
      platform: ProfilePlatform.INSTAGRAM,
      status: BusinessProfileStatus.CONFIRMED,
      url: "https://instagram.com/example",
      handle: null,
    },
    {
      id: "pending",
      platform: ProfilePlatform.FACEBOOK,
      status: BusinessProfileStatus.PENDING,
      url: "https://facebook.com/example",
      handle: null,
    },
    {
      id: "removed",
      platform: ProfilePlatform.WEBSITE,
      status: BusinessProfileStatus.REMOVED,
      url: "https://example.com",
      handle: null,
    },
    {
      id: "empty",
      platform: ProfilePlatform.OTHER,
      status: BusinessProfileStatus.CONFIRMED,
      url: null,
      handle: null,
    },
  ];

  assert.deepEqual(
    approvedBusinessProfilesForAudit(profiles).map((profile) => profile.id),
    ["confirmed"],
  );
});

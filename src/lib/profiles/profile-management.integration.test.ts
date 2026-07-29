import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

import {
  BusinessInputType,
  BusinessProfileSource,
  BusinessProfileStatus,
  ProfilePlatform,
  ProfileReviewDecision,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  addManualBusinessProfile,
  confirmBusinessProfile,
  ProfileMutationError,
  removeBusinessProfile,
  replaceGoogleBusinessCandidate,
  setBusinessPlatformDecision,
} from "@/lib/profiles/profile-management";

const databaseUrl = process.env.DATABASE_URL ?? "";
const databaseName = databaseUrl
  ? new URL(databaseUrl).pathname.replace(/^\/+/, "")
  : "";
const usesDedicatedTestDatabase = databaseName.includes(
  "guided_setup_profiles_test",
);
const runId = randomUUID();
let ownerId = "";
let otherOwnerId = "";
let businessId = "";
let otherBusinessId = "";
let discoveredProfileId = "";

describe(
  "guided profile persistence, idempotency, and isolation",
  { skip: !usesDedicatedTestDatabase },
  () => {
    before(async () => {
      const owner = await prisma.user.create({
        data: { email: `guided-owner-${runId}@example.test` },
      });
      const otherOwner = await prisma.user.create({
        data: { email: `guided-other-${runId}@example.test` },
      });
      ownerId = owner.id;
      otherOwnerId = otherOwner.id;

      const business = await prisma.business.create({
        data: {
          ownerId,
          name: "Guided setup test",
          initialInput: "instagram.com/guided-test",
          inputType: BusinessInputType.SOCIAL_PROFILE,
          profiles: {
            create: {
              platform: ProfilePlatform.INSTAGRAM,
              url: "https://www.instagram.com/guided-test",
              normalizedUrl: "https://instagram.com/guided-test",
              status: BusinessProfileStatus.PENDING,
              source: BusinessProfileSource.SUBMITTED,
              confidenceScore: 100,
            },
          },
        },
        include: { profiles: true },
      });
      const otherBusiness = await prisma.business.create({
        data: {
          ownerId: otherOwnerId,
          name: "Other tenant",
          initialInput: "Other tenant",
        },
      });
      businessId = business.id;
      otherBusinessId = otherBusiness.id;
      discoveredProfileId = business.profiles[0]!.id;
    });

    after(async () => {
      await prisma.user.deleteMany({
        where: { id: { in: [ownerId, otherOwnerId].filter(Boolean) } },
      });
    });

    test("repeated confirmation is idempotent", async () => {
      await confirmBusinessProfile({
        businessId,
        profileId: discoveredProfileId,
      });
      await confirmBusinessProfile({
        businessId,
        profileId: discoveredProfileId,
      });

      const profiles = await prisma.businessProfile.findMany({
        where: { businessId, id: discoveredProfileId },
      });
      assert.equal(profiles.length, 1);
      assert.equal(profiles[0]?.status, BusinessProfileStatus.CONFIRMED);
      assert.equal(profiles[0]?.isConfirmed, true);
      assert.ok(profiles[0]?.confirmedAt);
    });

    test("a profile cannot be mutated through another tenant business", async () => {
      await assert.rejects(
        removeBusinessProfile({
          businessId: otherBusinessId,
          profileId: discoveredProfileId,
        }),
        (error: unknown) =>
          error instanceof ProfileMutationError &&
          error.code === "NOT_FOUND",
      );

      const profile = await prisma.businessProfile.findUnique({
        where: { id: discoveredProfileId },
      });
      assert.equal(profile?.status, BusinessProfileStatus.CONFIRMED);
    });

    test("manual profiles record user provenance and reject normalized duplicates", async () => {
      const profile = await addManualBusinessProfile({
        businessId,
        platform: ProfilePlatform.WEBSITE,
        url: "https://example.com/?utm_source=guided-setup",
      });

      assert.equal(profile.source, BusinessProfileSource.MANUAL);
      assert.equal(profile.status, BusinessProfileStatus.CONFIRMED);
      assert.equal(profile.confidenceScore, 0);
      assert.ok(profile.manuallyAddedAt);

      await assert.rejects(
        addManualBusinessProfile({
          businessId,
          platform: ProfilePlatform.WEBSITE,
          url: "http://www.example.com/",
        }),
        (error: unknown) =>
          error instanceof ProfileMutationError &&
          error.code === "DUPLICATE",
      );
    });

    test("skip and not-used decisions persist as distinct states", async () => {
      await setBusinessPlatformDecision({
        businessId,
        platform: ProfilePlatform.GOOGLE_BUSINESS,
        decision: ProfileReviewDecision.SKIPPED,
      });
      let decision = await prisma.businessProfileDecision.findUnique({
        where: {
          businessId_platform: {
            businessId,
            platform: ProfilePlatform.GOOGLE_BUSINESS,
          },
        },
      });
      assert.equal(decision?.decision, ProfileReviewDecision.SKIPPED);

      await setBusinessPlatformDecision({
        businessId,
        platform: ProfilePlatform.GOOGLE_BUSINESS,
        decision: ProfileReviewDecision.NOT_USED,
      });
      decision = await prisma.businessProfileDecision.findUnique({
        where: {
          businessId_platform: {
            businessId,
            platform: ProfilePlatform.GOOGLE_BUSINESS,
          },
        },
      });
      assert.equal(decision?.decision, ProfileReviewDecision.NOT_USED);
    });

    test("editing a Google candidate creates one confirmed manual profile", async () => {
      const candidate = await prisma.googleBusinessProfile.create({
        data: {
          businessId,
          googlePlaceId: `guided-place-${runId}`,
          displayName: "Incorrect discovery",
          googleMapsUri: "https://maps.google.com/",
          status: "pending",
          source: "places_api",
        },
      });

      const profile = await replaceGoogleBusinessCandidate({
        businessId,
        candidateId: candidate.id,
        url: "https://www.google.com/maps/place/Guided+Setup+Test",
        displayName: "Guided Setup Test",
      });

      assert.equal(profile.platform, ProfilePlatform.GOOGLE_BUSINESS);
      assert.equal(profile.status, BusinessProfileStatus.CONFIRMED);
      assert.equal(profile.source, BusinessProfileSource.MANUAL);
      assert.equal(profile.displayName, "Guided Setup Test");

      const [savedCandidate, savedProfiles, decision] = await Promise.all([
        prisma.googleBusinessProfile.findUnique({
          where: { id: candidate.id },
        }),
        prisma.businessProfile.findMany({
          where: {
            businessId,
            platform: ProfilePlatform.GOOGLE_BUSINESS,
          },
        }),
        prisma.businessProfileDecision.findUnique({
          where: {
            businessId_platform: {
              businessId,
              platform: ProfilePlatform.GOOGLE_BUSINESS,
            },
          },
        }),
      ]);

      assert.equal(savedCandidate?.status, "removed");
      assert.equal(savedProfiles.length, 1);
      assert.equal(savedProfiles[0]?.id, profile.id);
      assert.equal(decision, null);
    });
  },
);

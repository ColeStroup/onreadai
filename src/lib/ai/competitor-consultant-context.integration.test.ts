import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  AuditStatus,
  BusinessProfileStatus,
  CompetitorSnapshotStatus,
  CompetitorStatus,
  ProfilePlatform,
} from "@prisma/client";

import { buildCompetitorConsultantContext } from "@/lib/ai/competitor-consultant-context";
import { prisma } from "@/lib/prisma";

test(
  "competitor context remains tenant-isolated across complete and limited evidence states",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const suffix = randomUUID();
    const owner = await prisma.user.create({
      data: { email: `competitor-owner-${suffix}@example.test` },
    });
    const otherUser = await prisma.user.create({
      data: { email: `competitor-other-${suffix}@example.test` },
    });

    try {
      const business = await prisma.business.create({
        data: {
          ownerId: owner.id,
          name: "Competitor Context Test",
          initialInput: "Competitor Context Test",
          profiles: {
            create: {
              platform: ProfilePlatform.INSTAGRAM,
              status: BusinessProfileStatus.CONFIRMED,
              isConfirmed: true,
              url: "https://instagram.com/context-test",
            },
          },
        },
      });
      const audit = await prisma.audit.create({
        data: {
          businessId: business.id,
          status: AuditStatus.COMPLETED,
          overallScore: 60,
          summary: "Deterministic integration fixture.",
          completedAt: new Date(),
          analysisSnapshot: {},
        },
      });

      await prisma.competitor.create({
        data: {
          businessId: business.id,
          name: "Complete Competitor",
          websiteUrl: "https://complete.example/",
          status: CompetitorStatus.ACTIVE,
          discoveredProfiles: {
            create: {
              platform: ProfilePlatform.INSTAGRAM,
              label: "Instagram",
              urlOrHandle: "https://instagram.com/complete",
              status: BusinessProfileStatus.CONFIRMED,
              confidenceScore: 95,
            },
          },
          snapshots: {
            create: {
              status: CompetitorSnapshotStatus.COMPLETED,
              scannedAt: new Date(),
              socialCoverageScore: 55,
              completedSections: ["social"],
              failedSections: [],
              socialSnapshot: {
                score: 55,
                coverageLevel: "low",
                platformCount: 1,
                confirmedPlatforms: ["Instagram"],
                pendingPlatforms: [],
                detectedPlatforms: [],
                observations: [],
                limitations: [
                  "Individual posts and engagement metrics were not analyzed.",
                ],
                profiles: [
                  {
                    platform: "Instagram",
                    url: "https://instagram.com/complete",
                    status: "confirmed",
                    source: "saved_profile",
                  },
                ],
              },
            },
          },
        },
      });
      await prisma.competitor.create({
        data: {
          businessId: business.id,
          name: "No Profile Competitor",
          websiteUrl: "https://no-profile.example/",
          status: CompetitorStatus.ACTIVE,
        },
      });
      await prisma.competitor.create({
        data: {
          businessId: business.id,
          name: "Pending Profile Competitor",
          status: CompetitorStatus.ACTIVE,
          discoveredProfiles: {
            create: {
              platform: ProfilePlatform.TIKTOK,
              label: "TikTok",
              urlOrHandle: "https://tiktok.com/@pending",
              status: BusinessProfileStatus.PENDING,
              confidenceScore: 55,
            },
          },
        },
      });
      await prisma.competitor.create({
        data: {
          businessId: business.id,
          name: "Failed Snapshot Competitor",
          websiteUrl: "https://failed.example/",
          status: CompetitorStatus.ACTIVE,
          snapshots: {
            create: {
              status: CompetitorSnapshotStatus.FAILED,
              errorMessage: "Fixture failure",
              failedSections: ["website"],
            },
          },
        },
      });
      await prisma.competitor.create({
        data: {
          businessId: business.id,
          name: "Archived Competitor",
          websiteUrl: "https://archived.example/",
          status: CompetitorStatus.ARCHIVED,
        },
      });
      await prisma.competitor.create({
        data: {
          businessId: business.id,
          name: "Missing Website Competitor",
          websiteUrl: null,
          status: CompetitorStatus.ACTIVE,
        },
      });
      await prisma.competitor.create({
        data: {
          businessId: business.id,
          name: "Malformed Snapshot Competitor",
          websiteUrl: "https://malformed.example/",
          profiles: { legacy: [null, { platform: 42 }] },
          status: CompetitorStatus.ACTIVE,
          snapshots: {
            create: {
              status: CompetitorSnapshotStatus.COMPLETED,
              scannedAt: new Date("2020-01-01T00:00:00.000Z"),
              completedSections: ["social", "positioning"],
              failedSections: [],
              socialSnapshot: {
                score: 40,
                coverageLevel: "low",
                profiles: [null, { platform: null, status: "pending" }],
                confirmedPlatforms: null,
                pendingPlatforms: null,
                limitations: null,
              },
              positioningSnapshot: {
                score: 45,
                confidence: null,
                evidence: [null],
                secondaryCTAs: null,
                keyDifferentiators: null,
                limitations: null,
              },
            },
          },
        },
      });

      const context = await buildCompetitorConsultantContext({
        userId: owner.id,
        businessId: business.id,
        auditId: audit.id,
      });
      const crossTenant = await buildCompetitorConsultantContext({
        userId: otherUser.id,
        businessId: business.id,
        auditId: audit.id,
      });

      assert.ok(context);
      assert.equal(crossTenant, null);
      assert.equal(context.configuredCompetitors, 6);
      assert.equal(
        context.latestSnapshots.some(
          (snapshot) => snapshot.competitorName === "Archived Competitor",
        ),
        false,
      );

      const complete = context.latestSnapshots.find(
        (snapshot) => snapshot.competitorName === "Complete Competitor",
      );
      assert.equal(complete?.latestSnapshotStatus, "completed");
      assert.deepEqual(complete?.social.confirmedPlatforms, ["Instagram"]);

      const noProfile = context.latestSnapshots.find(
        (snapshot) => snapshot.competitorName === "No Profile Competitor",
      );
      assert.equal(noProfile?.latestSnapshotStatus, "not_analyzed");
      assert.deepEqual(noProfile?.social.confirmedProfiles, []);

      const pending = context.latestSnapshots.find(
        (snapshot) => snapshot.competitorName === "Pending Profile Competitor",
      );
      assert.deepEqual(pending?.social.pendingPlatforms, ["TikTok"]);

      const failed = context.latestSnapshots.find(
        (snapshot) => snapshot.competitorName === "Failed Snapshot Competitor",
      );
      assert.equal(failed?.latestSnapshotStatus, "failed");
      assert.ok(context.failedCompetitors.includes("Failed Snapshot Competitor"));

      const missingWebsite = context.latestSnapshots.find(
        (snapshot) => snapshot.competitorName === "Missing Website Competitor",
      );
      assert.equal(missingWebsite?.websiteUrl, null);
      assert.equal(missingWebsite?.website, null);

      const malformed = context.latestSnapshots.find(
        (snapshot) => snapshot.competitorName === "Malformed Snapshot Competitor",
      );
      assert.equal(malformed?.latestSnapshotStatus, "completed");
      assert.equal(malformed?.freshnessState, "stale");
      assert.deepEqual(malformed?.social.confirmedProfiles, []);
      assert.match(malformed?.social.limitations.join(" ") ?? "", /stored shape/i);
    } finally {
      await prisma.user.deleteMany({
        where: { id: { in: [owner.id, otherUser.id] } },
      });
    }
  },
);

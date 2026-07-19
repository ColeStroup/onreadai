import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { AuditStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildAuditReportViewModel } from "@/lib/reports/audit-report-view-model";

test(
  "completed audit reports are isolated to the business owner",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const suffix = randomUUID();
    const owner = await prisma.user.create({
      data: { email: `report-owner-${suffix}@example.test` },
    });
    const otherUser = await prisma.user.create({
      data: { email: `report-other-${suffix}@example.test` },
    });

    try {
      const business = await prisma.business.create({
        data: {
          ownerId: owner.id,
          name: "Tenant Isolation Test",
          initialInput: "Tenant Isolation Test",
        },
      });
      const audit = await prisma.audit.create({
        data: {
          businessId: business.id,
          status: AuditStatus.COMPLETED,
          overallScore: 72,
          summary: "A completed report used only for authorization testing.",
          completedAt: new Date(),
        },
      });

      const ownerReport = await buildAuditReportViewModel({
        businessId: business.id,
        auditId: audit.id,
        ownerId: owner.id,
      });
      const crossTenantReport = await buildAuditReportViewModel({
        businessId: business.id,
        auditId: audit.id,
        ownerId: otherUser.id,
      });

      assert.ok(ownerReport);
      assert.equal(crossTenantReport, null);
    } finally {
      await prisma.user.deleteMany({
        where: { id: { in: [owner.id, otherUser.id] } },
      });
    }
  },
);

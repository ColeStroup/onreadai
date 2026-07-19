import { AuditStatus } from "@prisma/client";
import { notFound } from "next/navigation";

import { AuditRunPanel } from "@/app/dashboard/businesses/[businessId]/audit/run/audit-run-panel";
import { hasConfirmedWebsite } from "@/lib/audits/audit-applicability";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

type AuditRunPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const runtime = "nodejs";
export const maxDuration = 800;

export default async function AuditRunPage({
  params,
  searchParams,
}: AuditRunPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = await searchParams;
  const auditId = typeof query.auditId === "string" ? query.auditId : undefined;
  const returnToSetup = query.returnTo === "setup";
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    select: {
      id: true,
      name: true,
      profiles: {
        select: {
          platform: true,
          status: true,
          url: true,
          handle: true,
        },
      },
      audits: auditId
        ? {
            where: {
              id: auditId,
            },
            select: {
              id: true,
              status: true,
            },
            take: 1,
          }
        : false,
    },
  });

  if (!business) {
    notFound();
  }

  const audit = auditId ? business.audits.at(0) : null;

  if (auditId && !audit) {
    notFound();
  }

  return (
    <AuditRunPanel
      businessId={business.id}
      businessName={business.name}
      initialAuditId={audit?.id}
      initialStatus={audit ? toRunStatus(audit.status) : "pending"}
      hasWebsite={hasConfirmedWebsite(business.profiles)}
      completionHref={
        returnToSetup
          ? `/dashboard/businesses/${business.id}/setup?step=results`
          : `/dashboard/businesses/${business.id}/overview`
      }
    />
  );
}

function toRunStatus(status: AuditStatus) {
  if (status === AuditStatus.COMPLETED) return "completed";
  if (status === AuditStatus.FAILED) return "failed";
  if (status === AuditStatus.RUNNING) return "running";
  return "pending";
}

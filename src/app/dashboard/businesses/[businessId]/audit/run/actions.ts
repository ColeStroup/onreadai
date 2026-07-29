"use server";

import { AuditStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { after } from "next/server";

import {
  createPendingAuditRun,
  activeRunWindowMs,
  runAuditGeneration,
  type AuditRunResult,
} from "@/lib/audits/audit-runner";
import { isAuditProgressStage } from "@/lib/audits/audit-progress";
import { canRunAudit } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";

type StartAuditRunInput = {
  businessId: string;
  auditId?: string | null;
};

export async function startAuditRun({
  businessId,
  auditId,
}: StartAuditRunInput): Promise<AuditRunResult> {
  const { user } = await requireOwnedBusiness(businessId);
  try {
    await enforceRateLimit({
      scope: "audit-run",
      identifiers: [user.id, businessId, await currentRequestRateLimitIdentifier()],
      limit: 10,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        auditId: auditId ?? "",
        status: "failed",
        error: "Please wait before starting another audit.",
      };
    }
    throw error;
  }
  const runCheck = await canRunAudit(user.id, businessId);

  if (!runCheck.allowed && !auditId) {
    return {
      auditId: "",
      status: "failed",
      error:
        runCheck.reason ??
        "Your current plan has reached the monthly audit limit.",
    };
  }

  const audit = auditId
    ? await prisma.audit.findFirst({
        where: {
          id: auditId,
          businessId,
        },
        select: {
          id: true,
          status: true,
          progressStage: true,
        },
      })
    : await createPendingAuditRun(businessId);

  if (!audit) {
    return {
      auditId: auditId ?? "",
      status: "failed",
      error: "Audit run was not found.",
    };
  }

  if (audit.status === AuditStatus.COMPLETED) {
    return {
      auditId: audit.id,
      status: "completed",
      progressStage: "PREPARING_RESULTS",
    };
  }

  after(async () => {
    await runAuditGeneration({ businessId, auditId: audit.id });
  });

  return {
    auditId: audit.id,
    status: audit.status === AuditStatus.RUNNING ? "running" : "pending",
    progressStage: isAuditProgressStage(audit.progressStage)
      ? audit.progressStage
      : "PREPARING_BUSINESS_INFORMATION",
  };
}

export async function getAuditRunStatus({
  businessId,
  auditId,
}: {
  businessId: string;
  auditId: string;
}): Promise<AuditRunResult> {
  await requireOwnedBusiness(businessId);

  const audit = await prisma.audit.findFirst({
    where: {
      id: auditId,
      businessId,
    },
    select: {
      id: true,
      status: true,
      summary: true,
      progressStage: true,
      updatedAt: true,
    },
  });

  if (!audit) {
    return {
      auditId,
      status: "failed",
      error: "Audit run was not found.",
    };
  }

  const isActive =
    audit.status === AuditStatus.PENDING ||
    audit.status === AuditStatus.QUEUED ||
    audit.status === AuditStatus.RUNNING;

  if (
    isActive &&
    audit.updatedAt.getTime() < Date.now() - activeRunWindowMs
  ) {
    await prisma.audit.update({
      where: { id: audit.id },
      data: {
        status: AuditStatus.FAILED,
        summary: "The audit run was interrupted before it completed. You can run it again.",
        completedAt: new Date(),
      },
    });
    return {
      auditId: audit.id,
      status: "failed",
      error: "The audit was interrupted. Please try again.",
    };
  }

  return {
    auditId: audit.id,
    status: toRunStatus(audit.status),
    progressStage: isAuditProgressStage(audit.progressStage)
      ? audit.progressStage
      : "PREPARING_BUSINESS_INFORMATION",
    error: audit.status === AuditStatus.FAILED ? audit.summary ?? undefined : undefined,
  };
}

async function requireOwnedBusiness(businessId: string) {
  const user = await requireUser(`/dashboard/businesses/${businessId}/audit/run`);
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    select: {
      id: true,
    },
  });

  if (!business) {
    notFound();
  }

  return {
    business,
    user,
  };
}

function toRunStatus(status: AuditStatus): AuditRunResult["status"] {
  if (status === AuditStatus.COMPLETED) return "completed";
  if (status === AuditStatus.FAILED) return "failed";
  if (status === AuditStatus.RUNNING) return "running";
  return "pending";
}

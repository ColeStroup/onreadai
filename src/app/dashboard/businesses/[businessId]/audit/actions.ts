"use server";

import {
  AuditFindingFeedbackStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { logInfo } from "@/lib/observability/log";
import {
  isFindingFeedbackReason,
  normalizeFindingFeedbackComment,
  ownedFindingFeedbackWhere,
} from "@/lib/audits/finding-feedback";
import { prisma } from "@/lib/prisma";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";
import { requireUser } from "@/lib/session";

export type FindingFeedbackActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function reportAuditFindingFeedback(
  _previousState: FindingFeedbackActionState,
  formData: FormData,
): Promise<FindingFeedbackActionState> {
  const businessId = formValue(formData, "businessId");
  const auditId = formValue(formData, "auditId");
  const findingId = formValue(formData, "findingId");
  const rawReason = formValue(formData, "reason");
  const comment = normalizeFindingFeedbackComment(
    formValue(formData, "comment"),
  );

  if (
    !businessId ||
    !auditId ||
    !findingId ||
    !isFindingFeedbackReason(rawReason)
  ) {
    return {
      status: "error",
      message: "Choose a reason and try again.",
    };
  }

  const user = await requireUser(`/dashboard/businesses/${businessId}/audit`);
  try {
    await enforceRateLimit({
      scope: "audit-finding-feedback",
      identifiers: [
        user.id,
        businessId,
        await currentRequestRateLimitIdentifier(),
      ],
      limit: 30,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        status: "error",
        message: "Please wait before submitting another finding report.",
      };
    }
    throw error;
  }
  const finding = await prisma.auditFinding.findFirst({
    where: ownedFindingFeedbackWhere({
      findingId,
      auditId,
      businessId,
      ownerId: user.id,
    }),
    select: { id: true },
  });

  if (!finding) {
    return {
      status: "error",
      message: "This finding is no longer available.",
    };
  }

  await prisma.auditFindingFeedback.upsert({
    where: {
      findingId_reporterId_reason: {
        findingId,
        reporterId: user.id,
        reason: rawReason,
      },
    },
    create: {
      findingId,
      auditId,
      businessId,
      reporterId: user.id,
      reason: rawReason,
      comment,
    },
    update: {
      comment,
      status: AuditFindingFeedbackStatus.PENDING,
      reviewedAt: null,
      reviewedById: null,
      reviewNotes: null,
    },
  });

  logInfo("audit_finding_feedback_recorded", {
    businessId,
    auditId,
    findingId,
    reason: rawReason,
  });
  revalidatePath(`/dashboard/businesses/${businessId}/audit`);

  return {
    status: "success",
    message: "Thanks. Your report was saved for review and did not change the score.",
  };
}

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

import { AuditFindingFeedbackReason } from "@prisma/client";

export const findingFeedbackReasons = Object.values(
  AuditFindingFeedbackReason,
);

export function isFindingFeedbackReason(
  value: string,
): value is AuditFindingFeedbackReason {
  return findingFeedbackReasons.includes(value as AuditFindingFeedbackReason);
}

export function normalizeFindingFeedbackComment(value: string) {
  const normalized = value.trim().slice(0, 1_000);
  return normalized || null;
}

export function ownedFindingFeedbackWhere({
  findingId,
  auditId,
  businessId,
  ownerId,
}: {
  findingId: string;
  auditId: string;
  businessId: string;
  ownerId: string;
}) {
  return {
    id: findingId,
    auditId,
    audit: {
      businessId,
      business: { ownerId },
    },
  } as const;
}


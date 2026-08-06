ALTER TYPE "AiOperationType" ADD VALUE IF NOT EXISTS 'FINDING_VALIDATION';

CREATE TYPE "AuditFindingFeedbackReason" AS ENUM (
  'INCORRECT',
  'ALREADY_FIXED',
  'NOT_RELEVANT',
  'UNABLE_TO_UNDERSTAND',
  'DUPLICATE',
  'TOO_MINOR',
  'WRONG_PAGE',
  'WRONG_EVIDENCE'
);

CREATE TYPE "AuditFindingFeedbackStatus" AS ENUM (
  'PENDING',
  'REVIEWED',
  'RESOLVED',
  'DISMISSED'
);

CREATE TABLE "AuditFindingFeedback" (
  "id" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "reason" "AuditFindingFeedbackReason" NOT NULL,
  "comment" TEXT,
  "status" "AuditFindingFeedbackStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AuditFindingFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditFindingFeedback_findingId_reporterId_reason_key"
  ON "AuditFindingFeedback"("findingId", "reporterId", "reason");
CREATE INDEX "AuditFindingFeedback_businessId_status_createdAt_idx"
  ON "AuditFindingFeedback"("businessId", "status", "createdAt");
CREATE INDEX "AuditFindingFeedback_auditId_idx"
  ON "AuditFindingFeedback"("auditId");
CREATE INDEX "AuditFindingFeedback_reporterId_idx"
  ON "AuditFindingFeedback"("reporterId");

ALTER TABLE "AuditFindingFeedback"
  ADD CONSTRAINT "AuditFindingFeedback_findingId_fkey"
  FOREIGN KEY ("findingId") REFERENCES "AuditFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditFindingFeedback"
  ADD CONSTRAINT "AuditFindingFeedback_auditId_fkey"
  FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditFindingFeedback"
  ADD CONSTRAINT "AuditFindingFeedback_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditFindingFeedback"
  ADD CONSTRAINT "AuditFindingFeedback_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditFindingFeedback"
  ADD CONSTRAINT "AuditFindingFeedback_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

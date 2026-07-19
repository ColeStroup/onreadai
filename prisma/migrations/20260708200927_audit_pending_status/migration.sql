-- AlterEnum
ALTER TYPE "AuditStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "Audit" ALTER COLUMN "status" SET DEFAULT 'PENDING';

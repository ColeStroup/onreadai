-- CreateEnum
CREATE TYPE "CompetitorStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Competitor" ADD COLUMN     "status" "CompetitorStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "Competitor_status_idx" ON "Competitor"("status");

-- AlterEnum
ALTER TYPE "ScoreCategory" ADD VALUE 'REVIEWS';

-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "overallScore" INTEGER;

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "estimatedEffort" TEXT,
ADD COLUMN     "expectedImpact" TEXT;

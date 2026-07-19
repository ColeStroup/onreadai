ALTER TYPE "RecommendationStatus" RENAME VALUE 'SAVED' TO 'TODO';

ALTER TABLE "Recommendation" ALTER COLUMN "status" SET DEFAULT 'TODO';
ALTER TABLE "Recommendation" ADD COLUMN "sortOrder" INTEGER;

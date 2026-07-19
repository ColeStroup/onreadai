-- CreateEnum
CREATE TYPE "BusinessProfileStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REMOVED');

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "confidenceScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "BusinessProfileStatus" NOT NULL DEFAULT 'PENDING';

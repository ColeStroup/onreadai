-- CreateTable
CREATE TABLE "GoogleBusinessProfile" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "googlePlaceId" TEXT,
    "displayName" TEXT,
    "formattedAddress" TEXT,
    "phoneNumber" TEXT,
    "websiteUri" TEXT,
    "googleMapsUri" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "businessStatus" TEXT,
    "primaryType" TEXT,
    "types" JSONB,
    "matchConfidence" INTEGER,
    "matchReasons" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'places_api',
    "rawSnapshot" JSONB,
    "discoveredAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleBusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleBusinessProfile_businessId_idx" ON "GoogleBusinessProfile"("businessId");

-- CreateIndex
CREATE INDEX "GoogleBusinessProfile_googlePlaceId_idx" ON "GoogleBusinessProfile"("googlePlaceId");

-- CreateIndex
CREATE INDEX "GoogleBusinessProfile_status_idx" ON "GoogleBusinessProfile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleBusinessProfile_businessId_googlePlaceId_key" ON "GoogleBusinessProfile"("businessId", "googlePlaceId");

-- AddForeignKey
ALTER TABLE "GoogleBusinessProfile" ADD CONSTRAINT "GoogleBusinessProfile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

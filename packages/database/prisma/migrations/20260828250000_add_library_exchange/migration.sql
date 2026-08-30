-- AlterTable: Add listingStatus and offer fields to LibraryVolume
ALTER TABLE "LibraryVolume" ADD COLUMN "listingStatus" TEXT NOT NULL DEFAULT 'COLLECTION_ONLY';
ALTER TABLE "LibraryVolume" ADD COLUMN "askingPrice" DOUBLE PRECISION;
ALTER TABLE "LibraryVolume" ADD COLUMN "minimumOffer" DOUBLE PRECISION;
ALTER TABLE "LibraryVolume" ADD COLUMN "tradePreferences" TEXT;

-- CreateTable: LibraryOffer
CREATE TABLE IF NOT EXISTS "LibraryOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "volumeId" TEXT NOT NULL,
    "offerType" TEXT NOT NULL DEFAULT 'CASH',
    "offererType" TEXT NOT NULL DEFAULT 'COLLECTOR',
    "offererId" TEXT,
    "offererName" TEXT NOT NULL,
    "offererEmail" TEXT NOT NULL,
    "offererStoreName" TEXT,
    "cashOfferAmount" DOUBLE PRECISION,
    "offeredTradeItemsJson" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "counterAmount" DOUBLE PRECISION,
    "counterNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryOffer_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "LibraryVolume" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: LibraryNotification
CREATE TABLE IF NOT EXISTS "LibraryNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CATALOG',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "actionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LibraryVolume_listingStatus_idx" ON "LibraryVolume"("listingStatus");
CREATE INDEX IF NOT EXISTS "LibraryOffer_volumeId_idx" ON "LibraryOffer"("volumeId");
CREATE INDEX IF NOT EXISTS "LibraryOffer_status_idx" ON "LibraryOffer"("status");
CREATE INDEX IF NOT EXISTS "LibraryOffer_offererEmail_idx" ON "LibraryOffer"("offererEmail");
CREATE INDEX IF NOT EXISTS "LibraryNotification_read_createdAt_idx" ON "LibraryNotification"("read", "createdAt");


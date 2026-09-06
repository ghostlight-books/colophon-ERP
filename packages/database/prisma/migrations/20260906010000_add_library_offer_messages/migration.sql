-- CreateTable: LibraryOfferMessage
CREATE TABLE IF NOT EXISTS "LibraryOfferMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryOfferMessage_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "LibraryOffer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LibraryOfferMessage_offerId_createdAt_idx" ON "LibraryOfferMessage"("offerId", "createdAt");

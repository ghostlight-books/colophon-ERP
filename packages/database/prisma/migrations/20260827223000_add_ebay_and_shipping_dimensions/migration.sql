-- AlterTable
ALTER TABLE "IsbnLookupCache" ADD COLUMN "bindingFormat" TEXT;
ALTER TABLE "IsbnLookupCache" ADD COLUMN "dimensionUnit" TEXT DEFAULT 'in';
ALTER TABLE "IsbnLookupCache" ADD COLUMN "estimatedShippingCost" REAL;
ALTER TABLE "IsbnLookupCache" ADD COLUMN "length" REAL;
ALTER TABLE "IsbnLookupCache" ADD COLUMN "packageType" TEXT DEFAULT 'Package/Thick Envelope';
ALTER TABLE "IsbnLookupCache" ADD COLUMN "pageCount" INTEGER;
ALTER TABLE "IsbnLookupCache" ADD COLUMN "suggestedShippingService" TEXT;
ALTER TABLE "IsbnLookupCache" ADD COLUMN "thickness" REAL;
ALTER TABLE "IsbnLookupCache" ADD COLUMN "weight" REAL;
ALTER TABLE "IsbnLookupCache" ADD COLUMN "weightUnit" TEXT DEFAULT 'oz';
ALTER TABLE "IsbnLookupCache" ADD COLUMN "width" REAL;

-- CreateTable
CREATE TABLE "EbayIntegrationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "appId" TEXT,
    "certId" TEXT,
    "devId" TEXT,
    "ruName" TEXT,
    "encryptedTokens" TEXT,
    "fulfillmentPolicyId" TEXT,
    "paymentPolicyId" TEXT,
    "returnPolicyId" TEXT,
    "highValueFulfillmentPolicyId" TEXT,
    "highValueThreshold" REAL NOT NULL DEFAULT 250.0,
    "merchantLocationKey" TEXT DEFAULT 'STORE_MAIN',
    "dailyRateLimitLimit" INTEGER NOT NULL DEFAULT 5000,
    "dailyRateLimitRemaining" INTEGER NOT NULL DEFAULT 5000,
    "rateLimitResetAt" DATETIME,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoPublishEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EbayIntegrationConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EbayListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "ebayItemId" TEXT,
    "ebayOfferId" TEXT,
    "listingStatus" TEXT NOT NULL DEFAULT 'UNLISTED',
    "price" REAL NOT NULL,
    "ebayCategoryId" TEXT,
    "lastSyncedAt" DATETIME,
    "lastError" TEXT,
    "ebayUrl" TEXT,
    "autoListExcluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EbayListing_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EbayOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT,
    "author" TEXT,
    "localPrice" REAL NOT NULL,
    "opportunityScore" INTEGER NOT NULL,
    "marketLowestPrice" REAL,
    "marketMedianPrice" REAL,
    "marketHighestPrice" REAL,
    "competitorCount" INTEGER NOT NULL DEFAULT 0,
    "suggestedPrice" REAL,
    "estimatedNetMargin" REAL,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EbayOpportunity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EbayListingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minPrice" REAL,
    "maxPrice" REAL,
    "minDaysInInventory" INTEGER,
    "requiredCondition" TEXT,
    "mustHaveCoverImage" BOOLEAN NOT NULL DEFAULT true,
    "includeKeywords" TEXT,
    "excludeKeywords" TEXT,
    "onlyFirstEditionOrSigned" BOOLEAN NOT NULL DEFAULT false,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EbayListingRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EbaySyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "isbn" TEXT,
    "sku" TEXT,
    "status" TEXT NOT NULL,
    "payload" TEXT,
    "response" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EbaySyncLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryReservationLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lockedUnits" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "EbayIntegrationConfig_storeId_key" ON "EbayIntegrationConfig"("storeId");

-- CreateIndex
CREATE INDEX "EbayListing_storeId_listingStatus_idx" ON "EbayListing"("storeId", "listingStatus");

-- CreateIndex
CREATE INDEX "EbayListing_sku_idx" ON "EbayListing"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "EbayListing_storeId_isbn_key" ON "EbayListing"("storeId", "isbn");

-- CreateIndex
CREATE INDEX "EbayOpportunity_storeId_opportunityScore_idx" ON "EbayOpportunity"("storeId", "opportunityScore");

-- CreateIndex
CREATE INDEX "EbayOpportunity_scannedAt_idx" ON "EbayOpportunity"("scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EbayOpportunity_storeId_isbn_key" ON "EbayOpportunity"("storeId", "isbn");

-- CreateIndex
CREATE INDEX "EbayListingRule_storeId_enabled_idx" ON "EbayListingRule"("storeId", "enabled");

-- CreateIndex
CREATE INDEX "EbaySyncLog_storeId_eventType_idx" ON "EbaySyncLog"("storeId", "eventType");

-- CreateIndex
CREATE INDEX "EbaySyncLog_storeId_createdAt_idx" ON "EbaySyncLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryReservationLock_storeId_isbn_idx" ON "InventoryReservationLock"("storeId", "isbn");

-- CreateIndex
CREATE INDEX "InventoryReservationLock_expiresAt_idx" ON "InventoryReservationLock"("expiresAt");

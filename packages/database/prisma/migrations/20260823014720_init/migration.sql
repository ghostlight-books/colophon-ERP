-- CreateTable
CREATE TABLE "NetworkDispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyingStoreId" TEXT NOT NULL,
    "sellingStoreId" TEXT NOT NULL,
    "refundAmount" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NetworkDispute_buyingStoreId_fkey" FOREIGN KEY ("buyingStoreId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NetworkDispute_sellingStoreId_fkey" FOREIGN KEY ("sellingStoreId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemBroadcast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message" TEXT NOT NULL,
    "bannerType" TEXT NOT NULL DEFAULT 'info',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IsbnLookupCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isbn" TEXT NOT NULL,
    "title" TEXT,
    "author" TEXT,
    "publisher" TEXT,
    "description" TEXT,
    "seoKeywords" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "catalogTags" TEXT,
    "coverUrl" TEXT,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "thriftbooksPrice" REAL,
    "listPrice" REAL,
    "condition" TEXT,
    "container" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "sku" TEXT NOT NULL,
    "labelTitle" TEXT,
    "source" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'Book',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "storeId" TEXT,
    CONSTRAINT "IsbnLookupCache_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_IsbnLookupCache" ("author", "catalogTags", "category", "condition", "container", "coverUrl", "createdAt", "description", "id", "isbn", "labelTitle", "listPrice", "mediaType", "publisher", "quantityOnHand", "seoDescription", "seoKeywords", "seoTitle", "sku", "source", "storeId", "subcategory", "thriftbooksPrice", "title", "updatedAt") SELECT "author", "catalogTags", "category", "condition", "container", "coverUrl", "createdAt", "description", "id", "isbn", "labelTitle", "listPrice", "mediaType", "publisher", "quantityOnHand", "seoDescription", "seoKeywords", "seoTitle", "sku", "source", "storeId", "subcategory", "thriftbooksPrice", "title", "updatedAt" FROM "IsbnLookupCache";
DROP TABLE "IsbnLookupCache";
ALTER TABLE "new_IsbnLookupCache" RENAME TO "IsbnLookupCache";
CREATE UNIQUE INDEX "IsbnLookupCache_isbn_key" ON "IsbnLookupCache"("isbn");
CREATE INDEX "IsbnLookupCache_sku_idx" ON "IsbnLookupCache"("sku");
CREATE TABLE "new_NetworkOrderRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partnerStoreName" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requestedPrice" REAL NOT NULL,
    "shippingFee" REAL NOT NULL DEFAULT 0,
    "fulfillmentTarget" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerAddress" TEXT,
    "destinationAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "storeId" TEXT,
    CONSTRAINT "NetworkOrderRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NetworkOrderRequest" ("createdAt", "customerAddress", "customerEmail", "customerName", "destinationAddress", "fulfillmentTarget", "id", "isbn", "partnerStoreName", "requestedPrice", "shippingFee", "status", "storeId", "title", "updatedAt") SELECT "createdAt", "customerAddress", "customerEmail", "customerName", "destinationAddress", "fulfillmentTarget", "id", "isbn", "partnerStoreName", "requestedPrice", "shippingFee", "status", "storeId", "title", "updatedAt" FROM "NetworkOrderRequest";
DROP TABLE "NetworkOrderRequest";
ALTER TABLE "new_NetworkOrderRequest" RENAME TO "NetworkOrderRequest";
CREATE INDEX "NetworkOrderRequest_status_createdAt_idx" ON "NetworkOrderRequest"("status", "createdAt");
CREATE INDEX "NetworkOrderRequest_isbn_idx" ON "NetworkOrderRequest"("isbn");
CREATE TABLE "new_ScanEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isbn" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "stationName" TEXT,
    "condition" TEXT NOT NULL,
    "listPrice" REAL NOT NULL,
    "container" TEXT NOT NULL,
    "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT,
    CONSTRAINT "ScanEvent_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "IsbnLookupCache" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScanEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScanEvent" ("condition", "container", "deviceId", "id", "inventoryId", "isbn", "listPrice", "scannedAt", "stationName", "storeId") SELECT "condition", "container", "deviceId", "id", "inventoryId", "isbn", "listPrice", "scannedAt", "stationName", "storeId" FROM "ScanEvent";
DROP TABLE "ScanEvent";
ALTER TABLE "new_ScanEvent" RENAME TO "ScanEvent";
CREATE INDEX "ScanEvent_isbn_idx" ON "ScanEvent"("isbn");
CREATE INDEX "ScanEvent_deviceId_idx" ON "ScanEvent"("deviceId");
CREATE INDEX "ScanEvent_scannedAt_idx" ON "ScanEvent"("scannedAt");
CREATE TABLE "new_Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "ledgerBalance" REAL NOT NULL DEFAULT 0,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'trial',
    "processorType" TEXT NOT NULL DEFAULT 'manual_terminal',
    "processorConfigJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Store" ("createdAt", "id", "ledgerBalance", "ownerEmail", "processorConfigJson", "processorType", "slug", "storeName") SELECT "createdAt", "id", "ledgerBalance", "ownerEmail", "processorConfigJson", "processorType", "slug", "storeName" FROM "Store";
DROP TABLE "Store";
ALTER TABLE "new_Store" RENAME TO "Store";
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");
CREATE INDEX "Store_ownerEmail_idx" ON "Store"("ownerEmail");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "NetworkDispute_status_createdAt_idx" ON "NetworkDispute"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SystemBroadcast_active_createdAt_idx" ON "SystemBroadcast"("active", "createdAt");

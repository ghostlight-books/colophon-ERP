CREATE TABLE "GlobalIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "GlobalIntegration_key_key" ON "GlobalIntegration"("key");
-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isbn13" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "publisher" TEXT,
    "publishedYear" INTEGER,
    "listPriceCents" INTEGER NOT NULL,
    "genre" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IsbnLookupCache" (
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
    "storeId" TEXT,
    "sku" TEXT NOT NULL,
    "labelTitle" TEXT,
    "source" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'Book',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "locationCode" TEXT,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PosTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionNumber" TEXT NOT NULL,
    "cashierUserId" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "soldAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PosTransactionLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    CONSTRAINT "PosTransactionLine_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PosTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PosTransactionLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NetworkPeer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Book_isbn13_key" ON "Book"("isbn13");

-- CreateTable
CREATE TABLE "ScanEvent" (
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
    CONSTRAINT "ScanEvent_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "IsbnLookupCache" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScanEvent_isbn_idx" ON "ScanEvent"("isbn");
CREATE INDEX "ScanEvent_deviceId_idx" ON "ScanEvent"("deviceId");
CREATE INDEX "ScanEvent_scannedAt_idx" ON "ScanEvent"("scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IsbnLookupCache_isbn_key" ON "IsbnLookupCache"("isbn");

-- CreateIndex
CREATE INDEX "IsbnLookupCache_sku_idx" ON "IsbnLookupCache"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");

-- CreateIndex
CREATE INDEX "InventoryItem_bookId_idx" ON "InventoryItem"("bookId");

-- CreateIndex
CREATE INDEX "InventoryItem_condition_idx" ON "InventoryItem"("condition");

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "ledgerBalance" REAL NOT NULL DEFAULT 0,
    "processorType" TEXT NOT NULL DEFAULT 'manual_terminal',
    "processorConfigJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NetworkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyingStoreId" TEXT NOT NULL,
    "sellingStoreId" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "wholesalePrice" REAL NOT NULL,
    "shippingFee" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "trackingNumber" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NetworkOrder_buyingStoreId_fkey" FOREIGN KEY ("buyingStoreId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NetworkOrder_sellingStoreId_fkey" FOREIGN KEY ("sellingStoreId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "balanceAfter" REAL NOT NULL,
    "referenceOrderId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerTransaction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerTransaction_referenceOrderId_fkey" FOREIGN KEY ("referenceOrderId") REFERENCES "NetworkOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Store_ownerEmail_idx" ON "Store"("ownerEmail");
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");
CREATE INDEX "NetworkOrder_buyingStoreId_status_idx" ON "NetworkOrder"("buyingStoreId", "status");
CREATE INDEX "NetworkOrder_sellingStoreId_status_idx" ON "NetworkOrder"("sellingStoreId", "status");
CREATE INDEX "NetworkOrder_isbn_idx" ON "NetworkOrder"("isbn");
CREATE INDEX "LedgerTransaction_storeId_createdAt_idx" ON "LedgerTransaction"("storeId", "createdAt");
CREATE INDEX "LedgerTransaction_referenceOrderId_idx" ON "LedgerTransaction"("referenceOrderId");

-- CreateTable
CREATE TABLE "NetworkOrderRequest" (
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
    "storeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "NetworkOrderRequest_status_createdAt_idx" ON "NetworkOrderRequest"("status", "createdAt");
CREATE INDEX "NetworkOrderRequest_isbn_idx" ON "NetworkOrderRequest"("isbn");

-- CreateTable
CREATE TABLE "StoreShippingAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'usps',
    "clientId" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "originAddress" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreShippingAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoreShippingAccount_storeId_key" ON "StoreShippingAccount"("storeId");

-- CreateTable
CREATE TABLE "StoreEcommerceIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "storeUrl" TEXT NOT NULL,
    "encryptedCredentials" TEXT NOT NULL,
    "syncInventory" BOOLEAN NOT NULL DEFAULT true,
    "syncOrders" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoreEcommerceIntegration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StoreEcommerceIntegration_storeId_platform_key" ON "StoreEcommerceIntegration"("storeId", "platform");
CREATE INDEX "StoreEcommerceIntegration_storeId_idx" ON "StoreEcommerceIntegration"("storeId");

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "StoreMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CASHIER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreMembership_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "StoreMembership_userId_storeId_key" ON "StoreMembership"("userId", "storeId");
CREATE INDEX "StoreMembership_storeId_role_idx" ON "StoreMembership"("storeId", "role");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- CreateTable
CREATE TABLE "FinanceTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "accountCode" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "memo" TEXT,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceTransaction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "AccountsPayable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "vendor" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountsPayable_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "AccountsReceivable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "customer" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "receivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountsReceivable_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "vendor" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "orderedAt" DATETIME,
    "receivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "DrawerReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "registerName" TEXT NOT NULL,
    "businessDate" DATETIME NOT NULL,
    "openingFloat" REAL NOT NULL,
    "expectedCash" REAL NOT NULL,
    "actualCash" REAL NOT NULL,
    "variance" REAL NOT NULL,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrawerReconciliation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "grossAmount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "provider" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankConnection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FinanceTransaction_storeId_occurredAt_idx" ON "FinanceTransaction"("storeId", "occurredAt");
CREATE INDEX "FinanceTransaction_accountCode_idx" ON "FinanceTransaction"("accountCode");
CREATE INDEX "AccountsPayable_storeId_dueDate_idx" ON "AccountsPayable"("storeId", "dueDate");
CREATE INDEX "AccountsReceivable_storeId_dueDate_idx" ON "AccountsReceivable"("storeId", "dueDate");
CREATE INDEX "PurchaseOrder_storeId_status_idx" ON "PurchaseOrder"("storeId", "status");
CREATE INDEX "DrawerReconciliation_storeId_businessDate_idx" ON "DrawerReconciliation"("storeId", "businessDate");
CREATE INDEX "PayrollRun_storeId_periodEnd_idx" ON "PayrollRun"("storeId", "periodEnd");
CREATE INDEX "BankConnection_storeId_active_idx" ON "BankConnection"("storeId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PosTransaction_transactionNumber_key" ON "PosTransaction"("transactionNumber");

-- CreateIndex
CREATE INDEX "PosTransaction_cashierUserId_idx" ON "PosTransaction"("cashierUserId");

-- CreateIndex
CREATE INDEX "PosTransaction_soldAt_idx" ON "PosTransaction"("soldAt");

-- CreateIndex
CREATE INDEX "PosTransactionLine_transactionId_idx" ON "PosTransactionLine"("transactionId");

-- CreateIndex
CREATE INDEX "PosTransactionLine_inventoryItemId_idx" ON "PosTransactionLine"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkPeer_endpoint_key" ON "NetworkPeer"("endpoint");

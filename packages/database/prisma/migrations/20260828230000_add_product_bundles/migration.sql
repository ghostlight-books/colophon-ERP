-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductBundle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentSku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT,
    "description" TEXT,
    "bundlePrice" REAL NOT NULL,
    "originalTotalPrice" REAL NOT NULL,
    "discountPercent" REAL NOT NULL DEFAULT 10.0,
    "savingsAmount" REAL NOT NULL DEFAULT 0.0,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "unbundledAt" DATETIME,
    "storeId" TEXT
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductBundleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bundleId" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "coverUrl" TEXT,
    "condition" TEXT,
    "listPrice" REAL NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "originalQty" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "ProductBundle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductBundle_parentSku_key" ON "ProductBundle"("parentSku");
CREATE INDEX IF NOT EXISTS "ProductBundle_parentSku_idx" ON "ProductBundle"("parentSku");
CREATE INDEX IF NOT EXISTS "ProductBundle_status_idx" ON "ProductBundle"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductBundleItem_bundleId_idx" ON "ProductBundleItem"("bundleId");
CREATE INDEX IF NOT EXISTS "ProductBundleItem_isbn_idx" ON "ProductBundleItem"("isbn");
CREATE INDEX IF NOT EXISTS "ProductBundleItem_sku_idx" ON "ProductBundleItem"("sku");

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "storeCreditBalance" REAL NOT NULL DEFAULT 0,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT,
    "notes" TEXT,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomerCreditTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "balanceAfter" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerCreditTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeInTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "customerId" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "totalPaid" REAL NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeInTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeInTransactionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeInId" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "title" TEXT,
    "author" TEXT,
    "condition" TEXT NOT NULL,
    "sellPrice" REAL NOT NULL,
    "buyOffer" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeInTransactionItem_tradeInId_fkey" FOREIGN KEY ("tradeInId") REFERENCES "TradeInTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_storeId_idx" ON "Customer"("storeId");

-- CreateIndex
CREATE INDEX "CustomerCreditTransaction_customerId_createdAt_idx" ON "CustomerCreditTransaction"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeInTransaction_batchId_key" ON "TradeInTransaction"("batchId");

-- CreateIndex
CREATE INDEX "TradeInTransaction_customerId_createdAt_idx" ON "TradeInTransaction"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeInTransaction_storeId_createdAt_idx" ON "TradeInTransaction"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeInTransactionItem_tradeInId_idx" ON "TradeInTransactionItem"("tradeInId");

-- CreateIndex
CREATE INDEX "TradeInTransactionItem_isbn_idx" ON "TradeInTransactionItem"("isbn");

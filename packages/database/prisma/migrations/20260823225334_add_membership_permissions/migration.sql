-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoreMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CASHIER',
    "permissionsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoreMembership_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StoreMembership" ("createdAt", "id", "role", "storeId", "userId") SELECT "createdAt", "id", "role", "storeId", "userId" FROM "StoreMembership";
DROP TABLE "StoreMembership";
ALTER TABLE "new_StoreMembership" RENAME TO "StoreMembership";
CREATE INDEX "StoreMembership_storeId_role_idx" ON "StoreMembership"("storeId", "role");
CREATE UNIQUE INDEX "StoreMembership_userId_storeId_key" ON "StoreMembership"("userId", "storeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

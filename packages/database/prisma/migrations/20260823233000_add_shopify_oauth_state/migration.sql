CREATE TABLE "ShopifyOAuthState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "state" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ShopifyOAuthState_state_key" ON "ShopifyOAuthState"("state");
CREATE INDEX "ShopifyOAuthState_expiresAt_idx" ON "ShopifyOAuthState"("expiresAt");
-- AddColumn: per-store product entitlements. Every existing store keeps
-- full access (both defaults true) -- only newly-created accounts can be
-- restricted to Library-only.
ALTER TABLE "Store" ADD COLUMN "hasStoreAccess" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Store" ADD COLUMN "hasLibraryAccess" BOOLEAN NOT NULL DEFAULT true;

-- AddColumn: per-store attribution for notifications and badge awards
ALTER TABLE "LibraryNotification" ADD COLUMN "storeId" TEXT;
ALTER TABLE "LibraryBadgeAward" ADD COLUMN "storeId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LibraryNotification_storeId_createdAt_idx" ON "LibraryNotification"("storeId", "createdAt");

-- Badges become per-store instead of a single global award: replace the bare
-- unique on badgeId with a compound (storeId, badgeId) unique.
DROP INDEX IF EXISTS "LibraryBadgeAward_badgeId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "LibraryBadgeAward_storeId_badgeId_key" ON "LibraryBadgeAward"("storeId", "badgeId");

-- Shelf names only need to be unique per store, not app-wide.
DROP INDEX IF EXISTS "LibraryShelfLocation_roomName_bookcaseName_shelfName_key";
CREATE UNIQUE INDEX IF NOT EXISTS "LibraryShelfLocation_storeId_roomName_bookcaseName_shelfName_key" ON "LibraryShelfLocation"("storeId", "roomName", "bookcaseName", "shelfName");

-- CreateTable: LibraryBadgeAward
CREATE TABLE IF NOT EXISTS "LibraryBadgeAward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "badgeId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LibraryBadgeAward_badgeId_key" ON "LibraryBadgeAward"("badgeId");

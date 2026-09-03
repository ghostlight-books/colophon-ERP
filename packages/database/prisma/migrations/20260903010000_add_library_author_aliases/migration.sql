-- CreateTable: LibraryAuthorAlias
CREATE TABLE IF NOT EXISTS "LibraryAuthorAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alias" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LibraryAuthorAlias_alias_key" ON "LibraryAuthorAlias"("alias");
CREATE INDEX IF NOT EXISTS "LibraryAuthorAlias_canonicalName_idx" ON "LibraryAuthorAlias"("canonicalName");

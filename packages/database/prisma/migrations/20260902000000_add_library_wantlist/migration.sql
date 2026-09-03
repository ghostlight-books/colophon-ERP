-- CreateTable: LibraryWantlistItem
CREATE TABLE IF NOT EXISTS "LibraryWantlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "isbn" TEXT,
    "notes" TEXT,
    "maxPrice" DOUBLE PRECISION,
    "librarySpaceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryWantlistItem_librarySpaceId_fkey" FOREIGN KEY ("librarySpaceId") REFERENCES "LibrarySpace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LibraryWantlistItem_isbn_idx" ON "LibraryWantlistItem"("isbn");
CREATE INDEX IF NOT EXISTS "LibraryWantlistItem_title_idx" ON "LibraryWantlistItem"("title");
CREATE INDEX IF NOT EXISTS "LibraryWantlistItem_status_idx" ON "LibraryWantlistItem"("status");
CREATE INDEX IF NOT EXISTS "LibraryWantlistItem_librarySpaceId_idx" ON "LibraryWantlistItem"("librarySpaceId");

-- CreateTable: LibraryNote
CREATE TABLE IF NOT EXISTS "LibraryNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "volumeId" TEXT NOT NULL,
    "quoteText" TEXT,
    "personalNote" TEXT,
    "pageNumber" TEXT,
    "citationText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryNote_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "LibraryVolume" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LibraryNote_volumeId_idx" ON "LibraryNote"("volumeId");

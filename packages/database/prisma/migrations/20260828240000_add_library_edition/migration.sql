-- CreateTable LibraryVolume
CREATE TABLE IF NOT EXISTS "LibraryVolume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isbn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "publisher" TEXT,
    "publishYear" TEXT,
    "description" TEXT,
    "coverUrl" TEXT,
    "deweyDecimal" TEXT,
    "deweyCategory" TEXT,
    "locClassification" TEXT,
    "lccn" TEXT,
    "oclcNumber" TEXT,
    "subjects" TEXT,
    "pageCount" INTEGER,
    "bindingFormat" TEXT,
    "language" TEXT DEFAULT 'English',
    "roomName" TEXT,
    "bookcaseName" TEXT,
    "shelfName" TEXT,
    "shelfLocationId" TEXT,
    "replacementValue" REAL NOT NULL DEFAULT 0.0,
    "acquisitionPrice" REAL,
    "acquisitionDate" DATETIME,
    "readingStatus" TEXT NOT NULL DEFAULT 'UNREAD',
    "rating" INTEGER,
    "personalNotes" TEXT,
    "exLibrisTags" TEXT,
    "isLoaned" BOOLEAN NOT NULL DEFAULT false,
    "borrowerName" TEXT,
    "borrowerContact" TEXT,
    "loanDate" DATETIME,
    "dueDate" DATETIME,
    "returnDate" DATETIME,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryVolume_shelfLocationId_fkey" FOREIGN KEY ("shelfLocationId") REFERENCES "LibraryShelfLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable LibraryShelfLocation
CREATE TABLE IF NOT EXISTS "LibraryShelfLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomName" TEXT NOT NULL,
    "bookcaseName" TEXT NOT NULL,
    "shelfName" TEXT NOT NULL,
    "fullLocationLabel" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER DEFAULT 30,
    "storeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LibraryShelfLocation_roomName_bookcaseName_shelfName_key" ON "LibraryShelfLocation"("roomName", "bookcaseName", "shelfName");
CREATE INDEX IF NOT EXISTS "LibraryShelfLocation_roomName_idx" ON "LibraryShelfLocation"("roomName");

-- CreateIndex for LibraryVolume
CREATE INDEX IF NOT EXISTS "LibraryVolume_isbn_idx" ON "LibraryVolume"("isbn");
CREATE INDEX IF NOT EXISTS "LibraryVolume_title_idx" ON "LibraryVolume"("title");
CREATE INDEX IF NOT EXISTS "LibraryVolume_author_idx" ON "LibraryVolume"("author");
CREATE INDEX IF NOT EXISTS "LibraryVolume_deweyDecimal_idx" ON "LibraryVolume"("deweyDecimal");
CREATE INDEX IF NOT EXISTS "LibraryVolume_locClassification_idx" ON "LibraryVolume"("locClassification");
CREATE INDEX IF NOT EXISTS "LibraryVolume_readingStatus_idx" ON "LibraryVolume"("readingStatus");
CREATE INDEX IF NOT EXISTS "LibraryVolume_isLoaned_idx" ON "LibraryVolume"("isLoaned");
CREATE INDEX IF NOT EXISTS "LibraryVolume_shelfLocationId_idx" ON "LibraryVolume"("shelfLocationId");

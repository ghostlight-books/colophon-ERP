-- AlterTable
ALTER TABLE "LibraryVolume" ADD COLUMN "rareMarketValue" REAL;
ALTER TABLE "LibraryVolume" ADD COLUMN "valuationNotes" TEXT;
ALTER TABLE "LibraryVolume" ADD COLUMN "isSigned" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "LibraryVolume" ADD COLUMN "isFirstEdition" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "LibraryVolume" ADD COLUMN "isFirstPrinting" BOOLEAN NOT NULL DEFAULT 0;

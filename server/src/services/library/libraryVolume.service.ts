import { prisma } from "../../config/database.js";
import {
  enrichLibraryClassification,
  resolveDeweyCategory,
  resolveLocSubject,
  DEWEY_DIVISIONS,
} from "./libraryClassification.service.js";
import { ensureLibrarySpacesExist } from "./librarySpace.service.js";

export interface CreateLibraryVolumeInput {
  isbn: string;
  title?: string;
  author?: string | null;
  publisher?: string | null;
  publishYear?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  deweyDecimal?: string | null;
  locClassification?: string | null;
  lccn?: string | null;
  oclcNumber?: string | null;
  subjects?: string[] | string | null;
  pageCount?: number | null;
  bindingFormat?: string | null;
  language?: string;
  roomName?: string | null;
  bookcaseName?: string | null;
  shelfName?: string | null;
  shelfLocationId?: string | null;
  replacementValue?: number | null;
  acquisitionPrice?: number | null;
  acquisitionDate?: Date | string | null;
  readingStatus?: "UNREAD" | "READING" | "COMPLETED" | "WISHLIST";
  rating?: number | null;
  personalNotes?: string | null;
  exLibrisTags?: string | null;
  listingStatus?: "COLLECTION_ONLY" | "ALLOW_OFFERS" | "OPEN_FOR_TRADE" | "FOR_SALE";
  askingPrice?: number | null;
  minimumOffer?: number | null;
  tradePreferences?: string | null;
  isSigned?: boolean;
  isFirstEdition?: boolean;
  isFirstPrinting?: boolean;
  rareMarketValue?: number | null;
  valuationNotes?: string | null;
  condition?: string;
  librarySpaceId?: string | null;
  storeId?: string;
}

export interface LibraryFilterOptions {
  query?: string;
  deweyPrefix?: string;
  locPrefix?: string;
  shelfLocationId?: string;
  roomName?: string;
  readingStatus?: string;
  condition?: string;
  librarySpaceId?: string;
  isLoaned?: boolean;
  limit?: number;
  offset?: number;
}

// Auto-create SQLite / PostgreSQL tables if not present
export async function ensureLibraryTablesExist(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
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
    `);

    await prisma.$executeRawUnsafe(`
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
        "listingStatus" TEXT NOT NULL DEFAULT 'COLLECTION_ONLY',
        "askingPrice" REAL,
        "minimumOffer" REAL,
        "tradePreferences" TEXT,
        "isLoaned" BOOLEAN NOT NULL DEFAULT false,
        "borrowerName" TEXT,
        "borrowerContact" TEXT,
        "loanDate" DATETIME,
        "dueDate" DATETIME,
        "returnDate" DATETIME,
        "storeId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LibraryOffer" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "volumeId" TEXT NOT NULL,
        "offerType" TEXT NOT NULL DEFAULT 'CASH',
        "offererType" TEXT NOT NULL DEFAULT 'COLLECTOR',
        "offererId" TEXT,
        "offererName" TEXT NOT NULL,
        "offererEmail" TEXT NOT NULL,
        "offererStoreName" TEXT,
        "cashOfferAmount" REAL,
        "offeredTradeItemsJson" TEXT,
        "notes" TEXT,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "counterAmount" REAL,
        "counterNotes" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LibraryNotification" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "detail" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'CATALOG',
        "read" BOOLEAN NOT NULL DEFAULT false,
        "actionUrl" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Dynamically ensure new columns exist in LibraryVolume
    const migrations = [
      `ALTER TABLE "LibraryVolume" ADD COLUMN "isSigned" BOOLEAN NOT NULL DEFAULT 0;`,
      `ALTER TABLE "LibraryVolume" ADD COLUMN "isFirstEdition" BOOLEAN NOT NULL DEFAULT 0;`,
      `ALTER TABLE "LibraryVolume" ADD COLUMN "isFirstPrinting" BOOLEAN NOT NULL DEFAULT 0;`,
      `ALTER TABLE "LibraryVolume" ADD COLUMN "rareMarketValue" REAL;`,
      `ALTER TABLE "LibraryVolume" ADD COLUMN "valuationNotes" TEXT;`,
      `ALTER TABLE "LibraryVolume" ADD COLUMN "listingStatus" TEXT NOT NULL DEFAULT 'COLLECTION_ONLY';`,
      `ALTER TABLE "LibraryVolume" ADD COLUMN "askingPrice" REAL;`,
      `ALTER TABLE "LibraryVolume" ADD COLUMN "minimumOffer" REAL;`,
      `ALTER TABLE "LibraryVolume" ADD COLUMN "tradePreferences" TEXT;`,
      `ALTER TABLE "LibraryVolume" ADD COLUMN "condition" TEXT NOT NULL DEFAULT 'VERY_GOOD';`,
    ];

    for (const sql of migrations) {
      await prisma.$executeRawUnsafe(sql).catch(() => null);
    }
  } catch (err) {
    console.warn("Library tables ensure warning:", err);
  }
}

export async function createLibraryVolume(input: CreateLibraryVolumeInput) {
  await ensureLibraryTablesExist();

  // If Dewey / LOC or metadata is missing, auto-enrich via our classification engine
  let enrichment = null;
  if (!input.title || !input.deweyDecimal || !input.locClassification || !input.coverUrl) {
    enrichment = await enrichLibraryClassification(input.isbn);
  }

  const finalTitle = input.title?.trim() || enrichment?.title || `Book ISBN ${input.isbn}`;
  const finalAuthor = input.author !== undefined ? input.author : (enrichment?.author || null);
  const finalDewey = input.deweyDecimal !== undefined ? input.deweyDecimal : (enrichment?.deweyDecimal || null);
  const finalDeweyCategory = resolveDeweyCategory(finalDewey) || enrichment?.deweyCategory || null;
  const finalLoc = input.locClassification !== undefined ? input.locClassification : (enrichment?.locClassification || null);
  const finalLccn = input.lccn !== undefined ? input.lccn : (enrichment?.lccn || null);
  const finalOclc = input.oclcNumber !== undefined ? input.oclcNumber : (enrichment?.oclcNumber || null);
  const finalCover = input.coverUrl !== undefined ? input.coverUrl : (enrichment?.coverUrl || null);
  const finalPublisher = input.publisher !== undefined ? input.publisher : (enrichment?.publisher || null);
  const finalYear = input.publishYear !== undefined ? input.publishYear : (enrichment?.publishYear || null);
  const finalDesc = input.description !== undefined ? input.description : (enrichment?.description || null);
  const finalPages = input.pageCount !== undefined ? input.pageCount : (enrichment?.pageCount || null);
  const finalBinding = input.bindingFormat !== undefined ? input.bindingFormat : (enrichment?.bindingFormat || "Paperback");
  const finalValue = typeof input.replacementValue === "number" && input.replacementValue > 0
    ? input.replacementValue
    : (enrichment?.replacementValue || 18.99);

  let subjectsStr: string | null = null;
  if (Array.isArray(input.subjects)) {
    subjectsStr = input.subjects.join(", ");
  } else if (typeof input.subjects === "string") {
    subjectsStr = input.subjects;
  } else if (Array.isArray(enrichment?.subjects)) {
    subjectsStr = enrichment.subjects.join(", ");
  }

  // Resolve shelf details if shelfLocationId is provided
  let room = input.roomName || null;
  let bookcase = input.bookcaseName || null;
  let shelf = input.shelfName || null;

  if (input.shelfLocationId) {
    const loc = await prisma.libraryShelfLocation.findUnique({ where: { id: input.shelfLocationId } });
    if (loc) {
      room = loc.roomName;
      bookcase = loc.bookcaseName;
      shelf = loc.shelfName;
    }
  }

  let librarySpaceId = input.librarySpaceId || null;
  if (!librarySpaceId) {
    const defaultSpace = await prisma.librarySpace.findFirst({ where: { isDefault: true } }) ||
      await prisma.librarySpace.findFirst();
    if (defaultSpace) librarySpaceId = defaultSpace.id;
  }

  return prisma.libraryVolume.create({
    data: {
      isbn: input.isbn.replace(/[^0-9X]/gi, "").toUpperCase(),
      title: finalTitle,
      author: finalAuthor,
      publisher: finalPublisher,
      publishYear: finalYear,
      description: finalDesc,
      coverUrl: finalCover,
      deweyDecimal: finalDewey,
      deweyCategory: finalDeweyCategory,
      locClassification: finalLoc,
      lccn: finalLccn,
      oclcNumber: finalOclc,
      subjects: subjectsStr,
      pageCount: finalPages,
      bindingFormat: finalBinding,
      language: input.language || "English",
      roomName: room,
      bookcaseName: bookcase,
      shelfName: shelf,
      shelfLocationId: input.shelfLocationId || null,
      librarySpaceId: librarySpaceId,
      replacementValue: Number(finalValue.toFixed(2)),
      rareMarketValue: input.rareMarketValue !== undefined ? input.rareMarketValue : null,
      valuationNotes: input.valuationNotes || null,
      condition: input.condition || "VERY_GOOD",
      isSigned: Boolean(input.isSigned),
      isFirstEdition: Boolean(input.isFirstEdition),
      isFirstPrinting: Boolean(input.isFirstPrinting),
      acquisitionPrice: input.acquisitionPrice ? Number(input.acquisitionPrice.toFixed(2)) : null,
      acquisitionDate: input.acquisitionDate ? new Date(input.acquisitionDate) : new Date(),
      readingStatus: input.readingStatus || "UNREAD",
      rating: input.rating || null,
      personalNotes: input.personalNotes || null,
      exLibrisTags: input.exLibrisTags || null,
      listingStatus: input.listingStatus || "COLLECTION_ONLY",
      askingPrice: input.askingPrice || null,
      minimumOffer: input.minimumOffer || null,
      tradePreferences: input.tradePreferences || null,
      storeId: input.storeId || "ghostlight-demo",
    },
    include: {
      shelfLocation: true,
      librarySpace: true,
    },
  });
}

export async function scanAndIntakeVolume(
  isbn: string,
  shelfLocationId?: string | null,
  customData?: Partial<CreateLibraryVolumeInput>
) {
  await ensureLibraryTablesExist();
  const enrichment = await enrichLibraryClassification(isbn);

  return createLibraryVolume({
    isbn,
    title: customData?.title || enrichment.title,
    author: customData?.author !== undefined ? customData.author : enrichment.author,
    publisher: customData?.publisher !== undefined ? customData.publisher : enrichment.publisher,
    publishYear: customData?.publishYear !== undefined ? customData.publishYear : enrichment.publishYear,
    description: customData?.description !== undefined ? customData.description : enrichment.description,
    coverUrl: customData?.coverUrl !== undefined ? customData.coverUrl : enrichment.coverUrl,
    deweyDecimal: customData?.deweyDecimal !== undefined ? customData.deweyDecimal : enrichment.deweyDecimal,
    locClassification: customData?.locClassification !== undefined ? customData.locClassification : enrichment.locClassification,
    lccn: enrichment.lccn,
    oclcNumber: enrichment.oclcNumber,
    subjects: enrichment.subjects,
    pageCount: enrichment.pageCount,
    bindingFormat: enrichment.bindingFormat,
    replacementValue: customData?.replacementValue || enrichment.replacementValue,
    rareMarketValue: customData?.rareMarketValue !== undefined ? customData.rareMarketValue : (enrichment.replacementValue || null),
    valuationNotes: customData?.valuationNotes || null,
    condition: customData?.condition || "VERY_GOOD",
    isSigned: customData?.isSigned || false,
    isFirstEdition: customData?.isFirstEdition || false,
    isFirstPrinting: customData?.isFirstPrinting || false,
    shelfLocationId: shelfLocationId || null,
    librarySpaceId: customData?.librarySpaceId || null,
    readingStatus: customData?.readingStatus || "UNREAD",
    listingStatus: customData?.listingStatus || "COLLECTION_ONLY",
    askingPrice: customData?.askingPrice || null,
    tradePreferences: customData?.tradePreferences || null,
    personalNotes: customData?.personalNotes || null,
    exLibrisTags: customData?.exLibrisTags || null,
    storeId: customData?.storeId || "ghostlight-demo",
  });
}

export async function listLibraryVolumes(filters: LibraryFilterOptions = {}) {
  await ensureLibraryTablesExist();

  const where: Record<string, any> = {};

  if (filters.query) {
    const q = filters.query.trim();
    where.OR = [
      { title: { contains: q } },
      { author: { contains: q } },
      { isbn: { contains: q } },
      { deweyDecimal: { contains: q } },
      { locClassification: { contains: q } },
      { subjects: { contains: q } },
      { personalNotes: { contains: q } },
      { exLibrisTags: { contains: q } },
    ];
  }

  if (filters.librarySpaceId && filters.librarySpaceId !== "ALL") {
    where.librarySpaceId = filters.librarySpaceId;
  }

  if (filters.deweyPrefix) {
    where.deweyDecimal = { startsWith: filters.deweyPrefix };
  }

  if (filters.locPrefix) {
    where.locClassification = { startsWith: filters.locPrefix };
  }

  if (filters.shelfLocationId) {
    where.shelfLocationId = filters.shelfLocationId;
  }

  if (filters.roomName) {
    where.roomName = filters.roomName;
  }

  if (filters.readingStatus) {
    where.readingStatus = filters.readingStatus;
  }

  if (filters.condition) {
    where.condition = filters.condition;
  }

  if (typeof filters.isLoaned === "boolean") {
    where.isLoaned = filters.isLoaned;
  }

  const [total, items] = await Promise.all([
    prisma.libraryVolume.count({ where }),
    prisma.libraryVolume.findMany({
      where,
      include: { shelfLocation: true },
      orderBy: { createdAt: "desc" },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    }),
  ]);

  return { total, items };
}

export async function getLibraryVolume(id: string) {
  await ensureLibraryTablesExist();
  return prisma.libraryVolume.findUnique({
    where: { id },
    include: { shelfLocation: true },
  });
}

export async function updateLibraryVolume(id: string, data: Partial<CreateLibraryVolumeInput>) {
  await ensureLibraryTablesExist();

  const updatePayload: Record<string, any> = {};
  if (data.title !== undefined) updatePayload.title = data.title;
  if (data.author !== undefined) updatePayload.author = data.author;
  if (data.publisher !== undefined) updatePayload.publisher = data.publisher;
  if (data.publishYear !== undefined) updatePayload.publishYear = data.publishYear;
  if (data.description !== undefined) updatePayload.description = data.description;
  if (data.coverUrl !== undefined) updatePayload.coverUrl = data.coverUrl;
  if (data.deweyDecimal !== undefined) {
    updatePayload.deweyDecimal = data.deweyDecimal;
    updatePayload.deweyCategory = resolveDeweyCategory(data.deweyDecimal);
  }
  if (data.locClassification !== undefined) updatePayload.locClassification = data.locClassification;
  if (data.lccn !== undefined) updatePayload.lccn = data.lccn;
  if (data.oclcNumber !== undefined) updatePayload.oclcNumber = data.oclcNumber;
  if (data.pageCount !== undefined) updatePayload.pageCount = data.pageCount;
  if (data.bindingFormat !== undefined) updatePayload.bindingFormat = data.bindingFormat;
  if (data.replacementValue !== undefined) updatePayload.replacementValue = data.replacementValue;
  if (data.rareMarketValue !== undefined) updatePayload.rareMarketValue = data.rareMarketValue;
  if (data.valuationNotes !== undefined) updatePayload.valuationNotes = data.valuationNotes;
  if (data.isSigned !== undefined) updatePayload.isSigned = Boolean(data.isSigned);
  if (data.isFirstEdition !== undefined) updatePayload.isFirstEdition = Boolean(data.isFirstEdition);
  if (data.isFirstPrinting !== undefined) updatePayload.isFirstPrinting = Boolean(data.isFirstPrinting);
  if (data.acquisitionPrice !== undefined) updatePayload.acquisitionPrice = data.acquisitionPrice;
  if (data.readingStatus !== undefined) updatePayload.readingStatus = data.readingStatus;
  if (data.rating !== undefined) updatePayload.rating = data.rating;
  if (data.personalNotes !== undefined) updatePayload.personalNotes = data.personalNotes;
  if (data.exLibrisTags !== undefined) updatePayload.exLibrisTags = data.exLibrisTags;
  if (data.listingStatus !== undefined) updatePayload.listingStatus = data.listingStatus;
  if (data.askingPrice !== undefined) updatePayload.askingPrice = data.askingPrice;
  if (data.minimumOffer !== undefined) updatePayload.minimumOffer = data.minimumOffer;
  if (data.tradePreferences !== undefined) updatePayload.tradePreferences = data.tradePreferences;
  if (data.condition !== undefined) updatePayload.condition = data.condition;
  if (data.librarySpaceId !== undefined) updatePayload.librarySpaceId = data.librarySpaceId;

  if (data.shelfLocationId !== undefined) {
    updatePayload.shelfLocationId = data.shelfLocationId;
    if (data.shelfLocationId) {
      const loc = await prisma.libraryShelfLocation.findUnique({ where: { id: data.shelfLocationId } });
      if (loc) {
        updatePayload.roomName = loc.roomName;
        updatePayload.bookcaseName = loc.bookcaseName;
        updatePayload.shelfName = loc.shelfName;
      }
    } else {
      updatePayload.roomName = data.roomName || null;
      updatePayload.bookcaseName = data.bookcaseName || null;
      updatePayload.shelfName = data.shelfName || null;
    }
  }

  return prisma.libraryVolume.update({
    where: { id },
    data: updatePayload,
    include: { shelfLocation: true },
  });
}

export async function deleteLibraryVolume(id: string) {
  await ensureLibraryTablesExist();
  await prisma.$executeRawUnsafe(`DELETE FROM "LibraryOffer" WHERE "volumeId" = ?`, id).catch(() => null);
  await prisma.$executeRawUnsafe(`DELETE FROM "LibraryLoan" WHERE "volumeId" = ?`, id).catch(() => null);
  return prisma.libraryVolume.delete({ where: { id } });
}

export async function bulkDeleteLibraryVolumes(ids: string[]) {
  await ensureLibraryTablesExist();
  if (!Array.isArray(ids) || ids.length === 0) {
    return { count: 0 };
  }
  for (const id of ids) {
    await prisma.$executeRawUnsafe(`DELETE FROM "LibraryOffer" WHERE "volumeId" = ?`, id).catch(() => null);
    await prisma.$executeRawUnsafe(`DELETE FROM "LibraryLoan" WHERE "volumeId" = ?`, id).catch(() => null);
  }
  return prisma.libraryVolume.deleteMany({
    where: {
      id: { in: ids },
    },
  });
}

// Shelves Management
export async function listShelfLocations(storeId = "ghostlight-demo") {
  await ensureLibraryTablesExist();

  const locations = await prisma.libraryShelfLocation.findMany({
    where: { storeId },
    include: {
      volumes: {
        select: { id: true, replacementValue: true, title: true, coverUrl: true },
      },
    },
    orderBy: [{ roomName: "asc" }, { bookcaseName: "asc" }, { shelfName: "asc" }],
  });

  return locations.map((loc) => {
    const volumeCount = loc.volumes.length;
    const totalValue = loc.volumes.reduce((sum, v) => sum + (v.replacementValue || 0), 0);
    return {
      id: loc.id,
      roomName: loc.roomName,
      bookcaseName: loc.bookcaseName,
      shelfName: loc.shelfName,
      fullLocationLabel: loc.fullLocationLabel,
      description: loc.description,
      capacity: loc.capacity || 30,
      volumeCount,
      totalValue: Number(totalValue.toFixed(2)),
      percentFull: Math.min(100, Math.round((volumeCount / (loc.capacity || 30)) * 100)),
      sampleCovers: loc.volumes.map((v) => v.coverUrl).filter(Boolean).slice(0, 4),
    };
  });
}

export async function createShelfLocation(input: {
  roomName: string;
  bookcaseName: string;
  shelfName: string;
  description?: string;
  capacity?: number;
  storeId?: string;
}) {
  await ensureLibraryTablesExist();
  const room = input.roomName.trim();
  const bookcase = input.bookcaseName.trim();
  const shelf = input.shelfName.trim();
  const label = `${room} > ${bookcase} > ${shelf}`;

  return prisma.libraryShelfLocation.upsert({
    where: {
      roomName_bookcaseName_shelfName: {
        roomName: room,
        bookcaseName: bookcase,
        shelfName: shelf,
      },
    },
    update: {
      description: input.description || null,
      capacity: input.capacity || 30,
    },
    create: {
      roomName: room,
      bookcaseName: bookcase,
      shelfName: shelf,
      fullLocationLabel: label,
      description: input.description || null,
      capacity: input.capacity || 30,
      storeId: input.storeId || "ghostlight-demo",
    },
  });
}

export async function deleteShelfLocation(id: string) {
  await ensureLibraryTablesExist();
  // Unlink volumes first
  await prisma.libraryVolume.updateMany({
    where: { shelfLocationId: id },
    data: { shelfLocationId: null },
  });
  return prisma.libraryShelfLocation.delete({ where: { id } });
}

// Circulation & Lending
export async function loanVolume(
  volumeId: string,
  borrowerName: string,
  borrowerContact?: string | null,
  dueDate?: Date | string | null
) {
  await ensureLibraryTablesExist();
  return prisma.libraryVolume.update({
    where: { id: volumeId },
    data: {
      isLoaned: true,
      borrowerName: borrowerName.trim(),
      borrowerContact: borrowerContact?.trim() || null,
      loanDate: new Date(),
      dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days default
      returnDate: null,
    },
  });
}

export async function returnVolume(volumeId: string) {
  await ensureLibraryTablesExist();
  return prisma.libraryVolume.update({
    where: { id: volumeId },
    data: {
      isLoaned: false,
      returnDate: new Date(),
      borrowerName: null,
      borrowerContact: null,
      loanDate: null,
      dueDate: null,
    },
  });
}

// Library Dashboard Summary
export async function getLibraryDashboardSummary(storeId = "ghostlight-demo") {
  await ensureLibraryTablesExist();

  const [volumes, shelves] = await Promise.all([
    prisma.libraryVolume.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.libraryShelfLocation.findMany({ where: { storeId } }),
  ]);

  const totalVolumes = volumes.length;
  const totalReplacementValue = Number(
    volumes.reduce((sum, v) => sum + (v.replacementValue || 0), 0).toFixed(2)
  );

  const completedCount = volumes.filter((v) => v.readingStatus === "COMPLETED").length;
  const readingCount = volumes.filter((v) => v.readingStatus === "READING").length;
  const unreadCount = volumes.filter((v) => v.readingStatus === "UNREAD").length;
  const wishlistCount = volumes.filter((v) => v.readingStatus === "WISHLIST").length;
  const loanedCount = volumes.filter((v) => v.isLoaned).length;

  // Dewey Decimal 000-900 Distribution
  const deweyDistribution: Record<string, { count: number; label: string; totalValue: number }> = {};
  for (const [key, label] of Object.entries(DEWEY_DIVISIONS)) {
    deweyDistribution[key] = { count: 0, label, totalValue: 0 };
  }
  deweyDistribution["Other"] = { count: 0, label: "Unclassified / Custom", totalValue: 0 };

  for (const vol of volumes) {
    if (vol.deweyDecimal) {
      const match = vol.deweyDecimal.match(/^(\d{1,3})/);
      if (match) {
        const hundred = Math.floor(parseInt(match[1], 10) / 100) * 100;
        const key = String(hundred).padStart(3, "0");
        if (deweyDistribution[key]) {
          deweyDistribution[key].count++;
          deweyDistribution[key].totalValue += vol.replacementValue || 0;
          continue;
        }
      }
    }
    deweyDistribution["Other"].count++;
    deweyDistribution["Other"].totalValue += vol.replacementValue || 0;
  }

  // Active Loans
  const activeLoans = volumes
    .filter((v) => v.isLoaned)
    .map((v) => ({
      id: v.id,
      title: v.title,
      author: v.author,
      coverUrl: v.coverUrl,
      borrowerName: v.borrowerName,
      borrowerContact: v.borrowerContact,
      loanDate: v.loanDate,
      dueDate: v.dueDate,
      isOverdue: v.dueDate ? new Date(v.dueDate).getTime() < Date.now() : false,
    }));

  return {
    totalVolumes,
    totalReplacementValue,
    shelvesCount: shelves.length,
    readingStats: {
      completed: completedCount,
      reading: readingCount,
      unread: unreadCount,
      wishlist: wishlistCount,
      readPercentage: totalVolumes > 0 ? Math.round((completedCount / totalVolumes) * 100) : 0,
    },
    loanedCount,
    activeLoans,
    deweyDistribution: Object.entries(deweyDistribution).map(([key, data]) => ({
      divisionKey: key,
      label: data.label,
      count: data.count,
      totalValue: Number(data.totalValue.toFixed(2)),
    })),
    recentAdditions: volumes.slice(0, 10),
  };
}

// Insurance & Estate Appraisal Report
export async function generateValuationReport(storeId = "ghostlight-demo") {
  await ensureLibraryTablesExist();

  const volumes = await prisma.libraryVolume.findMany({
    where: { storeId },
    include: { shelfLocation: true },
    orderBy: [{ roomName: "asc" }, { author: "asc" }, { title: "asc" }],
  });

  const totalValue = volumes.reduce((sum, v) => sum + (v.replacementValue || 0), 0);
  const totalCost = volumes.reduce((sum, v) => sum + (v.acquisitionPrice || 0), 0);

  // Group by Room
  const roomBreakdown: Record<string, { count: number; value: number }> = {};
  for (const vol of volumes) {
    const room = vol.roomName || "Unassigned Location";
    if (!roomBreakdown[room]) roomBreakdown[room] = { count: 0, value: 0 };
    roomBreakdown[room].count++;
    roomBreakdown[room].value += vol.replacementValue || 0;
  }

  // High Value Volumes ($50+)
  const highValueVolumes = volumes
    .filter((v) => (v.replacementValue || 0) >= 50)
    .sort((a, b) => b.replacementValue - a.replacementValue);

  return {
    generatedAt: new Date().toISOString(),
    totalVolumes: volumes.length,
    totalReplacementValue: Number(totalValue.toFixed(2)),
    totalAcquisitionCost: Number(totalCost.toFixed(2)),
    averageVolumeValue: volumes.length > 0 ? Number((totalValue / volumes.length).toFixed(2)) : 0,
    roomBreakdown: Object.entries(roomBreakdown).map(([room, data]) => ({
      room,
      count: data.count,
      totalValue: Number(data.value.toFixed(2)),
    })),
    highValueVolumes,
    volumes,
  };
}


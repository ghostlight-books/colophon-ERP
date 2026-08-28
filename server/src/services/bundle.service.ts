import { prisma } from "../config/database.js";
import { syncInventoryItemByIsbn } from "./ecommerce.service.js";
import type {
  ProductBundle,
  BundlePricingSuggestion,
  CreateProductBundleInput,
  UnbundleResult,
} from "@colophon/shared";

/**
 * Calculates suggested bundle pricing: takes 10% off the total sum of individual items
 * and rounds to the nearest price ending in .99.
 *
 * Examples:
 * - $30.00 total -> 10% off = $27.00 -> nearest .99 = $26.99 (save $3.01 / 10.0%)
 * - $38.97 total -> 10% off = $35.07 -> nearest .99 = $34.99 (save $3.98 / 10.2%)
 * - $14.99 total -> 10% off = $13.49 -> nearest .99 = $13.99 (save $1.00 / 6.7%)
 */
export function calculateSuggestedBundlePrice(individualPrices: number[]): BundlePricingSuggestion {
  const total = individualPrices.reduce((sum, p) => sum + (typeof p === "number" && Number.isFinite(p) && p > 0 ? p : 0), 0);

  if (total <= 0) {
    return {
      totalIndividualPrice: 0,
      discountPercent: 10,
      discountedPrice: 0,
      suggestedBundlePrice: 9.99,
      savingsAmount: 0,
      savingsPercent: 10,
    };
  }

  // 10% discount off the total
  const discounted = total * 0.90;

  // Round to nearest price ending in .99
  let nearestPoint99 = Math.round(discounted) - 0.01;
  if (nearestPoint99 < 0.99) nearestPoint99 = 0.99;

  const suggested = Number(nearestPoint99.toFixed(2));
  const savingsAmount = Number(Math.max(0, total - suggested).toFixed(2));
  const savingsPercent = Number(((savingsAmount / total) * 100).toFixed(1));

  return {
    totalIndividualPrice: Number(total.toFixed(2)),
    discountPercent: 10,
    discountedPrice: Number(discounted.toFixed(2)),
    suggestedBundlePrice: suggested,
    savingsAmount,
    savingsPercent,
  };
}

let tablesChecked = false;
export async function ensureBundleTablesExist(): Promise<void> {
  if (tablesChecked) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProductBundle" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "parentSku" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "topic" TEXT,
        "description" TEXT,
        "bundlePrice" REAL NOT NULL,
        "originalTotalPrice" REAL NOT NULL,
        "discountPercent" REAL NOT NULL DEFAULT 10.0,
        "savingsAmount" REAL NOT NULL DEFAULT 0.0,
        "quantityOnHand" INTEGER NOT NULL DEFAULT 1,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "unbundledAt" DATETIME,
        "storeId" TEXT
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProductBundleItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "bundleId" TEXT NOT NULL,
        "isbn" TEXT NOT NULL,
        "sku" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "author" TEXT,
        "coverUrl" TEXT,
        "condition" TEXT,
        "listPrice" REAL NOT NULL,
        "category" TEXT,
        "subcategory" TEXT,
        "originalQty" INTEGER NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProductBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "ProductBundle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ProductBundle_parentSku_key" ON "ProductBundle"("parentSku");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductBundle_parentSku_idx" ON "ProductBundle"("parentSku");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductBundle_status_idx" ON "ProductBundle"("status");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductBundleItem_bundleId_idx" ON "ProductBundleItem"("bundleId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductBundleItem_isbn_idx" ON "ProductBundleItem"("isbn");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductBundleItem_sku_idx" ON "ProductBundleItem"("sku");`);

    try { await prisma.$executeRawUnsafe(`ALTER TABLE "IsbnLookupCache" ADD COLUMN "isBundle" BOOLEAN DEFAULT false;`); } catch {}
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "IsbnLookupCache" ADD COLUMN "bundleParentId" TEXT;`); } catch {}
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "IsbnLookupCache" ADD COLUMN "isBundledChild" BOOLEAN DEFAULT false;`); } catch {}

    tablesChecked = true;
  } catch (err) {
    console.warn("ensureBundleTablesExist warning:", err);
  }
}

/**
 * Searches in-stock, unbundled inventory items eligible for bundling by Topic/Category, Author, Title, or ISBN.
 */
export async function searchAvailableItemsForBundling(options: {
  query?: string;
  topic?: string;
  author?: string;
  title?: string;
  limit?: number;
}): Promise<Array<{
  isbn: string;
  sku: string;
  title: string;
  author: string | null;
  publisher: string | null;
  coverUrl: string | null;
  condition: string | null;
  listPrice: number;
  category: string | null;
  subcategory: string | null;
  quantityOnHand: number;
}>> {
  await ensureBundleTablesExist();
  const { query, topic, author, title, limit = 50 } = options;
  const cleanQuery = query?.trim().toLowerCase();

  const whereConditions: Array<Record<string, unknown>> = [
    { quantityOnHand: { gt: 0 } },
    { OR: [{ isBundle: false }, { isBundle: null }] },
    { OR: [{ isBundledChild: false }, { isBundledChild: null }] },
  ];

  if (topic && topic !== "All") {
    whereConditions.push({
      OR: [
        { category: { contains: topic } },
        { subcategory: { contains: topic } },
      ],
    });
  }

  if (author) {
    whereConditions.push({ author: { contains: author } });
  }

  if (title) {
    whereConditions.push({ title: { contains: title } });
  }

  if (cleanQuery) {
    whereConditions.push({
      OR: [
        { title: { contains: cleanQuery } },
        { author: { contains: cleanQuery } },
        { isbn: { contains: cleanQuery } },
        { sku: { contains: cleanQuery } },
        { category: { contains: cleanQuery } },
        { subcategory: { contains: cleanQuery } },
      ],
    });
  }

  const items = await prisma.isbnLookupCache.findMany({
    where: { AND: whereConditions },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  return items.map((item) => ({
    isbn: item.isbn,
    sku: item.sku,
    title: item.title ?? "Untitled Book",
    author: item.author,
    publisher: item.publisher,
    coverUrl: item.coverUrl,
    condition: item.condition,
    listPrice: item.listPrice ?? 9.99,
    category: item.category,
    subcategory: item.subcategory,
    quantityOnHand: item.quantityOnHand,
  }));
}

/**
 * Creates a new Product Bundle:
 * 1. Generates Parent SKU featuring topic and timestamp.
 * 2. Creates ProductBundle and child ProductBundleItem records.
 * 3. Creates/updates Parent Bundle in IsbnLookupCache, Book, and InventoryItem.
 * 4. Takes child items off individual sale by setting isBundledChild: true and reserving their quantity.
 */
function parsePrice(val: unknown, fallback = 9.99): number {
  if (typeof val === "number" && !isNaN(val) && Number.isFinite(val) && val > 0) {
    return Number(val.toFixed(2));
  }
  if (typeof val === "string") {
    const cleaned = parseFloat(val.replace(/[^0-9.]/g, ""));
    if (!isNaN(cleaned) && Number.isFinite(cleaned) && cleaned > 0) {
      return Number(cleaned.toFixed(2));
    }
  }
  return fallback;
}

export async function createProductBundle(input: CreateProductBundleInput): Promise<ProductBundle> {
  await ensureBundleTablesExist();
  if (!input.items || input.items.length < 2) {
    throw new Error("A product bundle must contain at least 2 items.");
  }

  const store = input.storeId
    ? await prisma.store.findFirst({ where: { OR: [{ id: input.storeId }, { slug: input.storeId }] } })
    : null;
  const validStoreId = store?.id || null;

  const itemPrices = input.items.map((item) => parsePrice(item.listPrice, 9.99));
  const pricing = calculateSuggestedBundlePrice(itemPrices);
  const customPriceNum = parsePrice(input.customBundlePrice, 0);
  const finalPrice = customPriceNum > 0 ? customPriceNum : pricing.suggestedBundlePrice;

  // Generate parent SKU with uniqueness protection
  const topicSlug = (input.topic || "GEN").replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
  const timeSuffix = Date.now().toString().slice(-6);
  const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  const parentSku = `BDL-${topicSlug || "BOOK"}-${timeSuffix}-${randomSuffix}`;
  const bundleIsbn = `BDL-${Date.now()}-${randomSuffix}`;

  // Smart title generation
  const itemTitles = input.items.map((i) => i.title || "Untitled Book");
  const defaultTitle = `${input.topic ? `${input.topic} Book Bundle` : "Curated Book Bundle"}: ${itemTitles.slice(0, 2).join(" & ")}${itemTitles.length > 2 ? ` (+${itemTitles.length - 2} more)` : ""}`;
  const finalTitle = (input.title?.trim() || defaultTitle).slice(0, 150);

  // Combine authors
  const uniqueAuthors = Array.from(new Set(input.items.map((i) => i.author).filter(Boolean)));
  const combinedAuthor = uniqueAuthors.length > 0 ? uniqueAuthors.slice(0, 3).join(", ") : "Various Authors";

  // First cover thumbnail
  const primaryCover = input.items.find((i) => Boolean(i.coverUrl))?.coverUrl || null;

  // 1. Create ProductBundle and child items in Prisma
  const bundleRecord = await prisma.productBundle.create({
    data: {
      parentSku,
      title: finalTitle,
      topic: input.topic || null,
      description: input.description || `Special value bundle featuring ${input.items.length} curated titles.`,
      bundlePrice: finalPrice,
      originalTotalPrice: pricing.totalIndividualPrice,
      discountPercent: pricing.discountPercent,
      savingsAmount: Number(Math.max(0, pricing.totalIndividualPrice - finalPrice).toFixed(2)),
      quantityOnHand: 1,
      status: "ACTIVE",
      storeId: validStoreId,
      items: {
        create: input.items.map((item) => ({
          isbn: item.isbn,
          sku: item.sku || `ITEM-${item.isbn.slice(-8)}-${Math.floor(Math.random() * 1000)}`,
          title: item.title || "Untitled Book",
          author: item.author || null,
          coverUrl: item.coverUrl || null,
          condition: item.condition || "Good",
          listPrice: parsePrice(item.listPrice, 9.99),
          category: item.category || null,
          subcategory: item.subcategory || null,
          originalQty: 1,
        })),
      },
    },
    include: {
      items: true,
    },
  });

  // 2. Create Parent Bundle in IsbnLookupCache for POS and Inventory visibility
  await prisma.isbnLookupCache.create({
    data: {
      isbn: bundleIsbn,
      sku: parentSku,
      title: finalTitle,
      author: combinedAuthor,
      publisher: "Ghostlight Bundles",
      coverUrl: primaryCover,
      category: input.topic || "Book Bundles",
      subcategory: "Curated Bundles",
      mediaType: "Bundle",
      quantityOnHand: 1,
      condition: "Curated Set",
      listPrice: finalPrice,
      thriftbooksPrice: pricing.totalIndividualPrice,
      source: "product-bundle",
      isBundle: true,
      storeId: validStoreId,
    },
  });

  // 3. Create Parent Bundle in Book & InventoryItem models
  const bookRecord = await prisma.book.create({
    data: {
      isbn13: bundleIsbn,
      title: finalTitle,
      author: combinedAuthor,
      publisher: "Ghostlight Bundles",
      listPriceCents: Math.round(finalPrice * 100),
      genre: input.topic || "Bundles",
    },
  });

  await prisma.inventoryItem.create({
    data: {
      bookId: bookRecord.id,
      sku: parentSku,
      condition: "Curated Set",
      quantityOnHand: 1,
      quantityReserved: 0,
      locationCode: "Bundle Shelf",
    },
  });

  // 4. Update Child Items: Take them off individual sale safely
  for (const item of input.items) {
    const existingCache = await prisma.isbnLookupCache.findUnique({ where: { isbn: item.isbn } });
    const currentQty = existingCache?.quantityOnHand ?? 1;

    await prisma.isbnLookupCache.updateMany({
      where: { isbn: item.isbn },
      data: {
        isBundledChild: true,
        bundleParentId: bundleRecord.id,
        quantityOnHand: Math.max(0, currentQty - 1),
      },
    });

    const book = await prisma.book.findUnique({ where: { isbn13: item.isbn } });
    if (book) {
      const invItems = await prisma.inventoryItem.findMany({ where: { bookId: book.id } });
      for (const inv of invItems) {
        await prisma.inventoryItem.update({
          where: { id: inv.id },
          data: {
            quantityOnHand: Math.max(0, inv.quantityOnHand - 1),
            quantityReserved: inv.quantityReserved + 1,
          },
        });
      }
    }

    // Trigger Shopify background inventory update
    void syncInventoryItemByIsbn(input.storeId || "ghostlight-demo", item.isbn).catch(() => null);
  }

  // Trigger Shopify sync for the new Parent Bundle
  void syncInventoryItemByIsbn(input.storeId || "ghostlight-demo", bundleIsbn).catch(() => null);

  return {
    ...bundleRecord,
    status: bundleRecord.status as "ACTIVE" | "UNBUNDLED" | "SOLD",
    createdAt: bundleRecord.createdAt.toISOString(),
    updatedAt: bundleRecord.updatedAt.toISOString(),
    unbundledAt: bundleRecord.unbundledAt ? bundleRecord.unbundledAt.toISOString() : null,
    items: bundleRecord.items.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString(),
    })),
  };
}

/**
 * Unbundles a Product Bundle:
 * 1. Dissolves the Parent Bundle SKU (sets quantityOnHand: 0, status: "UNBUNDLED").
 * 2. Restores all individual child items back to active standalone inventory.
 */
export async function unbundleProduct(bundleId: string, storeId = "ghostlight-demo"): Promise<UnbundleResult> {
  await ensureBundleTablesExist();
  const bundle = await prisma.productBundle.findUnique({
    where: { id: bundleId },
    include: { items: true },
  });

  if (!bundle) {
    throw new Error("Bundle not found.");
  }

  if (bundle.status === "UNBUNDLED") {
    throw new Error("This bundle has already been unbundled.");
  }

  // 1. Mark ProductBundle as UNBUNDLED
  await prisma.productBundle.update({
    where: { id: bundleId },
    data: {
      status: "UNBUNDLED",
      unbundledAt: new Date(),
      quantityOnHand: 0,
    },
  });

  // 2. Set Parent Bundle in IsbnLookupCache and InventoryItem to 0
  await prisma.isbnLookupCache.updateMany({
    where: { sku: bundle.parentSku },
    data: { quantityOnHand: 0 },
  });

  const parentBook = await prisma.book.findFirst({
    where: { inventoryItems: { some: { sku: bundle.parentSku } } },
  });
  if (parentBook) {
    await prisma.inventoryItem.updateMany({
      where: { bookId: parentBook.id },
      data: { quantityOnHand: 0 },
    });
  }

  // 3. Restore all child items to active standalone inventory
  for (const item of bundle.items) {
    await prisma.isbnLookupCache.updateMany({
      where: { isbn: item.isbn },
      data: {
        isBundledChild: false,
        bundleParentId: null,
        quantityOnHand: { increment: item.originalQty || 1 },
      },
    });

    const book = await prisma.book.findUnique({ where: { isbn13: item.isbn } });
    if (book) {
      await prisma.inventoryItem.updateMany({
        where: { bookId: book.id },
        data: {
          quantityOnHand: { increment: item.originalQty || 1 },
          quantityReserved: { decrement: item.originalQty || 1 },
        },
      });
    }

    // Trigger Shopify sync to re-publish restored inventory
    void syncInventoryItemByIsbn(storeId, item.isbn).catch(() => null);
  }

  return {
    success: true,
    bundleId: bundle.id,
    parentSku: bundle.parentSku,
    itemsRestored: bundle.items.length,
    message: `Successfully unbundled "${bundle.title}". ${bundle.items.length} titles restored to individual active inventory.`,
  };
}

/**
 * Lists all product bundles with their child item details.
 */
export async function listProductBundles(status = "ACTIVE"): Promise<ProductBundle[]> {
  await ensureBundleTablesExist();
  const bundles = await prisma.productBundle.findMany({
    where: status === "ALL" ? undefined : { status },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return bundles.map((b) => ({
    ...b,
    status: b.status as "ACTIVE" | "UNBUNDLED" | "SOLD",
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    unbundledAt: b.unbundledAt ? b.unbundledAt.toISOString() : null,
    items: b.items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
  }));
}

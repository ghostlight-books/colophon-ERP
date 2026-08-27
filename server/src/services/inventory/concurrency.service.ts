import { prisma } from "../../config/database.js";
import { withdrawOffer } from "../ebay/ebayInventory.service.js";
import { syncInventoryItemByIsbn } from "../ecommerce.service.js";

export interface ReservationLockResult {
  acquired: boolean;
  lockId?: string;
  expiresAt?: Date;
  message?: string;
}

export async function acquireReservationLock(
  storeId: string,
  isbn: string,
  sku: string,
  source: "POS_CHECKOUT" | "WEB_CART" | "EBAY_ORDER" | "SHOPIFY_ORDER",
  ttlMinutes = 15
): Promise<ReservationLockResult> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    select: { id: true },
  });
  const storePk = store?.id ?? storeId;
  const now = new Date();

  // Clean up any expired locks
  await prisma.inventoryReservationLock.deleteMany({
    where: {
      storeId: storePk,
      isbn,
      expiresAt: { lte: now },
    },
  });

  // Check if active lock exists
  const existingLock = await prisma.inventoryReservationLock.findFirst({
    where: {
      storeId: storePk,
      isbn,
      expiresAt: { gt: now },
    },
  });

  if (existingLock && existingLock.source !== source) {
    return {
      acquired: false,
      message: `Item ${isbn} is currently reserved in checkout by ${existingLock.source} until ${existingLock.expiresAt.toLocaleTimeString()}.`,
    };
  }

  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const lock = await prisma.inventoryReservationLock.create({
    data: {
      storeId: storePk,
      isbn,
      sku,
      source,
      lockedUnits: 1,
      expiresAt,
    },
  });

  return {
    acquired: true,
    lockId: lock.id,
    expiresAt,
  };
}

export async function releaseReservationLock(
  storeId: string,
  isbn: string,
  source?: string
): Promise<void> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    select: { id: true },
  });
  const storePk = store?.id ?? storeId;

  await prisma.inventoryReservationLock.deleteMany({
    where: {
      storeId: storePk,
      isbn,
      ...(source ? { source } : {}),
    },
  });
}

export async function handleLocalSaleAndSync(
  storeId: string,
  isbn: string,
  quantitySold = 1,
  checkoutSource: "POS" | "WEB" = "POS"
): Promise<{ success: boolean; remainingQuantity: number; delistedFromEbay: boolean; message: string }> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    select: { id: true },
  });
  const storePk = store?.id ?? storeId;

  const item = await prisma.isbnLookupCache.findUnique({ where: { isbn } });
  if (!item) {
    throw new Error(`Inventory item ${isbn} not found.`);
  }

  const remainingQuantity = Math.max(0, item.quantityOnHand - quantitySold);

  // 1. Update local inventory
  await prisma.isbnLookupCache.update({
    where: { isbn },
    data: { quantityOnHand: remainingQuantity },
  });

  // 2. Release any checkout reservation locks
  await releaseReservationLock(storePk, isbn);

  let delistedFromEbay = false;

  // 3. Concurrency Protection: If stock is 0 (single copy sold), immediately withdraw from eBay
  if (remainingQuantity === 0) {
    try {
      await withdrawOffer(storePk, isbn);
      delistedFromEbay = true;
    } catch (err) {
      console.warn(`[Concurrency] Auto-withdraw from eBay for ${isbn} skipped or unlisted:`, err);
    }
  }

  // 4. Sync updated stock level to Shopify in background
  syncInventoryItemByIsbn(storePk, isbn).catch((err) => {
    console.warn(`[Concurrency] Background Shopify sync for ${isbn} note:`, err);
  });

  return {
    success: true,
    remainingQuantity,
    delistedFromEbay,
    message: `Sold ${quantitySold} unit(s) of ${item.title ?? isbn}. Remaining: ${remainingQuantity}.${delistedFromEbay ? " Delisted immediately from eBay to prevent double-selling." : ""}`,
  };
}

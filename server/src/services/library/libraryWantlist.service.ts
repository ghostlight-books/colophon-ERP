import { prisma } from "../../config/database.js";
import { ensureLibraryTablesExist } from "./libraryVolume.service.js";

export interface CreateWantlistItemInput {
  title: string;
  author?: string | null;
  isbn?: string | null;
  notes?: string | null;
  maxPrice?: number | null;
  librarySpaceId?: string | null;
}

export interface UpdateWantlistItemInput {
  title?: string;
  author?: string | null;
  isbn?: string | null;
  notes?: string | null;
  maxPrice?: number | null;
  status?: "ACTIVE" | "FULFILLED" | "ARCHIVED";
}

// Same listing statuses the Exchange marketplace treats as "available to
// acquire" -- see listExchangeMarketplace in libraryExchange.service.ts.
const MARKETPLACE_LISTING_STATUSES = ["ALLOW_OFFERS", "OPEN_FOR_TRADE", "FOR_SALE"];

function normalizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  return cleaned || null;
}

/**
 * Finds candidate matches for a wantlist item across the same unscoped
 * exchange-eligible LibraryVolume pool that the Network Marketplace browses
 * (there is no per-tenant isolation on Exchange today -- see
 * listExchangeMarketplace). An ISBN match is authoritative; otherwise falls
 * back to a title (+ author, if given) text match.
 */
async function findMatchesForItem(item: { isbn: string | null; title: string; author: string | null }) {
  if (item.isbn) {
    const isbnMatches = await prisma.libraryVolume.findMany({
      where: { listingStatus: { in: MARKETPLACE_LISTING_STATUSES }, isbn: item.isbn },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    if (isbnMatches.length > 0) {
      return isbnMatches;
    }
  }

  const where: any = {
    listingStatus: { in: MARKETPLACE_LISTING_STATUSES },
    title: { contains: item.title },
  };
  if (item.author) {
    where.author = { contains: item.author };
  }

  return prisma.libraryVolume.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
}

/**
 * Called whenever a volume's listingStatus changes to a marketplace-eligible
 * status (see createLibraryVolume/updateLibraryVolume in
 * libraryVolume.service.ts). Checks every active wantlist item's existing
 * match logic against this one volume and notifies on a hit, deduped by
 * actionUrl so re-saving the same volume doesn't spam repeat notifications.
 */
export async function notifyWantlistMatchesForVolume(volume: {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  listingStatus: string;
}): Promise<void> {
  if (!MARKETPLACE_LISTING_STATUSES.includes(volume.listingStatus)) return;

  const activeItems = await prisma.libraryWantlistItem.findMany({ where: { status: "ACTIVE" } });
  if (activeItems.length === 0) return;

  const actionUrl = `/library/exchange?volumeId=${volume.id}`;
  const alreadyNotified = await prisma.libraryNotification.findFirst({ where: { type: "WISHLIST_MATCH", actionUrl } });
  if (alreadyNotified) return;

  for (const item of activeItems) {
    const matches = await findMatchesForItem({ isbn: item.isbn, title: item.title, author: item.author });
    if (!matches.some((m) => m.id === volume.id)) continue;

    await prisma.libraryNotification.create({
      data: {
        title: `Wishlist match: "${item.title}"`,
        detail: `"${volume.title}"${volume.author ? ` by ${volume.author}` : ""} is now available and matches your wishlist item.`,
        type: "WISHLIST_MATCH",
        actionUrl,
      },
    });
    return; // one notification per newly-listed volume is enough, even if it matches multiple wantlist items
  }
}

export async function listWantlistItems(librarySpaceId?: string) {
  await ensureLibraryTablesExist();

  const where: any = { status: { not: "ARCHIVED" } };
  if (librarySpaceId && librarySpaceId !== "ALL") {
    where.librarySpaceId = librarySpaceId;
  }

  const items = await prisma.libraryWantlistItem.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    items.map(async (item) => ({
      ...item,
      matches: await findMatchesForItem(item),
    })),
  );
}

export async function createWantlistItem(input: CreateWantlistItemInput) {
  await ensureLibraryTablesExist();

  if (!input.title || !input.title.trim()) {
    throw new Error("A title is required to add a wantlist item.");
  }

  const item = await prisma.libraryWantlistItem.create({
    data: {
      title: input.title.trim(),
      author: input.author?.trim() || null,
      isbn: normalizeIsbn(input.isbn),
      notes: input.notes?.trim() || null,
      maxPrice: input.maxPrice ?? null,
      librarySpaceId: input.librarySpaceId || null,
      status: "ACTIVE",
    },
  });

  return { ...item, matches: await findMatchesForItem(item) };
}

export async function updateWantlistItem(id: string, input: UpdateWantlistItemInput) {
  await ensureLibraryTablesExist();

  const existing = await prisma.libraryWantlistItem.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Wantlist item ${id} not found.`);
  }

  const item = await prisma.libraryWantlistItem.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.author !== undefined ? { author: input.author?.trim() || null } : {}),
      ...(input.isbn !== undefined ? { isbn: normalizeIsbn(input.isbn) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.maxPrice !== undefined ? { maxPrice: input.maxPrice } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  return { ...item, matches: await findMatchesForItem(item) };
}

export async function deleteWantlistItem(id: string) {
  await ensureLibraryTablesExist();
  await prisma.libraryWantlistItem.delete({ where: { id } });
  return { success: true };
}

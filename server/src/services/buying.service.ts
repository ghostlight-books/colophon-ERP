import { prisma } from "../config/database.js";
import { lookupBookByIsbn, resolveSmartBookPrice, autoCorrectIsbn, parseIsbn, lookupGoogleBooks } from "./isbnScanner.service.js";
import { lookupThriftbooksDetails } from "./thriftbooksScraper.service.js";
import { lookupAbeBooksPrice } from "./abebooksScraper.service.js";
import type {
  BookBuyingCondition,
  BookBuyingOffer,
  BookBuyingSearchParams,
  BookBuyingSearchResult,
} from "@colophon/shared";

const PROVIDER_TIMEOUT_MS = 10000;

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
}

export function getConditionDiscount(condition: BookBuyingCondition): number {
  switch (condition) {
    case "Fine":
      return 0;
    case "Very Good":
      return 0.1;
    case "Good":
      return 0.2;
    case "Fair":
      return 0.3;
    case "Poor":
      return 0.4;
    default:
      return 0.2;
  }
}

export function validateBuyingSearchParams(input: {
  year?: unknown;
  publisher?: unknown;
  author?: unknown;
  isbn?: unknown;
  title?: unknown;
}): { valid: boolean; error?: string; cleanParams?: BookBuyingSearchParams } {
  const rawYear = input.year;
  const yearNum = typeof rawYear === "number" ? rawYear : Number(String(rawYear ?? "").trim());

  if (!Number.isFinite(yearNum) || yearNum < 1450 || yearNum > 2100) {
    return {
      valid: false,
      error: "Publication Year is required and must be a valid 4-digit year (e.g. 1998).",
    };
  }

  const publisher = typeof input.publisher === "string" ? input.publisher.trim() : "";
  const author = typeof input.author === "string" ? input.author.trim() : "";
  const isbn = typeof input.isbn === "string" ? input.isbn.trim() : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";

  if (!publisher && !author && !isbn && !title) {
    return {
      valid: false,
      error: "At least one additional search criterion (Publisher, Author, ISBN, or Title) is required along with Year.",
    };
  }

  return {
    valid: true,
    cleanParams: {
      year: yearNum,
      publisher: publisher || undefined,
      author: author || undefined,
      isbn: isbn || undefined,
      title: title || undefined,
    },
  };
}

export async function searchBuyingEditions(params: BookBuyingSearchParams): Promise<BookBuyingSearchResult[]> {
  const results: BookBuyingSearchResult[] = [];
  const seenIsbns = new Set<string>();

  // 1. Search Open Library by criteria
  try {
    const queryParts: string[] = [];
    if (params.title) queryParts.push(`title=${encodeURIComponent(params.title)}`);
    if (params.author) queryParts.push(`author=${encodeURIComponent(params.author)}`);
    if (params.publisher) queryParts.push(`publisher=${encodeURIComponent(params.publisher)}`);
    if (params.isbn) queryParts.push(`isbn=${encodeURIComponent(params.isbn.replace(/[^0-9X]/gi, ""))}`);
    if (params.year) queryParts.push(`first_publish_year=${encodeURIComponent(params.year)}`);

    const olUrl = `https://openlibrary.org/search.json?${queryParts.join("&")}&limit=20&fields=title,author_name,first_publish_year,publisher,isbn,cover_i`;
    const res = await fetchWithTimeout(olUrl);
    if (res.ok) {
      const data = (await res.json()) as {
        docs?: Array<{
          title?: string;
          author_name?: string[];
          first_publish_year?: number;
          publisher?: string[];
          isbn?: string[];
          cover_i?: number;
        }>;
      };

      for (const doc of data.docs ?? []) {
        const foundIsbn = doc.isbn?.find((v) => v.length === 13) ?? doc.isbn?.find((v) => v.length === 10);
        if (foundIsbn && doc.title && !seenIsbns.has(foundIsbn)) {
          seenIsbns.add(foundIsbn);
          const estimatedResale = 12.99;
          const offer = Number((estimatedResale * 0.60).toFixed(2));
          results.push({
            isbn: foundIsbn,
            title: doc.title,
            author: doc.author_name?.[0] ?? null,
            year: doc.first_publish_year ?? params.year,
            publisher: doc.publisher?.[0] ?? params.publisher ?? null,
            coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
            estimatedRetailValue: estimatedResale,
            offerAmount: offer,
          });
        }
      }
    }
  } catch (err) {
    console.warn("Open Library search query error", err);
  }

  // 2. Query Google Books for fallback matches
  if (results.length < 5) {
    try {
      const gbQueries: string[] = [];
      if (params.title) gbQueries.push(`intitle:${params.title}`);
      if (params.author) gbQueries.push(`inauthor:${params.author}`);
      if (params.publisher) gbQueries.push(`inpublisher:${params.publisher}`);
      if (params.isbn) gbQueries.push(`isbn:${params.isbn.replace(/[^0-9X]/gi, "")}`);

      const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(gbQueries.join("+"))}&maxResults=10`;
      const res = await fetchWithTimeout(gbUrl);
      if (res.ok) {
        const data = (await res.json()) as {
          items?: Array<{
            volumeInfo?: {
              title?: string;
              authors?: string[];
              publisher?: string;
              publishedDate?: string;
              industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
              imageLinks?: { thumbnail?: string };
            };
            saleInfo?: { listPrice?: { amount?: number }; retailPrice?: { amount?: number } };
          }>;
        };

        for (const item of data.items ?? []) {
          const vol = item.volumeInfo;
          if (!vol?.title) continue;
          const isbn13 = vol.industryIdentifiers?.find((id) => id.type === "ISBN_13")?.identifier;
          const isbn10 = vol.industryIdentifiers?.find((id) => id.type === "ISBN_10")?.identifier;
          const isbnFound = isbn13 || isbn10;
          if (isbnFound && !seenIsbns.has(isbnFound)) {
            const pubYear = vol.publishedDate ? parseInt(vol.publishedDate.slice(0, 4), 10) : null;
            if (!params.year || !pubYear || Math.abs(pubYear - params.year) <= 2) {
              seenIsbns.add(isbnFound);
              const listAmount = item.saleInfo?.listPrice?.amount || item.saleInfo?.retailPrice?.amount || 14.99;
              const offer = Number((listAmount * 0.60).toFixed(2));
              results.push({
                isbn: isbnFound,
                title: vol.title,
                author: vol.authors?.[0] ?? null,
                year: pubYear ?? params.year,
                publisher: vol.publisher ?? params.publisher ?? null,
                coverUrl: vol.imageLinks?.thumbnail ? vol.imageLinks.thumbnail.replace("http://", "https://") : null,
                estimatedRetailValue: listAmount,
                offerAmount: offer,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("Google Books search query error", err);
    }
  }

  // 3. Match from local cache if available
  try {
    const localMatches = await prisma.isbnLookupCache.findMany({
      where: {
        OR: [
          ...(params.isbn ? [{ isbn: { contains: params.isbn } }] : []),
          ...(params.title ? [{ title: { contains: params.title } }] : []),
          ...(params.author ? [{ author: { contains: params.author } }] : []),
          ...(params.publisher ? [{ publisher: { contains: params.publisher } }] : []),
        ],
      },
      take: 5,
    });

    for (const item of localMatches) {
      if (!seenIsbns.has(item.isbn)) {
        seenIsbns.add(item.isbn);
        const sellVal = item.listPrice ?? item.thriftbooksPrice ?? 12.99;
        results.unshift({
          isbn: item.isbn,
          title: item.title ?? "Untitled",
          author: item.author,
          year: params.year,
          publisher: item.publisher ?? params.publisher ?? null,
          coverUrl: item.coverUrl,
          estimatedRetailValue: sellVal,
          offerAmount: Number((sellVal * 0.60).toFixed(2)),
        });
      }
    }
  } catch {
    // Ignore local search errors
  }

  return results;
}

export async function evaluateBuyingBook(
  inputIsbn: string,
  condition: BookBuyingCondition = "Good",
): Promise<BookBuyingOffer> {
  const { normalized } = parseIsbn(inputIsbn);
  const cleanIsbn = autoCorrectIsbn(normalized || inputIsbn);

  // 1. Fetch metadata and baseline
  const bookLookup = await lookupBookByIsbn(cleanIsbn);

  // 2. Fetch live comparative marketplace prices
  const [tbDetails, abePrice, gbDetails] = await Promise.all([
    lookupThriftbooksDetails(cleanIsbn).catch(() => null),
    lookupAbeBooksPrice(cleanIsbn).catch(() => null),
    lookupGoogleBooks(cleanIsbn).catch(() => null),
  ]);

  const rawPrices = [
    tbDetails?.price,
    abePrice,
    gbDetails?.listPrice,
    bookLookup?.thriftbooksPrice,
  ].filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0);

  const priceRangeLow = rawPrices.length > 0 ? Math.min(...rawPrices) : 4.99;
  const priceRangeHigh = rawPrices.length > 0 ? Math.max(...rawPrices) : 18.99;

  // Base resell price: prioritize ThriftBooks, AbeBooks, Google Books, then format calculation
  let baseSellPrice = (tbDetails?.price && tbDetails.price > 0)
    ? tbDetails.price
    : (abePrice ?? gbDetails?.listPrice ?? bookLookup?.thriftbooksPrice ?? resolveSmartBookPrice(bookLookup?.bindingFormat, bookLookup?.pageCount));

  if (!baseSellPrice || baseSellPrice <= 0) {
    baseSellPrice = 9.99;
  }

  // Apply condition adjustment
  const discount = getConditionDiscount(condition);
  const conditionAdjustedRetail = Math.max(1.99, baseSellPrice * (1 - discount));
  const estimatedRetailValue = Number(conditionAdjustedRetail.toFixed(2));

  // 60% Store Buy Offer Math
  const offerPercentage = 60;
  const offerAmount = Number((estimatedRetailValue * 0.60).toFixed(2));
  const storeCreditOfferAmount = Number((estimatedRetailValue * 0.70).toFixed(2));

  return {
    isbn: cleanIsbn,
    title: bookLookup?.title ?? tbDetails?.title ?? gbDetails?.title ?? `Scanned Book (${cleanIsbn})`,
    author: bookLookup?.author ?? tbDetails?.author ?? gbDetails?.author ?? null,
    publisher: bookLookup?.publisher ?? gbDetails?.publisher ?? null,
    year: null,
    coverUrl: bookLookup?.coverUrl ?? gbDetails?.coverUrl ?? null,
    bindingFormat: bookLookup?.bindingFormat ?? null,
    pageCount: bookLookup?.pageCount ?? gbDetails?.pageCount ?? null,
    condition,
    conditionDiscount: discount,
    estimatedRetailValue,
    offerPercentage,
    offerAmount,
    storeCreditOfferAmount,
    marketSources: {
      thriftbooksPrice: tbDetails?.price ?? null,
      abebooksPrice: abePrice ?? null,
      googleBooksPrice: gbDetails?.listPrice ?? null,
      priceRangeLow: Number(priceRangeLow.toFixed(2)),
      priceRangeHigh: Number(priceRangeHigh.toFixed(2)),
    },
  };
}

export async function processBuyingBatch(input: {
  items: Array<{
    isbn: string;
    condition: BookBuyingCondition;
    sellPrice: number;
    buyOffer: number;
    title?: string;
    author?: string;
  }>;
  paymentMethod: "cash" | "storecredit" | "check";
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  storeId?: string;
}): Promise<{
  success: boolean;
  batchId: string;
  itemsProcessed: number;
  totalPaid: number;
  paymentMethod: string;
  timestamp: string;
}> {
  const storeId = input.storeId || "ghostlight-demo";
  const batchId = `BUY-${Date.now()}`;
  let totalPaid = 0;

  for (const item of input.items) {
    totalPaid += item.buyOffer;

    // Update inventory quantity and condition
    await prisma.isbnLookupCache.upsert({
      where: { isbn: item.isbn },
      create: {
        isbn: item.isbn,
        title: item.title ?? `Acquired Book (${item.isbn})`,
        author: item.author ?? null,
        quantityOnHand: 1,
        condition: item.condition,
        listPrice: item.sellPrice,
        thriftbooksPrice: item.sellPrice,
        source: "buyout-desk",
        category: "Print Books",
        mediaType: "Book",
        sku: `BUY-${item.isbn.slice(-6)}`,
      },
      update: {
        quantityOnHand: { increment: 1 },
        condition: item.condition,
        listPrice: item.sellPrice,
      },
    });

    // Record scan/acquisition event
    await prisma.scanEvent.create({
      data: {
        isbn: item.isbn,
        inventoryId: item.isbn,
        deviceId: "buying-desk",
        stationName: "Book Buying Desk",
        condition: item.condition,
        listPrice: item.sellPrice,
        container: "Buying Inbound",
      },
    }).catch(() => null);
  }

  // If cash/check payment, log outgoing inventory purchase transaction in Finance
  if (input.paymentMethod === "cash" || input.paymentMethod === "check") {
    await prisma.financeTransaction.create({
      data: {
        accountCode: "5010-INVENTORY-PURCHASES",
        name: `Customer Book Buyout (${input.items.length} titles) - ${input.customerName || "Walk-in"}`,
        amount: -Number(totalPaid.toFixed(2)),
        direction: "OUTFLOW",
        reconciled: true,
      },
    }).catch(() => null);
  }

  return {
    success: true,
    batchId,
    itemsProcessed: input.items.length,
    totalPaid: Number(totalPaid.toFixed(2)),
    paymentMethod: input.paymentMethod,
    timestamp: new Date().toISOString(),
  };
}

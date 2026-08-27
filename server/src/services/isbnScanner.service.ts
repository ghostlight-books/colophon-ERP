import { prisma } from "../config/database.js";
import { lookupAbeBooksPrice } from "./abebooksScraper.service.js";
import { lookupThriftbooksDetails } from "./thriftbooksScraper.service.js";
import { lookupIsbndb, extractGenreAndCategory } from "./isbndb.service.js";

const PROVIDER_TIMEOUT_MS = 10000;
const skuSequences = new Map<string, number>();

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
}

export interface ParsedIsbn {
  raw: string;
  normalized: string;
}

export interface BookLookup {
  isbn: string;
  title: string | null;
  author: string | null;
  publisher: string | null;
  description: string | null;
  seoKeywords: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  catalogTags: string | null;
  coverUrl: string | null;
  quantityOnHand: number;
  thriftbooksPrice: number | null;
  category: string | null;
  subcategory: string | null;
  mediaType: string;
  sku: string;
  label: {
    sku: string;
    barcode: string;
    title: string | null;
    category: string | null;
    subcategory: string | null;
    price: number | null;
  };
  source: "ISBNdb" | "Open Library" | "Thriftbooks";
}

function generateCatalogContent(title: string | null, author: string | null, category: string | null, subcategory: string | null, subjects: string[]): Pick<BookLookup, "seoKeywords" | "seoTitle" | "seoDescription"> {
  const safeTitle = title ?? "Book";
  const keywordValues = [...new Set([safeTitle, author, category, subcategory, ...subjects.slice(0, 5), "independent bookstore", "print books"].filter(Boolean))];
  const seoTitle = `${safeTitle}${author ? ` by ${author}` : ""}`;
  const seoDescription = `Explore ${safeTitle}${author ? ` by ${author}` : ""} at Ghostlight Books${subcategory ? ` in ${subcategory}` : ""}.`;
  return {
    seoKeywords: keywordValues.join(", "),
    seoTitle: seoTitle.length > 60 ? `${seoTitle.slice(0, 57).trimEnd()}...` : seoTitle,
    seoDescription: seoDescription.length > 155 ? `${seoDescription.slice(0, 152).trimEnd()}...` : seoDescription,
  };
}

function codePart(value: string | null, fallback: string): string {
  const letters = (value ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || fallback).padEnd(3, "X");
}

function createSku(category: string | null, subcategory: string | null, author: string | null): string {
  const authorParts = (author ?? "").trim().split(/\s+/);
  const authorLastName = authorParts[authorParts.length - 1] || null;
  const prefix = `${codePart(subcategory || category, "BOK")}${codePart(subcategory, "GEN")}${codePart(authorLastName, "UNK")}`;
  const sequence = skuSequences.get(prefix) ?? 0;
  skuSequences.set(prefix, sequence + 1);
  return `${prefix.slice(0, 3)}-${prefix.slice(3, 6)}-${prefix.slice(6, 9)}-${String(sequence).padStart(4, "0")}`;
}

function createLabel(book: Omit<BookLookup, "label">): BookLookup["label"] {
  return {
    sku: book.sku,
    barcode: book.isbn,
    title: book.title,
    category: book.category,
    subcategory: book.subcategory,
    price: book.thriftbooksPrice,
  };
}

function fromCache(record: {
  isbn: string;
  title: string | null;
  author: string | null;
  coverUrl: string | null;
  quantityOnHand: number;
  thriftbooksPrice: number | null;
  category: string | null;
  subcategory: string | null;
  sku: string;
  labelTitle: string | null;
  source: string;
  mediaType: string;
  publisher: string | null;
  description: string | null;
  seoKeywords: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  catalogTags: string | null;
}): BookLookup {
  const result: Omit<BookLookup, "label"> = {
    isbn: record.isbn,
    title: record.title ?? record.labelTitle,
    author: record.author,
    publisher: record.publisher,
    description: record.description,
    seoKeywords: record.seoKeywords,
    seoTitle: record.seoTitle,
    seoDescription: record.seoDescription,
    catalogTags: record.catalogTags,
    coverUrl: record.coverUrl,
    quantityOnHand: record.quantityOnHand,
    thriftbooksPrice: record.thriftbooksPrice,
    category: record.category,
    subcategory: record.subcategory,
    mediaType: record.mediaType,
    sku: record.sku,
    source: "Open Library",
  };
  return {
    ...result,
    label: {
      ...createLabel(result),
      title: record.labelTitle ?? record.title,
    },
  };
}

async function saveToCache(book: BookLookup): Promise<void> {
  await prisma.isbnLookupCache.upsert({
    where: { isbn: book.isbn },
    create: {
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      publisher: book.publisher,
      description: book.description,
      seoKeywords: book.seoKeywords,
      seoTitle: book.seoTitle,
      seoDescription: book.seoDescription,
      catalogTags: book.catalogTags,
      coverUrl: book.coverUrl,
      quantityOnHand: book.quantityOnHand,
      thriftbooksPrice: book.thriftbooksPrice,
      category: book.category,
      subcategory: book.subcategory,
      mediaType: book.mediaType,
      sku: book.sku,
      labelTitle: book.label.title,
      source: book.source,
    },
    update: {
      title: book.title,
      author: book.author,
      publisher: book.publisher,
      description: book.description,
      seoKeywords: book.seoKeywords,
      seoTitle: book.seoTitle,
      seoDescription: book.seoDescription,
      catalogTags: book.catalogTags,
      coverUrl: book.coverUrl,
      quantityOnHand: book.quantityOnHand,
      thriftbooksPrice: book.thriftbooksPrice,
      category: book.category,
      subcategory: book.subcategory,
      mediaType: book.mediaType,
      sku: book.sku,
      labelTitle: book.label.title,
      source: book.source,
    },
  });
}

export function parseIsbn(input: string): ParsedIsbn {
  const normalized = input.replace(/[^0-9X]/gi, "").toUpperCase();
  return {
    raw: input,
    normalized
  };
}

function hasValidCheckDigit(isbn: string): boolean {
  if (isbn.length === 13) {
    const sum = isbn
      .slice(0, 12)
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10 === Number(isbn[12]);
  }

  if (isbn.length === 10) {
    const sum = isbn.split("").reduce((total, digit, index) => {
      const value = digit.toUpperCase() === "X" ? 10 : Number(digit);
      return total + value * (10 - index);
    }, 0);
    return sum % 11 === 0;
  }

  return false;
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const match = value.find((item) => typeof item === "string" && item.trim().length > 0);
    return typeof match === "string" ? match.trim() : null;
  }
  return null;
}

function firstNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function normalizeCategories(subjects: string[], providerCategory: string | null = null): { category: string; subcategory: string | null } {
  const result = extractGenreAndCategory(subjects, providerCategory);
  return { category: result.category, subcategory: result.genre || result.subcategory };
}

async function lookupOpenLibrary(isbn: string): Promise<BookLookup | null> {
  const response = await fetchWithTimeout(`https://openlibrary.org/isbn/${isbn}.json`);
  if (!response.ok) {
    return null;
  }

  const edition = (await response.json()) as {
    title?: unknown;
    authors?: Array<{ key?: string }>;
    publishers?: string[];
    description?: unknown;
    covers?: number[];
    subjects?: string[];
  };
  const authorKeys = (edition.authors ?? []).map((author) => author.key).filter((key): key is string => Boolean(key));
  const authorNames = await Promise.all(
    authorKeys.slice(0, 3).map(async (key) => {
      try {
        const authorResponse = await fetchWithTimeout(`https://openlibrary.org${key}.json`);
        if (!authorResponse.ok) {
          return null;
        }
        const author = (await authorResponse.json()) as { name?: unknown };
        return firstString(author.name);
      } catch {
        return null;
      }
    }),
  );
  const classification = extractGenreAndCategory(edition.subjects ?? []);
  const author = authorNames.filter((name): name is string => Boolean(name)).join(", ") || null;
  const description = typeof edition.description === "string"
    ? edition.description
    : typeof edition.description === "object" && edition.description !== null && "value" in edition.description
      ? firstString((edition.description as { value?: unknown }).value)
      : null;
  const seo = generateCatalogContent(firstString(edition.title), author, classification.category, classification.genre || classification.subcategory, edition.subjects ?? []);

  const result: Omit<BookLookup, "label"> = {
    isbn,
    title: firstString(edition.title),
    author,
    publisher: firstString(edition.publishers),
    description,
    ...seo,
    catalogTags: classification.tags.join(", ") || null,
    coverUrl: edition.covers?.[0] ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg` : null,
    quantityOnHand: 0,
    thriftbooksPrice: null,
    category: classification.category,
    subcategory: classification.genre || classification.subcategory,
    sku: createSku(classification.category, classification.genre || classification.subcategory, author), 
    source: "Open Library",
    mediaType: "Book",
  };
  return { ...result, label: createLabel(result) };
}

export async function pullOpenLibraryMetadata(isbn: string): Promise<Pick<BookLookup, "title" | "author" | "publisher" | "description" | "catalogTags" | "seoKeywords" | "seoTitle" | "seoDescription" | "category" | "subcategory" | "coverUrl"> | null> {
  const book = await lookupOpenLibrary(isbn);
  if (!book) return null;
  return {
    title: book.title,
    author: book.author,
    publisher: book.publisher,
    description: book.description,
    catalogTags: book.catalogTags,
    seoKeywords: book.seoKeywords,
    seoTitle: book.seoTitle,
    seoDescription: book.seoDescription,
    category: book.category,
    subcategory: book.subcategory,
    coverUrl: book.coverUrl,
  };
}

export async function lookupBookByIsbn(input: string): Promise<BookLookup | null> {
  const { normalized } = parseIsbn(input);
  if ((normalized.length !== 10 && normalized.length !== 13) || !hasValidCheckDigit(normalized)) {
    return null;
  }

  try {
    const cached = await prisma.isbnLookupCache.findUnique({ where: { isbn: normalized } });
    if (cached) {
      const cachedBook = fromCache(cached);
      let resolvedPrice = cachedBook.thriftbooksPrice;
      let fetchedTbDetails: import("./thriftbooksScraper.service.js").ThriftbooksDetails | null = null;

      if (resolvedPrice === null) {
        fetchedTbDetails = await lookupThriftbooksDetails(normalized);
        resolvedPrice = fetchedTbDetails?.price ?? await lookupAbeBooksPrice(normalized);
      }

      if (cachedBook.title) {
        const needsEnrichment = !cachedBook.category || cachedBook.category !== "Print Books" || (!cachedBook.author && !cached.publisher && !cached.coverUrl && !cached.description);
        if (needsEnrichment) {
          const isbndbMatch = await lookupIsbndb(normalized);
          if (isbndbMatch) {
            const enriched: BookLookup = {
              ...cachedBook,
              title: cachedBook.title || isbndbMatch.title,
              author: cachedBook.author || isbndbMatch.author,
              publisher: cached.publisher || isbndbMatch.publisher,
              description: cached.description || isbndbMatch.description,
              coverUrl: cachedBook.coverUrl || isbndbMatch.coverUrl,
              catalogTags: isbndbMatch.tags.join(", "),
              category: "Print Books",
              subcategory: isbndbMatch.genre || isbndbMatch.subcategory,
              thriftbooksPrice: resolvedPrice ?? isbndbMatch.listPrice,
              label: { ...cachedBook.label, price: resolvedPrice ?? isbndbMatch.listPrice, category: "Print Books", subcategory: isbndbMatch.genre || isbndbMatch.subcategory },
            };
            await saveToCache(enriched);
            return enriched;
          }

          const olMatch = await lookupOpenLibrary(normalized).catch(() => null);
          if (olMatch) {
            const refreshed = {
              ...cachedBook,
              ...olMatch,
              category: "Print Books",
              thriftbooksPrice: resolvedPrice,
              label: { ...cachedBook.label, ...olMatch.label, price: resolvedPrice, category: "Print Books" },
            };
            await saveToCache(refreshed);
            return refreshed;
          }
        }
        if (resolvedPrice !== cachedBook.thriftbooksPrice || cachedBook.category !== "Print Books") {
          const classification = extractGenreAndCategory([], fetchedTbDetails?.category);
          const refreshed: BookLookup = {
            ...cachedBook,
            category: "Print Books",
            subcategory: cachedBook.subcategory ?? classification.genre ?? classification.subcategory,
            thriftbooksPrice: resolvedPrice,
            label: { ...cachedBook.label, price: resolvedPrice, category: "Print Books", subcategory: cachedBook.subcategory ?? classification.genre ?? classification.subcategory },
          };
          await saveToCache(refreshed);
          return refreshed;
        }
        return cachedBook;
      }
    }

    // Step 1: Query ISBNdb first
    const isbndbData = await lookupIsbndb(normalized);
    if (isbndbData) {
      let price = isbndbData.listPrice;
      if (price === null) {
        const tb = await lookupThriftbooksDetails(normalized);
        price = tb?.price ?? await lookupAbeBooksPrice(normalized);
      }

      const seo = generateCatalogContent(isbndbData.title, isbndbData.author, isbndbData.category, isbndbData.genre || isbndbData.subcategory, isbndbData.subjects);
      const sku = createSku(isbndbData.category, isbndbData.genre || isbndbData.subcategory, isbndbData.author);
      const bookLookup: BookLookup = {
        isbn: normalized,
        title: isbndbData.title,
        author: isbndbData.author,
        publisher: isbndbData.publisher,
        description: isbndbData.description,
        ...seo,
        catalogTags: isbndbData.tags.join(", "),
        coverUrl: isbndbData.coverUrl,
        quantityOnHand: 0,
        thriftbooksPrice: price,
        category: isbndbData.category, // "Print Books"
        subcategory: isbndbData.genre || isbndbData.subcategory,
        mediaType: "Book",
        sku,
        label: {
          sku,
          barcode: normalized,
          title: isbndbData.title,
          category: isbndbData.category,
          subcategory: isbndbData.genre || isbndbData.subcategory,
          price,
        },
        source: "ISBNdb",
      };
      await saveToCache(bookLookup);
      return bookLookup;
    }

    // Step 2: Fallback to OpenLibrary + Web Scraper
    const [bookResult, thriftbooksDetails] = await Promise.all([
      lookupOpenLibrary(normalized).catch(() => null),
      lookupThriftbooksDetails(normalized),
    ]);
    const fallbackPrice = thriftbooksDetails?.price ?? await lookupAbeBooksPrice(normalized);
    const book = bookResult;
    if (!book) {
      if (fallbackPrice === null) {
        return null;
      }
      const classification = extractGenreAndCategory([], thriftbooksDetails?.category);
      const sku = createSku(classification.category, classification.genre || classification.subcategory, null);
      const partial: BookLookup = {
        isbn: normalized,
        title: thriftbooksDetails?.title ?? null,
        author: null,
        coverUrl: null,
        quantityOnHand: 0,
        thriftbooksPrice: fallbackPrice,
        publisher: null,
        description: null,
        ...generateCatalogContent(thriftbooksDetails?.title ?? null, null, classification.category, classification.genre || classification.subcategory, []),
        catalogTags: classification.tags.join(", "),
        category: classification.category, // "Print Books"
        subcategory: classification.genre || classification.subcategory,
        sku,
        label: { sku, barcode: normalized, title: thriftbooksDetails?.title ?? null, category: classification.category, subcategory: classification.genre || classification.subcategory, price: fallbackPrice },
        source: "Thriftbooks",
        mediaType: "Book",
      };
      await saveToCache(partial);
      return partial;
    }

    const classification = extractGenreAndCategory([], thriftbooksDetails?.category || book.subcategory);
    const result: BookLookup = {
      ...book,
      thriftbooksPrice: fallbackPrice ?? book.thriftbooksPrice,
      category: "Print Books",
      subcategory: book.subcategory ?? classification.genre ?? classification.subcategory,
      label: {
        ...book.label,
        category: "Print Books",
        subcategory: book.subcategory ?? classification.genre ?? classification.subcategory,
        price: fallbackPrice ?? book.thriftbooksPrice,
      },
    };
    await saveToCache(result);
    return result;
  } catch (error) {
    console.error("ISBN lookup failed", { isbn: normalized, error: error instanceof Error ? error.message : error });
    return null;
  }
}

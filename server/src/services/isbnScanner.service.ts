import { prisma } from "../config/database.js";
import { lookupAbeBooksPrice } from "./abebooksScraper.service.js";
import { lookupThriftbooksDetails } from "./thriftbooksScraper.service.js";

const PROVIDER_TIMEOUT_MS = 8000;
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
  source: "Open Library";
}

function generateCatalogContent(title: string | null, author: string | null, category: string | null, subcategory: string | null, subjects: string[]): Pick<BookLookup, "seoKeywords" | "seoTitle" | "seoDescription"> {
  const safeTitle = title ?? "Book";
  const keywordValues = [...new Set([safeTitle, author, category, subcategory, ...subjects.slice(0, 5), "independent bookstore"].filter(Boolean))];
  const seoTitle = `${safeTitle}${author ? ` by ${author}` : ""}`;
  const seoDescription = `Explore ${safeTitle}${author ? ` by ${author}` : ""} at Ghostlight Books${category ? ` in ${category}` : ""}${subcategory ? ` and ${subcategory}` : ""}.`;
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
  const prefix = `${codePart(category, "GEN")}${codePart(subcategory, "GEN")}${codePart(authorLastName, "UNK")}`;
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
    title: record.title,
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

function normalizeCategories(subjects: string[], providerCategory: string | null = null): { category: string | null; subcategory: string | null } {
  const values = [providerCategory, ...subjects].filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim());
  const categoryRules: Array<[string, string[]]> = [
    ["Fiction", ["fiction", "novel", "literary", "literature"]],
    ["Non-Fiction", ["non-fiction", "nonfiction"]],
    ["Biography", ["biography", "autobiography", "memoir"]],
    ["History", ["history"]],
    ["Children", ["juvenile", "children"]],
    ["Young Adult", ["young adult"]],
    ["Business", ["business", "economics"]],
    ["Science", ["science", "mathematics", "technology"]],
    ["Religion", ["religion", "buddhism", "christianity", "islam", "judaism"]],
    ["Arts", ["art", "music", "photography"]],
    ["Reference", ["reference"]],
  ];
  const lowerValues = values.map((value) => value.toLowerCase());
  const matched = categoryRules.find(([, terms]) => lowerValues.some((value) => terms.some((term) => value === term || value.includes(term))));
  const category = matched?.[0] ?? null;
  const matchedTerms = matched?.[1] ?? [];
  const subcategory = values.find((value) => value.toLowerCase() !== category?.toLowerCase() && !matchedTerms.includes(value.toLowerCase())) ?? null;
  return { category, subcategory };
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
      const authorResponse = await fetchWithTimeout(`https://openlibrary.org${key}.json`);
      if (!authorResponse.ok) {
        return null;
      }
      const author = (await authorResponse.json()) as { name?: unknown };
      return firstString(author.name);
    }),
  );
  const categories = normalizeCategories(edition.subjects ?? []);
  const author = authorNames.filter((name): name is string => Boolean(name)).join(", ") || null;
  const description = typeof edition.description === "string"
    ? edition.description
    : typeof edition.description === "object" && edition.description !== null && "value" in edition.description
      ? firstString((edition.description as { value?: unknown }).value)
      : null;
  const seo = generateCatalogContent(firstString(edition.title), author, categories.category, categories.subcategory, edition.subjects ?? []);

  const result: Omit<BookLookup, "label"> = {
    isbn,
    title: firstString(edition.title),
    author,
    publisher: firstString(edition.publishers),
    description,
    ...seo,
    catalogTags: (edition.subjects ?? []).join(", ") || null,
    coverUrl: edition.covers?.[0] ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg` : null,
    quantityOnHand: 0,
    thriftbooksPrice: null,
    ...categories,
    sku: createSku(categories.category, categories.subcategory, author), 
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
      const thriftbooksDetails = cachedBook.thriftbooksPrice === null
        ? await lookupThriftbooksDetails(normalized)
        : null;
      const fallbackPrice = thriftbooksDetails?.price ?? await lookupAbeBooksPrice(normalized);
      if (cached.publisher || cached.description || cached.seoTitle || cached.seoKeywords || cached.catalogTags) {
        if (fallbackPrice !== null) {
          const refreshed: BookLookup = {
            ...cachedBook,
            thriftbooksPrice: fallbackPrice,
            category: cachedBook.category ?? normalizeCategories([], thriftbooksDetails?.category).category,
            subcategory: cachedBook.subcategory ?? thriftbooksDetails?.subcategory ?? null,
            label: { ...cachedBook.label, price: fallbackPrice },
          };
          await saveToCache(refreshed);
          return refreshed;
        }
        return cachedBook;
      }
      const enriched = await lookupOpenLibrary(normalized).catch(() => null);
      if (!enriched) {
        return cachedBook;
      }
      const result: BookLookup = {
        ...cachedBook,
        title: cachedBook.title ?? enriched.title,
        author: cachedBook.author ?? enriched.author,
        publisher: enriched.publisher,
        description: enriched.description,
        seoKeywords: enriched.seoKeywords,
        seoTitle: enriched.seoTitle,
        seoDescription: enriched.seoDescription,
        catalogTags: enriched.catalogTags,
        category: cachedBook.category ?? enriched.category,
        subcategory: cachedBook.subcategory ?? enriched.subcategory,
        mediaType: cachedBook.mediaType || enriched.mediaType,
        thriftbooksPrice: fallbackPrice ?? cachedBook.thriftbooksPrice,
        label: {
          ...cachedBook.label,
          title: cachedBook.title ?? enriched.title,
          price: fallbackPrice ?? cachedBook.thriftbooksPrice,
        },
      };
      await saveToCache(result);
      return result;
    }

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
      const sku = createSku(null, null, null);
      const partial: BookLookup = {
        isbn: normalized,
        title: null,
        author: null,
        coverUrl: null,
        quantityOnHand: 0,
        thriftbooksPrice: fallbackPrice,
        publisher: null,
        description: null,
        ...generateCatalogContent(thriftbooksDetails?.title ?? null, null, null, null, []),
        catalogTags: null,
        ...normalizeCategories([], thriftbooksDetails?.category),
        sku,
        label: { sku, barcode: normalized, title: thriftbooksDetails?.title ?? null, category: null, subcategory: null, price: fallbackPrice },
        source: "Open Library",
        mediaType: "Book",
      };
      await saveToCache(partial);
      return partial;
    }

    const result = {
      ...book,
      thriftbooksPrice: fallbackPrice ?? book.thriftbooksPrice,
      category: book.category ?? normalizeCategories([], thriftbooksDetails?.category).category,
      subcategory: book.subcategory ?? thriftbooksDetails?.subcategory ?? null,
      label: {
        ...book.label,
        category: book.category ?? normalizeCategories([], thriftbooksDetails?.category).category,
        subcategory: book.subcategory ?? thriftbooksDetails?.subcategory ?? null,
        price: fallbackPrice ?? book.thriftbooksPrice,
      },
    };
    await saveToCache(result);
    return result;
  } catch {
    return null;
  }
}

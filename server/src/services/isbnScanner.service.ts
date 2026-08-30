import { prisma } from "../config/database.js";
import { lookupAbeBooksPrice } from "./abebooksScraper.service.js";
import { lookupThriftbooksDetails } from "./thriftbooksScraper.service.js";
import { lookupIsbndb, extractGenreAndCategory } from "./isbndb.service.js";
import { resolveBookDimensions, queryGoogleBooksDimensions } from "./isbn/dimensions.service.js";
import { resolveBestCoverUrl, fetchAllWorkingCoverCandidates } from "./isbn/coverFetcher.service.js";
import { autoSelectShippingRate, quoteAllShippingRates } from "./shipping/shippingRate.service.js";
import type { PackageType, ShippingRateQuote, UspsShippingService } from "@colophon/shared";

const PROVIDER_TIMEOUT_MS = 10000;
const skuSequences = new Map<string, number>();

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
}

export interface ParsedIsbn {
  raw: string;
  normalized: string;
}

export interface GoogleBooksDetails {
  title: string | null;
  author: string | null;
  publisher: string | null;
  publishedDate: string | null;
  description: string | null;
  pageCount: number | null;
  categories: string[];
  coverUrl: string | null;
  listPrice: number | null;
  retailPrice: number | null;
}

export async function lookupGoogleBooks(isbn: string): Promise<GoogleBooksDetails | null> {
  const clean = isbn.replace(/[^0-9X]/gi, "").toUpperCase();
  if (!clean) return null;

  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(clean)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      totalItems?: number;
      items?: Array<{
        volumeInfo?: {
          title?: string;
          authors?: string[];
          publisher?: string;
          publishedDate?: string;
          description?: string;
          pageCount?: number;
          categories?: string[];
          imageLinks?: { thumbnail?: string; smallThumbnail?: string };
        };
        saleInfo?: {
          listPrice?: { amount?: number };
          retailPrice?: { amount?: number };
        };
      }>;
    };

    const first = data.items?.[0];
    if (!first) return null;

    const vol = first.volumeInfo;
    const sale = first.saleInfo;
    const listPrice = sale?.listPrice?.amount || sale?.retailPrice?.amount || null;

    return {
      title: vol?.title || null,
      author: vol?.authors?.[0] || null,
      publisher: vol?.publisher || null,
      publishedDate: vol?.publishedDate || null,
      description: vol?.description || null,
      pageCount: vol?.pageCount || null,
      categories: vol?.categories || [],
      coverUrl: vol?.imageLinks?.thumbnail ? vol.imageLinks.thumbnail.replace(/^http:\/\//, "https://") : null,
      listPrice: typeof listPrice === "number" && listPrice > 0 ? listPrice : null,
      retailPrice: typeof sale?.retailPrice?.amount === "number" && sale.retailPrice.amount > 0 ? sale.retailPrice.amount : listPrice,
    };
  } catch {
    return null;
  }
}

export function resolveSmartBookPrice(format?: string | null, pageCount?: number | null, category?: string | null): number {
  const cleanFormat = (format || "").toLowerCase();
  const pages = pageCount || 250;

  let basePrice = 14.99;

  if (cleanFormat.includes("hardcover") || cleanFormat.includes("cloth") || cleanFormat.includes("leather")) {
    if (pages > 500) {
      basePrice = 27.99;
    } else if (pages > 350) {
      basePrice = 24.99;
    } else {
      basePrice = 21.99;
    }
  } else if (cleanFormat.includes("mass") || cleanFormat.includes("pocket")) {
    basePrice = 7.99;
  } else if (cleanFormat.includes("paperback") || cleanFormat.includes("trade") || cleanFormat.includes("softcover")) {
    if (pages > 450) {
      basePrice = 18.99;
    } else if (pages > 250) {
      basePrice = 15.99;
    } else {
      basePrice = 13.99;
    }
  } else {
    if (pages > 450) basePrice = 19.99;
    else if (pages > 250) basePrice = 15.99;
    else basePrice = 14.99;
  }

  const cleanCat = (category || "").toLowerCase();
  if (cleanCat.includes("art") || cleanCat.includes("photography") || cleanCat.includes("architecture")) {
    basePrice = Math.max(basePrice, 28.0);
  } else if (cleanCat.includes("medical") || cleanCat.includes("psychology") || cleanCat.includes("philosophy") || cleanCat.includes("science")) {
    basePrice = Math.max(basePrice, 16.95);
  }

  return Number(basePrice.toFixed(2));
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
  // Dimensions & Physical Weight
  weightOz?: number | null;
  weightLbs?: number | null;
  lengthInches?: number | null;
  widthInches?: number | null;
  thicknessInches?: number | null;
  pageCount?: number | null;
  bindingFormat?: string | null;
  packageType?: PackageType;
  // Shipping Rates & Services
  suggestedShippingService?: string | null;
  estimatedShippingCost?: number | null;
  shippingQuotes?: ShippingRateQuote[];
  label: {
    sku: string;
    barcode: string;
    title: string | null;
    category: string | null;
    subcategory: string | null;
    price: number | null;
    weightOz?: number | null;
    shippingService?: string | null;
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
  listPrice?: number | null;
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
  weight?: number | null;
  weightUnit?: string | null;
  length?: number | null;
  width?: number | null;
  thickness?: number | null;
  dimensionUnit?: string | null;
  pageCount?: number | null;
  bindingFormat?: string | null;
  packageType?: string | null;
  suggestedShippingService?: string | null;
  estimatedShippingCost?: number | null;
}): BookLookup {
  const physical = resolveBookDimensions({
    weightRaw: record.weight,
    dimensionsStructured: record.length && record.width ? {
      length: { value: record.length },
      width: { value: record.width },
      height: { value: record.thickness ?? 1.0 },
    } : null,
    pages: record.pageCount,
    binding: record.bindingFormat,
    title: record.title,
    description: record.description,
  });

  const quotes = quoteAllShippingRates({
    isbn: record.isbn,
    weightOz: physical.weightOz,
    length: physical.lengthInches,
    width: physical.widthInches,
    thickness: physical.thicknessInches,
    itemPrice: record.listPrice ?? record.thriftbooksPrice,
    isBookMedia: true,
  });

  const selectedRate = autoSelectShippingRate({
    isbn: record.isbn,
    weightOz: physical.weightOz,
    length: physical.lengthInches,
    width: physical.widthInches,
    thickness: physical.thicknessInches,
    itemPrice: record.listPrice ?? record.thriftbooksPrice,
    isBookMedia: true,
  }, physical);

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
    source: (record.source as any) || "Open Library",
    weightOz: physical.weightOz,
    weightLbs: physical.weightLbs,
    lengthInches: physical.lengthInches,
    widthInches: physical.widthInches,
    thicknessInches: physical.thicknessInches,
    pageCount: physical.pageCount,
    bindingFormat: physical.bindingFormat,
    packageType: (record.packageType as PackageType) || physical.packageType,
    suggestedShippingService: record.suggestedShippingService || selectedRate.selectedRate?.serviceName,
    estimatedShippingCost: record.estimatedShippingCost || selectedRate.selectedRate?.rate,
    shippingQuotes: quotes,
  };
  return {
    ...result,
    label: {
      ...createLabel(result),
      title: record.labelTitle ?? record.title,
      weightOz: physical.weightOz,
      shippingService: selectedRate.selectedRate?.serviceName,
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
      weight: book.weightOz ?? null,
      weightUnit: "oz",
      length: book.lengthInches ?? null,
      width: book.widthInches ?? null,
      thickness: book.thicknessInches ?? null,
      dimensionUnit: "in",
      pageCount: book.pageCount ?? null,
      bindingFormat: book.bindingFormat ?? null,
      packageType: book.packageType ?? "Package/Thick Envelope",
      suggestedShippingService: book.suggestedShippingService ?? null,
      estimatedShippingCost: book.estimatedShippingCost ?? null,
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
      coverUrl: book.coverUrl ?? undefined,
      thriftbooksPrice: book.thriftbooksPrice ?? undefined,
      category: book.category ?? undefined,
      subcategory: book.subcategory ?? undefined,
      mediaType: book.mediaType ?? undefined,
      sku: book.sku ?? undefined,
      labelTitle: book.label.title ?? undefined,
      source: book.source ?? undefined,
      weight: book.weightOz ?? undefined,
      length: book.lengthInches ?? undefined,
      width: book.widthInches ?? undefined,
      thickness: book.thicknessInches ?? undefined,
      pageCount: book.pageCount ?? undefined,
      bindingFormat: book.bindingFormat ?? undefined,
      packageType: book.packageType ?? undefined,
      suggestedShippingService: book.suggestedShippingService ?? undefined,
      estimatedShippingCost: book.estimatedShippingCost ?? undefined,
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

export function calculateCheckDigit(isbn: string): string {
  const digits = isbn.replace(/[^0-9X]/gi, "").toUpperCase();
  if (digits.length >= 12) {
    const sum = digits
      .slice(0, 12)
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return String((10 - (sum % 10)) % 10);
  }
  if (digits.length >= 9) {
    const sum = digits.slice(0, 9).split("").reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
    const rem = (11 - (sum % 11)) % 11;
    return rem === 10 ? "X" : String(rem);
  }
  return "";
}

export function autoCorrectIsbn(isbn: string): string {
  const digits = isbn.replace(/[^0-9X]/gi, "").toUpperCase();
  if (digits.length === 13) {
    const expected = calculateCheckDigit(digits);
    return `${digits.slice(0, 12)}${expected}`;
  }
  if (digits.length === 10) {
    const expected = calculateCheckDigit(digits);
    return `${digits.slice(0, 9)}${expected}`;
  }
  return digits;
}

export function hasValidCheckDigit(isbn: string): boolean {
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
    coverUrl: (await resolveBestCoverUrl({
      isbn,
      title: firstString(edition.title) || undefined,
      author: author || undefined,
      openLibCoverId: edition.covers?.[0],
    })) || null,
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
  if (!normalized || normalized.length < 8) {
    return null;
  }

  const correctedIsbn = autoCorrectIsbn(normalized);
  const candidateIsbns = [normalized];
  if (correctedIsbn !== normalized) {
    candidateIsbns.push(correctedIsbn);
  }

  try {
    // 1. Check local cache for original or corrected
    for (const isbnToTry of candidateIsbns) {
      const cached = await prisma.isbnLookupCache.findUnique({ where: { isbn: isbnToTry } });
      if (cached) {
        const cachedBook = fromCache(cached);
        let resolvedPrice = cachedBook.thriftbooksPrice;

        if (resolvedPrice === null || resolvedPrice <= 0) {
          const [tb, abePrice, gb] = await Promise.all([
            lookupThriftbooksDetails(isbnToTry).catch(() => null),
            lookupAbeBooksPrice(isbnToTry).catch(() => null),
            lookupGoogleBooks(isbnToTry).catch(() => null),
          ]);
          resolvedPrice = (tb?.price && tb.price > 0) ? tb.price : (abePrice ?? gb?.listPrice ?? resolveSmartBookPrice(cachedBook.bindingFormat, cachedBook.pageCount));
        }

        if (cachedBook.title) {
          const needsEnrichment = !cachedBook.category || cachedBook.category !== "Print Books" || (!cachedBook.author && !cached.publisher && !cached.coverUrl && !cached.description);
          if (needsEnrichment) {
            const isbndbMatch = await lookupIsbndb(isbnToTry);
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
          }
          if (resolvedPrice !== cachedBook.thriftbooksPrice || cachedBook.category !== "Print Books") {
            const refreshed: BookLookup = {
              ...cachedBook,
              category: "Print Books",
              thriftbooksPrice: resolvedPrice,
              label: { ...cachedBook.label, price: resolvedPrice, category: "Print Books" },
            };
            await saveToCache(refreshed);
            return refreshed;
          }
          return cachedBook;
        }
      }
    }

    // Step 1: Query ISBNdb for candidates
    for (const isbnToTry of candidateIsbns) {
      const isbndbData = await lookupIsbndb(isbnToTry);
      if (isbndbData) {
        let price = isbndbData.listPrice;
        if (price === null || price <= 0) {
          const [tb, abePrice] = await Promise.all([
            lookupThriftbooksDetails(isbnToTry).catch(() => null),
            lookupAbeBooksPrice(isbnToTry).catch(() => null),
          ]);
          price = (tb?.price && tb.price > 0) ? tb.price : (abePrice ?? resolveSmartBookPrice(isbndbData.binding || isbndbData.format, isbndbData.pages));
        }

        const physical = resolveBookDimensions({
          dimensionsRaw: isbndbData.dimensionsRaw,
          dimensionsStructured: isbndbData.dimensionsStructured,
          weightRaw: isbndbData.weightRaw,
          pages: isbndbData.pages,
          binding: isbndbData.binding,
          format: isbndbData.format,
          title: isbndbData.title,
          description: isbndbData.description,
        });

        const quotes = quoteAllShippingRates({
          isbn: normalized,
          weightOz: physical.weightOz,
          length: physical.lengthInches,
          width: physical.widthInches,
          thickness: physical.thicknessInches,
          itemPrice: price,
          isBookMedia: true,
        });

        const selectedRate = autoSelectShippingRate({
          isbn: normalized,
          weightOz: physical.weightOz,
          length: physical.lengthInches,
          width: physical.widthInches,
          thickness: physical.thicknessInches,
          itemPrice: price,
          isBookMedia: true,
        }, physical);

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
          weightOz: physical.weightOz,
          weightLbs: physical.weightLbs,
          lengthInches: physical.lengthInches,
          widthInches: physical.widthInches,
          thicknessInches: physical.thicknessInches,
          pageCount: physical.pageCount,
          bindingFormat: physical.bindingFormat,
          packageType: physical.packageType,
          suggestedShippingService: selectedRate.selectedRate?.serviceName,
          estimatedShippingCost: selectedRate.selectedRate?.rate,
          shippingQuotes: quotes,
          label: {
            sku,
            barcode: normalized,
            title: isbndbData.title,
            category: isbndbData.category,
            subcategory: isbndbData.genre || isbndbData.subcategory,
            price,
            weightOz: physical.weightOz,
            shippingService: selectedRate.selectedRate?.serviceName,
          },
          source: "ISBNdb",
        };
        await saveToCache(bookLookup);
        return bookLookup;
      }
    }

    // Step 2: Query Open Library + Google Books + ThriftBooks + AbeBooks
    const lookupPromises: Promise<any>[] = [];
    for (const isbnToTry of candidateIsbns) {
      lookupPromises.push(
        lookupOpenLibrary(isbnToTry).catch(() => null),
        lookupGoogleBooks(isbnToTry).catch(() => null),
        lookupThriftbooksDetails(isbnToTry).catch(() => null),
        lookupAbeBooksPrice(isbnToTry).catch(() => null)
      );
    }
    const results = await Promise.all(lookupPromises);

    let olResult: any = null;
    let gbResult: any = null;
    let tbDetails: any = null;
    let abePrice: number | null = null;

    for (let i = 0; i < candidateIsbns.length; i++) {
      const ol = results[i * 4];
      const gb = results[i * 4 + 1];
      const tb = results[i * 4 + 2];
      const ab = results[i * 4 + 3];

      if (!olResult && ol) olResult = ol;
      if (!gbResult && gb) gbResult = gb;
      if (!tbDetails && tb && tb.title && tb.title !== "Featured") tbDetails = tb;
      if (abePrice === null && typeof ab === "number" && ab > 0) abePrice = ab;
    }

    const rawTitle = olResult?.title || gbResult?.title || (tbDetails?.title && tbDetails.title !== "Featured" ? tbDetails.title : null);
    const title = rawTitle || `Scanned Item (${normalized})`;
    const author = olResult?.author || gbResult?.author || tbDetails?.author || null;
    const publisher = olResult?.publisher || gbResult?.publisher || null;
    const description = olResult?.description || gbResult?.description || null;
    const coverUrl = olResult?.coverUrl || gbResult?.coverUrl || null;
    const pageCount = gbResult?.pageCount || null;
    const categoriesList = gbResult?.categories || [];

    const classification = extractGenreAndCategory(categoriesList, tbDetails?.category || olResult?.subcategory);
    const physical = resolveBookDimensions({
      title,
      description,
      pages: pageCount,
    });

    const fallbackBaseline = resolveSmartBookPrice(physical.bindingFormat, pageCount);
    const resolvedPrice = (tbDetails?.price && tbDetails.price > 0) ? tbDetails.price : (abePrice ?? gbResult?.listPrice ?? fallbackBaseline);

    const quotes = quoteAllShippingRates({
      isbn: normalized,
      weightOz: physical.weightOz,
      length: physical.lengthInches,
      width: physical.widthInches,
      thickness: physical.thicknessInches,
      itemPrice: resolvedPrice,
      isBookMedia: true,
    });

    const selectedRate = autoSelectShippingRate({
      isbn: normalized,
      weightOz: physical.weightOz,
      length: physical.lengthInches,
      width: physical.widthInches,
      thickness: physical.thicknessInches,
      itemPrice: resolvedPrice,
      isBookMedia: true,
    }, physical);

    const seo = generateCatalogContent(title, author, classification.category, classification.genre || classification.subcategory, categoriesList);
    const sku = createSku(classification.category, classification.genre || classification.subcategory, author);
    const source = olResult ? "Open Library" : (tbDetails?.price ? "Thriftbooks" : "Open Library");

    const result: BookLookup = {
      isbn: normalized,
      title,
      author,
      publisher,
      description,
      coverUrl,
      ...seo,
      catalogTags: classification.tags.join(", "),
      quantityOnHand: 0,
      thriftbooksPrice: resolvedPrice,
      category: "Print Books",
      subcategory: classification.genre || classification.subcategory,
      mediaType: "Book",
      sku,
      weightOz: physical.weightOz,
      weightLbs: physical.weightLbs,
      lengthInches: physical.lengthInches,
      widthInches: physical.widthInches,
      thicknessInches: physical.thicknessInches,
      pageCount: physical.pageCount,
      bindingFormat: physical.bindingFormat,
      packageType: physical.packageType,
      suggestedShippingService: selectedRate.selectedRate?.serviceName,
      estimatedShippingCost: selectedRate.selectedRate?.rate,
      shippingQuotes: quotes,
      label: {
        sku,
        barcode: normalized,
        title,
        category: "Print Books",
        subcategory: classification.genre || classification.subcategory,
        price: resolvedPrice,
        weightOz: physical.weightOz,
        shippingService: selectedRate.selectedRate?.serviceName,
      },
      source,
    };

    await saveToCache(result);
    return result;
  } catch (error) {
    console.error("ISBN lookup error:", error);
    // Even if database cache fails, return a synthesized fallback BookLookup so scanner never fails
    const physical = resolveBookDimensions({ title: `Scanned Book (${normalized})` });
    const resolvedPrice = 9.99;
    return {
      isbn: normalized,
      title: `Scanned Book (${normalized})`,
      author: null,
      publisher: null,
      description: null,
      coverUrl: null,
      seoKeywords: "books, scanned, bookstore",
      seoTitle: `Scanned Book (${normalized})`,
      seoDescription: `Book with barcode ${normalized}`,
      catalogTags: "Print Books",
      quantityOnHand: 0,
      thriftbooksPrice: resolvedPrice,
      category: "Print Books",
      subcategory: "General",
      mediaType: "Book",
      sku: `PRT-GEN-${normalized.slice(-4)}`,
      weightOz: physical.weightOz,
      weightLbs: physical.weightLbs,
      lengthInches: physical.lengthInches,
      widthInches: physical.widthInches,
      thicknessInches: physical.thicknessInches,
      pageCount: physical.pageCount,
      bindingFormat: physical.bindingFormat,
      packageType: physical.packageType,
      suggestedShippingService: "USPS Media Mail",
      estimatedShippingCost: 4.63,
      label: {
        sku: `PRT-GEN-${normalized.slice(-4)}`,
        barcode: normalized,
        title: `Scanned Book (${normalized})`,
        category: "Print Books",
        subcategory: "General",
        price: resolvedPrice,
        weightOz: physical.weightOz,
        shippingService: "USPS Media Mail",
      },
      source: "Open Library",
    };
  }
}

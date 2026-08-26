export type IntakeContainer = "Green Box" | "Blue Bin" | "Red Tote";
export type BookCondition = "Fine" | "Very Good" | "Good" | "Fair" | "Poor";

export type BookLookup = {
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
  source: "Open Library" | "ISBNdb";
};

export type BookSearchResult = {
  isbn: string;
  title: string;
  author: string | null;
  year: number | null;
  publisher?: string | null;
  coverUrl: string | null;
};

const rawApiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const API_BASE = rawApiBase.replace(/\/$/, "").replace(/\/api$/, "");
const PROVIDER_TIMEOUT_MS = 20000;
const skuSequences = new Map<string, number>();

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
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

async function request<T>(path: string): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function searchBooks(title: string, author = "", skuOrIsbn = ""): Promise<BookSearchResult[]> {
  const params = new URLSearchParams({ limit: "15" });
  if (title.trim()) params.set("title", title.trim());
  if (author.trim()) params.set("author", author.trim());
  if (skuOrIsbn.trim()) {
    const clean = skuOrIsbn.replace(/[^0-9X]/gi, "").toUpperCase();
    if (clean.length === 10 || clean.length === 13) {
      params.set("isbn", clean);
    } else if (!title.trim() && !author.trim()) {
      params.set("q", skuOrIsbn.trim());
    }
  }

  const response = await fetchWithTimeout(`https://openlibrary.org/search.json?${params.toString()}`);
  if (!response.ok) throw new Error("Book search is unavailable right now.");
  const data = (await response.json()) as {
    docs?: Array<{
      title?: string;
      author_name?: string[];
      first_publish_year?: number;
      publisher?: string[];
      isbn?: string[];
      cover_i?: number;
    }>;
  };
  const seen = new Set<string>();
  return (data.docs ?? []).flatMap((doc) => {
    const isbn = doc.isbn?.find((value) => value.length === 13) ?? doc.isbn?.find((value) => value.length === 10);
    if (!isbn || !doc.title || seen.has(isbn)) return [];
    seen.add(isbn);
    return [{
      isbn,
      title: doc.title,
      author: doc.author_name?.[0] ?? null,
      year: doc.first_publish_year ?? null,
      publisher: doc.publisher?.[0] ?? null,
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    }];
  });
}

async function lookupOpenLibrary(isbn: string): Promise<BookLookup> {
  const response = await fetchWithTimeout(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
  if (!response.ok) {
    throw new Error("ISBN was not found in Open Library.");
  }

  const edition = (await response.json()) as {
    title?: string;
    authors?: Array<{ key?: string }>;
    covers?: number[];
    subjects?: string[];
  };
  const authorNames = await Promise.all(
    (edition.authors ?? []).slice(0, 3).map(async (author) => {
      if (!author.key) {
        return null;
      }
      const authorResponse = await fetchWithTimeout(`https://openlibrary.org${author.key}.json`);
      if (!authorResponse.ok) {
        return null;
      }
      const authorRecord = (await authorResponse.json()) as { name?: string };
      return authorRecord.name ?? null;
    }),
  );

  const subjects = edition.subjects ?? [];
  const category = subjects.some((subject) => subject.toLowerCase().includes("fiction")) ? "Fiction" : null;
  const subcategory = subjects.find((subject) => subject.toLowerCase() !== "fiction") ?? null;
  const sku = createSku(category, subcategory, authorNames.filter((name): name is string => Boolean(name)).join(", "));
  return {
    isbn,
    title: edition.title ?? null,
    author: authorNames.filter((name): name is string => Boolean(name)).join(", ") || null,
    publisher: null,
    description: null,
    seoKeywords: [edition.title, ...subjects, "independent bookstore"].filter(Boolean).join(", "),
    seoTitle: edition.title ? `${edition.title} | Ghostlight Books` : null,
    seoDescription: edition.title ? `Explore ${edition.title} at Ghostlight Books.` : null,
    catalogTags: subjects.join(", ") || null,
    coverUrl: edition.covers?.[0] ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg` : null,
    quantityOnHand: 0,
    thriftbooksPrice: null,
    category,
    subcategory,
    mediaType: "Book",
    sku,
    label: {
      sku,
      barcode: isbn,
      title: edition.title ?? null,
      category,
      subcategory,
      price: null,
    },
    source: "Open Library",
  };
}

export async function lookupBookByIsbn(isbn: string): Promise<BookLookup> {
  const normalized = isbn.replace(/[^0-9X]/gi, "").toUpperCase();
  if (normalized.length !== 10 && normalized.length !== 13) {
    throw new Error("Enter a valid 10 or 13 digit ISBN.");
  }
  if (!hasValidCheckDigit(normalized)) {
    throw new Error("ISBN check digit is invalid. Verify the barcode and try again.");
  }

  try {
    return await request<BookLookup>(`/api/intake/isbn/${encodeURIComponent(normalized)}`);
  } catch (error) {
    if (error instanceof Error && error.message !== "Request failed: 404") {
      throw error;
    }
    return lookupOpenLibrary(normalized);
  }
}

export async function receiveInventory(book: BookLookup, condition: BookCondition, listPrice: number | null, container: IntakeContainer): Promise<void> {
  const deviceId = getDeviceId();
  const response = await fetch(`${API_BASE}/api/inventory/active/${encodeURIComponent(book.isbn)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ condition, listPrice, container, deviceId, stationName: getStationName() }),
  });
  if (!response.ok) {
    throw new Error("Inventory could not be updated.");
  }
  window.dispatchEvent(new Event("colophon-inventory-updated"));
}

function getDeviceId(): string {
  if (typeof window === "undefined") {
    return "server-device";
  }
  const key = "colophon-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const created = `device-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

function getStationName(): string {
  if (typeof window === "undefined") {
    return "Unknown station";
  }
  return window.localStorage.getItem("colophon-station-name") ?? "Unassigned station";
}

export function getIntakeContainer(price: number | null): IntakeContainer {
  if (price === null) {
    return "Red Tote";
  }
  if (price !== null && price < 3) {
    return "Green Box";
  }
  if (price !== null && price < 50) {
    return "Blue Bin";
  }
  return "Red Tote";
}

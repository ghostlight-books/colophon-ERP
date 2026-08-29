import { lookupIsbndb } from "../isbndb.service.js";
import { lookupGoogleBooks } from "../isbnScanner.service.js";
import { lookupThriftbooksDetails } from "../thriftbooksScraper.service.js";
import { lookupAbeBooksPrice } from "../abebooksScraper.service.js";

const PROVIDER_TIMEOUT_MS = 8000;

export interface LibraryEnrichmentResult {
  isbn: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publishYear: string | null;
  description: string | null;
  coverUrl: string | null;
  deweyDecimal: string | null;
  deweyCategory: string | null;
  locClassification: string | null;
  locSubject: string | null;
  lccn: string | null;
  oclcNumber: string | null;
  subjects: string[];
  pageCount: number | null;
  bindingFormat: string | null;
  language: string;
  replacementValue: number;
}

export const DEWEY_DIVISIONS: Record<string, string> = {
  "000": "000 - Computer Science, Information & General Works",
  "100": "100 - Philosophy & Psychology",
  "200": "200 - Religion & Mythology",
  "300": "300 - Social Sciences, Law & Education",
  "400": "400 - Language & Linguistics",
  "500": "500 - Pure Science & Mathematics",
  "600": "600 - Technology & Applied Sciences (Medicine, Cooking, Engineering)",
  "700": "700 - Arts & Recreation (Art, Music, Sports, Photography)",
  "800": "800 - Literature, Poetry & Drama",
  "900": "900 - History, Geography & Biography",
};

export const LOC_CLASSES: Record<string, string> = {
  A: "A - General Works",
  B: "B - Philosophy, Psychology, Religion",
  C: "C - Auxiliary Sciences of History (Archaeology, Genealogy)",
  D: "D - World History & Geography",
  E: "E - History of America (General)",
  F: "F - History of America (Local & United States)",
  G: "G - Geography, Anthropology, Recreation",
  H: "H - Social Sciences, Business & Economics",
  J: "J - Political Science",
  K: "K - Law",
  L: "L - Education",
  M: "M - Music",
  N: "N - Fine Arts & Architecture",
  P: "P - Language & Literature (PR=English, PS=American, PN=Literature)",
  Q: "Q - Science & Mathematics (QA=Computer Science, QC=Physics)",
  R: "R - Medicine & Health Sciences",
  S: "S - Agriculture & Forestry",
  T: "T - Technology, Cooking & Engineering",
  U: "U - Military Science",
  V: "V - Naval Science",
  Z: "Z - Bibliography, Library Science & Information Resources",
};

export function resolveDeweyCategory(dewey: string | null | undefined): string | null {
  if (!dewey) return null;
  const match = dewey.match(/^(\d{1,3})/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (isNaN(num)) return null;

  const hundred = Math.floor(num / 100) * 100;
  const key = String(hundred).padStart(3, "0");
  return DEWEY_DIVISIONS[key] || `${key} - General Division`;
}

export function resolveLocSubject(loc: string | null | undefined): string | null {
  if (!loc) return null;
  const clean = loc.trim().toUpperCase();
  const letterMatch = clean.match(/^([A-Z]{1,3})/);
  if (!letterMatch) return null;

  const primaryLetter = letterMatch[1].charAt(0);
  return LOC_CLASSES[primaryLetter] || `${letterMatch[1]} - Classification`;
}

export function cleanDeweyNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Standardize e.g. "813/.54", "813.54 [20]", "E 813.54" -> "813.54"
  const cleaned = raw.replace(/\s*\[.*?\]/g, "").replace(/\//g, "").trim();
  const match = cleaned.match(/(\d{3}(?:\.\d+)?)/);
  return match ? match[1] : cleaned || null;
}

export function cleanLocNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/\s+/g, " ").trim();
}

export async function enrichLibraryClassification(isbnInput: string): Promise<LibraryEnrichmentResult> {
  const cleanIsbn = isbnInput.replace(/[^0-9X]/gi, "").toUpperCase();

  // Run OpenLibrary, Google Books, and Price lookups in parallel
  const [openLibRes, googleBook, isbndbRes, thriftPrice, abePrice] = await Promise.allSettled([
    fetch(`https://openlibrary.org/isbn/${encodeURIComponent(cleanIsbn)}.json`, {
      headers: { "User-Agent": "Colophon-Library-App/1.0" },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    }).then(async (res) => (res.ok ? res.json() : null)).catch(() => null),
    lookupGoogleBooks(cleanIsbn).catch(() => null),
    lookupIsbndb(cleanIsbn).catch(() => null),
    lookupThriftbooksDetails(cleanIsbn).catch(() => null),
    lookupAbeBooksPrice(cleanIsbn).catch(() => null),
  ]);

  const openLib = openLibRes.status === "fulfilled" ? openLibRes.value : null;
  const google = googleBook.status === "fulfilled" ? googleBook.value : null;
  const isbndb = isbndbRes.status === "fulfilled" ? isbndbRes.value : null;
  const thrift = thriftPrice.status === "fulfilled" ? thriftPrice.value : null;
  const abe = abePrice.status === "fulfilled" ? abePrice.value : null;

  // Title extraction
  const title = (
    openLib?.title ||
    google?.title ||
    isbndb?.title ||
    thrift?.title ||
    `Book ISBN ${cleanIsbn}`
  ).trim();

  // Author extraction
  let author: string | null = null;
  if (Array.isArray(openLib?.authors) && openLib.authors.length > 0) {
    try {
      const authorKey = openLib.authors[0]?.key;
      if (authorKey) {
        const authorRes = await fetch(`https://openlibrary.org${authorKey}.json`, {
          signal: AbortSignal.timeout(4000),
        });
        if (authorRes.ok) {
          const authorData = (await authorRes.json()) as { name?: string };
          if (authorData?.name) author = authorData.name;
        }
      }
    } catch {}
  }
  if (!author) {
    author = google?.author || (Array.isArray(isbndb?.authors) ? isbndb.authors[0] : null) || null;
  }

  // Classification Numbers
  const rawDewey = (
    (Array.isArray(openLib?.dewey_decimal_class) ? openLib.dewey_decimal_class[0] : null) ||
    isbndb?.dewey_decimal ||
    null
  );
  const deweyDecimal = cleanDeweyNumber(rawDewey);
  const deweyCategory = resolveDeweyCategory(deweyDecimal);

  const rawLoc = (
    (Array.isArray(openLib?.lc_classifications) ? openLib.lc_classifications[0] : null) ||
    isbndb?.loc ||
    null
  );
  const locClassification = cleanLocNumber(rawLoc);
  const locSubject = resolveLocSubject(locClassification);

  const lccn = (
    (Array.isArray(openLib?.lccn) ? openLib.lccn[0] : null) ||
    (typeof openLib?.lccn === "string" ? openLib.lccn : null) ||
    null
  );

  const oclcNumber = (
    (Array.isArray(openLib?.oclc_numbers) ? openLib.oclc_numbers[0] : null) ||
    (Array.isArray(openLib?.oclc_number) ? openLib.oclc_number[0] : null) ||
    null
  );

  // Subjects & Keywords
  const subjectsSet = new Set<string>();
  if (Array.isArray(openLib?.subjects)) {
    openLib.subjects.slice(0, 10).forEach((s: string) => {
      if (typeof s === "string" && s.trim()) subjectsSet.add(s.trim());
    });
  }
  if (Array.isArray(google?.categories)) {
    google.categories.forEach((c: string) => {
      if (typeof c === "string" && c.trim()) subjectsSet.add(c.trim());
    });
  }
  if (Array.isArray(isbndb?.subjects)) {
    isbndb.subjects.slice(0, 10).forEach((s: string) => {
      if (typeof s === "string" && s.trim()) subjectsSet.add(s.trim());
    });
  }
  const subjects = Array.from(subjectsSet);

  // Publisher and Publish Year
  const publisher = (
    (Array.isArray(openLib?.publishers) ? openLib.publishers[0] : null) ||
    google?.publisher ||
    isbndb?.publisher ||
    null
  );

  const rawYear = (
    openLib?.publish_date ||
    google?.publishedDate ||
    isbndb?.date_published ||
    null
  );
  const yearMatch = rawYear ? String(rawYear).match(/\b(18|19|20)\d{2}\b/) : null;
  const publishYear = yearMatch ? yearMatch[0] : null;

  // Description
  const description = (
    (typeof openLib?.description === "string" ? openLib.description : openLib?.description?.value) ||
    google?.description ||
    isbndb?.synopsis ||
    null
  );

  // Cover image
  const coverUrl = (
    (openLib?.covers?.[0] ? `https://covers.openlibrary.org/b/id/${openLib.covers[0]}-L.jpg` : null) ||
    google?.coverUrl ||
    isbndb?.image ||
    thrift?.coverUrl ||
    null
  );

  // Physical specifications
  const pageCount = (
    openLib?.number_of_pages ||
    google?.pageCount ||
    isbndb?.pages ||
    null
  );

  const bindingFormat = isbndb?.binding || (description?.toLowerCase().includes("hardcover") ? "Hardcover" : "Paperback");

  // Insurance replacement valuation
  let replacementValue = 18.99;
  if (typeof thrift?.ourPrice === "number" && thrift.ourPrice > 0) {
    replacementValue = thrift.ourPrice;
  } else if (typeof abe?.price === "number" && abe.price > 0) {
    replacementValue = abe.price;
  } else if (typeof google?.retailPrice === "number" && google.retailPrice > 0) {
    replacementValue = google.retailPrice;
  } else if (typeof google?.listPrice === "number" && google.listPrice > 0) {
    replacementValue = google.listPrice;
  } else if (typeof isbndb?.msrp === "number" && isbndb.msrp > 0) {
    replacementValue = isbndb.msrp;
  } else {
    // Smart heuristic based on binding & pages
    if (bindingFormat === "Hardcover" || bindingFormat === "Cloth") {
      replacementValue = (pageCount && pageCount > 400) ? 29.99 : 24.99;
    } else {
      replacementValue = (pageCount && pageCount > 300) ? 17.99 : 14.99;
    }
  }

  return {
    isbn: cleanIsbn,
    title,
    author,
    publisher,
    publishYear,
    description,
    coverUrl,
    deweyDecimal,
    deweyCategory,
    locClassification,
    locSubject,
    lccn,
    oclcNumber,
    subjects,
    pageCount: typeof pageCount === "number" ? pageCount : null,
    bindingFormat,
    language: "English",
    replacementValue: Number(replacementValue.toFixed(2)),
  };
}

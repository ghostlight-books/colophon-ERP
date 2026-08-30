import { resolveBestCoverUrl } from "./isbn/coverFetcher.service.js";
import {
  cleanDeweyNumber,
  cleanLocNumber,
  inferClassificationFromSubjects,
  resolveDeweyCategory,
  resolveLocSubject,
} from "./library/libraryClassification.service.js";

export interface IdentifyCoverRequest {
  imageBase64?: string;
  imageUrl?: string;
  mimeType?: string;
  textHint?: string;
}

export interface RecognizedBookMatch {
  isbn: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publishYear: number | null;
  coverUrl: string | null;
  description: string | null;
  pageCount: number | null;
  category: string | null;
  deweyDecimal?: string | null;
  libraryOfCongress?: string | null;
  replacementValue: number;
  confidence: number; // 0.0 to 1.0
  matchSource: "Gemini Vision" | "Google Books" | "Open Library";
}

export interface IdentifyCoverResponse {
  success: boolean;
  detectedQuery: {
    title: string | null;
    author: string | null;
    publisher?: string | null;
    publishYear?: number | null;
    rawText?: string | null;
  };
  topMatch: RecognizedBookMatch | null;
  candidates: RecognizedBookMatch[];
  error?: string;
}

/**
 * Extracts standard 10-digit or 13-digit ISBN from any OCR text string
 */
export function extractIsbnFromText(rawText: string): string | null {
  if (!rawText) return null;
  const text = rawText.replace(/[\r\n]+/g, " ");

  // 1. Explicit ISBN labeled patterns, e.g. "ISBN 978-0-14-143951-8" or "ISBN: 0-679-72276-9"
  const explicitMatches = text.matchAll(/ISBN(?:-1[03])?[\s:]*([0-9Xx](?:[-\s]?[0-9Xx]){9,12})/gi);
  for (const m of explicitMatches) {
    const cleaned = m[1].replace(/[^0-9Xx]/gi, "").toUpperCase();
    if (cleaned.length === 13 && (cleaned.startsWith("978") || cleaned.startsWith("979"))) {
      return cleaned;
    }
    if (cleaned.length === 10) {
      return cleaned;
    }
  }

  // 2. Standalone 13-digit numbers starting with 978 or 979
  const isbn13Matches = text.matchAll(/\b(97[89][-\s]?(?:[0-9Xx][-\s]?){10})\b/gi);
  for (const m of isbn13Matches) {
    const cleaned = m[1].replace(/[^0-9Xx]/gi, "").toUpperCase();
    if (cleaned.length === 13) {
      return cleaned;
    }
  }

  // 3. Fallback: search any continuous 10-digit or 13-digit chunk
  const genericMatches = text.matchAll(/([0-9Xx]{10,13})/gi);
  for (const m of genericMatches) {
    const cleaned = m[1].toUpperCase();
    if (cleaned.length === 13 && (cleaned.startsWith("978") || cleaned.startsWith("979"))) {
      return cleaned;
    }
    if (cleaned.length === 10) {
      return cleaned;
    }
  }

  return null;
}

/**
 * Attempts to extract title, author, and edition metadata using Gemini Multimodal Vision API if available.
 */
async function analyzeImageWithGemini(
  imageBase64: string,
  mimeType = "image/jpeg"
): Promise<{
  title: string | null;
  author: string | null;
  publisher: string | null;
  publishYear: number | null;
  visibleIsbn: string | null;
  confidence: number;
} | null> {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!apiKey || !imageBase64) return null;

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    const prompt = `You are an expert rare book archivist and bookstore cataloger. Analyze this image of a book cover, spine, or title page.
Identify the exact book Title, Subtitle, Author(s), Publisher, estimated publication Year, and any visible ISBN on the cover.
Return ONLY a valid JSON object matching this schema:
{
  "title": "Main Title",
  "subtitle": "Subtitle if present or null",
  "author": "Primary Author Name or null",
  "publisher": "Publisher Name or null",
  "publishYear": 1984,
  "visibleIsbn": "9780123456789 or null",
  "confidence": 0.95
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      console.warn("Gemini vision response error:", response.status, await response.text());
      return null;
    }

    const data = (await response.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    return {
      title: parsed.title || null,
      author: parsed.author || null,
      publisher: parsed.publisher || null,
      publishYear: typeof parsed.publishYear === "number" ? parsed.publishYear : null,
      visibleIsbn: parsed.visibleIsbn ? String(parsed.visibleIsbn).replace(/[^0-9Xx]/g, "") : null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.85,
    };
  } catch (err) {
    console.warn("Gemini vision analysis failed:", err);
    return null;
  }
}

/**
 * Searches Google Books API using detected title and author strings
 */
async function searchGoogleBooksByTitleAuthor(
  title: string,
  author?: string | null
): Promise<RecognizedBookMatch[]> {
  try {
    const queryParts: string[] = [];
    if (title) queryParts.push(`intitle:${encodeURIComponent(title)}`);
    if (author) queryParts.push(`inauthor:${encodeURIComponent(author)}`);

    if (queryParts.length === 0) return [];

    const url = `https://www.googleapis.com/books/v1/volumes?q=${queryParts.join("+")}&maxResults=6`;
    const res = await fetch(url, { headers: { "User-Agent": "ColophonERP-CoverVision/1.0" } });
    if (!res.ok) return [];

    const data = (await res.json()) as any;
    if (!data.items || !Array.isArray(data.items)) return [];

    const results: RecognizedBookMatch[] = [];

    for (const item of data.items) {
      const vol = item.volumeInfo || {};
      const isbns: string[] = [];
      if (Array.isArray(vol.industryIdentifiers)) {
        for (const id of vol.industryIdentifiers) {
          if (id.identifier) isbns.push(id.identifier.replace(/[^0-9X]/gi, ""));
        }
      }

      // Pick best ISBN-13 or fallback to ISBN-10 or id
      const bestIsbn = isbns.find((i) => i.length === 13) || isbns.find((i) => i.length === 10) || isbns[0] || item.id;
      if (!vol.title) continue;

      const itemAuthor = Array.isArray(vol.authors) ? vol.authors.join(", ") : vol.authors || null;
      const rawYear = vol.publishedDate ? parseInt(vol.publishedDate.substring(0, 4), 10) : null;
      const publishYear = isNaN(rawYear as number) ? null : rawYear;

      const inferred = inferClassificationFromSubjects(
        vol.title,
        vol.categories?.[0] || null,
        vol.categories || []
      );
      const deweyDecimal = cleanDeweyNumber(inferred.dewey);
      const libraryOfCongress = cleanLocNumber(inferred.loc);
      const category = resolveDeweyCategory(deweyDecimal);

      const coverUrl = await resolveBestCoverUrl({
        isbn: bestIsbn,
        title: vol.title,
        author: itemAuthor || undefined,
        googleCover: vol.imageLinks?.thumbnail || vol.imageLinks?.smallThumbnail || null,
      });

      results.push({
        isbn: bestIsbn,
        title: vol.title,
        author: itemAuthor,
        publisher: vol.publisher || null,
        publishYear,
        coverUrl,
        description: vol.description || null,
        pageCount: typeof vol.pageCount === "number" ? vol.pageCount : null,
        category,
        deweyDecimal,
        libraryOfCongress,
        replacementValue: 18.99,
        confidence: 0.9,
        matchSource: "Google Books",
      });
    }

    return results;
  } catch (err) {
    console.warn("Google Books title search error:", err);
    return [];
  }
}

/**
 * Searches Open Library by Title & Author
 */
async function searchOpenLibraryByTitleAuthor(
  title: string,
  author?: string | null
): Promise<RecognizedBookMatch[]> {
  try {
    const params = new URLSearchParams();
    if (title) params.append("title", title);
    if (author) params.append("author", author);
    params.append("limit", "5");

    const url = `https://openlibrary.org/search.json?${params.toString()}`;
    const res = await fetch(url, { headers: { "User-Agent": "ColophonERP-CoverVision/1.0" } });
    if (!res.ok) return [];

    const data = (await res.json()) as any;
    if (!data.docs || !Array.isArray(data.docs)) return [];

    const results: RecognizedBookMatch[] = [];

    for (const doc of data.docs.slice(0, 5)) {
      const isbnList = Array.isArray(doc.isbn) ? doc.isbn : [];
      const bestIsbn = isbnList.find((i: string) => i.length === 13) || isbnList.find((i: string) => i.length === 10) || isbnList[0] || (doc.key ? doc.key.replace(/\D/g, "") : "");
      if (!doc.title) continue;

      const docAuthor = Array.isArray(doc.author_name) ? doc.author_name.join(", ") : doc.author_name || null;
      const publishYear = typeof doc.first_publish_year === "number" ? doc.first_publish_year : null;

      const rawDewey = Array.isArray(doc.ddc) ? doc.ddc[0] : doc.ddc;
      const rawLoc = Array.isArray(doc.lcc) ? doc.lcc[0] : doc.lcc;
      const inferred = inferClassificationFromSubjects(
        doc.title,
        null,
        Array.isArray(doc.subject) ? doc.subject : []
      );
      const deweyDecimal = cleanDeweyNumber(rawDewey) || cleanDeweyNumber(inferred.dewey);
      const libraryOfCongress = cleanLocNumber(rawLoc) || cleanLocNumber(inferred.loc);
      const category = resolveDeweyCategory(deweyDecimal);

      const coverUrl = await resolveBestCoverUrl({
        isbn: bestIsbn || "0000000000",
        title: doc.title,
        author: docAuthor || undefined,
        openLibCoverId: doc.cover_i,
      });

      results.push({
        isbn: bestIsbn || `OL-${doc.key}`,
        title: doc.title,
        author: docAuthor,
        publisher: Array.isArray(doc.publisher) ? doc.publisher[0] : doc.publisher || null,
        publishYear,
        coverUrl,
        description: null,
        pageCount: typeof doc.number_of_pages_median === "number" ? doc.number_of_pages_median : null,
        category,
        deweyDecimal,
        libraryOfCongress,
        replacementValue: 18.99,
        confidence: 0.82,
        matchSource: "Open Library",
      });
    }

    return results;
  } catch (err) {
    console.warn("Open Library title search error:", err);
    return [];
  }
}

/**
 * Main Visual Book Identification Engine
 * Analyzes a cover image, identifies the book, and reconciles against global bibliographic catalogs.
 */
export async function identifyBookByCoverImage(
  request: IdentifyCoverRequest
): Promise<IdentifyCoverResponse> {
  const { imageBase64, mimeType = "image/jpeg", textHint } = request;

  let detectedTitle: string | null = null;
  let detectedAuthor: string | null = null;
  let detectedPublisher: string | null = null;
  let detectedYear: number | null = null;
  let detectedIsbn: string | null = null;

  // 1. If textHint provided (e.g. OCR text from camera or manual hint), parse initial cues
  if (textHint) {
    const lines = textHint.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      detectedTitle = lines[0];
      if (lines.length > 1) detectedAuthor = lines[1];
    }
  }

  // 2. Multimodal AI Visual Analysis
  if (imageBase64) {
    const geminiResult = await analyzeImageWithGemini(imageBase64, mimeType);
    if (geminiResult) {
      if (geminiResult.title) detectedTitle = geminiResult.title;
      if (geminiResult.author) detectedAuthor = geminiResult.author;
      if (geminiResult.publisher) detectedPublisher = geminiResult.publisher;
      if (geminiResult.publishYear) detectedYear = geminiResult.publishYear;
      if (geminiResult.visibleIsbn) detectedIsbn = geminiResult.visibleIsbn;
    }
  }

  // 3. Fallback: If no title was extracted from image/hints
  if (!detectedTitle && !detectedIsbn) {
    return {
      success: false,
      detectedQuery: {
        title: null,
        author: null,
        rawText: textHint || null,
      },
      topMatch: null,
      candidates: [],
      error: "Could not clearly read title or author from the cover image. Please adjust lighting or try typing the title.",
    };
  }

  // 4. Cross-Catalog Resolution (Google Books + Open Library)
  const candidatePool: RecognizedBookMatch[] = [];

  // Query Google Books
  if (detectedTitle) {
    const gbResults = await searchGoogleBooksByTitleAuthor(detectedTitle, detectedAuthor);
    candidatePool.push(...gbResults);
  }

  // Query Open Library
  if (detectedTitle && candidatePool.length < 3) {
    const olResults = await searchOpenLibraryByTitleAuthor(detectedTitle, detectedAuthor);
    candidatePool.push(...olResults);
  }

  // Deduplicate by ISBN or Title
  const seenKeys = new Set<string>();
  const uniqueCandidates: RecognizedBookMatch[] = [];

  for (const item of candidatePool) {
    const key = (item.isbn && item.isbn.length >= 8 ? item.isbn : `${item.title}::${item.author}`).toLowerCase();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueCandidates.push(item);
    }
  }

  const topMatch = uniqueCandidates.length > 0 ? uniqueCandidates[0] : null;

  return {
    success: uniqueCandidates.length > 0,
    detectedQuery: {
      title: detectedTitle,
      author: detectedAuthor,
      publisher: detectedPublisher,
      publishYear: detectedYear,
      rawText: textHint || null,
    },
    topMatch,
    candidates: uniqueCandidates,
  };
}

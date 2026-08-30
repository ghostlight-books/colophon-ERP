/**
 * Multi-Source Book Cover Resolution Engine
 * Aggregates and verifies high-resolution covers from:
 * 1. Google Books (Enhanced High-Res zoom=2/3)
 * 2. Open Library (Direct ISBN, Cover ID, OCLC, LCCN)
 * 3. ThriftBooks (High-Res Scraped Editions)
 * 4. AbeBooks CDN (Direct ISBN 300px & 00 jackets)
 * 5. ISBNdb Covers
 * 6. LibraryThing & Syndetics
 */

export interface CoverCandidate {
  source: "Google Books" | "Open Library" | "ThriftBooks" | "AbeBooks" | "ISBNdb" | "LibraryThing";
  url: string;
  quality: "high" | "medium" | "standard";
}

const PROBE_TIMEOUT_MS = 3500;

/**
 * Fast HEAD or GET request to verify an image URL actually exists, is an image,
 * and is not a 1x1 transparent spacer GIF or blank 404 image.
 */
export async function verifyCoverImageUrl(url: string | null | undefined): Promise<boolean> {
  if (!url || !url.startsWith("http")) return false;

  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!res.ok) return false;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return false;

    const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
    // Many 1x1 placeholder GIFs or 404 images are under 500 bytes
    if (contentLength > 0 && contentLength < 500) return false;

    return true;
  } catch {
    // If HEAD is blocked or fails, try a fast GET with Range 0-1024
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
          Range: "bytes=0-1024",
        },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!res.ok) return false;
      const type = res.headers.get("content-type") || "";
      return type.startsWith("image/");
    } catch {
      return false;
    }
  }
}

/**
 * Upgrades a Google Books thumbnail to high resolution
 */
export function upgradeGoogleBooksCoverUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let url = rawUrl.replace(/^http:\/\//, "https://");
  
  // Replace zoom=1 with zoom=2 or zoom=3 for higher resolution
  url = url.replace(/zoom=\d/, "zoom=2");
  // Remove curl edge effect
  url = url.replace(/&edge=curl/, "");
  return url;
}

/**
 * Queries Google Books by ISBN or Title+Author for cover images
 */
export async function fetchGoogleBooksCover(isbn: string, title?: string, author?: string): Promise<string | null> {
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, "").toUpperCase();

  // 1. Try by ISBN
  if (cleanIsbn) {
    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(cleanIsbn)}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json() as { items?: Array<{ volumeInfo?: { imageLinks?: { extraLarge?: string; large?: string; medium?: string; thumbnail?: string; smallThumbnail?: string } } }> };
        const images = data.items?.[0]?.volumeInfo?.imageLinks;
        const best = images?.extraLarge || images?.large || images?.medium || images?.thumbnail || images?.smallThumbnail;
        if (best) {
          return upgradeGoogleBooksCoverUrl(best);
        }
      }
    } catch {}
  }

  // 2. Try by Title + Author query fallback if provided
  if (title && title.length > 2) {
    try {
      const q = author ? `intitle:${title}+inauthor:${author}` : `intitle:${title}`;
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json() as { items?: Array<{ volumeInfo?: { imageLinks?: { medium?: string; thumbnail?: string } } }> };
        const images = data.items?.[0]?.volumeInfo?.imageLinks;
        const best = images?.medium || images?.thumbnail;
        if (best) {
          return upgradeGoogleBooksCoverUrl(best);
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Generates all candidate cover URLs across providers for an ISBN
 */
export function generateCoverCandidatesList(params: {
  isbn: string;
  openLibCoverId?: number | string | null;
  oclc?: string | null;
  lccn?: string | null;
  isbndbCover?: string | null;
  googleCover?: string | null;
  thriftbooksCover?: string | null;
}): CoverCandidate[] {
  const cleanIsbn = params.isbn.replace(/[^0-9X]/gi, "").toUpperCase();
  const candidates: CoverCandidate[] = [];

  // 1. Google Books
  if (params.googleCover) {
    candidates.push({
      source: "Google Books",
      url: upgradeGoogleBooksCoverUrl(params.googleCover)!,
      quality: "high",
    });
  }

  // 2. Open Library Cover ID (Large)
  if (params.openLibCoverId) {
    candidates.push({
      source: "Open Library",
      url: `https://covers.openlibrary.org/b/id/${params.openLibCoverId}-L.jpg`,
      quality: "high",
    });
  }

  // 3. Open Library Direct ISBN (Large)
  if (cleanIsbn) {
    candidates.push({
      source: "Open Library",
      url: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg?default=false`,
      quality: "high",
    });
  }

  // 4. ThriftBooks Scraped Cover
  if (params.thriftbooksCover) {
    candidates.push({
      source: "ThriftBooks",
      url: params.thriftbooksCover,
      quality: "high",
    });
  }

  // 5. AbeBooks 300px US Edition
  if (cleanIsbn) {
    candidates.push({
      source: "AbeBooks",
      url: `https://pictures.abebooks.com/isbn/${cleanIsbn}-us-300.jpg`,
      quality: "medium",
    });
    candidates.push({
      source: "AbeBooks",
      url: `https://pictures.abebooks.com/isbn/${cleanIsbn}-00.jpg`,
      quality: "standard",
    });
  }

  // 6. ISBNdb Cover
  if (params.isbndbCover) {
    candidates.push({
      source: "ISBNdb",
      url: params.isbndbCover,
      quality: "high",
    });
  }

  // 7. Open Library by OCLC
  if (params.oclc) {
    const cleanOclc = params.oclc.replace(/[^0-9]/g, "");
    if (cleanOclc) {
      candidates.push({
        source: "Open Library",
        url: `https://covers.openlibrary.org/b/oclc/${cleanOclc}-L.jpg?default=false`,
        quality: "medium",
      });
    }
  }

  // 8. Open Library by LCCN
  if (params.lccn) {
    const cleanLccn = params.lccn.trim();
    if (cleanLccn) {
      candidates.push({
        source: "Open Library",
        url: `https://covers.openlibrary.org/b/lccn/${encodeURIComponent(cleanLccn)}-L.jpg?default=false`,
        quality: "medium",
      });
    }
  }

  return candidates;
}

/**
 * Resolves the best, verified working cover URL by checking multiple providers in priority order.
 */
export async function resolveBestCoverUrl(params: {
  isbn: string;
  title?: string;
  author?: string;
  openLibCoverId?: number | string | null;
  oclc?: string | null;
  lccn?: string | null;
  isbndbCover?: string | null;
  thriftbooksCover?: string | null;
}): Promise<string | null> {
  const cleanIsbn = params.isbn.replace(/[^0-9X]/gi, "").toUpperCase();
  if (!cleanIsbn) return null;

  // 1. Simultaneously fetch Google Books cover if not provided
  const googleCoverPromise = fetchGoogleBooksCover(cleanIsbn, params.title, params.author);

  const googleCover = await googleCoverPromise.catch(() => null);

  // 2. Build ordered candidate list
  const candidates = generateCoverCandidatesList({
    ...params,
    googleCover,
  });

  // 3. Probe candidates in parallel batches to find the first working high-quality cover
  for (const candidate of candidates) {
    // If it's already an verified HTTPS URL from Google or ISBNdb or ThriftBooks
    if (candidate.source === "Google Books" && candidate.url) {
      const isValid = await verifyCoverImageUrl(candidate.url);
      if (isValid) return candidate.url;
    } else if (candidate.source === "ThriftBooks" && candidate.url) {
      const isValid = await verifyCoverImageUrl(candidate.url);
      if (isValid) return candidate.url;
    } else if (candidate.source === "ISBNdb" && candidate.url) {
      const isValid = await verifyCoverImageUrl(candidate.url);
      if (isValid) return candidate.url;
    } else {
      const isValid = await verifyCoverImageUrl(candidate.url);
      if (isValid) return candidate.url;
    }
  }

  // Fallback: return unverified Google or OpenLibrary direct URL
  if (googleCover) return googleCover;
  return `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`;
}

/**
 * Returns all verified working candidate cover images for an ISBN so user can pick
 */
export async function fetchAllWorkingCoverCandidates(params: {
  isbn: string;
  title?: string;
  author?: string;
  openLibCoverId?: number | string | null;
}): Promise<CoverCandidate[]> {
  const cleanIsbn = params.isbn.replace(/[^0-9X]/gi, "").toUpperCase();
  if (!cleanIsbn) return [];

  const googleCover = await fetchGoogleBooksCover(cleanIsbn, params.title, params.author).catch(() => null);

  const rawCandidates = generateCoverCandidatesList({
    ...params,
    googleCover,
  });

  // Verify all candidates concurrently
  const verifiedResults = await Promise.all(
    rawCandidates.map(async (cand) => {
      const valid = await verifyCoverImageUrl(cand.url);
      return valid ? cand : null;
    })
  );

  // Filter out nulls and remove duplicate URLs
  const seenUrls = new Set<string>();
  const verified: CoverCandidate[] = [];

  for (const item of verifiedResults) {
    if (item && !seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      verified.push(item);
    }
  }

  return verified;
}


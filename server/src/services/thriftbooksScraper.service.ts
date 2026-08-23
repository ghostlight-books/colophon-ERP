const PRICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const MIN_REQUEST_INTERVAL_MS = 3000;
const BACKOFF_MS = 15 * 60 * 1000;
const priceCache = new Map<string, { price: number; expiresAt: number }>();
const inFlightRequests = new Map<string, Promise<ThriftbooksDetails | null>>();
const detailsCache = new Map<string, { details: ThriftbooksDetails; expiresAt: number }>();
let lastRequestAt = 0;
let blockedUntil = 0;
let requestQueue: Promise<void> = Promise.resolve();

export type ThriftbooksDetails = {
  price: number | null;
  title: string | null;
  author: string | null;
  category: string | null;
  subcategory: string | null;
};

function firstNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function extractPrice(html: string): number | null {
  const matches = [
    ...Array.from(html.matchAll(/"(?:price|lowPrice)"\s*:\s*"?\$?([0-9]+(?:\.[0-9]+)?)/gi)),
    ...Array.from(html.matchAll(/class=["'][^"']*price[^"']*["'][^>]*>[^$<]*\$?([0-9]+(?:\.[0-9]+)?)/gi)),
  ];
  return matches.map((match) => firstNumber(match[1])).find((price): price is number => price !== null) ?? null;
}

function extractText(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1]?.replace(/<[^>]+>/g, "").trim() || null;
}

function extractDetails(html: string): ThriftbooksDetails {
  return {
    price: extractPrice(html),
    title: extractText(html, /"item_name"\s*:\s*"([^"]+)"/i),
    author: extractText(html, /"item_author"\s*:\s*"([^"]+)"/i),
    category: extractText(html, /"item_category"\s*:\s*"([^"]+)"/i),
    subcategory: null,
  };
}

export async function lookupThriftbooksPrice(isbn: string): Promise<number | null> {
  const details = await lookupThriftbooksDetails(isbn);
  return details?.price ?? null;
}

export async function lookupThriftbooksDetails(isbn: string): Promise<ThriftbooksDetails | null> {
  const cachedDetails = detailsCache.get(isbn);
  if (cachedDetails && cachedDetails.expiresAt > Date.now()) {
    return cachedDetails.details;
  }
  const cached = priceCache.get(isbn);
  if (cached && cached.expiresAt > Date.now()) {
    return { price: cached.price, title: null, author: null, category: null, subcategory: null };
  }

  const existingRequest = inFlightRequests.get(isbn);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchThriftbooksDetails(isbn);
  inFlightRequests.set(isbn, request);
  return request.finally(() => inFlightRequests.delete(isbn));
}

async function fetchThriftbooksDetails(isbn: string): Promise<ThriftbooksDetails | null> {
  let result: ThriftbooksDetails | null = null;
  const run = requestQueue.then(async () => {
    const now = Date.now();
    if (blockedUntil > now) {
      return;
    }

    const waitMs = Math.max(0, lastRequestAt + MIN_REQUEST_INTERVAL_MS - now);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    try {
      const response = await fetch(`https://www.thriftbooks.com/browse/?b.search=${encodeURIComponent(isbn)}`, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "ColophonERP/1.0 (bookstore inventory lookup)",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      lastRequestAt = Date.now();
      if (response.status === 403 || response.status === 429) {
        blockedUntil = Date.now() + BACKOFF_MS;
        console.warn(`ThriftBooks request blocked with status ${response.status}`);
        return;
      }
      if (!response.ok) {
        console.warn(`ThriftBooks request failed with status ${response.status}`);
        return;
      }

      result = extractDetails(await response.text());
      if (result.price !== null || result.title !== null) {
        detailsCache.set(isbn, { details: result, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
      }
      if (result.price !== null) {
        priceCache.set(isbn, { price: result.price, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
      }
    } catch (error) {
      lastRequestAt = Date.now();
      console.warn("ThriftBooks request error", error instanceof Error ? error.message : error);
    }
  });
  requestQueue = run.then(() => undefined, () => undefined);
  await run;
  return result;
}
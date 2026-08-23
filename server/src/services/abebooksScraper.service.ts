const PRICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000;
const MIN_REQUEST_INTERVAL_MS = 3000;
const BACKOFF_MS = 15 * 60 * 1000;
const priceCache = new Map<string, { price: number; expiresAt: number }>();
const inFlightRequests = new Map<string, Promise<number | null>>();
let lastRequestAt = 0;
let blockedUntil = 0;
let requestQueue: Promise<void> = Promise.resolve();

function extractPrice(html: string): number | null {
  const match = html.match(/data-test-id=["']listing-price["'][^>]*>\s*(?:US\$|\$)\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!match) {
    return null;
  }
  const price = Number(match[1]);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export async function lookupAbeBooksPrice(isbn: string): Promise<number | null> {
  const cached = priceCache.get(isbn);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.price;
  }

  const existingRequest = inFlightRequests.get(isbn);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchAbeBooksPrice(isbn);
  inFlightRequests.set(isbn, request);
  return request.finally(() => inFlightRequests.delete(isbn));
}

async function fetchAbeBooksPrice(isbn: string): Promise<number | null> {
  let result: number | null = null;
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
      const response = await fetch(`https://www.abebooks.com/servlet/SearchResults?isbn=${encodeURIComponent(isbn)}`, {
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
        console.warn(`AbeBooks request blocked with status ${response.status}`);
        return;
      }
      if (!response.ok) {
        console.warn(`AbeBooks request failed with status ${response.status}`);
        return;
      }

      result = extractPrice(await response.text());
      if (result !== null) {
        priceCache.set(isbn, { price: result, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
      }
    } catch (error) {
      lastRequestAt = Date.now();
      console.warn("AbeBooks request error", error instanceof Error ? error.message : error);
    }
  });
  requestQueue = run.then(() => undefined, () => undefined);
  await run;
  return result;
}
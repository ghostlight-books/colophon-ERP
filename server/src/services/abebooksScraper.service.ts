import {
  fetchScraperHtml,
  extractJsonLdBlocks,
  parseOffersFromJsonLd,
  extractMetaPrice,
  normalizeCondition,
  BookCondition,
  ScrapedOffer,
} from "./scraperGateway.service.js";

const PRICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const priceCache = new Map<string, { price: number; expiresAt: number }>();
const inFlightRequests = new Map<string, Promise<number | null>>();

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

export function extractAbeBooksPrice(html: string): { price: number | null; offers: ScrapedOffer[] } {
  // 1. JSON-LD structured extraction
  const jsonLdBlocks = extractJsonLdBlocks(html);
  const structuredOffers = parseOffersFromJsonLd(jsonLdBlocks);

  if (structuredOffers.length > 0) {
    const conditionPrices: Partial<Record<BookCondition, number>> = {};
    for (const offer of structuredOffers) {
      if (!conditionPrices[offer.condition] || offer.price < conditionPrices[offer.condition]!) {
        conditionPrices[offer.condition] = offer.price;
      }
    }
    const bestPrice = conditionPrices["Good"]
      ?? conditionPrices["Very Good"]
      ?? conditionPrices["Acceptable"]
      ?? conditionPrices["Like New"]
      ?? Math.min(...structuredOffers.map((o) => o.price));

    return { price: bestPrice, offers: structuredOffers };
  }

  // 2. OpenGraph / Microdata
  const metaPrice = extractMetaPrice(html);
  if (metaPrice !== null) {
    return { price: metaPrice, offers: [] };
  }

  // 3. Resilient AbeBooks HTML regex matches
  const regexList = [
    /data-test-id=["']listing-price["'][^>]*>\s*(?:US\$|\$)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /class=["'][^"']*(?:item-price|listing-price|s-price)[^"']*["'][^>]*>\s*(?:US\$|\$)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi,
    /"price"\s*:\s*"?\$?([0-9]+(?:\.[0-9]+)?)/gi,
  ];

  for (const regex of regexList) {
    const matches = Array.from(html.matchAll(regex));
    const price = matches.map((m) => firstNumber(m[1])).find((p): p is number => p !== null);
    if (price) {
      return { price, offers: [] };
    }
  }

  return { price: null, offers: [] };
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
  const targetUrl = `https://www.abebooks.com/servlet/SearchResults?isbn=${encodeURIComponent(isbn)}`;
  const { html } = await fetchScraperHtml(targetUrl);

  if (!html) {
    return null;
  }

  const { price } = extractAbeBooksPrice(html);

  if (price !== null) {
    priceCache.set(isbn, { price, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
  }

  return price;
}
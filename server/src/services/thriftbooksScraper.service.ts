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
const inFlightRequests = new Map<string, Promise<ThriftbooksDetails | null>>();
const detailsCache = new Map<string, { details: ThriftbooksDetails; expiresAt: number }>();

export type ThriftbooksDetails = {
  price: number | null;
  title: string | null;
  author: string | null;
  category: string | null;
  subcategory: string | null;
  offers?: ScrapedOffer[];
  conditionPrices?: Partial<Record<BookCondition, number>>;
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

function extractText(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1]?.replace(/<[^>]+>/g, "").trim() || null;
}

export function extractThriftbooksDetails(html: string): ThriftbooksDetails {
  // 1. Structured JSON-LD extraction
  const jsonLdBlocks = extractJsonLdBlocks(html);
  const structuredOffers = parseOffersFromJsonLd(jsonLdBlocks);
  
  let jsonTitle: string | null = null;
  let jsonAuthor: string | null = null;

  for (const block of jsonLdBlocks) {
    if (block && typeof block === "object") {
      const obj = block as Record<string, unknown>;
      if (!jsonTitle && typeof obj.name === "string") {
        jsonTitle = obj.name;
      }
      if (!jsonAuthor) {
        if (typeof obj.author === "string") {
          jsonAuthor = obj.author;
        } else if (typeof obj.author === "object" && obj.author !== null && "name" in obj.author) {
          jsonAuthor = String((obj.author as Record<string, unknown>).name);
        }
      }
    }
  }

  // 2. DataLayer / Embedded Analytics Fallbacks
  const dataLayerTitle = extractText(html, /"item_name"\s*:\s*"([^"]+)"/i)
    || extractText(html, /"title"\s*:\s*"([^"]+)"/i);
  const dataLayerAuthor = extractText(html, /"item_author"\s*:\s*"([^"]+)"/i)
    || extractText(html, /"author"\s*:\s*"([^"]+)"/i);
  const category = extractText(html, /"item_category"\s*:\s*"([^"]+)"/i)
    || extractText(html, /"category"\s*:\s*"([^"]+)"/i);
  const subcategory = extractText(html, /"item_category2"\s*:\s*"([^"]+)"/i);

  // 3. Resilient price extraction
  const conditionPrices: Partial<Record<BookCondition, number>> = {};
  for (const offer of structuredOffers) {
    if (!conditionPrices[offer.condition] || offer.price < conditionPrices[offer.condition]!) {
      conditionPrices[offer.condition] = offer.price;
    }
  }

  let finalPrice: number | null = null;

  // Prefer used "Good" / "Very Good" / lowest price if available in structured offers
  if (structuredOffers.length > 0) {
    finalPrice = conditionPrices["Good"]
      ?? conditionPrices["Very Good"]
      ?? conditionPrices["Acceptable"]
      ?? conditionPrices["Like New"]
      ?? Math.min(...structuredOffers.map((o) => o.price));
  }

  // If no structured offers, check OpenGraph / Microdata
  if (finalPrice === null) {
    finalPrice = extractMetaPrice(html);
  }

  // Fallback to regex matches across HTML
  if (finalPrice === null) {
    const regexMatches = [
      ...Array.from(html.matchAll(/"(?:price|lowPrice)"\s*:\s*"?\$?([0-9]+(?:\.[0-9]+)?)/gi)),
      ...Array.from(html.matchAll(/class=["'][^"']*price[^"']*["'][^>]*>[^$<]*\$?([0-9]+(?:\.[0-9]+)?)/gi)),
    ];
    finalPrice = regexMatches.map((m) => firstNumber(m[1])).find((p): p is number => p !== null) ?? null;
  }

  return {
    price: finalPrice,
    title: jsonTitle || dataLayerTitle,
    author: jsonAuthor || dataLayerAuthor,
    category,
    subcategory,
    offers: structuredOffers,
    conditionPrices,
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
  const targetUrl = `https://www.thriftbooks.com/browse/?b.search=${encodeURIComponent(isbn)}`;
  const { html, status } = await fetchScraperHtml(targetUrl);

  if (!html) {
    return null;
  }

  const result = extractThriftbooksDetails(html);

  if (result.price !== null || result.title !== null) {
    detailsCache.set(isbn, { details: result, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
  }
  if (result.price !== null) {
    priceCache.set(isbn, { price: result.price, expiresAt: Date.now() + PRICE_CACHE_TTL_MS });
  }

  return result;
}
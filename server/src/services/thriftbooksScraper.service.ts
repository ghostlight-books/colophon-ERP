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
  coverUrl?: string | null;
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

function isGenericSiteTitle(title: string | null): boolean {
  if (!title) return true;
  const clean = title.trim().toLowerCase();
  if (clean.length < 2) return true;
  const bad = ["featured", "home", "books", "best sellers", "customer favorites", "browse all", "thriftbooks", "customer reviews", "all books", "featured books"];
  return bad.includes(clean) || clean.includes("0 results") || clean.includes("no results");
}

export function extractThriftbooksDetails(html: string): ThriftbooksDetails {
  // Check for explicit zero-result pages
  if (
    html.includes("0 results for") ||
    html.includes("0 results found") ||
    html.includes("No results found") ||
    html.includes("We couldn't find anything matching") ||
    html.includes("did not match any books") ||
    html.includes("Search-NoResults")
  ) {
    return {
      price: null,
      title: null,
      author: null,
      category: null,
      subcategory: null,
      coverUrl: null,
      offers: [],
      conditionPrices: {},
    };
  }

  // 1. Structured JSON-LD extraction (Only inspect Book/Product/IndividualProduct schemas - never Reviews)
  const jsonLdBlocks = extractJsonLdBlocks(html);
  const structuredOffers = parseOffersFromJsonLd(jsonLdBlocks);
  
  let jsonTitle: string | null = null;
  let jsonAuthor: string | null = null;
  let jsonCover: string | null = null;

  for (const block of jsonLdBlocks) {
    if (block && typeof block === "object") {
      const obj = block as Record<string, unknown>;
      const type = String(obj["@type"] || "").toLowerCase();
      
      // Specifically ignore Reviews and AggregateRating schemas
      if (type.includes("review") || type.includes("rating")) {
        continue;
      }

      if (type.includes("book") || type.includes("product") || type.includes("creativework")) {
        if (!jsonTitle && typeof obj.name === "string" && obj.name.trim().length > 0) {
          const cand = obj.name.trim();
          if (!isGenericSiteTitle(cand)) {
            jsonTitle = cand;
          }
        }
        if (!jsonAuthor) {
          if (typeof obj.author === "string" && obj.author.trim().length > 0) {
            jsonAuthor = obj.author.trim();
          } else if (typeof obj.author === "object" && obj.author !== null && "name" in obj.author) {
            jsonAuthor = String((obj.author as Record<string, unknown>).name).trim();
          }
        }
        if (!jsonCover) {
          if (typeof obj.image === "string" && obj.image.startsWith("http")) {
            jsonCover = obj.image;
          } else if (Array.isArray(obj.image) && typeof obj.image[0] === "string" && obj.image[0].startsWith("http")) {
            jsonCover = obj.image[0];
          }
        }
      }
    }
  }

  // 2. HTML elements for search & product pages
  const htmlTitleMatch = html.match(/<[^>]*class=["'][^"']*(?:Search-Item-Title|product-title|All-Search-Item-Title|book-title)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  let htmlTitle = htmlTitleMatch ? htmlTitleMatch[1].replace(/<[^>]+>/g, "").trim() : null;
  if (isGenericSiteTitle(htmlTitle)) {
    htmlTitle = null;
  }

  const htmlAuthorMatch = html.match(/<[^>]*class=["'][^"']*(?:Search-Item-Author|All-Search-Item-Author|product-author|by-author)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  let htmlAuthor = htmlAuthorMatch ? htmlAuthorMatch[1].replace(/<[^>]+>/g, "").trim() : null;
  if (htmlAuthor) {
    htmlAuthor = htmlAuthor.replace(/^by\s+/i, "").trim();
  }

  // 3. DataLayer / Embedded Analytics Fallbacks
  const dataLayerTitle = extractText(html, /"item_name"\s*:\s*"([^"]+)"/i)
    || extractText(html, /"title"\s*:\s*"([^"]+)"/i);
  const dataLayerAuthor = extractText(html, /"item_author"\s*:\s*"([^"]+)"/i)
    || extractText(html, /"author"\s*:\s*"([^"]+)"/i);
  const category = extractText(html, /"item_category"\s*:\s*"([^"]+)"/i)
    || extractText(html, /"category"\s*:\s*"([^"]+)"/i);
  const subcategory = extractText(html, /"item_category2"\s*:\s*"([^"]+)"/i);

  // 4. Resilient price extraction
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

  const rawTitle = jsonTitle || htmlTitle || dataLayerTitle;
  const rawAuthor = jsonAuthor || htmlAuthor || dataLayerAuthor;

  const finalTitle = rawTitle ? decodeHtmlEntities(rawTitle) : null;
  const finalAuthor = rawAuthor ? decodeHtmlEntities(rawAuthor) : null;

  const htmlCoverMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i)
    || html.match(/<img[^>]*class=["'][^"']*(?:product-image|work-image|book-cover)[^"']*["'][^>]*src=["']([^"']+)["']/i);
  const htmlCover = htmlCoverMatch ? htmlCoverMatch[1] : null;

  return {
    price: finalPrice,
    title: finalTitle,
    author: finalAuthor,
    category,
    subcategory,
    coverUrl: jsonCover || htmlCover || null,
    offers: structuredOffers,
    conditionPrices,
  };
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
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
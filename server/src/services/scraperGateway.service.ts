import { env } from "../config/env.js";

export type BookCondition = "New" | "Like New" | "Very Good" | "Good" | "Acceptable";

export interface ScrapedOffer {
  condition: BookCondition;
  price: number;
  shipping?: number;
  currency?: string;
  format?: string;
  seller?: string;
}

export interface ScrapedBookDetails {
  title: string | null;
  author: string | null;
  publisher: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  coverUrl: string | null;
  offers: ScrapedOffer[];
  lowestPrice: number | null;
  listPrice?: number | null;
}

export interface ScraperFetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  forceGateway?: boolean;
}

export interface FetchResult {
  html: string | null;
  status: number;
  usedGateway: boolean;
}

// ---------------------------------------------------------------------------
// 1. Condition Normalization
// ---------------------------------------------------------------------------
const CONDITION_MAPPING: Record<string, BookCondition> = {
  "brand new": "New",
  "new": "New",
  "mint": "New",
  "like new": "Like New",
  "fine": "Like New",
  "as new": "Like New",
  "near fine": "Like New",
  "nf": "Like New",
  "very good": "Very Good",
  "vg": "Very Good",
  "vg+": "Very Good",
  "vg-": "Very Good",
  "good": "Good",
  "g": "Good",
  "g+": "Good",
  "acceptable": "Acceptable",
  "fair": "Acceptable",
  "poor": "Acceptable",
  "worn": "Acceptable",
  "reading copy": "Acceptable",
  "ex-library": "Acceptable",
  "former library": "Acceptable",
};

export function normalizeCondition(rawCondition?: string | null): BookCondition {
  if (!rawCondition) return "Good";
  const cleaned = rawCondition.toLowerCase().trim().replace(/https?:\/\/schema\.org\//i, "").replace(/condition$/i, "");
  
  if (cleaned.includes("new") && !cleaned.includes("like")) return "New";
  if (cleaned.includes("like new") || cleaned.includes("fine")) return "Like New";
  if (cleaned.includes("very good") || cleaned.includes("vg")) return "Very Good";
  if (cleaned.includes("acceptable") || cleaned.includes("fair") || cleaned.includes("poor") || cleaned.includes("worn")) return "Acceptable";
  if (cleaned.includes("good")) return "Good";

  return CONDITION_MAPPING[cleaned] ?? "Good";
}

// ---------------------------------------------------------------------------
// 2. Realistic Browser Fingerprints & Headers
// ---------------------------------------------------------------------------
const DESKTOP_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
];

export function getRealisticBrowserHeaders(targetUrl?: string): Record<string, string> {
  const ua = DESKTOP_USER_AGENTS[Math.floor(Math.random() * DESKTOP_USER_AGENTS.length)];
  const isChrome = ua.includes("Chrome");
  
  const headers: Record<string, string> = {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "max-age=0",
    "Upgrade-Insecure-Requests": "1",
  };

  if (targetUrl) {
    try {
      const urlObj = new URL(targetUrl);
      headers["Host"] = urlObj.host;
    } catch {
      // ignore
    }
  }

  if (isChrome) {
    headers["sec-ch-ua"] = `"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"`;
    headers["sec-ch-ua-mobile"] = "?0";
    headers["sec-ch-ua-platform"] = ua.includes("Windows") ? `"Windows"` : `"macOS"`;
    headers["sec-fetch-dest"] = "document";
    headers["sec-fetch-mode"] = "navigate";
    headers["sec-fetch-site"] = "none";
    headers["sec-fetch-user"] = "?1";
  }

  return headers;
}

// ---------------------------------------------------------------------------
// 3. Domain Rate Limiter & Progressive Backoff
// ---------------------------------------------------------------------------
interface DomainState {
  lastRequestAt: number;
  blockedUntil: number;
  consecutiveFailures: number;
}

const domainStates = new Map<string, DomainState>();

function getDomainState(url: string): DomainState {
  let hostname = "default";
  try {
    hostname = new URL(url).hostname;
  } catch {
    // fallback
  }

  let state = domainStates.get(hostname);
  if (!state) {
    state = { lastRequestAt: 0, blockedUntil: 0, consecutiveFailures: 0 };
    domainStates.set(hostname, state);
  }
  return state;
}

function recordDomainSuccess(url: string): void {
  const state = getDomainState(url);
  state.consecutiveFailures = 0;
  state.blockedUntil = 0;
  state.lastRequestAt = Date.now();
}

function recordDomainBlocked(url: string, status: number): void {
  const state = getDomainState(url);
  state.consecutiveFailures += 1;
  state.lastRequestAt = Date.now();
  // Exponential backoff: 30s -> 60s -> 120s -> max 5min (instead of hard 15 min lock)
  const backoffMs = Math.min(300_000, 30_000 * Math.pow(2, state.consecutiveFailures - 1));
  state.blockedUntil = Date.now() + backoffMs;
  console.warn(`[ScraperGateway] ${new URL(url).hostname} blocked (status ${status}). Backing off for ${Math.round(backoffMs / 1000)}s`);
}

// ---------------------------------------------------------------------------
// 4. Scraping API Gateway URL Builder
// ---------------------------------------------------------------------------
export function buildGatewayUrl(targetUrl: string): string | null {
  const provider = env.SCRAPING_API_PROVIDER;
  const apiKey = env.SCRAPING_API_KEY;

  if (!provider || !apiKey) {
    return null;
  }

  const encoded = encodeURIComponent(targetUrl);

  switch (provider) {
    case "zenrows":
      return `https://api.zenrows.com/v1/?apikey=${apiKey}&url=${encoded}&js_render=true&premium_proxy=true`;
    case "scrapingbee":
      return `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encoded}&render_js=false`;
    case "scraperapi":
      return `https://api.scraperapi.com?api_key=${apiKey}&url=${encoded}&render=true`;
    case "crawlbase":
      return `https://api.crawlbase.com/?token=${apiKey}&url=${encoded}`;
    case "custom":
      return env.SCRAPER_PROXY_URL ? `${env.SCRAPER_PROXY_URL}?url=${encoded}` : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 5. Unified Stealth Request Client
// ---------------------------------------------------------------------------
export async function fetchScraperHtml(targetUrl: string, options: ScraperFetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? env.SCRAPER_REQUEST_TIMEOUT_MS ?? 12000;
  const domainState = getDomainState(targetUrl);
  const gatewayUrl = buildGatewayUrl(targetUrl);

  // If a scraping API is configured and caller asks for it or domain is currently blocked for direct requests:
  if (gatewayUrl && (options.forceGateway || domainState.blockedUntil > Date.now())) {
    try {
      const response = await fetch(gatewayUrl, {
        signal: AbortSignal.timeout(timeoutMs + 5000), // Scraping APIs need slightly more time for browser rendering
      });
      if (response.ok) {
        const html = await response.text();
        return { html, status: response.status, usedGateway: true };
      }
      console.warn(`[ScraperGateway] Gateway request returned status ${response.status}`);
    } catch (err) {
      console.warn(`[ScraperGateway] Gateway request failed:`, err instanceof Error ? err.message : err);
    }
  }

  // If direct requests are currently backed off and no gateway worked, return early
  if (domainState.blockedUntil > Date.now()) {
    return { html: null, status: 429, usedGateway: false };
  }

  // Polite jitter delay (200ms - 600ms) between direct requests
  const minInterval = 350;
  const elapsed = Date.now() - domainState.lastRequestAt;
  if (elapsed < minInterval) {
    const jitter = Math.floor(Math.random() * 250);
    await new Promise((r) => setTimeout(r, minInterval - elapsed + jitter));
  }

  const stealthHeaders = {
    ...getRealisticBrowserHeaders(targetUrl),
    ...(options.headers ?? {}),
  };

  try {
    const response = await fetch(targetUrl, {
      headers: stealthHeaders,
      signal: AbortSignal.timeout(timeoutMs),
    });

    domainState.lastRequestAt = Date.now();

    if (response.status === 403 || response.status === 429) {
      recordDomainBlocked(targetUrl, response.status);

      // If we got blocked but have a scraping gateway available, retry immediately via gateway!
      if (gatewayUrl) {
        console.log(`[ScraperGateway] Direct request blocked (${response.status}). Retrying via Scraping Gateway...`);
        return fetchScraperHtml(targetUrl, { ...options, forceGateway: true });
      }

      return { html: null, status: response.status, usedGateway: false };
    }

    if (!response.ok) {
      return { html: null, status: response.status, usedGateway: false };
    }

    recordDomainSuccess(targetUrl);
    const html = await response.text();
    return { html, status: response.status, usedGateway: false };
  } catch (error) {
    domainState.lastRequestAt = Date.now();
    console.warn(`[ScraperGateway] Request error for ${targetUrl}:`, error instanceof Error ? error.message : error);
    
    // If timeout and gateway available, try gateway once
    if (gatewayUrl && !options.forceGateway) {
      return fetchScraperHtml(targetUrl, { ...options, forceGateway: true });
    }

    return { html: null, status: 0, usedGateway: false };
  }
}

// ---------------------------------------------------------------------------
// 6. JSON-LD & Structured Data Extractor
// ---------------------------------------------------------------------------
function sanitizeJsonLdString(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const results: unknown[] = [];
  const scriptRegex = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const content = sanitizeJsonLdString(match[1] || "");
    if (!content) continue;
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      } else if (parsed && typeof parsed === "object" && "@graph" in parsed && Array.isArray((parsed as Record<string, unknown>)["@graph"])) {
        results.push(...((parsed as Record<string, unknown>)["@graph"] as unknown[]));
      } else if (parsed) {
        results.push(parsed);
      }
    } catch {
      // Continue parsing remaining tags
    }
  }

  return results;
}

export function parseOffersFromJsonLd(items: unknown[]): ScrapedOffer[] {
  const offers: ScrapedOffer[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;

    // Direct Offer or AggregateOffer
    const itemOffers = obj.offers || (obj["@type"] === "Offer" || obj["@type"] === "AggregateOffer" ? obj : null);
    if (!itemOffers) continue;

    const offerList = Array.isArray(itemOffers) ? itemOffers : [itemOffers];

    for (const rawOffer of offerList) {
      if (!rawOffer || typeof rawOffer !== "object") continue;
      const off = rawOffer as Record<string, unknown>;

      const rawPrice = off.price ?? off.lowPrice;
      const priceNum = typeof rawPrice === "number" ? rawPrice : Number(String(rawPrice || "").replace(/[^0-9.]/g, ""));

      if (Number.isFinite(priceNum) && priceNum > 0) {
        const rawCondition = String(off.itemCondition || off.condition || "");
        const condition = normalizeCondition(rawCondition);
        const shipping = off.shippingDetails || off.priceSpecification;
        let shippingFee = 0;
        if (typeof shipping === "object" && shipping !== null && "price" in shipping) {
          const sPrice = Number((shipping as Record<string, unknown>).price);
          if (Number.isFinite(sPrice) && sPrice > 0) shippingFee = sPrice;
        }

        offers.push({
          condition,
          price: priceNum,
          shipping: shippingFee,
          currency: String(off.priceCurrency || "USD"),
          seller: typeof off.seller === "object" && off.seller !== null && "name" in off.seller ? String((off.seller as Record<string, unknown>).name) : undefined,
        });
      }
    }
  }

  return offers;
}

// ---------------------------------------------------------------------------
// 7. Microdata & HTML Resilient Fallbacks
// ---------------------------------------------------------------------------
export function extractMetaPrice(html: string): number | null {
  // Check OpenGraph & Product meta tags
  const ogPriceMatch = html.match(/<meta\b[^>]*\bproperty=["'](?:og:price:amount|product:price:amount)["'][^>]*\bcontent=["']([0-9]+(?:\.[0-9]{1,2})?)["']/i)
    || html.match(/<meta\b[^>]*\bcontent=["']([0-9]+(?:\.[0-9]{1,2})?)["'][^>]*\bproperty=["'](?:og:price:amount|product:price:amount)["']/i);

  if (ogPriceMatch) {
    const p = Number(ogPriceMatch[1]);
    if (Number.isFinite(p) && p > 0) return p;
  }

  // Check Schema Microdata itemprop="price"
  const itempropMatch = html.match(/itemprop=["']price["'][^>]*\bcontent=["']([0-9]+(?:\.[0-9]{1,2})?)["']/i)
    || html.match(/content=["']([0-9]+(?:\.[0-9]{1,2})?)["'][^>]*itemprop=["']price["']/i)
    || html.match(/itemprop=["']price["'][^>]*>\s*(?:US\$|\$)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);

  if (itempropMatch) {
    const p = Number(itempropMatch[1]);
    if (Number.isFinite(p) && p > 0) return p;
  }

  return null;
}


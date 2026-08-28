import type {
  BookBuyingCondition,
  BookBuyingOffer,
  BookBuyingSearchParams,
  BookBuyingSearchResult,
  BuyingBatchItem,
  BuyingBatchSummary,
} from "@colophon/shared";

const rawApiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const API_BASE = rawApiBase.replace(/\/$/, "").replace(/\/api$/, "");
const PROVIDER_TIMEOUT_MS = 20000;

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
}

export async function searchBuyingEditions(params: BookBuyingSearchParams): Promise<BookBuyingSearchResult[]> {
  const query = new URLSearchParams();
  query.set("year", String(params.year));
  if (params.publisher) query.set("publisher", params.publisher.trim());
  if (params.author) query.set("author", params.author.trim());
  if (params.isbn) query.set("isbn", params.isbn.trim());
  if (params.title) query.set("title", params.title.trim());

  const response = await fetchWithTimeout(`${API_BASE}/api/buying/search?${query.toString()}`);
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error || `Search failed with status ${response.status}`);
  }

  const data = (await response.json()) as { results: BookBuyingSearchResult[] };
  return data.results || [];
}

export async function evaluateBuyingBook(isbn: string, condition: BookBuyingCondition = "Good"): Promise<BookBuyingOffer> {
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, "").toUpperCase();
  const response = await fetchWithTimeout(
    `${API_BASE}/api/buying/evaluate/${encodeURIComponent(cleanIsbn)}?condition=${encodeURIComponent(condition)}`,
  );

  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error || `Valuation failed with status ${response.status}`);
  }

  return (await response.json()) as BookBuyingOffer;
}

export async function processBuyingBatch(params: {
  items: BuyingBatchItem[];
  paymentMethod: "cash" | "storecredit" | "check";
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}): Promise<{
  success: boolean;
  batchId: string;
  itemsProcessed: number;
  totalPaid: number;
  paymentMethod: string;
  timestamp: string;
}> {
  const payload = {
    items: params.items.map((item) => ({
      isbn: item.isbn,
      condition: item.condition,
      sellPrice: item.sellPrice,
      buyOffer: item.buyOffer,
      title: item.title,
      author: item.author,
    })),
    paymentMethod: params.paymentMethod,
    customerName: params.customerName,
    customerEmail: params.customerEmail,
    customerPhone: params.customerPhone,
  };

  const response = await fetch(`${API_BASE}/api/buying/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error || `Buyout processing failed (${response.status})`);
  }

  // Trigger inventory update across tabs
  window.dispatchEvent(new Event("colophon-inventory-updated"));

  return (await response.json()) as {
    success: boolean;
    batchId: string;
    itemsProcessed: number;
    totalPaid: number;
    paymentMethod: string;
    timestamp: string;
  };
}


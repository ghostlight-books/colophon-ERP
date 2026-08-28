import type {
  ProductBundle,
  BundlePricingSuggestion,
  CreateProductBundleInput,
  UnbundleResult,
} from "@colophon/shared";

const rawApiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const API_BASE = rawApiBase.replace(/\/$/, "").replace(/\/api$/, "");

export interface AvailableBundleItem {
  isbn: string;
  sku: string;
  title: string;
  author: string | null;
  publisher: string | null;
  coverUrl: string | null;
  condition: string | null;
  listPrice: number;
  category: string | null;
  subcategory: string | null;
  quantityOnHand: number;
}

export async function fetchBundles(status = "ACTIVE"): Promise<ProductBundle[]> {
  const res = await fetch(`${API_BASE}/api/bundles?status=${encodeURIComponent(status)}&t=${Date.now()}`);
  if (!res.ok) {
    throw new Error("Failed to load product bundles.");
  }
  const data = (await res.json()) as { bundles: ProductBundle[] };
  return data.bundles || [];
}

export async function searchBundlingItems(options: {
  query?: string;
  topic?: string;
  author?: string;
  title?: string;
  limit?: number;
}): Promise<AvailableBundleItem[]> {
  const params = new URLSearchParams();
  if (options.query) params.set("query", options.query);
  if (options.topic && options.topic !== "All") params.set("topic", options.topic);
  if (options.author) params.set("author", options.author);
  if (options.title) params.set("title", options.title);
  if (options.limit) params.set("limit", String(options.limit));
  params.set("t", String(Date.now()));

  const res = await fetch(`${API_BASE}/api/bundles/search-items?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to search inventory items for bundling.");
  }
  const data = (await res.json()) as { items: AvailableBundleItem[] };
  return data.items || [];
}

export async function previewBundlePricing(prices: number[]): Promise<BundlePricingSuggestion> {
  const res = await fetch(`${API_BASE}/api/bundles/pricing-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prices }),
  });
  if (!res.ok) {
    throw new Error("Failed to preview bundle pricing.");
  }
  return res.json() as Promise<BundlePricingSuggestion>;
}

export async function createBundle(input: CreateProductBundleInput): Promise<ProductBundle> {
  const res = await fetch(`${API_BASE}/api/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create product bundle.");
  }
  window.dispatchEvent(new Event("colophon-inventory-updated"));
  return res.json() as Promise<ProductBundle>;
}

export async function unbundle(bundleId: string): Promise<UnbundleResult> {
  const res = await fetch(`${API_BASE}/api/bundles/${encodeURIComponent(bundleId)}/unbundle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeId: "ghostlight-demo" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to unbundle product.");
  }
  window.dispatchEvent(new Event("colophon-inventory-updated"));
  return res.json() as Promise<UnbundleResult>;
}


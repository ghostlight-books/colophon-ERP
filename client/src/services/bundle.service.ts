import type {
  ProductBundle,
  BundlePricingSuggestion,
  CreateProductBundleInput,
  UnbundleResult,
} from "@colophon/shared";

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

function resolveApiUrl(endpointPath: string): string {
  const envBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  const path = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;

  if (envBase) {
    const cleanBase = envBase.replace(/\/+$/, "");
    if (cleanBase.endsWith("/api")) {
      return `${cleanBase}${path.startsWith("/api") ? path.slice(4) : path}`;
    }
    return `${cleanBase}${path.startsWith("/api") ? path : `/api${path}`}`;
  }

  // Fallback for local development
  return `http://localhost:4000${path.startsWith("/api") ? path : `/api${path}`}`;
}

const PROVIDER_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchBundles(status = "ACTIVE"): Promise<ProductBundle[]> {
  const url = resolveApiUrl(`/bundles?status=${encodeURIComponent(status)}&t=${Date.now()}`);
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as { bundles: ProductBundle[] };
    return Array.isArray(data.bundles) ? data.bundles : [];
  } catch (err) {
    console.warn("fetchBundles network warning:", err);
    return [];
  }
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

  const url = resolveApiUrl(`/bundles/search-items?${params.toString()}`);
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      // Fallback: query active inventory endpoint if available
      const fallbackRes = await fetchWithTimeout(resolveApiUrl(`/inventory/active?t=${Date.now()}`)).catch(() => null);
      if (fallbackRes && fallbackRes.ok) {
        const payload = (await fallbackRes.json()) as { items: AvailableBundleItem[] };
        const rawItems = payload.items || [];
        return rawItems.filter((i) => i.quantityOnHand > 0);
      }
      return [];
    }
    const data = (await res.json()) as { items: AvailableBundleItem[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    console.warn("searchBundlingItems network warning:", err);
    return [];
  }
}

export async function previewBundlePricing(prices: number[]): Promise<BundlePricingSuggestion> {
  const url = resolveApiUrl("/bundles/pricing-preview");
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prices }),
    });
    if (!res.ok) throw new Error("Failed to preview bundle pricing");
    return res.json() as Promise<BundlePricingSuggestion>;
  } catch {
    // Client-side math calculation fallback
    const total = prices.reduce((sum, p) => sum + (p || 0), 0);
    const discounted = total * 0.90;
    let nearestPoint99 = Math.round(discounted) - 0.01;
    if (nearestPoint99 < 0.99) nearestPoint99 = 0.99;
    return {
      totalIndividualPrice: Number(total.toFixed(2)),
      discountPercent: 10,
      discountedPrice: Number(discounted.toFixed(2)),
      suggestedBundlePrice: Number(nearestPoint99.toFixed(2)),
      savingsAmount: Number(Math.max(0, total - nearestPoint99).toFixed(2)),
      savingsPercent: total > 0 ? Number((((total - nearestPoint99) / total) * 100).toFixed(1)) : 10,
    };
  }
}

export async function createBundle(input: CreateProductBundleInput): Promise<ProductBundle> {
  const url = resolveApiUrl("/bundles");
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    // Relative fallback if host/port differs
    res = await fetchWithTimeout("/api/bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  if (!res.ok) {
    let errMessage = `Failed to create product bundle (${res.status}).`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err && err.error) errMessage = err.error;
    } catch {
      // ignore
    }
    throw new Error(errMessage);
  }
  window.dispatchEvent(new Event("colophon-inventory-updated"));
  return res.json() as Promise<ProductBundle>;
}

export async function unbundle(bundleId: string): Promise<UnbundleResult> {
  const url = resolveApiUrl(`/bundles/${encodeURIComponent(bundleId)}/unbundle`);
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: "ghostlight-demo" }),
    });
  } catch {
    res = await fetchWithTimeout(`/api/bundles/${encodeURIComponent(bundleId)}/unbundle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: "ghostlight-demo" }),
    });
  }

  if (!res.ok) {
    let errMessage = `Failed to unbundle product (${res.status}).`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err && err.error) errMessage = err.error;
    } catch {
      // ignore
    }
    throw new Error(errMessage);
  }
  window.dispatchEvent(new Event("colophon-inventory-updated"));
  return res.json() as Promise<UnbundleResult>;
}

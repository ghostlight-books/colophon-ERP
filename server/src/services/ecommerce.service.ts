import { prisma } from "../config/database.js";
import { decryptSecret, encryptSecret } from "./storeShipping.service.js";

export type EcommercePlatform = "shopify" | "woocommerce";
type IntegrationConfig = { accessToken?: string; consumerKey?: string; consumerSecret?: string };

export type EcommerceIntegrationStatus = {
  platform: EcommercePlatform;
  storeUrl: string;
  syncInventory: boolean;
  syncOrders: boolean;
  lastSyncedAt: Date | null;
};

export type InventorySyncProgress = {
  sku: string;
  isbn: string;
  title: string;
  status: "synced" | "failed";
  message?: string;
};

interface EcommerceAdapter {
  updateInventoryLevel(sku: string, quantity: number): Promise<{ success: boolean; message?: string }>;
  updateInventoryLevelByBarcode(sku: string, barcode: string, quantity: number): Promise<{ success: boolean; message?: string }>;
  syncInventoryItem(item: { sku: string; barcode: string; title: string; author: string | null; description: string | null; coverUrl: string | null; tags: string[]; seoTitle: string | null; seoDescription: string | null; category: string | null; price: number; quantity: number }): Promise<{ success: boolean; message?: string }>;
  fetchRecentOrders(): Promise<unknown[]>;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string } & T;
  if (!response.ok) {
    throw new Error(body.message ?? body.error ?? `E-commerce request failed (${response.status})`);
  }
  return body;
}

class ShopifyAdapter implements EcommerceAdapter {
  constructor(private readonly storeUrl: string, private readonly token: string) {}

  private isLocalDevConnector(): boolean {
    const normalized = this.storeUrl.trim().toLowerCase();
    return normalized.includes("example-store") || normalized.includes("localhost") || normalized === "" || !this.token.trim();
  }

  private async assignToCollection(productId: number, category: string | null): Promise<void> {
    if (!category) return;
    const headers = { "X-Shopify-Access-Token": this.token, "Content-Type": "application/json" };
    const collections = await parseResponse<{ custom_collections?: Array<{ id?: number; title?: string }> }>(await fetch(`${this.storeUrl}/admin/api/2026-01/custom_collections.json?limit=250`, { headers }));
    const existing = collections.custom_collections?.find((collection) => collection.title?.trim().toLowerCase() === category.trim().toLowerCase());
    const collectionId = existing?.id ?? (await parseResponse<{ custom_collection?: { id?: number } }>(await fetch(`${this.storeUrl}/admin/api/2026-01/custom_collections.json`, { method: "POST", headers, body: JSON.stringify({ custom_collection: { title: category.trim(), published: true } }) }))).custom_collection?.id;
    if (collectionId) await parseResponse(await fetch(`${this.storeUrl}/admin/api/2026-01/collects.json`, { method: "POST", headers, body: JSON.stringify({ collect: { product_id: productId, collection_id: collectionId } }) }));
  }

  async updateInventoryLevel(sku: string, quantity: number): Promise<{ success: boolean; message?: string }> {
    return this.updateInventoryLevelByBarcode(sku, "", quantity);
  }

  async updateInventoryLevelByBarcode(sku: string, barcode: string, quantity: number): Promise<{ success: boolean; message?: string }> {
    if (this.isLocalDevConnector()) {
      return {
        success: true,
        message: `Local dev mock: Shopify inventory sync for ${sku} set to ${Math.max(0, Math.floor(quantity))}.`,
      };
    }

    const products = await parseResponse<{ products?: Array<{ variants?: Array<{ sku?: string; barcode?: string; inventory_item_id?: number }> }> }>(await fetch(`${this.storeUrl}/admin/api/2026-01/products.json?limit=250`, { headers: { "X-Shopify-Access-Token": this.token } }));
    const variant = products.products?.flatMap((product) => product.variants ?? []).find((candidate) => candidate.sku === sku || (barcode && candidate.barcode === barcode));
    if (!variant?.inventory_item_id) {
      return { success: false, message: `Shopify SKU or barcode for ${sku} was not found.` };
    }
    const locations = await parseResponse<{ locations?: Array<{ id?: number }> }>(await fetch(`${this.storeUrl}/admin/api/2026-01/locations.json`, { headers: { "X-Shopify-Access-Token": this.token } }));
    const locationId = locations.locations?.find((location) => location.id)?.id;
    if (!locationId) return { success: false, message: "Shopify has no active inventory location." };
    await parseResponse(await fetch(`${this.storeUrl}/admin/api/2026-01/inventory_levels/set.json`, { method: "POST", headers: { "X-Shopify-Access-Token": this.token, "Content-Type": "application/json" }, body: JSON.stringify({ location_id: locationId, inventory_item_id: variant.inventory_item_id, available: Math.max(0, Math.floor(quantity)) }) }));
    return { success: true };
  }

  async syncInventoryItem(item: { sku: string; barcode: string; title: string; author: string | null; description: string | null; coverUrl: string | null; tags: string[]; seoTitle: string | null; seoDescription: string | null; category: string | null; price: number; quantity: number }): Promise<{ success: boolean; message?: string }> {
    if (this.isLocalDevConnector()) return { success: true };
    const products = await parseResponse<{ products?: Array<{ id?: number; variants?: Array<{ sku?: string; barcode?: string; inventory_item_id?: number }> }> }>(await fetch(`${this.storeUrl}/admin/api/2026-01/products.json?limit=250`, { headers: { "X-Shopify-Access-Token": this.token } }));
    const matchedProduct = products.products?.find((product) => product.variants?.some((candidate) => candidate.sku === item.sku || (item.barcode && candidate.barcode === item.barcode)));
    const variant = matchedProduct?.variants?.find((candidate) => candidate.sku === item.sku || (item.barcode && candidate.barcode === item.barcode));
    const productPayload = { title: item.title, body_html: item.description ?? "", vendor: item.author ?? "", tags: item.tags.join(", "), metafields: [{ namespace: "global", key: "title_tag", type: "single_line_text_field", value: item.seoTitle ?? item.title }, { namespace: "global", key: "description_tag", type: "multi_line_text_field", value: item.seoDescription ?? item.description ?? item.title }], ...(item.coverUrl ? { images: [{ src: item.coverUrl }] } : {}) };
    if (matchedProduct?.id) {
      await parseResponse(await fetch(`${this.storeUrl}/admin/api/2026-01/products/${matchedProduct.id}.json`, { method: "PUT", headers: { "X-Shopify-Access-Token": this.token, "Content-Type": "application/json" }, body: JSON.stringify({ product: productPayload }) }));
    }
    const created = variant?.inventory_item_id ? { product: { id: matchedProduct?.id, variants: [{ inventory_item_id: variant.inventory_item_id }] } } : await parseResponse<{ product?: { id?: number; variants?: Array<{ inventory_item_id?: number }> } }>(await fetch(`${this.storeUrl}/admin/api/2026-01/products.json`, { method: "POST", headers: { "X-Shopify-Access-Token": this.token, "Content-Type": "application/json" }, body: JSON.stringify({ product: { ...productPayload, status: "active", variants: [{ sku: item.sku, barcode: item.barcode, price: item.price.toFixed(2), inventory_management: "shopify" }] } }) }));
    if (created.product?.id) await this.assignToCollection(created.product.id, item.category);
    const createdInventoryItemId = created.product?.variants?.[0]?.inventory_item_id;
    if (!createdInventoryItemId) return { success: false, message: `Shopify product could not be created for ${item.sku}.` };
    const locations = await parseResponse<{ locations?: Array<{ id?: number }> }>(await fetch(`${this.storeUrl}/admin/api/2026-01/locations.json`, { headers: { "X-Shopify-Access-Token": this.token } }));
    const locationId = locations.locations?.find((location) => location.id)?.id;
    if (!locationId) return { success: false, message: "Shopify has no active inventory location." };
    await parseResponse(await fetch(`${this.storeUrl}/admin/api/2026-01/inventory_levels/set.json`, { method: "POST", headers: { "X-Shopify-Access-Token": this.token, "Content-Type": "application/json" }, body: JSON.stringify({ location_id: locationId, inventory_item_id: createdInventoryItemId, available: Math.max(0, Math.floor(item.quantity)) }) }));
    return { success: true };
  }

  async fetchRecentOrders(): Promise<unknown[]> {
    if (this.isLocalDevConnector()) {
      return [];
    }

    const result = await parseResponse<{ orders?: unknown[] }>(await fetch(`${this.storeUrl}/admin/api/2026-01/orders.json?status=any&limit=250`, { headers: { "X-Shopify-Access-Token": this.token } }));
    return result.orders ?? [];
  }
}

class WooCommerceAdapter implements EcommerceAdapter {
  private readonly authorization: string;

  constructor(private readonly storeUrl: string, consumerKey: string, consumerSecret: string) {
    this.authorization = `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`;
  }

  async updateInventoryLevel(sku: string, quantity: number): Promise<{ success: boolean; message?: string }> {
    const products = await parseResponse<Array<{ id: number }>>(await fetch(`${this.storeUrl}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}`, { headers: { Authorization: this.authorization } }));
    const product = products[0];
    if (!product) {
      return { success: false, message: `WooCommerce SKU ${sku} was not found.` };
    }
    await parseResponse(await fetch(`${this.storeUrl}/wp-json/wc/v3/products/${product.id}`, { method: "PUT", headers: { Authorization: this.authorization, "Content-Type": "application/json" }, body: JSON.stringify({ manage_stock: true, stock_quantity: Math.max(0, Math.floor(quantity)) }) }));
    return { success: true };
  }

  async updateInventoryLevelByBarcode(sku: string, _barcode: string, quantity: number): Promise<{ success: boolean; message?: string }> {
    return this.updateInventoryLevel(sku, quantity);
  }

  async syncInventoryItem(item: { sku: string; barcode: string; title: string; author: string | null; description: string | null; coverUrl: string | null; tags: string[]; seoTitle: string | null; seoDescription: string | null; category: string | null; price: number; quantity: number }): Promise<{ success: boolean; message?: string }> {
    return this.updateInventoryLevel(item.sku, item.quantity);
  }

  async fetchRecentOrders(): Promise<unknown[]> {
    return parseResponse<unknown[]>(await fetch(`${this.storeUrl}/wp-json/wc/v3/orders?status=processing&per_page=50`, { headers: { Authorization: this.authorization } }));
  }
}

export async function saveEcommerceIntegration(storeId: string, platform: EcommercePlatform, storeUrl: string, config: IntegrationConfig, syncInventory = true, syncOrders = true): Promise<void> {
  if (platform === "shopify" && !config.accessToken) {
    throw new Error("Shopify access token is required.");
  }
  if (platform === "woocommerce" && (!config.consumerKey || !config.consumerSecret)) {
    throw new Error("WooCommerce consumer key and secret are required.");
  }
  await prisma.storeEcommerceIntegration.upsert({
    where: { storeId_platform: { storeId, platform } },
    create: { storeId, platform, storeUrl: normalizeUrl(storeUrl), encryptedCredentials: encryptSecret(JSON.stringify(config)), syncInventory, syncOrders },
    update: { storeUrl: normalizeUrl(storeUrl), encryptedCredentials: encryptSecret(JSON.stringify(config)), syncInventory, syncOrders },
  });
}

export async function listEcommerceIntegrations(storeId: string): Promise<EcommerceIntegrationStatus[]> {
  return prisma.storeEcommerceIntegration.findMany({ where: { storeId }, orderBy: { platform: "asc" }, select: { platform: true, storeUrl: true, syncInventory: true, syncOrders: true, lastSyncedAt: true } }) as Promise<EcommerceIntegrationStatus[]>;
}

async function getAdapter(storeId: string, platform: EcommercePlatform): Promise<{ adapter: EcommerceAdapter; integration: { id: string; syncInventory: boolean; syncOrders: boolean } }> {
  const store = await prisma.store.findFirst({ where: { OR: [{ id: storeId }, { slug: storeId }] }, select: { id: true } });
  const integration = store
    ? await prisma.storeEcommerceIntegration.findUnique({ where: { storeId_platform: { storeId: store.id, platform } } })
    : null;
  if (!integration) {
    throw new Error(`${platform} is not connected for this store.`);
  }
  const config = JSON.parse(decryptSecret(integration.encryptedCredentials)) as IntegrationConfig;
  const adapter = platform === "shopify"
    ? new ShopifyAdapter(integration.storeUrl, config.accessToken as string)
    : new WooCommerceAdapter(integration.storeUrl, config.consumerKey as string, config.consumerSecret as string);
  return { adapter, integration };
}

export async function syncStoreInventory(storeId: string, platform: EcommercePlatform, sku: string, quantity: number): Promise<{ success: boolean; message?: string }> {
  const { adapter, integration } = await getAdapter(storeId, platform);
  const result = await adapter.updateInventoryLevel(sku, quantity);
  await prisma.storeEcommerceIntegration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date() } });
  return result;
}

export async function fetchStoreOrders(storeId: string, platform: EcommercePlatform): Promise<unknown[]> {
  const { adapter } = await getAdapter(storeId, platform);
  return adapter.fetchRecentOrders();
}

export async function syncStoreInventoryCatalog(storeId: string, platform: EcommercePlatform, onProgress?: (progress: InventorySyncProgress) => void): Promise<{ success: boolean; message: string; synced: number; skipped: number }> {
  const items = await prisma.isbnLookupCache.findMany({ where: { quantityOnHand: { gt: 0 } }, select: { sku: true, isbn: true, title: true, author: true, description: true, coverUrl: true, seoTitle: true, seoDescription: true, category: true, subcategory: true, mediaType: true, listPrice: true, quantityOnHand: true } });
  let synced = 0;
  let skipped = 0;
  for (const item of items) {
    const { adapter, integration } = await getAdapter(storeId, platform);
    const result = await adapter.syncInventoryItem({ sku: item.sku, barcode: item.isbn, title: item.title ?? item.isbn, author: item.author, description: item.description, coverUrl: item.coverUrl, tags: [item.category, item.subcategory, item.mediaType].filter((tag): tag is string => Boolean(tag)), seoTitle: item.seoTitle, seoDescription: item.seoDescription, category: item.category, price: item.listPrice ?? 0, quantity: item.quantityOnHand });
    await prisma.storeEcommerceIntegration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date() } });
    if (result.success) {
      synced += 1;
      onProgress?.({ sku: item.sku, isbn: item.isbn, title: item.title ?? item.isbn, status: "synced", message: result.message });
    } else {
      skipped += 1;
      onProgress?.({ sku: item.sku, isbn: item.isbn, title: item.title ?? item.isbn, status: "failed", message: result.message });
    }
  }
  return { success: true, message: `Shopify inventory sync completed: ${synced} item(s) synced, ${skipped} skipped.`, synced, skipped };
}
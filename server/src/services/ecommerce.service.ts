import { prisma } from "../config/database.js";
import { decryptSecret, encryptSecret } from "./storeShipping.service.js";

export type EcommercePlatform = "shopify" | "woocommerce";
type IntegrationConfig = { accessToken?: string; clientId?: string; clientSecret?: string; consumerKey?: string; consumerSecret?: string };

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
  syncInventoryItem(item: { sku: string; barcode: string; title: string; author: string | null; description: string | null; coverUrl: string | null; tags: string[]; seoTitle: string | null; seoDescription: string | null; category: string | null; price: number; quantity: number; weight?: number | null }): Promise<{ success: boolean; message?: string }>;
  fetchRecentOrders(): Promise<unknown[]>;
  checkConnection(): Promise<{ connected: boolean; message: string }>;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: any = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { message: text };
  }
  if (!response.ok) {
    const errDetail = body.errors
      ? (typeof body.errors === "string" ? body.errors : JSON.stringify(body.errors))
      : (body.message ?? body.error ?? `Request failed (${response.status})`);
    throw new Error(errDetail);
  }
  return body;
}

class ShopifyAdapter implements EcommerceAdapter {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(private readonly storeUrl: string, private readonly token: string, clientId?: string, clientSecret?: string) {
    let url = storeUrl.trim().replace(/\/$/, "");
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    this.baseUrl = url;

    if (clientId && clientSecret) {
      this.headers = {
        Authorization: `Basic ${Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString("base64")}`,
        "Content-Type": "application/json",
      };
    } else if (token.startsWith("Basic ")) {
      this.headers = {
        Authorization: token,
        "Content-Type": "application/json",
      };
    } else {
      this.headers = {
        "X-Shopify-Access-Token": token.trim(),
        "Content-Type": "application/json",
      };
    }
  }

  private isLocalDevConnector(): boolean {
    const normalized = this.baseUrl.toLowerCase();
    return normalized.includes("example-store") || normalized.includes("localhost") || (!this.token.trim() && !this.headers["Authorization"]);
  }

  private async assignToCollection(productId: number, category: string | null): Promise<void> {
    if (!category) return;
    try {
      const collections = await parseResponse<{ custom_collections?: Array<{ id?: number; title?: string }> }>(await fetch(`${this.baseUrl}/admin/api/2024-01/custom_collections.json?limit=250`, { headers: this.headers }));
      const existing = collections.custom_collections?.find((collection) => collection.title?.trim().toLowerCase() === category.trim().toLowerCase());
      const collectionId = existing?.id ?? (await parseResponse<{ custom_collection?: { id?: number } }>(await fetch(`${this.baseUrl}/admin/api/2024-01/custom_collections.json`, { method: "POST", headers: this.headers, body: JSON.stringify({ custom_collection: { title: category.trim(), published: true } }) }))).custom_collection?.id;
      if (collectionId) await parseResponse(await fetch(`${this.baseUrl}/admin/api/2024-01/collects.json`, { method: "POST", headers: this.headers, body: JSON.stringify({ collect: { product_id: productId, collection_id: collectionId } }) }));
    } catch {
      // Collection assignment is optional
    }
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

    const products = await parseResponse<{ products?: Array<{ variants?: Array<{ sku?: string; barcode?: string; inventory_item_id?: number }> }> }>(await fetch(`${this.baseUrl}/admin/api/2024-01/products.json?limit=250`, { headers: this.headers }));
    const variant = products.products?.flatMap((product) => product.variants ?? []).find((candidate) => candidate.sku === sku || (barcode && candidate.barcode === barcode));
    if (!variant?.inventory_item_id) {
      return { success: false, message: `Shopify SKU or barcode for ${sku} was not found.` };
    }
    const locations = await parseResponse<{ locations?: Array<{ id?: number }> }>(await fetch(`${this.baseUrl}/admin/api/2024-01/locations.json`, { headers: this.headers }));
    const locationId = locations.locations?.find((location) => location.id)?.id;
    if (!locationId) return { success: false, message: "Shopify has no active inventory location." };
    await parseResponse(await fetch(`${this.baseUrl}/admin/api/2024-01/inventory_levels/set.json`, { method: "POST", headers: this.headers, body: JSON.stringify({ location_id: locationId, inventory_item_id: variant.inventory_item_id, available: Math.max(0, Math.floor(quantity)) }) }));
    return { success: true };
  }

  async syncInventoryItem(item: { sku: string; barcode: string; title: string; author: string | null; description: string | null; coverUrl: string | null; tags: string[]; seoTitle: string | null; seoDescription: string | null; category: string | null; price: number; quantity: number; weight?: number | null }): Promise<{ success: boolean; message?: string }> {
    if (this.isLocalDevConnector()) return { success: true };
    const products = await parseResponse<{ products?: Array<{ id?: number; variants?: Array<{ id?: number; sku?: string; barcode?: string; inventory_item_id?: number }> }> }>(await fetch(`${this.baseUrl}/admin/api/2024-01/products.json?limit=250`, { headers: this.headers }));
    const matchedProduct = products.products?.find((product) => product.variants?.some((candidate) => candidate.sku === item.sku || (item.barcode && candidate.barcode === item.barcode)));
    const variant = matchedProduct?.variants?.find((candidate) => candidate.sku === item.sku || (item.barcode && candidate.barcode === item.barcode));
    const visibleDescription = [item.author ? `<p><strong>Author:</strong> ${escapeHtml(item.author)}</p>` : "", item.description ? `<p>${escapeHtml(item.description)}</p>` : ""].filter(Boolean).join("");
    const productPayload = {
      title: item.title,
      body_html: visibleDescription,
      vendor: item.author ?? "Unknown Author",
      product_type: "Print Books",
      status: "active",
      published: true,
      published_scope: "global",
      tags: item.tags.join(", "),
      metafields: [
        { namespace: "custom", key: "author", type: "single_line_text_field", value: item.author ?? "" },
        { namespace: "custom", key: "genre", type: "single_line_text_field", value: item.tags[1] ?? "" },
        { namespace: "global", key: "title_tag", type: "single_line_text_field", value: item.seoTitle ?? item.title },
        { namespace: "global", key: "description_tag", type: "multi_line_text_field", value: item.seoDescription ?? item.description ?? item.title },
      ],
      ...(item.coverUrl ? { images: [{ src: item.coverUrl }] } : {}),
    };

    let inventoryItemId: number | undefined = variant?.inventory_item_id;

    if (matchedProduct?.id) {
      await parseResponse(await fetch(`${this.baseUrl}/admin/api/2024-01/products/${matchedProduct.id}.json`, { method: "PUT", headers: this.headers, body: JSON.stringify({ product: productPayload }) }));
      if (variant?.id) {
        await parseResponse(await fetch(`${this.baseUrl}/admin/api/2024-01/variants/${variant.id}.json`, {
          method: "PUT",
          headers: this.headers,
          body: JSON.stringify({
            variant: {
              id: variant.id,
              sku: item.sku,
              barcode: item.barcode,
              price: item.price > 0 ? item.price.toFixed(2) : "14.99",
              weight: item.weight ?? 16,
              weight_unit: "oz",
              inventory_management: "shopify",
              inventory_policy: "deny",
              fulfillment_service: "manual",
              requires_shipping: true,
            },
          }),
        }));
      }
    } else {
      const created = await parseResponse<{ product?: { id?: number; variants?: Array<{ id?: number; inventory_item_id?: number }> } }>(
        await fetch(`${this.baseUrl}/admin/api/2024-01/products.json`, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({
            product: {
              ...productPayload,
              variants: [
                {
                  sku: item.sku,
                  barcode: item.barcode,
                  price: item.price > 0 ? item.price.toFixed(2) : "14.99",
                  weight: item.weight ?? 16,
                  weight_unit: "oz",
                  inventory_management: "shopify",
                  inventory_policy: "deny",
                  fulfillment_service: "manual",
                  requires_shipping: true,
                },
              ],
            },
          }),
        })
      );
      if (created.product?.id) await this.assignToCollection(created.product.id, "Print Books");
      inventoryItemId = created.product?.variants?.[0]?.inventory_item_id;
    }

    if (!inventoryItemId) return { success: false, message: `Shopify product could not be created for ${item.sku}.` };
    const locations = await parseResponse<{ locations?: Array<{ id?: number }> }>(await fetch(`${this.baseUrl}/admin/api/2024-01/locations.json`, { headers: this.headers }));
    const locationId = locations.locations?.find((location) => location.id)?.id;
    if (!locationId) return { success: false, message: "Shopify has no active inventory location." };

    const stockQuantity = Math.max(1, Math.floor(item.quantity));
    await parseResponse(await fetch(`${this.baseUrl}/admin/api/2024-01/inventory_levels/set.json`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ location_id: locationId, inventory_item_id: inventoryItemId, available: stockQuantity }),
    }));

    return { success: true, message: `Synced ${item.title} to Shopify: In Stock (Qty ${stockQuantity}, Category: Print Books)` };
  }

  async fetchRecentOrders(): Promise<unknown[]> {
    if (this.isLocalDevConnector()) {
      return [];
    }

    const result = await parseResponse<{ orders?: unknown[] }>(await fetch(`${this.baseUrl}/admin/api/2024-01/orders.json?status=any&limit=250`, { headers: this.headers }));
    return result.orders ?? [];
  }

  async checkConnection(): Promise<{ connected: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/admin/api/2024-01/shop.json`, {
        headers: this.headers,
      });
      if (!response.ok) {
        const text = await response.text();
        let body: any = {};
        try { body = JSON.parse(text); } catch { body = { message: text }; }
        const reason = body.errors ? (typeof body.errors === "string" ? body.errors : JSON.stringify(body.errors)) : `HTTP ${response.status} (${response.statusText})`;
        return {
          connected: false,
          message: `Shopify check failed: ${reason}. Verify your domain and API credentials.`,
        };
      }
      const data = (await response.json()) as { shop?: { name?: string; myshopify_domain?: string } };
      const storeName = data.shop?.name ?? data.shop?.myshopify_domain ?? this.baseUrl;
      return { connected: true, message: `Connected to Shopify store: ${storeName}` };
    } catch (error) {
      return { connected: false, message: error instanceof Error ? error.message : "Shopify authorization could not be verified." };
    }
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

  async syncInventoryItem(item: { sku: string; barcode: string; title: string; author: string | null; description: string | null; coverUrl: string | null; tags: string[]; seoTitle: string | null; seoDescription: string | null; category: string | null; price: number; quantity: number; weight?: number | null }): Promise<{ success: boolean; message?: string }> {
    return this.updateInventoryLevel(item.sku, item.quantity);
  }

  async fetchRecentOrders(): Promise<unknown[]> {
    return parseResponse<unknown[]>(await fetch(`${this.storeUrl}/wp-json/wc/v3/orders?status=processing&per_page=50`, { headers: { Authorization: this.authorization } }));
  }

  async checkConnection(): Promise<{ connected: boolean; message: string }> {
    return { connected: true, message: "WooCommerce connection is saved." };
  }
}

export async function saveEcommerceIntegration(storeId: string, platform: EcommercePlatform, storeUrl: string, config?: IntegrationConfig, syncInventory = true, syncOrders = true): Promise<void> {
  const store = await prisma.store.upsert({
    where: { slug: storeId },
    update: {},
    create: { slug: storeId, storeName: "Ghostlight Books", ownerEmail: "owner@ghostlightbooks.com" },
  });

  const existing = await prisma.storeEcommerceIntegration.findUnique({
    where: { storeId_platform: { storeId: store.id, platform } },
  });

  let credentialsToStore = existing?.encryptedCredentials;

  if (config && Object.keys(config).length > 0) {
    if (config.accessToken || (config.consumerKey && config.consumerSecret)) {
      credentialsToStore = encryptSecret(JSON.stringify(config));
    }
  }

  if (!credentialsToStore) {
    if (platform === "shopify") {
      throw new Error("Shopify Admin API access token (starts with shpat_) is required.");
    }
    if (platform === "woocommerce") {
      throw new Error("WooCommerce consumer key and secret are required.");
    }
  }

  const formattedUrl = normalizeUrl(storeUrl.startsWith("http") ? storeUrl : `https://${storeUrl}`);

  await prisma.storeEcommerceIntegration.upsert({
    where: { storeId_platform: { storeId: store.id, platform } },
    create: { storeId: store.id, platform, storeUrl: formattedUrl, encryptedCredentials: credentialsToStore!, syncInventory, syncOrders },
    update: { storeUrl: formattedUrl, encryptedCredentials: credentialsToStore!, syncInventory, syncOrders },
  });
}

export async function listEcommerceIntegrations(storeId: string): Promise<EcommerceIntegrationStatus[]> {
  const store = await prisma.store.findFirst({ where: { OR: [{ id: storeId }, { slug: storeId }] } });
  if (!store) return [];
  return prisma.storeEcommerceIntegration.findMany({ where: { storeId: store.id }, orderBy: { platform: "asc" }, select: { platform: true, storeUrl: true, syncInventory: true, syncOrders: true, lastSyncedAt: true } }) as Promise<EcommerceIntegrationStatus[]>;
}

async function getAdapter(storeId?: string, platform: EcommercePlatform = "shopify"): Promise<{ adapter: EcommerceAdapter; integration: { id: string; syncInventory: boolean; syncOrders: boolean } }> {
  let integration = null;
  if (storeId) {
    const store = await prisma.store.findFirst({ where: { OR: [{ id: storeId }, { slug: storeId }] }, select: { id: true } });
    if (store) {
      integration = await prisma.storeEcommerceIntegration.findUnique({ where: { storeId_platform: { storeId: store.id, platform } } });
    }
  }
  if (!integration) {
    integration = await prisma.storeEcommerceIntegration.findFirst({ where: { platform } });
  }
  if (!integration) {
    throw new Error(`${platform} is not connected for this store.`);
  }
  const config = JSON.parse(decryptSecret(integration.encryptedCredentials)) as IntegrationConfig;
  const adapter = platform === "shopify"
    ? new ShopifyAdapter(integration.storeUrl, config.accessToken ?? "", config.clientId, config.clientSecret)
    : new WooCommerceAdapter(integration.storeUrl, config.consumerKey as string, config.consumerSecret as string);
  return { adapter, integration };
}

type InventorySyncRecord = {
  sku: string;
  isbn: string;
  title: string | null;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  catalogTags: string | null;
  category: string | null;
  subcategory: string | null;
  mediaType: string;
  listPrice: number | null;
  quantityOnHand: number;
  weight?: number | null;
};

function mapInventoryRecord(item: InventorySyncRecord) {
  const genreTag = item.subcategory ?? "";
  const tags = ["Print Books", genreTag, item.mediaType, ...(item.catalogTags ?? "").split(","), ...(item.seoKeywords ?? "").split(",")]
    .filter((tag): tag is string => Boolean(tag?.trim()))
    .map((tag) => tag.trim())
    .filter((tag, index, all) => all.indexOf(tag) === index);
  return {
    sku: item.sku,
    barcode: item.isbn,
    title: item.title ?? item.isbn,
    author: item.author,
    description: item.description,
    coverUrl: item.coverUrl,
    tags,
    seoTitle: item.seoTitle,
    seoDescription: item.seoDescription,
    category: "Print Books",
    price: item.listPrice && item.listPrice > 0 ? item.listPrice : 14.99,
    quantity: Math.max(1, item.quantityOnHand),
    weight: item.weight ?? 16,
  };
}

export async function syncInventoryItemByIsbn(storeId: string, isbn: string): Promise<{ success: boolean; message?: string }> {
  const item = await prisma.isbnLookupCache.findUnique({ where: { isbn }, select: { sku: true, isbn: true, title: true, author: true, description: true, coverUrl: true, seoTitle: true, seoDescription: true, seoKeywords: true, catalogTags: true, category: true, subcategory: true, mediaType: true, listPrice: true, quantityOnHand: true, weight: true } });
  if (!item) return { success: false, message: `Inventory record for ${isbn} was not found.` };
  const { adapter, integration } = await getAdapter(storeId, "shopify");
  if (!integration.syncInventory) return { success: false, message: "Shopify inventory sync is disabled for this store." };
  const result = await adapter.syncInventoryItem(mapInventoryRecord(item));
  await prisma.storeEcommerceIntegration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date() } });
  return result;
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
  const items = await prisma.isbnLookupCache.findMany({ where: { quantityOnHand: { gt: 0 } }, select: { sku: true, isbn: true, title: true, author: true, description: true, coverUrl: true, seoTitle: true, seoDescription: true, seoKeywords: true, catalogTags: true, category: true, subcategory: true, mediaType: true, listPrice: true, quantityOnHand: true, weight: true } });
  let synced = 0;
  let skipped = 0;
  for (const item of items) {
    const { adapter, integration } = await getAdapter(storeId, platform);
    const result = await adapter.syncInventoryItem(mapInventoryRecord(item));
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

export async function checkStoreConnection(storeId: string, platform: EcommercePlatform): Promise<{ connected: boolean; message: string }> {
  const { adapter } = await getAdapter(storeId, platform);
  return adapter.checkConnection();
}

export async function syncProductBundleToShopify(
  storeId: string,
  bundleIdOrSku: string
): Promise<{ success: boolean; message?: string }> {
  const bundle = await prisma.productBundle.findFirst({
    where: {
      OR: [{ id: bundleIdOrSku }, { parentSku: bundleIdOrSku }],
    },
    include: { items: true },
  });

  if (!bundle) {
    return { success: false, message: `Product bundle ${bundleIdOrSku} was not found.` };
  }

  const { adapter, integration } = await getAdapter(storeId, "shopify");
  if (!integration.syncInventory) {
    return { success: false, message: "Shopify inventory sync is disabled for this store." };
  }

  const uniqueAuthors = Array.from(new Set(bundle.items.map((i) => i.author).filter(Boolean)));
  const vendorName = uniqueAuthors.length > 0 ? uniqueAuthors.slice(0, 2).join(" & ") : "Ghostlight Bundles";

  // Build rich HTML bundle description with all titles
  const booksListHtml = bundle.items
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.title)}</strong>${item.author ? ` by ${escapeHtml(item.author)}` : ""}${item.condition ? ` &mdash; <em>${escapeHtml(item.condition)} Condition</em>` : ""} (Individual: $${item.listPrice.toFixed(2)})</li>`
    )
    .join("\n");

  const fullDescriptionHtml = `
<div class="product-bundle-container" style="font-family: inherit; line-height: 1.6;">
  <p>${escapeHtml(bundle.description || `Curated special value book bundle featuring ${bundle.items.length} titles.`)}</p>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px 18px; border-radius: 10px; margin: 16px 0;">
    <h4 style="margin: 0 0 10px 0; color: #0f172a; font-size: 15px;">Included in this Curated Bundle (${bundle.items.length} Books):</h4>
    <ul style="margin: 0; padding-left: 20px; color: #334155;">
      ${booksListHtml}
    </ul>
  </div>
  <p style="font-size: 14px; color: #059669; font-weight: 600;">
    Bundle Special Price: $${bundle.bundlePrice.toFixed(2)} &bull; Save $${bundle.savingsAmount.toFixed(2)} (${bundle.discountPercent}% Off Total Retail $${bundle.originalTotalPrice.toFixed(2)})
  </p>
</div>
  `.trim();

  const primaryCover = bundle.items.find((i) => Boolean(i.coverUrl))?.coverUrl || null;
  const tags = [
    "Book Bundles",
    "Curated Bundle",
    bundle.topic || "Curated Set",
    `${bundle.items.length} Book Bundle`,
    "Special Value Set",
  ].filter(Boolean);

  const bundlePayload = {
    sku: bundle.parentSku,
    barcode: bundle.parentSku,
    title: bundle.title,
    author: vendorName,
    description: fullDescriptionHtml,
    coverUrl: primaryCover,
    tags,
    seoTitle: `${bundle.title} | Curated Book Bundle`,
    seoDescription: `Save with this curated ${bundle.items.length}-book set: ${bundle.items.map((i) => i.title).slice(0, 3).join(", ")}.`,
    category: "Book Bundles",
    price: bundle.bundlePrice,
    quantity: bundle.status === "ACTIVE" ? Math.max(1, bundle.quantityOnHand) : 0,
    weight: bundle.items.length * 16,
  };

  const result = await adapter.syncInventoryItem(bundlePayload);
  await prisma.storeEcommerceIntegration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date() } });

  // When bundle is active, take child items off individual Shopify sale
  if (bundle.status === "ACTIVE") {
    for (const child of bundle.items) {
      void adapter.updateInventoryLevelByBarcode(child.sku, child.isbn, 0).catch(() => null);
    }
  }

  return result;
}
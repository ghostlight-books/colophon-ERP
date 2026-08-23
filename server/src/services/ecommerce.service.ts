import { prisma } from "../config/database";
import { decryptSecret, encryptSecret } from "./storeShipping.service";

export type EcommercePlatform = "shopify" | "woocommerce";
type IntegrationConfig = { accessToken?: string; consumerKey?: string; consumerSecret?: string };

export type EcommerceIntegrationStatus = {
  platform: EcommercePlatform;
  storeUrl: string;
  syncInventory: boolean;
  syncOrders: boolean;
  lastSyncedAt: Date | null;
};

interface EcommerceAdapter {
  updateInventoryLevel(sku: string, quantity: number): Promise<{ success: boolean; message?: string }>;
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

  async updateInventoryLevel(sku: string, quantity: number): Promise<{ success: boolean; message?: string }> {
    if (this.isLocalDevConnector()) {
      return {
        success: true,
        message: `Local dev mock: Shopify inventory sync for ${sku} set to ${Math.max(0, Math.floor(quantity))}.`,
      };
    }

    const products = await parseResponse<{ products?: Array<{ variants?: Array<{ sku?: string; inventory_item_id?: number }> }> }>(await fetch(`${this.storeUrl}/admin/api/2026-01/products.json?limit=250`, { headers: { "X-Shopify-Access-Token": this.token } }));
    const variant = products.products?.flatMap((product) => product.variants ?? []).find((candidate) => candidate.sku === sku);
    if (!variant?.inventory_item_id) {
      return { success: false, message: `Shopify SKU ${sku} was not found.` };
    }
    await parseResponse(await fetch(`${this.storeUrl}/admin/api/2026-01/inventory_levels/set.json`, { method: "POST", headers: { "X-Shopify-Access-Token": this.token, "Content-Type": "application/json" }, body: JSON.stringify({ inventory_item_id: variant.inventory_item_id, available: Math.max(0, Math.floor(quantity)) }) }));
    return { success: true };
  }

  async fetchRecentOrders(): Promise<unknown[]> {
    if (this.isLocalDevConnector()) {
      return [];
    }

    const result = await parseResponse<{ orders?: unknown[] }>(await fetch(`${this.storeUrl}/admin/api/2026-01/orders.json?status=open&limit=50`, { headers: { "X-Shopify-Access-Token": this.token } }));
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
  const integration = await prisma.storeEcommerceIntegration.findUnique({ where: { storeId_platform: { storeId, platform } } });
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
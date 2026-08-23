import { randomBytes } from "node:crypto";

import { env } from "../config/env.js";
import { saveEcommerceIntegration } from "./ecommerce.service.js";

const pendingStates = new Map<string, { storeId: string; shop: string; expiresAt: number }>();
const scopes = "read_products,write_products,read_inventory,write_inventory,read_orders,write_fulfillments";

function normalizeShop(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function createShopifyInstallUrl(storeId: string, shopInput: string): string {
  if (!env.SHOPIFY_API_KEY || !env.SHOPIFY_API_SECRET) {
    throw new Error("Shopify OAuth is not configured. Add SHOPIFY_API_KEY and SHOPIFY_API_SECRET.");
  }
  const shop = normalizeShop(shopInput);
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error("Enter a valid your-store.myshopify.com domain.");
  }
  const state = randomBytes(24).toString("base64url");
  pendingStates.set(state, { storeId, shop, expiresAt: Date.now() + 10 * 60 * 1000 });
  const callback = `${env.SHOPIFY_APP_URL.replace(/\/$/, "")}/api/auth/shopify/callback`;
  const params = new URLSearchParams({ client_id: env.SHOPIFY_API_KEY, scope: scopes, redirect_uri: callback, state });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export async function completeShopifyInstall(code: string, state: string, shopInput: string): Promise<string> {
  const pending = pendingStates.get(state);
  pendingStates.delete(state);
  const shop = normalizeShop(shopInput);
  if (!pending || pending.expiresAt < Date.now() || pending.shop !== shop || !env.SHOPIFY_API_KEY || !env.SHOPIFY_API_SECRET) {
    throw new Error("Shopify installation state is invalid or expired.");
  }
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env.SHOPIFY_API_KEY, client_secret: env.SHOPIFY_API_SECRET, code }) });
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !payload.access_token) throw new Error("Shopify authorization could not be completed.");
  await saveEcommerceIntegration(pending.storeId, "shopify", `https://${shop}`, { accessToken: payload.access_token });
  return pending.storeId;
}
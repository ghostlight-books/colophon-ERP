import { randomBytes } from "node:crypto";

import { env } from "../config/env.js";
import { prisma } from "../config/database.js";
import { saveEcommerceIntegration } from "./ecommerce.service.js";
import { decryptSecret } from "./storeShipping.service.js";

const scopes = "read_products,write_products,read_inventory,write_inventory,read_orders,write_fulfillments,read_locations";

function normalizeShop(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export async function createShopifyInstallUrl(storeId: string, shopInput: string, clientId?: string, clientSecret?: string): Promise<string> {
  const shop = normalizeShop(shopInput);
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error("Enter a valid your-store.myshopify.com domain.");
  }

  if (clientId && clientSecret) {
    const store = await prisma.store.upsert({
      where: { slug: storeId },
      update: {},
      create: { slug: storeId, storeName: shop.replace(".myshopify.com", ""), ownerEmail: "owner@ghostlightbooks.com" },
    });
    await saveEcommerceIntegration(store.id, "shopify", `https://${shop}`, { clientId, clientSecret, accessToken: "pending" });
  }

  const effectiveClientId = clientId || env.SHOPIFY_API_KEY;
  if (!effectiveClientId) {
    throw new Error("Shopify Client ID / API Key is required.");
  }

  const state = randomBytes(24).toString("base64url");
  await prisma.shopifyOAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.shopifyOAuthState.create({ data: { state, storeId, shop, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
  const callback = `${env.SHOPIFY_APP_URL.replace(/\/$/, "")}/api/auth/shopify/callback`;
  const params = new URLSearchParams({ client_id: effectiveClientId, scope: scopes, redirect_uri: callback, state });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export async function completeShopifyInstall(code: string, state: string, shopInput: string): Promise<string> {
  const shop = normalizeShop(shopInput);
  const pending = await prisma.shopifyOAuthState.findUnique({ where: { state } });
  await prisma.shopifyOAuthState.deleteMany({ where: { state } });
  if (!pending || pending.expiresAt < new Date() || pending.shop !== shop) {
    throw new Error("Shopify installation state is invalid or expired.");
  }

  const store = await prisma.store.findFirst({ where: { OR: [{ id: pending.storeId }, { slug: pending.storeId }] } });
  let clientId = env.SHOPIFY_API_KEY;
  let clientSecret = env.SHOPIFY_API_SECRET;

  if (store) {
    const integration = await prisma.storeEcommerceIntegration.findUnique({ where: { storeId_platform: { storeId: store.id, platform: "shopify" } } });
    if (integration?.encryptedCredentials) {
      const config = JSON.parse(decryptSecret(integration.encryptedCredentials)) as { clientId?: string; clientSecret?: string };
      if (config.clientId) clientId = config.clientId;
      if (config.clientSecret) clientSecret = config.clientSecret;
    }
  }

  if (!clientId || !clientSecret) {
    throw new Error("Shopify Client ID and Secret were not configured.");
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; errors?: any };
  if (!response.ok || !payload.access_token) {
    const err = payload.errors ? (typeof payload.errors === "string" ? payload.errors : JSON.stringify(payload.errors)) : "Shopify authorization could not be completed.";
    throw new Error(err);
  }

  const targetStore = store ?? await prisma.store.upsert({
    where: { slug: pending.storeId },
    update: {},
    create: { slug: pending.storeId, storeName: shop.replace(".myshopify.com", ""), ownerEmail: "owner@ghostlightbooks.com" },
  });

  await saveEcommerceIntegration(targetStore.id, "shopify", `https://${shop}`, { accessToken: payload.access_token, clientId, clientSecret });
  return pending.storeId;
}
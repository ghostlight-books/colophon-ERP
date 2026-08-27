import crypto from "crypto";
import { prisma } from "../../config/database.js";
import { env } from "../../config/env.js";
import { decryptSecret, encryptSecret } from "../storeShipping.service.js";

export interface EbayTokenData {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: number; // timestamp in ms
  tokenType: string;
}

export function getEbayEnvironment(storeEnv?: string): "sandbox" | "production" {
  const selected = storeEnv || env.EBAY_ENVIRONMENT || "sandbox";
  return selected === "production" ? "production" : "sandbox";
}

export function getEbayBaseUrls(environment: "sandbox" | "production") {
  if (environment === "production") {
    return {
      authUrl: "https://auth.ebay.com/oauth2/authorize",
      apiBase: "https://api.ebay.com",
      identityBase: "https://api.ebay.com/identity/v1/oauth2/token",
    };
  }
  return {
    authUrl: "https://auth.sandbox.ebay.com/oauth2/authorize",
    apiBase: "https://api.sandbox.ebay.com",
    identityBase: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
  };
}

export const EBAY_OAUTH_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/buy.browse",
];

export async function createEbayAuthUrl(
  storeId: string,
  customClientId?: string,
  customRuName?: string,
  environmentOverride?: "sandbox" | "production"
): Promise<{ url: string; state: string }> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    include: { ebayConfig: true },
  });
  const storePk = store?.id ?? storeId;

  const envMode = environmentOverride || getEbayEnvironment(store?.ebayConfig?.environment);
  const clientId = customClientId || store?.ebayConfig?.appId || env.EBAY_APP_ID;
  const ruName = customRuName || store?.ebayConfig?.ruName || env.EBAY_REDIRECT_URI;

  if (!clientId || !ruName) {
    throw new Error("eBay App ID (Client ID) and RuName (Redirect URI) are required to initiate OAuth.");
  }

  const { authUrl } = getEbayBaseUrls(envMode);
  const state = crypto.randomBytes(24).toString("hex");

  // Persist state in DB for callback verification
  await prisma.shopifyOAuthState.upsert({
    where: { state },
    create: {
      state,
      storeId: storePk,
      shop: `ebay_${envMode}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
    },
    update: {
      storeId: storePk,
      shop: `ebay_${envMode}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  const params = new URLSearchParams({
    client_id: clientId.trim(),
    response_type: "code",
    redirect_uri: ruName.trim(),
    scope: EBAY_OAUTH_SCOPES.join(" "),
    state: `ebay_${storePk}_${state}`,
    prompt: "login",
  });

  return {
    url: `${authUrl}?${params.toString()}`,
    state,
  };
}

export async function exchangeEbayCode(
  code: string,
  storeId: string,
  customClientId?: string,
  customClientSecret?: string,
  customRuName?: string,
  environmentOverride?: "sandbox" | "production"
): Promise<EbayTokenData> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    include: { ebayConfig: true },
  });
  const storePk = store?.id ?? storeId;

  const envMode = environmentOverride || getEbayEnvironment(store?.ebayConfig?.environment);
  const clientId = customClientId || store?.ebayConfig?.appId || env.EBAY_APP_ID;
  const clientSecret = customClientSecret || store?.ebayConfig?.certId || env.EBAY_CERT_ID;
  const ruName = customRuName || store?.ebayConfig?.ruName || env.EBAY_REDIRECT_URI;

  if (!clientId || !clientSecret || !ruName) {
    throw new Error("eBay App ID, Cert ID (Secret), and RuName are required for token exchange.");
  }

  const { identityBase } = getEbayBaseUrls(envMode);
  const basicAuth = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: code.trim(),
    redirect_uri: ruName.trim(),
  });

  const response = await fetch(identityBase, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`eBay Token Exchange failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number; // in seconds
    token_type: string;
  };

  const tokenData: EbayTokenData = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: Date.now() + (data.expires_in - 300) * 1000, // 5 min safety buffer
    tokenType: data.token_type || "User Access Token",
  };

  // Securely persist in DB
  const encrypted = encryptSecret(JSON.stringify(tokenData));

  await prisma.ebayIntegrationConfig.upsert({
    where: { storeId: storePk },
    create: {
      storeId: storePk,
      environment: envMode,
      appId: clientId.trim(),
      certId: clientSecret.trim(),
      ruName: ruName.trim(),
      encryptedTokens: encrypted,
      syncEnabled: true,
    },
    update: {
      environment: envMode,
      appId: clientId.trim(),
      certId: clientSecret.trim(),
      ruName: ruName.trim(),
      encryptedTokens: encrypted,
    },
  });

  return tokenData;
}

export async function refreshEbayAccessToken(storeId: string): Promise<string> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    include: { ebayConfig: true },
  });
  if (!store || !store.ebayConfig || !store.ebayConfig.encryptedTokens) {
    throw new Error("eBay is not configured or authenticated for this store.");
  }

  const tokenData = JSON.parse(decryptSecret(store.ebayConfig.encryptedTokens)) as EbayTokenData;
  if (!tokenData.refreshToken) {
    throw new Error("No eBay refresh token found. Please re-authorize the application.");
  }

  const envMode = getEbayEnvironment(store.ebayConfig.environment);
  const clientId = store.ebayConfig.appId || env.EBAY_APP_ID;
  const clientSecret = store.ebayConfig.certId || env.EBAY_CERT_ID;

  if (!clientId || !clientSecret) {
    throw new Error("Missing eBay Client ID or Client Secret.");
  }

  const { identityBase } = getEbayBaseUrls(envMode);
  const basicAuth = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokenData.refreshToken,
    scope: EBAY_OAUTH_SCOPES.join(" "),
  });

  const response = await fetch(identityBase, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`eBay Token Refresh failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  const updatedTokenData: EbayTokenData = {
    ...tokenData,
    accessToken: data.access_token,
    tokenExpiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  await prisma.ebayIntegrationConfig.update({
    where: { storeId: store.id },
    data: {
      encryptedTokens: encryptSecret(JSON.stringify(updatedTokenData)),
    },
  });

  return updatedTokenData.accessToken;
}

export async function getValidEbayAccessToken(storeId: string): Promise<{ token: string; environment: "sandbox" | "production" }> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    include: { ebayConfig: true },
  });

  if (!store?.ebayConfig?.encryptedTokens) {
    throw new Error("eBay is not connected for this store. Please connect via OAuth.");
  }

  const tokenData = JSON.parse(decryptSecret(store.ebayConfig.encryptedTokens)) as EbayTokenData;
  const envMode = getEbayEnvironment(store.ebayConfig.environment);

  if (Date.now() >= tokenData.tokenExpiresAt) {
    const refreshedToken = await refreshEbayAccessToken(store.id);
    return { token: refreshedToken, environment: envMode };
  }

  return { token: tokenData.accessToken, environment: envMode };
}

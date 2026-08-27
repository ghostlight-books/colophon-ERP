import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "../config/env.js";
import { prisma } from "../config/database.js";

function encryptionKey(): Buffer {
  const secret = env.CREDENTIAL_ENCRYPTION_KEY || env.DATABASE_URL || "colophon-erp-default-encryption-salt-2026";
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buffer = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8");
}

export async function saveStoreUspsAccount(storeId: string, clientId: string, clientSecret: string, originAddress?: string): Promise<void> {
  if (!storeId.trim() || !clientId.trim() || !clientSecret.trim()) {
    throw new Error("Store ID, USPS client ID, and USPS client secret are required.");
  }
  await prisma.storeShippingAccount.upsert({
    where: { storeId },
    create: { storeId, clientId: clientId.trim(), encryptedSecret: encryptSecret(clientSecret), originAddress: originAddress?.trim() || null },
    update: { clientId: clientId.trim(), encryptedSecret: encryptSecret(clientSecret), originAddress: originAddress?.trim() || null, active: true },
  });
}

export async function getStoreUspsAccountStatus(storeId: string): Promise<{ connected: boolean; provider: "usps"; originAddress: string | null }> {
  const account = await prisma.storeShippingAccount.findUnique({ where: { storeId } });
  return { connected: Boolean(account?.active), provider: "usps", originAddress: account?.originAddress ?? null };
}
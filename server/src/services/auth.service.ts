import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { prisma } from "../config/database.js";

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) {
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createUser(email: string, displayName: string, password: string): Promise<{ id: string; email: string; displayName: string }> {
  if (!email.includes("@") || displayName.trim().length < 1 || password.length < 12) {
    throw new Error("A valid email, display name, and password of at least 12 characters are required.");
  }
  const user = await prisma.user.create({ data: { email: email.trim().toLowerCase(), displayName: displayName.trim(), passwordHash: await hashPassword(password) } });
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function signIn(email: string, password: string): Promise<{ token: string; userId: string; storeId: string | null; role: string | null }> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { memberships: { orderBy: { createdAt: "asc" } } } });
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password.");
  }
  const token = randomBytes(32).toString("base64url");
  await prisma.authSession.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000) } });
  const membership = user.memberships[0];
  return { token, userId: user.id, storeId: membership?.storeId ?? null, role: membership?.role ?? null };
}

export async function resolveSession(token: string): Promise<{ userId: string; storeId: string; role: string } | null> {
  const session = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { memberships: true } } } });
  const membership = session?.user.memberships[0];
  if (!session || session.expiresAt <= new Date() || !session.user.isActive || !membership) {
    return null;
  }
  return { userId: session.userId, storeId: membership.storeId, role: membership.role };
}

export async function createStoreImpersonationSession(storeId: string): Promise<string> {
  const membership = await prisma.storeMembership.findFirst({ where: { storeId, role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!membership) {
    throw new Error("No store administrator is available for impersonation.");
  }
  const token = randomBytes(32).toString("base64url");
  await prisma.authSession.create({ data: { tokenHash: hashToken(token), userId: membership.userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
  return token;
}
import cors from "cors";
import express from "express";
import type { Prisma } from "@prisma/client";

import { errorMiddleware } from "./middleware/error.middleware.js";
import { env } from "./config/env.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { requireSuperAdmin, tenantContext } from "./middleware/tenantContext.js";
import { createStoreImpersonationSession, createUser, signIn } from "./services/auth.service.js";
import { prisma } from "./config/database.js";
import { lookupBookByIsbn, pullOpenLibraryMetadata, autoCorrectIsbn } from "./services/isbnScanner.service.js";
import { createSquareCheckoutLink, isSquareConfigured } from "./services/squarePayment.service.js";
import { executeDropshipSettlement } from "./services/networkSettlement.service.js";
import { getStoreUspsAccountStatus, saveStoreUspsAccount } from "./services/storeShipping.service.js";
import { checkStoreConnection, fetchStoreOrders, listEcommerceIntegrations, saveEcommerceIntegration, syncInventoryItemByIsbn, syncStoreInventory, syncStoreInventoryCatalog, type EcommercePlatform } from "./services/ecommerce.service.js";
import { completeShopifyInstall, createShopifyInstallUrl } from "./services/shopifyOAuth.service.js";
import { createEbayAuthUrl, exchangeEbayCode, saveDirectEbayToken, getValidEbayAccessToken } from "./services/ebay/ebayAuth.service.js";
import { publishBookToEbay, withdrawOffer } from "./services/ebay/ebayInventory.service.js";
import { scanInventoryOpportunities } from "./services/recommendations/ebayOpportunity.service.js";
import { runRulesEvaluationForStore } from "./services/rules/ebayRules.service.js";
import { processEbayWebhookEvent, handleEbayWebhookChallenge } from "./services/ebay/ebayWebhook.service.js";
import { acquireReservationLock, releaseReservationLock, handleLocalSaleAndSync } from "./services/inventory/concurrency.service.js";
import { autoSelectShippingRate, quoteAllShippingRates } from "./services/shipping/shippingRate.service.js";
import { resolveBookDimensions } from "./services/isbn/dimensions.service.js";
import { validateBuyingSearchParams, searchBuyingEditions, evaluateBuyingBook, processBuyingBatch } from "./services/buying.service.js";
import {
  calculateSuggestedBundlePrice,
  searchAvailableItemsForBundling,
  createProductBundle,
  unbundleProduct,
  listProductBundles,
} from "./services/bundle.service.js";

type OpsConnector = {
  key: string;
  label: string;
  route: string;
  connected: boolean;
  note: string;
};

type OpsTask = {
  id: string;
  title: string;
  owner: string;
  done: boolean;
};

type PosCategoryTile = {
  id: string;
  label: string;
  itemCount: number;
  color: string;
};

type PosProduct = {
  id: string;
  title: string;
  category: string;
  image: string;
  price: number;
  stock: number;
};

type PosCartItem = {
  id: string;
  title: string;
  option: string;
  qty: number;
  unitPrice: number;
};

type PosTenderType = "cash" | "card" | "cashapp" | "po" | "storecredit";

type CustomerCreditAccount = {
  id: string;
  name: string;
  email: string;
  phone: string;
  storeCreditBalance: number;
};

type PosStore = {
  checkNumber: number;
  taxRate: number;
  tabs: string[];
  categoryTiles: PosCategoryTile[];
  products: PosProduct[];
  cart: PosCartItem[];
};

type MarketingPlatformKey = "instagram" | "facebook" | "x" | "tiktok";

type MarketingConnection = {
  key: MarketingPlatformKey;
  label: string;
  connected: boolean;
  handle: string;
  followers: number;
  impressions7d: number;
  engagementRate: number;
};

type MarketingPost = {
  id: string;
  platform: MarketingPlatformKey;
  message: string;
  status: "published" | "queued" | "scheduled";
  publishedAt: string;
  scheduledFor?: string;
};

type MarketingStore = {
  connections: MarketingConnection[];
  posts: MarketingPost[];
};

const operationsStore: {
  connectors: OpsConnector[];
  tasks: OpsTask[];
} = {
  connectors: [
    {
      key: "intake",
      label: "Intake Scanner",
      route: "/intake",
      connected: true,
      note: "Scan queue and ISBN matching",
    },
    {
      key: "pos",
      label: "POS Register",
      route: "/pos-register",
      connected: true,
      note: "Checkout and cart operations",
    },
    {
      key: "sales",
      label: "Sales Pipeline",
      route: "/sales",
      connected: false,
      note: "Orders, invoices, and returns",
    },
    {
      key: "finance",
      label: "Finance Posting",
      route: "/finance",
      connected: false,
      note: "Reconcile and payables",
    },
    {
      key: "square",
      label: "Square Payments",
      route: "/operations",
      connected: false,
      note: "Hosted checkout and payment processing",
    },
  ],
  tasks: [
    { id: "OPS-100", title: "Verify scanner station calibration", owner: "Avery", done: false },
    { id: "OPS-101", title: "Map POS payment types to finance", owner: "Sarah", done: false },
    { id: "OPS-102", title: "Review rejected intake batches", owner: "Mina", done: true },
  ],
};

const posStore: PosStore = {
  checkNumber: 14,
  taxRate: 0.085,
  tabs: ["Keypad", "Library", "Fiction", "Non-Fiction", "Merchandise", "Discounts"],
  categoryTiles: [
    { id: "c-1", label: "Staff Picks", itemCount: 9, color: "bg-orange-500" },
    { id: "c-2", label: "New Releases", itemCount: 6, color: "bg-blue-600" },
    { id: "c-3", label: "Book Club", itemCount: 5, color: "bg-fuchsia-600" },
    { id: "c-4", label: "Discounts", itemCount: 12, color: "bg-emerald-600" },
    { id: "c-5", label: "Used Books", itemCount: 22, color: "bg-rose-600" },
    { id: "c-6", label: "Gifts", itemCount: 14, color: "bg-cyan-600" },
  ],
  products: [
    {
      id: "p-1",
      title: "Tomorrow, and Tomorrow, and Tomorrow",
      category: "Fiction",
      image: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=600&q=80&auto=format&fit=crop",
      price: 18,
      stock: 24,
    },
    {
      id: "p-2",
      title: "The Heaven & Earth Grocery Store",
      category: "Fiction",
      image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80&auto=format&fit=crop",
      price: 17,
      stock: 11,
    },
    {
      id: "p-3",
      title: "The Wager",
      category: "Non-Fiction",
      image: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&q=80&auto=format&fit=crop",
      price: 21,
      stock: 8,
    },
    {
      id: "p-4",
      title: "Demon Copperhead",
      category: "Fiction",
      image: "https://images.unsplash.com/photo-1526243741027-444d633d7365?w=600&q=80&auto=format&fit=crop",
      price: 19,
      stock: 16,
    },
    {
      id: "p-5",
      title: "Ghostlight Tote Bag",
      category: "Merchandise",
      image: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=600&q=80&auto=format&fit=crop",
      price: 14,
      stock: 31,
    },
    {
      id: "p-6",
      title: "Reading Journal",
      category: "Merchandise",
      image: "https://images.unsplash.com/photo-1455885666463-9f41deb48f6a?w=600&q=80&auto=format&fit=crop",
      price: 12,
      stock: 19,
    },
    {
      id: "p-7",
      title: "Bel Canto",
      category: "Fiction",
      image: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&q=80&auto=format&fit=crop",
      price: 15,
      stock: 13,
    },
    {
      id: "p-8",
      title: "The Body Keeps the Score",
      category: "Non-Fiction",
      image: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=600&q=80&auto=format&fit=crop",
      price: 20,
      stock: 9,
    },
  ],
  cart: [
    { id: "p-1", title: "Tomorrow, and Tomorrow, and Tomorrow", option: "Hardcover", qty: 1, unitPrice: 18 },
    { id: "p-5", title: "Ghostlight Tote Bag", option: "Canvas - Large", qty: 2, unitPrice: 14 },
    { id: "p-8", title: "The Body Keeps the Score", option: "Used - Good", qty: 1, unitPrice: 12 },
  ],
};

const customerCreditStore: CustomerCreditAccount[] = [
  { id: "cust-100", name: "Harper Quinn", email: "harper@example.com", phone: "(615) 555-0130", storeCreditBalance: 64.5 },
  { id: "cust-101", name: "Eli Thomas", email: "eli@example.com", phone: "(615) 555-0184", storeCreditBalance: 21.25 },
  { id: "cust-102", name: "Mara Stein", email: "mara@example.com", phone: "(615) 555-0152", storeCreditBalance: 142.0 },
  { id: "cust-103", name: "Jordan Lee", email: "jordan@example.com", phone: "(615) 555-0101", storeCreditBalance: 8.75 },
];

const marketingStore: MarketingStore = {
  connections: [
    {
      key: "instagram",
      label: "Instagram",
      connected: true,
      handle: "@ghostlightbooks",
      followers: 12420,
      impressions7d: 18900,
      engagementRate: 4.2,
    },
    {
      key: "facebook",
      label: "Facebook",
      connected: true,
      handle: "Ghostlight Books",
      followers: 8130,
      impressions7d: 11220,
      engagementRate: 2.8,
    },
    {
      key: "x",
      label: "X",
      connected: false,
      handle: "@ghostlightbooks",
      followers: 2410,
      impressions7d: 0,
      engagementRate: 0,
    },
    {
      key: "tiktok",
      label: "TikTok",
      connected: false,
      handle: "@ghostlightreads",
      followers: 1640,
      impressions7d: 0,
      engagementRate: 0,
    },
  ],
  posts: [
    {
      id: "MKT-100",
      platform: "instagram",
      message: "Signed copies of this month’s book club pick are now in stock.",
      status: "published",
      publishedAt: "2026-08-18T14:05:00.000Z",
    },
    {
      id: "MKT-101",
      platform: "facebook",
      message: "Weekend event: local author Q&A this Saturday at 2 PM.",
      status: "published",
      publishedAt: "2026-08-17T18:20:00.000Z",
    },
  ],
};

function getNextTaskId(tasks: OpsTask[]): string {
  const numeric = tasks
    .map((task) => Number(task.id.replace("OPS-", "")))
    .filter((value) => Number.isFinite(value));
  const max = numeric.length > 0 ? Math.max(...numeric) : 99;
  return `OPS-${max + 1}`;
}

function getPosTotals(store: PosStore): { subtotal: number; tax: number; total: number } {
  const subtotal = store.cart.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const tax = subtotal * store.taxRate;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

function buildPosRegisterPayload(store: PosStore): {
  checkNumber: number;
  taxRate: number;
  tabs: string[];
  categoryTiles: PosCategoryTile[];
  products: PosProduct[];
  cart: PosCartItem[];
  totals: { subtotal: number; tax: number; total: number };
} {
  return {
    checkNumber: store.checkNumber,
    taxRate: store.taxRate,
    tabs: store.tabs,
    categoryTiles: store.categoryTiles,
    products: store.products,
    cart: store.cart,
    totals: getPosTotals(store),
  };
}

function isPosTender(value: unknown): value is PosTenderType {
  return value === "cash" || value === "card" || value === "cashapp" || value === "po" || value === "storecredit";
}

function isMarketingPlatform(value: unknown): value is MarketingPlatformKey {
  return value === "instagram" || value === "facebook" || value === "x" || value === "tiktok";
}

function getNextMarketingPostId(posts: MarketingPost[]): string {
  const numeric = posts
    .map((post) => Number(post.id.replace("MKT-", "")))
    .filter((value) => Number.isFinite(value));
  const max = numeric.length > 0 ? Math.max(...numeric) : 99;
  return `MKT-${max + 1}`;
}

function getMarketingCharacterLimit(platform: MarketingPlatformKey): number {
  switch (platform) {
    case "x":
      return 280;
    case "facebook":
      return 63206;
    case "instagram":
    case "tiktok":
      return 2200;
    default:
      return 2200;
  }
}

export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestLogger);
  app.use(tenantContext);

  app.get("/", (req, res) => {
    const clientUrl = env.CLIENT_APP_URL.replace(/\/$/, "");
    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    res.redirect(`${clientUrl}/dashboard${query ? `?${query}` : ""}`);
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "colophon-api", environment: env.NODE_ENV, uptimeSeconds: Math.floor(process.uptime()), commit: env.RENDER_GIT_COMMIT ?? null });
  });

  app.get("/api/finance/report", async (req, res, next) => {
    try {
      const sort = typeof req.query.sort === "string" ? req.query.sort : "occurredAt";
      const direction = req.query.direction === "asc" ? "asc" : "desc";
      const allowedSorts = new Set(["name", "amount", "accountCode", "direction", "reconciled", "occurredAt"]);
      const orderBy: Prisma.FinanceTransactionOrderByWithRelationInput = allowedSorts.has(sort)
        ? { [sort]: direction } as Prisma.FinanceTransactionOrderByWithRelationInput
        : { occurredAt: "desc" };
      const [transactions, payables, receivables, purchaseOrders, drawerReconciliations, payrollRuns, bankConnections] = await Promise.all([
        prisma.financeTransaction.findMany({ orderBy }),
        prisma.accountsPayable.findMany({ orderBy: { dueDate: "asc" } }),
        prisma.accountsReceivable.findMany({ orderBy: { dueDate: "asc" } }),
        prisma.purchaseOrder.findMany({ orderBy: { createdAt: "desc" } }),
        prisma.drawerReconciliation.findMany({ orderBy: { businessDate: "desc" } }),
        prisma.payrollRun.findMany({ orderBy: { periodEnd: "desc" } }),
        prisma.bankConnection.findMany({ where: { active: true }, select: { id: true, provider: true, accountName: true, lastSyncedAt: true } }),
      ]);
      const income = transactions.filter((transaction) => transaction.amount > 0).reduce((sum, transaction) => sum + transaction.amount, 0);
      const expenses = Math.abs(transactions.filter((transaction) => transaction.amount < 0).reduce((sum, transaction) => sum + transaction.amount, 0));
      res.json({ transactions, payables, receivables, purchaseOrders, drawerReconciliations, payrollRuns, bankConnections, summary: { income, expenses, profit: income - expenses, breakEven: expenses } });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { email, displayName, password, storeName, storeSlug } = req.body as { email?: string; displayName?: string; password?: string; storeName?: string; storeSlug?: string };
      if (!email || !displayName || !password || !storeName || !storeSlug) {
        res.status(400).json({ error: "email, displayName, password, storeName, and storeSlug are required." });
        return;
      }
      const user = await createUser(email, displayName, password);
      const store = await prisma.store.create({ data: { storeName: storeName.trim(), slug: storeSlug.trim().toLowerCase(), ownerEmail: email.trim().toLowerCase(), memberships: { create: { userId: user.id, role: "ADMIN" } } } });
      const session = await signIn(email, password);
      res.status(201).json({ ...session, store: { id: store.id, slug: store.slug, storeName: store.storeName }, user });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        res.status(400).json({ error: "email and password are required." });
        return;
      }
      res.json(await signIn(email, password));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/shopify/install", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const shop = typeof req.query.shop === "string" ? req.query.shop : "";
      const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;
      const clientSecret = typeof req.query.clientSecret === "string" ? req.query.clientSecret : undefined;
      if (!storeId || !shop) { res.status(400).json({ error: "storeId and shop are required." }); return; }
      res.redirect(await createShopifyInstallUrl(storeId, shop, clientId, clientSecret));
    } catch (error) { next(error); }
  });

  app.get("/api/auth/shopify/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const shop = typeof req.query.shop === "string" ? req.query.shop : "";
    try {
      await completeShopifyInstall(code, state, shop);
      const successUrl = new URL("/shopify?connected=1", env.CLIENT_APP_URL);
      res.redirect(successUrl.toString());
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Shopify authorization failed.";
      console.error("Shopify OAuth callback failed", reason);
      const errorUrl = new URL("/shopify", env.CLIENT_APP_URL);
      errorUrl.searchParams.set("error", reason);
      res.redirect(errorUrl.toString());
    }
  });

  app.use("/api/admin", requireSuperAdmin);
  app.get("/api/admin/stores", async (_req, res, next) => {
    try {
      res.json({ stores: await prisma.store.findMany({ orderBy: { createdAt: "asc" } }) });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/admin/integrations", async (_req, res, next) => {
    try {
      res.json({ integrations: await prisma.globalIntegration.findMany({ orderBy: { name: "asc" } }) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/integrations", async (req, res, next) => {
    try {
      const { key, name, category } = req.body as { key?: string; name?: string; category?: string };
      if (!key?.trim() || !name?.trim() || !category?.trim()) {
        res.status(400).json({ error: "key, name, and category are required." });
        return;
      }
      const integration = await prisma.globalIntegration.create({ data: { key: key.trim().toLowerCase(), name: name.trim(), category: category.trim() } });
      res.status(201).json(integration);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/integrations/:id", async (req, res, next) => {
    try {
      const { enabled } = req.body as { enabled?: boolean };
      if (typeof enabled !== "boolean") {
        res.status(400).json({ error: "enabled must be boolean." });
        return;
      }
      res.json(await prisma.globalIntegration.update({ where: { id: req.params.id }, data: { enabled } }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/stores/update-subscription", async (req, res, next) => {
    try {
      const { storeId, status } = req.body as { storeId?: string; status?: string };
      if (!storeId || !["active", "past_due", "trial", "cancelled"].includes(status ?? "")) {
        res.status(400).json({ error: "storeId and a valid subscription status are required." });
        return;
      }
      const store = await prisma.store.update({ where: { id: storeId }, data: { subscriptionStatus: status } });
      res.json({ success: true, storeId: store.id, status: store.subscriptionStatus });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/stores/:storeId/members", async (req, res, next) => {
    try {
      const members = await prisma.storeMembership.findMany({ where: { storeId: req.params.storeId }, include: { user: { select: { id: true, email: true, displayName: true, isActive: true } } }, orderBy: { createdAt: "asc" } });
      res.json({ members: members.map((member) => ({ id: member.id, userId: member.user.id, email: member.user.email, displayName: member.user.displayName, isActive: member.user.isActive, role: member.role, permissions: JSON.parse(member.permissionsJson) })) });
    } catch (error) { next(error); }
  });

  app.post("/api/admin/stores/:storeId/members", async (req, res, next) => {
    try {
      const { email, displayName, password, role, permissions } = req.body as { email?: string; displayName?: string; password?: string; role?: string; permissions?: Record<string, boolean> };
      if (!email || !displayName || !password || password.length < 12 || !["OWNER", "ADMIN", "ASSOCIATE", "RECEIVER", "EVENTS_COORDINATOR", "BUYER_MERCHANDISER", "ACCOUNTANT", "CONSIGNOR"].includes(role ?? "")) {
        res.status(400).json({ error: "email, displayName, password (12+ characters), and a valid role are required." });
        return;
      }
      const user = await createUser(email, displayName, password);
      const membership = await prisma.storeMembership.create({ data: { userId: user.id, storeId: req.params.storeId, role, permissionsJson: JSON.stringify(permissions ?? {}) } });
      res.status(201).json({ id: membership.id, userId: user.id, email: user.email, displayName: user.displayName, isActive: true, role: membership.role, permissions: permissions ?? {} });
    } catch (error) { next(error); }
  });

  app.patch("/api/admin/store-members/:membershipId", async (req, res, next) => {
    try {
      const { role, permissions, isActive } = req.body as { role?: string; permissions?: Record<string, boolean>; isActive?: boolean };
      if (role !== undefined && !["OWNER", "ADMIN", "ASSOCIATE", "RECEIVER", "EVENTS_COORDINATOR", "BUYER_MERCHANDISER", "ACCOUNTANT", "CONSIGNOR"].includes(role)) { res.status(400).json({ error: "Invalid role." }); return; }
      const membership = await prisma.storeMembership.update({ where: { id: req.params.membershipId }, data: { ...(role ? { role } : {}), ...(permissions ? { permissionsJson: JSON.stringify(permissions) } : {}), ...(typeof isActive === "boolean" ? { user: { update: { isActive } } } : {}) }, include: { user: { select: { id: true, email: true, displayName: true, isActive: true } } } });
      res.json({ id: membership.id, userId: membership.user.id, email: membership.user.email, displayName: membership.user.displayName, isActive: membership.user.isActive, role: membership.role, permissions: JSON.parse(membership.permissionsJson) });
    } catch (error) { next(error); }
  });

  app.post("/api/admin/stores/impersonate", async (req, res, next) => {
    try {
      const { storeId } = req.body as { storeId?: string };
      if (!storeId) {
        res.status(400).json({ error: "storeId is required." });
        return;
      }
      const token = await createStoreImpersonationSession(storeId);
      res.json({ success: true, expiresInSeconds: 3600, token });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/system/broadcast", async (req, res, next) => {
    try {
      const { message, bannerType } = req.body as { message?: string; bannerType?: string };
      if (!message?.trim() || !["info", "warning", "maintenance"].includes(bannerType ?? "")) {
        res.status(400).json({ error: "message and bannerType are required." });
        return;
      }
      const broadcast = await prisma.systemBroadcast.create({ data: { message: message.trim(), bannerType } });
      res.status(201).json({ success: true, broadcast });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/network/resolve-dispute", async (req, res, next) => {
    try {
      const { disputeId, buyingStoreId, sellingStoreId, refundAmount, reason } = req.body as { disputeId?: string; buyingStoreId?: string; sellingStoreId?: string; refundAmount?: number; reason?: string };
      if (!disputeId || !buyingStoreId || !sellingStoreId || typeof refundAmount !== "number" || refundAmount <= 0 || !reason?.trim()) {
        res.status(400).json({ error: "disputeId, store IDs, positive refundAmount, and reason are required." });
        return;
      }
      const result = await prisma.$transaction(async (transaction) => {
        const buyer = await transaction.store.update({ where: { id: buyingStoreId }, data: { ledgerBalance: { increment: refundAmount } } });
        const seller = await transaction.store.update({ where: { id: sellingStoreId }, data: { ledgerBalance: { decrement: refundAmount } } });
        const dispute = await transaction.networkDispute.update({ where: { id: disputeId }, data: { status: "resolved", resolvedAt: new Date(), refundAmount, reason } });
        await transaction.ledgerTransaction.createMany({ data: [
          { storeId: buyingStoreId, amount: refundAmount, balanceAfter: buyer.ledgerBalance, description: `Dispute ${disputeId} refund: ${reason.trim()}` },
          { storeId: sellingStoreId, amount: -refundAmount, balanceAfter: seller.ledgerBalance, description: `Dispute ${disputeId} reversal: ${reason.trim()}` },
        ] });
        return dispute;
      });
      res.json({ success: true, disputeId: result.id, status: result.status, refundAmount });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/stores/adjust-ledger", async (req, res, next) => {
    try {
      const { storeId, adjustmentAmount, reason } = req.body as { storeId?: string; adjustmentAmount?: number; reason?: string };
      if (!storeId?.trim() || typeof adjustmentAmount !== "number" || !Number.isFinite(adjustmentAmount) || !reason?.trim()) {
        res.status(400).json({ error: "storeId, numeric adjustmentAmount, and reason are required." });
        return;
      }
      const result = await prisma.$transaction(async (transaction) => {
        const store = await transaction.store.update({ where: { id: storeId.trim() }, data: { ledgerBalance: { increment: adjustmentAmount } } });
        await transaction.ledgerTransaction.create({ data: { storeId: store.id, amount: adjustmentAmount, balanceAfter: store.ledgerBalance, description: `Admin adjustment: ${reason.trim()}` } });
        return store;
      });
      res.json({ success: true, storeId: result.id, balance: result.ledgerBalance });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stores/:storeId/ecommerce", async (req, res, next) => {
    try {
      const store = await prisma.store.findFirst({ where: { OR: [{ id: req.params.storeId }, { slug: req.params.storeId }] } });
      res.json(await listEcommerceIntegrations(store?.id ?? req.params.storeId));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/stores/:storeId/ecommerce/:platform", async (req, res, next) => {
    try {
      const platform = req.params.platform.toLowerCase() as EcommercePlatform;
      if (platform !== "shopify" && platform !== "woocommerce") {
        res.status(400).json({ error: "Platform must be shopify or woocommerce." });
        return;
      }
      const { storeUrl, config, syncInventory, syncOrders } = req.body as { storeUrl?: string; config?: Record<string, string>; syncInventory?: boolean; syncOrders?: boolean };
      if (!storeUrl) {
        res.status(400).json({ error: "storeUrl is required." });
        return;
      }
      await saveEcommerceIntegration(req.params.storeId, platform, storeUrl, config, syncInventory, syncOrders);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/stores/:storeId/ecommerce/:platform/inventory-sync", async (req, res, next) => {
    try {
      const { sku, quantity } = req.body as { sku?: string; quantity?: number };
      if (!sku || typeof quantity !== "number") {
        res.status(400).json({ error: "sku and numeric quantity are required." });
        return;
      }
      res.json(await syncStoreInventory(req.params.storeId, req.params.platform as EcommercePlatform, sku, quantity));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/stores/:storeId/ecommerce/:platform/inventory-sync-all", async (req, res, next) => {
    try {
      res.json(await syncStoreInventoryCatalog(req.params.storeId, req.params.platform as EcommercePlatform));
    } catch (error) { next(error); }
  });

  app.get("/api/stores/:storeId/ecommerce/:platform/inventory-sync-stream", async (req, res, next) => {
    try {
      res.status(200).setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const result = await syncStoreInventoryCatalog(req.params.storeId, req.params.platform as EcommercePlatform, (progress) => {
        res.write(`${JSON.stringify({ type: "item", ...progress })}\n`);
      });
      res.write(`${JSON.stringify({ type: "complete", ...result })}\n`);
      res.end();
    } catch (error) {
      if (!res.headersSent) next(error);
      else res.end(`${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Inventory sync failed." })}\n`);
    }
  });

  app.get("/api/stores/:storeId/ecommerce/:platform/orders", async (req, res, next) => {
    try {
      res.json({ orders: await fetchStoreOrders(req.params.storeId, req.params.platform as EcommercePlatform) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stores/:storeId/ecommerce/:platform/status", async (req, res, next) => {
    try {
      res.json(await checkStoreConnection(req.params.storeId, req.params.platform as EcommercePlatform));
    } catch (error) { next(error); }
  });

  app.get("/api/open-network/availability", async (req, res, next) => {
    try {
      const query = typeof req.query.query === "string" ? req.query.query.trim().toLowerCase() : "";
      const connectedStores = await prisma.store.count({ where: { subscriptionStatus: { in: ["trial", "active"] } } });
      if (connectedStores < 2) {
        res.json({ items: [], connectedStores });
        return;
      }
      const inventory = await prisma.isbnLookupCache.findMany({ where: { quantityOnHand: { gt: 0 } }, orderBy: { updatedAt: "desc" } });
      const results = inventory
        .filter((item) => !query || [item.title, item.author, item.isbn, item.sku].filter(Boolean).some((value) => value!.toLowerCase().includes(query)))
        .slice(0, 8)
        .map((item, index) => ({
          isbn: item.isbn,
          title: item.title ?? "Untitled",
          author: item.author,
          coverUrl: item.coverUrl,
          price: item.listPrice ?? item.thriftbooksPrice ?? 0,
          stock: Math.max(1, item.quantityOnHand),
          storeName: index % 2 === 0 ? "Riverlight Books" : "Maple Street Books",
        }));
      res.json({ items: results, connectedStores });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/open-network/orders/settle", async (req, res, next) => {
    try {
      const { buyingStoreId, sellingStoreId, order } = req.body as {
        buyingStoreId?: string;
        sellingStoreId?: string;
        order?: { isbn?: string; title?: string; wholesalePrice?: number; shippingFee?: number };
      };
      if (!buyingStoreId || !sellingStoreId || !order || typeof order.wholesalePrice !== "number" || typeof order.shippingFee !== "number" || typeof order.isbn !== "string" || typeof order.title !== "string") {
        res.status(400).json({ error: "buyingStoreId, sellingStoreId, and a complete order are required." });
        return;
      }
      res.status(201).json(await executeDropshipSettlement(buyingStoreId, sellingStoreId, {
        isbn: order.isbn,
        title: order.title,
        wholesalePrice: order.wholesalePrice,
        shippingFee: order.shippingFee,
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/open-network/order-requests", async (req, res, next) => {
    try {
      const input = req.body as {
        partnerStoreName?: string;
        isbn?: string;
        title?: string;
        requestedPrice?: number;
        shippingFee?: number;
        fulfillmentTarget?: string;
        customerName?: string;
        customerEmail?: string;
        customerAddress?: string;
        destinationAddress?: string;
      };
      if (!input.partnerStoreName?.trim() || !input.isbn?.trim() || !input.title?.trim() || typeof input.requestedPrice !== "number" || input.requestedPrice < 0 || !["store", "customer"].includes(input.fulfillmentTarget ?? "")) {
        res.status(400).json({ error: "Partner, item, price, and fulfillment destination are required." });
        return;
      }
      const destinationAddress = input.destinationAddress?.trim() || input.customerAddress?.trim();
      if (!destinationAddress) {
        res.status(400).json({ error: "A shipping destination address is required." });
        return;
      }
      const request = await prisma.networkOrderRequest.create({
        data: {
          partnerStoreName: input.partnerStoreName.trim(),
          isbn: input.isbn.trim(),
          title: input.title.trim(),
          requestedPrice: input.requestedPrice,
          shippingFee: typeof input.shippingFee === "number" && input.shippingFee >= 0 ? input.shippingFee : 0,
          fulfillmentTarget: input.fulfillmentTarget as "store" | "customer",
          customerName: input.customerName?.trim() || null,
          customerEmail: input.customerEmail?.trim() || null,
          customerAddress: input.customerAddress?.trim() || null,
          destinationAddress,
        },
      });
      res.status(201).json(request);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/stores/:storeId/shipping/usps", async (req, res, next) => {
    try {
      res.json(await getStoreUspsAccountStatus(req.params.storeId));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/stores/:storeId/shipping/usps", async (req, res, next) => {
    try {
      const { clientId, clientSecret, originAddress } = req.body as { clientId?: string; clientSecret?: string; originAddress?: string };
      if (!clientId || !clientSecret) {
        res.status(400).json({ error: "USPS client ID and client secret are required." });
        return;
      }
      await saveStoreUspsAccount(req.params.storeId, clientId, clientSecret, originAddress);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/shipping/calculate-rates", (req, res, next) => {
    try {
      const {
        isbn = "manual-package",
        weightOz = 16,
        length = 9.0,
        width = 6.0,
        thickness = 1.0,
        itemPrice = 0,
        packageType,
        requireSignature,
      } = req.body as {
        isbn?: string;
        weightOz?: number;
        length?: number;
        width?: number;
        thickness?: number;
        itemPrice?: number;
        packageType?: any;
        requireSignature?: boolean;
      };

      const dimensions = resolveBookDimensions({
        weightRaw: weightOz,
        dimensionsStructured: {
          length: { value: length },
          width: { value: width },
          height: { value: thickness },
        },
      });

      const result = autoSelectShippingRate({
        isbn,
        weightOz: typeof weightOz === "number" ? weightOz : dimensions.weightOz,
        length: typeof length === "number" ? length : dimensions.lengthInches,
        width: typeof width === "number" ? width : dimensions.widthInches,
        thickness: typeof thickness === "number" ? thickness : dimensions.thicknessInches,
        itemPrice: typeof itemPrice === "number" ? itemPrice : 0,
        isBookMedia: true,
        packageTypeOverride: packageType,
        requireSignatureOverride: requireSignature,
      }, dimensions);

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/shipping/rates/:isbn", async (req, res, next) => {
    try {
      const product = await prisma.isbnLookupCache.findUnique({ where: { isbn: req.params.isbn } });
      if (!product) {
        res.status(404).json({ error: "Book not found." });
        return;
      }

      const dimensions = resolveBookDimensions({
        weightRaw: product.weight,
        dimensionsStructured: product.length && product.width ? {
          length: { value: product.length },
          width: { value: product.width },
          height: { value: product.thickness ?? 1.0 },
        } : null,
        pages: product.pageCount,
        binding: product.bindingFormat,
        title: product.title,
        description: product.description,
      });

      const result = autoSelectShippingRate({
        isbn: product.isbn,
        weightOz: dimensions.weightOz,
        length: dimensions.lengthInches,
        width: dimensions.widthInches,
        thickness: dimensions.thicknessInches,
        itemPrice: product.listPrice ?? product.thriftbooksPrice ?? 0,
        isBookMedia: true,
      }, dimensions);

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  
  app.get("/api/health/services", async (req, res) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const store = await prisma.store.findFirst({ where: { OR: [{ id: storeId }, { slug: storeId }] } });
      const storePk = store?.id ?? storeId;

      // 1. Live Ecommerce Integration Status
      const ecomIntegrations = await prisma.storeEcommerceIntegration.findMany({ where: { storeId: storePk } }).catch(() => []);
      const shopifyIntegration = ecomIntegrations.find((i) => i.platform === "shopify");
      let ecomStatus: "green" | "yellow" | "red" = "red";
      let ecomDetail = "Not connected (Click to connect Shopify)";

      if (shopifyIntegration) {
        try {
          const statusResult = await checkStoreConnection(storePk, "shopify");
          if (statusResult.connected) {
            ecomStatus = "green";
            ecomDetail = `Shopify connected (${shopifyIntegration.storeUrl.replace(/^https?:\/\//, "")})`;
          } else {
            ecomStatus = "yellow";
            ecomDetail = `Shopify configured (${shopifyIntegration.storeUrl.replace(/^https?:\/\//, "")})`;
          }
        } catch {
          ecomStatus = "yellow";
          ecomDetail = `Shopify configured (${shopifyIntegration.storeUrl.replace(/^https?:\/\//, "")})`;
        }
      } else if (ecomIntegrations.length > 0) {
        ecomStatus = "green";
        ecomDetail = `${ecomIntegrations[0].platform} connected`;
      }

      // 2. Payments Status
      const paymentsConfigured = isSquareConfigured();
      const paymentsStatus: "green" | "yellow" | "red" = paymentsConfigured ? "green" : "red";
      const paymentsDetail = paymentsConfigured ? "Square payment processor connected" : "No payment processor connected";

      // 3. Open Network Status
      const peerCount = await prisma.networkPeer.count().catch(() => 0);
      const networkStatus: "green" | "yellow" | "red" = "green";
      const networkDetail = peerCount > 0 ? `Open Network active (${peerCount} peer nodes)` : "Open Network ready for shared sync";

      // 4. Marketing Status
      const marketingConnected = marketingStore.connections.filter((connection) => connection.connected).length;
      const marketingTotal = marketingStore.connections.length;
      const marketingStatus = marketingConnected === 0
        ? "red"
        : marketingConnected < marketingTotal
          ? "yellow"
          : "green";
      const marketingDetail = `${marketingConnected}/${marketingTotal} marketing channels connected`;

      res.json({
        services: [
          { key: "ecommerce", label: "Ecommerce site", detail: ecomDetail, status: ecomStatus, path: "/shopify" },
          { key: "payments", label: "Payment processor", detail: paymentsDetail, status: paymentsStatus, path: "/payments" },
          { key: "network", label: "Open Network", detail: networkDetail, status: networkStatus, path: "/network" },
          { key: "marketing", label: "Marketing", detail: marketingDetail, status: marketingStatus, path: "/marketing" },
        ],
      });
    } catch (error) {
      res.json({
        services: [
          { key: "ecommerce", label: "Ecommerce site", detail: "Checking status...", status: "yellow", path: "/shopify" },
          { key: "payments", label: "Payment processor", detail: isSquareConfigured() ? "Square connected" : "No processor", status: isSquareConfigured() ? "green" : "red", path: "/payments" },
          { key: "network", label: "Open Network", detail: "Shared sync", status: "green", path: "/network" },
          { key: "marketing", label: "Marketing", detail: "Checking channels...", status: "yellow", path: "/marketing" },
        ],
      });
    }
  });

  // Live Sync & Scraper Keep-Alive Helper
  async function getLiveSyncStatus(storeId = "ghostlight-demo") {
    try {
      const store = await prisma.store.findFirst({
        where: { OR: [{ id: storeId }, { slug: storeId }] },
        include: { ebayConfig: true },
      });
      const storePk = store?.id ?? storeId;

      // 1. Price Scraper Engine Status
      const cachedCount = await prisma.isbnLookupCache.count().catch(() => 0);
      const scraperStatus = {
        key: "scraper",
        label: "Price Scraper Engine",
        status: "green" as const,
        detail: "Active · ThriftBooks, AbeBooks, Google Books",
        cachedCount,
        activeProviders: ["ThriftBooks", "AbeBooks", "Google Books", "Open Library"],
      };

      // 2. Ecommerce Status (Shopify)
      const ecomIntegrations = await prisma.storeEcommerceIntegration.findMany({ where: { storeId: storePk } }).catch(() => []);
      const shopifyIntegration = ecomIntegrations.find((i) => i.platform === "shopify");
      let ecomStatus: "green" | "yellow" | "red" = "red";
      let ecomDetail = "Not connected";
      let storeUrl = "";

      if (shopifyIntegration) {
        storeUrl = shopifyIntegration.storeUrl.replace(/^https?:\/\//, "");
        try {
          const statusResult = await checkStoreConnection(storePk, "shopify");
          if (statusResult.connected) {
            ecomStatus = "green";
            ecomDetail = `Connected (${storeUrl})`;
          } else {
            ecomStatus = "yellow";
            ecomDetail = `Configured (${storeUrl})`;
          }
        } catch {
          ecomStatus = "yellow";
          ecomDetail = `Configured (${storeUrl})`;
        }
      } else if (ecomIntegrations.length > 0) {
        ecomStatus = "green";
        ecomDetail = `${ecomIntegrations[0].platform} connected`;
      }

      const ecommerceStatus = {
        key: "ecommerce",
        label: "Shopify Sync",
        status: ecomStatus,
        detail: ecomDetail,
        storeUrl,
        path: "/shopify",
      };

      // 3. eBay Marketplace Status
      const ebayConfig = store?.ebayConfig;
      let ebayStatus: "green" | "yellow" | "red" = "red";
      let ebayDetail = "Not connected";
      const ebayListingsCount = await prisma.ebayListing.count({ where: { storeId: storePk } }).catch(() => 0);

      if (ebayConfig?.encryptedTokens) {
        try {
          const parsed = JSON.parse(ebayConfig.encryptedTokens) as { tokenExpiresAt?: string; accessToken?: string };
          const isExpired = parsed.tokenExpiresAt ? new Date(parsed.tokenExpiresAt) <= new Date() : false;
          if (isExpired) {
            ebayStatus = "yellow";
            ebayDetail = `Token refresh needed (${ebayListingsCount} listings)`;
          } else {
            ebayStatus = "green";
            ebayDetail = `Connected (${ebayConfig.environment}, ${ebayListingsCount} listings)`;
          }
        } catch {
          ebayStatus = "yellow";
          ebayDetail = `Configured (${ebayConfig.environment})`;
        }
      } else if (ebayConfig) {
        ebayStatus = "yellow";
        ebayDetail = `Configured (${ebayConfig.environment})`;
      }

      const ebaySyncStatus = {
        key: "ebay",
        label: "eBay Integration",
        status: ebayStatus,
        detail: ebayDetail,
        listingsCount: ebayListingsCount,
        path: "/ebay",
      };

      // 4. USPS Shipping Rate Engine
      const shippingStatus = {
        key: "shipping",
        label: "USPS Shipping Engine",
        status: "green" as const,
        detail: "Auto-rate active (Media Mail & Ground Advantage)",
      };

      // 5. Barcode & Scanner Engine
      const scannerStatus = {
        key: "scanner",
        label: "ISBN Scanner Station",
        status: "green" as const,
        detail: "Active & Listening",
      };

      const overall: "green" | "yellow" | "red" =
        ecomStatus === "green" || ebayStatus === "green" ? "green" : (ecomStatus === "yellow" || ebayStatus === "yellow" ? "yellow" : "green");

      return {
        active: true,
        overall,
        timestamp: new Date().toISOString(),
        services: {
          scraper: scraperStatus,
          ecommerce: ecommerceStatus,
          ebay: ebaySyncStatus,
          shipping: shippingStatus,
          scanner: scannerStatus,
        },
      };
    } catch (error) {
      return {
        active: true,
        overall: "green" as const,
        timestamp: new Date().toISOString(),
        services: {
          scraper: { key: "scraper", label: "Price Scraper Engine", status: "green" as const, detail: "Active (Multi-tier)" },
          ecommerce: { key: "ecommerce", label: "Shopify Sync", status: "yellow" as const, detail: "Checking..." },
          ebay: { key: "ebay", label: "eBay Integration", status: "yellow" as const, detail: "Checking..." },
          shipping: { key: "shipping", label: "USPS Shipping Engine", status: "green" as const, detail: "Active" },
          scanner: { key: "scanner", label: "ISBN Scanner Station", status: "green" as const, detail: "Active & Listening" },
        },
      };
    }
  }

  // Live Sync & Scraper Keep-Alive Engine Endpoints
  app.get("/api/sync/status", async (req, res) => {
    const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
    const statusData = await getLiveSyncStatus(storeId);
    res.json(statusData);
  });

  app.post("/api/sync/refresh", async (req, res) => {
    const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "ghostlight-demo";
    const targetService = typeof req.body?.targetService === "string" ? req.body.targetService : null;

    const store = await prisma.store.findFirst({
      where: { OR: [{ id: storeId }, { slug: storeId }] },
      include: { ebayConfig: true },
    });
    const storePk = store?.id ?? storeId;

    const reconnected: string[] = [];
    const errors: string[] = [];

    // 1. Reconnect Shopify
    if (!targetService || targetService === "ecommerce") {
      try {
        const check = await checkStoreConnection(storePk, "shopify");
        if (check.connected) {
          reconnected.push("Shopify");
        }
      } catch (err) {
        errors.push(`Shopify: ${err instanceof Error ? err.message : "Connection failed"}`);
      }
    }

    // 2. Reconnect / refresh eBay
    if (!targetService || targetService === "ebay") {
      try {
        if (store?.ebayConfig?.encryptedTokens) {
          await getValidEbayAccessToken(storePk);
          reconnected.push("eBay");
        }
      } catch (err) {
        errors.push(`eBay: ${err instanceof Error ? err.message : "Token validation failed"}`);
      }
    }

    const latestStatus = await getLiveSyncStatus(storeId);
    res.json({
      success: true,
      reconnected,
      errors,
      ...latestStatus,
    });
  });

  async function syncInventoryLookupCache(): Promise<void> {
    const books = await prisma.book.findMany({
      include: { inventoryItems: true },
    });

    for (const book of books) {
      const totalQuantity = book.inventoryItems.reduce((sum, item) => sum + item.quantityOnHand, 0);
      const primaryItem = book.inventoryItems.sort((a, b) => b.quantityOnHand - a.quantityOnHand)[0];
      const existingCache = await prisma.isbnLookupCache.findUnique({ where: { isbn: book.isbn13 } });

      const effectiveQty = Math.max(totalQuantity, existingCache?.quantityOnHand ?? 0);

      await prisma.isbnLookupCache.upsert({
        where: { isbn: book.isbn13 },
        create: {
          isbn: book.isbn13,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          description: null,
          coverUrl: null,
          quantityOnHand: effectiveQty,
          thriftbooksPrice: null,
          listPrice: book.listPriceCents ? book.listPriceCents / 100 : null,
          condition: primaryItem?.condition ?? "Good",
          container: primaryItem?.locationCode ?? null,
          category: book.genre,
          subcategory: null,
          sku: primaryItem?.sku ?? `BK-${book.isbn13}`,
          labelTitle: book.title,
          source: "database-sync",
          mediaType: "Book",
        },
        update: {
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          quantityOnHand: effectiveQty,
          listPrice: book.listPriceCents ? book.listPriceCents / 100 : (existingCache?.listPrice ?? null),
          condition: primaryItem?.condition ?? existingCache?.condition ?? "Good",
          container: primaryItem?.locationCode ?? existingCache?.container ?? null,
          category: book.genre ?? existingCache?.category ?? null,
          subcategory: existingCache?.subcategory ?? null,
          coverUrl: existingCache?.coverUrl ?? undefined,
          sku: primaryItem?.sku ?? existingCache?.sku ?? `BK-${book.isbn13}`,
          labelTitle: book.title ?? existingCache?.labelTitle,
        },
      });
    }
  }

  app.get("/api/inventory/active", async (_req, res, next) => {
    try {
      await syncInventoryLookupCache();
      const connectedStores = await prisma.store.count({ where: { subscriptionStatus: { in: ["trial", "active"] } } });
      const shopifyIntegration = await prisma.storeEcommerceIntegration.findFirst({ where: { platform: "shopify" } });
      const isShopifyConnected = Boolean(shopifyIntegration && shopifyIntegration.syncInventory);
      const items = await prisma.isbnLookupCache.findMany({ where: { quantityOnHand: { gt: 0 } }, orderBy: { updatedAt: "desc" } });
      res.json({
        connectedStores: Math.max(connectedStores - 1, 0),
        items: items.map((item) => ({
          ...item,
          shopifyStatus: isShopifyConnected ? (item.quantityOnHand > 0 ? "Published" : "Draft") : "Not connected",
          networkStatus: connectedStores > 1 ? "Available to share" : "Private",
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/inventory/products/:isbn", async (req, res, next) => {
    try {
      const product = await prisma.isbnLookupCache.findUnique({ where: { isbn: req.params.isbn } });
      if (!product) {
        res.status(404).json({ error: "Product not found." });
        return;
      }
      const similar = await prisma.isbnLookupCache.findMany({
        where: {
          isbn: { not: product.isbn },
          OR: [
            ...(product.author ? [{ author: { contains: product.author.split(",")[0].trim() } }] : []),
            ...(product.category ? [{ category: product.category }] : []),
            ...(product.subcategory ? [{ subcategory: product.subcategory }] : []),
          ],
        },
        take: 8,
        orderBy: { updatedAt: "desc" },
      });
      const connectedStores = await prisma.store.count({ where: { subscriptionStatus: { in: ["trial", "active"] } } });
      res.json({ product, similar, partnerAvailability: connectedStores > 1 ? "Check connected partner stores" : "No connected partner stores" });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/inventory/products/:isbn", async (req, res, next) => {
    try {
      const input = req.body as {
        title?: string;
        author?: string;
        publisher?: string;
        description?: string;
        category?: string;
        subcategory?: string;
        mediaType?: string;
        seoKeywords?: string;
        seoTitle?: string;
        seoDescription?: string;
        catalogTags?: string;
        weight?: number;
        length?: number;
        width?: number;
        thickness?: number;
        pageCount?: number;
        bindingFormat?: string;
        packageType?: string;
        suggestedShippingService?: string;
        estimatedShippingCost?: number;
      };

      const product = await prisma.isbnLookupCache.update({
        where: { isbn: req.params.isbn },
        data: {
          title: input.title !== undefined ? (input.title?.trim() || null) : undefined,
          author: input.author !== undefined ? (input.author?.trim() || null) : undefined,
          publisher: input.publisher !== undefined ? (input.publisher?.trim() || null) : undefined,
          description: input.description !== undefined ? (input.description?.trim() || null) : undefined,
          category: input.category !== undefined ? (input.category?.trim() || null) : undefined,
          subcategory: input.subcategory !== undefined ? (input.subcategory?.trim() || null) : undefined,
          mediaType: input.mediaType !== undefined ? (input.mediaType?.trim() || "Book") : undefined,
          seoKeywords: input.seoKeywords !== undefined ? (input.seoKeywords?.trim() || null) : undefined,
          seoTitle: input.seoTitle !== undefined ? (input.seoTitle?.trim() || null) : undefined,
          seoDescription: input.seoDescription !== undefined ? (input.seoDescription?.trim() || null) : undefined,
          catalogTags: input.catalogTags !== undefined ? (input.catalogTags?.trim() || null) : undefined,
          weight: typeof input.weight === "number" ? input.weight : undefined,
          length: typeof input.length === "number" ? input.length : undefined,
          width: typeof input.width === "number" ? input.width : undefined,
          thickness: typeof input.thickness === "number" ? input.thickness : undefined,
          pageCount: typeof input.pageCount === "number" ? input.pageCount : undefined,
          bindingFormat: input.bindingFormat !== undefined ? (input.bindingFormat?.trim() || null) : undefined,
          packageType: input.packageType !== undefined ? (input.packageType?.trim() || null) : undefined,
          suggestedShippingService: input.suggestedShippingService !== undefined ? (input.suggestedShippingService?.trim() || null) : undefined,
          estimatedShippingCost: typeof input.estimatedShippingCost === "number" ? input.estimatedShippingCost : undefined,
        },
      });
      res.json(product);
    } catch (error) { next(error); }
  });

  app.delete("/api/inventory/products/:isbn", async (req, res, next) => {
    try {
      const product = await prisma.isbnLookupCache.update({ where: { isbn: req.params.isbn }, data: { quantityOnHand: 0 } });
      res.json({ success: true, product });
    } catch (error) { next(error); }
  });

  app.post("/api/inventory/products/:isbn/pull-open-library", async (req, res, next) => {
    try {
      const metadata = await pullOpenLibraryMetadata(req.params.isbn);
      if (!metadata) {
        res.status(404).json({ error: "Open Library has no metadata for this ISBN." });
        return;
      }
      res.json(metadata);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard/summary", async (_req, res, next) => {
    try {
      const inventory = await prisma.isbnLookupCache.findMany({ orderBy: { updatedAt: "desc" } });
      const activeInventory = inventory.filter((item) => item.quantityOnHand > 0);
      const pricedInventory = activeInventory.filter((item) => item.listPrice !== null);
      const inventoryValue = pricedInventory.reduce((sum, item) => sum + (item.listPrice ?? 0) * item.quantityOnHand, 0);
      const lowStock = activeInventory.filter((item) => item.quantityOnHand <= 1).length;
      res.json({
        activeTitles: activeInventory.length,
        unitsOnHand: activeInventory.reduce((sum, item) => sum + item.quantityOnHand, 0),
        pricedTitles: pricedInventory.length,
        inventoryValue,
        lowStock,
        recentTitles: activeInventory.slice(0, 4).map((item) => ({ title: item.title ?? "Untitled", sku: item.sku })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/inventory/active/:isbn", async (req, res, next) => {
    try {
      const cleanIsbn = autoCorrectIsbn(req.params.isbn.replace(/[^0-9X]/gi, "").toUpperCase());
      const {
        condition,
        listPrice,
        container,
        deviceId,
        stationName,
        title,
        author,
        publisher,
        coverUrl,
        category,
        subcategory,
        mediaType,
        bindingFormat,
        pageCount,
        weightOz,
      } = req.body as {
        condition?: string;
        listPrice?: number;
        container?: string;
        deviceId?: string;
        stationName?: string;
        title?: string;
        author?: string;
        publisher?: string;
        coverUrl?: string;
        category?: string;
        subcategory?: string;
        mediaType?: string;
        bindingFormat?: string;
        pageCount?: number;
        weightOz?: number;
      };

      // 1. If title metadata is missing, attempt quick lookup
      let metaTitle = title;
      let metaAuthor = author;
      let metaPublisher = publisher;
      let metaCoverUrl = coverUrl;
      let metaCategory = category;
      let metaSubcategory = subcategory;
      let metaBinding = bindingFormat;
      let metaPages = pageCount;
      let metaWeight = weightOz;

      if (!metaTitle) {
        const lookup = await lookupBookByIsbn(cleanIsbn).catch(() => null);
        if (lookup) {
          metaTitle = lookup.title ?? undefined;
          metaAuthor = lookup.author ?? undefined;
          metaPublisher = lookup.publisher ?? undefined;
          metaCoverUrl = lookup.coverUrl ?? undefined;
          metaCategory = lookup.category ?? undefined;
          metaSubcategory = lookup.subcategory ?? undefined;
          metaBinding = lookup.bindingFormat ?? undefined;
          metaPages = lookup.pageCount ?? undefined;
          metaWeight = lookup.weightOz ?? undefined;
        }
      }

      // 2. Upsert IsbnLookupCache
      const item = await prisma.isbnLookupCache.upsert({
        where: { isbn: cleanIsbn },
        create: {
          isbn: cleanIsbn,
          title: metaTitle ?? `Scanned Book (${cleanIsbn})`,
          author: metaAuthor ?? null,
          publisher: metaPublisher ?? null,
          coverUrl: metaCoverUrl ?? null,
          category: metaCategory ?? "Print Books",
          subcategory: metaSubcategory ?? null,
          mediaType: mediaType ?? "Book",
          bindingFormat: metaBinding ?? null,
          pageCount: typeof metaPages === "number" ? metaPages : null,
          weight: typeof metaWeight === "number" ? metaWeight : null,
          quantityOnHand: 1,
          condition: condition ?? "Good",
          listPrice: typeof listPrice === "number" ? listPrice : 14.99,
          thriftbooksPrice: typeof listPrice === "number" ? listPrice : null,
          container: container ?? null,
          sku: `SCAN-${cleanIsbn.slice(-6)}`,
          source: "scanner-station",
        },
        update: {
          quantityOnHand: { increment: 1 },
          condition: condition ?? undefined,
          listPrice: typeof listPrice === "number" ? listPrice : undefined,
          container: container ?? undefined,
          title: metaTitle ?? undefined,
          author: metaAuthor ?? undefined,
          coverUrl: metaCoverUrl ?? undefined,
        },
      });

      // 3. Upsert Book relation
      const bookRecord = await prisma.book.upsert({
        where: { isbn13: cleanIsbn },
        create: {
          isbn13: cleanIsbn,
          title: item.title ?? `Scanned Book (${cleanIsbn})`,
          author: item.author ?? "Unknown Author",
          publisher: item.publisher ?? null,
          listPriceCents: Math.round((typeof listPrice === "number" ? listPrice : 14.99) * 100),
          genre: item.subcategory ?? item.category ?? "General",
        },
        update: {
          listPriceCents: typeof listPrice === "number" ? Math.round(listPrice * 100) : undefined,
        },
      });

      // 4. Upsert InventoryItem
      const existingInventoryItem = await prisma.inventoryItem.findFirst({
        where: { bookId: bookRecord.id, condition: condition ?? item.condition ?? "Good" },
      });

      if (existingInventoryItem) {
        await prisma.inventoryItem.update({
          where: { id: existingInventoryItem.id },
          data: {
            quantityOnHand: { increment: 1 },
            acquiredAt: new Date(),
          },
        });
      } else {
        await prisma.inventoryItem.create({
          data: {
            bookId: bookRecord.id,
            sku: `${item.sku}-${Date.now().toString().slice(-4)}`,
            condition: condition ?? item.condition ?? "Good",
            quantityOnHand: 1,
            quantityReserved: 0,
            locationCode: container ?? "Scanner Intake",
          },
        });
      }

      // 5. Create ScanEvent
      await prisma.scanEvent.create({
        data: {
          isbn: item.isbn,
          inventoryId: item.id,
          deviceId: deviceId?.trim() || "scanner-device",
          stationName: stationName?.trim() || "Intake Station",
          condition: condition ?? item.condition ?? "Good",
          listPrice: typeof listPrice === "number" ? listPrice : (item.listPrice ?? 0),
          container: container ?? item.container ?? "Unassigned",
        },
      }).catch((err) => console.warn("ScanEvent creation warning:", err));

      // 6. Trigger Shopify sync
      void syncInventoryItemByIsbn("ghostlight-demo", item.isbn)
        .then((result) => {
          if (!result.success) console.warn("Automatic Shopify inventory sync skipped", result.message);
        })
        .catch((error) => console.error("Automatic Shopify inventory sync failed", error));

      res.json(item);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/intake/isbn/:isbn", async (req, res) => {
    const book = await lookupBookByIsbn(req.params.isbn);
    if (!book) {
      res.status(404).json({ error: "Book not found" });
      return;
    }
    res.json(book);
  });

  // --- Book Buying Desk API Endpoints ---
  app.get("/api/buying/search", async (req, res, next) => {
    try {
      const validation = validateBuyingSearchParams({
        year: req.query.year,
        publisher: req.query.publisher,
        author: req.query.author,
        isbn: req.query.isbn,
        title: req.query.title,
      });

      if (!validation.valid || !validation.cleanParams) {
        res.status(400).json({ error: validation.error || "Invalid search parameters." });
        return;
      }

      const results = await searchBuyingEditions(validation.cleanParams);
      res.json({ results });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/buying/evaluate/:isbn", async (req, res, next) => {
    try {
      const condition = (typeof req.query.condition === "string" ? req.query.condition : "Good") as any;
      const evaluation = await evaluateBuyingBook(req.params.isbn, condition);
      res.json(evaluation);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/buying/process", async (req, res, next) => {
    try {
      const { items, paymentMethod = "cash", customerName, customerEmail, customerPhone, storeId } = req.body as {
        items?: Array<{
          isbn: string;
          condition: any;
          sellPrice: number;
          buyOffer: number;
          title?: string;
          author?: string;
        }>;
        paymentMethod?: "cash" | "storecredit" | "check";
        customerName?: string;
        customerEmail?: string;
        customerPhone?: string;
        storeId?: string;
      };

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "At least one item is required to process a buyout." });
        return;
      }

      const result = await processBuyingBatch({
        items,
        paymentMethod: paymentMethod || "cash",
        customerName,
        customerEmail,
        customerPhone,
        storeId,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  // --- Product Bundling API Endpoints ---
  app.get("/api/bundles", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : "ACTIVE";
      const bundles = await listProductBundles(status);
      res.json({ bundles });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/bundles/search-items", async (req, res, next) => {
    try {
      const query = typeof req.query.query === "string" ? req.query.query : undefined;
      const topic = typeof req.query.topic === "string" ? req.query.topic : undefined;
      const author = typeof req.query.author === "string" ? req.query.author : undefined;
      const title = typeof req.query.title === "string" ? req.query.title : undefined;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;

      const items = await searchAvailableItemsForBundling({
        query,
        topic,
        author,
        title,
        limit,
      });

      res.json({ items });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/bundles/pricing-preview", (req, res) => {
    const prices = Array.isArray(req.body?.prices) ? req.body.prices : [];
    const suggestion = calculateSuggestedBundlePrice(prices);
    res.json(suggestion);
  });

  app.post("/api/bundles", async (req, res, next) => {
    try {
      const { title, topic, description, customBundlePrice, items, storeId } = req.body as {
        title?: string;
        topic?: string;
        description?: string;
        customBundlePrice?: number;
        items?: Array<{
          isbn: string;
          sku?: string;
          title: string;
          author?: string | null;
          coverUrl?: string | null;
          condition?: string | null;
          listPrice: number;
          category?: string | null;
          subcategory?: string | null;
        }>;
        storeId?: string;
      };

      if (!Array.isArray(items) || items.length < 2) {
        res.status(400).json({ error: "At least 2 items are required to create a bundle." });
        return;
      }

      const bundle = await createProductBundle({
        title,
        topic,
        description,
        customBundlePrice,
        items,
        storeId,
      });

      res.status(201).json(bundle);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/bundles/:id/unbundle", async (req, res, next) => {
    try {
      const storeId = typeof req.body?.storeId === "string" ? req.body.storeId : "ghostlight-demo";
      const result = await unbundleProduct(req.params.id, storeId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/operations/state", (_req, res) => {
    res.json({
      connectors: operationsStore.connectors,
      tasks: operationsStore.tasks,
    });
  });

  app.patch("/api/operations/connectors/:key", (req, res) => {
    const { key } = req.params;
    const { connected } = req.body as { connected?: unknown };

    if (typeof connected !== "boolean") {
      res.status(400).json({ error: "connected must be a boolean" });
      return;
    }

    const target = operationsStore.connectors.find((connector) => connector.key === key);
    if (!target) {
      res.status(404).json({ error: "Connector not found" });
      return;
    }

    target.connected = connected;
    res.json(target);
  });

  app.post("/api/operations/tasks", (req, res) => {
    const body = req.body as { title?: unknown; owner?: unknown };
    const title = typeof body.title === "string" && body.title.trim().length > 0 ? body.title.trim() : "New operational follow-up";
    const owner = typeof body.owner === "string" && body.owner.trim().length > 0 ? body.owner.trim() : "Unassigned";

    const task: OpsTask = {
      id: getNextTaskId(operationsStore.tasks),
      title,
      owner,
      done: false,
    };

    operationsStore.tasks = [task, ...operationsStore.tasks];
    res.status(201).json(task);
  });

  app.patch("/api/operations/tasks/:id", (req, res) => {
    const { id } = req.params;
    const { done } = req.body as { done?: unknown };

    if (typeof done !== "boolean") {
      res.status(400).json({ error: "done must be a boolean" });
      return;
    }

    const target = operationsStore.tasks.find((task) => task.id === id);
    if (!target) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    target.done = done;
    res.json(target);
  });

  app.post("/api/operations/sync-check", (_req, res) => {
    const inactive = operationsStore.connectors.filter((item) => !item.connected);
    const message = inactive.length === 0
      ? "All connectors are active. Workflows are synced."
      : `${inactive.length} connector(s) need attention before full sync.`;

    res.json({
      inactiveCount: inactive.length,
      message,
    });
  });

  app.get("/api/marketing/state", (_req, res) => {
    res.json({
      connections: marketingStore.connections,
      posts: marketingStore.posts,
    });
  });

  app.patch("/api/marketing/connections/:key", (req, res) => {
    const { key } = req.params;
    const { connected } = req.body as { connected?: unknown };

    if (!isMarketingPlatform(key)) {
      res.status(404).json({ error: "Platform not found" });
      return;
    }

    if (typeof connected !== "boolean") {
      res.status(400).json({ error: "connected must be a boolean" });
      return;
    }

    const connection = marketingStore.connections.find((entry) => entry.key === key);
    if (!connection) {
      res.status(404).json({ error: "Platform not found" });
      return;
    }

    connection.connected = connected;
    if (!connected) {
      connection.impressions7d = 0;
      connection.engagementRate = 0;
    } else {
      connection.impressions7d = Math.max(connection.impressions7d, 4200);
      connection.engagementRate = Math.max(connection.engagementRate, 1.5);
    }

    res.json(connection);
  });

  app.post("/api/marketing/post", (req, res) => {
    const { platform, message, mode, scheduledFor } = req.body as {
      platform?: unknown;
      message?: unknown;
      mode?: unknown;
      scheduledFor?: unknown;
    };

    if (!isMarketingPlatform(platform)) {
      res.status(400).json({ error: "platform must be instagram, facebook, x, or tiktok" });
      return;
    }

    if (typeof message !== "string" || message.trim().length < 5) {
      res.status(400).json({ error: "message must be at least 5 characters" });
      return;
    }

    if (mode !== "publish" && mode !== "queue" && mode !== "schedule") {
      res.status(400).json({ error: "mode must be publish, queue, or schedule" });
      return;
    }

    const trimmedMessage = message.trim();
    const characterLimit = getMarketingCharacterLimit(platform);
    if (trimmedMessage.length > characterLimit) {
      res.status(400).json({ error: `message exceeds ${characterLimit} character limit for ${platform}` });
      return;
    }

    let scheduledDate: Date | null = null;
    if (mode === "schedule") {
      if (typeof scheduledFor !== "string" || scheduledFor.trim().length === 0) {
        res.status(400).json({ error: "scheduledFor is required for scheduled posts" });
        return;
      }

      const parsed = new Date(scheduledFor);
      if (Number.isNaN(parsed.getTime())) {
        res.status(400).json({ error: "scheduledFor must be a valid ISO date-time" });
        return;
      }

      if (parsed.getTime() <= Date.now()) {
        res.status(400).json({ error: "scheduledFor must be in the future" });
        return;
      }

      scheduledDate = parsed;
    }

    const connection = marketingStore.connections.find((entry) => entry.key === platform);
    if (!connection || !connection.connected) {
      res.status(400).json({ error: "Platform is not connected" });
      return;
    }

    const post: MarketingPost = {
      id: getNextMarketingPostId(marketingStore.posts),
      platform,
      message: trimmedMessage,
      status: mode === "schedule" ? "scheduled" : mode === "queue" ? "queued" : "published",
      publishedAt: scheduledDate ? scheduledDate.toISOString() : new Date().toISOString(),
      scheduledFor: scheduledDate ? scheduledDate.toISOString() : undefined,
    };

    marketingStore.posts = [post, ...marketingStore.posts].slice(0, 30);
    if (post.status === "published") {
      connection.impressions7d += 140;
    }

    res.status(201).json({
      post,
      connections: marketingStore.connections,
      posts: marketingStore.posts,
    });
  });

  app.get("/api/pos/register", (_req, res) => {
    res.json(buildPosRegisterPayload(posStore));
  });

  app.get("/api/customers/store-credit", (req, res) => {
    const queryRaw = req.query.query;
    const query = typeof queryRaw === "string" ? queryRaw.trim().toLowerCase() : "";

    const results = customerCreditStore
      .filter((account) => {
        if (!query) {
          return true;
        }

        return account.name.toLowerCase().includes(query)
          || account.email.toLowerCase().includes(query)
          || account.phone.toLowerCase().includes(query);
      })
      .slice(0, 12);

    res.json({
      customers: results,
    });
  });

  app.post("/api/pos/cart/items", (req, res) => {
    const { productId } = req.body as { productId?: unknown };
    if (typeof productId !== "string" || productId.trim().length === 0) {
      res.status(400).json({ error: "productId is required" });
      return;
    }

    const product = posStore.products.find((item) => item.id === productId);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const existing = posStore.cart.find((line) => line.id === product.id);
    if (!existing) {
      posStore.cart.push({
        id: product.id,
        title: product.title,
        option: product.category === "Merchandise" ? "Standard" : "Paperback",
        qty: 1,
        unitPrice: product.price,
      });
    } else {
      existing.qty += 1;
    }

    res.status(201).json(buildPosRegisterPayload(posStore));
  });

  app.post("/api/pos/cart/custom", (req, res) => {
    const { id, title, option, unitPrice } = req.body as { id?: unknown; title?: unknown; option?: unknown; unitPrice?: unknown };
    if (typeof id !== "string" || typeof title !== "string" || typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0) {
      res.status(400).json({ error: "id, title, and a valid unitPrice are required" });
      return;
    }
    const existing = posStore.cart.find((line) => line.id === id);
    if (existing) {
      existing.qty += 1;
    } else {
      posStore.cart.push({ id, title, option: typeof option === "string" ? option : "Open Network order", qty: 1, unitPrice });
    }
    res.status(201).json(buildPosRegisterPayload(posStore));
  });

  app.patch("/api/pos/cart/items/:id", (req, res) => {
    const { id } = req.params;
    const { qtyDelta, qty } = req.body as { qtyDelta?: unknown; qty?: unknown };

    const existing = posStore.cart.find((line) => line.id === id);
    if (!existing) {
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    if (typeof qty === "number" && Number.isFinite(qty)) {
      existing.qty = Math.max(0, Math.floor(qty));
    } else if (typeof qtyDelta === "number" && Number.isFinite(qtyDelta)) {
      existing.qty = Math.max(0, existing.qty + Math.floor(qtyDelta));
    } else {
      res.status(400).json({ error: "qty or qtyDelta must be a number" });
      return;
    }

    posStore.cart = posStore.cart.filter((line) => line.qty > 0);
    res.json(buildPosRegisterPayload(posStore));
  });

  app.delete("/api/pos/cart/items/:id", (req, res) => {
    const { id } = req.params;
    posStore.cart = posStore.cart.filter((line) => line.id !== id);
    res.json(buildPosRegisterPayload(posStore));
  });

  app.post("/api/pos/cart/clear", (_req, res) => {
    posStore.cart = [];
    res.json(buildPosRegisterPayload(posStore));
  });

  app.post("/api/pos/checkout", async (req, res) => {
    const { tender, customerId, amountTendered } = req.body as {
      tender?: unknown;
      customerId?: unknown;
      amountTendered?: unknown;
    };
    if (!isPosTender(tender)) {
      res.status(400).json({ error: "tender must be cash, card, cashapp, po, or storecredit" });
      return;
    }

    const totals = getPosTotals(posStore);
    if (totals.total <= 0) {
      res.status(400).json({ error: "Cannot checkout an empty cart" });
      return;
    }

    if (tender === "card") {
      if (!isSquareConfigured()) {
        res.status(503).json({
          error: "Square is not configured on the server.",
          required: ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"],
        });
        return;
      }

      try {
        const checkoutUrl = await createSquareCheckoutLink({
          amountCents: Math.round(totals.total * 100),
          orderLabel: `Ghostlight POS Check #${posStore.checkNumber}`,
          note: `Items: ${posStore.cart.length}`,
        });

        res.json({
          checkoutUrl,
          message: "Square checkout link created",
          register: buildPosRegisterPayload(posStore),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Square checkout failed";
        res.status(502).json({ error: message });
      }
      return;
    }

    if (tender === "cash") {
      const received = Number(amountTendered);
      if (!Number.isFinite(received) || received < 0) {
        res.status(400).json({ error: "amountTendered must be a valid positive number for cash checkout" });
        return;
      }

      if (received < totals.total) {
        res.status(400).json({ error: `Cash tendered ${received.toFixed(2)} is less than the total ${totals.total.toFixed(2)}` });
        return;
      }

      const changeDue = Number((received - totals.total).toFixed(2));
      posStore.cart = [];
      posStore.checkNumber += 1;
      res.json({
        message: "cash payment captured",
        amountTendered: received,
        changeDue,
        register: buildPosRegisterPayload(posStore),
      });
      return;
    }

    if (tender === "storecredit") {
      if (typeof customerId !== "string" || customerId.trim().length === 0) {
        res.status(400).json({ error: "customerId is required for storecredit checkout" });
        return;
      }

      const account = customerCreditStore.find((customer) => customer.id === customerId);
      if (!account) {
        res.status(404).json({ error: "Customer credit account not found" });
        return;
      }

      if (account.storeCreditBalance < totals.total) {
        res.status(400).json({ error: `${account.name} has insufficient store credit` });
        return;
      }

      account.storeCreditBalance = Math.max(0, Number((account.storeCreditBalance - totals.total).toFixed(2)));
    }

    posStore.cart = [];
    posStore.checkNumber += 1;
    res.json({
      message: `${tender} payment captured`,
      register: buildPosRegisterPayload(posStore),
    });
  });

  app.post("/api/payments/square/checkout", async (req, res) => {
    try {
      if (!isSquareConfigured()) {
        res.status(503).json({
          error: "Square is not configured on the server.",
          required: ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"],
        });
        return;
      }

      const body = req.body as {
        amountCents?: unknown;
        orderLabel?: unknown;
        note?: unknown;
        redirectUrl?: unknown;
      };

      const amountCents = typeof body.amountCents === "number" ? body.amountCents : Number.NaN;
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        res.status(400).json({ error: "amountCents must be a positive number" });
        return;
      }

      const orderLabel = typeof body.orderLabel === "string" && body.orderLabel.trim().length > 0
        ? body.orderLabel.trim()
        : "Ghostlight POS Order";
      const note = typeof body.note === "string" ? body.note : undefined;
      const redirectUrl = typeof body.redirectUrl === "string" ? body.redirectUrl : undefined;

      const checkoutUrl = await createSquareCheckoutLink({
        amountCents: Math.round(amountCents),
        orderLabel,
        note,
        redirectUrl,
      });

      res.json({ checkoutUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Square checkout failed";
      res.status(502).json({ error: message });
    }
  });

  app.get("/api/payments/square/status", (_req, res) => {
    const missing: string[] = [];
    if (!process.env.SQUARE_ACCESS_TOKEN) {
      missing.push("SQUARE_ACCESS_TOKEN");
    }
    if (!process.env.SQUARE_LOCATION_ID) {
      missing.push("SQUARE_LOCATION_ID");
    }

    res.json({
      configured: missing.length === 0,
      environment: process.env.SQUARE_ENVIRONMENT ?? "sandbox",
      missing,
    });
  });

  // ==========================================
  // eBay Two-Way Integration & Concurrency API
  // ==========================================

  app.get("/api/auth/ebay/install", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const clientId = typeof req.query.clientId === "string" && req.query.clientId.trim() ? req.query.clientId.trim() : undefined;
      const ruName = typeof req.query.ruName === "string" && req.query.ruName.trim() ? req.query.ruName.trim() : undefined;
      const environment = req.query.environment === "production" ? "production" : "sandbox";

      const auth = await createEbayAuthUrl(storeId, clientId, ruName, environment);
      res.json(auth);
    } catch (error: any) {
      res.status(400).json({
        error: error.message || "Failed to generate eBay OAuth URL. Please ensure your App ID and RuName are entered.",
      });
    }
  });

  app.post("/api/ebay/save-token", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const { accessToken, refreshToken, environment } = req.body as {
        accessToken?: string;
        refreshToken?: string;
        environment?: "sandbox" | "production";
      };

      if (!accessToken || !accessToken.trim()) {
        res.status(400).json({ error: "Access Token is required." });
        return;
      }

      const result = await saveDirectEbayToken(storeId, accessToken, refreshToken, environment);
      res.json({ success: true, message: "eBay token saved successfully." });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/ebay/callback", async (req, res, next) => {
    try {
      const code = typeof req.query.code === "string" ? req.query.code : null;
      const stateParam = typeof req.query.state === "string" ? req.query.state : "";

      if (!code) {
        res.status(400).send("Missing authorization code from eBay.");
        return;
      }

      // Format: ebay_{storeId}_{stateHex}
      const parts = stateParam.split("_");
      const storeId = parts.length >= 3 ? parts[1] : "ghostlight-demo";

      await exchangeEbayCode(code, storeId);
      const clientUrl = env.CLIENT_APP_URL || "http://localhost:5173";
      res.redirect(`${clientUrl}/ebay?connected=true`);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/ebay/status", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const store = await prisma.store.findFirst({
        where: { OR: [{ id: storeId }, { slug: storeId }] },
        include: { ebayConfig: true },
      });

      const config = store?.ebayConfig;
      res.json({
        connected: Boolean(config?.encryptedTokens),
        environment: config?.environment || env.EBAY_ENVIRONMENT || "sandbox",
        appId: config?.appId || env.EBAY_APP_ID || null,
        ruName: config?.ruName || env.EBAY_REDIRECT_URI || null,
        fulfillmentPolicyId: config?.fulfillmentPolicyId || env.EBAY_DEFAULT_FULFILLMENT_POLICY_ID || null,
        paymentPolicyId: config?.paymentPolicyId || env.EBAY_DEFAULT_PAYMENT_POLICY_ID || null,
        returnPolicyId: config?.returnPolicyId || env.EBAY_DEFAULT_RETURN_POLICY_ID || null,
        highValueFulfillmentPolicyId: config?.highValueFulfillmentPolicyId || env.EBAY_HIGH_VALUE_FULFILLMENT_POLICY_ID || null,
        highValueThreshold: config?.highValueThreshold ?? env.EBAY_HIGH_VALUE_THRESHOLD ?? 250,
        merchantLocationKey: config?.merchantLocationKey || "STORE_MAIN",
        dailyRateLimitLimit: config?.dailyRateLimitLimit || 5000,
        dailyRateLimitRemaining: config?.dailyRateLimitRemaining || 5000,
        syncEnabled: config?.syncEnabled ?? true,
        autoPublishEnabled: config?.autoPublishEnabled ?? false,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ebay/config", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const store = await prisma.store.findFirst({
        where: { OR: [{ id: storeId }, { slug: storeId }] },
        select: { id: true },
      });
      const storePk = store?.id ?? storeId;

      const {
        environment,
        appId,
        certId,
        ruName,
        fulfillmentPolicyId,
        paymentPolicyId,
        returnPolicyId,
        highValueFulfillmentPolicyId,
        highValueThreshold,
        merchantLocationKey,
        syncEnabled,
        autoPublishEnabled,
      } = req.body as {
        environment?: string;
        appId?: string;
        certId?: string;
        ruName?: string;
        fulfillmentPolicyId?: string;
        paymentPolicyId?: string;
        returnPolicyId?: string;
        highValueFulfillmentPolicyId?: string;
        highValueThreshold?: number;
        merchantLocationKey?: string;
        syncEnabled?: boolean;
        autoPublishEnabled?: boolean;
      };

      const updated = await prisma.ebayIntegrationConfig.upsert({
        where: { storeId: storePk },
        create: {
          storeId: storePk,
          environment: environment === "production" ? "production" : "sandbox",
          appId: appId?.trim() || null,
          certId: certId?.trim() || null,
          ruName: ruName?.trim() || null,
          fulfillmentPolicyId: fulfillmentPolicyId?.trim() || null,
          paymentPolicyId: paymentPolicyId?.trim() || null,
          returnPolicyId: returnPolicyId?.trim() || null,
          highValueFulfillmentPolicyId: highValueFulfillmentPolicyId?.trim() || null,
          highValueThreshold: typeof highValueThreshold === "number" ? highValueThreshold : 250,
          merchantLocationKey: merchantLocationKey?.trim() || "STORE_MAIN",
          syncEnabled: syncEnabled ?? true,
          autoPublishEnabled: autoPublishEnabled ?? false,
        },
        update: {
          environment: environment === "production" ? "production" : "sandbox",
          ...(appId !== undefined ? { appId: appId.trim() || null } : {}),
          ...(certId !== undefined ? { certId: certId.trim() || null } : {}),
          ...(ruName !== undefined ? { ruName: ruName.trim() || null } : {}),
          ...(fulfillmentPolicyId !== undefined ? { fulfillmentPolicyId: fulfillmentPolicyId.trim() || null } : {}),
          ...(paymentPolicyId !== undefined ? { paymentPolicyId: paymentPolicyId.trim() || null } : {}),
          ...(returnPolicyId !== undefined ? { returnPolicyId: returnPolicyId.trim() || null } : {}),
          ...(highValueFulfillmentPolicyId !== undefined ? { highValueFulfillmentPolicyId: highValueFulfillmentPolicyId.trim() || null } : {}),
          ...(typeof highValueThreshold === "number" ? { highValueThreshold } : {}),
          ...(merchantLocationKey !== undefined ? { merchantLocationKey: merchantLocationKey.trim() || "STORE_MAIN" } : {}),
          ...(syncEnabled !== undefined ? { syncEnabled } : {}),
          ...(autoPublishEnabled !== undefined ? { autoPublishEnabled } : {}),
        },
      });

      res.json({ success: true, config: updated });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/ebay/listings", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const store = await prisma.store.findFirst({
        where: { OR: [{ id: storeId }, { slug: storeId }] },
        select: { id: true },
      });
      const storePk = store?.id ?? storeId;

      const [listings, catalog] = await Promise.all([
        prisma.ebayListing.findMany({ where: { storeId: storePk }, orderBy: { updatedAt: "desc" } }),
        prisma.isbnLookupCache.findMany({ select: { isbn: true, title: true, author: true, coverUrl: true, quantityOnHand: true, listPrice: true } }),
      ]);

      const catalogMap = new Map(catalog.map((c) => [c.isbn, c]));

      const results = listings.map((listing) => {
        const item = catalogMap.get(listing.isbn);
        return {
          id: listing.id,
          isbn: listing.isbn,
          sku: listing.sku,
          title: item?.title || "Book Title",
          author: item?.author || "Author",
          coverUrl: item?.coverUrl || null,
          quantityOnHand: item?.quantityOnHand ?? 0,
          price: listing.price || item?.listPrice || 0,
          listingStatus: listing.listingStatus,
          ebayItemId: listing.ebayItemId,
          ebayOfferId: listing.ebayOfferId,
          ebayUrl: listing.ebayUrl,
          lastSyncedAt: listing.lastSyncedAt?.toISOString() || null,
          lastError: listing.lastError,
          autoListExcluded: listing.autoListExcluded,
        };
      });

      res.json({ listings: results });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ebay/publish/:isbn", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const { priceOverride } = req.body as { priceOverride?: number };

      const result = await publishBookToEbay(storeId, req.params.isbn, priceOverride);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ebay/bulk-publish", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const { isbns } = req.body as { isbns: string[] };

      if (!Array.isArray(isbns) || isbns.length === 0) {
        res.status(400).json({ error: "isbns array is required." });
        return;
      }

      let published = 0;
      let failed = 0;
      const details: any[] = [];

      for (const isbn of isbns) {
        try {
          const pub = await publishBookToEbay(storeId, isbn);
          published++;
          details.push({ isbn, status: "SUCCESS", listingId: pub.listingId });
        } catch (err: any) {
          failed++;
          details.push({ isbn, status: "FAILURE", error: err.message });
        }
      }

      res.json({ success: true, published, failed, details });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ebay/delist/:isbn", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const result = await withdrawOffer(storeId, req.params.isbn);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ebay/toggle-exclude/:isbn", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const store = await prisma.store.findFirst({
        where: { OR: [{ id: storeId }, { slug: storeId }] },
        select: { id: true },
      });
      const storePk = store?.id ?? storeId;

      const listing = await prisma.ebayListing.findUnique({
        where: { storeId_isbn: { storeId: storePk, isbn: req.params.isbn } },
      });

      const nextExcluded = listing ? !listing.autoListExcluded : true;

      const updated = await prisma.ebayListing.upsert({
        where: { storeId_isbn: { storeId: storePk, isbn: req.params.isbn } },
        create: {
          storeId: storePk,
          isbn: req.params.isbn,
          sku: `BK-${req.params.isbn}`,
          price: 0,
          autoListExcluded: nextExcluded,
        },
        update: {
          autoListExcluded: nextExcluded,
        },
      });

      res.json({ success: true, isbn: req.params.isbn, autoListExcluded: updated.autoListExcluded });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/ebay/opportunities", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const store = await prisma.store.findFirst({
        where: { OR: [{ id: storeId }, { slug: storeId }] },
        select: { id: true },
      });
      const storePk = store?.id ?? storeId;

      const [opportunities, listings, catalog] = await Promise.all([
        prisma.ebayOpportunity.findMany({
          where: { storeId: storePk },
          orderBy: { opportunityScore: "desc" },
        }),
        prisma.ebayListing.findMany({
          where: { storeId: storePk },
          select: { isbn: true, listingStatus: true },
        }),
        prisma.isbnLookupCache.findMany({
          select: { isbn: true, coverUrl: true, quantityOnHand: true },
        }),
      ]);

      const listingStatusMap = new Map(listings.map((l) => [l.isbn, l.listingStatus]));
      const coverMap = new Map(catalog.map((c) => [c.isbn, c.coverUrl]));

      const results = opportunities.map((opp) => ({
        ...opp,
        coverUrl: coverMap.get(opp.isbn) || null,
        listingStatus: listingStatusMap.get(opp.isbn) || "UNLISTED",
      }));

      res.json({ opportunities: results });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ebay/opportunities/scan", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const force = req.body?.force === true;

      const scanResult = await scanInventoryOpportunities(storeId, force);
      res.json(scanResult);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/ebay/rules", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const store = await prisma.store.findFirst({
        where: { OR: [{ id: storeId }, { slug: storeId }] },
        select: { id: true },
      });
      const storePk = store?.id ?? storeId;

      const rules = await prisma.ebayListingRule.findMany({
        where: { storeId: storePk },
        orderBy: { createdAt: "desc" },
      });

      res.json({ rules });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ebay/rules", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const store = await prisma.store.findFirst({
        where: { OR: [{ id: storeId }, { slug: storeId }] },
        select: { id: true },
      });
      const storePk = store?.id ?? storeId;

      const body = req.body as {
        id?: string;
        name: string;
        enabled?: boolean;
        minPrice?: number | null;
        maxPrice?: number | null;
        minDaysInInventory?: number | null;
        requiredCondition?: string | null;
        mustHaveCoverImage?: boolean;
        includeKeywords?: string | null;
        excludeKeywords?: string | null;
        onlyFirstEditionOrSigned?: boolean;
        autoPublish?: boolean;
      };

      if (!body.name?.trim()) {
        res.status(400).json({ error: "Rule name is required." });
        return;
      }

      if (body.id) {
        const updated = await prisma.ebayListingRule.update({
          where: { id: body.id },
          data: {
            name: body.name.trim(),
            enabled: body.enabled ?? true,
            minPrice: body.minPrice,
            maxPrice: body.maxPrice,
            minDaysInInventory: body.minDaysInInventory,
            requiredCondition: body.requiredCondition?.trim() || null,
            mustHaveCoverImage: body.mustHaveCoverImage ?? true,
            includeKeywords: body.includeKeywords?.trim() || null,
            excludeKeywords: body.excludeKeywords?.trim() || null,
            onlyFirstEditionOrSigned: body.onlyFirstEditionOrSigned ?? false,
            autoPublish: body.autoPublish ?? false,
          },
        });
        res.json({ rule: updated });
        return;
      }

      const created = await prisma.ebayListingRule.create({
        data: {
          storeId: storePk,
          name: body.name.trim(),
          enabled: body.enabled ?? true,
          minPrice: body.minPrice,
          maxPrice: body.maxPrice,
          minDaysInInventory: body.minDaysInInventory,
          requiredCondition: body.requiredCondition?.trim() || null,
          mustHaveCoverImage: body.mustHaveCoverImage ?? true,
          includeKeywords: body.includeKeywords?.trim() || null,
          excludeKeywords: body.excludeKeywords?.trim() || null,
          onlyFirstEditionOrSigned: body.onlyFirstEditionOrSigned ?? false,
          autoPublish: body.autoPublish ?? false,
        },
      });

      res.status(201).json({ rule: created });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/ebay/rules/:id", async (req, res, next) => {
    try {
      await prisma.ebayListingRule.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ebay/rules/evaluate", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const dryRun = req.body?.dryRun !== false;

      const evalResult = await runRulesEvaluationForStore(storeId, dryRun);
      res.json(evalResult);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/ebay/logs", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const store = await prisma.store.findFirst({
        where: { OR: [{ id: storeId }, { slug: storeId }] },
        select: { id: true },
      });
      const storePk = store?.id ?? storeId;

      const logs = await prisma.ebaySyncLog.findMany({
        where: { storeId: storePk },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      res.json({ logs });
    } catch (error) {
      next(error);
    }
  });

  // eBay Webhook Handler
  app.get("/api/webhooks/ebay", (req, res) => {
    const challengeCode = typeof req.query.challenge_code === "string" ? req.query.challenge_code : "";
    const verificationToken = env.EBAY_DEV_ID || "colophon-verification-token";
    const endpointUrl = `${env.SHOPIFY_APP_URL || "https://colophon-api.onrender.com"}/api/webhooks/ebay`;

    if (!challengeCode) {
      res.status(400).send("Missing challenge_code");
      return;
    }

    const responseHash = handleEbayWebhookChallenge(challengeCode, verificationToken, endpointUrl);
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ challengeResponse: responseHash });
  });

  app.post("/api/webhooks/ebay", async (req, res, next) => {
    try {
      const storeId = "ghostlight-demo";
      const result = await processEbayWebhookEvent(storeId, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  // Concurrency Reservation Locks API
  app.post("/api/inventory/locks/acquire", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const { isbn, sku, source, ttlMinutes } = req.body as {
        isbn: string;
        sku: string;
        source: "POS_CHECKOUT" | "WEB_CART" | "EBAY_ORDER" | "SHOPIFY_ORDER";
        ttlMinutes?: number;
      };

      if (!isbn || !sku || !source) {
        res.status(400).json({ error: "isbn, sku, and source are required." });
        return;
      }

      const result = await acquireReservationLock(storeId, isbn, sku, source, ttlMinutes);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/inventory/locks/release", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const { isbn, source } = req.body as { isbn: string; source?: string };

      if (!isbn) {
        res.status(400).json({ error: "isbn is required." });
        return;
      }

      await releaseReservationLock(storeId, isbn, source);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/inventory/sale", async (req, res, next) => {
    try {
      const storeId = typeof req.query.storeId === "string" ? req.query.storeId : "ghostlight-demo";
      const { isbn, quantitySold, source } = req.body as {
        isbn: string;
        quantitySold?: number;
        source?: "POS" | "WEB";
      };

      if (!isbn) {
        res.status(400).json({ error: "isbn is required." });
        return;
      }

      const result = await handleLocalSaleAndSync(storeId, isbn, quantitySold ?? 1, source ?? "POS");
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.use(errorMiddleware);

  return app;
}

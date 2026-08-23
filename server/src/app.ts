import cors from "cors";
import express from "express";
import type { Prisma } from "@prisma/client";

import { errorMiddleware } from "./middleware/error.middleware.js";
import { env } from "./config/env.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { requireSuperAdmin, tenantContext } from "./middleware/tenantContext.js";
import { createStoreImpersonationSession, createUser, signIn } from "./services/auth.service.js";
import { prisma } from "./config/database.js";
import { lookupBookByIsbn, pullOpenLibraryMetadata } from "./services/isbnScanner.service.js";
import { createSquareCheckoutLink, isSquareConfigured } from "./services/squarePayment.service.js";
import { executeDropshipSettlement } from "./services/networkSettlement.service.js";
import { getStoreUspsAccountStatus, saveStoreUspsAccount } from "./services/storeShipping.service.js";
import { fetchStoreOrders, listEcommerceIntegrations, saveEcommerceIntegration, syncStoreInventory, type EcommercePlatform } from "./services/ecommerce.service.js";

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
    res.json({ status: "ok" });
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
      if (!email || !displayName || !password || password.length < 12 || !["ADMIN", "MANAGER", "CASHIER", "VIEWER"].includes(role ?? "")) {
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
      if (role !== undefined && !["ADMIN", "MANAGER", "CASHIER", "VIEWER"].includes(role)) { res.status(400).json({ error: "Invalid role." }); return; }
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
      res.json(await listEcommerceIntegrations(req.params.storeId));
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
      if (!storeUrl || !config) {
        res.status(400).json({ error: "storeUrl and platform credentials are required." });
        return;
      }
      await saveEcommerceIntegration(req.params.storeId, platform, storeUrl, config, syncInventory, syncOrders);
      res.status(204).send();
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

  app.get("/api/stores/:storeId/ecommerce/:platform/orders", async (req, res, next) => {
    try {
      res.json({ orders: await fetchStoreOrders(req.params.storeId, req.params.platform as EcommercePlatform) });
    } catch (error) {
      next(error);
    }
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
  
  app.get("/api/health/services", (_req, res) => {
    const marketingConnected = marketingStore.connections.filter((connection) => connection.connected).length;
    const marketingTotal = marketingStore.connections.length;
    const marketingStatus = marketingConnected === 0
      ? "red"
      : marketingConnected < marketingTotal
        ? "yellow"
        : "green";

    res.json({
      services: [
        { key: "ecommerce", label: "Ecommerce site", detail: "Shopify or connected storefront", status: "red" },
        { key: "payments", label: "Payment processor", detail: isSquareConfigured() ? "Square connected" : "No processor connected", status: isSquareConfigured() ? "green" : "red" },
        { key: "network", label: "Open Network", detail: "Shared inventory sync", status: "green" },
        { key: "marketing", label: "Marketing", detail: `${marketingConnected}/${marketingTotal} accounts connected`, status: marketingStatus },
      ],
    });
  });

  async function syncInventoryLookupCache(): Promise<void> {
    const books = await prisma.book.findMany({
      include: { inventoryItems: true },
    });

    for (const book of books) {
      const totalQuantity = book.inventoryItems.reduce((sum, item) => sum + item.quantityOnHand, 0);
      const primaryItem = book.inventoryItems.sort((a, b) => b.quantityOnHand - a.quantityOnHand)[0];

      await prisma.isbnLookupCache.upsert({
        where: { isbn: book.isbn13 },
        create: {
          isbn: book.isbn13,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          description: null,
          coverUrl: null,
          quantityOnHand: totalQuantity,
          thriftbooksPrice: null,
          listPrice: book.listPriceCents ? book.listPriceCents / 100 : null,
          condition: primaryItem?.condition ?? null,
          container: null,
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
          quantityOnHand: totalQuantity,
          listPrice: book.listPriceCents ? book.listPriceCents / 100 : null,
          condition: primaryItem?.condition ?? null,
          category: book.genre,
          sku: primaryItem?.sku ?? `BK-${book.isbn13}`,
          labelTitle: book.title,
          source: "database-sync",
        },
      });
    }
  }

  app.get("/api/inventory/active", async (_req, res, next) => {
    try {
      await syncInventoryLookupCache();
      const connectedStores = await prisma.store.count({ where: { subscriptionStatus: { in: ["trial", "active"] } } });
      const items = await prisma.isbnLookupCache.findMany({ where: { quantityOnHand: { gt: 0 } }, orderBy: { updatedAt: "desc" } });
      res.json({
        connectedStores: Math.max(connectedStores - 1, 0),
        items: items.map((item) => ({
          ...item,
          shopifyStatus: "Not connected",
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
      const input = req.body as { title?: string; author?: string; publisher?: string; description?: string; category?: string; subcategory?: string; mediaType?: string; seoKeywords?: string; seoTitle?: string; seoDescription?: string; catalogTags?: string };
      const product = await prisma.isbnLookupCache.update({ where: { isbn: req.params.isbn }, data: {
        title: input.title?.trim() || null, author: input.author?.trim() || null, publisher: input.publisher?.trim() || null, description: input.description?.trim() || null,
        category: input.category?.trim() || null, subcategory: input.subcategory?.trim() || null, mediaType: input.mediaType?.trim() || "Book", seoKeywords: input.seoKeywords?.trim() || null, seoTitle: input.seoTitle?.trim() || null, seoDescription: input.seoDescription?.trim() || null, catalogTags: input.catalogTags?.trim() || null,
      } });
      res.json(product);
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
      const { condition, listPrice, container, deviceId, stationName } = req.body as {
        condition?: string;
        listPrice?: number;
        container?: string;
        deviceId?: string;
        stationName?: string;
      };
      const item = await prisma.isbnLookupCache.update({
        where: { isbn: req.params.isbn },
        data: {
          quantityOnHand: { increment: 1 },
          condition: condition ?? null,
          listPrice: typeof listPrice === "number" ? listPrice : null,
          container: container ?? null,
        },
      });
      await prisma.scanEvent.create({
        data: {
          isbn: item.isbn,
          inventoryId: item.id,
          deviceId: deviceId?.trim() || "unknown-device",
          stationName: stationName?.trim() || null,
          condition: condition ?? "Unknown",
          listPrice: typeof listPrice === "number" ? listPrice : 0,
          container: container ?? "Unassigned",
        },
      });
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

  app.use(errorMiddleware);

  return app;
}

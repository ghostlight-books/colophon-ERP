import { prisma } from "../config/database.js";

export interface CustomerInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  marketingOptIn?: boolean;
  tags?: string | null;
  notes?: string | null;
  storeId?: string | null;
}

export async function listCustomers(filters: { query?: string; tag?: string; marketingOptIn?: boolean } = {}) {
  const where: Record<string, unknown> = {};

  if (filters.query) {
    const q = filters.query.trim();
    where.OR = [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }];
  }
  if (filters.tag) {
    where.tags = { contains: filters.tag };
  }
  if (typeof filters.marketingOptIn === "boolean") {
    where.marketingOptIn = filters.marketingOptIn;
  }

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { tradeIns: true } } },
  });

  return customers.map((c) => ({ ...c, tradeInCount: c._count.tradeIns }));
}

export async function getCustomer(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      creditTransactions: { orderBy: { createdAt: "desc" } },
      tradeIns: { orderBy: { createdAt: "desc" }, include: { items: true } },
    },
  });
}

export async function createCustomer(input: CustomerInput) {
  if (!input.name || !input.name.trim()) {
    throw new Error("A customer name is required.");
  }
  return prisma.customer.create({
    data: {
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      marketingOptIn: Boolean(input.marketingOptIn),
      tags: input.tags?.trim() || null,
      notes: input.notes?.trim() || null,
      storeId: input.storeId || null,
    },
  });
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.address !== undefined) data.address = input.address?.trim() || null;
  if (input.marketingOptIn !== undefined) data.marketingOptIn = Boolean(input.marketingOptIn);
  if (input.tags !== undefined) data.tags = input.tags?.trim() || null;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

  return prisma.customer.update({ where: { id }, data });
}

export async function deleteCustomer(id: string): Promise<{ success: boolean }> {
  await prisma.customer.delete({ where: { id } });
  return { success: true };
}

/**
 * Resolves a customer from loosely-provided contact info -- matches an
 * existing customer by email first, then phone, else creates a new one.
 * Returns null if no contact info was given at all, preserving the
 * anonymous/"Walk-in" path that already exists at every call site.
 */
export async function findOrCreateCustomerByContact(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<{ id: string; name: string } | null> {
  const name = input.name?.trim() || "";
  const email = input.email?.trim() || null;
  const phone = input.phone?.trim() || null;

  if (!name && !email && !phone) {
    return null;
  }

  if (email) {
    const existing = await prisma.customer.findFirst({ where: { email } });
    if (existing) return existing;
  }
  if (phone) {
    const existing = await prisma.customer.findFirst({ where: { phone } });
    if (existing) return existing;
  }

  return prisma.customer.create({
    data: { name: name || email || phone || "Walk-in Customer", email, phone },
  });
}

/**
 * The single place that mutates storeCreditBalance -- every credit-touching
 * code path (trade-ins, POS redemption, manual staff adjustments) goes
 * through here so the balance and its ledger can never drift apart.
 */
export async function adjustCustomerCredit(
  customerId: string,
  amount: number,
  reason: string,
  referenceId?: string | null,
): Promise<{ balanceAfter: number }> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new Error(`Customer ${customerId} not found.`);
  }

  const balanceAfter = Number((customer.storeCreditBalance + amount).toFixed(2));
  if (balanceAfter < 0) {
    throw new Error(`${customer.name} does not have enough store credit for this.`);
  }

  await prisma.$transaction([
    prisma.customer.update({ where: { id: customerId }, data: { storeCreditBalance: balanceAfter } }),
    prisma.customerCreditTransaction.create({
      data: { customerId, amount, balanceAfter, reason, referenceId: referenceId ?? null },
    }),
  ]);

  return { balanceAfter };
}

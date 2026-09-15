export interface CreditTransaction {
  id: string;
  customerId: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  referenceId: string | null;
  createdAt: string;
}

export interface TradeInItem {
  id: string;
  tradeInId: string;
  isbn: string;
  title: string | null;
  author: string | null;
  condition: string;
  sellPrice: number;
  buyOffer: number;
  createdAt: string;
}

export interface TradeIn {
  id: string;
  batchId: string;
  customerId: string | null;
  paymentMethod: string;
  totalPaid: number;
  itemCount: number;
  storeId: string | null;
  createdAt: string;
  items: TradeInItem[];
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  storeCreditBalance: number;
  marketingOptIn: boolean;
  tags: string | null;
  notes: string | null;
  storeId: string | null;
  createdAt: string;
  updatedAt: string;
  tradeInCount?: number;
}

export interface CustomerDetail extends Customer {
  creditTransactions: CreditTransaction[];
  tradeIns: TradeIn[];
}

export interface CustomerInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  marketingOptIn?: boolean;
  tags?: string | null;
  notes?: string | null;
}

function resolveApiUrl(endpointPath: string): string {
  const envBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  const path = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;

  if (envBase) {
    const cleanBase = envBase.replace(/\/+$/, "");
    if (cleanBase.endsWith("/api")) {
      return `${cleanBase}${path.startsWith("/api") ? path.slice(4) : path}`;
    }
    return `${cleanBase}${path.startsWith("/api") ? path : `/api${path}`}`;
  }

  return `http://localhost:4000${path.startsWith("/api") ? path : `/api${path}`}`;
}

export async function fetchCustomers(filters: { query?: string; tag?: string; marketingOptIn?: boolean } = {}): Promise<Customer[]> {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.tag) params.set("tag", filters.tag);
  if (typeof filters.marketingOptIn === "boolean") params.set("marketingOptIn", String(filters.marketingOptIn));

  const res = await fetch(resolveApiUrl(`/customers?${params.toString()}`));
  if (!res.ok) throw new Error("Failed to load customers.");
  const data = (await res.json()) as { customers: Customer[] };
  return data.customers;
}

export async function fetchCustomer(id: string): Promise<CustomerDetail> {
  const res = await fetch(resolveApiUrl(`/customers/${encodeURIComponent(id)}`));
  if (!res.ok) throw new Error("Failed to load this customer.");
  return res.json() as Promise<CustomerDetail>;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const res = await fetch(resolveApiUrl("/customers"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string })?.error || "Failed to create customer.");
  }
  return res.json() as Promise<Customer>;
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer> {
  const res = await fetch(resolveApiUrl(`/customers/${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string })?.error || "Failed to update customer.");
  }
  return res.json() as Promise<Customer>;
}

export async function deleteCustomer(id: string): Promise<void> {
  const res = await fetch(resolveApiUrl(`/customers/${encodeURIComponent(id)}`), { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete customer.");
}

export async function adjustCustomerCredit(id: string, amount: number, reason: string): Promise<{ balanceAfter: number }> {
  const res = await fetch(resolveApiUrl(`/customers/${encodeURIComponent(id)}/credit-adjustment`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string })?.error || "Failed to adjust store credit.");
  }
  return res.json() as Promise<{ balanceAfter: number }>;
}

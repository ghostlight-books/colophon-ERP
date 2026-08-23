export type PosCategoryTile = {
  id: string;
  label: string;
  itemCount: number;
  color: string;
};

export type PosProduct = {
  id: string;
  title: string;
  category: string;
  image: string;
  price: number;
  stock: number;
};

export type PartnerAvailabilityItem = {
  isbn: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  price: number;
  stock: number;
  storeName: string;
};

export type PosCartItem = {
  id: string;
  title: string;
  option: string;
  qty: number;
  unitPrice: number;
};

export type PosRegisterData = {
  checkNumber: number;
  taxRate: number;
  tabs: string[];
  categoryTiles: PosCategoryTile[];
  products: PosProduct[];
  cart: PosCartItem[];
  totals: {
    subtotal: number;
    tax: number;
    total: number;
  };
};

export type PosTenderType = "cash" | "card" | "cashapp" | "po" | "storecredit";

export type CustomerCreditAccount = {
  id: string;
  name: string;
  email: string;
  phone: string;
  storeCreditBalance: number;
};

type PosCheckoutResponse = {
  checkoutUrl?: string;
  message?: string;
  register?: PosRegisterData;
  amountTendered?: number;
  changeDue?: number;
  error?: string;
};

type CustomerCreditLookupResponse = {
  customers: CustomerCreditAccount[];
};

const rawBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const trimmedBase = rawBase.replace(/\/$/, "");
const apiRoot = trimmedBase.endsWith("/api") ? trimmedBase.slice(0, -4) : trimmedBase;

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    const errorMessage = (data as { error?: string }).error ?? `POS API request failed (${response.status})`;
    throw new Error(errorMessage);
  }
  return data;
}

export async function fetchPosRegister(): Promise<PosRegisterData> {
  const response = await fetch(`${apiRoot}/api/pos/register`);
  return parseResponse<PosRegisterData>(response);
}

export async function searchPartnerAvailability(query: string): Promise<PartnerAvailabilityItem[]> {
  const response = await fetch(`${apiRoot}/api/open-network/availability?query=${encodeURIComponent(query)}`);
  const data = await parseResponse<{ items: PartnerAvailabilityItem[] }>(response);
  return data.items;
}

export async function addPosCartItem(productId: string): Promise<PosRegisterData> {
  const response = await fetch(`${apiRoot}/api/pos/cart/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ productId }),
  });
  return parseResponse<PosRegisterData>(response);
}

export async function addPosCustomCartItem(item: { id: string; title: string; option: string; unitPrice: number }): Promise<PosRegisterData> {
  const response = await fetch(`${apiRoot}/api/pos/cart/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  return parseResponse<PosRegisterData>(response);
}

export async function updatePosCartItemQty(id: string, qtyDelta: number): Promise<PosRegisterData> {
  const response = await fetch(`${apiRoot}/api/pos/cart/items/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ qtyDelta }),
  });
  return parseResponse<PosRegisterData>(response);
}

export async function removePosCartItem(id: string): Promise<PosRegisterData> {
  const response = await fetch(`${apiRoot}/api/pos/cart/items/${id}`, {
    method: "DELETE",
  });
  return parseResponse<PosRegisterData>(response);
}

export async function clearPosCart(): Promise<PosRegisterData> {
  const response = await fetch(`${apiRoot}/api/pos/cart/clear`, {
    method: "POST",
  });
  return parseResponse<PosRegisterData>(response);
}

export async function fetchCustomerCreditAccounts(query: string): Promise<CustomerCreditAccount[]> {
  const response = await fetch(`${apiRoot}/api/customers/store-credit?query=${encodeURIComponent(query)}`);
  const data = await parseResponse<CustomerCreditLookupResponse>(response);
  return data.customers;
}

export async function checkoutPos(
  tender: PosTenderType,
  customerId?: string,
  amountTendered?: number,
): Promise<PosCheckoutResponse> {
  const response = await fetch(`${apiRoot}/api/pos/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tender, customerId, amountTendered }),
  });
  return parseResponse<PosCheckoutResponse>(response);
}

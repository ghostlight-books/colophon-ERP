import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  addPosCartItem,
  checkoutPos,
  clearPosCart,
  type CustomerCreditAccount,
  fetchPosRegister,
  fetchCustomerCreditAccounts,
  removePosCartItem,
  type PosCartItem,
  type PosCategoryTile,
  type PosProduct,
  type PosRegisterData,
  type PartnerAvailabilityItem,
  searchPartnerAvailability,
  type PosTenderType,
  updatePosCartItemQty,
} from "../services/posRegister.service";

const offlineDesignRegisterData: PosRegisterData = {
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
  totals: {
    subtotal: 58,
    tax: 4.93,
    total: 62.93,
  },
};

const offlineDesignCustomers: CustomerCreditAccount[] = [
  { id: "cust-100", name: "Harper Quinn", email: "harper@example.com", phone: "(615) 555-0130", storeCreditBalance: 64.5 },
  { id: "cust-101", name: "Eli Thomas", email: "eli@example.com", phone: "(615) 555-0184", storeCreditBalance: 21.25 },
  { id: "cust-102", name: "Mara Stein", email: "mara@example.com", phone: "(615) 555-0152", storeCreditBalance: 142.0 },
  { id: "cust-103", name: "Jordan Lee", email: "jordan@example.com", phone: "(615) 555-0101", storeCreditBalance: 8.75 },
];

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

const keypadItemTypes = ["Book", "Merch", "Food", "Donation", "Consigner Items", "Other"] as const;

const standardCashDenominations = [5, 10, 15, 20, 25];

function calculateClosestDenominationBundle(targetAmount: number): { total: number; breakdown: number[]; diff: number } {
  const roundedTarget = Math.max(0, Math.ceil(targetAmount));
  if (roundedTarget === 0) {
    return { total: 0, breakdown: [], diff: 0 };
  }

  const maxRange = roundedTarget + 100;
  const reachable: Array<{ sum: number; bills: number[] } | null> = Array(maxRange + 1).fill(null);
  reachable[0] = { sum: 0, bills: [] };

  for (let currentSum = 0; currentSum <= maxRange; currentSum += 1) {
    const current = reachable[currentSum];
    if (!current) {
      continue;
    }

    for (const denomination of standardCashDenominations) {
      const nextSum = currentSum + denomination;
      if (nextSum > maxRange) {
        continue;
      }

      const nextBills = [...current.bills, denomination];
      const existing = reachable[nextSum];
      if (!existing || nextBills.length < existing.bills.length) {
        reachable[nextSum] = { sum: nextSum, bills: nextBills };
      }
    }
  }

  let bestMatch: { total: number; breakdown: number[]; diff: number } = {
    total: 0,
    breakdown: [],
    diff: Number.POSITIVE_INFINITY,
  };

  for (let currentSum = roundedTarget; currentSum <= maxRange; currentSum += 1) {
    const candidate = reachable[currentSum];
    if (!candidate) {
      continue;
    }

    const diff = currentSum - roundedTarget;
    const breakdown = [...candidate.bills].sort((left, right) => right - left);
    const isBetter =
      diff < bestMatch.diff ||
      (diff === bestMatch.diff && breakdown.length < bestMatch.breakdown.length) ||
      (diff === bestMatch.diff && breakdown.length === bestMatch.breakdown.length && breakdown[0] > (bestMatch.breakdown[0] ?? 0));

    if (isBetter) {
      bestMatch = { total: currentSum, breakdown, diff };
    }
  }

  return bestMatch.diff === Number.POSITIVE_INFINITY
    ? { total: roundedTarget, breakdown: [roundedTarget], diff: roundedTarget }
    : bestMatch;
}

const POS_SALES_STORAGE_KEY = "colophon-pos-sales";

function persistCompletedPosSale(sale: {
  id: string;
  orderingDate: string;
  machineNo: string;
  salesPerson: string;
  totalProducts: number;
  totalItems: number;
  status: "Paid";
  totalAmount: string;
  section: "invoices";
}): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const raw = window.localStorage.getItem(POS_SALES_STORAGE_KEY);
    const existing = raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
    const next = [...existing, sale];
    window.localStorage.setItem(POS_SALES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // allow local-only fallback without breaking checkout
  }
}

function cloneOfflineRegisterData(): PosRegisterData {
  return {
    ...offlineDesignRegisterData,
    tabs: [...offlineDesignRegisterData.tabs],
    categoryTiles: offlineDesignRegisterData.categoryTiles.map((tile) => ({ ...tile })),
    products: offlineDesignRegisterData.products.map((product) => ({ ...product })),
    cart: offlineDesignRegisterData.cart.map((line) => ({ ...line })),
    totals: { ...offlineDesignRegisterData.totals },
  };
}

function calculateTotals(cart: PosCartItem[], taxRate: number): PosRegisterData["totals"] {
  const subtotal = cart.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  return {
    subtotal,
    tax,
    total,
  };
}

function PosRegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const [registerData, setRegisterData] = useState<PosRegisterData | null>(null);
  const [activeTab, setActiveTab] = useState<string>("Keypad");
  const [search, setSearch] = useState("");
  const [partnerItems, setPartnerItems] = useState<PartnerAvailabilityItem[]>([]);
  const [tender, setTender] = useState<PosTenderType>("card");
  const [manualKeypadEntry, setManualKeypadEntry] = useState({ type: "Book" as (typeof keypadItemTypes)[number], name: "", price: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [status, setStatus] = useState("POS synced.");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerMatches, setCustomerMatches] = useState<CustomerCreditAccount[]>([]);
  const [isCustomerLookupLoading, setIsCustomerLookupLoading] = useState(false);
  const [cashTendered, setCashTendered] = useState<string>("");
  const [cashKeypadEntry] = useState<string[]>(["7", "8", "9", "4", "5", "6", "1", "2", "3", "00", "0", ".", "⌫", "C"]);
  const quickTenderPresets = [20, 40, 50, 100];
  const quickManualItemPresets = ["Gift Card", "Donation", "Used Book", "Bookstore Fee", "Custom Sale"];
  const [isItemNameFocused, setIsItemNameFocused] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  async function loadRegister(): Promise<void> {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await Promise.race([
        fetchPosRegister(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Register request timed out. Check server connection.")), 8000);
        }),
      ]);

      setRegisterData(data);
      setIsOfflineMode(false);
      setActiveTab(data.tabs.includes("Keypad") ? "Keypad" : data.tabs.includes("Library") ? "Library" : data.tabs[0] ?? "Keypad");
      setStatus("POS synced.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed loading register data.";
      const fallback = cloneOfflineRegisterData();
      setRegisterData(fallback);
      setIsOfflineMode(true);
      setActiveTab(fallback.tabs.includes("Keypad") ? "Keypad" : fallback.tabs.includes("Library") ? "Library" : fallback.tabs[0] ?? "Keypad");
      setLoadError(`API unavailable. Running offline design mode. (${message})`);
      setStatus("Offline design mode active. Changes are local only.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRegister();
  }, []);

  const visibleCatalogItems = useMemo(() => {
    if (!registerData) {
      return [];
    }

    const query = search.trim().toLowerCase();

    return registerData.products.filter((item) => {
      const isCategoryMatch =
        activeTab === "Library" ||
        activeTab === "Keypad" ||
        activeTab === "Discounts" ||
        item.category === activeTab;

      const isSearchMatch =
        query.length === 0 || item.title.toLowerCase().includes(query) || item.category.toLowerCase().includes(query);

      return isCategoryMatch && isSearchMatch;
    });
  }, [activeTab, search]);

  const subtotal = registerData?.totals.subtotal ?? 0;
  const tax = registerData?.totals.tax ?? 0;
  const total = registerData?.totals.total ?? 0;
  const cashTenderedValue = useMemo(() => {
    const value = Number(cashTendered);
    return Number.isFinite(value) ? value : 0;
  }, [cashTendered]);
  const cashChangeDue = useMemo(
    () => (tender === "cash" ? Math.max(0, cashTenderedValue - total) : 0),
    [cashTenderedValue, tender, total],
  );
  const roundedCashChange = useMemo(() => Math.max(0, Math.ceil(cashChangeDue)), [cashChangeDue]);
  const actualChangeLabel = useMemo(() => (cashTenderedValue >= total ? money(cashChangeDue) : "$0.00"), [cashTenderedValue, total, cashChangeDue]);
  const denominationBreakdown = useMemo(
    () => calculateClosestDenominationBundle(roundedCashChange),
    [roundedCashChange],
  );
  const selectedCustomer = useMemo(
    () => customerMatches.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customerMatches, selectedCustomerId],
  );

  function handleCashKeypadInput(value: string): void {
    setCashTendered((current) => {
      if (value === "C") {
        return "";
      }

      if (value === "⌫") {
        return current.slice(0, -1);
      }

      if (value === ".") {
        if (current.includes(".")) {
          return current;
        }
        return current === "" ? "0." : `${current}.`;
      }

      if (value === "00") {
        return current === "" ? "0" : `${current}00`;
      }

      if (current === "0" && value !== ".") {
        return value;
      }

      return `${current}${value}`;
    });
  }

  useEffect(() => {
    if (tender !== "storecredit") {
      setCustomerQuery("");
      setSelectedCustomerId(null);
      setCustomerMatches([]);
      return;
    }

    if (isOfflineMode) {
      const query = customerQuery.trim().toLowerCase();
      const matches = offlineDesignCustomers
        .filter((customer) => {
          if (!query) {
            return true;
          }

          return customer.name.toLowerCase().includes(query)
            || customer.email.toLowerCase().includes(query)
            || customer.phone.toLowerCase().includes(query);
        })
        .slice(0, 12);

      setCustomerMatches(matches);
      setIsCustomerLookupLoading(false);
      return;
    }

    let active = true;
    void (async () => {
      setIsCustomerLookupLoading(true);
      try {
        const customers = await fetchCustomerCreditAccounts(customerQuery);
        if (!active) {
          return;
        }
        setCustomerMatches(customers);
      } catch (error) {
        if (!active) {
          return;
        }
        const errorMessage = error instanceof Error ? error.message : "Customer search failed.";
        setStatus(errorMessage);
      } finally {
        if (active) {
          setIsCustomerLookupLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [customerQuery, isOfflineMode, tender]);

  useEffect(() => {
    if (isOfflineMode || search.trim().length < 3) {
      setPartnerItems([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchPartnerAvailability(search).then((items) => {
        if (active) {
          setPartnerItems(items);
        }
      }).catch(() => {
        if (active) {
          setPartnerItems([]);
        }
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeTab, isOfflineMode, search]);

  async function runMutation(action: () => Promise<PosRegisterData>, message?: string): Promise<void> {
    setIsMutating(true);
    try {
      const data = await action();
      setRegisterData(data);
      if (message) {
        setStatus(message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "POS update failed.";
      setStatus(errorMessage);
    } finally {
      setIsMutating(false);
    }
  }

  async function addToCart(item: PosProduct): Promise<void> {
    if (isOfflineMode) {
      setRegisterData((current) => {
        if (!current) {
          return current;
        }

        const existing = current.cart.find((line) => line.id === item.id);
        const nextCart = existing
          ? current.cart.map((line) => (line.id === item.id ? { ...line, qty: line.qty + 1 } : line))
          : [
              ...current.cart,
              {
                id: item.id,
                title: item.title,
                option: item.category === "Merchandise" ? "Standard" : "Paperback",
                qty: 1,
                unitPrice: item.price,
              },
            ];

        return {
          ...current,
          cart: nextCart,
          totals: calculateTotals(nextCart, current.taxRate),
        };
      });
      setStatus(`${item.title} added (offline).`);
      return;
    }

    await runMutation(() => addPosCartItem(item.id), `${item.title} added.`);
  }

  async function addManualKeypadEntry(): Promise<void> {
    const name = manualKeypadEntry.name.trim();
    const priceValue = Number(manualKeypadEntry.price);

    if (name.length === 0) {
      setStatus("Enter an item name before adding the sale.");
      return;
    }

    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setStatus("Enter a valid price greater than zero before adding to the order.");
      return;
    }

    const itemLabel = name.length > 0 ? name : `${manualKeypadEntry.type} sale`;
    const nextEntry = {
      id: `manual-${manualKeypadEntry.type.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      title: itemLabel,
      option: manualKeypadEntry.type,
      qty: 1,
      unitPrice: priceValue,
    };

    if (isOfflineMode) {
      setRegisterData((current) => {
        if (!current) {
          return current;
        }

        const nextCart = [...current.cart, nextEntry];
        return {
          ...current,
          cart: nextCart,
          totals: calculateTotals(nextCart, current.taxRate),
        };
      });
      setStatus(`${itemLabel} added to the sale.`);
      setIsItemNameFocused(false);
      setManualKeypadEntry((current) => ({ ...current, name: "", price: "" }));
      return;
    }

    setRegisterData((current) => {
      if (!current) {
        return current;
      }

      const nextCart = [...current.cart, nextEntry];
      return {
        ...current,
        cart: nextCart,
        totals: calculateTotals(nextCart, current.taxRate),
      };
    });
    setStatus(`${itemLabel} added to the sale.`);
    setIsItemNameFocused(false);
    setManualKeypadEntry((current) => ({ ...current, name: "", price: "" }));
  }

  function finishItemNameEntry(): void {
    if (manualKeypadEntry.name.trim().length === 0) {
      setStatus("Enter an item name before submitting.");
      return;
    }

    setIsItemNameFocused(false);
    window.requestAnimationFrame(() => priceInputRef.current?.focus());
  }

  async function updateQty(id: string, delta: number): Promise<void> {
    if (isOfflineMode) {
      setRegisterData((current) => {
        if (!current) {
          return current;
        }

        const nextCart = current.cart
          .map((line) => (line.id === id ? { ...line, qty: Math.max(0, line.qty + delta) } : line))
          .filter((line) => line.qty > 0);

        return {
          ...current,
          cart: nextCart,
          totals: calculateTotals(nextCart, current.taxRate),
        };
      });
      return;
    }

    await runMutation(() => updatePosCartItemQty(id, delta));
  }

  async function removeLine(id: string): Promise<void> {
    if (isOfflineMode) {
      setRegisterData((current) => {
        if (!current) {
          return current;
        }

        const nextCart = current.cart.filter((line) => line.id !== id);
        return {
          ...current,
          cart: nextCart,
          totals: calculateTotals(nextCart, current.taxRate),
        };
      });
      setStatus("Line removed (offline).");
      return;
    }

    await runMutation(() => removePosCartItem(id), "Line removed.");
  }

  async function clearCart(): Promise<void> {
    if (isOfflineMode) {
      setRegisterData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          cart: [],
          totals: calculateTotals([], current.taxRate),
        };
      });
      setStatus("Sale cleared (offline).");
      return;
    }

    await runMutation(() => clearPosCart(), "Sale cleared.");
  }

  async function handleCheckout(): Promise<void> {
    if (tender === "storecredit" && !selectedCustomerId) {
      setStatus("Select a customer account for Store Credit.");
      return;
    }

    if (tender === "cash") {
      const amountReceived = Number(cashTendered);
      if (!Number.isFinite(amountReceived) || amountReceived < total) {
        setStatus(`Cash must cover the total of ${money(total)}.`);
        return;
      }
    }

    if (isOfflineMode) {
      const totalItems = registerData?.cart.reduce((sum, line) => sum + line.qty, 0) ?? 0;
      const totalProducts = registerData?.cart.length ?? 0;
      const totalAmount = registerData?.totals.total ?? total;
      const amountReceived = tender === "cash" ? Number(cashTendered) : totalAmount;
      const changeDue = tender === "cash" ? Math.max(0, amountReceived - totalAmount) : 0;

      persistCompletedPosSale({
        id: `POS-${Date.now()}`,
        orderingDate: new Date().toLocaleDateString("en-GB").replace(/\//g, "-"),
        machineNo: "POS",
        salesPerson: "Cashier",
        totalProducts,
        totalItems,
        status: "Paid",
        totalAmount: `$ ${totalAmount.toFixed(2)}`,
        section: "invoices",
      });

      setRegisterData((current) => {
        if (!current) {
          return current;
        }

        const nextCheck = current.checkNumber + 1;
        return {
          ...current,
          checkNumber: nextCheck,
          cart: [],
          totals: calculateTotals([], current.taxRate),
        };
      });

      if (tender === "cash") {
        setStatus(`Offline simulation: cash payment received ${money(amountReceived)}; change due ${money(changeDue)}.`);
        setCashTendered("");
        return;
      }

      setStatus(`Offline simulation: ${tender === "card" ? "card" : tender} checkout completed.`);
      return;
    }

    setIsPaying(true);
    try {
      const response = await checkoutPos(
        tender,
        tender === "storecredit" ? selectedCustomerId ?? undefined : undefined,
        tender === "cash" ? Number(cashTendered) : undefined,
      );

      const currentCart = registerData?.cart ?? [];
      const saleTotal = registerData?.totals.total ?? total;
      if (response.message && !response.checkoutUrl) {
        persistCompletedPosSale({
          id: `POS-${Date.now()}`,
          orderingDate: new Date().toLocaleDateString("en-GB").replace(/\//g, "-"),
          machineNo: "POS",
          salesPerson: "Cashier",
          totalProducts: currentCart.length,
          totalItems: currentCart.reduce((sum, line) => sum + line.qty, 0),
          status: "Paid",
          totalAmount: `$ ${saleTotal.toFixed(2)}`,
          section: "invoices",
        });
      }

      if (response.checkoutUrl) {
        window.open(response.checkoutUrl, "_blank", "noopener,noreferrer");
        setStatus("Square checkout opened.");
      }
      if (response.register) {
        setRegisterData(response.register);
      }
      if (response.message) {
        setStatus(
          tender === "cash" && typeof response.changeDue === "number"
            ? `${response.message} Change due ${money(response.changeDue)}.`
            : response.message,
        );
      }

      if (tender === "cash") {
        setCashTendered("");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Checkout failed.";
      setStatus(errorMessage);
    } finally {
      setIsPaying(false);
    }
  }

  if (isLoading) {
    return (
      <section className="relative h-[calc(100vh-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex h-full items-center justify-center gap-2 text-sm font-semibold text-slate-600">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          Loading register...
        </div>
      </section>
    );
  }

  if (!registerData) {
    return (
      <section className="relative h-[calc(100vh-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm font-semibold text-slate-700">Register failed to load</p>
          <p className="max-w-md text-xs text-slate-500">{loadError ?? "Unable to reach POS API."}</p>
          <button
            type="button"
            onClick={() => {
              void loadRegister();
            }}
            className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => {
              const fallback = cloneOfflineRegisterData();
              setRegisterData(fallback);
              setIsOfflineMode(true);
              setActiveTab(fallback.tabs.includes("Library") ? "Library" : fallback.tabs[0] ?? "Library");
              setStatus("Offline design mode active. Changes are local only.");
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Open Offline Mode
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="relative h-[calc(100vh-1.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className="grid h-full grid-cols-1 md:grid-cols-[62%_38%] lg:grid-cols-[68%_32%]">
        <div
          className={[
            "flex min-h-0 flex-col border-r border-slate-200 bg-slate-50",
          ].join(" ")}
        >
          <div className="border-b border-slate-200 bg-white px-4 pt-3">
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-600">
              {registerData.tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={[
                    "border-b-2 pb-2 transition active:scale-95",
                    activeTab === tab ? "border-sky-600 text-sky-600" : "border-transparent hover:text-slate-800",
                  ].join(" ")}
                >
                  {tab}
                </button>
              ))}
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search items"
                className="ml-auto h-9 w-44 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-sky-400 sm:w-52"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {activeTab === "Keypad" && search.trim().length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {keypadItemTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setManualKeypadEntry((current) => ({ ...current, type }))}
                      className={[
                        "rounded-xl border px-3 py-3 text-center text-sm font-semibold transition active:scale-[0.98]",
                        manualKeypadEntry.type === type
                          ? "border-sky-500 bg-sky-50 text-sky-700"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
                      ].join(" ")}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {quickManualItemPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setManualKeypadEntry((current) => ({
                          ...current,
                          type: current.type === "Other" ? "Other" : "Other",
                          name: preset,
                          price: current.price,
                        }));
                        setIsItemNameFocused(true);
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.98]"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <label className="block text-sm text-slate-600">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Item name
                    </span>
                    <input
                      ref={nameInputRef}
                      value={manualKeypadEntry.name}
                      onFocus={() => setIsItemNameFocused(true)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          finishItemNameEntry();
                        }
                      }}
                      onChange={(event) => setManualKeypadEntry((current) => ({ ...current, name: event.target.value }))}
                      placeholder={
                        manualKeypadEntry.type === "Donation"
                          ? "Donation note"
                          : manualKeypadEntry.type === "Book"
                            ? "Book title or ISBN"
                            : manualKeypadEntry.type === "Consigner Items"
                              ? "Consigner item description"
                              : "Item name"
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-700 outline-none focus:border-sky-400"
                    />
                  </label>

                  {isItemNameFocused ? (
                    <div className="mt-3 grid grid-cols-7 gap-2">
                      {[
                        "Q","W","E","R","T","Y","U",
                        "I","O","P","A","S","D","F",
                        "G","H","J","K","L","Z","X",
                        "C","V","B","N","M","Space","⌫","Clear","Enter",
                      ].map((key) => {
                      const isSpace = key === "Space";
                      const isClear = key === "Clear";
                      const isBackspace = key === "⌫";
                      const isEnter = key === "Enter";
                      const fullWidth = isSpace || isClear || isBackspace || isEnter;

                      return (
                        <button
                          key={key}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            if (isEnter) {
                              finishItemNameEntry();
                              return;
                            }

                            setManualKeypadEntry((current) => {
                              if (isClear) {
                                return { ...current, name: "" };
                              }

                              if (isBackspace) {
                                return { ...current, name: current.name.slice(0, -1) };
                              }

                              const nextChar = isSpace ? " " : key;
                              return { ...current, name: `${current.name}${nextChar}` };
                            });
                          }}
                          className={[
                            "rounded-lg border border-slate-200 bg-white px-1 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.99]",
                            isEnter ? "col-span-2 border-sky-200 bg-sky-50 text-sky-700" : fullWidth ? "col-span-2" : "",
                          ].join(" ")}
                        >
                          {isSpace ? "Space" : isClear ? "Clear" : isBackspace ? "⌫" : key}
                        </button>
                      );
                    })}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <label className="block text-sm text-slate-600">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Price
                    </span>
                    <input
                      ref={priceInputRef}
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualKeypadEntry.price}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (manualKeypadEntry.name.trim().length > 0 && Number(manualKeypadEntry.price) > 0) {
                            void addManualKeypadEntry();
                          }
                        }
                      }}
                      onChange={(event) => setManualKeypadEntry((current) => ({ ...current, price: event.target.value }))}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"
                    />
                  </label>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      ["7","8","9"],
                      ["4","5","6"],
                      ["1","2","3"],
                      ["00","0","."],
                      ["⌫","C"],
                    ].flat().map((key, index) => {
                      const isAction = key === "⌫" || key === "C";
                      return (
                        <button
                          key={`${key}-${index}`}
                          type="button"
                          onClick={() => {
                            setManualKeypadEntry((current) => {
                              if (key === "C") {
                                return { ...current, price: "" };
                              }

                              if (key === "⌫") {
                                return { ...current, price: current.price.slice(0, -1) };
                              }

                              if (key === ".") {
                                if (current.price.includes(".")) {
                                  return current;
                                }
                                return { ...current, price: current.price === "" ? "0." : `${current.price}.` };
                              }

                              if (key === "00") {
                                return { ...current, price: current.price === "" ? "0" : `${current.price}00` };
                              }

                              if (current.price === "0" && key !== ".") {
                                return { ...current, price: key };
                              }

                              return { ...current, price: `${current.price}${key}` };
                            });
                          }}
                          className={[
                            "rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.99]",
                            isAction ? "bg-slate-100" : "",
                          ].join(" ")}
                        >
                          {key}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReceiptPreview((current) => !current)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 active:scale-[0.99]"
                  >
                    {showReceiptPreview ? "Hide Receipt" : "Preview Receipt"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void addManualKeypadEntry();
                    }}
                    className="rounded-xl bg-sky-600 px-5 py-3 text-base font-semibold text-white hover:bg-sky-700 active:scale-[0.99]"
                  >
                    Add {manualKeypadEntry.type}
                  </button>
                </div>

                {showReceiptPreview ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Receipt Preview</p>
                    <div className="mt-2 space-y-2">
                      {(registerData?.cart ?? []).length === 0 ? (
                        <p className="text-sm text-slate-500">No items yet.</p>
                      ) : (
                        (registerData?.cart ?? []).map((line) => (
                          <div key={line.id} className="flex items-center justify-between text-sm text-slate-600">
                            <span>
                              {line.title} x{line.qty}
                            </span>
                            <span>{money(line.qty * line.unitPrice)}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-3 border-t border-slate-200 pt-2 text-sm text-slate-600">
                      <div className="flex items-center justify-between">
                        <span>Subtotal</span>
                        <span>{money(subtotal)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Tax</span>
                        <span>{money(tax)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-base font-bold text-slate-800">
                        <span>Total</span>
                        <span>{money(total)}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {registerData.categoryTiles.map((tile: PosCategoryTile) => (
                    <button
                      key={tile.id}
                      type="button"
                      className="h-40 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
                    >
                      <div className={`h-24 ${tile.color}`} />
                      <div className="p-2.5">
                        <p className="line-clamp-2 text-sm font-semibold text-slate-800">{tile.label}</p>
                        <p className="mt-2 text-xs text-slate-500">{tile.itemCount} items</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {visibleCatalogItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        void addToCart(item);
                      }}
                      disabled={isMutating}
                      className="h-40 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] disabled:opacity-70"
                    >
                      <img src={item.image} alt={item.title} className="h-24 w-full object-cover" />
                      <div className="p-2.5">
                        <p className="line-clamp-2 text-sm font-semibold text-slate-800">{item.title}</p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">{money(item.price)}</span>
                          <span className="text-slate-500">Stock {item.stock}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {visibleCatalogItems.length === 0 ? (
                  <p className="mt-4 rounded-xl bg-white p-3 text-sm text-slate-500">No catalog items match this filter.</p>
                ) : null}

                {partnerItems.length > 0 ? (
                  <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-sky-900">Open Network availability</h3>
                        <p className="mt-1 text-xs text-sky-700">These copies are held by partner stores and are not local stock.</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-sky-700">{partnerItems.length} found</span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {partnerItems.map((item) => (
                        <div key={`${item.isbn}-${item.storeName}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-100 bg-white p-3">
                          {item.coverUrl ? <img src={item.coverUrl} alt="" className="h-14 w-10 rounded object-cover" /> : <div className="h-14 w-10 rounded bg-slate-100" />}
                          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{item.title}</p><p className="text-xs text-slate-500">{item.author ?? "Author unavailable"} · {item.storeName} · {item.stock} available</p></div>
                          <span className="text-sm font-semibold text-slate-700">{money(item.price)}</span>
                          <button type="button" onClick={() => navigate(`/open-network/order?partner=${encodeURIComponent(item.storeName)}&isbn=${encodeURIComponent(item.isbn)}&title=${encodeURIComponent(item.title)}&price=${item.price}&cover=${encodeURIComponent(item.coverUrl ?? "")}`)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white">Order from Store</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <aside
          className={[
            "flex min-h-0 flex-col border-l border-slate-200 bg-white",
          ].join(" ")}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Current Sale</p>
              <p className="text-xs text-slate-500">#{registerData.checkNumber}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95">Save</button>
              <button
                type="button"
                onClick={() => {
                  void clearCart();
                }}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="space-y-2">
              {registerData.cart.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">No items added yet.</p>
              ) : (
                registerData.cart.map((line: PosCartItem) => (
                  <div key={line.id} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{line.title}</p>
                        <p className="text-xs text-slate-500">{line.option}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-700">{money(line.qty * line.unitPrice)}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            void updateQty(line.id, -1);
                          }}
                          disabled={isMutating}
                          className="h-7 w-7 rounded-md bg-slate-100 text-sm font-bold text-slate-700 transition hover:bg-slate-200 active:scale-95 disabled:opacity-60"
                        >
                          -
                        </button>
                        <span className="w-7 text-center text-sm font-semibold text-slate-700">{line.qty}</span>
                        <button
                          type="button"
                          onClick={() => {
                            void updateQty(line.id, 1);
                          }}
                          disabled={isMutating}
                          className="h-7 w-7 rounded-md bg-slate-100 text-sm font-bold text-slate-700 transition hover:bg-slate-200 active:scale-95 disabled:opacity-60"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void removeLine(line.id);
                        }}
                        className="text-xs font-semibold text-rose-600 transition hover:text-rose-700 active:scale-95"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 px-4 py-3">
            <div className="mb-2 grid grid-cols-5 gap-1.5">
              {([
                ["Cash", "cash"],
                ["Card", "card"],
                ["CashApp", "cashapp"],
                ["PO", "po"],
                ["Store", "storecredit"],
              ] as const).map(([label, value]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTender(value)}
                  className={[
                    "rounded-md px-1.5 py-1 text-[10px] font-semibold transition active:scale-95",
                    tender === value ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
            {tender === "cash" ? (
              <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Cash handed in
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={cashTendered}
                  onChange={(event) => setCashTendered(event.target.value)}
                  placeholder="$0.00"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-sky-400"
                />
                <div className="mt-3 rounded-md bg-white p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Change Due</p>
                  <p className="mt-1 text-2xl font-black tracking-tight text-slate-900">{actualChangeLabel}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-white px-2 py-1.5 text-[11px] text-slate-600">
                  <span>Exact change</span>
                  <span className="text-right font-semibold text-slate-800">{money(cashChangeDue)}</span>
                  <span>Rounded up</span>
                  <span className="text-right font-semibold text-slate-800">{money(roundedCashChange)}</span>
                </div>
                <div className="mt-3 rounded-md bg-white p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Closest change mix</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {denominationBreakdown.breakdown.length > 0 ? (
                      denominationBreakdown.breakdown.map((denomination, index) => (
                        <span
                          key={`${denomination}-${index}`}
                          className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900"
                        >
                          {denomination}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-slate-500">No change needed</span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {denominationBreakdown.breakdown.length > 0
                      ? `Suggested bundle: ${denominationBreakdown.breakdown.join(" + ")} = ${money(denominationBreakdown.total)}`
                      : "No change due."}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {quickTenderPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCashTendered(String(preset))}
                      className="rounded-md border border-slate-200 bg-sky-50 px-2 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 active:scale-95"
                    >
                      {money(preset)}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {cashKeypadEntry.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleCashKeypadInput(key)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-95"
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {tender === "storecredit" ? (
              <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <input
                  value={customerQuery}
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  placeholder="Search customer for store credit"
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-sky-400"
                />
                <div className="mt-1 max-h-24 space-y-1 overflow-y-auto">
                  {isCustomerLookupLoading ? (
                    <p className="text-[11px] text-slate-500">Searching customers...</p>
                  ) : null}
                  {!isCustomerLookupLoading && customerMatches.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No customers found.</p>
                  ) : null}
                  {customerMatches.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className={[
                        "flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[11px] transition",
                        selectedCustomerId === customer.id ? "bg-sky-100 text-sky-900" : "bg-white text-slate-600 hover:bg-slate-100",
                      ].join(" ")}
                    >
                      <span className="truncate pr-2">{customer.name}</span>
                      <span>{money(customer.storeCreditBalance)}</span>
                    </button>
                  ))}
                </div>
                {selectedCustomer ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Selected: {selectedCustomer.name} ({selectedCustomer.email})
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-1.5 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Tax</span>
                <span>{money(tax)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-800">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-slate-200 bg-white p-4">
            <button
              type="button"
              onClick={() => {
                void handleCheckout();
              }}
              disabled={isPaying || total <= 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 active:scale-[0.99] disabled:bg-slate-300"
            >
              {isPaying ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
              {tender === "card" ? "Pay" : "Charge"} {money(total)}
            </button>
          </div>
        </aside>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-md bg-white/90 px-3 py-1 text-center text-[11px] text-slate-600 shadow-sm">
        {isOfflineMode ? `Offline: ${status}` : status}
      </p>
    </section>
  );
}

export default PosRegisterPage;

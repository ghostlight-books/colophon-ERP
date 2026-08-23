import { useEffect, useMemo, useState } from "react";

import StatusPill from "../components/ui/StatusPill";
import SurfaceCard from "../components/ui/SurfaceCard";

type SalesTabKey = "orders" | "invoices" | "promotions" | "inventory" | "returns" | "loyalty";
type OrderStatus = "Sales Order" | "Quotation Sent" | "Paid" | "Refunded";

type SalesRow = {
  id: string;
  orderingDate: string;
  machineNo: string;
  salesPerson: string;
  totalProducts: number;
  totalItems: number;
  status: OrderStatus;
  totalAmount: string;
  section: SalesTabKey;
};

type CashDrawerState = {
  openingFloat: number;
  actualEndingCash: number;
};

const SALES_STORAGE_KEY = "colophon-pos-sales";
const CASH_DRAWER_STORAGE_KEY = "colophon-cash-drawer";

function parseCurrencyValue(amount: string): number {
  return Number(amount.replace(/[^\d.-]/g, "")) || 0;
}

function readPersistedSales(): SalesRow[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SALES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SalesRow[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((sale): sale is SalesRow => Boolean(sale && typeof sale.id === "string"));
  } catch {
    return [];
  }
}

const salesTabs: Array<{ key: SalesTabKey; label: string }> = [
  { key: "orders", label: "Orders" },
  { key: "invoices", label: "Invoices" },
  { key: "promotions", label: "Promotions and Discounts" },
  { key: "inventory", label: "Inventory" },
  { key: "returns", label: "Returns and Refunds" },
  { key: "loyalty", label: "Loyalty Program" },
];

const initialRows: SalesRow[] = [
  {
    id: "0192223",
    orderingDate: "20-04-2024",
    machineNo: "02",
    salesPerson: "Avery",
    totalProducts: 2,
    totalItems: 10,
    status: "Quotation Sent",
    totalAmount: "$ 1,014.00",
    section: "orders",
  },
  {
    id: "0192224",
    orderingDate: "20-04-2024",
    machineNo: "01",
    salesPerson: "Sarah",
    totalProducts: 5,
    totalItems: 12,
    status: "Sales Order",
    totalAmount: "$ 786.00",
    section: "orders",
  },
  {
    id: "INV-3211",
    orderingDate: "18-04-2024",
    machineNo: "03",
    salesPerson: "Nora",
    totalProducts: 3,
    totalItems: 7,
    status: "Paid",
    totalAmount: "$ 562.00",
    section: "invoices",
  },
  {
    id: "RET-2210",
    orderingDate: "17-04-2024",
    machineNo: "02",
    salesPerson: "Avery",
    totalProducts: 1,
    totalItems: 1,
    status: "Refunded",
    totalAmount: "$ 18.00",
    section: "returns",
  },
  {
    id: "LOY-1180",
    orderingDate: "16-04-2024",
    machineNo: "01",
    salesPerson: "Kai",
    totalProducts: 4,
    totalItems: 4,
    status: "Paid",
    totalAmount: "$ 142.00",
    section: "loyalty",
  },
  {
    id: "PROMO-900",
    orderingDate: "15-04-2024",
    machineNo: "04",
    salesPerson: "Mina",
    totalProducts: 8,
    totalItems: 14,
    status: "Sales Order",
    totalAmount: "$ 1,220.00",
    section: "promotions",
  },
  {
    id: "STK-503",
    orderingDate: "14-04-2024",
    machineNo: "05",
    salesPerson: "Lee",
    totalProducts: 15,
    totalItems: 35,
    status: "Sales Order",
    totalAmount: "$ 2,458.00",
    section: "inventory",
  },
];

function InventoryPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<SalesTabKey>("orders");
  const [year, setYear] = useState(2024);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<SalesRow[]>(() => {
    const persisted = readPersistedSales();
    const merged = [...initialRows, ...persisted];
    return merged.filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index);
  });
  const [cashDrawer, setCashDrawer] = useState<CashDrawerState>(() => {
    if (typeof window === "undefined") {
      return { openingFloat: 250, actualEndingCash: 250 };
    }

    try {
      const raw = window.localStorage.getItem(CASH_DRAWER_STORAGE_KEY);
      if (!raw) {
        return { openingFloat: 250, actualEndingCash: 250 };
      }

      const parsed = JSON.parse(raw) as Partial<CashDrawerState>;
      return {
        openingFloat: Number(parsed.openingFloat) || 250,
        actualEndingCash: Number(parsed.actualEndingCash) || 250,
      };
    } catch {
      return { openingFloat: 250, actualEndingCash: 250 };
    }
  });
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const visibleRows = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    return rows.filter((row) => {
      const inTab = row.section === activeTab || activeTab === "orders";
      if (!inTab) {
        return false;
      }
      if (!lowered) {
        return true;
      }
      return (
        row.id.toLowerCase().includes(lowered) ||
        row.salesPerson.toLowerCase().includes(lowered) ||
        row.status.toLowerCase().includes(lowered)
      );
    });
  }, [activeTab, rows, search]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visibleRows.slice(start, start + pageSize);
  }, [page, visibleRows]);

  const cashSalesTotal = useMemo(() => {
    return rows
      .filter((row) => row.status === "Paid" || row.status === "Refunded")
      .reduce((sum, row) => sum + parseCurrencyValue(row.totalAmount), 0);
  }, [rows]);

  const refundedTotal = useMemo(() => {
    return rows
      .filter((row) => row.status === "Refunded")
      .reduce((sum, row) => sum + parseCurrencyValue(row.totalAmount), 0);
  }, [rows]);

  const expectedEndingCash = useMemo(
    () => cashDrawer.openingFloat + cashSalesTotal - refundedTotal,
    [cashDrawer.openingFloat, cashSalesTotal, refundedTotal],
  );

  const overShortAmount = useMemo(
    () => cashDrawer.actualEndingCash - expectedEndingCash,
    [cashDrawer.actualEndingCash, expectedEndingCash],
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CASH_DRAWER_STORAGE_KEY, JSON.stringify(cashDrawer));
    }
  }, [cashDrawer]);

  const createOrder = (): void => {
    const nextId = `ORD-${1000 + rows.length}`;
    const newRow: SalesRow = {
      id: nextId,
      orderingDate: new Date().toLocaleDateString("en-GB").replace(/\//g, "-"),
      machineNo: "01",
      salesPerson: "Sarah",
      totalProducts: 2,
      totalItems: 3,
      status: "Sales Order",
      totalAmount: "$ 120.00",
      section: activeTab,
    };
    setRows((current) => [newRow, ...current]);
    setPage(1);
  };

  const cycleYear = (): void => {
    setYear((current) => (current >= 2026 ? 2023 : current + 1));
  };

  const advanceStatus = (id: string): void => {
    setRows((current): SalesRow[] => {
      const nextRows: SalesRow[] = current.map((row): SalesRow => {
        if (row.id !== id) {
          return row;
        }

        const nextStatus: OrderStatus =
          row.status === "Quotation Sent"
            ? "Sales Order"
            : row.status === "Sales Order"
              ? "Paid"
              : row.status === "Paid"
                ? "Refunded"
                : row.status;

        const nextSection: SalesTabKey =
          nextStatus === "Paid"
            ? "invoices"
            : nextStatus === "Refunded"
              ? "returns"
              : row.section;

        return { ...row, status: nextStatus, section: nextSection };
      });

      const persistedSales = nextRows.filter((row) => row.id.startsWith("POS-"));
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(persistedSales));
      }

      return nextRows;
    });
  };

  const refundSale = (id: string): void => {
    setRows((current): SalesRow[] => {
      const nextRows: SalesRow[] = current.map((row): SalesRow => {
        if (row.id !== id || row.status !== "Paid") {
          return row;
        }

        return { ...row, status: "Refunded", section: "returns" };
      });

      const persistedSales = nextRows.filter((row) => row.id.startsWith("POS-"));
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(persistedSales));
      }

      return nextRows;
    });
  };

  return (
    <section className="grid gap-4">
      <div className="rounded-full bg-white/55 p-1.5">
        <div className="flex flex-wrap items-center gap-2 text-[1.02rem] font-semibold text-slate-500">
          {salesTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setPage(1);
              }}
              className={[
                "rounded-full px-4 py-2.5",
                activeTab === tab.key ? "bg-white shadow-[0_5px_14px_rgba(76,86,103,0.12)] text-slate-700" : "hover:bg-white/70",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <SurfaceCard className="p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={createOrder}
            className="rounded-full bg-white px-5 py-2 text-[1.02rem] font-semibold text-slate-600"
          >
            Create New Order +
          </button>
          <div className="ml-auto flex items-center gap-2">
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search id, person, status"
              className="h-10 w-56 rounded-xl bg-white px-3 text-sm text-slate-600 outline-none"
            />
            <button type="button" onClick={cycleYear} className="rounded-xl bg-white px-4 py-2 text-[1.02rem] font-semibold text-slate-500">
              {year} ▾
            </button>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm text-slate-600">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Opening Float</span>
            <input
              type="number"
              step="0.01"
              value={cashDrawer.openingFloat}
              onChange={(event) => setCashDrawer((current) => ({ ...current, openingFloat: Number(event.target.value) || 0 }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"
            />
          </label>
          <label className="block text-sm text-slate-600">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Actual Ending Cash</span>
            <input
              type="number"
              step="0.01"
              value={cashDrawer.actualEndingCash}
              onChange={(event) => setCashDrawer((current) => ({ ...current, actualEndingCash: Number(event.target.value) || 0 }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"
            />
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Expected vs Actual</p>
            <p className="mt-1 text-lg font-bold text-slate-800">{`$${overShortAmount.toFixed(2)}`}</p>
            <p className="text-[11px] text-slate-500">Expected: ${expectedEndingCash.toFixed(2)}</p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="overflow-hidden px-0 py-0">
        <table className="w-full border-collapse text-[0.96rem]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {[
                "Order ID",
                "Ordering Date",
                "POS Machine No",
                "Sales Person",
                "Total Products",
                "Total Items",
                "Status",
                "Total Amount (Inc. Tax)",
              ].map((head) => (
                <th key={head} className="px-5 py-4 text-left font-semibold">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const highlight = row.status === "Quotation Sent";
              return (
                <tr key={row.id} className="border-t border-slate-100 bg-white">
                  <td className="px-5 py-4 text-slate-600">{row.id}</td>
                  <td className="px-5 py-4 text-slate-600">{row.orderingDate}</td>
                  <td className="px-5 py-4 text-slate-600">{row.machineNo}</td>
                  <td className="px-5 py-4 text-slate-600">{row.salesPerson}</td>
                  <td className="px-5 py-4 text-slate-600">{row.totalProducts}</td>
                  <td className="px-5 py-4 text-slate-600">{row.totalItems}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => advanceStatus(row.id)}>
                        <StatusPill label={row.status} tone={highlight ? "amber" : row.status === "Refunded" ? "rose" : "mint"} />
                      </button>
                      {row.status === "Paid" ? (
                        <button
                          type="button"
                          onClick={() => refundSale(row.id)}
                          className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Refund
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-4 font-medium text-slate-600">{row.totalAmount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SurfaceCard>

      <div className="flex items-center gap-2 rounded-full bg-white/45 p-1.5 w-fit">
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-400"
        >
          ‹
        </button>
        {Array.from({ length: totalPages }).map((_, index) => (
          <button
            key={index + 1}
            type="button"
            onClick={() => setPage(index + 1)}
            className={[
              "h-10 w-12 rounded-full text-sm font-semibold",
              page === index + 1 ? "bg-[#e9ff63] text-slate-700" : "bg-white/70 text-slate-500",
            ].join(" ")}
          >
            {index + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-500"
        >
          ›
        </button>
      </div>
    </section>
  );
}

export default InventoryPage;
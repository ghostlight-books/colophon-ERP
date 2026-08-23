import { useEffect, useMemo, useState } from "react";

import MetricCard from "../components/ui/MetricCard";
import SurfaceCard from "../components/ui/SurfaceCard";

type PeriodKey = "month" | "last-month" | "quarter";

type Transaction = {
  id: string;
  name: string;
  amount: number;
  date: string;
  reconciled: boolean;
};

type Bill = {
  id: string;
  label: string;
  amount: number;
  due: string;
  paid: boolean;
};

type ReportTransaction = Transaction & { accountCode: string; direction: string };

const periodLabel: Record<PeriodKey, string> = {
  month: "This Month",
  "last-month": "Last Month",
  quarter: "This Quarter",
};

const seedTransactions: Transaction[] = [
  { id: "TX-100", name: "POS Closing Batch", amount: 2940, date: "Today", reconciled: false },
  { id: "TX-099", name: "Publisher Invoice", amount: -1260, date: "Yesterday", reconciled: false },
  { id: "TX-098", name: "Online Orders Settlement", amount: 890, date: "Yesterday", reconciled: true },
];

const seedBills: Bill[] = [
  { id: "B-310", label: "Store Rent", amount: 4200, due: "Aug 22", paid: false },
  { id: "B-311", label: "Utilities", amount: 680, due: "Aug 24", paid: false },
  { id: "B-312", label: "Supplier: Orbit Books", amount: 1940, due: "Aug 28", paid: false },
];

function money(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function FinancePage(): JSX.Element {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [transactions, setTransactions] = useState<Transaction[]>(seedTransactions);
  const [bills, setBills] = useState<Bill[]>(seedBills);
  const [reportTransactions, setReportTransactions] = useState<ReportTransaction[]>([]);
  const [sortKey, setSortKey] = useState<keyof ReportTransaction>("date");
  const [sortAscending, setSortAscending] = useState(false);

  useEffect(() => {
    void fetch(`${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api"}/finance/report`)
      .then((response) => response.json())
      .then((payload: { transactions?: ReportTransaction[] }) => setReportTransactions(payload.transactions ?? []))
      .catch(() => setReportTransactions([]));
  }, []);

  const sortedReportTransactions = useMemo(() => [...reportTransactions].sort((left, right) => {
    const leftValue = String(left[sortKey]);
    const rightValue = String(right[sortKey]);
    return (leftValue.localeCompare(rightValue, undefined, { numeric: true }) || 0) * (sortAscending ? 1 : -1);
  }), [reportTransactions, sortAscending, sortKey]);

  const cashOnHand = useMemo(() => transactions.reduce((sum, tx) => sum + tx.amount, 34220), [transactions]);
  const payables = useMemo(() => bills.filter((bill) => !bill.paid).reduce((sum, bill) => sum + bill.amount, 0), [bills]);
  const reconciledCount = useMemo(() => transactions.filter((tx) => tx.reconciled).length, [transactions]);
  const margin = useMemo(() => {
    const income = transactions.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
    const expense = Math.abs(transactions.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + tx.amount, 0));
    if (income <= 0) {
      return "0.0%";
    }
    return `${(((income - expense) / income) * 100).toFixed(1)}%`;
  }, [transactions]);

  const reconcile = (id: string): void => {
    setTransactions((current) =>
      current.map((tx) => {
        if (tx.id !== id) {
          return tx;
        }
        return { ...tx, reconciled: !tx.reconciled };
      }),
    );
  };

  const addManualPosting = (): void => {
    const posting: Transaction = {
      id: `TX-${100 + transactions.length}`,
      name: "Manual Journal Entry",
      amount: 240,
      date: "Today",
      reconciled: false,
    };
    setTransactions((current) => [posting, ...current]);
  };

  const markBillPaid = (id: string): void => {
    setBills((current) =>
      current.map((bill) => {
        if (bill.id !== id) {
          return bill;
        }
        return { ...bill, paid: true };
      }),
    );
  };

  return (
    <section className="grid gap-6">
      <SurfaceCard className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {([
            ["month", "This Month"],
            ["last-month", "Last Month"],
            ["quarter", "This Quarter"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={[
                "rounded-full px-4 py-2 text-sm font-semibold",
                period === key ? "bg-[#e9ff63] text-slate-700" : "bg-white text-slate-500",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={addManualPosting}
            className="ml-auto rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Add Manual Posting
          </button>
        </div>
      </SurfaceCard>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <MetricCard label={`Cash on Hand (${periodLabel[period]})`} value={money(cashOnHand)} delta="+2.1%" tone="mint" />
        <MetricCard label="Payables" value={money(payables)} delta="-1.4%" tone="amber" />
        <MetricCard label="Margin" value={margin} delta="+0.9%" tone="violet" />
        <MetricCard label="Reconciled Entries" value={String(reconciledCount)} delta="+1.0%" tone="rose" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SurfaceCard>
          <h2 className="text-xl font-semibold text-slate-900">Recent Transactions</h2>
          <p className="text-sm text-slate-500">Latest postings across registers and invoices.</p>

          <div className="mt-5 space-y-3">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{tx.name}</p>
                  <p className="text-xs text-slate-500">{tx.date}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-700">{tx.amount >= 0 ? `+${money(tx.amount)}` : `-${money(Math.abs(tx.amount))}`}</p>
                  <button
                    type="button"
                    onClick={() => reconcile(tx.id)}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      tx.reconciled ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-500",
                    ].join(" ")}
                  >
                    {tx.reconciled ? "Reconciled" : "Mark Reconciled"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-xl font-semibold text-slate-900">Upcoming Bills</h2>
          <p className="text-sm text-slate-500">Due in the next 14 days.</p>

          <ul className="mt-5 space-y-3">
            {bills.map((bill) => (
              <li key={bill.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">{bill.label}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{money(bill.amount)}</span>
                  <span>{bill.due}</span>
                </div>
                <button
                  type="button"
                  onClick={() => markBillPaid(bill.id)}
                  disabled={bill.paid}
                  className={[
                    "mt-2 rounded-full px-3 py-1 text-xs font-semibold",
                    bill.paid ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-600",
                  ].join(" ")}
                >
                  {bill.paid ? "Paid" : "Mark Paid"}
                </button>
              </li>
            ))}
          </ul>
        </SurfaceCard>
      </div>

      <SurfaceCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-semibold text-slate-900">Sortable Transaction Report</h2><p className="text-sm text-slate-500">Live entries from the accounting ledger.</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{sortedReportTransactions.length} records</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400"><tr>{([["name", "Transaction"], ["accountCode", "Account"], ["amount", "Amount"], ["date", "Date"], ["reconciled", "Status"]] as const).map(([key, label]) => <th key={key} className="px-3 py-2"><button type="button" onClick={() => { const nextKey = key as keyof ReportTransaction; setSortAscending(nextKey === sortKey ? !sortAscending : false); setSortKey(nextKey); }} className="font-semibold hover:text-slate-700">{label}</button></th>)}</tr></thead>
            <tbody>{sortedReportTransactions.map((transaction) => <tr key={transaction.id} className="bg-white/70 text-slate-700"><td className="rounded-l-xl px-3 py-3 font-semibold">{transaction.name}</td><td className="px-3 py-3">{transaction.accountCode}</td><td className="px-3 py-3 font-semibold">{money(transaction.amount)}</td><td className="px-3 py-3">{transaction.date}</td><td className="rounded-r-xl px-3 py-3">{transaction.reconciled ? "Reconciled" : "Needs review"}</td></tr>)}</tbody>
          </table>
          {sortedReportTransactions.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No persisted accounting transactions yet.</p> : null}
        </div>
      </SurfaceCard>
    </section>
  );
}

export default FinancePage;
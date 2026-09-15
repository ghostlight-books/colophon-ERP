import { useEffect, useMemo, useState } from "react";
import SurfaceCard from "../components/ui/SurfaceCard";
import {
  fetchCustomers,
  fetchCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  adjustCustomerCredit,
  type Customer,
  type CustomerDetail,
  type CustomerInput,
} from "../services/customer.service";

type SortField = "name" | "storeCreditBalance" | "tradeInCount" | "createdAt";
type SortDirection = "asc" | "desc";
type OptInFilter = "all" | "opted-in" | "not-opted-in";

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "--" : d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const emptyForm: CustomerInput = { name: "", email: "", phone: "", address: "", marketingOptIn: false, tags: "", notes: "" };

function CustomersPage(): JSX.Element {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [optInFilter, setOptInFilter] = useState<OptInFilter>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CustomerInput>(emptyForm);
  const [createBusy, setCreateBusy] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [editForm, setEditForm] = useState<CustomerInput>(emptyForm);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);

  const loadCustomers = async (): Promise<void> => {
    setLoading(true);
    try {
      const list = await fetchCustomers();
      setCustomers(list);
    } catch {
      setErrorMessage("Failed to load customers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const handleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tag = tagFilter.trim().toLowerCase();
    const filtered = customers.filter((c) => {
      if (q && ![c.name, c.email, c.phone].filter(Boolean).some((v) => v!.toLowerCase().includes(q))) return false;
      if (tag && !(c.tags ?? "").toLowerCase().includes(tag)) return false;
      if (optInFilter === "opted-in" && !c.marketingOptIn) return false;
      if (optInFilter === "not-opted-in" && c.marketingOptIn) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "storeCreditBalance":
          cmp = a.storeCreditBalance - b.storeCreditBalance;
          break;
        case "tradeInCount":
          cmp = (a.tradeInCount ?? 0) - (b.tradeInCount ?? 0);
          break;
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [customers, search, tagFilter, optInFilter, sortField, sortDirection]);

  const stats = useMemo(() => {
    const optedIn = customers.filter((c) => c.marketingOptIn).length;
    const totalCredit = customers.reduce((sum, c) => sum + c.storeCreditBalance, 0);
    return { total: customers.length, optedIn, totalCredit };
  }, [customers]);

  const handleExportMarketingList = (): void => {
    const optedIn = customers.filter((c) => c.marketingOptIn);
    if (optedIn.length === 0) {
      setMessage("No customers are opted in to marketing yet.");
      return;
    }
    const headers = ["Name", "Email", "Phone", "Tags"];
    const rows = optedIn.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${(c.email ?? "").replace(/"/g, '""')}"`,
      `"${(c.phone ?? "").replace(/"/g, '""')}"`,
      `"${(c.tags ?? "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    downloadFile(csv, `marketing_list_${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8;");
    setMessage(`Exported ${optedIn.length} opted-in customers.`);
  };

  const handleCreateSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      setErrorMessage("A customer name is required.");
      return;
    }
    setCreateBusy(true);
    try {
      await createCustomer(createForm);
      setIsCreateOpen(false);
      setCreateForm(emptyForm);
      setMessage(`Added "${createForm.name}".`);
      void loadCustomers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to create customer.");
    } finally {
      setCreateBusy(false);
    }
  };

  const openDetail = async (customer: Customer): Promise<void> => {
    setDetailLoading(true);
    setIsEditingDetail(false);
    setCreditAmount("");
    setCreditReason("");
    try {
      const detail = await fetchCustomer(customer.id);
      setSelectedCustomer(detail);
      setEditForm({
        name: detail.name,
        email: detail.email ?? "",
        phone: detail.phone ?? "",
        address: detail.address ?? "",
        marketingOptIn: detail.marketingOptIn,
        tags: detail.tags ?? "",
        notes: detail.notes ?? "",
      });
    } catch {
      setErrorMessage("Failed to load this customer.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveDetail = async (): Promise<void> => {
    if (!selectedCustomer) return;
    try {
      await updateCustomer(selectedCustomer.id, editForm);
      setMessage(`Updated "${editForm.name}".`);
      setIsEditingDetail(false);
      await openDetail(selectedCustomer);
      void loadCustomers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update customer.");
    }
  };

  const handleDeleteCustomer = async (): Promise<void> => {
    if (!selectedCustomer) return;
    if (!window.confirm(`Remove "${selectedCustomer.name}" from the customer database? This cannot be undone.`)) return;
    try {
      await deleteCustomer(selectedCustomer.id);
      setMessage(`Removed "${selectedCustomer.name}".`);
      setSelectedCustomer(null);
      void loadCustomers();
    } catch {
      setErrorMessage("Failed to remove this customer.");
    }
  };

  const handleAdjustCredit = async (): Promise<void> => {
    if (!selectedCustomer) return;
    const amount = parseFloat(creditAmount);
    if (Number.isNaN(amount) || amount === 0) {
      setErrorMessage("Enter a non-zero amount (positive to add credit, negative to remove it).");
      return;
    }
    if (!creditReason.trim()) {
      setErrorMessage("A reason is required for a manual credit adjustment.");
      return;
    }
    setCreditBusy(true);
    try {
      await adjustCustomerCredit(selectedCustomer.id, amount, creditReason.trim());
      setMessage(`Adjusted store credit for "${selectedCustomer.name}".`);
      setCreditAmount("");
      setCreditReason("");
      await openDetail(selectedCustomer);
      void loadCustomers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to adjust store credit.");
    } finally {
      setCreditBusy(false);
    }
  };

  return (
    <section className="grid gap-4">
      {message && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-900">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-emerald-700">✕</button>
        </div>
      )}
      {errorMessage && (
        <div className="flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-900">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-700">✕</button>
        </div>
      )}

      <SurfaceCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Customer Database</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-800">Customers</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Marketing contacts, store credit accounts, and trade-in history in one place.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/70 p-3">
            <p className="text-xs text-slate-500">Total customers</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">{stats.total}</p>
          </div>
          <div className="rounded-xl bg-white/70 p-3">
            <p className="text-xs text-slate-500">Opted in to marketing</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">{stats.optedIn}</p>
          </div>
          <div className="rounded-xl bg-white/70 p-3">
            <p className="text-xs text-slate-500">Outstanding store credit</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">{formatCurrency(stats.totalCredit)}</p>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone"
              className="h-10 min-w-56 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
            />
            <input
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="Filter by tag"
              className="h-10 w-40 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
            />
            <div className="flex items-center gap-1">
              {([["all", "All"], ["opted-in", "Opted In"], ["not-opted-in", "Not Opted In"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOptInFilter(value)}
                  className={["rounded-lg px-3 py-2 text-xs font-semibold", optInFilter === value ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200"].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportMarketingList}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Export Marketing List
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateForm(emptyForm);
                setIsCreateOpen(true);
              }}
              className="rounded-xl bg-[#e9ff63] px-3.5 py-2 text-xs font-bold text-slate-900 transition hover:bg-[#d6ed48]"
            >
              + New Customer
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                {[
                  { field: "name" as const, label: "Name" },
                  { field: null, label: "Contact" },
                  { field: "storeCreditBalance" as const, label: "Store Credit" },
                  { field: null, label: "Marketing" },
                  { field: null, label: "Tags" },
                  { field: "tradeInCount" as const, label: "Trade-Ins" },
                  { field: "createdAt" as const, label: "Created" },
                ].map(({ field, label }) => (
                  <th
                    key={label}
                    scope="col"
                    onClick={field ? () => handleSort(field) : undefined}
                    className={["px-3 py-2", field ? "cursor-pointer select-none hover:text-slate-700" : ""].join(" ")}
                  >
                    <div className="inline-flex items-center gap-1.5">
                      <span className={sortField === field ? "font-bold text-slate-800" : ""}>{label}</span>
                      {field && (
                        <span className={["text-xs", sortField === field ? "font-bold text-sky-600" : "text-slate-300"].join(" ")}>
                          {sortField === field ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((c) => (
                <tr key={c.id} onClick={() => void openDetail(c)} className="cursor-pointer bg-white/75 text-slate-700 transition-colors hover:bg-white">
                  <td className="rounded-l-xl px-3 py-3 font-semibold text-slate-800">{c.name}</td>
                  <td className="px-3 py-3 text-xs">
                    <p>{c.email || "--"}</p>
                    <p className="mt-0.5 text-slate-500">{c.phone || "--"}</p>
                  </td>
                  <td className="px-3 py-3 font-semibold">{formatCurrency(c.storeCreditBalance)}</td>
                  <td className="px-3 py-3">
                    <span className={["rounded-full px-2 py-0.5 text-xs font-semibold", c.marketingOptIn ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"].join(" ")}>
                      {c.marketingOptIn ? "Opted In" : "Not Opted In"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-500">{c.tags || "--"}</td>
                  <td className="px-3 py-3">{c.tradeInCount ?? 0}</td>
                  <td className="rounded-r-xl px-3 py-3 text-xs text-slate-500">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredCustomers.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No customers match this search.</p>
          )}
        </div>
      </SurfaceCard>

      {/* Create Customer Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">New Customer</h3>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">✕</button>
            </div>
            <form onSubmit={(e) => void handleCreateSubmit(e)} className="mt-4 space-y-3 text-sm">
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name *"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-700 outline-none focus:border-sky-400"
              />
              <input
                value={createForm.email ?? ""}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Email"
                type="email"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-700 outline-none focus:border-sky-400"
              />
              <input
                value={createForm.phone ?? ""}
                onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Phone"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-700 outline-none focus:border-sky-400"
              />
              <input
                value={createForm.tags ?? ""}
                onChange={(e) => setCreateForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="Tags (comma-separated, e.g. VIP, Book Club)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-700 outline-none focus:border-sky-400"
              />
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={Boolean(createForm.marketingOptIn)}
                  onChange={(e) => setCreateForm((f) => ({ ...f, marketingOptIn: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Opted in to marketing emails/texts
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={createBusy} className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50">
                  {createBusy ? "Adding..." : "Add Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-white/80 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selectedCustomer.name}</h3>
                <p className="text-xs text-slate-500">Customer since {formatDate(selectedCustomer.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setIsEditingDetail((v) => !v)} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  {isEditingDetail ? "Cancel Edit" : "Edit"}
                </button>
                <button type="button" onClick={() => setSelectedCustomer(null)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 text-sm">
              {detailLoading ? (
                <p className="text-slate-500">Loading...</p>
              ) : isEditingDetail ? (
                <div className="space-y-3">
                  <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-400" />
                  <input value={editForm.email ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-400" />
                  <input value={editForm.phone ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-400" />
                  <input value={editForm.address ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} placeholder="Address" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-400" />
                  <input value={editForm.tags ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))} placeholder="Tags" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-400" />
                  <textarea value={editForm.notes ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-400" />
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input type="checkbox" checked={Boolean(editForm.marketingOptIn)} onChange={(e) => setEditForm((f) => ({ ...f, marketingOptIn: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
                    Opted in to marketing
                  </label>
                  <div className="flex items-center justify-between pt-2">
                    <button type="button" onClick={() => void handleDeleteCustomer()} className="text-xs font-semibold text-rose-600 hover:underline">Remove Customer</button>
                    <button type="button" onClick={() => void handleSaveDetail()} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">Save Changes</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                    <p><span className="text-slate-500">Email:</span> {selectedCustomer.email || "--"}</p>
                    <p><span className="text-slate-500">Phone:</span> {selectedCustomer.phone || "--"}</p>
                    <p><span className="text-slate-500">Address:</span> {selectedCustomer.address || "--"}</p>
                    <p><span className="text-slate-500">Tags:</span> {selectedCustomer.tags || "--"}</p>
                    <p><span className="text-slate-500">Marketing:</span> {selectedCustomer.marketingOptIn ? "Opted In" : "Not Opted In"}</p>
                  </div>
                  {selectedCustomer.notes && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{selectedCustomer.notes}</p>}

                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-800">Store Credit</h4>
                      <span className="text-lg font-black text-emerald-700">{formatCurrency(selectedCustomer.storeCreditBalance)}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <input value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} type="number" step="0.01" placeholder="Amount (+/-)" className="w-32 rounded-lg border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-sky-400" />
                      <input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="Reason" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-sky-400" />
                      <button type="button" disabled={creditBusy} onClick={() => void handleAdjustCredit()} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50">Adjust</button>
                    </div>
                    {selectedCustomer.creditTransactions.length > 0 && (
                      <div className="mt-3 max-h-32 overflow-y-auto space-y-1">
                        {selectedCustomer.creditTransactions.map((t) => (
                          <div key={t.id} className="flex items-center justify-between text-xs text-slate-500">
                            <span>{formatDate(t.createdAt)} -- {t.reason}</span>
                            <span className={t.amount >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                              {t.amount >= 0 ? "+" : ""}{formatCurrency(t.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4">
                    <h4 className="text-sm font-bold text-slate-800">Trade-In History ({selectedCustomer.tradeIns.length})</h4>
                    {selectedCustomer.tradeIns.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500">No trade-ins yet.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {selectedCustomer.tradeIns.map((t) => (
                          <details key={t.id} className="rounded-lg bg-slate-50 p-2.5">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                              {formatDate(t.createdAt)} -- {t.itemCount} item{t.itemCount === 1 ? "" : "s"} -- {formatCurrency(t.totalPaid)} ({t.paymentMethod})
                            </summary>
                            <div className="mt-2 space-y-1 pl-2">
                              {t.items.map((item) => (
                                <p key={item.id} className="text-[11px] text-slate-500">
                                  {item.title ?? item.isbn} -- {item.condition} -- {formatCurrency(item.buyOffer)}
                                </p>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default CustomersPage;

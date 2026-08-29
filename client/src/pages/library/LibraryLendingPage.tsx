import { useEffect, useState, type FormEvent } from "react";
import SurfaceCard from "../../components/ui/SurfaceCard";
import {
  fetchLibraryVolumes,
  loanVolume,
  returnVolume,
  type LibraryVolume,
} from "../../services/library.service";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export default function LibraryLendingPage() {
  const [loanedVolumes, setLoanedVolumes] = useState<LibraryVolume[]>([]);
  const [availableVolumes, setAvailableVolumes] = useState<LibraryVolume[]>([]);
  const [loading, setLoading] = useState(true);

  // New Loan Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState("");
  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerContact, setBorrowerContact] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookSearchQuery, setBookSearchQuery] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [loanedRes, availableRes] = await Promise.all([
        fetchLibraryVolumes({ isLoaned: true, limit: 100 }),
        fetchLibraryVolumes({ isLoaned: false, limit: 150 }),
      ]);
      setLoanedVolumes(loanedRes.items);
      setAvailableVolumes(availableRes.items);
    } catch (err) {
      console.warn("fetchLibraryVolumes error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreateLoan = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedBookId || !borrowerName.trim()) return;

    setIsSubmitting(true);
    try {
      await loanVolume(selectedBookId, borrowerName.trim(), borrowerContact.trim() || undefined, dueDate || undefined);
      setIsModalOpen(false);
      setSelectedBookId("");
      setBorrowerName("");
      setBorrowerContact("");
      setDueDate("");
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to loan volume.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturnBook = async (vol: LibraryVolume) => {
    try {
      await returnVolume(vol.id);
      void loadData();
    } catch (err) {
      alert("Failed to return book.");
    }
  };

  const filteredAvailable = availableVolumes.filter((v) => {
    if (!bookSearchQuery) return true;
    const q = bookSearchQuery.toLowerCase();
    return v.title.toLowerCase().includes(q) || (v.author && v.author.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <SurfaceCard className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 text-xl font-bold shadow-sm">
              👥
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Lending & Patron Circulation</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Track borrowed books, due dates, borrower contact records, and collection returns
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>➕ Loan a Book</span>
            </button>
          </div>
        </div>

        {/* Status Metrics */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          <div className="px-3.5 py-1.5 bg-blue-50 rounded-xl border border-blue-200 font-bold text-blue-800">
            Currently on Loan: <span className="text-blue-950 font-black">{loanedVolumes.length} Volumes</span>
          </div>
          <div className="px-3.5 py-1.5 bg-emerald-50 rounded-xl border border-emerald-200 font-bold text-emerald-800">
            In-House on Shelves: <span className="text-emerald-950 font-black">{availableVolumes.length} Volumes</span>
          </div>
        </div>
      </SurfaceCard>

      {/* Active Loans Table */}
      <SurfaceCard className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>📋</span> Active Loans ({loanedVolumes.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading circulation records...</div>
        ) : loanedVolumes.length === 0 ? (
          <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
            <span className="text-3xl block mb-2">✨</span>
            <p className="text-sm font-bold text-slate-800">No books currently on loan.</p>
            <p className="text-xs text-slate-500 mt-1">All cataloged volumes are accounted for on their assigned shelves.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
                  <th className="py-2.5 px-3">Cover</th>
                  <th className="py-2.5 px-3">Title & Author</th>
                  <th className="py-2.5 px-3">Borrower</th>
                  <th className="py-2.5 px-3">Contact</th>
                  <th className="py-2.5 px-3">Loan Date</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loanedVolumes.map((vol) => {
                  const isOverdue = vol.dueDate ? new Date(vol.dueDate).getTime() < Date.now() : false;

                  return (
                    <tr key={vol.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3">
                        <div className="w-8 h-11 bg-slate-100 rounded overflow-hidden border border-slate-200 flex items-center justify-center">
                          {vol.coverUrl ? (
                            <img src={vol.coverUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span>📖</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 min-w-[200px]">
                        <p className="font-bold text-slate-900 truncate">{vol.title}</p>
                        <p className="text-[11px] text-slate-500 truncate">{vol.author || "Unknown"}</p>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{vol.borrowerName}</td>
                      <td className="py-2.5 px-3 text-slate-600">{vol.borrowerContact || "--"}</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {vol.loanDate ? new Date(vol.loanDate).toLocaleDateString() : "--"}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className={isOverdue ? "text-rose-700 font-bold" : "text-slate-700 font-medium"}>
                            {vol.dueDate ? new Date(vol.dueDate).toLocaleDateString() : "--"}
                          </span>
                          {isOverdue && (
                            <span className="px-1.5 py-0.2 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[9px] font-bold">
                              Overdue
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleReturnBook(vol)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-2xs cursor-pointer"
                        >
                          ✅ Return to Shelf
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>

      {/* Loan Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateLoan}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <span>👥</span> Loan a Book
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Select Book from available catalog */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700">Select Available Book *</label>
              <input
                type="text"
                value={bookSearchQuery}
                onChange={(e) => setBookSearchQuery(e.target.value)}
                placeholder="Filter books by title/author..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 mb-1.5"
              />
              <select
                required
                value={selectedBookId}
                onChange={(e) => setSelectedBookId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl p-2 font-medium max-h-32"
              >
                <option value="">-- Choose Volume ({filteredAvailable.length} available) --</option>
                {filteredAvailable.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} - {v.author || "Unknown"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Borrower Name *</label>
              <input
                type="text"
                required
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                placeholder="e.g. Alice Walker, Dr. Smith"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Contact Email / Phone (Optional)</label>
              <input
                type="text"
                value={borrowerContact}
                onChange={(e) => setBorrowerContact(e.target.value)}
                placeholder="alice@example.com / (555) 123-4567"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Return Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedBookId || !borrowerName.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50"
              >
                {isSubmitting ? "Loaning..." : "Confirm Loan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

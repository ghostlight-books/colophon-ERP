import { useEffect, useState, type FormEvent } from "react";
import LibrarySpaceSwitcher from "../../components/library/LibrarySpaceSwitcher";
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
      await loanVolume(
        selectedBookId,
        borrowerName.trim(),
        borrowerContact.trim() || undefined,
        dueDate || undefined
      );
      setIsModalOpen(false);
      setSelectedBookId("");
      setBorrowerName("");
      setBorrowerContact("");
      setDueDate("");
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record loan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturnBook = async (vol: LibraryVolume) => {
    const confirmed = window.confirm(`Mark "${vol.title}" as returned to your shelf?`);
    if (!confirmed) return;

    try {
      await returnVolume(vol.id);
      void loadData();
    } catch (err) {
      alert("Failed to mark book as returned.");
    }
  };

  const filteredAvailable = availableVolumes.filter((v) =>
    bookSearchQuery
      ? v.title.toLowerCase().includes(bookSearchQuery.toLowerCase()) ||
        (v.author && v.author.toLowerCase().includes(bookSearchQuery.toLowerCase()))
      : true
  );

  return (
    <div className="space-y-6 pb-24 font-sans max-w-4xl mx-auto">
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
        <LibrarySpaceSwitcher />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium text-xs rounded-2xl transition shadow-2xs cursor-pointer flex items-center gap-1.5"
          >
            <span>+ Loan a Book</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Currently on Loan
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">
            {loanedVolumes.length}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            With friends / patrons
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            In-House Shelves
          </p>
          <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
            {availableVolumes.length}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Ready on stacks
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Overdue Loans
          </p>
          <p className="text-2xl font-semibold text-rose-600 dark:text-rose-400">
            {loanedVolumes.filter((v) => v.dueDate && new Date(v.dueDate).getTime() < Date.now()).length}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Past expected return
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Insured Value Loaned
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-indigo-400">
            {formatCurrency(loanedVolumes.reduce((sum, v) => sum + (v.replacementValue || 0), 0))}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Out on circulation
          </p>
        </div>
      </div>

      {/* 3. Active Loans Table Card */}
      <div className="p-4 sm:p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">
            Active Loans ({loanedVolumes.length})
          </h3>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs">Loading circulation records...</div>
        ) : loanedVolumes.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
            <p className="text-xs font-semibold text-slate-800 dark:text-white">No books currently on loan.</p>
            <p className="text-[11px] text-slate-500">All cataloged volumes are accounted for on their assigned shelves.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-medium">
                  <th className="py-2.5 px-3">Cover</th>
                  <th className="py-2.5 px-3">Title & Author</th>
                  <th className="py-2.5 px-3">Borrower</th>
                  <th className="py-2.5 px-3">Contact</th>
                  <th className="py-2.5 px-3">Loan Date</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {loanedVolumes.map((vol) => {
                  const isOverdue = vol.dueDate ? new Date(vol.dueDate).getTime() < Date.now() : false;

                  return (
                    <tr key={vol.id} className="hover:bg-white/60 dark:hover:bg-slate-700/60 transition">
                      <td className="py-2.5 px-3">
                        <div className="w-8 h-11 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                          {vol.coverUrl ? (
                            <img src={vol.coverUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[9px] font-medium text-slate-500">BOOK</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 min-w-[180px]">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">{vol.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate">{vol.author || "Unknown"}</p>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">{vol.borrowerName}</td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-normal">{vol.borrowerContact || "--"}</td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-normal">
                        {vol.loanDate ? new Date(vol.loanDate).toLocaleDateString() : "--"}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className={isOverdue ? "text-rose-600 dark:text-rose-400 font-medium" : "text-slate-700 dark:text-slate-300 font-normal"}>
                            {vol.dueDate ? new Date(vol.dueDate).toLocaleDateString() : "--"}
                          </span>
                          {isOverdue && (
                            <span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded text-[9px] font-medium">
                              Overdue
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleReturnBook(vol)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-xs transition shadow-2xs cursor-pointer"
                        >
                          Return to Shelf
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Loan Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateLoan}
            className="bg-[#f8fafc] dark:bg-slate-900 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Loan a Book
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Select Book from available catalog */}
            <div className="space-y-2">
              <label className="block font-medium text-slate-700 dark:text-slate-300">Select Available Book *</label>
              <input
                type="text"
                value={bookSearchQuery}
                onChange={(e) => setBookSearchQuery(e.target.value)}
                placeholder="Filter books by title/author..."
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-slate-900 dark:text-white focus:outline-none"
              />
              <select
                required
                value={selectedBookId}
                onChange={(e) => setSelectedBookId(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-medium text-slate-900 dark:text-white max-h-32 focus:outline-none"
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
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Borrower's Name *</label>
              <input
                type="text"
                required
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                placeholder="e.g. Alice Walker"
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Contact (Email/Phone)</label>
                <input
                  type="text"
                  value={borrowerContact}
                  onChange={(e) => setBorrowerContact(e.target.value)}
                  placeholder="e.g. 555-0192"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium rounded-xl transition cursor-pointer"
              >
                {isSubmitting ? "Recording..." : "Record Loan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

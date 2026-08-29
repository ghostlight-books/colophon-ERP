import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SurfaceCard from "../../components/ui/SurfaceCard";
import {
  fetchLibraryVolumes,
  updateLibraryVolume,
  deleteLibraryVolume,
  fetchShelves,
  loanVolume,
  returnVolume,
  type LibraryVolume,
  type LibraryShelfLocation,
} from "../../services/library.service";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

const DEWEY_OPTIONS = [
  { key: "", label: "All Dewey Classes" },
  { key: "0", label: "000 - Computer Science & Information" },
  { key: "1", label: "100 - Philosophy & Psychology" },
  { key: "2", label: "200 - Religion & Mythology" },
  { key: "3", label: "300 - Social Sciences & Law" },
  { key: "4", label: "400 - Language & Linguistics" },
  { key: "5", label: "500 - Pure Science & Mathematics" },
  { key: "6", label: "600 - Technology & Medicine" },
  { key: "7", label: "700 - Arts & Recreation" },
  { key: "8", label: "800 - Literature, Poetry & Drama" },
  { key: "9", label: "900 - History & Geography" },
];

export default function LibraryCatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters
  const [searchQuery, setSearchQuery] = useState(searchParams.get("query") || "");
  const [deweyFilter, setDeweyFilter] = useState(searchParams.get("dewey") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "ALL");
  const [shelfFilter, setShelfFilter] = useState(searchParams.get("shelf") || "");

  // Data
  const [volumes, setVolumes] = useState<LibraryVolume[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [shelves, setShelves] = useState<LibraryShelfLocation[]>([]);

  // View state
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [selectedVolume, setSelectedVolume] = useState<LibraryVolume | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Edit draft state
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editDewey, setEditDewey] = useState("");
  const [editLoc, setEditLoc] = useState("");
  const [editShelfId, setEditShelfId] = useState("");
  const [editStatus, setEditStatus] = useState<"UNREAD" | "READING" | "COMPLETED" | "WISHLIST">("UNREAD");
  const [editRating, setEditRating] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editValue, setEditValue] = useState("");

  // Loan modal state
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerContact, setBorrowerContact] = useState("");
  const [dueDate, setDueDate] = useState("");

  const loadVolumes = async () => {
    setLoading(true);
    try {
      const res = await fetchLibraryVolumes({
        query: searchQuery || undefined,
        dewey: deweyFilter || undefined,
        shelfLocationId: shelfFilter || undefined,
        readingStatus: statusFilter !== "ALL" ? statusFilter : undefined,
      });
      setVolumes(res.items);
      setTotalCount(res.total);
    } catch (err) {
      console.warn("fetchLibraryVolumes error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchShelves().then(setShelves);
  }, []);

  useEffect(() => {
    void loadVolumes();
  }, [deweyFilter, statusFilter, shelfFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadVolumes();
  };

  const openInspector = (volume: LibraryVolume) => {
    setSelectedVolume(volume);
    setEditTitle(volume.title);
    setEditAuthor(volume.author || "");
    setEditDewey(volume.deweyDecimal || "");
    setEditLoc(volume.locClassification || "");
    setEditShelfId(volume.shelfLocationId || "");
    setEditStatus(volume.readingStatus);
    setEditRating(volume.rating);
    setEditNotes(volume.personalNotes || "");
    setEditTags(volume.exLibrisTags || "");
    setEditValue(volume.replacementValue ? String(volume.replacementValue) : "18.99");
    setIsEditing(false);
    setIsLoanModalOpen(false);
  };

  const handleSaveEdit = async () => {
    if (!selectedVolume) return;
    try {
      const updated = await updateLibraryVolume(selectedVolume.id, {
        title: editTitle,
        author: editAuthor || null,
        deweyDecimal: editDewey || null,
        locClassification: editLoc || null,
        shelfLocationId: editShelfId || null,
        readingStatus: editStatus,
        rating: editRating,
        personalNotes: editNotes || null,
        exLibrisTags: editTags || null,
        replacementValue: parseFloat(editValue) || 18.99,
      });
      setSelectedVolume(updated);
      setIsEditing(false);
      void loadVolumes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update volume.");
    }
  };

  const handleDeleteVolume = async () => {
    if (!selectedVolume) return;
    const confirmed = window.confirm(`Remove "${selectedVolume.title}" from your library collection?`);
    if (!confirmed) return;
    try {
      await deleteLibraryVolume(selectedVolume.id);
      setSelectedVolume(null);
      void loadVolumes();
    } catch (err) {
      alert("Failed to delete volume.");
    }
  };

  const handleLoanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVolume || !borrowerName.trim()) return;
    try {
      const updated = await loanVolume(selectedVolume.id, borrowerName, borrowerContact || undefined, dueDate || undefined);
      setSelectedVolume(updated);
      setIsLoanModalOpen(false);
      setBorrowerName("");
      setBorrowerContact("");
      setDueDate("");
      void loadVolumes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to loan volume.");
    }
  };

  const handleReturnBook = async () => {
    if (!selectedVolume) return;
    try {
      const updated = await returnVolume(selectedVolume.id);
      setSelectedVolume(updated);
      void loadVolumes();
    } catch (err) {
      alert("Failed to return volume.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls Card */}
      <SurfaceCard className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 text-xl font-bold shadow-sm">
              📚
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Collection Catalog & Search</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Browse, search and filter your entire library by Dewey Decimal, LOC Call Number, Room & Shelf
              </p>
            </div>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === "grid" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>🔲 Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === "table" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>📋 Table</span>
              </button>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-1">
          <div className="lg:col-span-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, author, ISBN, call #..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
              />
              <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
            </div>
          </div>

          <div className="lg:col-span-3">
            <select
              value={deweyFilter}
              onChange={(e) => setDeweyFilter(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:border-indigo-500 shadow-2xs"
            >
              {DEWEY_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3">
            <select
              value={shelfFilter}
              onChange={(e) => setShelfFilter(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:border-indigo-500 shadow-2xs"
            >
              <option value="">All Rooms & Shelves</option>
              {shelves.map((shelf) => (
                <option key={shelf.id} value={shelf.id}>
                  {shelf.fullLocationLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:border-indigo-500 shadow-2xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="UNREAD">To Read (Unread)</option>
              <option value="READING">Currently Reading</option>
              <option value="COMPLETED">Completed (Read)</option>
              <option value="WISHLIST">Wishlist</option>
            </select>
          </div>
        </form>
      </SurfaceCard>

      {/* Catalog Listing */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium">Loading catalog volumes...</span>
        </div>
      ) : volumes.length === 0 ? (
        <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
          <span className="text-3xl block mb-2">📚</span>
          <p className="text-sm font-bold text-slate-800">No volumes found matching your criteria.</p>
          <p className="text-xs text-slate-500 mt-1">Try clearing your filters or scan new books from the Scanner page.</p>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {volumes.map((volume) => (
            <div
              key={volume.id}
              onClick={() => openInspector(volume)}
              className="group p-3 bg-white hover:bg-slate-50/80 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition cursor-pointer flex flex-col justify-between space-y-2.5"
            >
              <div className="space-y-2">
                {/* Cover Image */}
                <div className="relative w-full aspect-[2/3] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-2xs flex items-center justify-center">
                  {volume.coverUrl ? (
                    <img
                      src={volume.coverUrl}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <span className="text-3xl">📖</span>
                  )}

                  {/* Badges Overlay */}
                  {volume.isLoaned && (
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-rose-600 text-white font-bold text-[9px] rounded shadow-xs">
                      Loaned
                    </div>
                  )}

                  {volume.readingStatus === "COMPLETED" && (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-emerald-600/90 text-white font-bold text-[9px] rounded shadow-xs">
                      ✓ Read
                    </div>
                  )}
                </div>

                {/* Title & Author */}
                <div>
                  <h3 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug group-hover:text-indigo-700 transition">
                    {volume.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{volume.author || "Unknown Author"}</p>
                </div>
              </div>

              {/* Call Number Pill */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/60 truncate max-w-[85px]">
                  {volume.deweyDecimal ? `DDC ${volume.deweyDecimal}` : volume.locClassification ? `LOC ${volume.locClassification.slice(0, 6)}` : "Unclassified"}
                </span>
                <span className="text-slate-400 font-medium">
                  {volume.roomName ? volume.roomName.slice(0, 8) : "--"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW */
        <SurfaceCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
                  <th className="py-2.5 px-3">Cover</th>
                  <th className="py-2.5 px-3">Title & Author</th>
                  <th className="py-2.5 px-3">Dewey (DDC)</th>
                  <th className="py-2.5 px-3">LOC Call #</th>
                  <th className="py-2.5 px-3">Shelf Location</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Replacement Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {volumes.map((vol) => (
                  <tr
                    key={vol.id}
                    onClick={() => openInspector(vol)}
                    className="hover:bg-slate-50/80 transition cursor-pointer"
                  >
                    <td className="py-2 px-3">
                      <div className="w-8 h-11 bg-slate-100 rounded overflow-hidden border border-slate-200 flex items-center justify-center">
                        {vol.coverUrl ? (
                          <img src={vol.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span>📖</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 min-w-[200px]">
                      <p className="font-bold text-slate-900 truncate">{vol.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">{vol.author || "Unknown"}</p>
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                      {vol.deweyDecimal || "--"}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-700">
                      {vol.locClassification || "--"}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {vol.roomName ? `${vol.roomName} > ${vol.shelfName}` : "Unassigned"}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        vol.readingStatus === "COMPLETED" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" :
                        vol.readingStatus === "READING" ? "bg-blue-50 text-blue-800 border border-blue-200" :
                        vol.readingStatus === "WISHLIST" ? "bg-amber-50 text-amber-800 border border-amber-200" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {vol.readingStatus}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700">
                      {formatCurrency(vol.replacementValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}

      {/* Volume Inspector & Editor Modal Drawer */}
      {selectedVolume && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 animate-scaleUp">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-16 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                  {selectedVolume.coverUrl ? (
                    <img src={selectedVolume.coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl">📖</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black text-slate-900 line-clamp-1">{selectedVolume.title}</h2>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {selectedVolume.author || "Unknown Author"} &bull; ISBN: {selectedVolume.isbn}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVolume(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Read / Edit Form */}
            {!isEditing ? (
              <div className="space-y-4 text-xs">
                {/* Classification Badges */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <span className="text-[11px] font-bold text-slate-600 block">Catalog Classification Numbers</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg font-bold font-mono">
                      Dewey: {selectedVolume.deweyDecimal || "Not Assigned"}
                    </span>
                    <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg font-bold font-mono">
                      LOC: {selectedVolume.locClassification || "Not Assigned"}
                    </span>
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-bold">
                      Est. Value: {formatCurrency(selectedVolume.replacementValue)}
                    </span>
                  </div>
                </div>

                {/* Location & Status */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-medium block">Shelf Location</span>
                    <span className="text-xs font-bold text-slate-800 block mt-0.5">
                      {selectedVolume.roomName ? `${selectedVolume.roomName} > ${selectedVolume.shelfName}` : "Unassigned Shelf"}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-medium block">Reading Status</span>
                    <span className="text-xs font-bold text-slate-800 block mt-0.5">
                      {selectedVolume.readingStatus}
                    </span>
                  </div>
                </div>

                {/* Circulation status */}
                {selectedVolume.isLoaned ? (
                  <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-rose-900 block">Currently on Loan</span>
                      <span className="text-rose-700 mt-0.5 block">
                        Borrowed by <span className="font-semibold">{selectedVolume.borrowerName}</span> (Due: {selectedVolume.dueDate ? new Date(selectedVolume.dueDate).toLocaleDateString() : "No date"})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleReturnBook}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition"
                    >
                      Return Book
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-slate-600 font-medium">Available on shelf</span>
                    <button
                      type="button"
                      onClick={() => setIsLoanModalOpen(true)}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-lg transition"
                    >
                      👥 Loan Volume
                    </button>
                  </div>
                )}

                {/* Personal notes */}
                {selectedVolume.personalNotes && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-bold block mb-1">Personal Notes & Review</span>
                    <p className="text-slate-700">{selectedVolume.personalNotes}</p>
                  </div>
                )}

                {/* Ex Libris Tags */}
                {selectedVolume.exLibrisTags && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-bold block mb-1">Ex-Libris Tags & Attributes</span>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-bold rounded-md border border-amber-200 inline-block">
                      🏷️ {selectedVolume.exLibrisTags}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={handleDeleteVolume}
                    className="text-xs text-rose-600 hover:text-rose-700 font-bold"
                  >
                    🗑️ Remove Volume
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition"
                    >
                      ✏️ Edit Classification & Location
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* EDIT MODE */
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Title</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Author</label>
                    <input
                      type="text"
                      value={editAuthor}
                      onChange={(e) => setEditAuthor(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Dewey Decimal (DDC)</label>
                    <input
                      type="text"
                      value={editDewey}
                      onChange={(e) => setEditDewey(e.target.value)}
                      placeholder="813.54"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">LOC Call Number</label>
                    <input
                      type="text"
                      value={editLoc}
                      onChange={(e) => setEditLoc(e.target.value)}
                      placeholder="PS3558.E63 D86"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Replacement Value ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Shelf Location</label>
                    <select
                      value={editShelfId}
                      onChange={(e) => setEditShelfId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                    >
                      <option value="">-- Unassigned --</option>
                      {shelves.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullLocationLabel}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Reading Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                    >
                      <option value="UNREAD">To Read (Unread)</option>
                      <option value="READING">Currently Reading</option>
                      <option value="COMPLETED">Completed (Read)</option>
                      <option value="WISHLIST">Wishlist</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Ex-Libris Tags (e.g. Signed, 1st Edition, Gift)</label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="Signed by Author, First Edition"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Personal Notes & Review</label>
                  <textarea
                    rows={3}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Add personal reflections, favorite quotes, or condition notes..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {/* Loan Book Sub-Modal */}
            {isLoanModalOpen && (
              <form onSubmit={handleLoanSubmit} className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3 animate-fadeIn text-xs">
                <span className="font-bold text-indigo-950 block">Loan this Volume to Borrower</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Borrower Name *</label>
                    <input
                      type="text"
                      required
                      value={borrowerName}
                      onChange={(e) => setBorrowerName(e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="w-full bg-white border border-slate-300 rounded-xl p-2"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Contact Email / Phone</label>
                    <input
                      type="text"
                      value={borrowerContact}
                      onChange={(e) => setBorrowerContact(e.target.value)}
                      placeholder="jane@example.com"
                      className="w-full bg-white border border-slate-300 rounded-xl p-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Expected Return Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-2"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsLoanModalOpen(false)}
                    className="px-3 py-1.5 bg-slate-200 text-slate-700 font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 text-white font-bold rounded-lg"
                  >
                    Confirm Loan
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

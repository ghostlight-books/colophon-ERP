import { useEffect, useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import LibrarySpaceSwitcher from "../../components/library/LibrarySpaceSwitcher";
import { useLibrarySpace } from "../../context/LibrarySpaceContext";
import {
  fetchLibraryVolumes,
  updateLibraryVolume,
  deleteLibraryVolume,
  bulkDeleteLibraryVolumes,
  bulkMoveLibraryVolumes,
  fetchShelves,
  fetchCoverCandidates,
  updateVolumeCover,
  refreshMissingCovers,
  type LibraryVolume,
  type LibraryShelfLocation,
  type CoverCandidate,
} from "../../services/library.service";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

const CATEGORY_PILLS = [
  { key: "ALL", label: "All Books" },
  { key: "READING", label: "Currently Reading" },
  { key: "UNREAD", label: "To Read (TBR)" },
  { key: "COMPLETED", label: "Completed" },
  { key: "WISHLIST", label: "Wishlist" },
];

function getConditionLabel(cond: string | undefined | null): string {
  switch (cond?.toUpperCase()) {
    case "FINE":
    case "AS_NEW":
    case "LIKE_NEW":
      return "Fine";
    case "VERY_GOOD":
      return "Very Good";
    case "GOOD":
      return "Good";
    case "FAIR":
      return "Fair";
    case "POOR":
      return "Poor";
    default:
      return "Very Good";
  }
}

export default function LibraryCatalogPage() {
  const [searchParams] = useSearchParams();
  const { spaces, activeSpace, activeSpaceId } = useLibrarySpace();

  // Filters
  const [searchQuery, setSearchQuery] = useState(searchParams.get("query") || "");
  const [deweyFilter] = useState(searchParams.get("dewey") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "ALL");
  const [conditionFilter] = useState(searchParams.get("condition") || "ALL");
  const [shelfFilter] = useState(searchParams.get("shelf") || "");
  const [sortOption, setSortOption] = useState<"DATE_DESC" | "TITLE_ASC" | "TITLE_DESC" | "AUTHOR_ASC" | "DEWEY_ASC" | "VALUE_DESC" | "VALUE_ASC">("DATE_DESC");

  // Data
  const [volumes, setVolumes] = useState<LibraryVolume[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [shelves, setShelves] = useState<LibraryShelfLocation[]>([]);

  // Selection & Bulk State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [targetSpaceId, setTargetSpaceId] = useState("");
  const [targetShelfId, setTargetShelfId] = useState("");
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);

  // Toast Feedback state
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // View Mode ("grid" | "list")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Book Detail Modal
  const [selectedVolume, setSelectedVolume] = useState<LibraryVolume | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Liked items
  const [likedIds, setLikedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("colophon_liked_books") || "[]");
    } catch {
      return [];
    }
  });

  const toggleLike = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLikedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      localStorage.setItem("colophon_liked_books", JSON.stringify(next));
      return next;
    });
  };

  // Edit draft state
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editDewey, setEditDewey] = useState("");
  const [editLoc, setEditLoc] = useState("");
  const [editShelfId, setEditShelfId] = useState("");
  const [editLibrarySpaceId, setEditLibrarySpaceId] = useState("");
  const [editStatus, setEditStatus] = useState<"UNREAD" | "READING" | "COMPLETED" | "WISHLIST">("UNREAD");
  const [editCondition, setEditCondition] = useState("VERY_GOOD");
  const [editNotes, setEditNotes] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editAskingPrice, setEditAskingPrice] = useState("");

  // Cover Picker State
  const [isCoverPickerOpen, setIsCoverPickerOpen] = useState(false);
  const [coverCandidates, setCoverCandidates] = useState<CoverCandidate[]>([]);
  const [loadingCovers, setLoadingCovers] = useState(false);
  const [customCoverUrl, setCustomCoverUrl] = useState("");
  const [isRefreshingMissing, setIsRefreshingMissing] = useState(false);

  const openCoverPicker = async (volume: LibraryVolume) => {
    setSelectedVolume(volume);
    setIsCoverPickerOpen(true);
    setLoadingCovers(true);
    setCustomCoverUrl("");
    try {
      const list = await fetchCoverCandidates({
        isbn: volume.isbn,
        title: volume.title,
        author: volume.author || undefined,
      });
      setCoverCandidates(list);
    } catch {
      setCoverCandidates([]);
    } finally {
      setLoadingCovers(false);
    }
  };

  const handleSelectCover = async (coverUrl: string) => {
    if (!selectedVolume) return;
    try {
      const updated = await updateVolumeCover(selectedVolume.id, coverUrl);
      setSelectedVolume(updated);
      setIsCoverPickerOpen(false);
      setActionMessage(`Updated cover image for "${updated.title}".`);
      void loadVolumes();
    } catch (err) {
      setErrorMessage("Failed to update book cover.");
    }
  };

  const handleRefreshAllMissingCovers = async () => {
    setIsRefreshingMissing(true);
    try {
      const res = await refreshMissingCovers();
      if (res.updatedCount > 0) {
        setActionMessage(`Found and attached covers for ${res.updatedCount} books!`);
      } else {
        setActionMessage("All cataloged books already have covers attached.");
      }
      void loadVolumes();
    } catch {
      setErrorMessage("Failed to refresh covers.");
    } finally {
      setIsRefreshingMissing(false);
    }
  };

  const loadVolumes = async () => {
    setLoading(true);
    try {
      const res = await fetchLibraryVolumes({
        query: searchQuery || undefined,
        dewey: deweyFilter || undefined,
        shelfLocationId: shelfFilter || undefined,
        readingStatus: statusFilter !== "ALL" ? statusFilter : undefined,
        condition: conditionFilter !== "ALL" ? conditionFilter : undefined,
        librarySpaceId: activeSpaceId !== "ALL" ? activeSpaceId : undefined,
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
  }, [deweyFilter, statusFilter, conditionFilter, shelfFilter, activeSpaceId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadVolumes();
  };

  const sortedVolumes = useMemo(() => {
    return [...volumes].sort((a, b) => {
      switch (sortOption) {
        case "TITLE_ASC":
          return (a.title || "").localeCompare(b.title || "");
        case "TITLE_DESC":
          return (b.title || "").localeCompare(a.title || "");
        case "AUTHOR_ASC":
          return (a.author || "").localeCompare(b.author || "");
        case "DEWEY_ASC":
          return (a.deweyDecimal || "999").localeCompare(b.deweyDecimal || "999", undefined, { numeric: true });
        case "VALUE_DESC": {
          const valA = a.rareMarketValue || a.replacementValue || 0;
          const valB = b.rareMarketValue || b.replacementValue || 0;
          return valB - valA;
        }
        case "VALUE_ASC": {
          const valA = a.rareMarketValue || a.replacementValue || 0;
          const valB = b.rareMarketValue || b.replacementValue || 0;
          return valA - valB;
        }
        case "DATE_DESC":
        default:
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
    });
  }, [volumes, sortOption]);

  const handleExport = (format: "csv" | "json" | "bibtex") => {
    if (sortedVolumes.length === 0) return;

    if (format === "csv") {
      const headers = [
        "ISBN",
        "Title",
        "Author",
        "Publisher",
        "Year",
        "Dewey Call #",
        "LOC Call #",
        "Space",
        "Room",
        "Shelf",
        "Reading Status",
        "Condition",
        "Market Value ($)",
        "Acquisition ($)",
        "Notes",
      ];
      const rows = sortedVolumes.map((v) => [
        `"${v.isbn || ""}"`,
        `"${(v.title || "").replace(/"/g, '""')}"`,
        `"${(v.author || "").replace(/"/g, '""')}"`,
        `"${(v.publisher || "").replace(/"/g, '""')}"`,
        `"${v.publishYear || ""}"`,
        `"${v.deweyDecimal || ""}"`,
        `"${v.locClassification || ""}"`,
        `"${v.librarySpace?.name || "Main"}"`,
        `"${v.shelfLocation?.roomName || "Unassigned"}"`,
        `"${v.shelfLocation?.shelfName || "Unassigned"}"`,
        `"${v.readingStatus || "UNREAD"}"`,
        `"${getConditionLabel(v.condition)}"`,
        (v.rareMarketValue || v.replacementValue || 0).toFixed(2),
        (v.acquisitionPrice || 0).toFixed(2),
        `"${(v.personalNotes || "").replace(/"/g, '""')}"`,
      ]);
      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      downloadFile(csv, `colophon_catalog_${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8;");
    } else if (format === "json") {
      const json = JSON.stringify(sortedVolumes, null, 2);
      downloadFile(json, `colophon_catalog_backup_${new Date().toISOString().slice(0, 10)}.json`, "application/json;charset=utf-8;");
    } else if (format === "bibtex") {
      const bibtex = sortedVolumes.map((v) => {
        const citeKey = (v.author?.split(" ").pop() || "book").toLowerCase().replace(/[^a-z0-9]/g, "") + (v.publishYear || new Date().getFullYear());
        return `@book{${citeKey},\n  title = {${v.title}},\n  author = {${v.author || "Unknown"}},\n  year = {${v.publishYear || ""}},\n  isbn = {${v.isbn || ""}},\n  publisher = {${v.publisher || ""}},\n  note = {Dewey: ${v.deweyDecimal || "N/A"}, LOC: ${v.locClassification || "N/A"}}\n}`;
      }).join("\n\n");
      downloadFile(bibtex, `colophon_bibliography_${new Date().toISOString().slice(0, 10)}.bib`, "text/plain;charset=utf-8;");
    }
    setIsExportMenuOpen(false);
    setActionMessage(`Exported ${sortedVolumes.length} books in ${format.toUpperCase()} format.`);
  };

  function downloadFile(content: string, fileName: string, mimeType: string) {
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

  const openBookDetail = (volume: LibraryVolume) => {
    if (isSelectionMode) {
      toggleSelectVolume(volume.id);
      return;
    }
    setSelectedVolume(volume);
    setEditTitle(volume.title);
    setEditAuthor(volume.author || "");
    setEditDewey(volume.deweyDecimal || "");
    setEditLoc(volume.locClassification || "");
    setEditShelfId(volume.shelfLocationId || "");
    setEditLibrarySpaceId(volume.librarySpaceId || (spaces[0]?.id ?? ""));
    setEditStatus(volume.readingStatus);
    setEditCondition(volume.condition || "VERY_GOOD");
    setEditNotes(volume.personalNotes || "");
    setEditValue(volume.replacementValue ? String(volume.replacementValue) : "18.99");
    setEditAskingPrice(volume.askingPrice ? String(volume.askingPrice) : "");
    setIsEditing(false);
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
        librarySpaceId: editLibrarySpaceId || null,
        readingStatus: editStatus,
        condition: editCondition,
        personalNotes: editNotes || null,
        replacementValue: parseFloat(editValue) || 18.99,
        askingPrice: editAskingPrice ? parseFloat(editAskingPrice) : null,
      });
      setSelectedVolume(updated);
      setIsEditing(false);
      setActionMessage(`Updated "${updated.title}" successfully.`);
      void loadVolumes();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update volume.");
    }
  };

  const toggleSelectVolume = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === volumes.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(volumes.map((v) => v.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(
      `Remove ${selectedIds.length} selected books from your library collection?`
    );
    if (!confirmed) return;
    try {
      const res = await bulkDeleteLibraryVolumes(selectedIds);
      setActionMessage(`Successfully removed ${res.count} books.`);
      setSelectedIds([]);
      setIsSelectionMode(false);
      if (selectedVolume && selectedIds.includes(selectedVolume.id)) {
        setSelectedVolume(null);
      }
      void loadVolumes();
    } catch {
      setErrorMessage("Failed to bulk delete books.");
    }
  };

  const handleBulkMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    setIsSubmittingBulk(true);
    try {
      await bulkMoveLibraryVolumes(selectedIds, {
        librarySpaceId: targetSpaceId || undefined,
        shelfLocationId: targetShelfId || undefined,
      });
      setActionMessage(`Moved ${selectedIds.length} books successfully.`);
      setSelectedIds([]);
      setIsSelectionMode(false);
      setIsMoveModalOpen(false);
      void loadVolumes();
    } catch {
      setErrorMessage("Failed to move selected books.");
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  const handleDeleteVolume = async () => {
    if (!selectedVolume) return;
    const confirmed = window.confirm(`Remove "${selectedVolume.title}" from your library?`);
    if (!confirmed) return;
    try {
      await deleteLibraryVolume(selectedVolume.id);
      setActionMessage(`Removed "${selectedVolume.title}".`);
      setSelectedVolume(null);
      void loadVolumes();
    } catch {
      setErrorMessage("Failed to delete volume.");
    }
  };

  const selectedTotalValue = volumes
    .filter((v) => selectedIds.includes(v.id))
    .reduce((sum, v) => sum + (v.replacementValue || 0), 0);

  const selectedVolumesForPrint = useMemo(() => {
    return volumes.filter((v) => selectedIds.includes(v.id));
  }, [volumes, selectedIds]);

  return (
    <div className="space-y-6 pb-36 sm:pb-40 font-sans max-w-4xl mx-auto">
      {/* Toast Notifications */}
      {actionMessage && (
        <div className="p-3 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs flex items-center justify-between shadow-2xs font-bold animate-fadeIn">
          <span>{actionMessage}</span>
          <button type="button" onClick={() => setActionMessage(null)} className="px-1 text-emerald-700 dark:text-emerald-300 font-bold cursor-pointer">✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200 border border-rose-200 dark:border-rose-800 rounded-2xl text-xs flex items-center justify-between shadow-2xs font-bold animate-fadeIn">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} className="px-1 text-rose-700 dark:text-rose-300 font-bold cursor-pointer">✕</button>
        </div>
      )}

      {/* 1. Location Bar & View / Select Controls */}
      <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
        <LibrarySpaceSwitcher />

        <div className="flex items-center gap-2">
          {/* Refresh Missing Covers */}
          <button
            type="button"
            onClick={handleRefreshAllMissingCovers}
            disabled={isRefreshingMissing}
            title="Scan multi-source registries (Google, OpenLibrary, ThriftBooks, AbeBooks) for missing book covers"
            className="px-3 py-1.5 rounded-2xl border text-xs font-medium transition cursor-pointer shadow-2xs bg-[#e8eef5] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-[#dce4ee] dark:hover:bg-slate-700 disabled:opacity-50"
          >
            {isRefreshingMissing ? "Searching Covers…" : "Find Missing Covers"}
          </button>

          {/* Select Mode Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              if (isSelectionMode) setSelectedIds([]);
            }}
            className={`px-3 py-1.5 rounded-2xl border text-xs font-medium transition cursor-pointer shadow-2xs ${
              isSelectionMode || selectedIds.length > 0
                ? "bg-slate-800 text-white border-slate-800 font-semibold shadow-xs"
                : "bg-[#e8eef5] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-[#dce4ee] dark:hover:bg-slate-700"
            }`}
          >
            {isSelectionMode || selectedIds.length > 0 ? `Selected (${selectedIds.length})` : "Select"}
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 bg-[#e8eef5] dark:bg-slate-800 rounded-2xl shadow-2xs border border-slate-300 dark:border-slate-700 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer font-medium ${
                viewMode === "grid"
                  ? "bg-slate-800 dark:bg-indigo-600 text-white shadow-xs font-semibold"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white"
              }`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer font-medium ${
                viewMode === "list"
                  ? "bg-slate-800 dark:bg-indigo-600 text-white shadow-xs font-semibold"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white"
              }`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* 2. Rounded Pill Search Bar (Lightish Blue-Grey) */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <div className="flex items-center bg-[#e8eef5] dark:bg-slate-800 rounded-full px-4 py-3 shadow-xs border border-slate-300 dark:border-slate-700 transition focus-within:ring-2 focus-within:ring-slate-400">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, author, category, ISBN..."
            className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 font-normal focus:outline-none"
          />
        </div>
      </form>

      {/* 3. Filter Pills + Sort Dropdown + Export Hub Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Fast Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none flex-1">
          {CATEGORY_PILLS.map((pill) => {
            const isActive = statusFilter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setStatusFilter(pill.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium tracking-tight shrink-0 transition active:scale-95 cursor-pointer ${
                  isActive
                    ? "bg-slate-800 dark:bg-indigo-600 text-white shadow-sm font-semibold"
                    : "bg-[#e2e8f0] hover:bg-[#cbd5e1] dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 shadow-2xs"
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Sort Dropdown & Export Hub */}
        <div className="flex items-center gap-2 shrink-0 justify-end">
          {/* Sort Selector */}
          <div className="relative">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className="bg-[#e8eef5] dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-2xl px-3 py-1.5 shadow-2xs focus:outline-none cursor-pointer"
              title="Sort collection"
            >
              <option value="DATE_DESC">📅 Recently Added</option>
              <option value="TITLE_ASC">🔤 Title (A → Z)</option>
              <option value="TITLE_DESC">🔤 Title (Z → A)</option>
              <option value="AUTHOR_ASC">👤 Author (A → Z)</option>
              <option value="DEWEY_ASC">🏷️ Dewey Call #</option>
              <option value="VALUE_DESC">💰 Value (High → Low)</option>
              <option value="VALUE_ASC">💰 Value (Low → High)</option>
            </select>
          </div>

          {/* Export Hub Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="px-3 py-1.5 rounded-2xl border text-xs font-medium transition cursor-pointer shadow-2xs bg-[#e8eef5] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-[#dce4ee] dark:hover:bg-slate-700 flex items-center gap-1.5"
            >
              <span>Export</span>
              <span className="text-[10px]">▼</span>
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 top-9 z-50 w-48 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl p-1.5 text-xs space-y-1 animate-scaleUp">
                <button
                  type="button"
                  onClick={() => handleExport("csv")}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 font-medium text-slate-800 dark:text-slate-200 transition cursor-pointer flex items-center justify-between"
                >
                  <span>Export as CSV</span>
                  <span className="text-[10px] text-slate-400 font-mono">.csv</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("json")}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 font-medium text-slate-800 dark:text-slate-200 transition cursor-pointer flex items-center justify-between"
                >
                  <span>Backup as JSON</span>
                  <span className="text-[10px] text-slate-400 font-mono">.json</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("bibtex")}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 font-medium text-slate-800 dark:text-slate-200 transition cursor-pointer flex items-center justify-between"
                >
                  <span>BibTeX Citation</span>
                  <span className="text-[10px] text-slate-400 font-mono">.bib</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Catalog Display (Grid vs. List) */}
      {loading ? (
        <div className="p-16 text-center text-slate-600 dark:text-slate-300 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl shadow-xs border border-slate-300 dark:border-slate-700 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-slate-700 dark:border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-normal text-slate-600 dark:text-slate-300">Loading collection...</span>
        </div>
      ) : sortedVolumes.length === 0 ? (
        <div className="p-16 text-center text-slate-600 dark:text-slate-300 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl shadow-xs border border-slate-300 dark:border-slate-700 space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">No books found in this space.</p>
          <Link
            to="/library/quick-scan"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium text-xs rounded-xl shadow-md transition"
          >
            Quick Camera Scanner
          </Link>
        </div>
      ) : viewMode === "grid" ? (
        /* Minimalist Modern Floating Covers Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
          {sortedVolumes.map((vol, idx) => {
            const isLiked = likedIds.includes(vol.id);
            const isSelected = selectedIds.includes(vol.id);
            return (
              <div
                key={vol.id}
                onClick={() => openBookDetail(vol)}
                className={`group cursor-pointer space-y-2 select-none relative transition ${
                  isSelected ? "scale-[0.98]" : ""
                }`}
              >
                {/* Book Cover */}
                <div
                  className={`relative w-full aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_8px_20px_rgba(0,0,0,0.06)] group-hover:shadow-[0_12px_28px_rgba(0,0,0,0.12)] group-hover:-translate-y-1 transition duration-300 bg-[#f1f5f9] dark:bg-slate-800 border flex items-center justify-center ${
                    isSelected
                      ? "ring-4 ring-slate-700 border-slate-700 shadow-xl"
                      : "border-slate-300 dark:border-slate-700"
                  }`}
                >
                  {vol.coverUrl ? (
                    <img
                      src={vol.coverUrl}
                      alt={vol.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full p-3 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 text-slate-800 dark:text-white flex flex-col justify-between border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] font-semibold tracking-widest text-indigo-600 dark:text-indigo-400">COLOPHON</span>
                      <p className="text-[11px] font-semibold line-clamp-3 leading-tight">{vol.title}</p>
                    </div>
                  )}

                  {/* Checkbox (in selection mode or on card hover) */}
                  {(isSelectionMode || isSelected) ? (
                    <div
                      onClick={(e) => toggleSelectVolume(vol.id, e)}
                      className="absolute top-2 left-2 z-10 w-6 h-6 rounded-lg bg-white/95 dark:bg-slate-900/95 shadow-md flex items-center justify-center border border-slate-300 dark:border-slate-600"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                      />
                    </div>
                  ) : (
                    /* Sorting Rank Number Badge */
                    <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-slate-900/80 text-white font-medium text-[9px] rounded-lg backdrop-blur-md shadow-xs">
                      #{idx + 1}
                    </div>
                  )}

                  {/* Bookmark Heart Button */}
                  <button
                    type="button"
                    onClick={(e) => toggleLike(vol.id, e)}
                    className={`absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex items-center justify-center text-xs shadow-md transition active:scale-125 ${
                      isLiked ? "text-rose-500" : "text-slate-400 hover:text-rose-500"
                    }`}
                  >
                    {isLiked ? "♥" : "♡"}
                  </button>

                  {/* Call Number / Spine Badge */}
                  {vol.deweyDecimal && (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-slate-900/85 text-amber-300 font-mono font-bold text-[8px] rounded-md backdrop-blur-md shadow-xs">
                      {vol.deweyDecimal}
                    </div>
                  )}

                  {/* Status Badge */}
                  {vol.readingStatus === "READING" && (
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-blue-600 text-white font-medium text-[8px] rounded-full shadow-xs">
                      Reading
                    </div>
                  )}
                  {vol.readingStatus === "COMPLETED" && (
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-emerald-600 text-white font-medium text-[8px] rounded-full shadow-xs">
                      Read
                    </div>
                  )}
                </div>

                {/* Typography */}
                <div className="px-1 text-center">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                    {vol.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate mt-0.5">
                    {vol.author || "Unknown"}
                  </p>
                  <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 mt-1">
                    {formatCurrency(vol.rareMarketValue || vol.replacementValue)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Ultra-Clean Modern List Items */
        <div className="space-y-2.5">
          {sortedVolumes.map((vol, idx) => {
            const isLiked = likedIds.includes(vol.id);
            const isSelected = selectedIds.includes(vol.id);
            return (
              <div
                key={vol.id}
                onClick={() => openBookDetail(vol)}
                className={`bg-[#f1f5f9] dark:bg-slate-800 rounded-2xl p-3 shadow-xs border transition cursor-pointer group flex items-center justify-between gap-3.5 ${
                  isSelected
                    ? "ring-2 ring-slate-700 border-slate-700 bg-slate-200/50 dark:bg-indigo-950/30"
                    : "border-slate-300 dark:border-slate-700 hover:shadow-md"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Select Checkbox (in selection mode or if selected) */}
                  {(isSelectionMode || isSelected) && (
                    <div onClick={(e) => toggleSelectVolume(vol.id, e)} className="shrink-0 p-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-slate-800 cursor-pointer"
                      />
                    </div>
                  )}

                  <div className="w-11 h-15 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shrink-0 border border-slate-300 dark:border-slate-700 flex items-center justify-center shadow-2xs">
                    {vol.coverUrl ? (
                      <img src={vol.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-medium text-slate-500">BOOK</span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                      {vol.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate mt-0.5">
                      {vol.author || "Unknown Author"}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-1">
                      <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">
                        {vol.deweyDecimal ? `DDC ${vol.deweyDecimal}` : vol.locClassification ? `LOC ${vol.locClassification}` : "General"}
                      </span>
                      <span>•</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        {formatCurrency(vol.rareMarketValue || vol.replacementValue)}
                      </span>
                      {vol.readingStatus && vol.readingStatus !== "UNREAD" && (
                        <>
                          <span>•</span>
                          <span className={`px-1.5 py-0.2 rounded font-medium text-[9px] ${
                            vol.readingStatus === "COMPLETED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                            vol.readingStatus === "READING" ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" : "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                          }`}>
                            {vol.readingStatus}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700/70 border border-slate-300 dark:border-slate-600 px-2 py-0.5 rounded-lg" title="Sort Rank">
                    #{idx + 1}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => toggleLike(vol.id, e)}
                    className={`text-base p-1 transition cursor-pointer active:scale-125 ${
                      isLiked ? "text-rose-500 scale-110" : "text-slate-400 hover:text-rose-500"
                    }`}
                  >
                    {isLiked ? "♥" : "♡"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Docked Full-Width Selection & Bulk Action Bar (Nestled cleanly above Quick Nav) */}
      {(isSelectionMode || selectedIds.length > 0) && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 left-0 right-0 z-[9970] px-3 sm:px-6 pointer-events-none">
          <div className="max-w-4xl mx-auto w-full bg-[#f8fafc]/98 dark:bg-[#0f172a]/98 backdrop-blur-xl border border-slate-300 dark:border-slate-700 shadow-2xl rounded-3xl p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-slate-800 dark:text-white animate-slideUp pointer-events-auto">
            {/* Left: Checkbox + Counter & Value */}
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer font-bold text-xs select-none">
                <input
                  type="checkbox"
                  checked={volumes.length > 0 && selectedIds.length === volumes.length}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded text-slate-800 dark:text-indigo-500 cursor-pointer accent-slate-800 dark:accent-indigo-500"
                />
                <span className="text-slate-900 dark:text-white">
                  {selectedIds.length === volumes.length ? "All Selected" : "Select All"}
                </span>
              </label>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-full text-xs font-black text-slate-800 dark:text-slate-200">
                  {selectedIds.length} of {volumes.length}
                </span>
                {selectedIds.length > 0 && (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(selectedTotalValue)}
                  </span>
                )}
              </div>
            </div>

            {/* Right: Roomy Action Buttons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none">
              {/* Move Action */}
              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => {
                  setTargetSpaceId(activeSpaceId !== "ALL" ? activeSpaceId : spaces[0]?.id || "");
                  setIsMoveModalOpen(true);
                }}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/80 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold transition cursor-pointer border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>📦</span>
                <span>Move Space / Shelf</span>
              </button>

              {/* Print Labels Action */}
              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => setIsPrintModalOpen(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer border border-slate-300 dark:border-slate-600 flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>🏷️</span>
                <span>Print Labels</span>
              </button>

              {/* Bulk Delete Action */}
              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={handleBulkDelete}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>🗑️</span>
                <span>Delete</span>
              </button>

              {/* Done / Close Selection */}
              <button
                type="button"
                onClick={() => {
                  setSelectedIds([]);
                  setIsSelectionMode(false);
                }}
                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-xl transition cursor-pointer shrink-0"
              >
                ✕ Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Selected Books Modal */}
      {isMoveModalOpen && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full animate-scaleUp space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Move {selectedIds.length} Selected Books
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Reassign these volumes to a different Library Space or physical shelf.
              </p>
            </div>

            <form onSubmit={handleBulkMove} className="space-y-4 text-xs">
              <div>
                <label className="block font-black text-slate-900 dark:text-white mb-1">
                  Destination Library Space
                </label>
                <select
                  value={targetSpaceId}
                  onChange={(e) => setTargetSpaceId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 font-bold text-slate-900 dark:text-white"
                >
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.location || "Main"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-black text-slate-900 dark:text-white mb-1">
                  Destination Shelf (Optional)
                </label>
                <select
                  value={targetShelfId}
                  onChange={(e) => setTargetShelfId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 font-bold text-slate-900 dark:text-white"
                >
                  <option value="">-- Keep Current / Unassigned --</option>
                  {shelves.map((sh) => (
                    <option key={sh.id} value={sh.id}>
                      {sh.fullLocationLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsMoveModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBulk}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black rounded-xl shadow-md"
                >
                  {isSubmittingBulk ? "Moving…" : `Move ${selectedIds.length} Books`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Spine Labels Modal */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90vh] flex flex-col animate-scaleUp space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Spine Labels Preview ({selectedVolumesForPrint.length} items)
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Standard library spine tags with Dewey/LOC call numbers and barcodes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                ✕
              </button>
            </div>

            {/* Printable Label Grid */}
            <div className="overflow-y-auto flex-1 p-2 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 print:grid-cols-3">
                {selectedVolumesForPrint.map((vol) => (
                  <div
                    key={vol.id}
                    className="bg-white text-slate-900 p-3 rounded-xl border border-slate-300 shadow-xs flex flex-col justify-between h-36 font-mono text-[11px]"
                  >
                    <div className="space-y-0.5">
                      <div className="font-black text-sm text-indigo-900 leading-tight">
                        {vol.deweyDecimal ? `DDC ${vol.deweyDecimal}` : (vol.locClassification || "GEN")}
                      </div>
                      <div className="font-bold text-slate-700 tracking-wider text-[10px]">
                        {vol.author ? vol.author.slice(0, 3).toUpperCase() : "COL"}
                      </div>
                      <p className="font-sans font-bold text-[10px] text-slate-900 line-clamp-2 leading-tight">
                        {vol.title}
                      </p>
                    </div>

                    <div className="pt-1 border-t border-slate-200 text-[9px] text-slate-500 font-mono">
                      <div className="font-mono tracking-widest text-[8px] truncate">
                        ||||| | |||| || |||
                      </div>
                      <span className="truncate block font-bold">{vol.isbn || vol.id.slice(0, 10)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-md transition"
              >
                Print Label Sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Authentic "Book Details" Screen / Modal Sheet */}
      {selectedVolume && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col animate-scaleUp border border-slate-200 dark:border-slate-800">
            {/* Clean Light/Dark Header Bar */}
            <div className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white px-4 py-3.5 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setSelectedVolume(null)}
                className="w-8 h-8 rounded-full bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-xs font-bold transition cursor-pointer"
              >
                ←
              </button>
              <h2 className="text-xs font-black tracking-wider uppercase text-slate-700 dark:text-slate-200">
                Book Details
              </h2>
              <button
                type="button"
                onClick={() => toggleLike(selectedVolume.id)}
                className={`w-8 h-8 rounded-full bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-sm transition cursor-pointer ${
                  likedIds.includes(selectedVolume.id) ? "text-rose-500" : "text-slate-400"
                }`}
              >
                {likedIds.includes(selectedVolume.id) ? "♥" : "♡"}
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {!isEditing ? (
                <>
                  {/* Top Book Header: Large Cover on Left + Metadata on Right */}
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                      <div
                        onClick={() => openCoverPicker(selectedVolume)}
                        className="group relative w-24 sm:w-28 aspect-[2/3] rounded-2xl overflow-hidden shadow-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer transition hover:shadow-lg"
                        title="Click to view & select from multiple cover sources"
                      >
                        {selectedVolume.coverUrl ? (
                          <img
                            src={selectedVolume.coverUrl}
                            alt={selectedVolume.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        ) : (
                          <div className="w-full h-full p-2 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 text-slate-800 dark:text-white flex flex-col justify-between">
                            <span className="text-[9px] font-semibold text-indigo-600 dark:text-indigo-400">COLOPHON</span>
                            <p className="text-[10px] font-semibold line-clamp-3 leading-tight">{selectedVolume.title}</p>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-medium p-1 text-center backdrop-blur-xs">
                          <span>Change</span>
                          <span>Cover</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openCoverPicker(selectedVolume)}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                      >
                        Alternate Covers
                      </button>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                        {selectedVolume.title}
                      </h3>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {selectedVolume.author || "Unknown Author"}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
                        Published: <strong className="text-slate-900 dark:text-white">{selectedVolume.publishYear || "2020"}</strong> • Pages: <strong className="text-slate-900 dark:text-white">{selectedVolume.pageCount || "320"}</strong>
                      </p>

                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-black text-[10px] rounded-md">
                          Rank #{volumes.findIndex(v => v.id === selectedVolume.id) + 1 || 1}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          {selectedVolume.isLoaned ? "On Loan" : "Available on Shelf"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* About The Book Synopsis */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                      About The Book
                    </h4>
                    <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-medium line-clamp-4">
                      {selectedVolume.description ||
                        `An acclaimed volume cataloged in the ${activeSpace?.name || "Library"} collection. Features verified Dewey Decimal classification ${selectedVolume.deweyDecimal || "--"} and catalog inventory identification.`}
                    </p>
                  </div>

                  {/* Dual Action Buttons */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-black text-xs rounded-xl shadow-sm transition text-center cursor-pointer uppercase tracking-wider"
                    >
                      Reading Status
                    </button>

                    <Link
                      to="/library/shelves"
                      className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-sm transition text-center uppercase tracking-wider"
                    >
                      Locate Shelf
                    </Link>
                  </div>

                  {/* Shelf Location Cards */}
                  <div className="space-y-2.5 pt-2">
                    <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                      Shelf Location
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1">
                        <p className="text-xs font-black text-slate-900 dark:text-slate-100">
                          {selectedVolume.roomName || "Main Study"}
                        </p>
                        <p className="text-[10px] text-slate-600 dark:text-slate-300 font-semibold">
                          {selectedVolume.shelfName || "Main Stacks Row A"}
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1">
                        <p className="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">
                          DDC {selectedVolume.deweyDecimal || "800.1"}
                        </p>
                        <p className="text-[10px] text-slate-600 dark:text-slate-300 font-semibold">
                          {getConditionLabel(selectedVolume.condition)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Remove Button */}
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={handleDeleteVolume}
                      className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-bold cursor-pointer"
                    >
                      Remove from Library
                    </button>
                  </div>
                </>
              ) : (
                /* Edit Mode */
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Title</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Author</label>
                      <input
                        type="text"
                        value={editAuthor}
                        onChange={(e) => setEditAuthor(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Reading Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as any)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-900 dark:text-white"
                      >
                        <option value="UNREAD">To Read (Unread)</option>
                        <option value="READING">Currently Reading</option>
                        <option value="COMPLETED">Completed (Read)</option>
                        <option value="WISHLIST">Wishlist</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Condition</label>
                      <select
                        value={editCondition}
                        onChange={(e) => setEditCondition(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold text-slate-900 dark:text-white"
                      >
                        <option value="FINE">Fine / Like New</option>
                        <option value="VERY_GOOD">Very Good</option>
                        <option value="GOOD">Good</option>
                        <option value="FAIR">Fair</option>
                        <option value="POOR">Poor</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Dewey (DDC)</label>
                      <input
                        type="text"
                        value={editDewey}
                        onChange={(e) => setEditDewey(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Replacement Value ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-mono font-bold text-emerald-600 dark:text-emerald-400"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      onClick={handleSaveEdit}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Multi-Source Alternate Cover Picker Modal */}
      {isCoverPickerOpen && selectedVolume && (
        <div className="fixed inset-0 z-[100000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-scaleUp border border-slate-200 dark:border-slate-800">
            {/* Header */}
            <div className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 px-5 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Cover Images & Editions
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                  {selectedVolume.title} {selectedVolume.isbn ? `• ISBN ${selectedVolume.isbn}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCoverPickerOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Sources searched info */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-500 font-medium">Registries:</span>
                <span className="px-2 py-0.5 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg text-[10px] font-medium">Google Books HD</span>
                <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-[10px] font-medium">Open Library CDN</span>
                <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[10px] font-medium">ThriftBooks</span>
                <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg text-[10px] font-medium">AbeBooks</span>
                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg text-[10px] font-medium">ISBNdb</span>
              </div>

              {/* Loading State */}
              {loadingCovers && (
                <div className="py-12 text-center space-y-3">
                  <div className="w-8 h-8 border-2 border-slate-800 dark:border-white border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                    Probing multi-source book cover registries in parallel…
                  </p>
                </div>
              )}

              {/* Candidates Grid */}
              {!loadingCovers && coverCandidates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Found {coverCandidates.length} Verified Cover {coverCandidates.length === 1 ? "Edition" : "Editions"}:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {coverCandidates.map((cand, idx) => {
                      const isCurrent = selectedVolume.coverUrl === cand.url;
                      return (
                        <div
                          key={idx}
                          onClick={() => handleSelectCover(cand.url)}
                          className={`group relative rounded-2xl border p-2 flex flex-col justify-between items-center text-center cursor-pointer transition ${
                            isCurrent
                              ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-2 ring-emerald-500"
                              : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-md"
                          }`}
                        >
                          <div className="w-full aspect-[2/3] rounded-xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 mb-2 flex items-center justify-center">
                            <img
                              src={cand.url}
                              alt={`Cover candidate from ${cand.source}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                          </div>

                          <div className="w-full space-y-1">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                              cand.source === "Google Books"
                                ? "bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300"
                                : cand.source === "Open Library"
                                ? "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300"
                                : cand.source === "ThriftBooks"
                                ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                                : cand.source === "AbeBooks"
                                ? "bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300"
                                : "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                            }`}>
                              {cand.source}
                            </span>

                            <button
                              type="button"
                              className={`w-full py-1 text-[10px] font-medium rounded-lg transition ${
                                isCurrent
                                  ? "bg-emerald-600 text-white font-semibold"
                                  : "bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white"
                              }`}
                            >
                              {isCurrent ? "✓ Active Cover" : "Select Cover"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!loadingCovers && coverCandidates.length === 0 && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 text-center space-y-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    No registry covers automatically matched.
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    You can paste any custom image link below to set a custom book cover.
                  </p>
                </div>
              )}

              {/* Custom Image URL Section */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block font-semibold text-slate-800 dark:text-slate-200">
                  Or Paste Custom Image URL:
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://example.com/cover.jpg"
                    value={customCoverUrl}
                    onChange={(e) => setCustomCoverUrl(e.target.value)}
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customCoverUrl.trim()) {
                        void handleSelectCover(customCoverUrl.trim());
                      }
                    }}
                    disabled={!customCoverUrl.trim()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium rounded-xl disabled:opacity-50 transition cursor-pointer"
                  >
                    Apply URL
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsCoverPickerOpen(false)}
                className="px-5 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-medium rounded-xl text-xs cursor-pointer transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

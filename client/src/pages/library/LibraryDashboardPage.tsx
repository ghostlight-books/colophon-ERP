import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import LibrarySpaceSwitcher from "../../components/library/LibrarySpaceSwitcher";
import { useLibrarySpace } from "../../context/LibrarySpaceContext";
import {
  fetchLibraryDashboard,
  fetchLibraryVolumes,
  type LibraryDashboardSummary,
  type LibraryVolume,
} from "../../services/library.service";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

const CATEGORY_PILLS = [
  { label: "Autobiography", dewey: "9" },
  { label: "Arts & Crafts", dewey: "7" },
  { label: "Thriller & Fiction", dewey: "8" },
  { label: "Philosophy & Mind", dewey: "1" },
  { label: "Science & Tech", dewey: "5" },
  { label: "Social Science", dewey: "3" },
];

export default function LibraryDashboardPage() {
  const navigate = useNavigate();
  const { activeSpace, activeSpaceId } = useLibrarySpace();
  const [data, setData] = useState<LibraryDashboardSummary | null>(null);
  const [recentVolumes, setRecentVolumes] = useState<LibraryVolume[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLoading] = useState(true);

  // Liked / Bookmarked items state
  const [likedIds, setLikedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("colophon_liked_books") || "[]");
    } catch {
      return [];
    }
  });

  const toggleLike = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLikedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id];
      localStorage.setItem("colophon_liked_books", JSON.stringify(next));
      return next;
    });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [summary, volumesRes] = await Promise.all([
        fetchLibraryDashboard(),
        fetchLibraryVolumes({
          librarySpaceId: activeSpaceId !== "ALL" ? activeSpaceId : undefined,
          limit: 50,
        }),
      ]);
      setData(summary);
      setRecentVolumes(volumesRes.items);
    } catch (err) {
      console.warn("loadData error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeSpaceId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/library/catalog?query=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate("/library/catalog");
    }
  };

  // 1. Total volumes & value metrics
  const totalBooks = activeSpaceId === "ALL" ? (data?.totalVolumes ?? 0) : (activeSpace?.volumeCount ?? recentVolumes.length);
  const totalValue = activeSpaceId === "ALL" ? (data?.totalReplacementValue ?? 0) : (activeSpace?.totalValue ?? recentVolumes.reduce((s, v) => s + (v.rareMarketValue || v.replacementValue || 18.99), 0));
  const avgBookValue = totalBooks > 0 ? totalValue / totalBooks : 0;

  // 2. Reading Status Metrics & Percentages
  const readingStats = useMemo(() => {
    if (activeSpaceId === "ALL" && data?.readingStats) {
      return data.readingStats;
    }
    const completed = recentVolumes.filter((v) => v.readingStatus === "COMPLETED").length;
    const reading = recentVolumes.filter((v) => v.readingStatus === "READING").length;
    const unread = recentVolumes.filter((v) => v.readingStatus === "UNREAD" || !v.readingStatus).length;
    const wishlist = recentVolumes.filter((v) => v.readingStatus === "WISHLIST").length;
    const readPercentage = totalBooks > 0 ? Math.round((completed / totalBooks) * 100) : 0;
    return { completed, reading, unread, wishlist, readPercentage };
  }, [data, recentVolumes, activeSpaceId, totalBooks]);

  // 3. Top Categories Breakdown Report
  const categoryReport = useMemo(() => {
    if (activeSpaceId === "ALL" && data?.deweyDistribution && data.deweyDistribution.length > 0) {
      const total = data.totalVolumes || 1;
      return [...data.deweyDistribution]
        .filter((d) => d.count > 0)
        .sort((a, b) => b.count - a.count)
        .map((d) => ({
          key: d.divisionKey,
          label: d.label,
          count: d.count,
          totalValue: d.totalValue,
          percentage: Math.round((d.count / total) * 100),
        }));
    }

    const counts: Record<string, { label: string; key: string; count: number; totalValue: number }> = {};
    recentVolumes.forEach((v) => {
      const deweyKey = v.deweyDecimal ? v.deweyDecimal.charAt(0) : "8";
      const label = v.deweyCategory || (deweyKey === "8" ? "Literature & Fiction" : "General Collection");
      if (!counts[deweyKey]) {
        counts[deweyKey] = { label, key: deweyKey, count: 0, totalValue: 0 };
      }
      counts[deweyKey].count += 1;
      counts[deweyKey].totalValue += (v.rareMarketValue || v.replacementValue || 18.99);
    });

    const total = recentVolumes.length || 1;
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .map((c) => ({
        ...c,
        percentage: Math.round((c.count / total) * 100),
      }));
  }, [data, recentVolumes, activeSpaceId]);

  return (
    <div className="space-y-6 pb-24 font-sans max-w-4xl mx-auto">
      {/* 1. Location Switcher Top Bar */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <LibrarySpaceSwitcher />

        <Link
          to="/library/catalog"
          className="text-xs font-medium text-slate-600 dark:text-indigo-400 hover:text-slate-900 dark:hover:text-indigo-300 hover:underline shrink-0"
        >
          View Full Catalog →
        </Link>
      </div>

      {/* 2. Total Books, Total Value & Primary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: Total Volumes */}
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Books
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">
            {totalBooks}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            {activeSpaceId === "ALL" ? "Across all locations" : activeSpace?.name || "In this space"}
          </p>
        </div>

        {/* Card 2: Total Replacement Value */}
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Value
          </p>
          <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
            {formatCurrency(totalValue)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            {formatCurrency(avgBookValue)} avg / book
          </p>
        </div>

        {/* Card 3: % Read Completed */}
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            % Read
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-indigo-400">
            {readingStats.readPercentage}%
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            {readingStats.completed} of {totalBooks} books read
          </p>
        </div>

        {/* Card 4: Reading / In Progress */}
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Reading Now
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-sky-400">
            {readingStats.reading}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            {readingStats.unread} on TBR stack
          </p>
        </div>
      </div>

      {/* 3. Reading Progress & Completion Report Card */}
      <div className="p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">
              Reading Progress & Collection Health
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5">
              {readingStats.readPercentage}% of your total catalog completed
            </p>
          </div>
          <span className="text-base font-semibold text-slate-900 dark:text-indigo-400">
            {readingStats.readPercentage}%
          </span>
        </div>

        {/* Multi-Segmented Progress Bar */}
        <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex gap-0.5 p-0.5">
          {totalBooks > 0 ? (
            <>
              <div
                style={{ width: `${(readingStats.completed / totalBooks) * 100}%` }}
                className="bg-emerald-600 rounded-l-full transition-all duration-500"
                title={`Completed: ${readingStats.completed} books`}
              />
              <div
                style={{ width: `${(readingStats.reading / totalBooks) * 100}%` }}
                className="bg-sky-600 transition-all duration-500"
                title={`Reading: ${readingStats.reading} books`}
              />
              <div
                style={{ width: `${(readingStats.unread / totalBooks) * 100}%` }}
                className="bg-slate-400 dark:bg-slate-600 rounded-r-full transition-all duration-500"
                title={`To Read: ${readingStats.unread} books`}
              />
            </>
          ) : (
            <div className="w-full bg-slate-300 dark:bg-slate-700 rounded-full" />
          )}
        </div>

        {/* Filter Quick Action Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => navigate("/library/catalog?status=COMPLETED")}
            className="p-2.5 rounded-2xl bg-white dark:bg-emerald-950/40 border border-slate-300 dark:border-emerald-800 text-left transition hover:scale-[1.01] cursor-pointer shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-600 dark:text-emerald-300 uppercase">Completed</span>
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-emerald-200 mt-1">
              {readingStats.completed} books
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate("/library/catalog?status=READING")}
            className="p-2.5 rounded-2xl bg-white dark:bg-sky-950/40 border border-slate-300 dark:border-sky-800 text-left transition hover:scale-[1.01] cursor-pointer shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-600 dark:text-sky-300 uppercase">Reading</span>
              <span className="w-2 h-2 rounded-full bg-sky-600" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-sky-200 mt-1">
              {readingStats.reading} books
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate("/library/catalog?status=UNREAD")}
            className="p-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-left transition hover:scale-[1.01] cursor-pointer shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 uppercase">To Read (TBR)</span>
              <span className="w-2 h-2 rounded-full bg-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1">
              {readingStats.unread} books
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigate("/library/catalog?status=WISHLIST")}
            className="p-2.5 rounded-2xl bg-white dark:bg-purple-950/40 border border-slate-300 dark:border-purple-800 text-left transition hover:scale-[1.01] cursor-pointer shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-slate-600 dark:text-purple-300 uppercase">Wishlist</span>
              <span className="w-2 h-2 rounded-full bg-purple-600" />
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-purple-200 mt-1">
              {readingStats.wishlist} books
            </p>
          </button>
        </div>
      </div>

      {/* 4. Top Categories Breakdown Report */}
      <div className="p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">
              Top Categories Breakdown
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5">
              Ranked by largest concentration of volumes
            </p>
          </div>
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            {categoryReport.length} Divisions
          </span>
        </div>

        {categoryReport.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
            No category distribution available yet.
          </p>
        ) : (
          <div className="space-y-2">
            {categoryReport.map((cat, idx) => (
              <div
                key={cat.key}
                onClick={() => navigate(`/library/catalog?dewey=${cat.key}`)}
                className="group cursor-pointer space-y-1.5 p-2 rounded-xl hover:bg-white/80 dark:hover:bg-slate-700/50 transition"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-slate-400 w-4">
                      #{idx + 1}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                      {cat.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-normal text-slate-500 dark:text-slate-400">
                      {cat.count} {cat.count === 1 ? "book" : "books"}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-indigo-400 w-10 text-right">
                      {cat.percentage}%
                    </span>
                  </div>
                </div>

                {/* Proportional Progress Bar */}
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${Math.max(cat.percentage, 4)}%` }}
                    className="h-full bg-slate-600 dark:bg-indigo-500 rounded-full transition-all duration-300"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Rounded Pill Search Bar */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <div className="flex items-center bg-[#e8eef5] dark:bg-slate-800 rounded-full px-4 py-3 shadow-xs border border-slate-300 dark:border-slate-700 transition focus-within:ring-2 focus-within:ring-slate-400">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by authors, category, ISBN, title..."
            className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white placeholder:text-slate-400 font-normal focus:outline-none"
          />
        </div>
      </form>

      {/* 6. Clean Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORY_PILLS.map((pill) => (
          <button
            key={pill.label}
            type="button"
            onClick={() => navigate(`/library/catalog?dewey=${pill.dewey}`)}
            className="px-4 py-1.5 rounded-full text-xs font-medium tracking-tight shrink-0 shadow-2xs transition active:scale-95 cursor-pointer bg-[#e2e8f0] hover:bg-[#cbd5e1] dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* 7. Curated Shelves & Rooms Badges */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">
            Curated Shelves & Rooms
          </h2>
          <Link
            to="/library/shelves"
            className="text-xs font-medium text-slate-600 dark:text-indigo-400 hover:underline"
          >
            Manage Shelves →
          </Link>
        </div>

        <div className="flex items-center gap-4 overflow-x-auto pb-1 scrollbar-none px-1">
          {[
            { label: "Study Room", initial: "SR", color: "from-blue-600 to-indigo-700" },
            { label: "Living Room", initial: "LR", color: "from-emerald-500 to-teal-700" },
            { label: "Bedside TBR", initial: "TBR", color: "from-amber-500 to-orange-600" },
            { label: "Rare Stacks", initial: "RS", color: "from-purple-600 to-pink-600" },
            { label: "Audiobooks", initial: "AB", color: "from-sky-500 to-blue-700" },
            { label: "Wishlist", initial: "WL", color: "from-rose-500 to-rose-700" },
          ].map((shelf) => (
            <div
              key={shelf.label}
              onClick={() => navigate(`/library/shelves`)}
              className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group select-none"
            >
              <div className={`w-14 h-14 rounded-full bg-gradient-to-tr ${shelf.color} text-white text-xs font-semibold flex items-center justify-center shadow-sm group-hover:scale-105 transition duration-200 border-2 border-white dark:border-slate-800`}>
                {shelf.initial}
              </div>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate max-w-[70px] text-center">
                {shelf.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 8. Full Collection List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">
            Library Collection
          </h2>
          <Link
            to="/library/catalog"
            className="text-xs font-medium text-slate-600 dark:text-indigo-400 hover:underline"
          >
            All {totalBooks} Books →
          </Link>
        </div>

        {recentVolumes.length === 0 ? (
          <div className="p-8 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 text-center text-slate-600 dark:text-slate-300 text-xs shadow-xs space-y-2">
            <p className="font-medium">No books cataloged in this space yet.</p>
            <Link
              to="/library/quick-scan"
              className="block text-indigo-600 dark:text-indigo-400 font-medium text-xs hover:underline"
            >
              Scan your first book
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentVolumes.slice(0, 8).map((vol, idx) => {
              const isLiked = likedIds.includes(vol.id);
              return (
                <div
                  key={vol.id}
                  onClick={() => navigate(`/library/catalog?query=${encodeURIComponent(vol.title)}`)}
                  className="bg-[#f1f5f9] dark:bg-slate-800 rounded-2xl p-3 shadow-xs border border-slate-300 dark:border-slate-700 flex items-center justify-between gap-3.5 hover:shadow-md transition cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
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
                        <span>{vol.deweyDecimal ? `DDC ${vol.deweyDecimal}` : "General"}</span>
                        <span>•</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          {formatCurrency(vol.rareMarketValue || vol.replacementValue)}
                        </span>
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
                      title={isLiked ? "Remove bookmark" : "Bookmark book"}
                    >
                      {isLiked ? "♥" : "♡"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

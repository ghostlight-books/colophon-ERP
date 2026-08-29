import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SurfaceCard from "../../components/ui/SurfaceCard";
import {
  fetchLibraryDashboard,
  type LibraryDashboardSummary,
} from "../../services/library.service";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export default function LibraryDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<LibraryDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await fetchLibraryDashboard();
      setData(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load library dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Welcome Card */}
      <SurfaceCard className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 text-xl font-bold shadow-sm">
                🏛️
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Colophon Library Edition</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Personal, Professional & Institutional Collection Cataloging, Dewey/LOC Classification & Insurance Valuation
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/library/scan"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>📷</span>
              <span>Scan New Books</span>
            </Link>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              <span>🔄 Refresh</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* 4 Key Metric Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
          <div className="p-4 bg-gradient-to-br from-indigo-50/70 to-indigo-100/40 rounded-2xl border border-indigo-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-indigo-800 font-bold mb-1">
              <span>Total Cataloged Volumes</span>
              <span>📚</span>
            </div>
            <div className="text-2xl font-black text-indigo-950">
              {loading ? "--" : data?.totalVolumes.toLocaleString() ?? 0}
            </div>
            <p className="text-[11px] text-indigo-700/80 mt-1 font-medium">In your library collection</p>
          </div>

          <div className="p-4 bg-gradient-to-br from-emerald-50/70 to-emerald-100/40 rounded-2xl border border-emerald-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-emerald-800 font-bold mb-1">
              <span>Estimated Replacement Value</span>
              <span>🏷️</span>
            </div>
            <div className="text-2xl font-black text-emerald-950">
              {loading ? "--" : formatCurrency(data?.totalReplacementValue)}
            </div>
            <p className="text-[11px] text-emerald-700/80 mt-1 font-medium">Insurance & appraisal estimate</p>
          </div>

          <div className="p-4 bg-gradient-to-br from-amber-50/70 to-amber-100/40 rounded-2xl border border-amber-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-amber-800 font-bold mb-1">
              <span>Tracked Shelves & Rooms</span>
              <span>🗄️</span>
            </div>
            <div className="text-2xl font-black text-amber-950">
              {loading ? "--" : data?.shelvesCount ?? 0}
            </div>
            <p className="text-[11px] text-amber-700/80 mt-1 font-medium">Physical location zones</p>
          </div>

          <div className="p-4 bg-gradient-to-br from-blue-50/70 to-blue-100/40 rounded-2xl border border-blue-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-xs text-blue-800 font-bold mb-1">
              <span>Read & Completed</span>
              <span>📖</span>
            </div>
            <div className="text-2xl font-black text-blue-950">
              {loading ? "--" : `${data?.readingStats.readPercentage ?? 0}%`}
            </div>
            <p className="text-[11px] text-blue-700/80 mt-1 font-medium">
              {data?.readingStats.completed ?? 0} of {data?.totalVolumes ?? 0} volumes read
            </p>
          </div>
        </div>
      </SurfaceCard>

      {/* Grid: Classification Breakdown & Reading/Lending Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Dewey Decimal Classification Distribution (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <SurfaceCard className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">🏷️</span>
                <h2 className="text-sm font-bold text-slate-900">Dewey Decimal Classification (DDC)</h2>
              </div>
              <Link
                to="/library/catalog"
                className="text-xs text-indigo-700 hover:text-indigo-800 font-bold"
              >
                Browse All &rarr;
              </Link>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs">Loading classification metrics...</div>
            ) : !data || data.deweyDistribution.every((d) => d.count === 0) ? (
              <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                <span className="text-2xl block mb-1">📖</span>
                <p className="text-xs font-bold text-slate-700">No books cataloged yet.</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Scan your first ISBNs to see classification distribution!</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.deweyDistribution.map((item) => {
                  const maxCount = Math.max(1, ...data.deweyDistribution.map((d) => d.count));
                  const pct = Math.round((item.count / maxCount) * 100);

                  return (
                    <div
                      key={item.divisionKey}
                      onClick={() => item.count > 0 && navigate(`/library/catalog?dewey=${item.divisionKey.slice(0, 1)}`)}
                      className={`p-2.5 rounded-xl border transition flex flex-col gap-1.5 ${
                        item.count > 0
                          ? "bg-slate-50 hover:bg-indigo-50/60 border-slate-200/90 cursor-pointer"
                          : "bg-slate-50/40 border-slate-200/50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900 truncate">{item.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200/60 text-[11px]">
                            {item.count} {item.count === 1 ? "book" : "books"}
                          </span>
                          <span className="text-slate-500 text-[11px] font-medium">
                            {formatCurrency(item.totalValue)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SurfaceCard>
        </div>

        {/* Right Column: Reading Progress, Active Loans & Quick Actions (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Reading Status Breakdown */}
          <SurfaceCard className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
              <span className="text-base">📖</span>
              <h2 className="text-sm font-bold text-slate-900">Reading Progress</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                <span className="text-xs text-emerald-800 font-bold block">Completed</span>
                <span className="text-xl font-black text-emerald-950 block mt-0.5">
                  {data?.readingStats.completed ?? 0}
                </span>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-center">
                <span className="text-xs text-blue-800 font-bold block">Currently Reading</span>
                <span className="text-xl font-black text-blue-950 block mt-0.5">
                  {data?.readingStats.reading ?? 0}
                </span>
              </div>
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-center">
                <span className="text-xs text-slate-700 font-bold block">To Read</span>
                <span className="text-xl font-black text-slate-900 block mt-0.5">
                  {data?.readingStats.unread ?? 0}
                </span>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-center">
                <span className="text-xs text-amber-800 font-bold block">Wishlist</span>
                <span className="text-xl font-black text-amber-950 block mt-0.5">
                  {data?.readingStats.wishlist ?? 0}
                </span>
              </div>
            </div>
          </SurfaceCard>

          {/* Active Loans & Circulation Alert */}
          <SurfaceCard className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">👥</span>
                <h2 className="text-sm font-bold text-slate-900">
                  Active Loans ({data?.loanedCount ?? 0})
                </h2>
              </div>
              <Link to="/library/lending" className="text-xs text-indigo-700 hover:text-indigo-800 font-bold">
                Manage &rarr;
              </Link>
            </div>

            {!data || data.activeLoans.length === 0 ? (
              <div className="p-4 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <span>✨ All library books are currently in their shelves.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {data.activeLoans.map((loan) => (
                  <div
                    key={loan.id}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{loan.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Borrowed by: <span className="font-semibold text-slate-800">{loan.borrowerName}</span>
                      </p>
                    </div>
                    {loan.isOverdue ? (
                      <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px] shrink-0">
                        Overdue!
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[10px] shrink-0">
                        Due {loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : "Soon"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>

          {/* Quick Hub Navigation Cards */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/library/shelves"
              className="p-4 bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 shadow-2xs transition space-y-1 block cursor-pointer"
            >
              <span className="text-2xl block">🗄️</span>
              <h3 className="text-xs font-bold text-slate-900">Shelves & Rooms</h3>
              <p className="text-[11px] text-slate-500">Organize by physical bookcase location</p>
            </Link>

            <Link
              to="/library/valuation"
              className="p-4 bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 shadow-2xs transition space-y-1 block cursor-pointer"
            >
              <span className="text-2xl block">📑</span>
              <h3 className="text-xs font-bold text-slate-900">Insurance Appraisal</h3>
              <p className="text-[11px] text-slate-500">Export replacement valuation reports</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}


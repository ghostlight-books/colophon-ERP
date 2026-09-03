import { useEffect, useState } from "react";
import { fetchLibraryAchievementStats, type LibraryAchievementStats } from "../../services/library.service";
import { computeBadges, computeCollectorLevel, computeCollectorPoints, type Badge } from "../../utils/libraryAchievements";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function BadgeCard({ badge }: { badge: Badge }): JSX.Element {
  return (
    <div
      className={`p-4 rounded-2xl border flex flex-col items-center text-center gap-1.5 transition ${
        badge.earned
          ? "bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/40 dark:to-slate-800 border-amber-300 dark:border-amber-700 shadow-sm"
          : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 opacity-60"
      }`}
    >
      <span className={`text-3xl ${badge.earned ? "" : "grayscale"}`}>{badge.icon}</span>
      <h4 className="text-xs font-black text-slate-900 dark:text-white">{badge.name}</h4>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">{badge.description}</p>
      <span
        className={`mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
          badge.earned
            ? "bg-amber-400 text-slate-950"
            : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
        }`}
      >
        {badge.earned ? "Earned" : badge.progressLabel}
      </span>
    </div>
  );
}

export default function LibraryAchievementsPage(): JSX.Element {
  const [stats, setStats] = useState<LibraryAchievementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLibraryAchievementStats();
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setErrorMessage(err instanceof Error ? err.message : "Failed to load achievements.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-slate-500 text-xs">Tallying your collection...</div>;
  }

  if (errorMessage || !stats) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs">
        {errorMessage ?? "Could not load achievement stats."}
      </div>
    );
  }

  const points = computeCollectorPoints(stats);
  const levelResult = computeCollectorLevel(points);
  const badges = computeBadges(stats);
  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="space-y-6 pb-24 font-sans max-w-4xl mx-auto">
      {/* Collector Level Card */}
      <div className="p-5 sm:p-6 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 rounded-3xl border border-indigo-800/60 shadow-lg text-white space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Collector Level {levelResult.level.index + 1}</p>
            <h1 className="text-2xl font-black">{levelResult.level.name}</h1>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Total Points</p>
            <p className="text-xl font-black">{points.toLocaleString()}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all duration-500"
              style={{ width: `${levelResult.progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-indigo-200">
            {levelResult.pointsToNext !== null
              ? `${levelResult.pointsToNext.toLocaleString()} points to reach the next level`
              : "You've reached the highest collector level!"}
          </p>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Volumes</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">{stats.totalVolumes}</p>
        </div>
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rare Finds</p>
          <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{stats.rareFindsCount}</p>
        </div>
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Insured Value</p>
          <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(stats.totalInsuredValue)}</p>
        </div>
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Badges</p>
          <p className="text-2xl font-semibold text-indigo-700 dark:text-indigo-400">{earnedCount}/{badges.length}</p>
        </div>
      </div>

      {/* Badges Grid */}
      <div className="p-4 sm:p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-4">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider px-1">
          Achievements ({earnedCount}/{badges.length})
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {badges.map((badge) => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      </div>
    </div>
  );
}

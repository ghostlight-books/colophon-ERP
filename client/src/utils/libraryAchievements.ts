import type { LibraryAchievementStats } from "../services/library.service";

export interface CollectorLevel {
  index: number;
  name: string;
  threshold: number;
  nextThreshold: number | null;
}

export interface CollectorLevelResult {
  points: number;
  level: CollectorLevel;
  progressPercent: number; // 0-100 progress toward the next level, 100 if maxed
  pointsToNext: number | null;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  progressLabel: string;
}

const LEVELS: Array<{ name: string; threshold: number }> = [
  { name: "New Shelf", threshold: 0 },
  { name: "Casual Reader", threshold: 25 },
  { name: "Bookworm", threshold: 60 },
  { name: "Bibliophile", threshold: 120 },
  { name: "Archivist", threshold: 220 },
  { name: "Curator", threshold: 400 },
  { name: "Rare Book Scout", threshold: 700 },
  { name: "Master Collector", threshold: 1200 },
  { name: "Legendary Librarian", threshold: 2000 },
];

const DEWEY_DIVISION_COUNT = 10;

/** Point weights, tuned to reward breadth and effort (classifying, finding
 *  rare items, completing trades) over raw dollar value -- collecting skill,
 *  not just spending power. */
export function computeCollectorPoints(stats: LibraryAchievementStats): number {
  return (
    stats.totalVolumes * 2 +
    stats.classifiedDeweyCount * 1 +
    stats.rareFindsCount * 15 +
    stats.deweyDivisionsOwned.length * 20 +
    stats.librarySpacesUsedCount * 10 +
    stats.completedTradesCount * 25 +
    stats.fulfilledWantlistCount * 20
  );
}

export function computeCollectorLevel(points: number): CollectorLevelResult {
  let levelIndex = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (points >= LEVELS[i].threshold) {
      levelIndex = i;
    }
  }

  const current = LEVELS[levelIndex];
  const next = LEVELS[levelIndex + 1] ?? null;

  const level: CollectorLevel = {
    index: levelIndex,
    name: current.name,
    threshold: current.threshold,
    nextThreshold: next?.threshold ?? null,
  };

  if (!next) {
    return { points, level, progressPercent: 100, pointsToNext: null };
  }

  const span = next.threshold - current.threshold;
  const progressPercent = span > 0 ? Math.min(100, Math.max(0, ((points - current.threshold) / span) * 100)) : 100;

  return { points, level, progressPercent, pointsToNext: Math.max(0, next.threshold - points) };
}

export function computeBadges(stats: LibraryAchievementStats): Badge[] {
  return [
    {
      id: "full-dewey",
      name: "Full Dewey",
      description: "Own at least one book across all 10 Dewey divisions (000-900).",
      icon: "📚",
      earned: stats.deweyDivisionsOwned.length >= DEWEY_DIVISION_COUNT,
      progressLabel: `${stats.deweyDivisionsOwned.length}/${DEWEY_DIVISION_COUNT} divisions`,
    },
    {
      id: "century-club",
      name: "Century Club",
      description: "Catalog 100 or more volumes.",
      icon: "💯",
      earned: stats.totalVolumes >= 100,
      progressLabel: `${Math.min(stats.totalVolumes, 100)}/100 volumes`,
    },
    {
      id: "first-find",
      name: "First Find",
      description: "Own a signed copy, first edition, or first printing.",
      icon: "✨",
      earned: stats.rareFindsCount >= 1,
      progressLabel: stats.rareFindsCount >= 1 ? "Found!" : "0/1 rare items",
    },
    {
      id: "rare-collector",
      name: "Rare Collector",
      description: "Own 5 or more signed/first-edition/first-printing volumes.",
      icon: "🏆",
      earned: stats.rareFindsCount >= 5,
      progressLabel: `${Math.min(stats.rareFindsCount, 5)}/5 rare items`,
    },
    {
      id: "fully-classified",
      name: "Fully Classified",
      description: "Classify 100% of your collection with Dewey Decimal numbers.",
      icon: "🗂️",
      earned: stats.classificationPercent >= 100,
      progressLabel: `${stats.classificationPercent}% classified`,
    },
    {
      id: "appraiser",
      name: "Appraiser",
      description: "Reach $500 in total insured collection value.",
      icon: "💎",
      earned: stats.totalInsuredValue >= 500,
      progressLabel: `$${Math.min(stats.totalInsuredValue, 500).toFixed(0)}/$500`,
    },
    {
      id: "well-traveled-shelf",
      name: "Well-Traveled Shelf",
      description: "Organize your collection across 3 or more library spaces.",
      icon: "🏛️",
      earned: stats.librarySpacesUsedCount >= 3,
      progressLabel: `${Math.min(stats.librarySpacesUsedCount, 3)}/3 spaces`,
    },
    {
      id: "networker",
      name: "Networker",
      description: "Complete a trade or sale through the Exchange marketplace.",
      icon: "🤝",
      earned: stats.completedTradesCount >= 1,
      progressLabel: `${stats.completedTradesCount} completed`,
    },
    {
      id: "wantlist-wizard",
      name: "Wantlist Wizard",
      description: "Fulfill 3 or more items from your personal wantlist.",
      icon: "🎯",
      earned: stats.fulfilledWantlistCount >= 3,
      progressLabel: `${Math.min(stats.fulfilledWantlistCount, 3)}/3 fulfilled`,
    },
  ];
}

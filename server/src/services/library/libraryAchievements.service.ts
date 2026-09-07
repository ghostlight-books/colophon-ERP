import { prisma } from "../../config/database.js";
import { ensureLibraryTablesExist } from "./libraryVolume.service.js";

export interface LibraryAchievementStats {
  totalVolumes: number;
  classifiedDeweyCount: number;
  classificationPercent: number;
  totalInsuredValue: number;
  rareFindsCount: number;
  deweyDivisionsOwned: string[]; // e.g. ["000", "300", "800"]
  librarySpacesUsedCount: number;
  completedTradesCount: number;
  fulfilledWantlistCount: number;
}

// Raw stats behind the Collector Level / Achievements UI. Deliberately kept
// separate from getLibraryCollectionHealth (a different, already-consumed
// widget) rather than overloading it -- these are two different concerns
// that happen to read from the same tables.
export async function getLibraryAchievementStats(storeId: string): Promise<LibraryAchievementStats> {
  await ensureLibraryTablesExist();

  const [totalVolumes, classifiedDeweyCount, allVolumes, completedTradesCount, fulfilledWantlistCount] =
    await Promise.all([
      prisma.libraryVolume.count({ where: { storeId } }),
      prisma.libraryVolume.count({ where: { storeId, deweyDecimal: { not: null } } }),
      prisma.libraryVolume.findMany({
        where: { storeId },
        select: {
          replacementValue: true,
          rareMarketValue: true,
          deweyDecimal: true,
          isSigned: true,
          isFirstEdition: true,
          isFirstPrinting: true,
          librarySpaceId: true,
        },
      }),
      prisma.libraryOffer.count({ where: { status: { in: ["ACCEPTED", "COMPLETED"] }, volume: { storeId } } }),
      prisma.libraryWantlistItem.count({ where: { storeId, status: "FULFILLED" } }),
    ]);

  const totalInsuredValue = allVolumes.reduce((sum, v) => sum + (v.rareMarketValue || v.replacementValue || 0), 0);
  const classificationPercent = totalVolumes > 0 ? Math.round((classifiedDeweyCount / totalVolumes) * 100) : 100;
  const rareFindsCount = allVolumes.filter((v) => v.isSigned || v.isFirstEdition || v.isFirstPrinting).length;

  const deweyDivisions = new Set<string>();
  for (const volume of allVolumes) {
    const leadingDigit = volume.deweyDecimal?.trim().charAt(0);
    if (leadingDigit && /[0-9]/.test(leadingDigit)) {
      deweyDivisions.add(`${leadingDigit}00`);
    }
  }

  const librarySpacesUsed = new Set(allVolumes.map((v) => v.librarySpaceId).filter((id): id is string => Boolean(id)));

  return {
    totalVolumes,
    classifiedDeweyCount,
    classificationPercent,
    totalInsuredValue,
    rareFindsCount,
    deweyDivisionsOwned: Array.from(deweyDivisions).sort(),
    librarySpacesUsedCount: librarySpacesUsed.size,
    completedTradesCount,
    fulfilledWantlistCount,
  };
}

// Mirrors the badge thresholds in client/src/utils/libraryAchievements.ts --
// kept here too (not shared via packages/) since this is the one server-side
// consumer and the two lists are small and stable. If they ever drift, the
// client copy (with icons/progress labels) is the source of truth for
// user-facing badge text.
const BADGE_DEFINITIONS: Array<{ id: string; name: string; isEarned: (stats: LibraryAchievementStats) => boolean }> = [
  { id: "full-dewey", name: "Full Dewey", isEarned: (s) => s.deweyDivisionsOwned.length >= 10 },
  { id: "century-club", name: "Century Club", isEarned: (s) => s.totalVolumes >= 100 },
  { id: "first-find", name: "First Find", isEarned: (s) => s.rareFindsCount >= 1 },
  { id: "rare-collector", name: "Rare Collector", isEarned: (s) => s.rareFindsCount >= 5 },
  { id: "fully-classified", name: "Fully Classified", isEarned: (s) => s.classificationPercent >= 100 },
  { id: "appraiser", name: "Appraiser", isEarned: (s) => s.totalInsuredValue >= 500 },
  { id: "well-traveled-shelf", name: "Well-Traveled Shelf", isEarned: (s) => s.librarySpacesUsedCount >= 3 },
  { id: "networker", name: "Networker", isEarned: (s) => s.completedTradesCount >= 1 },
  { id: "wantlist-wizard", name: "Wantlist Wizard", isEarned: (s) => s.fulfilledWantlistCount >= 3 },
];

/**
 * Recomputes badge-earned status and notifies + records an award for any
 * badge crossed for the first time. Called after catalog changes (the main
 * driver of badge progress) -- see createLibraryVolume/updateLibraryVolume
 * in libraryVolume.service.ts. Safe to call repeatedly: awards are recorded
 * so a badge only ever notifies once.
 */
export async function checkAndNotifyNewBadges(storeId: string): Promise<void> {
  const stats = await getLibraryAchievementStats(storeId);
  const alreadyAwarded = new Set(
    (await prisma.libraryBadgeAward.findMany({ where: { storeId }, select: { badgeId: true } })).map((a) => a.badgeId)
  );

  for (const badge of BADGE_DEFINITIONS) {
    if (alreadyAwarded.has(badge.id) || !badge.isEarned(stats)) continue;

    await prisma.libraryBadgeAward.create({ data: { badgeId: badge.id, storeId } });
    await prisma.libraryNotification.create({
      data: {
        title: `Badge earned: ${badge.name}`,
        detail: `You've unlocked the "${badge.name}" badge on your Collector Level page.`,
        type: "BADGE",
        actionUrl: `/library/achievements`,
        storeId,
      },
    });
  }
}

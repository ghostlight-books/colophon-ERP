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
export async function getLibraryAchievementStats(): Promise<LibraryAchievementStats> {
  await ensureLibraryTablesExist();

  const [totalVolumes, classifiedDeweyCount, allVolumes, completedTradesCount, fulfilledWantlistCount] =
    await Promise.all([
      prisma.libraryVolume.count(),
      prisma.libraryVolume.count({ where: { deweyDecimal: { not: null } } }),
      prisma.libraryVolume.findMany({
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
      prisma.libraryOffer.count({ where: { status: { in: ["ACCEPTED", "COMPLETED"] } } }),
      prisma.libraryWantlistItem.count({ where: { status: "FULFILLED" } }),
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

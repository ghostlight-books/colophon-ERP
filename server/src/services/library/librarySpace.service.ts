import { prisma } from "../../config/database.js";

export interface CreateLibrarySpaceInput {
  name: string;
  description?: string | null;
  location?: string | null;
  icon?: string | null;
  color?: string | null;
  isDefault?: boolean;
  storeId: string;
}

export interface UpdateLibrarySpaceInput {
  name?: string;
  description?: string | null;
  location?: string | null;
  icon?: string | null;
  color?: string | null;
  isDefault?: boolean;
}

export interface LibrarySpaceSummary {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  location: string | null;
  icon: string;
  color: string;
  isDefault: boolean;
  storeId: string;
  createdAt: Date;
  updatedAt: Date;
  volumeCount: number;
  totalValue: number;
  shelvesCount: number;
}

export async function ensureLibrarySpacesExist(storeId: string): Promise<void> {
  try {
    // 1. Create table if not exists in SQLite
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LibrarySpace" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "slug" TEXT,
        "description" TEXT,
        "location" TEXT,
        "icon" TEXT NOT NULL DEFAULT '🏛️',
        "color" TEXT NOT NULL DEFAULT '#6366f1',
        "isDefault" BOOLEAN NOT NULL DEFAULT 0,
        "storeId" TEXT DEFAULT 'ghostlight-demo',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Ensure columns exist on LibraryVolume & LibraryShelfLocation
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "LibraryVolume" ADD COLUMN "librarySpaceId" TEXT;
    `).catch(() => null);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "LibraryShelfLocation" ADD COLUMN "librarySpaceId" TEXT;
    `).catch(() => null);

    // 3. Ensure this store has at least one default library space
    const count = await prisma.librarySpace.count({ where: { storeId } });
    if (count === 0) {
      const defaultSpace = await prisma.librarySpace.create({
        data: {
          name: "Main Library",
          slug: "main-library",
          description: "Primary library collection & catalog",
          location: "Main Residence / Central Room",
          icon: "🏛️",
          color: "#6366f1",
          isDefault: true,
          storeId,
        },
      });

      // Link any of this store's orphaned volumes/shelves to the new default library
      await prisma.libraryVolume.updateMany({
        where: { librarySpaceId: null, storeId },
        data: { librarySpaceId: defaultSpace.id },
      });

      await prisma.libraryShelfLocation.updateMany({
        where: { librarySpaceId: null, storeId },
        data: { librarySpaceId: defaultSpace.id },
      });
    }
  } catch (err) {
    console.warn("ensureLibrarySpacesExist warning:", err);
  }
}

export async function listLibrarySpaces(storeId: string): Promise<LibrarySpaceSummary[]> {
  await ensureLibrarySpacesExist(storeId);

  const spaces = await prisma.librarySpace.findMany({
    where: { storeId },
    orderBy: [
      { isDefault: "desc" },
      { createdAt: "asc" },
    ],
    include: {
      volumes: {
        select: {
          id: true,
          replacementValue: true,
          rareMarketValue: true,
        },
      },
      shelves: {
        select: {
          id: true,
        },
      },
    },
  });

  return spaces.map((space) => {
    const volumeCount = space.volumes.length;
    const totalValue = space.volumes.reduce(
      (sum, v) => sum + (v.rareMarketValue || v.replacementValue || 0),
      0
    );
    const shelvesCount = space.shelves.length;

    return {
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description,
      location: space.location,
      icon: space.icon || "🏛️",
      color: space.color || "#6366f1",
      isDefault: space.isDefault,
      storeId: space.storeId || storeId,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
      volumeCount,
      totalValue: Number(totalValue.toFixed(2)),
      shelvesCount,
    };
  });
}

export async function getLibrarySpace(id: string, storeId: string): Promise<LibrarySpaceSummary | null> {
  await ensureLibrarySpacesExist(storeId);

  const space = await prisma.librarySpace.findFirst({
    where: { id, storeId },
    include: {
      volumes: {
        select: {
          id: true,
          replacementValue: true,
          rareMarketValue: true,
        },
      },
      shelves: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!space) return null;

  const volumeCount = space.volumes.length;
  const totalValue = space.volumes.reduce(
    (sum, v) => sum + (v.rareMarketValue || v.replacementValue || 0),
    0
  );

  return {
    id: space.id,
    name: space.name,
    slug: space.slug,
    description: space.description,
    location: space.location,
    icon: space.icon || "🏛️",
    color: space.color || "#6366f1",
    isDefault: space.isDefault,
    storeId: space.storeId || storeId,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
    volumeCount,
    totalValue: Number(totalValue.toFixed(2)),
    shelvesCount: space.shelves.length,
  };
}

export async function createLibrarySpace(input: CreateLibrarySpaceInput): Promise<LibrarySpaceSummary> {
  await ensureLibrarySpacesExist(input.storeId);

  if (input.isDefault) {
    await prisma.librarySpace.updateMany({
      where: { storeId: input.storeId },
      data: { isDefault: false },
    });
  }

  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const space = await prisma.librarySpace.create({
    data: {
      name: input.name.trim(),
      slug: slug || "library",
      description: input.description || null,
      location: input.location || null,
      icon: input.icon || "🏛️",
      color: input.color || "#6366f1",
      isDefault: Boolean(input.isDefault),
      storeId: input.storeId,
    },
  });

  return {
    id: space.id,
    name: space.name,
    slug: space.slug,
    description: space.description,
    location: space.location,
    icon: space.icon || "🏛️",
    color: space.color || "#6366f1",
    isDefault: space.isDefault,
    storeId: space.storeId || input.storeId,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
    volumeCount: 0,
    totalValue: 0,
    shelvesCount: 0,
  };
}

export async function updateLibrarySpace(id: string, storeId: string, input: UpdateLibrarySpaceInput): Promise<LibrarySpaceSummary | null> {
  await ensureLibrarySpacesExist(storeId);

  const existing = await prisma.librarySpace.findFirst({ where: { id, storeId } });
  if (!existing) return null;

  if (input.isDefault) {
    await prisma.librarySpace.updateMany({
      where: { id: { not: id }, storeId },
      data: { isDefault: false },
    });
  }

  const updateData: Record<string, any> = {};
  if (input.name !== undefined) {
    updateData.name = input.name.trim();
    updateData.slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }
  if (input.description !== undefined) updateData.description = input.description;
  if (input.location !== undefined) updateData.location = input.location;
  if (input.icon !== undefined) updateData.icon = input.icon;
  if (input.color !== undefined) updateData.color = input.color;
  if (input.isDefault !== undefined) updateData.isDefault = Boolean(input.isDefault);

  await prisma.librarySpace.update({
    where: { id },
    data: updateData,
  });

  const updated = await getLibrarySpace(id, storeId);
  if (!updated) throw new Error("Library space not found after update.");
  return updated;
}

export async function deleteLibrarySpace(id: string, storeId: string): Promise<{ success: boolean; movedToDefaultId?: string } | null> {
  await ensureLibrarySpacesExist(storeId);

  const existing = await prisma.librarySpace.findFirst({ where: { id, storeId } });
  if (!existing) return null;

  const count = await prisma.librarySpace.count({ where: { storeId } });
  if (count <= 1) {
    throw new Error("Cannot delete the only remaining library space. Create another library first.");
  }

  // Find another default space (within this store) to move volumes and shelves to
  let defaultSpace = await prisma.librarySpace.findFirst({
    where: { id: { not: id }, storeId, isDefault: true },
  });
  if (!defaultSpace) {
    defaultSpace = await prisma.librarySpace.findFirst({
      where: { id: { not: id }, storeId },
    });
  }

  if (defaultSpace) {
    await prisma.libraryVolume.updateMany({
      where: { librarySpaceId: id },
      data: { librarySpaceId: defaultSpace.id },
    });

    await prisma.libraryShelfLocation.updateMany({
      where: { librarySpaceId: id },
      data: { librarySpaceId: defaultSpace.id },
    });
  }

  await prisma.librarySpace.delete({
    where: { id },
  });

  return { success: true, movedToDefaultId: defaultSpace?.id };
}

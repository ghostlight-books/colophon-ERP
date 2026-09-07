import { prisma } from "../../config/database.js";
import { ensureLibraryTablesExist } from "./libraryVolume.service.js";

export interface CreateNoteInput {
  volumeId: string;
  quoteText?: string | null;
  personalNote?: string | null;
  pageNumber?: string | null;
}

export interface UpdateNoteInput {
  quoteText?: string | null;
  personalNote?: string | null;
  pageNumber?: string | null;
}

/**
 * Builds a plain-text citation from the volume's existing catalog metadata.
 * This is a generic, readable citation -- not a strict MLA/APA/Chicago
 * implementation, since correctly inverting author names ("Last, First"),
 * handling multiple authors, and italicizing titles all need information or
 * formatting this app doesn't reliably have. Good enough for a research
 * note; not a substitute for a citation manager.
 */
function buildCitation(
  volume: { title: string; author: string | null; publisher: string | null; publishYear: string | null },
  pageNumber?: string | null,
): string {
  const parts: string[] = [];
  if (volume.author) parts.push(volume.author);
  parts.push(volume.title);
  const publisherYear = [volume.publisher, volume.publishYear].filter(Boolean).join(", ");
  if (publisherYear) parts.push(publisherYear);

  let citation = parts.join(". ");
  if (pageNumber && pageNumber.trim()) {
    citation += `, p. ${pageNumber.trim()}`;
  }
  return `${citation}.`;
}

export async function listNotesForVolume(volumeId: string, storeId: string) {
  await ensureLibraryTablesExist();
  return prisma.libraryNote.findMany({
    where: { volumeId, volume: { storeId } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listAllNotes(storeId: string, query?: string) {
  await ensureLibraryTablesExist();

  const where: any = { volume: { storeId } };
  if (query && query.trim()) {
    const q = query.trim();
    where.OR = [
      { quoteText: { contains: q } },
      { personalNote: { contains: q } },
      { volume: { title: { contains: q } } },
      { volume: { author: { contains: q } } },
    ];
  }

  return prisma.libraryNote.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      volume: {
        select: { id: true, title: true, author: true, coverUrl: true, publisher: true, publishYear: true },
      },
    },
  });
}

export async function createNote(input: CreateNoteInput, storeId: string) {
  await ensureLibraryTablesExist();

  if (!input.quoteText?.trim() && !input.personalNote?.trim()) {
    throw new Error("Add a quote or a note before saving.");
  }

  const volume = await prisma.libraryVolume.findFirst({
    where: { id: input.volumeId, storeId },
    select: { title: true, author: true, publisher: true, publishYear: true },
  });
  if (!volume) {
    throw new Error(`Volume ${input.volumeId} not found.`);
  }

  return prisma.libraryNote.create({
    data: {
      volumeId: input.volumeId,
      quoteText: input.quoteText?.trim() || null,
      personalNote: input.personalNote?.trim() || null,
      pageNumber: input.pageNumber?.trim() || null,
      citationText: buildCitation(volume, input.pageNumber),
    },
  });
}

export async function updateNote(id: string, storeId: string, input: UpdateNoteInput) {
  await ensureLibraryTablesExist();

  const existing = await prisma.libraryNote.findFirst({
    where: { id, volume: { storeId } },
    include: { volume: { select: { title: true, author: true, publisher: true, publishYear: true } } },
  });
  if (!existing) {
    return null;
  }

  const nextPageNumber = input.pageNumber !== undefined ? input.pageNumber : existing.pageNumber;

  return prisma.libraryNote.update({
    where: { id },
    data: {
      ...(input.quoteText !== undefined ? { quoteText: input.quoteText?.trim() || null } : {}),
      ...(input.personalNote !== undefined ? { personalNote: input.personalNote?.trim() || null } : {}),
      ...(input.pageNumber !== undefined ? { pageNumber: input.pageNumber?.trim() || null } : {}),
      citationText: buildCitation(existing.volume, nextPageNumber),
    },
  });
}

export async function deleteNote(id: string, storeId: string) {
  await ensureLibraryTablesExist();
  const { count } = await prisma.libraryNote.deleteMany({ where: { id, volume: { storeId } } });
  return { success: count > 0 };
}

import { prisma } from "../../config/database.js";
import { ensureLibraryTablesExist } from "./libraryVolume.service.js";

/**
 * Collapses spacing/punctuation variants of already-period-separated
 * initials into one canonical form: "N. T. Wright", "N.T.Wright", and
 * "N.T. Wright" all become "N.T. Wright". Deliberately does NOT try to
 * guess that "Nt Wright" or "Tom Wright" mean the same person -- that's a
 * genuine name-authority problem (the same one real libraries solve with
 * curated authority files, not string heuristics), handled instead by
 * LibraryAuthorAlias below.
 */
export function normalizeAuthorName(raw: string): string {
  let name = raw.trim().replace(/\s+/g, " ");
  name = name.replace(/\b([A-Z])\.\s*(?=[A-Z]\.)/g, "$1.");
  name = name.replace(/((?:[A-Z]\.){2,})\s*/g, "$1 ");
  return name.trim();
}

/**
 * Splits a raw author field into individual contributors on comma,
 * semicolon, " and ", " & ", and " with " -- e.g. "Frank Herbert, Brian
 * Herbert" or "Chip Heath and Dan Heath". Deliberately does not split on
 * periods, so multi-part single names ("Ursula K. Le Guin") are left
 * intact. This assumes a "First Last[, First Last...]" convention, which
 * matches how this app's ingestion (OpenLibrary/Google/ISBNdb) actually
 * formats author names; a rare "Last, First" source string would mis-split.
 */
export function splitAuthorNames(raw: string | null): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/\s*(?:,|;|\band\b|&|\bwith\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function getAliasMap(): Promise<Map<string, string>> {
  const aliases = await prisma.libraryAuthorAlias.findMany();
  const map = new Map<string, string>();
  for (const row of aliases) {
    map.set(normalizeAuthorName(row.alias).toLowerCase(), row.canonicalName);
  }
  return map;
}

/** Resolves one author name to its canonical form via the alias table, falling back to plain normalization. */
export function resolveCanonicalAuthor(rawName: string, aliasMap: Map<string, string>): string {
  const normalized = normalizeAuthorName(rawName);
  return aliasMap.get(normalized.toLowerCase()) ?? normalized;
}

export interface AuthorSummary {
  canonicalName: string;
  bookCount: number;
  sampleCoverUrl: string | null;
}

export async function listAuthors(): Promise<AuthorSummary[]> {
  await ensureLibraryTablesExist();

  const [volumes, aliasMap] = await Promise.all([
    prisma.libraryVolume.findMany({ select: { author: true, coverUrl: true } }),
    getAliasMap(),
  ]);

  const groups = new Map<string, { count: number; cover: string | null }>();
  for (const volume of volumes) {
    for (const rawName of splitAuthorNames(volume.author)) {
      const canonical = resolveCanonicalAuthor(rawName, aliasMap);
      const existing = groups.get(canonical);
      if (existing) {
        existing.count += 1;
        if (!existing.cover && volume.coverUrl) existing.cover = volume.coverUrl;
      } else {
        groups.set(canonical, { count: 1, cover: volume.coverUrl ?? null });
      }
    }
  }

  return Array.from(groups.entries())
    .map(([canonicalName, { count, cover }]) => ({ canonicalName, bookCount: count, sampleCoverUrl: cover }))
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}

export interface AuthorDetail {
  canonicalName: string;
  volumes: Array<{
    id: string;
    title: string;
    isbn: string | null;
    coverUrl: string | null;
    deweyDecimal: string | null;
    subjects: string | null;
    rating: number | null;
  }>;
  relatedAuthors: string[];
}

export async function getAuthorDetail(canonicalName: string): Promise<AuthorDetail> {
  await ensureLibraryTablesExist();

  const [volumes, aliasMap] = await Promise.all([
    prisma.libraryVolume.findMany({
      select: { id: true, title: true, author: true, isbn: true, coverUrl: true, deweyDecimal: true, subjects: true, rating: true },
    }),
    getAliasMap(),
  ]);

  const authorVolumes = volumes.filter((volume) =>
    splitAuthorNames(volume.author).some((name) => resolveCanonicalAuthor(name, aliasMap) === canonicalName),
  );

  // Related authors: others in the collection sharing a Dewey hundred-division
  // or an overlapping subject with this author's books -- a "more like this
  // in your own collection" signal, not a catalog-wide recommendation engine.
  const deweyDivisions = new Set(
    authorVolumes.map((v) => v.deweyDecimal?.trim().charAt(0)).filter((d): d is string => Boolean(d)),
  );
  const subjectWords = new Set(
    authorVolumes.flatMap((v) => (v.subjects ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)),
  );

  const relatedScores = new Map<string, number>();
  for (const volume of volumes) {
    for (const rawName of splitAuthorNames(volume.author)) {
      const otherCanonical = resolveCanonicalAuthor(rawName, aliasMap);
      if (otherCanonical === canonicalName) continue;

      let score = 0;
      if (volume.deweyDecimal && deweyDivisions.has(volume.deweyDecimal.trim().charAt(0))) score += 1;
      const otherSubjects = (volume.subjects ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (otherSubjects.some((s) => subjectWords.has(s))) score += 2;

      if (score > 0) {
        relatedScores.set(otherCanonical, (relatedScores.get(otherCanonical) ?? 0) + score);
      }
    }
  }

  const relatedAuthors = Array.from(relatedScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name);

  return {
    canonicalName,
    volumes: authorVolumes.map((v) => ({
      id: v.id,
      title: v.title,
      isbn: v.isbn,
      coverUrl: v.coverUrl,
      deweyDecimal: v.deweyDecimal,
      subjects: v.subjects,
      rating: v.rating,
    })),
    relatedAuthors,
  };
}

export async function listAuthorAliases() {
  await ensureLibraryTablesExist();
  return prisma.libraryAuthorAlias.findMany({ orderBy: { canonicalName: "asc" } });
}

export async function createAuthorAlias(alias: string, canonicalName: string) {
  await ensureLibraryTablesExist();
  const normalizedAlias = normalizeAuthorName(alias);
  if (!normalizedAlias || !canonicalName.trim()) {
    throw new Error("Both an alias name and a canonical name are required.");
  }
  if (normalizedAlias.toLowerCase() === canonicalName.trim().toLowerCase()) {
    throw new Error("Alias and canonical name can't be the same.");
  }
  return prisma.libraryAuthorAlias.upsert({
    where: { alias: normalizedAlias },
    update: { canonicalName: canonicalName.trim() },
    create: { alias: normalizedAlias, canonicalName: canonicalName.trim(), source: "MANUAL" },
  });
}

export async function deleteAuthorAlias(id: string) {
  await ensureLibraryTablesExist();
  await prisma.libraryAuthorAlias.delete({ where: { id } });
  return { success: true };
}

/**
 * Best-effort: searches OpenLibrary for this author name and, if found,
 * registers every listed alternate_name as an alias pointing to the
 * canonical name (e.g. OpenLibrary already knows "bell hooks" is also
 * "Gloria Jean Watkins"). Silently does nothing if OpenLibrary has no
 * matching author or no alternate names -- this is a bonus source, not a
 * replacement for manual merges.
 */
export async function seedAliasesFromOpenLibrary(canonicalName: string): Promise<{ added: number }> {
  await ensureLibraryTablesExist();

  try {
    const searchRes = await fetch(`https://openlibrary.org/search/authors.json?q=${encodeURIComponent(canonicalName)}`, {
      headers: { "User-Agent": "Colophon-Library/1.0 (personal collection app)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!searchRes.ok) return { added: 0 };
    const searchData = (await searchRes.json()) as {
      docs?: Array<{ key?: string; name?: string; alternate_names?: string[] }>;
    };
    const match = searchData.docs?.find((doc) => doc.name?.toLowerCase() === canonicalName.toLowerCase()) ?? searchData.docs?.[0];
    if (!match) return { added: 0 };

    const alternateNames = match.alternate_names ?? [];
    let added = 0;
    for (const altName of alternateNames) {
      const normalizedAlias = normalizeAuthorName(altName);
      if (!normalizedAlias || normalizedAlias.toLowerCase() === canonicalName.toLowerCase()) continue;
      try {
        await prisma.libraryAuthorAlias.upsert({
          where: { alias: normalizedAlias },
          update: {},
          create: { alias: normalizedAlias, canonicalName, source: "OPENLIBRARY" },
        });
        added += 1;
      } catch {
        // Alias already claimed by a different canonical name -- skip rather than overwrite a manual merge.
      }
    }
    return { added };
  } catch {
    return { added: 0 };
  }
}

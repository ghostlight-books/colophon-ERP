import type { LibraryVolume } from "../services/library.service";

export type SortField =
  | "title"
  | "author"
  | "deweyCategory"
  | "deweyDecimal"
  | "locClassification"
  | "subjects"
  | "readingStatus"
  | "condition"
  | "value"
  | "publishYear"
  | "acquisitionDate"
  | "createdAt"
  | "rating"
  | "roomName"
  | "shelfName";

export const SORT_FIELDS: Array<{ key: SortField; label: string }> = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "deweyCategory", label: "Category (Dewey)" },
  { key: "deweyDecimal", label: "Dewey Decimal #" },
  { key: "locClassification", label: "LOC Call Number" },
  { key: "subjects", label: "Tags / Subjects" },
  { key: "readingStatus", label: "Reading Status" },
  { key: "condition", label: "Condition" },
  { key: "value", label: "Value ($)" },
  { key: "publishYear", label: "Publish Year" },
  { key: "acquisitionDate", label: "Date Acquired" },
  { key: "createdAt", label: "Date Added to Catalog" },
  { key: "rating", label: "My Rating" },
  { key: "roomName", label: "Room" },
  { key: "shelfName", label: "Shelf" },
];

export const MAX_SORT_LEVELS = 4;

export interface SortLevel {
  field: SortField;
  direction: "asc" | "desc";
}

export interface SortPreset {
  id: string;
  name: string;
  levels: SortLevel[];
}

export const BUILTIN_SORTS: Record<string, { label: string; levels: SortLevel[] }> = {
  DATE_DESC: { label: "📅 Recently Added", levels: [{ field: "createdAt", direction: "desc" }] },
  TITLE_ASC: { label: "🔤 Title (A → Z)", levels: [{ field: "title", direction: "asc" }] },
  TITLE_DESC: { label: "🔤 Title (Z → A)", levels: [{ field: "title", direction: "desc" }] },
  AUTHOR_ASC: {
    label: "👤 Author (A → Z)",
    levels: [
      { field: "author", direction: "asc" },
      { field: "title", direction: "asc" },
    ],
  },
  DEWEY_ASC: { label: "🏷️ Dewey Call #", levels: [{ field: "deweyDecimal", direction: "asc" }] },
  LOC_ASC: { label: "🏛️ LOC Call #", levels: [{ field: "locClassification", direction: "asc" }] },
  VALUE_DESC: { label: "💰 Value (High → Low)", levels: [{ field: "value", direction: "desc" }] },
  VALUE_ASC: { label: "💰 Value (Low → High)", levels: [{ field: "value", direction: "asc" }] },
};

const READING_STATUS_RANK: Record<string, number> = { READING: 0, UNREAD: 1, WISHLIST: 2, COMPLETED: 3 };
const CONDITION_RANK: Record<string, number> = { FINE: 0, AS_NEW: 0, LIKE_NEW: 0, VERY_GOOD: 1, GOOD: 2, FAIR: 3, POOR: 4 };

function getSortValue(vol: LibraryVolume, field: SortField): string | number {
  switch (field) {
    case "title":
      return (vol.title || "").toLowerCase();
    case "author":
      return (vol.author || "").toLowerCase();
    case "deweyCategory":
      return (vol.deweyCategory || "").toLowerCase();
    case "deweyDecimal":
      return vol.deweyDecimal || "";
    case "locClassification":
      return vol.locClassification || "";
    case "subjects":
      return (vol.subjects || "").toLowerCase();
    case "readingStatus":
      return READING_STATUS_RANK[vol.readingStatus] ?? 99;
    case "condition":
      return CONDITION_RANK[(vol.condition || "VERY_GOOD").toUpperCase()] ?? 99;
    case "value":
      return vol.rareMarketValue || vol.replacementValue || 0;
    case "publishYear":
      return parseInt(vol.publishYear || "", 10) || 0;
    case "acquisitionDate":
      return vol.acquisitionDate ? new Date(vol.acquisitionDate).getTime() : 0;
    case "createdAt":
      return vol.createdAt ? new Date(vol.createdAt).getTime() : 0;
    case "rating":
      return vol.rating ?? -1;
    case "roomName":
      return (vol.roomName || vol.shelfLocation?.roomName || "").toLowerCase();
    case "shelfName":
      return (vol.shelfName || vol.shelfLocation?.shelfName || "").toLowerCase();
    default:
      return "";
  }
}

function compareOneLevel(a: LibraryVolume, b: LibraryVolume, level: SortLevel): number {
  const va = getSortValue(a, level.field);
  const vb = getSortValue(b, level.field);
  const cmp =
    typeof va === "string" && typeof vb === "string"
      ? va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" })
      : (va as number) - (vb as number);
  return level.direction === "desc" ? -cmp : cmp;
}

export function buildComparator(levels: SortLevel[]): (a: LibraryVolume, b: LibraryVolume) => number {
  const safeLevels = levels.length > 0 ? levels : BUILTIN_SORTS.DATE_DESC.levels;
  return (a, b) => {
    for (const level of safeLevels) {
      const cmp = compareOneLevel(a, b, level);
      if (cmp !== 0) return cmp;
    }
    return 0;
  };
}

export type SortSelection = { kind: "builtin"; key: string } | { kind: "preset"; id: string } | { kind: "custom"; levels: SortLevel[] };

const PRESETS_KEY = "colophon_library_custom_sort_presets";
const ACTIVE_KEY = "colophon_library_active_sort";

export function loadCustomSortPresets(): SortPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomSortPresets(presets: SortPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {}
}

export function loadActiveSortSelection(): SortSelection {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw) return JSON.parse(raw) as SortSelection;
  } catch {}
  return { kind: "builtin", key: "DATE_DESC" };
}

export function saveActiveSortSelection(selection: SortSelection): void {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(selection));
  } catch {}
}

export function resolveSortLevels(selection: SortSelection, presets: SortPreset[]): SortLevel[] {
  if (selection.kind === "builtin") {
    return BUILTIN_SORTS[selection.key]?.levels ?? BUILTIN_SORTS.DATE_DESC.levels;
  }
  if (selection.kind === "preset") {
    return presets.find((p) => p.id === selection.id)?.levels ?? BUILTIN_SORTS.DATE_DESC.levels;
  }
  return selection.levels.length > 0 ? selection.levels : BUILTIN_SORTS.DATE_DESC.levels;
}

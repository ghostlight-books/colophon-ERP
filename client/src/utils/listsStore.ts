export type BoardKey = "scott" | "sarah" | "eliza" | "sales-rep" | "operations" | "shopping" | "book-orders";

export type ListItem = {
  id: string;
  text: string;
  done: boolean;
  assignedAt?: string;
  assignedBy?: string;
};

export type BoardState = Record<BoardKey, ListItem[]>;

type ListsMeta = {
  lastCleanupDate?: string;
  seedVersion?: number;
};

export const LISTS_STORAGE_KEY = "colophon-shared-lists";
const LISTS_META_KEY = "colophon-shared-lists-meta";
const CURRENT_SEED_VERSION = 3;

export const boardOptions: Array<{ key: BoardKey; label: string; blurb: string }> = [
  { key: "scott", label: "Scott", blurb: "Personal board for Scott" },
  { key: "sarah", label: "Sarah", blurb: "Personal board for Sarah" },
  { key: "eliza", label: "Eliza", blurb: "Personal board for Eliza" },
  { key: "sales-rep", label: "Sales Rep", blurb: "Personal board for sales follow-up" },
  { key: "operations", label: "Operations", blurb: "General store needs done" },
  { key: "shopping", label: "Shopping List", blurb: "Store supplies to purchase" },
  { key: "book-orders", label: "Book Order List", blurb: "Books to order from suppliers" },
];

export function resolveBoardKey(name: string): BoardKey {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes("scott")) return "scott";
  if (normalized.includes("sarah")) return "sarah";
  if (normalized.includes("eliza")) return "eliza";
  if (normalized.includes("sales")) return "sales-rep";
  return "operations";
}

function nowIso(): string {
  return new Date().toISOString();
}

export function getCurrentAssignerName(): string {
  if (typeof window === "undefined") {
    return "System";
  }

  try {
    const raw = window.localStorage.getItem("colophon-current-user");
    if (!raw) {
      return "System";
    }

    const parsed = JSON.parse(raw) as { name?: unknown };
    if (typeof parsed.name === "string" && parsed.name.trim().length > 0) {
      return parsed.name.trim();
    }
    return "System";
  } catch {
    return "System";
  }
}

export function createListItem(text: string, boardKey: BoardKey, assignedBy: string): ListItem {
  return {
    id: `${boardKey}-${Date.now()}`,
    text,
    done: false,
    assignedAt: nowIso(),
    assignedBy,
  };
}

export function formatAssignmentMeta(item: ListItem): string {
  const by = item.assignedBy?.trim() || "Unknown";
  if (!item.assignedAt) {
    return `Assigned by ${by}`;
  }

  const date = new Date(item.assignedAt);
  if (Number.isNaN(date.getTime())) {
    return `Assigned by ${by}`;
  }

  const formatted = date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `Assigned by ${by} on ${formatted}`;
}

function emptyBoards(): BoardState {
  return {
    scott: [],
    sarah: [],
    eliza: [],
    "sales-rep": [],
    operations: [],
    shopping: [],
    "book-orders": [],
  };
}

function initialBoards(): BoardState {
  return {
    scott: [{ id: "scott-1", text: "Review launch checklist", done: false, assignedBy: "System", assignedAt: nowIso() }],
    sarah: [
      { id: "sarah-1", text: "Approve monthly vendor invoices", done: false, assignedBy: "System", assignedAt: nowIso() },
      { id: "sarah-2", text: "Finalize staff rota for Friday", done: false, assignedBy: "Scott", assignedAt: nowIso() },
      { id: "sarah-3", text: "Confirm Square onboarding checklist", done: true, assignedBy: "Scott", assignedAt: nowIso() },
      { id: "sarah-4", text: "Review Sunday promotion signage", done: true, assignedBy: "Eliza", assignedAt: nowIso() },
    ],
    eliza: [{ id: "eliza-1", text: "Confirm weekend staff schedule", done: false, assignedBy: "System", assignedAt: nowIso() }],
    "sales-rep": [{ id: "sales-rep-1", text: "Follow up on school bulk order", done: false, assignedBy: "System", assignedAt: nowIso() }],
    operations: [{ id: "operations-1", text: "Check front register receipt paper", done: false, assignedBy: "System", assignedAt: nowIso() }],
    shopping: [{ id: "shopping-1", text: "Printer paper (3 reams)", done: false, assignedBy: "System", assignedAt: nowIso() }],
    "book-orders": [{ id: "book-orders-1", text: "Order 10 copies: Fourth Wing", done: false, assignedBy: "System", assignedAt: nowIso() }],
  };
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function readMeta(): ListsMeta {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(LISTS_META_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ListsMeta;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeMeta(meta: ListsMeta): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LISTS_META_KEY, JSON.stringify(meta));
}

function sanitizeBoards(raw: Partial<BoardState> | undefined): BoardState {
  const next = emptyBoards();
  if (!raw) {
    return next;
  }

  for (const board of boardOptions) {
    const items = raw[board.key];
    if (!Array.isArray(items)) {
      continue;
    }

    next[board.key] = items
      .filter(
        (item): item is ListItem =>
          Boolean(item && typeof item.id === "string" && typeof item.text === "string" && typeof item.done === "boolean"),
      )
      .map((item) => ({
        id: item.id,
        text: item.text,
        done: item.done,
        assignedAt: typeof item.assignedAt === "string" ? item.assignedAt : undefined,
        assignedBy: typeof item.assignedBy === "string" ? item.assignedBy : undefined,
      }));
  }

  return next;
}

function applySeedMigration(boards: BoardState, meta: ListsMeta): BoardState {
  if ((meta.seedVersion ?? 0) >= CURRENT_SEED_VERSION) {
    return boards;
  }

  const next = { ...boards };
  const requiredSarahTasks: ListItem[] = [
    { id: `sarah-seed-${Date.now()}-1`, text: "Finalize staff rota for Friday", done: false, assignedBy: "Scott", assignedAt: nowIso() },
    { id: `sarah-seed-${Date.now()}-2`, text: "Confirm Square onboarding checklist", done: true, assignedBy: "Scott", assignedAt: nowIso() },
    { id: `sarah-seed-${Date.now()}-3`, text: "Review Sunday promotion signage", done: true, assignedBy: "Eliza", assignedAt: nowIso() },
  ];

  const existingTexts = new Set(next.sarah.map((item) => item.text.toLowerCase()));
  const toAdd = requiredSarahTasks.filter((item) => !existingTexts.has(item.text.toLowerCase()));
  if (toAdd.length > 0) {
    next.sarah = [...toAdd, ...next.sarah];
  }

  return next;
}

function applyMidnightCleanup(boards: BoardState, meta: ListsMeta): { boards: BoardState; meta: ListsMeta } {
  const today = todayStamp();

  if (!meta.lastCleanupDate) {
    return {
      boards,
      meta: {
        ...meta,
        lastCleanupDate: today,
      },
    };
  }

  if (meta.lastCleanupDate === today) {
    return { boards, meta };
  }

  const cleaned = emptyBoards();
  for (const board of boardOptions) {
    cleaned[board.key] = boards[board.key].filter((item) => !item.done);
  }

  return {
    boards: cleaned,
    meta: {
      ...meta,
      lastCleanupDate: today,
    },
  };
}

export function readBoards(): BoardState {
  if (typeof window === "undefined") {
    return initialBoards();
  }

  let boards = initialBoards();
  try {
    const raw = window.localStorage.getItem(LISTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BoardState>;
      boards = { ...initialBoards(), ...sanitizeBoards(parsed) };
    }
  } catch {
    boards = initialBoards();
  }

  const meta = readMeta();
  const seeded = applySeedMigration(boards, meta);
  const cleanupResult = applyMidnightCleanup(seeded, {
    ...meta,
    seedVersion: CURRENT_SEED_VERSION,
  });

  writeBoards(cleanupResult.boards);
  writeMeta({
    ...cleanupResult.meta,
    seedVersion: CURRENT_SEED_VERSION,
  });

  return cleanupResult.boards;
}

export function writeBoards(boards: BoardState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(boards));
}

export function getBoardItems(boardKey: BoardKey): ListItem[] {
  const boards = readBoards();
  return boards[boardKey];
}

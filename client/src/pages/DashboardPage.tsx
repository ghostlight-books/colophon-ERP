import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import type { LoggedInUser } from "../components/layout/Shell";
import MetricCard from "../components/ui/MetricCard";
import SurfaceCard from "../components/ui/SurfaceCard";
import {
  boardOptions,
  createListItem,
  formatAssignmentMeta,
  getBoardItems,
  readBoards,
  resolveBoardKey,
  writeBoards,
  type BoardKey,
  type BoardState,
  type ListItem,
} from "../utils/listsStore";

type DashboardOutletContext = {
  currentUser: LoggedInUser;
};

type DashboardTab = "overview" | "inventory" | "customers" | "reports";

type SalesNote = {
  id: string;
  title: string;
  body: string;
  priority: "high" | "normal";
};

type DashboardSummary = {
  activeTitles: number;
  unitsOnHand: number;
  pricedTitles: number;
  inventoryValue: number;
  lowStock: number;
  recentTitles: Array<{ title: string; sku: string }>;
};

const dashboardTabs: Array<{ key: DashboardTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "inventory", label: "Inventory" },
  { key: "customers", label: "Customers" },
  { key: "reports", label: "Reports" },
];

const SALES_NOTES_STORAGE_KEY = "colophon-sales-notes";

const defaultSalesNotes: SalesNote[] = [
  {
    id: "NOTE-100",
    title: "Promo Spotlight",
    body: "Mention Buy 2 Get 1 on used paperbacks at checkout this week.",
    priority: "high",
  },
  {
    id: "NOTE-101",
    title: "Upsell Reminder",
    body: "Bundle journals with planners when customers buy back-to-school titles.",
    priority: "normal",
  },
];

function readSalesNotes(): SalesNote[] {
  if (typeof window === "undefined") {
    return defaultSalesNotes;
  }

  try {
    const raw = window.localStorage.getItem(SALES_NOTES_STORAGE_KEY);
    if (!raw) {
      return defaultSalesNotes;
    }

    const parsed = JSON.parse(raw) as SalesNote[];
    if (!Array.isArray(parsed)) {
      return defaultSalesNotes;
    }

    return parsed.filter(
      (entry) => typeof entry.id === "string"
        && typeof entry.title === "string"
        && typeof entry.body === "string"
        && (entry.priority === "high" || entry.priority === "normal"),
    );
  } catch {
    return defaultSalesNotes;
  }
}

const tabMetrics: Record<
  DashboardTab,
  {
    cards: Array<{ label: string; value: string; delta: string; tone: "amber" | "violet" | "mint" | "rose" }>;
    salesNumbers: Array<[string, string]>;
    topProducts: Array<[string, string]>;
  }
> = {
  overview: {
    cards: [
      { label: "Total Revenue", value: "$85,500", delta: "+10.5%", tone: "amber" },
      { label: "Total Orders", value: "1,000", delta: "+8.2%", tone: "violet" },
      { label: "Total Customers", value: "300", delta: "+6.4%", tone: "mint" },
      { label: "Avg Ticket", value: "$42.8", delta: "+2.1%", tone: "rose" },
    ],
    salesNumbers: [
      ["Total Sales", "9,586"],
      ["This Month", "2,984"],
      ["Today", "182"],
    ],
    topProducts: [
      ["The Midnight Library", "BK-8812"],
      ["Piranesi", "BK-8832"],
      ["Dune", "BK-9871"],
      ["Educated", "BK-2211"],
    ],
  },
  inventory: {
    cards: [
      { label: "Books in Stock", value: "12,940", delta: "+4.2%", tone: "mint" },
      { label: "Low Stock Titles", value: "87", delta: "-11.0%", tone: "amber" },
      { label: "Restock Orders", value: "24", delta: "+2.3%", tone: "violet" },
      { label: "Sell-Through", value: "71.5%", delta: "+1.8%", tone: "rose" },
    ],
    salesNumbers: [
      ["Total SKUs", "14,120"],
      ["Added This Month", "612"],
      ["Out of Stock", "34"],
    ],
    topProducts: [
      ["Tomorrow, and Tomorrow", "BK-1201"],
      ["Yellowface", "BK-4301"],
      ["Fourth Wing", "BK-5268"],
      ["The Wager", "BK-9112"],
    ],
  },
  customers: {
    cards: [
      { label: "Active Members", value: "1,248", delta: "+12.1%", tone: "mint" },
      { label: "New Signups", value: "96", delta: "+9.7%", tone: "violet" },
      { label: "Repeat Rate", value: "63.8%", delta: "+3.2%", tone: "amber" },
      { label: "NPS", value: "72", delta: "+1.0%", tone: "rose" },
    ],
    salesNumbers: [
      ["Loyalty Redemptions", "418"],
      ["Avg. Order Value", "$42.18"],
      ["Top Segment", "Faculty"],
    ],
    topProducts: [
      ["Book Club Picks", "SEG-204"],
      ["Children's Titles", "SEG-144"],
      ["Mystery/Thriller", "SEG-097"],
      ["Sci-Fi/Fantasy", "SEG-083"],
    ],
  },
  reports: {
    cards: [
      { label: "Generated Reports", value: "38", delta: "+5.0%", tone: "violet" },
      { label: "Scheduled Jobs", value: "12", delta: "+1.2%", tone: "mint" },
      { label: "Failed Exports", value: "1", delta: "-66.0%", tone: "amber" },
      { label: "On-Time Delivery", value: "97.9%", delta: "+0.6%", tone: "rose" },
    ],
    salesNumbers: [
      ["Weekly Digest", "Sent"],
      ["Inventory Snapshot", "Ready"],
      ["P&L Export", "Queued"],
    ],
    topProducts: [
      ["Revenue by Genre", "RPT-01"],
      ["Aging Inventory", "RPT-07"],
      ["Top Buyers", "RPT-12"],
      ["POS Variance", "RPT-18"],
    ],
  },
};

function DashboardPage(): JSX.Element {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<DashboardOutletContext>();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [userListItems, setUserListItems] = useState<ListItem[]>([]);
  const [newListItemText, setNewListItemText] = useState("");
  const [targetBoard, setTargetBoard] = useState<BoardKey>("operations");
  const [reassignBoardByItem, setReassignBoardByItem] = useState<Record<string, BoardKey>>({});
  const [salesNotes, setSalesNotes] = useState<SalesNote[]>(() => readSalesNotes());
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newNotePriority, setNewNotePriority] = useState<"high" | "normal">("normal");
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const activeData = useMemo(() => tabMetrics[activeTab], [activeTab]);
  const liveData = useMemo(() => {
    if (!dashboardSummary) {
      return activeData;
    }
    if (activeTab === "inventory") {
      return {
        ...activeData,
        cards: [
          { label: "Books in Stock", value: String(dashboardSummary.unitsOnHand), delta: "Live", tone: "mint" as const },
          { label: "Low Stock Titles", value: String(dashboardSummary.lowStock), delta: "Live", tone: "amber" as const },
          { label: "Priced Titles", value: String(dashboardSummary.pricedTitles), delta: "Live", tone: "violet" as const },
          { label: "Inventory Value", value: `$${dashboardSummary.inventoryValue.toFixed(2)}`, delta: "Live", tone: "rose" as const },
        ],
        salesNumbers: [
          ["Active Titles", String(dashboardSummary.activeTitles)],
          ["Units On Hand", String(dashboardSummary.unitsOnHand)],
          ["Low Stock", String(dashboardSummary.lowStock)],
        ],
        topProducts: dashboardSummary.recentTitles.map((item) => [item.title, item.sku]),
      };
    }
    if (activeTab === "overview") {
      return {
        ...activeData,
        cards: [
          { label: "Inventory Value", value: `$${dashboardSummary.inventoryValue.toFixed(2)}`, delta: "Live", tone: "amber" as const },
          { label: "Active Titles", value: String(dashboardSummary.activeTitles), delta: "Live", tone: "violet" as const },
          { label: "Units On Hand", value: String(dashboardSummary.unitsOnHand), delta: "Live", tone: "mint" as const },
          { label: "Priced Titles", value: String(dashboardSummary.pricedTitles), delta: "Live", tone: "rose" as const },
        ],
      };
    }
    return activeData;
  }, [activeData, activeTab, dashboardSummary]);
  const userBoardKey = useMemo(() => resolveBoardKey(currentUser.name), [currentUser.name]);

  useEffect(() => {
    window.localStorage.setItem(SALES_NOTES_STORAGE_KEY, JSON.stringify(salesNotes));
  }, [salesNotes]);

  useEffect(() => {
    const refreshItems = (): void => {
      setUserListItems(getBoardItems(userBoardKey));
    };

    refreshItems();
    window.addEventListener("storage", refreshItems);
    window.addEventListener("focus", refreshItems);
    return () => {
      window.removeEventListener("storage", refreshItems);
      window.removeEventListener("focus", refreshItems);
    };
  }, [userBoardKey]);

  useEffect(() => {
    let cancelled = false;
    const loadSummary = async (): Promise<void> => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api"}/dashboard/summary?updatedAt=${Date.now()}`);
        if (!response.ok) {
          return;
        }
        const summary = (await response.json()) as DashboardSummary;
        if (!cancelled) {
          setDashboardSummary(summary);
        }
      } catch {
        // Keep the dashboard's local fallback metrics when the API is unavailable.
      }
    };
    void loadSummary();
    const timer = window.setInterval(() => void loadSummary(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setTargetBoard(userBoardKey);
  }, [userBoardKey]);

  const refreshItems = (): void => {
    setUserListItems(getBoardItems(userBoardKey));
  };

  const addItemToBoard = (): void => {
    const text = newListItemText.trim();
    if (!text) {
      return;
    }

    const boards = readBoards();
    const newItem = createListItem(text, targetBoard, currentUser.name);
    boards[targetBoard] = [newItem, ...boards[targetBoard]];
    writeBoards(boards);
    setNewListItemText("");
    refreshItems();
  };

  const toggleDone = (itemId: string): void => {
    const boards = readBoards();
    boards[userBoardKey] = boards[userBoardKey].map((item) => (item.id === itemId ? { ...item, done: !item.done } : item));
    writeBoards(boards);
    refreshItems();
  };

  const reassignItem = (itemId: string): void => {
    const target = reassignBoardByItem[itemId];
    if (!target || target === userBoardKey) {
      return;
    }

    const boards = readBoards();
    const item = boards[userBoardKey].find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }

    boards[userBoardKey] = boards[userBoardKey].filter((entry) => entry.id !== itemId);
    boards[target] = [{ ...item, done: false, assignedBy: currentUser.name, assignedAt: new Date().toISOString() }, ...boards[target]];
    writeBoards(boards);
    refreshItems();
  };

  const openItems = userListItems.filter((item) => !item.done);

  const addSalesNote = (): void => {
    const title = newNoteTitle.trim();
    const body = newNoteBody.trim();
    if (!title || !body) {
      return;
    }

    const note: SalesNote = {
      id: `NOTE-${Date.now()}`,
      title,
      body,
      priority: newNotePriority,
    };

    setSalesNotes((current) => [note, ...current].slice(0, 8));
    setNewNoteTitle("");
    setNewNoteBody("");
    setNewNotePriority("normal");
  };

  const removeSalesNote = (id: string): void => {
    setSalesNotes((current) => current.filter((note) => note.id !== id));
  };

  return (
    <section className="grid gap-4">
      <div className="rounded-full bg-white/55 p-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
          {dashboardTabs.map((tab) => (
            <button
              type="button"
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                "rounded-full px-4 py-2 transition",
                activeTab === tab.key ? "bg-white text-slate-700 shadow-[0_5px_14px_rgba(76,86,103,0.12)]" : "hover:bg-white/70",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <SurfaceCard>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[1.4rem] font-semibold text-slate-700">{currentUser.name} List</h3>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">{openItems.length} open</span>
          <button
            type="button"
            onClick={() => navigate("/lists")}
            className="ml-auto rounded-full bg-[#e9ff63] px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Open Lists
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {openItems.length === 0 ? (
            <p className="col-span-full rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-500">No open items yet on this board.</p>
          ) : (
            openItems.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-xl bg-white/75 p-2.5 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleDone(item.id)}
                    className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700"
                  >
                    Done
                  </button>
                  <p className="flex-1 text-sm leading-snug">
                    {item.text}
                    <span className="block pt-0.5 text-[11px] text-slate-400">{formatAssignmentMeta(item)}</span>
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
                  <select
                    value={reassignBoardByItem[item.id] ?? userBoardKey}
                    onChange={(event) =>
                      setReassignBoardByItem((current) => ({
                        ...current,
                        [item.id]: event.target.value as BoardKey,
                      }))
                    }
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none"
                  >
                    {boardOptions.map((board) => (
                      <option key={board.key} value={board.key}>{board.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => reassignItem(item.id)}
                    className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600"
                  >
                    Reassign
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 rounded-xl bg-white/70 p-3">
          <p className="text-xs font-semibold text-slate-500">Add Task To Any Board</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={targetBoard}
              onChange={(event) => setTargetBoard(event.target.value as BoardKey)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none"
            >
              {boardOptions.map((board) => (
                <option key={board.key} value={board.key}>{board.label}</option>
              ))}
            </select>
            <input
              value={newListItemText}
              onChange={(event) => setNewListItemText(event.target.value)}
              placeholder="Add a new task"
              className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
            />
            <button
              type="button"
              onClick={addItemToBoard}
              className="rounded-full bg-[#e9ff63] px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              Add
            </button>
          </div>
        </div>
      </SurfaceCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.55fr]">
        <SurfaceCard className="space-y-3">
          <div className="px-1">
            <h2 className="text-[1.95rem] font-semibold leading-none text-slate-700">Sales Overview</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {liveData.cards.map((metric) => (
              <MetricCard key={metric.label} label={metric.label} value={metric.value} delta={metric.delta} tone={metric.tone} />
            ))}
          </div>

          <SurfaceCard className="bg-white p-4">
            <h3 className="text-[1.9rem] font-semibold leading-none text-slate-700">Sales</h3>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {liveData.salesNumbers.map(([name, value]) => (
                <div key={name}>
                  <p className="text-xs text-slate-400">{name}</p>
                  <p className="mt-1 text-[2rem] font-semibold leading-none text-slate-700">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm font-medium text-emerald-500">↗ 20% increased</p>
          </SurfaceCard>
        </SurfaceCard>

        <div className="grid gap-4">
          <SurfaceCard className="min-h-[350px]">
            <div className="flex items-end justify-between">
              <h2 className="text-[1.9rem] font-semibold text-slate-700">Orders Overview</h2>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-sm text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
                  Orders
                </span>
                <span className="flex items-center gap-1 text-sm text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-500"></span>
                  Profit
                </span>
              </div>
            </div>

            <div className="relative mt-4 h-64 overflow-hidden rounded-[20px] border border-slate-100 bg-white">
              <div className="absolute inset-0 grid grid-cols-10">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div key={index} className="border-r border-slate-100"></div>
                ))}
              </div>

              <svg viewBox="0 0 700 220" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
                <path
                  d="M0,170 C70,150 90,130 140,120 C210,108 220,70 270,98 C320,126 340,80 390,82 C450,84 470,140 520,110 C580,70 610,138 700,95"
                  fill="none"
                  stroke="#f6b742"
                  strokeWidth="3"
                />
                <path
                  d="M0,120 C80,100 100,150 160,135 C230,120 250,62 300,72 C350,82 370,145 430,122 C510,90 550,125 610,96 C650,76 675,130 700,110"
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth="3"
                />
              </svg>

              <div className="absolute left-[58%] top-[35%] rounded-lg bg-[#e9ff63] px-3 py-1 text-sm font-semibold text-slate-700">21,345</div>
            </div>
          </SurfaceCard>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
            <SurfaceCard className="min-h-[215px]">
              <h3 className="text-[1.8rem] font-semibold text-slate-700">Sale Analytics</h3>
              <div className="mt-5 flex items-center justify-center">
                <div className="relative grid h-40 w-40 place-items-center rounded-full border-[14px] border-cyan-400">
                  <div className="absolute h-40 w-40 rotate-[35deg] rounded-full border-[14px] border-transparent border-r-violet-500"></div>
                  <div className="absolute h-40 w-40 -rotate-[30deg] rounded-full border-[14px] border-transparent border-l-amber-400"></div>
                  <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center">
                    <p className="text-3xl font-semibold leading-none text-slate-700">100%</p>
                    <p className="text-xs text-slate-400">Completed</p>
                  </div>
                </div>
              </div>
            </SurfaceCard>

            <SurfaceCard className="min-h-[215px]">
              <h3 className="text-[1.8rem] font-semibold text-slate-700">Top Products</h3>
              <div className="mt-3 space-y-3">
                {liveData.topProducts.map(([name, code]) => (
                  <div key={name + code} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-sm font-medium text-slate-600">{name}</span>
                    <span className="text-sm text-slate-500">{code}</span>
                  </div>
                ))}
              </div>
            </SurfaceCard>
          </div>
        </div>
      </div>

      <SurfaceCard>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[1.6rem] font-semibold text-slate-700">Important Promotions and Sales Notes</h3>
          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">Team Visible</span>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_1.5fr]">
          <div className="rounded-xl bg-white/70 p-3">
            <p className="text-xs font-semibold text-slate-500">Add New Note</p>
            <div className="mt-2 grid gap-2">
              <input
                value={newNoteTitle}
                onChange={(event) => setNewNoteTitle(event.target.value)}
                placeholder="Short title"
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
              />
              <textarea
                value={newNoteBody}
                onChange={(event) => setNewNoteBody(event.target.value)}
                placeholder="Promotion details or team instruction"
                className="min-h-24 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none"
              />
              <div className="flex items-center gap-2">
                <select
                  value={newNotePriority}
                  onChange={(event) => setNewNotePriority(event.target.value as "high" | "normal")}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none"
                >
                  <option value="normal">Normal priority</option>
                  <option value="high">High priority</option>
                </select>
                <button
                  type="button"
                  onClick={addSalesNote}
                  className="rounded-full bg-[#e9ff63] px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Add Note
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {salesNotes.length === 0 ? (
              <p className="col-span-full rounded-xl bg-white/75 px-3 py-2 text-sm text-slate-500">No notes added yet.</p>
            ) : (
              salesNotes.map((note) => (
                <article key={note.id} className="rounded-xl bg-white/80 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-700">{note.title}</h4>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        note.priority === "high" ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600",
                      ].join(" ")}
                    >
                      {note.priority === "high" ? "High" : "Normal"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{note.body}</p>
                  <button
                    type="button"
                    onClick={() => removeSalesNote(note.id)}
                    className="mt-2 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500"
                  >
                    Dismiss
                  </button>
                </article>
              ))
            )}
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="flex items-center justify-between">
          <h3 className="text-[1.8rem] font-semibold text-slate-700">Purchase Analytics</h3>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>Sold
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400"></span>Purchased
            </span>
          </div>
        </div>

        <div className="mt-4 h-32 rounded-[20px] border border-slate-100 bg-white/80"></div>
      </SurfaceCard>
    </section>
  );
}

export default DashboardPage;

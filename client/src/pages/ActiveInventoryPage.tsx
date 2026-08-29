import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import SurfaceCard from "../components/ui/SurfaceCard";
import StatusPill from "../components/ui/StatusPill";

type InventoryRecord = {
  id: string;
  isbn: string;
  title: string | null;
  author: string | null;
  coverUrl: string | null;
  thriftbooksPrice: number | null;
  listPrice: number | null;
  condition: string | null;
  container: string | null;
  category: string | null;
  subcategory: string | null;
  mediaType: string;
  sku: string;
  quantityOnHand: number;
  shopifyStatus: "Not connected" | "Published" | "Draft";
  networkStatus: "Available to share" | "Shared" | "Private";
};

function resolveApiUrl(endpointPath: string): string {
  const envBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  const path = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;

  if (envBase) {
    const cleanBase = envBase.replace(/\/+$/, "");
    if (cleanBase.endsWith("/api")) {
      return `${cleanBase}${path.startsWith("/api") ? path.slice(4) : path}`;
    }
    return `${cleanBase}${path.startsWith("/api") ? path : `/api${path}`}`;
  }

  // Fallback for local dev
  return `http://localhost:4000${path.startsWith("/api") ? path : `/api${path}`}`;
}

const PARTNER_AVAILABILITY_CACHE_MS = 30 * 60 * 1000;

const GENRE_OPTIONS = [
  "Fantasy",
  "Science Fiction",
  "Mystery & Thriller",
  "Romance",
  "Horror",
  "Historical Fiction",
  "Literary Fiction",
  "Biography & Memoir",
  "History",
  "True Crime",
  "Children's Books",
  "Young Adult",
  "Graphic Novels & Comics",
  "Science & Nature",
  "Philosophy & Religion",
  "Self-Help & Psychology",
  "Business & Economics",
  "Cooking & Food",
  "Art & Photography",
  "Travel & Adventure",
  "Poetry & Drama",
  "Crafts & Hobbies",
];

const fallbackInventory: InventoryRecord[] = [
  {
    id: "demo-1",
    isbn: "9780989909624",
    title: "Questioning God",
    author: "John Hopper",
    coverUrl: null,
    thriftbooksPrice: 13.19,
    listPrice: 13.19,
    condition: "Good",
    container: "Blue Bin",
    category: "Print Books",
    subcategory: "Philosophy & Religion",
    mediaType: "Book",
    sku: "PHI-REL-HOP-0000",
    quantityOnHand: 1,
    shopifyStatus: "Not connected",
    networkStatus: "Available to share",
  },
];

type SortField = "title" | "sku" | "category" | "mediaType" | "listPrice" | "shopifyStatus" | "networkStatus";
type SortDirection = "asc" | "desc";

function readAllLocalScannedBooks(): InventoryRecord[] {
  if (typeof window === "undefined") return [];
  const records: InventoryRecord[] = [];
  const seen = new Set<string>();

  // 1. Check colophon-current-scanned-books
  try {
    const raw = window.localStorage.getItem("colophon-current-scanned-books");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || !item.isbn) continue;
          const cleanIsbn = String(item.isbn).replace(/[^0-9X]/gi, "").toUpperCase();
          if (seen.has(cleanIsbn)) continue;
          seen.add(cleanIsbn);
          records.push({
            id: item.id || `local-${cleanIsbn}`,
            isbn: cleanIsbn,
            title: item.title ?? null,
            author: item.author ?? null,
            coverUrl: item.coverUrl ?? null,
            thriftbooksPrice: item.thriftbooksPrice ?? null,
            listPrice: item.listPrice ?? item.thriftbooksPrice ?? 9.99,
            condition: item.condition ?? "Good",
            container: item.container ?? "Main Intake",
            category: item.category ?? "Print Books",
            subcategory: item.subcategory ?? null,
            mediaType: item.mediaType ?? "Book",
            sku: item.sku ?? `BK-${cleanIsbn}`,
            quantityOnHand: typeof item.quantityOnHand === "number" && item.quantityOnHand > 0 ? item.quantityOnHand : 1,
            shopifyStatus: "Not connected",
            networkStatus: "Available to share",
          });
        }
      }
    }
  } catch {}

  // 2. Check colophon-scan-sessions
  try {
    const rawSessions = window.localStorage.getItem("colophon-scan-sessions");
    if (rawSessions) {
      const sessions = JSON.parse(rawSessions);
      if (Array.isArray(sessions)) {
        for (const session of sessions) {
          if (!session || !Array.isArray(session.items)) continue;
          for (const sItem of session.items) {
            if (!sItem || !sItem.isbn) continue;
            const cleanIsbn = String(sItem.isbn).replace(/[^0-9X]/gi, "").toUpperCase();
            if (seen.has(cleanIsbn)) continue;
            seen.add(cleanIsbn);
            records.push({
              id: sItem.id || `session-${cleanIsbn}`,
              isbn: cleanIsbn,
              title: sItem.title ?? `Scanned Book (${cleanIsbn})`,
              author: null,
              coverUrl: null,
              thriftbooksPrice: sItem.value ?? null,
              listPrice: sItem.value ?? 9.99,
              condition: sItem.condition ?? "Good",
              container: sItem.container ?? "Main Intake",
              category: "Print Books",
              subcategory: null,
              mediaType: "Book",
              sku: `BK-${cleanIsbn}`,
              quantityOnHand: 1,
              shopifyStatus: "Not connected",
              networkStatus: "Available to share",
            });
          }
        }
      }
    }
  } catch {}

  return records;
}

function InventoryPage(): JSX.Element {
  const navigate = useNavigate();
  const [items, setItems] = useState<InventoryRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading active inventory...");
  const [partnerAvailabilityCheckedAt, setPartnerAvailabilityCheckedAt] = useState<Record<string, number>>({});
  const [connectedPartnerStores, setConnectedPartnerStores] = useState(0);
  const [availabilityFilter, setAvailabilityFilter] = useState<"my-store" | "partner">("my-store");
  const [mediaFilter, setMediaFilter] = useState("All");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Bulk Selection & Edit States
  const [selectedIsbns, setSelectedIsbns] = useState<Set<string>>(new Set());
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Bulk Form Fields
  const [bulkCategory, setBulkCategory] = useState("Print Books");
  const [bulkCategoryMode, setBulkCategoryMode] = useState<"unchanged" | "set">("set");
  const [bulkGenre, setBulkGenre] = useState("Fantasy");
  const [bulkGenreMode, setBulkGenreMode] = useState<"unchanged" | "preset" | "custom">("preset");
  const [bulkCustomGenre, setBulkCustomGenre] = useState("");
  const [bulkCondition, setBulkCondition] = useState<string>("unchanged");
  const [bulkMediaType, setBulkMediaType] = useState<string>("unchanged");
  const [bulkPriceMode, setBulkPriceMode] = useState<"unchanged" | "set">("unchanged");
  const [bulkPriceValue, setBulkPriceValue] = useState("");
  const [bulkSyncShopify, setBulkSyncShopify] = useState(true);

  const handleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const loadInventory = async (): Promise<void> => {
    setLoading(true);
    let apiItems: InventoryRecord[] = [];
    let connected = 0;

    try {
      const response = await fetch(resolveApiUrl(`/inventory/active?updatedAt=${Date.now()}`));
      if (response.ok) {
        const payload = (await response.json()) as { items: InventoryRecord[]; connectedStores: number };
        apiItems = payload.items || [];
        connected = payload.connectedStores || 0;
      }
    } catch {
      try {
        const directRes = await fetch(`/api/inventory/active?updatedAt=${Date.now()}`);
        if (directRes.ok) {
          const payload = (await directRes.json()) as { items: InventoryRecord[]; connectedStores: number };
          apiItems = payload.items || [];
          connected = payload.connectedStores || 0;
        }
      } catch {
        // ignore
      }
    }

    // Merge API items + locally scanned browser items
    const itemMap = new Map<string, InventoryRecord>();
    for (const item of apiItems) {
      if (item && item.isbn) {
        itemMap.set(item.isbn.replace(/[^0-9X]/gi, "").toUpperCase(), item);
      }
    }

    const localScanned = readAllLocalScannedBooks();
    for (const local of localScanned) {
      const key = local.isbn.replace(/[^0-9X]/gi, "").toUpperCase();
      if (!itemMap.has(key)) {
        itemMap.set(key, local);
        void fetch(resolveApiUrl(`/inventory/active/${encodeURIComponent(local.isbn)}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: local.title,
            author: local.author,
            listPrice: local.listPrice,
            condition: local.condition,
            container: local.container,
            category: local.category,
            subcategory: local.subcategory,
            sku: local.sku,
            quantityOnHand: local.quantityOnHand,
            mediaType: local.mediaType,
          }),
        }).catch(() => {});
      }
    }

    const allMerged = Array.from(itemMap.values());
    if (allMerged.length > 0) {
      setItems(allMerged);
      setConnectedPartnerStores(connected);
      setMessage(`Showing all ${allMerged.length} active inventory items.`);
    } else {
      setItems(fallbackInventory);
      setMessage("Showing local inventory preview. Connect the API to sync all records.");
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void loadInventory();
    const handleInventoryUpdated = (): void => {
      if (!cancelled) {
        void loadInventory();
      }
    };
    window.addEventListener("colophon-inventory-updated", handleInventoryUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener("colophon-inventory-updated", handleInventoryUpdated);
    };
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = items.filter((item) =>
      (availabilityFilter === "my-store" || connectedPartnerStores > 0)
      && (mediaFilter === "All" || item.mediaType === mediaFilter)
      && (!query || [item.title, item.author, item.isbn, item.sku, item.category, item.subcategory, item.mediaType]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))),
    );

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "title":
          comparison = (a.title ?? "").localeCompare(b.title ?? "");
          break;
        case "sku":
          comparison = (a.sku ?? "").localeCompare(b.sku ?? "");
          break;
        case "category":
          comparison = (a.category ?? "").localeCompare(b.category ?? "");
          break;
        case "mediaType":
          comparison = (a.mediaType ?? "").localeCompare(b.mediaType ?? "");
          break;
        case "listPrice":
          comparison = (a.listPrice ?? 0) - (b.listPrice ?? 0);
          break;
        case "shopifyStatus":
          comparison = (a.shopifyStatus ?? "").localeCompare(b.shopifyStatus ?? "");
          break;
        case "networkStatus":
          comparison = (a.networkStatus ?? "").localeCompare(b.networkStatus ?? "");
          break;
        default:
          comparison = 0;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [availabilityFilter, connectedPartnerStores, items, mediaFilter, search, sortField, sortDirection]);

  // Selection helpers
  const isAllSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIsbns.has(item.isbn));

  const toggleSelectAll = (): void => {
    if (isAllSelected) {
      setSelectedIsbns(new Set());
    } else {
      setSelectedIsbns(new Set(filteredItems.map((item) => item.isbn)));
    }
  };

  const toggleSelectItem = (isbn: string): void => {
    setSelectedIsbns((current) => {
      const next = new Set(current);
      if (next.has(isbn)) {
        next.delete(isbn);
      } else {
        next.add(isbn);
      }
      return next;
    });
  };

  const deselectAll = (): void => {
    setSelectedIsbns(new Set());
  };

  const totalUnits = items.reduce((sum, item) => sum + item.quantityOnHand, 0);
  const pricedItems = items.filter((item) => item.thriftbooksPrice !== null).length;
  const shareableItems = items.filter((item) => item.networkStatus === "Available to share").length;
  const totalInventoryValue = items.reduce((sum, item) => sum + (item.listPrice ?? 0) * item.quantityOnHand, 0);
  const pricedItemsForAverage = items.filter((item) => item.listPrice !== null);
  const averagePrice = pricedItemsForAverage.length === 0 ? 0 : pricedItemsForAverage.reduce((sum, item) => sum + (item.listPrice ?? 0), 0) / pricedItemsForAverage.length;
  const mediaCounts = items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.mediaType]: (counts[item.mediaType] ?? 0) + item.quantityOnHand }), {});
  const mediaTypes = ["All", ...Object.keys(mediaCounts).filter((type) => type !== "Book")];

  const checkPartnerAvailability = (item: InventoryRecord): void => {
    if (connectedPartnerStores < 1) {
      setMessage("No connected partner stores are available yet.");
      return;
    }
    const checkedAt = partnerAvailabilityCheckedAt[item.isbn] ?? 0;
    if (Date.now() - checkedAt < PARTNER_AVAILABILITY_CACHE_MS) {
      setMessage(`Partner availability for ${item.title ?? "this title"} is using the last check from this 30-minute window.`);
      return;
    }
    setPartnerAvailabilityCheckedAt((current) => ({ ...current, [item.isbn]: Date.now() }));
    setMessage(`${item.title ?? "This title"} is available from connected partner stores. Partner status cached for 30 minutes.`);
  };

  async function removeItem(item: InventoryRecord): Promise<void> {
    if (!window.confirm(`Remove all on-hand units of ${item.title ?? item.isbn} from active inventory?`)) return;
    try {
      const response = await fetch(resolveApiUrl(`/inventory/products/${encodeURIComponent(item.isbn)}`), { method: "DELETE" });
      if (!response.ok) throw new Error("Inventory item could not be removed.");
      setItems((current) => current.filter((record) => record.id !== item.id && record.isbn !== item.isbn));
      setSelectedIsbns((current) => {
        const next = new Set(current);
        next.delete(item.isbn);
        return next;
      });

      // Clean local storage cache
      try {
        const rawCurrent = window.localStorage.getItem("colophon-current-scanned-books");
        if (rawCurrent) {
          const parsed = JSON.parse(rawCurrent);
          if (Array.isArray(parsed)) {
            window.localStorage.setItem("colophon-current-scanned-books", JSON.stringify(parsed.filter((i: { isbn?: string }) => i?.isbn !== item.isbn)));
          }
        }
      } catch {}

      setMessage(`${item.title ?? item.isbn} was removed from active inventory.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Inventory item could not be removed."); }
  }

  // Bulk Apply Handler
  const handleApplyBulkEdit = async (): Promise<void> => {
    if (selectedIsbns.size === 0) return;
    setBulkBusy(true);
    try {
      const isbnsArray = Array.from(selectedIsbns);
      const updates: Record<string, unknown> = {};

      if (bulkCategoryMode === "set" && bulkCategory.trim()) {
        updates.category = bulkCategory.trim();
      }

      if (bulkGenreMode === "preset" && bulkGenre.trim()) {
        updates.subcategory = bulkGenre.trim();
      } else if (bulkGenreMode === "custom" && bulkCustomGenre.trim()) {
        updates.subcategory = bulkCustomGenre.trim();
      }

      if (bulkCondition !== "unchanged") {
        updates.condition = bulkCondition;
      }

      if (bulkMediaType !== "unchanged") {
        updates.mediaType = bulkMediaType;
      }

      if (bulkPriceMode === "set") {
        const parsedPrice = parseFloat(bulkPriceValue);
        if (!isNaN(parsedPrice) && parsedPrice >= 0) {
          updates.listPrice = parsedPrice;
        }
      }

      const response = await fetch(resolveApiUrl("/inventory/bulk-update"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isbns: isbnsArray,
          updates,
          syncToShopify: bulkSyncShopify,
        }),
      });

      if (!response.ok) {
        throw new Error("Bulk update failed.");
      }

      await loadInventory();
      setIsBulkModalOpen(false);
      setMessage(`Successfully updated ${isbnsArray.length} items${bulkSyncShopify ? " and synced to Shopify" : ""}.`);
      deselectAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to apply bulk updates.");
    } finally {
      setBulkBusy(false);
    }
  };

  // Bulk Shopify Sync Handler
  const handleBulkSyncShopify = async (): Promise<void> => {
    if (selectedIsbns.size === 0) return;
    setBulkBusy(true);
    try {
      const isbnsArray = Array.from(selectedIsbns);
      const response = await fetch(resolveApiUrl("/inventory/bulk-update"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isbns: isbnsArray,
          updates: {},
          syncToShopify: true,
        }),
      });

      if (!response.ok) throw new Error("Bulk sync to Shopify failed.");
      setMessage(`Triggered Shopify sync for ${isbnsArray.length} items.`);
      await loadInventory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to sync items to Shopify.");
    } finally {
      setBulkBusy(false);
    }
  };

  // Bulk Delete Handler
  const handleBulkDelete = async (): Promise<void> => {
    if (selectedIsbns.size === 0) return;
    if (!window.confirm(`Are you sure you want to permanently delete ${selectedIsbns.size} selected item(s) from inventory?`)) return;
    setBulkBusy(true);
    try {
      const isbnsArray = Array.from(selectedIsbns);
      const response = await fetch(resolveApiUrl("/inventory/bulk-delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isbns: isbnsArray }),
      });

      if (!response.ok) throw new Error("Bulk delete failed.");

      // Clean local storage cache
      try {
        const rawCurrent = window.localStorage.getItem("colophon-current-scanned-books");
        if (rawCurrent) {
          const parsed = JSON.parse(rawCurrent);
          if (Array.isArray(parsed)) {
            const remaining = parsed.filter((i: { isbn?: string }) => !selectedIsbns.has(String(i?.isbn || "").replace(/[^0-9X]/gi, "").toUpperCase()));
            window.localStorage.setItem("colophon-current-scanned-books", JSON.stringify(remaining));
          }
        }
        const rawSessions = window.localStorage.getItem("colophon-scan-sessions");
        if (rawSessions) {
          const sessions = JSON.parse(rawSessions);
          if (Array.isArray(sessions)) {
            const cleaned = sessions.map((s: { items?: Array<{ isbn?: string }> }) => ({
              ...s,
              items: Array.isArray(s.items)
                ? s.items.filter((i) => !selectedIsbns.has(String(i?.isbn || "").replace(/[^0-9X]/gi, "").toUpperCase()))
                : [],
            }));
            window.localStorage.setItem("colophon-scan-sessions", JSON.stringify(cleaned));
          }
        }
      } catch {}

      setItems((current) => current.filter((item) => !selectedIsbns.has(item.isbn)));
      setMessage(`Successfully removed ${isbnsArray.length} items from active inventory.`);
      deselectAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to remove selected items.");
    } finally {
      setBulkBusy(false);
    }
  };

  // Navigate to Bundle Studio with Selected Items
  const handleCreateBundleFromSelected = (): void => {
    if (selectedIsbns.size < 2) return;
    const selectedItemsList = items.filter((i) => selectedIsbns.has(i.isbn));
    navigate("/bundles", {
      state: {
        preselectedItems: selectedItemsList.map((i) => ({
          isbn: i.isbn,
          sku: i.sku,
          title: i.title || "Untitled Book",
          author: i.author,
          coverUrl: i.coverUrl,
          condition: i.condition,
          listPrice: i.listPrice || 9.99,
          category: i.category,
          subcategory: i.subcategory,
          quantityOnHand: i.quantityOnHand,
        })),
      },
    });
  };

  return (
    <section className="grid gap-4 relative">
      <SurfaceCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Active inventory</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-800">Store catalog</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">One view for books in the store, Shopify availability, and Open Network sharing.</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700">Local catalog active</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Active titles", String(items.length)],
            ["Units on hand", String(totalUnits)],
            ["Priced and ready", `${pricedItems}/${items.length || 0}`],
            ["Total inventory value", `$${totalInventoryValue.toFixed(2)}`],
            ["Average list price", `$${averagePrice.toFixed(2)}`],
            ...Object.entries(mediaCounts).map(([type, count]) => [`${type} units`, String(count)]),
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-white/70 p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">{value}</p>
            </div>
          ))}
        </div>
      </SurfaceCard>

      {/* Floating / Sticky Bulk Actions Bar */}
      {selectedIsbns.size > 0 && (
        <div className="sticky top-4 z-40 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-white shadow-2xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-slate-950">
              {selectedIsbns.size}
            </span>
            <div>
              <p className="text-sm font-semibold">{selectedIsbns.size} item{selectedIsbns.size > 1 ? "s" : ""} selected</p>
              <p className="text-xs text-slate-400">Bulk edit genres, bundle items, prices, or sync</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIsbns.size >= 2 ? (
              <button
                type="button"
                disabled={bulkBusy}
                onClick={handleCreateBundleFromSelected}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950 transition shadow-sm active:scale-[0.98]"
              >
                <span>📦 Create Bundle ({selectedIsbns.size})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMessage("Please select at least 2 books to create a bundle.")}
                className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-400 transition hover:text-slate-200"
                title="Select at least 2 items to bundle"
              >
                <span>📦 Create Bundle (Select 2+)</span>
              </button>
            )}
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => setIsBulkModalOpen(true)}
              className="rounded-xl bg-[#e9ff63] px-3.5 py-2 text-xs font-bold text-slate-900 transition hover:bg-[#d6ed48]"
            >
              Bulk Edit Genre & Category
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void handleBulkSyncShopify()}
              className="rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
            >
              Sync to Shopify
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void handleBulkDelete()}
              className="flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-3.5 py-2 text-xs font-bold text-white transition shadow-sm active:scale-[0.98]"
            >
              <span>🗑️ Bulk Delete ({selectedIsbns.size})</span>
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:text-white"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      <SurfaceCard className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Inventory records</h3>
            <p className="mt-1 text-xs text-slate-500">{shareableItems} item(s) available for Open Network sharing. {connectedPartnerStores} connected partner store(s).</p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ISBN, SKU, author, title, media type"
            aria-label="Search inventory"
            className="h-10 min-w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
          />
          <div className="flex flex-wrap gap-2">
            {([['my-store', 'Available in My Store'], ['partner', 'Available in Partner Store']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAvailabilityFilter(value)}
                className={["rounded-lg px-3 py-2 text-xs font-semibold", availabilityFilter === value ? "bg-slate-800 text-white" : "bg-white text-slate-600"].join(" ")}
              >
                {label}
              </button>
            ))}
            <select
              value={mediaFilter}
              onChange={(event) => setMediaFilter(event.target.value)}
              aria-label="Filter by media type"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
            >
              {mediaTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th scope="col" className="w-10 px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all items"
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 cursor-pointer"
                  />
                </th>
                {[
                  { field: "title" as const, label: "Item" },
                  { field: "sku" as const, label: "SKU / Barcode" },
                  { field: "category" as const, label: "Category & Genre" },
                  { field: "mediaType" as const, label: "Media type" },
                  { field: "listPrice" as const, label: "Price" },
                  { field: "shopifyStatus" as const, label: "Shopify" },
                  { field: "networkStatus" as const, label: "Open Network" },
                ].map(({ field, label }) => {
                  const isActive = sortField === field;
                  return (
                    <th
                      key={field}
                      scope="col"
                      onClick={() => handleSort(field)}
                      className="cursor-pointer select-none px-3 py-2 transition-colors hover:text-slate-700"
                      title={`Sort by ${label} (${isActive && sortDirection === "asc" ? "descending" : "ascending"})`}
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <span className={isActive ? "font-bold text-slate-800" : ""}>{label}</span>
                        <span
                          className={[
                            "text-xs transition-colors",
                            isActive ? "font-bold text-sky-600" : "text-slate-300",
                          ].join(" ")}
                        >
                          {isActive ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const isSelected = selectedIsbns.has(item.isbn);
                return (
                  <tr
                    key={item.id}
                    className={[
                      "transition-colors",
                      isSelected ? "bg-amber-50/80 text-slate-800 shadow-sm" : "bg-white/75 text-slate-700 hover:bg-white",
                    ].join(" ")}
                  >
                    <td className="rounded-l-xl px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectItem(item.isbn)}
                        aria-label={`Select ${item.title ?? item.isbn}`}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {item.coverUrl ? (
                          <img
                            src={item.coverUrl}
                            alt={item.title ?? "Book cover"}
                            className="h-12 w-9 shrink-0 rounded border border-slate-200 bg-slate-100 object-cover shadow-sm"
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-400 text-sm shadow-sm">
                            📖
                          </div>
                        )}
                        <div>
                          <button
                            type="button"
                            onClick={() => navigate(`/inventory/product/${encodeURIComponent(item.isbn)}`)}
                            className="text-left font-semibold text-slate-800 hover:text-sky-700 line-clamp-1"
                          >
                            {item.title ?? "Title unavailable"}
                          </button>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {item.author ?? "Author unavailable"} · <span className="font-semibold text-slate-700">Qty {item.quantityOnHand}</span>
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p className="font-semibold">{item.sku}</p>
                      <p className="mt-0.5 text-slate-500">{item.isbn}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                        {item.category ?? "Print Books"}
                      </span>
                      <p className="mt-1 text-xs font-medium text-sky-700">
                        {item.subcategory ?? "Unassigned Genre"}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold">{item.mediaType}</td>
                    <td className="px-3 py-3">
                      <p className="font-semibold">{item.listPrice === null ? "Manual lookup" : `$${item.listPrice.toFixed(2)}`}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.condition ?? "Good"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill label={item.shopifyStatus} tone={item.shopifyStatus === "Published" ? "mint" : "slate"} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill label={item.networkStatus} tone={item.networkStatus === "Shared" ? "mint" : "violet"} />
                    </td>
                    <td className="rounded-r-xl px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {connectedPartnerStores > 0 ? (
                          <>
                            <button
                              type="button"
                              onClick={() => checkPartnerAvailability(item)}
                              className="rounded-lg bg-emerald-100 px-2.5 py-1.5 text-xs font-semibold text-emerald-700"
                            >
                              Partner
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/open-network/order?partner=Riverlight%20Books&isbn=${encodeURIComponent(item.isbn)}&title=${encodeURIComponent(item.title ?? "")}&price=${item.listPrice ?? ""}&cover=${encodeURIComponent(item.coverUrl ?? "")}`)}
                              className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white"
                            >
                              Order
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void removeItem(item)}
                          className="rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filteredItems.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No inventory matches this search.</p> : null}
        </div>
      </SurfaceCard>

      {/* Bulk Edit Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl border border-white/80 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Bulk Edit Inventory</h3>
                <p className="mt-0.5 text-xs text-slate-500">Updating {selectedIsbns.size} selected item{selectedIsbns.size > 1 ? "s" : ""}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              {/* Category */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Category</label>
                <div className="mt-1 flex gap-2">
                  <select
                    value={bulkCategoryMode === "unchanged" ? "unchanged" : bulkCategory}
                    onChange={(e) => {
                      if (e.target.value === "unchanged") {
                        setBulkCategoryMode("unchanged");
                      } else {
                        setBulkCategoryMode("set");
                        setBulkCategory(e.target.value);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"
                  >
                    <option value="Print Books">Print Books (Recommended)</option>
                    <option value="Rare Books">Rare Books</option>
                    <option value="Used Books">Used Books</option>
                    <option value="Audiobooks">Audiobooks</option>
                    <option value="Merchandise">Merchandise</option>
                    <option value="unchanged">Keep Current Categories</option>
                  </select>
                </div>
              </div>

              {/* Genre / Subcategory */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Genre / Subcategory</label>
                <div className="mt-1 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={bulkGenreMode === "preset" ? bulkGenre : bulkGenreMode}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "unchanged" || val === "custom") {
                          setBulkGenreMode(val);
                        } else {
                          setBulkGenreMode("preset");
                          setBulkGenre(val);
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"
                    >
                      <option value="unchanged">Keep Current Genres</option>
                      <option value="custom">Custom Genre (Type Below)...</option>
                      <optgroup label="Standard Genres">
                        {GENRE_OPTIONS.map((genre) => (
                          <option key={genre} value={genre}>{genre}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                  {bulkGenreMode === "custom" && (
                    <input
                      type="text"
                      placeholder="Enter custom genre (e.g., Cyberpunk, Local Authors)"
                      value={bulkCustomGenre}
                      onChange={(e) => setBulkCustomGenre(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"
                    />
                  )}
                </div>
              </div>

              {/* Condition */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Condition</label>
                <select
                  value={bulkCondition}
                  onChange={(e) => setBulkCondition(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"
                >
                  <option value="unchanged">Keep Current Conditions</option>
                  <option value="New">New</option>
                  <option value="Like New">Like New</option>
                  <option value="Very Good">Very Good</option>
                  <option value="Good">Good</option>
                  <option value="Acceptable">Acceptable</option>
                </select>
              </div>

              {/* Media Type */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Media Type</label>
                <select
                  value={bulkMediaType}
                  onChange={(e) => setBulkMediaType(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"
                >
                  <option value="unchanged">Keep Current Media Types</option>
                  <option value="Book">Book</option>
                  <option value="Audio CD">Audio CD</option>
                  <option value="Vinyl">Vinyl</option>
                  <option value="DVD">DVD</option>
                </select>
              </div>

              {/* Price Override */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">List Price</label>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    value={bulkPriceMode}
                    onChange={(e) => setBulkPriceMode(e.target.value as "unchanged" | "set")}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"
                  >
                    <option value="unchanged">Keep Current Prices</option>
                    <option value="set">Set Fixed Price ($)</option>
                  </select>
                  {bulkPriceMode === "set" && (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="14.99"
                      value={bulkPriceValue}
                      onChange={(e) => setBulkPriceValue(e.target.value)}
                      className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"
                    />
                  )}
                </div>
              </div>

              {/* Shopify Sync Toggle */}
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkSyncShopify}
                    onChange={(e) => setBulkSyncShopify(e.target.checked)}
                    className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-400"
                  />
                  <div>
                    <p className="text-xs font-semibold text-emerald-950">Sync changes to Shopify</p>
                    <p className="text-[11px] text-emerald-700">Pushes updated category, genre, price, and tags to your Shopify store.</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => setIsBulkModalOpen(false)}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void handleApplyBulkEdit()}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
              >
                {bulkBusy ? "Applying Changes..." : `Apply to ${selectedIsbns.size} Item${selectedIsbns.size > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default InventoryPage;

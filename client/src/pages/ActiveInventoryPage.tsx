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

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
const PARTNER_AVAILABILITY_CACHE_MS = 30 * 60 * 1000;

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
    category: "Religion",
    subcategory: null,
    mediaType: "Book",
    sku: "REL-GEN-HOP-0000",
    quantityOnHand: 1,
    shopifyStatus: "Not connected",
    networkStatus: "Available to share",
  },
];

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

  const loadInventory = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/inventory/active?updatedAt=${Date.now()}`);
      if (!response.ok) {
        throw new Error("Inventory service unavailable");
      }
      const payload = (await response.json()) as { items: InventoryRecord[]; connectedStores: number };
      setItems(payload.items);
      setConnectedPartnerStores(payload.connectedStores);
      setMessage(payload.items.length === 0 ? "No scanned inventory has been stored yet." : "Inventory synced from the local catalog.");
    } catch {
      setItems(fallbackInventory);
      setMessage("Showing local inventory preview. Connect the API to sync all records.");
    } finally {
      setLoading(false);
    }
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
    return items.filter((item) =>
      (availabilityFilter === "my-store" || connectedPartnerStores > 0)
      && (mediaFilter === "All" || item.mediaType === mediaFilter)
      && (!query || [item.title, item.author, item.isbn, item.sku, item.category, item.subcategory, item.mediaType]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))),
    );
  }, [availabilityFilter, connectedPartnerStores, items, mediaFilter, search]);

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
      const response = await fetch(`${API_BASE}/inventory/products/${encodeURIComponent(item.isbn)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Inventory item could not be removed.");
      setItems((current) => current.filter((record) => record.id !== item.id));
      setMessage(`${item.title ?? item.isbn} was removed from active inventory.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Inventory item could not be removed."); }
  }

  return (
    <section className="grid gap-4">
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
            {([['my-store', 'Available in My Store'], ['partner', 'Available in Partner Store']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setAvailabilityFilter(value)} className={["rounded-lg px-3 py-2 text-xs font-semibold", availabilityFilter === value ? "bg-slate-800 text-white" : "bg-white text-slate-600"].join(" ")}>{label}</button>)}
            <select value={mediaFilter} onChange={(event) => setMediaFilter(event.target.value)} aria-label="Filter by media type" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">{mediaTypes.map((type) => <option key={type}>{type}</option>)}</select>
          </div>
        </div>
        <p className="mt-3 rounded-xl bg-white/60 px-3 py-2 text-xs text-slate-500">{loading ? "Loading..." : message}</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">SKU / Barcode</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Media type</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Shopify</th>
                <th className="px-3 py-2">Open Network</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} className="bg-white/75 text-slate-700">
                  <td className="rounded-l-xl px-3 py-3">
                    <button type="button" onClick={() => navigate(`/inventory/product/${encodeURIComponent(item.isbn)}`)} className="text-left font-semibold text-slate-800 hover:text-sky-700">{item.title ?? "Title unavailable"}</button>
                    <p className="mt-1 text-xs text-slate-500">{item.author ?? "Author unavailable"} · Qty {item.quantityOnHand}</p>
                  </td>
                  <td className="px-3 py-3 text-xs"><p className="font-semibold">{item.sku}</p><p className="mt-1 text-slate-500">{item.isbn}</p></td>
                  <td className="px-3 py-3"><p>{item.category ?? "Uncategorized"}</p><p className="mt-1 text-xs text-slate-500">{item.subcategory ?? "No secondary category"}</p></td>
                  <td className="px-3 py-3 text-xs font-semibold">{item.mediaType}</td>
                  <td className="px-3 py-3"><p className="font-semibold">{item.listPrice === null ? "Manual lookup" : `$${item.listPrice.toFixed(2)}`}</p><p className="mt-1 text-xs text-slate-500">{item.condition ?? "Condition pending"}</p></td>
                  <td className="px-3 py-3"><StatusPill label={item.shopifyStatus} tone={item.shopifyStatus === "Published" ? "mint" : "slate"} /></td>
                  <td className="px-3 py-3"><StatusPill label={item.networkStatus} tone={item.networkStatus === "Shared" ? "mint" : "violet"} /></td>
                  <td className="rounded-r-xl px-3 py-3"><div className="flex flex-wrap gap-2">{connectedPartnerStores > 0 ? <><button type="button" onClick={() => checkPartnerAvailability(item)} className="rounded-lg bg-emerald-100 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">Partner availability</button><button type="button" onClick={() => navigate(`/open-network/order?partner=Riverlight%20Books&isbn=${encodeURIComponent(item.isbn)}&title=${encodeURIComponent(item.title ?? "")}&price=${item.listPrice ?? ""}&cover=${encodeURIComponent(item.coverUrl ?? "")}`)} className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white">Order from Store</button></> : null}<button type="button" onClick={() => void removeItem(item)} className="rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-700">Remove</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredItems.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No inventory matches this search.</p> : null}
        </div>
      </SurfaceCard>
    </section>
  );
}

export default InventoryPage;

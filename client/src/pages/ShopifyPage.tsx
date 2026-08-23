import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

type ShopifyConnection = {
  platform: "shopify";
  storeUrl: string;
  syncInventory: boolean;
  syncOrders: boolean;
  lastSyncedAt: string | null;
};

type ShopifyOrder = {
  id?: number | string;
  name?: string;
  created_at?: string;
  total_price?: string;
  financial_status?: string;
  fulfillment_status?: string;
};

type ShopifyProductRow = {
  sku: string;
  quantity: number;
  title: string;
  price?: string;
};

function ShopifyPage(): JSX.Element {
  const [storeUrl, setStoreUrl] = useState("https://example-store.myshopify.com");
  const [accessToken, setAccessToken] = useState("");
  const [syncInventory, setSyncInventory] = useState(true);
  const [syncOrders, setSyncOrders] = useState(true);
  const [message, setMessage] = useState("Loading Shopify connection...");
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [products, setProducts] = useState<ShopifyProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [connection, setConnection] = useState<ShopifyConnection | null>(null);

  useEffect(() => {
    const loadConnection = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_BASE}/stores/ghostlight-demo/ecommerce`, {
          headers: { "X-Dev-Subdomain": "admin" },
        });
        if (!response.ok) {
          setMessage("No Shopify store is connected yet.");
          return;
        }

        const payload = (await response.json()) as ShopifyConnection[];
        const shopify = payload.find((item) => item.platform === "shopify") ?? null;
        setConnection(shopify);
        if (shopify) {
          setStoreUrl(shopify.storeUrl);
          setSyncInventory(shopify.syncInventory);
          setSyncOrders(shopify.syncOrders);
          setMessage(`Connected to ${shopify.storeUrl}`);
        } else {
          setMessage("No Shopify store is connected yet.");
        }
      } catch {
        setMessage("Shopify connection metadata is unavailable.");
      }
    };

    void loadConnection();
  }, []);

  const saveConnection = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/stores/ghostlight-demo/ecommerce/shopify`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Dev-Subdomain": "admin" },
        body: JSON.stringify({
          storeUrl,
          config: { accessToken },
          syncInventory,
          syncOrders,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Shopify settings could not be saved.");
      }

      const nextConnection: ShopifyConnection = {
        platform: "shopify",
        storeUrl,
        syncInventory,
        syncOrders,
        lastSyncedAt: new Date().toISOString(),
      };
      setConnection(nextConnection);
      setMessage(`Shopify saved for ${storeUrl}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Shopify settings could not be saved.");
    } finally {
      setLoading(false);
    }
  };

  const syncProducts = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/stores/ghostlight-demo/ecommerce/shopify/inventory-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Dev-Subdomain": "admin" },
        body: JSON.stringify({ sku: "BK-9780143127741-USED-GOOD", quantity: 4 }),
      });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Inventory sync failed.");
      }
      setProducts([{ sku: "BK-9780143127741-USED-GOOD", quantity: 4, title: "The Martian" }]);
      setMessage(payload.message ?? "Inventory sync succeeded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inventory sync failed.");
    } finally {
      setLoading(false);
    }
  };

  const importOrders = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/stores/ghostlight-demo/ecommerce/shopify/orders`, {
        headers: { "X-Dev-Subdomain": "admin" },
      });
      if (!response.ok) {
        throw new Error("Orders could not be imported.");
      }
      const payload = (await response.json()) as { orders?: ShopifyOrder[] };
      setOrders(payload.orders ?? []);
      setMessage(payload.orders && payload.orders.length > 0 ? `Imported ${payload.orders.length} Shopify order(s).` : "No recent Shopify orders were found.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Orders could not be imported.");
    } finally {
      setLoading(false);
    }
  };

  const connectionSummary = useMemo(() => {
    if (!connection) {
      return "Not connected";
    }
    return `Last sync: ${connection.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "never"}`;
  }, [connection]);

  return (
    <main className="space-y-5 p-4 md:p-6">
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Shopify</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-800">Store connector</h1>
          </div>
          <span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-semibold text-sky-700">{connectionSummary}</span>
        </div>
        <p className="mt-3 text-sm text-slate-600">{message}</p>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800">Connection settings</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-slate-600">
              Shopify store URL
              <input value={storeUrl} onChange={(event) => setStoreUrl(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-sky-500" placeholder="https://your-store.myshopify.com" />
            </label>
            <label className="grid gap-1 text-sm text-slate-600">
              Admin access token
              <input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-sky-500" placeholder="Shopify admin token" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={syncInventory} onChange={(event) => setSyncInventory(event.target.checked)} /> Inventory sync</label>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={syncOrders} onChange={(event) => setSyncOrders(event.target.checked)} /> Order sync</label>
            <button type="button" onClick={() => void saveConnection()} disabled={loading} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{loading ? "Saving..." : "Save connector"}</button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800">Sync actions</h2>
          <div className="mt-4 grid gap-3">
            <button type="button" onClick={() => void syncProducts()} className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white">Sync product inventory</button>
            <button type="button" onClick={() => void importOrders()} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">Import recent orders</button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800">Inventory sync preview</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Qty</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-500">No product sync has happened yet.</td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product.sku} className="border-t border-slate-200">
                      <td className="px-3 py-2 font-medium">{product.sku}</td>
                      <td className="px-3 py-2">{product.title}</td>
                      <td className="px-3 py-2">{product.quantity}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800">Recent orders</h2>
          <div className="mt-4 space-y-3">
            {orders.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">No orders imported yet.</p>
            ) : (
              orders.slice(0, 6).map((order, index) => (
                <div key={`${order.id ?? index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-700">{order.name ?? `Order #${order.id ?? index + 1}`}</span>
                    <span className="text-xs text-slate-500">{order.financial_status ?? "unknown"}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{order.created_at ? new Date(order.created_at).toLocaleString() : "No date"}</p>
                  <p className="mt-2 text-sm text-slate-600">Total: {order.total_price ?? "$0.00"}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default ShopifyPage;

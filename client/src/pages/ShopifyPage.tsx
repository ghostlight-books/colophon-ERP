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
  status?: "synced" | "failed";
  message?: string;
};

function ShopifyPage(): JSX.Element {
  const [storeUrl, setStoreUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [syncInventory, setSyncInventory] = useState(true);
  const [syncOrders, setSyncOrders] = useState(true);
  const [message, setMessage] = useState("Loading Shopify connection...");
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [products, setProducts] = useState<ShopifyProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [connection, setConnection] = useState<ShopifyConnection | null>(null);
  const [connectionDetails, setConnectionDetails] = useState<{ connected: boolean; message: string } | null>(null);

  const loadConnection = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE}/stores/ghostlight-demo/ecommerce`, {
        headers: { "X-Dev-Subdomain": "admin" },
      });
      if (!response.ok) {
        setMessage("Enter your Shopify store URL and Admin API Access Token to connect.");
        return;
      }

      const payload = (await response.json()) as ShopifyConnection[];
      const shopify = payload.find((item) => item.platform === "shopify") ?? null;
      setConnection(shopify);
      if (shopify) {
        setStoreUrl(shopify.storeUrl);
        setSyncInventory(shopify.syncInventory);
        setSyncOrders(shopify.syncOrders);
        const statusResponse = await fetch(`${API_BASE}/stores/ghostlight-demo/ecommerce/shopify/status`, { headers: { "X-Dev-Subdomain": "admin" } });
        const status = (await statusResponse.json().catch(() => ({}))) as { connected?: boolean; message?: string };
        setConnectionDetails({ connected: Boolean(status.connected), message: status.message ?? "Connected to Shopify." });
        setMessage(status.message ?? `Connected to ${shopify.storeUrl}`);
      } else {
        setMessage("Enter your Shopify store URL and Admin API Access Token to connect.");
      }
    } catch {
      setMessage("Shopify connection metadata is unavailable.");
    }
  };

  useEffect(() => {
    void loadConnection();
  }, []);

  const saveConnection = async (): Promise<void> => {
    if (!storeUrl.trim()) {
      setMessage("Enter your Shopify store URL (e.g. ghostlight-books.myshopify.com).");
      return;
    }
    if (!accessToken.trim() && !connection) {
      setMessage("Enter your Shopify Admin API Access Token (starts with shpat_).");
      return;
    }

    setLoading(true);
    setMessage("Testing and saving Shopify connection...");
    try {
      const formattedUrl = storeUrl.trim().startsWith("http") ? storeUrl.trim() : `https://${storeUrl.trim()}`;
      const response = await fetch(`${API_BASE}/stores/ghostlight-demo/ecommerce/shopify`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Dev-Subdomain": "admin" },
        body: JSON.stringify({
          storeUrl: formattedUrl,
          config: accessToken.trim() ? { accessToken: accessToken.trim() } : undefined,
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
        storeUrl: formattedUrl,
        syncInventory,
        syncOrders,
        lastSyncedAt: new Date().toISOString(),
      };
      setConnection(nextConnection);
      setAccessToken("");

      // Test live status immediately
      const statusResponse = await fetch(`${API_BASE}/stores/ghostlight-demo/ecommerce/shopify/status`, { headers: { "X-Dev-Subdomain": "admin" } });
      const status = (await statusResponse.json().catch(() => ({}))) as { connected?: boolean; message?: string };
      setConnectionDetails({ connected: Boolean(status.connected), message: status.message ?? "Connected to Shopify." });
      setMessage(status.message ?? `Shopify connection saved for ${formattedUrl}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Shopify settings could not be saved.");
      setConnectionDetails({ connected: false, message: error instanceof Error ? error.message : "Connection failed." });
    } finally {
      setLoading(false);
    }
  };

  const syncProducts = async (): Promise<void> => {
    if (!connection) {
      setMessage("Connect your Shopify store before syncing data.");
      return;
    }
    setLoading(true);
    setMessage("Syncing inventory catalog to Shopify...");
    try {
      const response = await fetch(`${API_BASE}/stores/ghostlight-demo/ecommerce/shopify/inventory-sync-stream`, { headers: { Accept: "application/x-ndjson", "X-Dev-Subdomain": "admin" } });
      if (!response.ok || !response.body) throw new Error("Inventory sync could not start.");
      setProducts([]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as { type: string; sku?: string; isbn?: string; title?: string; status?: "synced" | "failed"; message?: string; synced?: number; skipped?: number };
          if (event.type === "item" && event.sku && event.title && event.status) setProducts((current) => [...current, { sku: event.sku!, title: event.title!, quantity: 0, status: event.status, message: event.message }]);
          if (event.type === "complete") setMessage(`Inventory sync completed: ${event.synced ?? 0} synced, ${event.skipped ?? 0} skipped.`);
          if (event.type === "error") throw new Error(event.message ?? "Inventory sync failed.");
        }
        if (chunk.done) break;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inventory sync failed.");
    } finally {
      setLoading(false);
    }
  };

  const importOrders = async (): Promise<void> => {
    if (!connection) {
      setMessage("Connect your Shopify store before importing orders.");
      return;
    }
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
    if (connectionDetails?.connected) {
      return "Connected & Active";
    }
    if (connection) {
      return "Connected";
    }
    return "Not connected";
  }, [connection, connectionDetails]);

  return (
    <main className="space-y-5 p-4 md:p-6">
      <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Shopify</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-800">Store connector</h1>
          </div>
          <span
            className={[
              "rounded-full px-3.5 py-1.5 text-xs font-bold",
              connectionDetails?.connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600",
            ].join(" ")}
          >
            {connectionSummary}
          </span>
        </div>
        <p className="mt-3 text-sm font-medium text-slate-600">{message}</p>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800">Shopify Admin API Connection</h2>
          <p className="mt-1 text-xs text-slate-500">Connect your Shopify store using a Custom App Access Token to enable instant scan-to-Shopify product publishing.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Shopify Store Domain / URL
              <input
                value={storeUrl}
                onChange={(event) => setStoreUrl(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-sky-500"
                placeholder="your-store.myshopify.com"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Admin API Access Token
              <input
                type="password"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-sky-500"
                placeholder={connection ? "•••••••••••••••• (Leave blank to keep current)" : "shpat_..."}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={syncInventory}
                  onChange={(event) => setSyncInventory(event.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                Auto-sync inventory on scan
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={syncOrders}
                  onChange={(event) => setSyncOrders(event.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                Sync orders
              </label>
            </div>

            <button
              type="button"
              onClick={() => void saveConnection()}
              disabled={loading}
              className="h-11 rounded-xl bg-sky-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? "Connecting..." : "Save & Test Connection"}
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-xs text-slate-600">
            <p className="font-semibold text-sky-800">How to get your Shopify Access Token (1-minute setup):</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">
              <li>In your Shopify Admin, go to: <strong>Settings → Apps and sales channels → Develop apps</strong>.</li>
              <li>Click <strong>Create an app</strong> (Name it <em>Colophon ERP</em>).</li>
              <li>Under <strong>Configure Admin API scopes</strong>, enable:
                <span className="font-mono text-[11px] text-sky-900 block mt-0.5">read_products, write_products, read_inventory, write_inventory, read_orders, read_locations</span>
              </li>
              <li>Click <strong>Install app</strong> and reveal the <strong>Admin API access token</strong> (starts with <code className="rounded bg-sky-100 px-1 py-0.5 font-mono">shpat_</code>).</li>
              <li>Paste it into the field above and click <strong>Save & Test Connection</strong>.</li>
            </ol>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-800">Manual Sync Actions</h2>
          <p className="mt-1 text-xs text-slate-500">Trigger on-demand syncs for your existing inventory catalog or incoming orders.</p>
          <div className="mt-4 grid gap-3">
            <button
              type="button"
              disabled={!connection || loading}
              onClick={() => void syncProducts()}
              className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900 disabled:opacity-40"
            >
              {loading ? "Syncing..." : "Sync Full Inventory Catalog to Shopify"}
            </button>
            <button
              type="button"
              disabled={!connection || loading}
              onClick={() => void importOrders()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Import Recent Orders
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-800">ERP to Shopify mapping</h2>
        <div className="mt-4 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
          <p><strong>Title</strong> maps to Shopify product title.</p>
          <p><strong>Author</strong> maps to vendor, visible description, and custom author metafield.</p>
          <p><strong>Description</strong> maps to the storefront product description.</p>
          <p><strong>Cover</strong> maps to the Shopify product image.</p>
          <p><strong>Category</strong> maps to product type and a matching Shopify collection.</p>
          <p><strong>Tags and SEO keywords</strong> map to Shopify product tags.</p>
          <p><strong>SEO title and description</strong> map to Shopify SEO metafields.</p>
          <p><strong>ISBN and SKU</strong> map to the Shopify variant barcode and SKU.</p>
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
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">No product sync has happened yet.</td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product.sku} className="border-t border-slate-200">
                      <td className="px-3 py-2 font-medium">{product.sku}</td>
                      <td className="px-3 py-2">{product.title}</td>
                      <td className="px-3 py-2">{product.quantity}</td>
                      <td className={product.status === "synced" ? "px-3 py-2 font-semibold text-emerald-700" : "px-3 py-2 font-semibold text-rose-700"}>{product.status === "synced" ? "Synced" : "Failed"}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{product.message ?? ""}</td>
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

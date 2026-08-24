import { useEffect, useMemo, useState } from "react";
import { Building2, CreditCard, Database, LayoutDashboard, Network, Settings, Wallet, Activity, Users } from "lucide-react";

import SurfaceCard from "../components/ui/SurfaceCard";

type AdminStore = { id: string; slug: string; storeName: string; ownerEmail: string; ledgerBalance: number; subscriptionStatus: string; createdAt: string };
type GlobalIntegration = { id: string; key: string; name: string; category: string; enabled: boolean };
type StoreEcommerceConnection = { platform: "shopify" | "woocommerce"; storeUrl: string; syncInventory: boolean; syncOrders: boolean; lastSyncedAt: string | null };
type StoreMember = { id: string; userId: string; email: string; displayName: string; isActive: boolean; role: string; permissions: Record<string, boolean> };
type ApiHealth = { status: string; service: string; environment: string; uptimeSeconds: number; commit: string | null };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
const adminSections = [
  ["overview", "Overview", LayoutDashboard],
  ["stores", "Bookstores", Building2],
  ["members", "Access", Users],
  ["integrations", "Integrations", CreditCard],
  ["ledger", "Ledger", Wallet],
  ["network", "Network Orders", Network],
  ["health", "System Health", Activity],
  ["settings", "Settings", Settings],
] as const;

function AdminPage(): JSX.Element {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [message, setMessage] = useState("Loading platform data...");
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [integrations, setIntegrations] = useState<GlobalIntegration[]>([]);
  const [integrationKey, setIntegrationKey] = useState("");
  const [integrationName, setIntegrationName] = useState("");
  const [integrationCategory, setIntegrationCategory] = useState("E-commerce");
  const [broadcast, setBroadcast] = useState("");
  const [broadcastType, setBroadcastType] = useState("info");
  const [actionMessage, setActionMessage] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [shopifyConnector, setShopifyConnector] = useState({
    storeUrl: "https://example-store.myshopify.com",
    accessToken: "",
    syncInventory: true,
    syncOrders: true,
  });
  const [shopifyStatus, setShopifyStatus] = useState("No Shopify connection configured.");
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [memberDraft, setMemberDraft] = useState({ email: "", displayName: "", password: "", role: "ASSOCIATE" });
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);

  async function adminPost(path: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Dev-Subdomain": "admin" }, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; token?: string };
    if (!response.ok) throw new Error(payload.error ?? "Admin action failed.");
    setActionMessage(payload.token ? "A short-lived impersonation session was created." : "Admin action completed.");
  }

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(async (response) => response.ok ? (await response.json()) as ApiHealth : null)
      .then(setApiHealth)
      .catch(() => setApiHealth(null));
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/admin/stores`, { headers: { "X-Dev-Subdomain": "admin" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Admin API unavailable");
        return (await response.json()) as { stores: AdminStore[] };
      })
      .then((payload) => { setStores(payload.stores); setMessage("Platform data synced."); })
      .catch(() => setMessage("Admin API unavailable. Configure the admin subdomain and credentials for live data."));
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/admin/integrations`, { headers: { "X-Dev-Subdomain": "admin" } })
      .then(async (response) => (response.ok ? (await response.json()) as { integrations: GlobalIntegration[] } : { integrations: [] }))
      .then((payload) => setIntegrations(payload.integrations))
      .catch(() => setIntegrations([]));
  }, []);

  useEffect(() => {
    if (stores.length === 0) {
      return;
    }
    if (!selectedStoreId) {
      setSelectedStoreId(stores[0].id);
    }
  }, [selectedStoreId, stores]);

  useEffect(() => {
    if (!selectedStoreId) {
      return;
    }

    fetch(`${API_BASE}/stores/${selectedStoreId}/ecommerce`, { headers: { "X-Dev-Subdomain": "admin" } })
      .then(async (response) => {
        if (!response.ok) {
          setShopifyStatus("No Shopify connection configured.");
          return;
        }
        const payload = (await response.json()) as StoreEcommerceConnection[];
        const shopify = payload.find((connection) => connection.platform === "shopify");
        if (!shopify) {
          setShopifyStatus("No Shopify connection configured.");
          setShopifyConnector((current) => ({ ...current, storeUrl: "https://example-store.myshopify.com", accessToken: "" }));
          return;
        }
        setShopifyStatus(`Connected to ${shopify.storeUrl}`);
        setShopifyConnector({
          storeUrl: shopify.storeUrl,
          accessToken: "",
          syncInventory: shopify.syncInventory,
          syncOrders: shopify.syncOrders,
        });
      })
      .catch(() => setShopifyStatus("Shopify connection status unavailable."));
  }, [selectedStoreId]);

  useEffect(() => {
    if (!selectedStoreId) return;
    fetch(`${API_BASE}/admin/stores/${selectedStoreId}/members`, { headers: { "X-Dev-Subdomain": "admin" } })
      .then(async (response) => response.ok ? (await response.json()) as { members: StoreMember[] } : { members: [] })
      .then((payload) => setMembers(payload.members))
      .catch(() => setMembers([]));
  }, [selectedStoreId]);

  async function inviteMember(): Promise<void> {
    if (!selectedStoreId) return;
    try {
      const response = await fetch(`${API_BASE}/admin/stores/${selectedStoreId}/members`, { method: "POST", headers: { "Content-Type": "application/json", "X-Dev-Subdomain": "admin" }, body: JSON.stringify(memberDraft) });
      const payload = (await response.json().catch(() => ({}))) as StoreMember & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Member could not be added.");
      setMembers((current) => [...current, payload]);
      setMemberDraft({ email: "", displayName: "", password: "", role: "ASSOCIATE" });
      setActionMessage("Account added to the selected bookstore.");
    } catch (error) { setActionMessage(error instanceof Error ? error.message : "Member could not be added."); }
  }

  async function updateMember(member: StoreMember, role: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/admin/store-members/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Dev-Subdomain": "admin" }, body: JSON.stringify({ role }) });
      if (!response.ok) throw new Error("Member role could not be changed.");
      const updated = (await response.json()) as StoreMember;
      setMembers((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) { setActionMessage(error instanceof Error ? error.message : "Member role could not be changed."); }
  }

  async function addIntegration(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/admin/integrations`, { method: "POST", headers: { "Content-Type": "application/json", "X-Dev-Subdomain": "admin" }, body: JSON.stringify({ key: integrationKey, name: integrationName, category: integrationCategory }) });
      if (!response.ok) throw new Error("Integration could not be added.");
      const integration = (await response.json()) as GlobalIntegration;
      setIntegrations((current) => [...current, integration].sort((left, right) => left.name.localeCompare(right.name)));
      setIntegrationKey("");
      setIntegrationName("");
      setActionMessage("Integration added to the platform catalog.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Integration could not be added.");
    }
  }

  async function toggleIntegration(integration: GlobalIntegration): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/admin/integrations/${integration.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Dev-Subdomain": "admin" }, body: JSON.stringify({ enabled: !integration.enabled }) });
      if (!response.ok) throw new Error("Integration status could not be changed.");
      setIntegrations((current) => current.map((item) => item.id === integration.id ? { ...item, enabled: !item.enabled } : item));
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Integration status could not be changed.");
    }
  }

  async function saveShopifyConnector(): Promise<void> {
    if (!selectedStoreId) {
      setActionMessage("Select a store before saving a Shopify connection.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stores/${selectedStoreId}/ecommerce/shopify`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Dev-Subdomain": "admin" },
        body: JSON.stringify({
          storeUrl: shopifyConnector.storeUrl,
          config: { accessToken: shopifyConnector.accessToken },
          syncInventory: shopifyConnector.syncInventory,
          syncOrders: shopifyConnector.syncOrders,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Shopify connector could not be saved.");
      }
      setShopifyStatus(`Connected to ${shopifyConnector.storeUrl}`);
      setActionMessage(`Shopify connector saved for ${stores.find((store) => store.id === selectedStoreId)?.storeName ?? "selected store"}.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Shopify connector could not be saved.");
    }
  }

  async function testShopifySync(): Promise<void> {
    if (!selectedStoreId) {
      setActionMessage("Select a store before testing the inventory sync.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stores/${selectedStoreId}/ecommerce/shopify/inventory-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Dev-Subdomain": "admin" },
        body: JSON.stringify({ sku: "BK-9780143127741-USED-GOOD", quantity: 4 }),
      });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Inventory sync test failed.");
      }
      setActionMessage(payload.message ?? "Inventory sync test succeeded.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Inventory sync test failed.");
    }
  }

  const visibleStores = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return stores.filter((store) => !normalized || [store.storeName, store.slug, store.ownerEmail].some((value) => value.toLowerCase().includes(normalized)));
  }, [query, stores]);
  const totalBalance = stores.reduce((sum, store) => sum + store.ledgerBalance, 0);
  const accessPanel = <SurfaceCard className="mt-5 p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Site Access</h2><p className="mt-1 text-sm text-slate-500">Add accounts to a bookstore and control their role.</p></div><select value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Select a bookstore</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.storeName}</option>)}</select></div><div className="mt-4 grid gap-2 lg:grid-cols-[1fr_1fr_1fr_140px_auto]"><input value={memberDraft.displayName} onChange={(event) => setMemberDraft((current) => ({ ...current, displayName: event.target.value }))} placeholder="Name" aria-label="New member name" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" /><input value={memberDraft.email} onChange={(event) => setMemberDraft((current) => ({ ...current, email: event.target.value }))} placeholder="Email" aria-label="New member email" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" /><input type="password" value={memberDraft.password} onChange={(event) => setMemberDraft((current) => ({ ...current, password: event.target.value }))} placeholder="Temporary password" aria-label="New member password" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" /><select value={memberDraft.role} onChange={(event) => setMemberDraft((current) => ({ ...current, role: event.target.value }))} aria-label="New member role" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="CASHIER">Cashier</option><option value="VIEWER">Viewer</option><option value="MANAGER">Manager</option><option value="ADMIN">Admin</option></select><button type="button" onClick={() => void inviteMember()} className="h-10 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-white">Add account</button></div><div className="mt-4 grid gap-2">{members.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><div><p className="text-sm font-semibold text-slate-700">{member.displayName}</p><p className="text-xs text-slate-500">{member.email} · {member.isActive ? "Active" : "Inactive"}</p></div><select value={member.role} onChange={(event) => void updateMember(member, event.target.value)} aria-label={`Role for ${member.displayName}`} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="CASHIER">Cashier</option><option value="VIEWER">Viewer</option><option value="MANAGER">Manager</option><option value="ADMIN">Admin</option></select></div>)}</div></SurfaceCard>;
  const deploymentPanel = <SurfaceCard className="mt-5 p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Deployment Status</h2><p className="mt-1 text-sm text-slate-500">Live service information from the deployed ERP.</p></div><span className={apiHealth?.status === "ok" ? "rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700" : "rounded-full bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700"}>{apiHealth?.status === "ok" ? "API online" : "API unavailable"}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-slate-500">API</p><a href="https://colophon-api.onrender.com" target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky-700">colophon-api.onrender.com</a></div><div><p className="text-xs text-slate-500">Client</p><a href={window.location.origin} target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky-700">{window.location.host}</a></div><div><p className="text-xs text-slate-500">Environment</p><p className="text-sm font-semibold text-slate-700">{apiHealth?.environment ?? "Unknown"}</p></div><div><p className="text-xs text-slate-500">Uptime</p><p className="text-sm font-semibold text-slate-700">{apiHealth ? `${Math.floor(apiHealth.uptimeSeconds / 60)}m ${apiHealth.uptimeSeconds % 60}s` : "Unknown"}</p></div></div>{apiHealth?.commit ? <p className="mt-3 text-xs text-slate-500">API commit: {apiHealth.commit}</p> : null}<div className="mt-3 flex flex-wrap gap-2"><a href="https://dashboard.render.com" target="_blank" rel="noreferrer" className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white">Open Render</a><a href="https://github.com/ghostlight-books/colophon-ERP" target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Open GitHub</a></div></SurfaceCard>;

  return (
    <main className="min-h-screen bg-[#f1f1f3] p-3 text-slate-800 md:p-5">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1500px] overflow-hidden rounded-[32px] border border-white/80 bg-[linear-gradient(145deg,#ececef_0%,#dfe0e3_100%)] shadow-[0_20px_50px_rgba(60,70,86,0.16)]">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-white/70 bg-white/28 p-4 backdrop-blur-xl md:flex">
          <div className="flex items-center gap-2.5 px-2 py-2"><div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-100 text-rose-600"><Database size={20} /></div><div><p className="text-sm font-semibold text-slate-700">Colophon</p><p className="text-[11px] text-slate-500">Control Plane</p></div></div>
          <div className="my-4 h-px bg-white/80" />
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Manage</p>
          <nav className="mt-3 flex flex-1 flex-col gap-2">
            {adminSections.map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setActiveSection(key)} className={["flex items-center gap-3 rounded-full px-3 py-2.5 text-left text-sm font-semibold transition", activeSection === key ? "bg-[#e9ff63] text-slate-800" : "bg-white/40 text-slate-600 hover:bg-white/75"].join(" ")}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></button>)}
          </nav>
          <div className="rounded-2xl bg-white/50 p-3 text-xs text-slate-600"><p className="font-semibold text-slate-700">Admin access</p><p className="mt-1">Protected platform controls</p></div>
        </aside>
        <div className="min-w-0 flex-1 p-4 md:p-7">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/80 pb-6">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">Colophon Control Plane</p><h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-700">Admin Portal</h1><p className="mt-2 text-sm text-slate-500">Platform operations, bookstore tenants, and network settlement oversight.</p></div>
          <span className="rounded-full bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">Super-admin surface</span>
        </header>
        <p className="mt-4 rounded-xl bg-white/60 px-4 py-3 text-sm text-slate-600">{message}</p>
        {activeSection === "access" ? accessPanel : null}
        {activeSection === "overview" ? deploymentPanel : null}
        <section className={activeSection === "overview" ? "mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" : "hidden"}>
          {[["Bookstores", stores.length], ["Active tenants", stores.length], ["Network balance", `$${totalBalance.toFixed(2)}`], ["System status", "Operational"]].map(([label, value]) => <SurfaceCard key={String(label)} className="p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-800">{value}</p></SurfaceCard>)}
        </section>
        <div className={activeSection === "stores" ? "mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]" : "hidden"}>
          <SurfaceCard className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Bookstores</h2><p className="mt-1 text-sm text-slate-500">Tenant accounts registered on the platform.</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search stores" aria-label="Search stores" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400" /></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Store</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Subdomain</th><th className="px-3 py-2">Subscription</th><th className="px-3 py-2">Actions</th></tr></thead><tbody>{visibleStores.map((store) => <tr key={store.id} className="bg-slate-50"><td className="rounded-l-xl px-3 py-3 font-semibold">{store.storeName}</td><td className="px-3 py-3">{store.ownerEmail}</td><td className="px-3 py-3 text-sky-700">{store.slug}.yourdomain.com</td><td className="px-3 py-3"><select value={store.subscriptionStatus} onChange={(event) => void adminPost("/admin/stores/update-subscription", { storeId: store.id, status: event.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"><option value="trial">Trial</option><option value="active">Active</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option></select></td><td className="rounded-r-xl px-3 py-3"><button type="button" onClick={() => void adminPost("/admin/stores/impersonate", { storeId: store.id })} className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white">Log in as store</button></td></tr>)}</tbody></table>{visibleStores.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No registered bookstores yet.</p> : null}</div></SurfaceCard>
          <div className="grid gap-5"><SurfaceCard className="p-5"><h2 className="text-xl font-semibold">System Health</h2><div className="mt-4 space-y-3">{[["API", "Operational", "bg-emerald-500"], ["Database", "Connected", "bg-emerald-500"], ["Network sync", "Ready", "bg-emerald-500"], ["Background jobs", "No queue", "bg-slate-400"]].map(([label, value, color]) => <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm"><span>{label}</span><span className="flex items-center gap-2 text-slate-500"><i className={`h-2.5 w-2.5 rounded-full ${color}`} />{value}</span></div>)}</div></SurfaceCard><SurfaceCard className="p-5"><h2 className="text-xl font-semibold">Admin Actions</h2><div className="mt-4 grid gap-2"><button type="button" className="rounded-xl bg-slate-900 px-3 py-2.5 text-left text-sm font-semibold text-white">Review ledger adjustments</button><button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-600">Inspect failed syncs</button><button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-600">Manage platform settings</button></div></SurfaceCard></div>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2"><SurfaceCard className="p-5"><h2 className="text-xl font-semibold">Global Broadcast</h2><p className="mt-1 text-sm text-slate-500">Publish a banner to active tenant dashboards.</p><div className="mt-4 grid gap-3"><select value={broadcastType} onChange={(event) => setBroadcastType(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="info">Information</option><option value="warning">Warning</option><option value="maintenance">Maintenance</option></select><textarea value={broadcast} onChange={(event) => setBroadcast(event.target.value)} placeholder="Write a platform message" className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" /><button type="button" onClick={() => void adminPost("/admin/system/broadcast", { message: broadcast, bannerType: broadcastType })} className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white">Publish broadcast</button></div></SurfaceCard><SurfaceCard className="p-5"><h2 className="text-xl font-semibold">Network Disputes</h2><p className="mt-1 text-sm text-slate-500">Arbitrate a dispute after reviewing the order evidence.</p><div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">No open disputes currently require action.</div><p className="mt-3 text-xs text-slate-500">Resolved disputes create balanced buyer and seller ledger entries.</p></SurfaceCard></div>
        <SurfaceCard className="mt-5 p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Site-wide Integrations</h2><p className="mt-1 text-sm text-slate-500">Enable integration definitions across tenant ERPs. Store credentials remain store-specific.</p></div><div className="flex flex-wrap gap-2"><input value={integrationKey} onChange={(event) => setIntegrationKey(event.target.value)} placeholder="key" aria-label="Integration key" className="h-9 w-28 rounded-lg border border-slate-200 bg-white px-2 text-sm" /><input value={integrationName} onChange={(event) => setIntegrationName(event.target.value)} placeholder="Integration name" aria-label="Integration name" className="h-9 w-40 rounded-lg border border-slate-200 bg-white px-2 text-sm" /><input value={integrationCategory} onChange={(event) => setIntegrationCategory(event.target.value)} placeholder="Category" aria-label="Integration category" className="h-9 w-28 rounded-lg border border-slate-200 bg-white px-2 text-sm" /><button type="button" onClick={() => void addIntegration()} className="h-9 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white">Add</button></div></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{integrations.map((integration) => <div key={integration.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5"><div><p className="text-sm font-semibold text-slate-700">{integration.name}</p><p className="text-xs text-slate-500">{integration.category} · {integration.enabled ? "Enabled for tenants" : "Available to enable"}</p></div><button type="button" onClick={() => void toggleIntegration(integration)} className={["rounded-lg px-2.5 py-1.5 text-xs font-semibold", integration.enabled ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-600"].join(" ")}>{integration.enabled ? "Enabled" : "Enable"}</button></div>)}</div></SurfaceCard>
        <SurfaceCard className="mt-5 p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Shopify Connector</h2><p className="mt-1 text-sm text-slate-500">Configure a store-specific connection and test inventory sync for the local ERP.</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">{shopifyStatus}</span></div></div><div className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr_1fr]"> <label className="grid gap-1 text-sm text-slate-600">Store<select value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Select a store</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.storeName}</option>)}</select></label><label className="grid gap-1 text-sm text-slate-600">Shopify URL<input value={shopifyConnector.storeUrl} onChange={(event) => setShopifyConnector((current) => ({ ...current, storeUrl: event.target.value }))} placeholder="https://your-store.myshopify.com" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" /></label><label className="grid gap-1 text-sm text-slate-600">Access token<input type="password" value={shopifyConnector.accessToken} onChange={(event) => setShopifyConnector((current) => ({ ...current, accessToken: event.target.value }))} placeholder="Shopify admin token" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" /></label></div><div className="mt-3 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm text-slate-600"><input checked={shopifyConnector.syncInventory} onChange={(event) => setShopifyConnector((current) => ({ ...current, syncInventory: event.target.checked }))} type="checkbox" />Inventory sync</label><label className="flex items-center gap-2 text-sm text-slate-600"><input checked={shopifyConnector.syncOrders} onChange={(event) => setShopifyConnector((current) => ({ ...current, syncOrders: event.target.checked }))} type="checkbox" />Order sync</label><button type="button" onClick={() => void saveShopifyConnector()} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Save connector</button><button type="button" onClick={() => void testShopifySync()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Test inventory sync</button></div></SurfaceCard>
        {actionMessage ? <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{actionMessage}</p> : null}
        </div>
      </div>
    </main>
  );
}

export default AdminPage;
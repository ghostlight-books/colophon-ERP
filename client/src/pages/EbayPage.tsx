import { useEffect, useState, useMemo } from "react";
import SurfaceCard from "../components/ui/SurfaceCard";
import type {
  EbayListingSummary,
  EbayOpportunitySummary,
  EbayListingRuleConfig,
  EbaySyncLogEntry,
  EbayStoreConfigSummary,
} from "@colophon/shared";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

type ActiveTab = "opportunities" | "listings" | "rules" | "settings" | "logs";

export default function EbayPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<ActiveTab>("opportunities");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Data States
  const [config, setConfig] = useState<EbayStoreConfigSummary | null>(null);
  const [opportunities, setOpportunities] = useState<EbayOpportunitySummary[]>([]);
  const [listings, setListings] = useState<EbayListingSummary[]>([]);
  const [rules, setRules] = useState<EbayListingRuleConfig[]>([]);
  const [logs, setLogs] = useState<EbaySyncLogEntry[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);
  const [scanning, setScanning] = useState(false);
  const [publishingIsbn, setPublishingIsbn] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<any | null>(null);

  // New/Edit Rule Modal State
  const [editingRule, setEditingRule] = useState<Partial<EbayListingRuleConfig> | null>(null);

  // Load configuration and status
  async function loadConfig() {
    try {
      const res = await fetch(`${API_BASE}/ebay/status`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.warn("Could not load eBay config:", err);
    }
  }

  // Load data depending on active tab
  async function loadTabData() {
    setLoading(true);
    try {
      if (activeTab === "opportunities") {
        const res = await fetch(`${API_BASE}/ebay/opportunities`);
        if (res.ok) {
          const data = await res.json();
          setOpportunities(data.opportunities || []);
        }
      } else if (activeTab === "listings") {
        const res = await fetch(`${API_BASE}/ebay/listings`);
        if (res.ok) {
          const data = await res.json();
          setListings(data.listings || []);
        }
      } else if (activeTab === "rules") {
        const res = await fetch(`${API_BASE}/ebay/rules`);
        if (res.ok) {
          const data = await res.json();
          setRules(data.rules || []);
        }
      } else if (activeTab === "logs") {
        const res = await fetch(`${API_BASE}/ebay/logs`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    loadTabData();
  }, [activeTab]);

  // Actions
  async function handleScanMarket(force = true) {
    setScanning(true);
    setMessage({ text: "Scanning active catalog against live eBay Browse market...", type: "info" });
    try {
      const res = await fetch(`${API_BASE}/ebay/opportunities/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage({
          text: `Opportunity Scan Complete: Evaluated ${data.scannedCount} items with updated pricing metrics.`,
          type: "success",
        });
        loadTabData();
      } else {
        throw new Error("Failed to scan market.");
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setScanning(false);
    }
  }

  async function handlePublishToEbay(isbn: string, priceOverride?: number) {
    setPublishingIsbn(isbn);
    try {
      const res = await fetch(`${API_BASE}/ebay/publish/${encodeURIComponent(isbn)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceOverride }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Publish failed");
      setMessage({ text: `Successfully published to eBay! Item ID: ${data.listingId}`, type: "success" });
      loadTabData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setPublishingIsbn(null);
    }
  }

  async function handleDelistFromEbay(isbn: string) {
    if (!window.confirm("Are you sure you want to end/delist this item from eBay?")) return;
    try {
      const res = await fetch(`${API_BASE}/ebay/delist/${encodeURIComponent(isbn)}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delist failed");
      setMessage({ text: "Listing withdrawn from eBay.", type: "success" });
      loadTabData();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  }

  async function handleConnectOAuth() {
    try {
      const res = await fetch(`${API_BASE}/auth/ebay/install?environment=${config?.environment || "sandbox"}`);
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setMessage({ text: "Could not initiate OAuth authorization: " + err.message, type: "error" });
    }
  }

  async function handleSaveConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      environment: formData.get("environment"),
      appId: formData.get("appId"),
      certId: formData.get("certId"),
      ruName: formData.get("ruName"),
      fulfillmentPolicyId: formData.get("fulfillmentPolicyId"),
      paymentPolicyId: formData.get("paymentPolicyId"),
      returnPolicyId: formData.get("returnPolicyId"),
      highValueFulfillmentPolicyId: formData.get("highValueFulfillmentPolicyId"),
      highValueThreshold: parseFloat(formData.get("highValueThreshold") as string) || 250,
      syncEnabled: formData.get("syncEnabled") === "on",
      autoPublishEnabled: formData.get("autoPublishEnabled") === "on",
    };

    try {
      const res = await fetch(`${API_BASE}/ebay/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setMessage({ text: "eBay configuration and business policies saved.", type: "success" });
        loadConfig();
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  }

  async function handleRunRuleEvaluation(dryRun: boolean) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ebay/rules/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      setDryRunResult(data);
      if (!dryRun) {
        setMessage({
          text: `Rule Evaluation Complete: Matched ${data.matchedCount}, Published ${data.publishedCount} items to eBay.`,
          type: "success",
        });
        loadTabData();
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRule(rule: Partial<EbayListingRuleConfig>) {
    try {
      const res = await fetch(`${API_BASE}/ebay/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (res.ok) {
        setEditingRule(null);
        setMessage({ text: "Listing rule saved.", type: "success" });
        loadTabData();
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  }

  async function handleDeleteRule(id: string) {
    if (!window.confirm("Delete this rule?")) return;
    try {
      await fetch(`${API_BASE}/ebay/rules/${id}`, { method: "DELETE" });
      loadTabData();
    } catch (err: any) {
      console.error(err);
    }
  }

  // Filtered Opportunities
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opp) => {
      if (opp.opportunityScore < minScoreFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        opp.title?.toLowerCase().includes(q) ||
        opp.author?.toLowerCase().includes(q) ||
        opp.isbn.includes(q) ||
        opp.sku.toLowerCase().includes(q)
      );
    });
  }, [opportunities, minScoreFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <SurfaceCard className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 font-black text-xl tracking-tighter">
              eb<span className="text-blue-500">a</span><span className="text-emerald-500">y</span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">eBay Marketplace Hub</h1>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    config?.connected
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {config?.connected ? `Connected (${config.environment})` : "Setup Required"}
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  Rate Limit: {config?.dailyRateLimitRemaining ?? 5000}/{config?.dailyRateLimitLimit ?? 5000} calls
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Two-way catalog sync, criteria-based automated publishing, opportunity scoring, and single-copy concurrency protection.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => handleScanMarket(true)}
              disabled={scanning}
              className="inline-flex items-center rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {scanning ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Scanning Live Market...
                </>
              ) : (
                <>
                  <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Scan Market Opportunities
                </>
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex border-b border-slate-200 gap-6 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab("opportunities")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "opportunities"
                ? "border-amber-600 text-amber-600 font-semibold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Recommended Opportunities ({opportunities.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("listings")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "listings"
                ? "border-amber-600 text-amber-600 font-semibold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Active & Synced Listings ({listings.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rules")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "rules"
                ? "border-amber-600 text-amber-600 font-semibold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Automated Push Rules ({rules.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "settings"
                ? "border-amber-600 text-amber-600 font-semibold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Policies & OAuth
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("logs")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "logs"
                ? "border-amber-600 text-amber-600 font-semibold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            Audit & Sync Logs
          </button>
        </div>
      </SurfaceCard>

      {/* Status Messages */}
      {message && (
        <div
          className={`flex items-center justify-between rounded-xl px-4 py-3 text-xs font-medium shadow-sm ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : message.type === "error"
              ? "bg-rose-50 text-rose-800 border border-rose-200"
              : "bg-blue-50 text-blue-800 border border-blue-200"
          }`}
        >
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="ml-3 font-bold opacity-75 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Tab 1: Recommended Opportunities */}
      {activeTab === "opportunities" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search recommended titles, authors, or ISBNs..."
                className="w-80 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm focus:border-amber-500 focus:outline-none"
              />
              <select
                value={minScoreFilter}
                onChange={(e) => setMinScoreFilter(Number(e.target.value))}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm focus:border-amber-500 focus:outline-none"
              >
                <option value={0}>All Scores (0+)</option>
                <option value={50}>Good Opportunity (50+)</option>
                <option value={70}>High Opportunity (70+)</option>
                <option value={85}>Prime Arbitrage (85+)</option>
              </select>
            </div>
            <div className="text-xs text-slate-500">
              Showing {filteredOpportunities.length} opportunities
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-700">
                <tr>
                  <th className="px-4 py-3">Book & Details</th>
                  <th className="px-3 py-3">In-Store Price</th>
                  <th className="px-3 py-3">eBay Median</th>
                  <th className="px-3 py-3">Est. Net Profit</th>
                  <th className="px-3 py-3">Competitors</th>
                  <th className="px-3 py-3">Opportunity Score</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOpportunities.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No recommendations found. Try running "Scan Market Opportunities" above!
                    </td>
                  </tr>
                ) : (
                  filteredOpportunities.map((opp) => (
                    <tr key={opp.isbn} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-3">
                          <img
                            src={opp.coverUrl || "https://covers.openlibrary.org/b/isbn/" + opp.isbn + "-M.jpg"}
                            alt=""
                            className="h-12 w-9 rounded-md object-cover bg-slate-100 border border-slate-200"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <div>
                            <a
                              href={`/inventory/product/${opp.isbn}`}
                              className="font-semibold text-slate-900 hover:text-amber-600 transition"
                            >
                              {opp.title || "Untitled Book"}
                            </a>
                            <div className="text-slate-500">{opp.author || "Unknown"}</div>
                            <div className="text-[11px] font-mono text-slate-400">ISBN: {opp.isbn}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700">
                        ${opp.localPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        {opp.marketMedianPrice ? `$${opp.marketMedianPrice.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-3 font-semibold text-emerald-700">
                        {opp.estimatedNetMargin && opp.estimatedNetMargin > 0
                          ? `+$${opp.estimatedNetMargin.toFixed(2)}`
                          : opp.estimatedNetMargin ? `$${opp.estimatedNetMargin.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${
                            opp.competitorCount <= 2
                              ? "bg-emerald-100 text-emerald-800"
                              : opp.competitorCount <= 6
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {opp.competitorCount === 0 ? "0 (Sole Seller)" : `${opp.competitorCount} active`}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                opp.opportunityScore >= 80
                                  ? "bg-emerald-500"
                                  : opp.opportunityScore >= 50
                                  ? "bg-amber-500"
                                  : "bg-slate-400"
                              }`}
                              style={{ width: `${opp.opportunityScore}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-800">{opp.opportunityScore}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {opp.listingStatus === "ACTIVE" ? (
                          <span className="inline-flex rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                            Active on eBay
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handlePublishToEbay(opp.isbn, opp.suggestedPrice || opp.localPrice)}
                            disabled={publishingIsbn === opp.isbn}
                            className="inline-flex items-center rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 disabled:opacity-50 transition"
                          >
                            {publishingIsbn === opp.isbn ? "Publishing..." : "Publish to eBay"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Active & Synced Listings */}
      {activeTab === "listings" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 font-semibold text-slate-700">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-3 py-3">eBay Item ID</th>
                <th className="px-3 py-3">Listing Status</th>
                <th className="px-3 py-3">Listed Price</th>
                <th className="px-3 py-3">Stock On-Hand</th>
                <th className="px-3 py-3">Last Synced</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No active eBay listings found.
                  </td>
                </tr>
              ) : (
                listings.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{l.title || l.sku}</div>
                      <div className="text-slate-400 font-mono text-[11px]">SKU: {l.sku} • ISBN: {l.isbn}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-slate-600">
                      {l.ebayItemId ? (
                        <a
                          href={l.ebayUrl || `https://www.ebay.com/itm/${l.ebayItemId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 underline font-medium"
                        >
                          {l.ebayItemId} ↗
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          l.listingStatus === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : l.listingStatus === "SOLD"
                            ? "bg-blue-100 text-blue-800"
                            : l.listingStatus === "ERROR"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {l.listingStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-800">
                      ${l.price.toFixed(2)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
                          (l.quantityOnHand ?? 0) > 0 ? "bg-slate-100 text-slate-800" : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {l.quantityOnHand ?? 0} units
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {l.lastSyncedAt ? new Date(l.lastSyncedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {l.listingStatus === "ACTIVE" ? (
                        <button
                          type="button"
                          onClick={() => handleDelistFromEbay(l.isbn)}
                          className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                        >
                          Withdraw
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePublishToEbay(l.isbn, l.price)}
                          className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-200 transition"
                        >
                          Re-list
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Automated Push Rules */}
      {activeTab === "rules" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Criteria-Based Automated Listing Rules</h2>
              <p className="text-xs text-slate-500">
                Define criteria (minimum price thresholds, aging triggers, signed/first edition filters) for automated marketplace exports.
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => handleRunRuleEvaluation(true)}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
              >
                Dry Run Rule Matcher
              </button>
              <button
                type="button"
                onClick={() => setEditingRule({ name: "High-Value Vintage Rule", enabled: true, minPrice: 40, mustHaveCoverImage: true, autoPublish: false })}
                className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
              >
                + New Push Rule
              </button>
            </div>
          </div>

          {dryRunResult && (
            <SurfaceCard className="p-4 bg-amber-50/60 border border-amber-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-amber-900 text-xs">Dry Run Validation Summary</h3>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Evaluated {dryRunResult.totalEvaluated} catalog items. {dryRunResult.matchedCount} items matched your active criteria.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDryRunResult(null)}
                  className="text-amber-700 font-bold text-xs hover:text-amber-900"
                >
                  Close
                </button>
              </div>
            </SurfaceCard>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <SurfaceCard key={rule.id} className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">{rule.name}</h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      rule.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {rule.enabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  {rule.minPrice && <div>• Min Price: <strong>${rule.minPrice.toFixed(2)}</strong></div>}
                  {rule.minDaysInInventory && <div>• Min Age in Store: <strong>{rule.minDaysInInventory} days</strong></div>}
                  {rule.requiredCondition && <div>• Allowed Conditions: <strong>{rule.requiredCondition}</strong></div>}
                  {rule.onlyFirstEditionOrSigned && <div>• Filter: <strong>Signed or 1st Editions Only</strong></div>}
                  <div>• Auto-Publish Live: <strong>{rule.autoPublish ? "Yes" : "No (Drafts/Review)"}</strong></div>
                </div>
                <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingRule(rule)}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Edit Rule
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(rule.id)}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800"
                  >
                    Delete
                  </button>
                </div>
              </SurfaceCard>
            ))}
          </div>

          {/* Edit Rule Modal */}
          {editingRule && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
                <h3 className="text-base font-bold text-slate-900">
                  {editingRule.id ? "Edit Listing Rule" : "Create New Listing Rule"}
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700">Rule Name</label>
                    <input
                      type="text"
                      value={editingRule.name || ""}
                      onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 p-2"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700">Min Price ($)</label>
                      <input
                        type="number"
                        value={editingRule.minPrice || ""}
                        onChange={(e) => setEditingRule({ ...editingRule, minPrice: parseFloat(e.target.value) || null })}
                        className="mt-1 w-full rounded-xl border border-slate-200 p-2"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Min Days in Inventory</label>
                      <input
                        type="number"
                        value={editingRule.minDaysInInventory || ""}
                        onChange={(e) => setEditingRule({ ...editingRule, minDaysInInventory: parseInt(e.target.value, 10) || null })}
                        className="mt-1 w-full rounded-xl border border-slate-200 p-2"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Allowed Conditions (comma-separated)</label>
                    <input
                      type="text"
                      value={editingRule.requiredCondition || ""}
                      onChange={(e) => setEditingRule({ ...editingRule, requiredCondition: e.target.value })}
                      placeholder="e.g. Fine, Near Fine, Very Good, Like New"
                      className="mt-1 w-full rounded-xl border border-slate-200 p-2"
                    />
                  </div>
                  <div className="flex items-center space-x-4 pt-2">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={editingRule.onlyFirstEditionOrSigned ?? false}
                        onChange={(e) => setEditingRule({ ...editingRule, onlyFirstEditionOrSigned: e.target.checked })}
                      />
                      <span>Signed or 1st Edition Only</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={editingRule.autoPublish ?? false}
                        onChange={(e) => setEditingRule({ ...editingRule, autoPublish: e.target.checked })}
                      />
                      <span>Auto-Publish Immediately</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingRule(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveRule(editingRule)}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Save Rule
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Policies & OAuth Settings */}
      {activeTab === "settings" && (
        <form onSubmit={handleSaveConfig} className="space-y-6">
          <SurfaceCard className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">eBay OAuth 2.0 Account Connection</h2>
            <p className="text-xs text-slate-500">
              Authenticate your bookstore's eBay seller account with PKCE User Access Tokens and automatic refresh rotation.
            </p>

            <div className="flex items-center space-x-4">
              <button
                type="button"
                onClick={handleConnectOAuth}
                className="inline-flex items-center rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-500 transition"
              >
                {config?.connected ? "Re-Authorize eBay Account (1-Click)" : "Connect eBay Account (1-Click)"}
              </button>
              <span className="text-xs text-slate-500">
                {config?.connected ? "Token active & auto-refreshing" : "Not connected"}
              </span>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">API Credentials & Environment</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Environment</label>
                <select
                  name="environment"
                  defaultValue={config?.environment || "sandbox"}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                >
                  <option value="sandbox">Sandbox (Testing / Mock)</option>
                  <option value="production">Production (Live eBay Marketplace)</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">eBay App ID (Client ID)</label>
                <input
                  type="text"
                  name="appId"
                  defaultValue={config?.appId || ""}
                  placeholder="App ID from eBay Developer Portal"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">eBay Cert ID (Client Secret)</label>
                <input
                  type="password"
                  name="certId"
                  placeholder="Cert ID / Secret from Developer Portal"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">eBay RuName (Redirect URI)</label>
                <input
                  type="text"
                  name="ruName"
                  defaultValue={config?.ruName || ""}
                  placeholder="Your eBay RuName"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                />
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Merchant Business Policies & High-Value Routing</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Default Fulfillment Policy ID</label>
                <input
                  type="text"
                  name="fulfillmentPolicyId"
                  defaultValue={config?.fulfillmentPolicyId || ""}
                  placeholder="e.g. 5240212000"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Default Payment Policy ID</label>
                <input
                  type="text"
                  name="paymentPolicyId"
                  defaultValue={config?.paymentPolicyId || ""}
                  placeholder="e.g. 5240213000"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Default Return Policy ID</label>
                <input
                  type="text"
                  name="returnPolicyId"
                  defaultValue={config?.returnPolicyId || ""}
                  placeholder="e.g. 5240214000"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2 border-t border-slate-100">
              <div>
                <label className="font-semibold text-slate-700">High-Value Shipping Policy ID (Expedited/Signature)</label>
                <input
                  type="text"
                  name="highValueFulfillmentPolicyId"
                  defaultValue={config?.highValueFulfillmentPolicyId || ""}
                  placeholder="e.g. 5240299000 (Priority + Signature)"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">High-Value Price Threshold ($)</label>
                <input
                  type="number"
                  name="highValueThreshold"
                  defaultValue={config?.highValueThreshold ?? 250}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition"
              >
                Save Settings & Policies
              </button>
            </div>
          </SurfaceCard>
        </form>
      )}

      {/* Tab 5: Audit & Sync Logs */}
      {activeTab === "logs" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 font-semibold text-slate-700">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-3 py-3">Direction</th>
                <th className="px-3 py-3">Event Type</th>
                <th className="px-3 py-3">ISBN / SKU</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No sync logs recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-[11px] font-semibold text-slate-700">
                        {log.direction}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-900">{log.eventType}</td>
                    <td className="px-3 py-3 font-mono text-slate-600">{log.isbn || log.sku || "—"}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          log.status === "SUCCESS"
                            ? "bg-emerald-100 text-emerald-800"
                            : log.status === "FAILURE"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500 max-w-xs truncate">
                      {log.errorMessage || log.response || log.payload || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { useSyncStatus, type SyncRefreshResult } from "../../services/syncStatus.service";

interface SyncStatusIndicatorProps {
  className?: string;
  showDetailsByDefault?: boolean;
}

export default function SyncStatusIndicator({ className = "", showDetailsByDefault = false }: SyncStatusIndicatorProps): JSX.Element {
  const { status, loading, lastRefreshed, refreshNow } = useSyncStatus(12000);
  const [expanded, setExpanded] = useState(showDetailsByDefault);
  const [refreshFeedback, setRefreshFeedback] = useState<string | null>(null);
  const [refreshingService, setRefreshingService] = useState<string | null>(null);

  const overall = status?.overall ?? "green";
  const services = status?.services;

  // Relative time helper
  const secondsAgo = Math.max(0, Math.floor((Date.now() - lastRefreshed.getTime()) / 1000));
  const timeLabel = secondsAgo < 5 ? "just now" : `${secondsAgo}s ago`;

  const totalServices = services ? Object.keys(services).length : 5;
  const activeCount = services
    ? Object.values(services).filter((s) => s.status === "green").length
    : 4;

  const isDegradedOrInactive = overall !== "green" || (services && Object.values(services).some((s) => s.status !== "green"));

  const dotColor =
    overall === "green"
      ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]"
      : overall === "yellow"
        ? "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.7)]"
        : "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]";

  const ringColor =
    overall === "green"
      ? "border-emerald-300/80"
      : overall === "yellow"
        ? "border-amber-300/80"
        : "border-rose-300/80";

  const handleRefreshClick = async (targetService?: string) => {
    if (targetService) setRefreshingService(targetService);
    try {
      const result: SyncRefreshResult = await refreshNow(targetService);
      if (result.reconnected && result.reconnected.length > 0) {
        setRefreshFeedback(`✓ Reconnected: ${result.reconnected.join(", ")}`);
      } else if (result.errors && result.errors.length > 0) {
        setRefreshFeedback(`⚠️ ${result.errors[0]}`);
      } else {
        setRefreshFeedback("✓ Connection check completed");
      }
      setTimeout(() => setRefreshFeedback(null), 4000);
    } finally {
      setRefreshingService(null);
    }
  };

  return (
    <div className={["relative inline-block text-left", expanded ? "z-50" : "z-10", className].join(" ")}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Main Sync Status Badge Button */}
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className={[
            "group flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-sm transition backdrop-blur-md",
            overall === "green"
              ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-900 hover:bg-emerald-100/90"
              : overall === "yellow"
                ? "border-amber-200/80 bg-amber-50/90 text-amber-900 hover:bg-amber-100/90"
                : "border-rose-200/80 bg-rose-50/90 text-rose-900 hover:bg-rose-100/90",
          ].join(" ")}
          title="Click to view live sync engine details"
        >
          {/* Live pulsing LED indicator */}
          <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span
              className={[
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                overall === "green" ? "bg-emerald-400" : overall === "yellow" ? "bg-amber-400" : "bg-rose-400",
              ].join(" ")}
            />
            <span className={["relative inline-flex h-2 w-2 rounded-full", dotColor].join(" ")} />
          </span>

          <span className="font-bold tracking-tight">
            {loading ? "Syncing..." : overall === "green" ? "Live Sync Active" : "Sync Attention"}
          </span>

          <span
            className={[
              "rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase",
              ringColor,
              overall === "green"
                ? "bg-white/80 text-emerald-800"
                : overall === "yellow"
                  ? "bg-white/80 text-amber-800"
                  : "bg-white/80 text-rose-800",
            ].join(" ")}
          >
            {activeCount}/{totalServices} Active
          </span>

          <span className="text-[11px] font-normal text-slate-400 group-hover:text-slate-600">
            {expanded ? "▴" : "▾"}
          </span>
        </button>

        {/* Dedicated Highlighted "Refresh Connection" button if not fully active */}
        {isDegradedOrInactive ? (
          <button
            type="button"
            onClick={() => void handleRefreshClick()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-[0_2px_8px_rgba(245,158,11,0.35)] transition hover:bg-amber-600 active:scale-95 disabled:opacity-50"
            title="Click to refresh and re-test all inactive connections"
          >
            <span className={["inline-block text-xs transition-transform duration-500", loading ? "animate-spin" : ""].join(" ")}>
              🔄
            </span>
            <span>{loading ? "Reconnecting..." : "Refresh Connection"}</span>
          </button>
        ) : (
          /* Standard Quick Refresh Button */
          <button
            type="button"
            onClick={() => void handleRefreshClick()}
            disabled={loading}
            className="grid h-8 w-8 place-items-center rounded-full border border-slate-200/80 bg-white/90 text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-slate-900 disabled:opacity-50"
            title="Force refresh live sync connections"
            aria-label="Refresh sync status"
          >
            <span className={["inline-block text-xs transition-transform duration-500", loading ? "animate-spin" : ""].join(" ")}>
              🔄
            </span>
          </button>
        )}
      </div>

      {/* Expanded Sync Details Popover with Backdrop */}
      {expanded ? (
        <>
          <div
            className="fixed inset-0 z-[90] bg-slate-900/15 backdrop-blur-[1px]"
            onClick={() => setExpanded(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-[100] mt-2 w-80 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xl backdrop-blur-xl sm:w-96">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">System Sync Engine</p>
                <h4 className="text-sm font-bold text-slate-800">Live Integration & Scraper Status</h4>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-lg p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close sync status popover"
              >
                ✕
              </button>
            </div>

          {/* Feedback banner */}
          {refreshFeedback ? (
            <div className="mt-2.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 border border-sky-200">
              {refreshFeedback}
            </div>
          ) : null}

          <div className="mt-3 space-y-2.5 text-xs">
            {/* 1. Price Scraper Stack */}
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
              <span className="mt-0.5 flex h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Price Scraper Engine</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">ONLINE</span>
                </div>
                <p className="mt-0.5 text-slate-600">
                  {services?.scraper.detail ?? "Multi-tier: ThriftBooks, AbeBooks, Google Books"}
                </p>
                {services?.scraper.cachedCount !== undefined ? (
                  <p className="mt-1 text-[11px] text-slate-500 font-mono">
                    ⚡ {services.scraper.cachedCount} books cached for instant recall
                  </p>
                ) : null}
              </div>
            </div>

            {/* 2. Ecommerce Sync (Shopify) */}
            <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
              <span
                className={[
                  "mt-0.5 flex h-2 w-2 flex-shrink-0 rounded-full",
                  services?.ecommerce.status === "green"
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                    : services?.ecommerce.status === "yellow"
                      ? "bg-amber-500"
                      : "bg-rose-500",
                ].join(" ")}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Shopify Two-Way Sync</span>
                  <span
                    className={[
                      "rounded px-1.5 py-0.5 text-[10px] font-bold",
                      services?.ecommerce.status === "green"
                        ? "bg-emerald-100 text-emerald-800"
                        : services?.ecommerce.status === "yellow"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800",
                    ].join(" ")}
                  >
                    {services?.ecommerce.status === "green" ? "CONNECTED" : services?.ecommerce.status === "yellow" ? "CONFIGURED" : "OFFLINE"}
                  </span>
                </div>
                <p className="mt-0.5 text-slate-600">{services?.ecommerce.detail ?? "Shopify channel sync"}</p>
                <div className="mt-1.5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleRefreshClick("ecommerce")}
                    disabled={loading}
                    className="font-semibold text-sky-600 hover:text-sky-800 hover:underline disabled:opacity-50"
                  >
                    {refreshingService === "ecommerce" ? "Reconnecting..." : "⚡ Reconnect Shopify"}
                  </button>
                  {services?.ecommerce.path ? (
                    <Link to={services.ecommerce.path} className="font-semibold text-slate-500 hover:text-slate-800 hover:underline">
                      Settings →
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>

            {/* 3. eBay Marketplace */}
            <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
              <span
                className={[
                  "mt-0.5 flex h-2 w-2 flex-shrink-0 rounded-full",
                  services?.ebay.status === "green"
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                    : services?.ebay.status === "yellow"
                      ? "bg-amber-500"
                      : "bg-rose-500",
                ].join(" ")}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">eBay Marketplace Hub</span>
                  <span
                    className={[
                      "rounded px-1.5 py-0.5 text-[10px] font-bold",
                      services?.ebay.status === "green"
                        ? "bg-emerald-100 text-emerald-800"
                        : services?.ebay.status === "yellow"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800",
                    ].join(" ")}
                  >
                    {services?.ebay.status === "green" ? "ACTIVE" : services?.ebay.status === "yellow" ? "PENDING" : "OFFLINE"}
                  </span>
                </div>
                <p className="mt-0.5 text-slate-600">{services?.ebay.detail ?? "eBay catalog & inventory publishing"}</p>
                <div className="mt-1.5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleRefreshClick("ebay")}
                    disabled={loading}
                    className="font-semibold text-sky-600 hover:text-sky-800 hover:underline disabled:opacity-50"
                  >
                    {refreshingService === "ebay" ? "Refreshing Token..." : "⚡ Refresh eBay Token"}
                  </button>
                  {services?.ebay.path ? (
                    <Link to={services.ebay.path} className="font-semibold text-slate-500 hover:text-slate-800 hover:underline">
                      eBay Hub →
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>

            {/* 4. USPS Shipping Engine */}
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
              <span className="mt-0.5 flex h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">USPS Shipping Engine</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">ACTIVE</span>
                </div>
                <p className="mt-0.5 text-slate-600">
                  {services?.shipping.detail ?? "Auto-rate active (Media Mail & Ground Advantage)"}
                </p>
              </div>
            </div>

            {/* 5. Scanner Station */}
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
              <span className="mt-0.5 flex h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Barcode & Intake Engine</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">LISTENING</span>
                </div>
                <p className="mt-0.5 text-slate-600">
                  {services?.scanner.detail ?? "USB / Keyboard emulation barcode listener active"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Auto-keepalive active · {timeLabel}
            </span>
            <button
              type="button"
              onClick={() => void handleRefreshClick()}
              disabled={loading}
              className="font-bold text-sky-600 hover:text-sky-800 disabled:opacity-50"
            >
              {loading ? "Refreshing All..." : "Refresh All Connections"}
            </button>
          </div>
        </div>
      </>
      ) : null}
    </div>
  );
}

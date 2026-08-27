import { useEffect, useState, useCallback, useRef } from "react";

export type SyncServiceItem = {
  key: string;
  label: string;
  status: "green" | "yellow" | "red";
  detail: string;
  storeUrl?: string;
  listingsCount?: number;
  cachedCount?: number;
  activeProviders?: string[];
  path?: string;
};

export type SyncStatusResponse = {
  active: boolean;
  overall: "green" | "yellow" | "red";
  timestamp: string;
  services: {
    scraper: SyncServiceItem;
    ecommerce: SyncServiceItem;
    ebay: SyncServiceItem;
    shipping: SyncServiceItem;
    scanner: SyncServiceItem;
  };
};

const rawApiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const API_BASE = rawApiBase.replace(/\/$/, "").replace(/\/api$/, "");

export async function fetchSyncStatus(storeId = "ghostlight-demo"): Promise<SyncStatusResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/sync/status?storeId=${encodeURIComponent(storeId)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SyncStatusResponse;
  } catch {
    return null;
  }
}

export type SyncRefreshResult = {
  success: boolean;
  reconnected: string[];
  errors: string[];
} & Partial<SyncStatusResponse>;

export async function triggerSyncRefresh(targetService?: string, storeId = "ghostlight-demo"): Promise<SyncRefreshResult> {
  try {
    const res = await fetch(`${API_BASE}/api/sync/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetService, storeId }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { success: false, reconnected: [], errors: ["Refresh request failed"] };
    return (await res.json()) as SyncRefreshResult;
  } catch (err) {
    return {
      success: false,
      reconnected: [],
      errors: [err instanceof Error ? err.message : "Connection timeout"],
    };
  }
}

export function useSyncStatus(pollIntervalMs = 12000) {
  const [status, setStatus] = useState<SyncStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [lastActionResult, setLastActionResult] = useState<SyncRefreshResult | null>(null);
  const isMountedRef = useRef(true);

  const loadStatus = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await fetchSyncStatus();
      if (isMountedRef.current && data) {
        setStatus(data);
        setLastRefreshed(new Date());
      }
    } finally {
      if (isMountedRef.current && showLoading) {
        setLoading(false);
      }
    }
  }, []);

  const refreshNow = useCallback(async (targetService?: string) => {
    setLoading(true);
    const result = await triggerSyncRefresh(targetService);
    if (isMountedRef.current) {
      setLastActionResult(result);
      if (result.services && result.overall) {
        setStatus(result as SyncStatusResponse);
        setLastRefreshed(new Date());
      } else {
        await loadStatus(false);
      }
      setLoading(false);
    }
    return result;
  }, [loadStatus]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadStatus(true);

    const intervalId = window.setInterval(() => {
      void loadStatus(false);
    }, pollIntervalMs);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void loadStatus(false);
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [loadStatus, pollIntervalMs]);

  return {
    status,
    loading,
    lastRefreshed,
    refreshNow,
  };
}


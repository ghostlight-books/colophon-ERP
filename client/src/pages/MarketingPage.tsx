import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  fetchMarketingState,
  publishMarketingPost,
  toggleMarketingConnection,
  type MarketingConnection,
  type MarketingPlatformKey,
  type MarketingPost,
} from "../services/marketing.service";

const PLATFORM_CHARACTER_LIMITS: Record<MarketingPlatformKey, number> = {
  instagram: 2200,
  facebook: 63206,
  x: 280,
  tiktok: 2200,
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
  if (diffHours < 1) {
    return "just now";
  }

  if (diffMs < 0) {
    if (diffHours < 24) {
      return `in ${diffHours}h`;
    }
    return `in ${Math.floor(diffHours / 24)}d`;
  }

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return `${Math.floor(diffHours / 24)}d ago`;
}

function MarketingPage(): JSX.Element {
  const [connections, setConnections] = useState<MarketingConnection[]>([]);
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<MarketingPlatformKey>("instagram");
  const [postMessage, setPostMessage] = useState("");
  const [scheduledForLocal, setScheduledForLocal] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready to post.");

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      setStatusMessage("Loading marketing data...");
      try {
        const data = await fetchMarketingState();
        setConnections(data.connections);
        setPosts(data.posts);
        setStatusMessage("Marketing data synced.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load marketing data.";
        setStatusMessage(message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.key === selectedPlatform) ?? null,
    [connections, selectedPlatform],
  );

  const selectedCharacterLimit = PLATFORM_CHARACTER_LIMITS[selectedPlatform];
  const messageLength = postMessage.trim().length;
  const isOverCharacterLimit = messageLength > selectedCharacterLimit;

  const totalFollowers = useMemo(
    () => connections.filter((connection) => connection.connected).reduce((sum, connection) => sum + connection.followers, 0),
    [connections],
  );

  const totalImpressions = useMemo(
    () => connections.filter((connection) => connection.connected).reduce((sum, connection) => sum + connection.impressions7d, 0),
    [connections],
  );

  const avgEngagement = useMemo(() => {
    const connected = connections.filter((connection) => connection.connected);
    if (connected.length === 0) {
      return 0;
    }

    const sum = connected.reduce((acc, connection) => acc + connection.engagementRate, 0);
    return Number((sum / connected.length).toFixed(1));
  }, [connections]);

  async function refreshState(): Promise<void> {
    try {
      const data = await fetchMarketingState();
      setConnections(data.connections);
      setPosts(data.posts);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed.";
      setStatusMessage(message);
    }
  }

  async function onToggleConnection(connection: MarketingConnection): Promise<void> {
    const nextValue = !connection.connected;
    setConnections((current) =>
      current.map((entry) =>
        entry.key === connection.key
          ? {
              ...entry,
              connected: nextValue,
            }
          : entry,
      ),
    );

    try {
      const updated = await toggleMarketingConnection(connection.key, nextValue);
      setConnections((current) => current.map((entry) => (entry.key === updated.key ? updated : entry)));
      setStatusMessage(`${updated.label} ${updated.connected ? "connected" : "disconnected"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update connection.";
      setStatusMessage(message);
      await refreshState();
    }
  }

  async function onPost(mode: "publish" | "queue" | "schedule"): Promise<void> {
    const message = postMessage.trim();
    if (!message) {
      setStatusMessage("Write a message before posting.");
      return;
    }

    if (message.length > selectedCharacterLimit) {
      setStatusMessage(`Message exceeds ${selectedCharacterLimit} characters for ${selectedPlatform}.`);
      return;
    }

    let scheduledForIso: string | undefined;
    if (mode === "schedule") {
      if (!scheduledForLocal) {
        setStatusMessage("Select a date and time to schedule this post.");
        return;
      }

      const parsed = new Date(scheduledForLocal);
      if (Number.isNaN(parsed.getTime())) {
        setStatusMessage("Scheduled date-time is invalid.");
        return;
      }

      if (parsed.getTime() <= Date.now()) {
        setStatusMessage("Scheduled date-time must be in the future.");
        return;
      }

      scheduledForIso = parsed.toISOString();
    }

    setIsPublishing(true);
    try {
      const data = await publishMarketingPost({
        platform: selectedPlatform,
        message,
        mode,
        scheduledFor: scheduledForIso,
      });

      setConnections(data.connections);
      setPosts(data.posts);
      setPostMessage("");
      setScheduledForLocal("");
      setStatusMessage(mode === "publish" ? "Post published." : mode === "schedule" ? "Post scheduled." : "Post queued.");
    } catch (error) {
      const failMessage = error instanceof Error ? error.message : "Unable to submit post.";
      setStatusMessage(failMessage);
    } finally {
      setIsPublishing(false);
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading marketing workspace...
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Connected Platforms</p>
          <p className="mt-1 text-xl font-semibold text-slate-800">
            {connections.filter((connection) => connection.connected).length}/{connections.length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Followers</p>
          <p className="mt-1 text-xl font-semibold text-slate-800">{formatNumber(totalFollowers)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">7d Impressions</p>
          <p className="mt-1 text-xl font-semibold text-slate-800">{formatNumber(totalImpressions)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Avg Engagement</p>
          <p className="mt-1 text-xl font-semibold text-slate-800">{avgEngagement}%</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Create Social Post</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Marketing Hub</span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {connections.map((connection) => (
              <button
                key={connection.key}
                type="button"
                onClick={() => setSelectedPlatform(connection.key)}
                className={[
                  "rounded-xl border px-3 py-2 text-left transition",
                  selectedPlatform === connection.key
                    ? "border-sky-500 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                <p className="text-xs font-semibold">{connection.label}</p>
                <p className="text-[11px]">{connection.connected ? "Connected" : "Disconnected"}</p>
              </button>
            ))}
          </div>

          <textarea
            value={postMessage}
            onChange={(event) => setPostMessage(event.target.value)}
            placeholder="Write your post copy here..."
            className={[
              "mt-3 min-h-36 w-full rounded-xl border bg-slate-50 p-3 text-sm text-slate-700 outline-none focus:border-sky-400",
              isOverCharacterLimit ? "border-rose-300" : "border-slate-200",
            ].join(" ")}
          />

          <div className="mt-2 flex items-center justify-between text-xs">
            <p className={isOverCharacterLimit ? "font-semibold text-rose-600" : "text-slate-500"}>
              {messageLength}/{selectedCharacterLimit} characters
            </p>
            <p className="text-slate-500">Limit for {selectedConnection?.label ?? selectedPlatform}</p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="grid gap-1 text-xs text-slate-600">
              Schedule date and time
              <input
                type="datetime-local"
                value={scheduledForLocal}
                onChange={(event) => setScheduledForLocal(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                void onPost("schedule");
              }}
              disabled={isPublishing || !selectedConnection?.connected || isOverCharacterLimit}
              className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:text-slate-400"
            >
              Schedule Post
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void onPost("publish");
              }}
              disabled={isPublishing || !selectedConnection?.connected || isOverCharacterLimit}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:bg-slate-300"
            >
              {isPublishing ? "Publishing..." : "Post Now"}
            </button>
            <button
              type="button"
              onClick={() => {
                void onPost("queue");
              }}
              disabled={isPublishing || !selectedConnection?.connected || isOverCharacterLimit}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:text-slate-400"
            >
              Queue Post
            </button>
            <p className="text-xs text-slate-500">{statusMessage}</p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">Social Connections</h3>
            <div className="mt-3 space-y-2">
              {connections.map((connection) => (
                <div key={connection.key} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{connection.label}</p>
                      <p className="text-[11px] text-slate-500">{connection.handle}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void onToggleConnection(connection);
                      }}
                      className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        connection.connected ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600",
                      ].join(" ")}
                    >
                      {connection.connected ? "Connected" : "Connect"}
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                    <div>
                      <p className="text-slate-400">Followers</p>
                      <p className="font-semibold text-slate-700">{formatNumber(connection.followers)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">7d Impr.</p>
                      <p className="font-semibold text-slate-700">{formatNumber(connection.impressions7d)}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Engagement</p>
                      <p className="font-semibold text-slate-700">{connection.engagementRate}%</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-800">Recent Posts</h3>
            <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
              {posts.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">No posts yet.</p>
              ) : (
                posts.map((post) => (
                  <div key={post.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-semibold uppercase tracking-wide">{post.platform}</span>
                      <span>{formatRelativeTime(post.publishedAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">{post.message}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{post.status}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MarketingPage;

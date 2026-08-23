export type MarketingPlatformKey = "instagram" | "facebook" | "x" | "tiktok";

export type MarketingConnection = {
  key: MarketingPlatformKey;
  label: string;
  connected: boolean;
  handle: string;
  followers: number;
  impressions7d: number;
  engagementRate: number;
};

export type MarketingPost = {
  id: string;
  platform: MarketingPlatformKey;
  message: string;
  status: "published" | "queued" | "scheduled";
  publishedAt: string;
  scheduledFor?: string;
};

export type MarketingState = {
  connections: MarketingConnection[];
  posts: MarketingPost[];
};

const rawBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const trimmedBase = rawBase.replace(/\/$/, "");
const apiRoot = trimmedBase.endsWith("/api") ? trimmedBase.slice(0, -4) : trimmedBase;

async function parseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Marketing API request failed (${response.status})`);
  }
  return data;
}

export async function fetchMarketingState(): Promise<MarketingState> {
  const response = await fetch(`${apiRoot}/api/marketing/state`);
  return parseResponse<MarketingState>(response);
}

export async function toggleMarketingConnection(key: MarketingPlatformKey, connected: boolean): Promise<MarketingConnection> {
  const response = await fetch(`${apiRoot}/api/marketing/connections/${key}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ connected }),
  });

  return parseResponse<MarketingConnection>(response);
}

export async function publishMarketingPost(payload: {
  platform: MarketingPlatformKey;
  message: string;
  mode: "publish" | "queue" | "schedule";
  scheduledFor?: string;
}): Promise<MarketingState> {
  const response = await fetch(`${apiRoot}/api/marketing/post`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await parseResponse<{
    post: MarketingPost;
    connections: MarketingConnection[];
    posts: MarketingPost[];
  }>(response);

  return {
    connections: data.connections,
    posts: data.posts,
  };
}

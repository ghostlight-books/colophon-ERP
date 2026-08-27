import { getEbayBaseUrls, getValidEbayAccessToken } from "./ebayAuth.service.js";
import { prisma } from "../../config/database.js";

export interface EbayApiErrorDetail {
  errorId?: number;
  domain?: string;
  category?: string;
  message?: string;
  longMessage?: string;
  parameter?: Array<{ name?: string; value?: string }>;
}

export interface EbayApiResponseError {
  errors?: EbayApiErrorDetail[];
  message?: string;
}

export class EbayClient {
  private constructor(
    private readonly storeId: string,
    private readonly accessToken: string,
    private readonly environment: "sandbox" | "production"
  ) {}

  static async forStore(storeId: string): Promise<EbayClient> {
    const { token, environment } = await getValidEbayAccessToken(storeId);
    return new EbayClient(storeId, token, environment);
  }

  getApiBase(): string {
    return getEbayBaseUrls(this.environment).apiBase;
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {},
    maxRetries = 2
  ): Promise<{ data: T; status: number; headers: Headers }> {
    const baseUrl = this.getApiBase();
    const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${this.accessToken}`);
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    if (!headers.has("Content-Language")) {
      headers.set("Content-Language", "en-US");
    }

    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const response = await fetch(url, {
          ...options,
          headers,
          signal: options.signal || AbortSignal.timeout(15000),
        });

        // Track rate limits from headers
        const rateLimitRemaining = response.headers.get("x-ebay-c-ratelimit-remaining");
        if (rateLimitRemaining) {
          const remaining = parseInt(rateLimitRemaining, 10);
          if (!isNaN(remaining)) {
            await prisma.ebayIntegrationConfig.updateMany({
              where: { storeId: this.storeId },
              data: { dailyRateLimitRemaining: remaining },
            }).catch(() => {});
          }
        }

        // Handle rate limiting (429)
        if (response.status === 429) {
          if (attempt < maxRetries) {
            const backoffMs = Math.pow(2, attempt) * 1500;
            console.warn(`[eBay Client] Rate limited (429). Retrying in ${backoffMs}ms... (Attempt ${attempt + 1}/${maxRetries})`);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            attempt++;
            continue;
          }
          throw new Error("eBay API rate limit exceeded. Please try again in a few minutes.");
        }

        // 204 No Content
        if (response.status === 204) {
          return { data: null as unknown as T, status: response.status, headers: response.headers };
        }

        const text = await response.text();
        let parsed: any = {};
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = { raw: text };
        }

        if (!response.ok) {
          const errorList = parsed.errors as EbayApiErrorDetail[] | undefined;
          const msg = errorList?.map((e) => e.longMessage || e.message).filter(Boolean).join(" | ")
            || parsed.message
            || `eBay API returned HTTP ${response.status}`;
          
          const err = new Error(msg);
          (err as any).status = response.status;
          (err as any).details = parsed;
          throw err;
        }

        return { data: parsed as T, status: response.status, headers: response.headers };
      } catch (err: any) {
        if (attempt < maxRetries && (err.name === "TimeoutError" || err.status >= 500)) {
          const backoffMs = (attempt + 1) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          attempt++;
          continue;
        }
        throw err;
      }
    }

    throw new Error(`Failed eBay request to ${url} after ${maxRetries} retries.`);
  }
}


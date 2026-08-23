type SquareCheckoutPayload = {
  amountCents: number;
  orderLabel: string;
  note?: string;
  redirectUrl?: string;
};

type SquareCheckoutResponse = {
  checkoutUrl: string;
};

export type SquareConfigStatus = {
  configured: boolean;
  environment: "sandbox" | "production" | string;
  missing: string[];
};

const rawBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const trimmedBase = rawBase.replace(/\/$/, "");
const apiRoot = trimmedBase.endsWith("/api") ? trimmedBase.slice(0, -4) : trimmedBase;

export async function createSquareCheckout(payload: SquareCheckoutPayload): Promise<string> {
  const response = await fetch(`${apiRoot}/api/payments/square/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as Partial<SquareCheckoutResponse> & { error?: string };
  if (!response.ok || !data.checkoutUrl) {
    throw new Error(data.error ?? `Square checkout request failed (${response.status})`);
  }

  return data.checkoutUrl;
}

export async function getSquareConfigStatus(): Promise<SquareConfigStatus> {
  const response = await fetch(`${apiRoot}/api/payments/square/status`);
  if (!response.ok) {
    throw new Error(`Square status request failed (${response.status})`);
  }

  const data = (await response.json()) as Partial<SquareConfigStatus>;
  return {
    configured: Boolean(data.configured),
    environment: typeof data.environment === "string" ? data.environment : "sandbox",
    missing: Array.isArray(data.missing) ? data.missing : [],
  };
}

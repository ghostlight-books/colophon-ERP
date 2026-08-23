import { randomUUID } from "crypto";

import { env } from "../config/env.js";

type CreateCheckoutInput = {
  amountCents: number;
  orderLabel: string;
  note?: string;
  redirectUrl?: string;
};

type SquareCreatePaymentLinkResponse = {
  payment_link?: {
    url?: string;
  };
};

function squareApiBase(): string {
  return env.SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export function isSquareConfigured(): boolean {
  return Boolean(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID);
}

export async function createSquareCheckoutLink(input: CreateCheckoutInput): Promise<string> {
  if (!isSquareConfigured()) {
    throw new Error("Square is not configured. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID.");
  }

  const payload = {
    idempotency_key: randomUUID(),
    quick_pay: {
      name: input.orderLabel,
      location_id: env.SQUARE_LOCATION_ID,
      price_money: {
        amount: input.amountCents,
        currency: "USD",
      },
    },
    checkout_options: {
      redirect_url: input.redirectUrl ?? `${env.CLIENT_APP_URL}/pos-register`,
    },
    description: input.note ?? "POS checkout",
  };

  const response = await fetch(`${squareApiBase()}/v2/online-checkout/payment-links`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-07-17",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Square checkout creation failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as SquareCreatePaymentLinkResponse;
  const url = data.payment_link?.url;
  if (!url) {
    throw new Error("Square checkout response missing payment link URL.");
  }

  return url;
}

import crypto from "crypto";
import { processInboundEbayOrder, InboundEbayOrder } from "./ebayOrders.service.js";

export interface EbayWebhookPayload {
  metadata?: {
    topic?: string;
    schemaVersion?: string;
    deprecated?: boolean;
  };
  notification?: {
    notificationId?: string;
    eventDate?: string;
    publishDate?: string;
    publishAttemptCount?: number;
    data?: any;
  };
}

export function handleEbayWebhookChallenge(
  challengeCode: string,
  verificationToken: string,
  endpointUrl: string
): string {
  const hash = crypto.createHash("sha256");
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpointUrl);
  return hash.digest("hex");
}

export async function processEbayWebhookEvent(
  storeId: string,
  payload: EbayWebhookPayload
): Promise<{ handled: boolean; eventType: string; result?: any }> {
  const topic = payload.metadata?.topic || "UNKNOWN";
  const data = payload.notification?.data;

  if (topic === "MARKETPLACE_ORDER_NOTIFICATION" || topic.includes("ORDER")) {
    if (data?.orderId) {
      const lineItems = (data.lineItems || []).map((line: any) => ({
        lineItemId: line.lineItemId || String(Date.now()),
        sku: line.sku || line.legacyItemId,
        title: line.title,
        quantity: line.quantity || 1,
        unitPrice: parseFloat(line.unitPrice?.value || "0"),
        totalPrice: parseFloat(line.total?.value || "0"),
      }));

      const order: InboundEbayOrder = {
        orderId: data.orderId,
        orderStatus: data.orderFulfillmentStatus || "PAID",
        buyerUsername: data.buyer?.username,
        totalAmount: parseFloat(data.pricingSummary?.total?.value || "0"),
        paidAt: data.paymentSummary?.payments?.[0]?.paymentDate ? new Date(data.paymentSummary.payments[0].paymentDate) : new Date(),
        lineItems,
      };

      const res = await processInboundEbayOrder(storeId, order);
      return { handled: true, eventType: topic, result: res };
    }
  }

  return { handled: false, eventType: topic };
}

import { prisma } from "../../config/database.js";

export interface EbayOrderLineItem {
  lineItemId: string;
  sku?: string;
  title?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface InboundEbayOrder {
  orderId: string;
  orderStatus: string;
  buyerUsername?: string;
  buyerEmail?: string;
  shippingAddress?: {
    fullName?: string;
    addressLine1?: string;
    city?: string;
    stateOrProvince?: string;
    postalCode?: string;
    countryCode?: string;
  };
  totalAmount: number;
  paidAt?: Date;
  lineItems: EbayOrderLineItem[];
}

export async function processInboundEbayOrder(
  storeId: string,
  order: InboundEbayOrder
): Promise<{ success: boolean; decrementedItems: string[]; message: string }> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    select: { id: true, storeName: true },
  });
  const storePk = store?.id ?? storeId;

  const decrementedIsbns: string[] = [];

  for (const line of order.lineItems) {
    if (!line.sku) continue;

    // Find the item in local inventory by SKU or ISBN
    const item = await prisma.isbnLookupCache.findFirst({
      where: {
        OR: [
          { sku: line.sku },
          { isbn: line.sku },
        ],
      },
    });

    if (item) {
      const quantityToDecrement = Math.max(1, line.quantity);
      const newQuantity = Math.max(0, item.quantityOnHand - quantityToDecrement);

      await prisma.isbnLookupCache.update({
        where: { id: item.id },
        data: {
          quantityOnHand: newQuantity,
        },
      });

      // Update listing status if stock hit zero
      if (newQuantity === 0) {
        await prisma.ebayListing.updateMany({
          where: { storeId: storePk, isbn: item.isbn },
          data: { listingStatus: "SOLD", lastSyncedAt: new Date() },
        });
      }

      decrementedIsbns.push(item.isbn);
    }
  }

  // Log the order event in sync logs
  await prisma.ebaySyncLog.create({
    data: {
      storeId: storePk,
      direction: "INBOUND",
      eventType: "ORDER_WEBHOOK",
      status: "SUCCESS",
      payload: JSON.stringify(order),
      response: JSON.stringify({ decrementedIsbns, orderId: order.orderId }),
    },
  });

  return {
    success: true,
    decrementedItems: decrementedIsbns,
    message: `Processed eBay Order ${order.orderId}: decremented ${decrementedIsbns.length} catalog items.`,
  };
}

export async function handleEbayOrderCancellationOrReturn(
  storeId: string,
  orderId: string,
  lineItems: Array<{ sku: string; quantity: number }>,
  reason: "CANCELLED" | "RETURNED"
): Promise<{ success: boolean; restoredItems: string[] }> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    select: { id: true },
  });
  const storePk = store?.id ?? storeId;

  const restoredIsbns: string[] = [];

  for (const line of lineItems) {
    const item = await prisma.isbnLookupCache.findFirst({
      where: {
        OR: [{ sku: line.sku }, { isbn: line.sku }],
      },
    });

    if (item) {
      await prisma.isbnLookupCache.update({
        where: { id: item.id },
        data: {
          quantityOnHand: { increment: line.quantity },
        },
      });
      restoredIsbns.push(item.isbn);
    }
  }

  await prisma.ebaySyncLog.create({
    data: {
      storeId: storePk,
      direction: "INBOUND",
      eventType: "ORDER_WEBHOOK",
      status: "SUCCESS",
      payload: JSON.stringify({ orderId, reason, lineItems }),
      response: JSON.stringify({ restoredIsbns }),
    },
  });

  return { success: true, restoredItems: restoredIsbns };
}

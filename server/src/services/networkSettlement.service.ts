import { randomUUID } from "node:crypto";

import { prisma } from "../config/database.js";

export type DropshipOrderInput = {
  isbn: string;
  title: string;
  wholesalePrice: number;
  shippingFee: number;
};

export async function executeDropshipSettlement(
  buyingStoreId: string,
  sellingStoreId: string,
  order: DropshipOrderInput,
): Promise<{ orderId: string; totalCost: number }> {
  if (buyingStoreId === sellingStoreId) {
    throw new Error("Buying and selling stores must be different.");
  }
  if (!order.isbn.trim() || !order.title.trim() || !Number.isFinite(order.wholesalePrice) || !Number.isFinite(order.shippingFee) || order.wholesalePrice < 0 || order.shippingFee < 0) {
    throw new Error("Order ISBN, title, and non-negative prices are required.");
  }

  const totalCost = Number((order.wholesalePrice + order.shippingFee).toFixed(2));
  return prisma.$transaction(async (transaction) => {
    const buyer = await transaction.store.findUnique({ where: { id: buyingStoreId } });
    const seller = await transaction.store.findUnique({ where: { id: sellingStoreId } });
    if (!buyer || !seller) {
      throw new Error("Buying or selling store was not found.");
    }

    const debit = await transaction.store.updateMany({
      where: { id: buyingStoreId, ledgerBalance: { gte: totalCost } },
      data: { ledgerBalance: { decrement: totalCost } },
    });
    if (debit.count !== 1) {
      throw new Error("Insufficient internal ledger balance.");
    }

    const updatedSeller = await transaction.store.update({
      where: { id: sellingStoreId },
      data: { ledgerBalance: { increment: totalCost } },
    });
    const updatedBuyer = await transaction.store.findUniqueOrThrow({ where: { id: buyingStoreId } });
    const networkOrder = await transaction.networkOrder.create({
      data: {
        id: `ORD-${randomUUID()}`,
        buyingStoreId,
        sellingStoreId,
        isbn: order.isbn.trim(),
        title: order.title.trim(),
        wholesalePrice: order.wholesalePrice,
        shippingFee: order.shippingFee,
        totalAmount: totalCost,
      },
    });

    await transaction.ledgerTransaction.createMany({
      data: [
        { storeId: buyingStoreId, amount: -totalCost, balanceAfter: updatedBuyer.ledgerBalance, referenceOrderId: networkOrder.id, description: `Dropship purchase of ${order.title.trim()}` },
        { storeId: sellingStoreId, amount: totalCost, balanceAfter: updatedSeller.ledgerBalance, referenceOrderId: networkOrder.id, description: `Dropship sale fulfillment of ${order.title.trim()}` },
      ],
    });

    return { orderId: networkOrder.id, totalCost };
  });
}
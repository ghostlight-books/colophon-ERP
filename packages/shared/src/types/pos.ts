export type PaymentMethod = "CASH" | "CARD" | "STORE_CREDIT" | "MOBILE";

export interface PosLineItem {
  inventoryItemId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface PosTransaction {
  id: string;
  transactionNumber: string;
  cashierUserId: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  soldAt: string;
  lineItems: PosLineItem[];
}

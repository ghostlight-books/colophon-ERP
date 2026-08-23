export type InventoryCondition = "NEW" | "LIKE_NEW" | "VERY_GOOD" | "GOOD" | "ACCEPTABLE";

export interface InventoryItem {
  id: string;
  bookId: string;
  sku: string;
  condition: InventoryCondition;
  quantityOnHand: number;
  quantityReserved: number;
  locationCode?: string;
  acquiredAt: string;
}

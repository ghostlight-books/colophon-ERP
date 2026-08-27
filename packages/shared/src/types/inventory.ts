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

export type EbayListingStatus = "UNLISTED" | "ACTIVE" | "ENDED" | "SOLD" | "ERROR";

export interface EbayListingSummary {
  id: string;
  isbn: string;
  sku: string;
  title?: string | null;
  author?: string | null;
  coverUrl?: string | null;
  quantityOnHand?: number;
  price: number;
  listingStatus: EbayListingStatus;
  ebayItemId?: string | null;
  ebayOfferId?: string | null;
  ebayUrl?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  autoListExcluded: boolean;
}

export interface EbayOpportunitySummary {
  id: string;
  isbn: string;
  sku: string;
  title: string | null;
  author: string | null;
  coverUrl?: string | null;
  localPrice: number;
  opportunityScore: number; // 0 - 100
  marketLowestPrice: number | null;
  marketMedianPrice: number | null;
  marketHighestPrice: number | null;
  competitorCount: number;
  suggestedPrice: number | null;
  estimatedNetMargin: number | null;
  scannedAt: string;
  listingStatus?: EbayListingStatus;
}

export interface EbayListingRuleConfig {
  id: string;
  storeId: string;
  name: string;
  enabled: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  minDaysInInventory: number | null;
  requiredCondition: string | null;
  mustHaveCoverImage: boolean;
  includeKeywords: string | null;
  excludeKeywords: string | null;
  onlyFirstEditionOrSigned: boolean;
  autoPublish: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EbaySyncLogEntry {
  id: string;
  storeId: string;
  direction: "OUTBOUND" | "INBOUND";
  eventType: "INVENTORY_PUSH" | "OFFER_PUBLISH" | "OFFER_WITHDRAW" | "ORDER_WEBHOOK" | "PRICE_SYNC" | "MARKET_SCAN";
  isbn?: string | null;
  sku?: string | null;
  status: "SUCCESS" | "FAILURE" | "WARNING";
  payload?: string | null;
  response?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface EbayStoreConfigSummary {
  connected: boolean;
  environment: "sandbox" | "production";
  appId?: string | null;
  ruName?: string | null;
  fulfillmentPolicyId?: string | null;
  paymentPolicyId?: string | null;
  returnPolicyId?: string | null;
  highValueFulfillmentPolicyId?: string | null;
  highValueThreshold: number;
  merchantLocationKey: string;
  dailyRateLimitLimit: number;
  dailyRateLimitRemaining: number;
  syncEnabled: boolean;
  autoPublishEnabled: boolean;
}


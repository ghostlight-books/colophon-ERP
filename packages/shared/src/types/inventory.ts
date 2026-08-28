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

export type UspsShippingService =
  | "USPS_MEDIA_MAIL"
  | "USPS_GROUND_ADVANTAGE"
  | "USPS_PRIORITY_MAIL"
  | "USPS_PRIORITY_MAIL_PADDED_FLAT_RATE"
  | "USPS_PRIORITY_MAIL_MEDIUM_FLAT_RATE";

export type PackageType =
  | "Letter"
  | "Large Envelope / Flat"
  | "Package/Thick Envelope"
  | "Flat Rate Envelope"
  | "Medium Flat Rate Box"
  | "Large Flat Rate Box";

export interface BookPhysicalDimensions {
  weightOz: number;
  weightLbs: number;
  lengthInches: number;
  widthInches: number;
  thicknessInches: number;
  pageCount?: number | null;
  bindingFormat?: string | null;
  packageType: PackageType;
}

export interface ShippingRateQuote {
  serviceId: UspsShippingService;
  carrier: "USPS";
  serviceName: string;
  rate: number;
  estimatedDeliveryDays: string;
  description: string;
  isCompliantMediaMail: boolean;
  requiresSignature: boolean;
  insuranceIncluded: number;
  isRecommended: boolean;
  recommendationReason?: string;
}

export interface ShippingRateSelectionResult {
  isbn: string;
  weightOz: number;
  dimensions: {
    length: number;
    width: number;
    thickness: number;
  };
  packageType: PackageType;
  selectedRate: ShippingRateQuote;
  availableRates: ShippingRateQuote[];
  isHighValueRouted: boolean;
}

export type BookBuyingCondition = "Fine" | "Very Good" | "Good" | "Fair" | "Poor";

export interface BookBuyingMarketSources {
  thriftbooksPrice?: number | null;
  abebooksPrice?: number | null;
  googleBooksPrice?: number | null;
  priceRangeLow?: number | null;
  priceRangeHigh?: number | null;
}

export interface BookBuyingOffer {
  isbn: string;
  title: string | null;
  author: string | null;
  publisher?: string | null;
  year?: number | null;
  coverUrl?: string | null;
  bindingFormat?: string | null;
  pageCount?: number | null;
  condition: BookBuyingCondition;
  conditionDiscount: number;
  estimatedRetailValue: number;
  offerPercentage: number;
  offerAmount: number;
  storeCreditOfferAmount: number;
  marketSources: BookBuyingMarketSources;
}

export interface BookBuyingSearchParams {
  year: number;
  publisher?: string;
  author?: string;
  isbn?: string;
  title?: string;
}

export interface BookBuyingSearchResult {
  isbn: string;
  title: string;
  author: string | null;
  year: number | null;
  publisher: string | null;
  coverUrl: string | null;
  estimatedRetailValue: number;
  offerAmount: number;
}

export interface BuyingBatchItem {
  id: string;
  isbn: string;
  title: string;
  author: string | null;
  publisher?: string | null;
  year?: number | null;
  coverUrl?: string | null;
  condition: BookBuyingCondition;
  sellPrice: number;
  buyOffer: number;
  marketSources: BookBuyingMarketSources;
  addedAt: string;
}

export interface BuyingBatchSummary {
  totalItems: number;
  totalEstimatedResaleValue: number;
  totalCashOffer: number;
  totalCreditOffer: number;
}

export interface ProductBundleItem {
  id: string;
  bundleId: string;
  isbn: string;
  sku: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  condition: string | null;
  listPrice: number;
  category: string | null;
  subcategory: string | null;
  originalQty: number;
  createdAt: string;
}

export interface ProductBundle {
  id: string;
  parentSku: string;
  title: string;
  topic: string | null;
  description: string | null;
  bundlePrice: number;
  originalTotalPrice: number;
  discountPercent: number;
  savingsAmount: number;
  quantityOnHand: number;
  status: "ACTIVE" | "UNBUNDLED" | "SOLD";
  createdAt: string;
  updatedAt: string;
  unbundledAt?: string | null;
  storeId?: string | null;
  items: ProductBundleItem[];
}

export interface BundlePricingSuggestion {
  totalIndividualPrice: number;
  discountPercent: number;
  discountedPrice: number;
  suggestedBundlePrice: number;
  savingsAmount: number;
  savingsPercent: number;
}

export interface CreateProductBundleInput {
  title?: string;
  topic?: string;
  description?: string;
  customBundlePrice?: number;
  items: Array<{
    isbn: string;
    sku?: string;
    title: string;
    author?: string | null;
    coverUrl?: string | null;
    condition?: string | null;
    listPrice: number;
    category?: string | null;
    subcategory?: string | null;
  }>;
  storeId?: string;
}

export interface UnbundleResult {
  success: boolean;
  bundleId: string;
  parentSku: string;
  itemsRestored: number;
  message: string;
}





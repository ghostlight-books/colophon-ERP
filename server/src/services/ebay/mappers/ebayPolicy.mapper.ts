export interface MerchantPolicyConfig {
  fulfillmentPolicyId?: string | null;
  paymentPolicyId?: string | null;
  returnPolicyId?: string | null;
  highValueFulfillmentPolicyId?: string | null;
  highValueThreshold?: number | null;
  merchantLocationKey?: string | null;
}

export interface ResolvedListingPolicies {
  fulfillmentPolicyId?: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
  merchantLocationKey: string;
  isHighValueRouted: boolean;
}

export function resolveEbayPolicies(
  config: MerchantPolicyConfig,
  price: number
): ResolvedListingPolicies {
  const threshold = config.highValueThreshold ?? 250.0;
  const isHighValue = price >= threshold && Boolean(config.highValueFulfillmentPolicyId);

  const fulfillmentPolicyId = isHighValue
    ? config.highValueFulfillmentPolicyId!
    : config.fulfillmentPolicyId || undefined;

  return {
    fulfillmentPolicyId,
    paymentPolicyId: config.paymentPolicyId || undefined,
    returnPolicyId: config.returnPolicyId || undefined,
    merchantLocationKey: config.merchantLocationKey || "STORE_MAIN",
    isHighValueRouted: isHighValue,
  };
}


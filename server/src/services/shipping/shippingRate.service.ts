import type {
  BookPhysicalDimensions,
  PackageType,
  ShippingRateQuote,
  ShippingRateSelectionResult,
  UspsShippingService,
} from "@colophon/shared";

export interface RateCalculationOptions {
  isbn: string;
  weightOz: number;
  length?: number;
  width?: number;
  thickness?: number;
  itemPrice?: number | null;
  isBookMedia?: boolean;
  packageTypeOverride?: PackageType;
  highValueThreshold?: number;
  requireSignatureOverride?: boolean;
}

/**
 * USPS 2026 Media Mail Rate Table (Weight rounded up to next whole pound)
 */
export function calculateMediaMailRate(weightOz: number): number {
  const billableLbs = Math.max(1, Math.ceil(weightOz / 16));
  if (billableLbs > 70) return 0; // Exceeds USPS limit

  const baseFirstLb = 4.63;
  const perAdditionalLb = 0.78;

  return Math.round((baseFirstLb + (billableLbs - 1) * perAdditionalLb) * 100) / 100;
}

/**
 * USPS Ground Advantage Commercial Base Rate Approximation
 */
export function calculateGroundAdvantageRate(weightOz: number): number {
  if (weightOz <= 4) return 4.35;
  if (weightOz <= 8) return 4.95;
  if (weightOz <= 12) return 5.60;
  if (weightOz <= 15.99) return 6.40;

  const billableLbs = Math.ceil(weightOz / 16);
  if (billableLbs <= 1) return 7.20;
  if (billableLbs <= 2) return 8.30;
  if (billableLbs <= 3) return 9.45;
  if (billableLbs <= 4) return 10.60;
  if (billableLbs <= 5) return 11.75;
  return Math.round((11.75 + (billableLbs - 5) * 1.15) * 100) / 100;
}

/**
 * USPS Priority Mail Rate Table (Weight-based Zone 4 Average)
 */
export function calculatePriorityMailWeightRate(weightOz: number): number {
  const billableLbs = Math.max(1, Math.ceil(weightOz / 16));
  if (billableLbs <= 1) return 9.25;
  if (billableLbs <= 2) return 11.50;
  if (billableLbs <= 3) return 14.20;
  if (billableLbs <= 4) return 17.10;
  if (billableLbs <= 5) return 19.80;
  return Math.round((19.80 + (billableLbs - 5) * 1.85) * 100) / 100;
}

export const USPS_FLAT_RATES = {
  PADDED_FLAT_RATE_ENVELOPE: 10.60,
  MEDIUM_FLAT_RATE_BOX: 18.40,
};

export const SIGNATURE_CONFIRMATION_FEE = 4.15;

/**
 * Calculates and quotes all eligible USPS shipping rates for a book item.
 */
export function quoteAllShippingRates(options: RateCalculationOptions): ShippingRateQuote[] {
  const {
    weightOz,
    length = 9.0,
    width = 6.0,
    thickness = 1.0,
    itemPrice = 0,
    isBookMedia = true,
    highValueThreshold = 250,
    requireSignatureOverride,
  } = options;

  const isHighValue = (itemPrice ?? 0) >= highValueThreshold || requireSignatureOverride === true;
  const signatureFee = isHighValue ? SIGNATURE_CONFIRMATION_FEE : 0;
  const declaredValue = itemPrice ?? 0;

  const quotes: ShippingRateQuote[] = [];

  // 1. USPS Media Mail
  if (isBookMedia) {
    const baseMediaRate = calculateMediaMailRate(weightOz);
    quotes.push({
      serviceId: "USPS_MEDIA_MAIL",
      carrier: "USPS",
      serviceName: "USPS Media Mail",
      rate: Math.round((baseMediaRate + signatureFee) * 100) / 100,
      estimatedDeliveryDays: "2-8 business days",
      description: "Economical shipping for books, manuscripts, and printed educational media.",
      isCompliantMediaMail: true,
      requiresSignature: isHighValue,
      insuranceIncluded: isHighValue ? declaredValue : 0,
      isRecommended: false,
    });
  }

  // 2. USPS Ground Advantage
  const baseGroundRate = calculateGroundAdvantageRate(weightOz);
  quotes.push({
    serviceId: "USPS_GROUND_ADVANTAGE",
    carrier: "USPS",
    serviceName: "USPS Ground Advantage",
    rate: Math.round((baseGroundRate + signatureFee) * 100) / 100,
    estimatedDeliveryDays: "2-5 business days",
    description: "Standard delivery with tracking and $100 insurance included.",
    isCompliantMediaMail: true,
    requiresSignature: isHighValue,
    insuranceIncluded: Math.max(100, declaredValue),
    isRecommended: false,
  });

  // 3. USPS Priority Mail Padded Flat Rate Envelope (if fits)
  const fitsInPaddedEnvelope = length <= 11.5 && width <= 8.5 && thickness <= 2.2;
  if (fitsInPaddedEnvelope) {
    quotes.push({
      serviceId: "USPS_PRIORITY_MAIL_PADDED_FLAT_RATE",
      carrier: "USPS",
      serviceName: "USPS Priority Mail Padded Flat Rate Envelope",
      rate: Math.round((USPS_FLAT_RATES.PADDED_FLAT_RATE_ENVELOPE + signatureFee) * 100) / 100,
      estimatedDeliveryDays: "1-3 business days",
      description: "Fast expedited shipping in heavy-duty moisture-resistant padded mailer.",
      isCompliantMediaMail: true,
      requiresSignature: isHighValue,
      insuranceIncluded: Math.max(100, declaredValue),
      isRecommended: false,
    });
  }

  // 4. USPS Priority Mail (Weight-based)
  const basePriorityWeightRate = calculatePriorityMailWeightRate(weightOz);
  quotes.push({
    serviceId: "USPS_PRIORITY_MAIL",
    carrier: "USPS",
    serviceName: "USPS Priority Mail (Weight-Based)",
    rate: Math.round((basePriorityWeightRate + signatureFee) * 100) / 100,
    estimatedDeliveryDays: "1-3 business days",
    description: "Fast 1-3 day delivery based on package weight and box dimensions.",
    isCompliantMediaMail: true,
    requiresSignature: isHighValue,
    insuranceIncluded: Math.max(100, declaredValue),
    isRecommended: false,
  });

  // 5. USPS Priority Mail Medium Flat Rate Box (for oversized books or multi-volume sets)
  if (length > 11.5 || width > 8.5 || thickness > 2.2 || weightOz > 48) {
    quotes.push({
      serviceId: "USPS_PRIORITY_MAIL_MEDIUM_FLAT_RATE",
      carrier: "USPS",
      serviceName: "USPS Priority Mail Medium Flat Rate Box",
      rate: Math.round((USPS_FLAT_RATES.MEDIUM_FLAT_RATE_BOX + signatureFee) * 100) / 100,
      estimatedDeliveryDays: "1-3 business days",
      description: "Sturdy boxed shipping for oversized art books, textbooks, or box sets.",
      isCompliantMediaMail: true,
      requiresSignature: isHighValue,
      insuranceIncluded: Math.max(100, declaredValue),
      isRecommended: false,
    });
  }

  return quotes;
}

/**
 * Automatically selects the optimal shipment rate and packaging based on business rules.
 */
export function autoSelectShippingRate(
  options: RateCalculationOptions,
  dimensions: BookPhysicalDimensions
): ShippingRateSelectionResult {
  const quotes = quoteAllShippingRates(options);
  const isHighValue = (options.itemPrice ?? 0) >= (options.highValueThreshold ?? 250) || options.requireSignatureOverride === true;

  let selected: ShippingRateQuote | undefined;

  // Rule 1: High-value items ($250+) require Priority Mail with Signature Confirmation & Insurance
  if (isHighValue) {
    const flatRate = quotes.find((q) => q.serviceId === "USPS_PRIORITY_MAIL_PADDED_FLAT_RATE");
    const priorityWeight = quotes.find((q) => q.serviceId === "USPS_PRIORITY_MAIL");
    const mediumBox = quotes.find((q) => q.serviceId === "USPS_PRIORITY_MAIL_MEDIUM_FLAT_RATE");

    selected = flatRate || priorityWeight || mediumBox || quotes[0];
    selected.isRecommended = true;
    selected.recommendationReason = `High-Value Item Protection: Automatically routed to Expedited Priority Mail with Signature Confirmation & Insurance (Declared Value: $${options.itemPrice?.toFixed(2)}).`;
  }
  // Rule 2: Ultra-light items (under 4 oz) on Ground Advantage vs Media Mail
  else if (options.weightOz <= 4 && !options.isBookMedia) {
    selected = quotes.find((q) => q.serviceId === "USPS_GROUND_ADVANTAGE") || quotes[0];
    selected.isRecommended = true;
    selected.recommendationReason = "Fast lightweight delivery with included $100 insurance.";
  }
  // Rule 3: Standard books -> Media Mail is the most cost-effective compliant rate
  else {
    selected = quotes.find((q) => q.serviceId === "USPS_MEDIA_MAIL") || quotes[0];
    selected.isRecommended = true;
    selected.recommendationReason = "Most economical USPS rate for books and educational media.";
  }

  return {
    isbn: options.isbn,
    weightOz: options.weightOz,
    dimensions: {
      length: dimensions.lengthInches,
      width: dimensions.widthInches,
      thickness: dimensions.thicknessInches,
    },
    packageType: options.packageTypeOverride || dimensions.packageType,
    selectedRate: selected,
    availableRates: quotes.map((q) => ({
      ...q,
      isRecommended: q.serviceId === selected?.serviceId,
      recommendationReason: q.serviceId === selected?.serviceId ? selected.recommendationReason : undefined,
    })),
    isHighValueRouted: isHighValue,
  };
}


import { describe, it } from "node:test";
import assert from "node:assert";
import {
  calculateMediaMailRate,
  calculateGroundAdvantageRate,
  calculatePriorityMailWeightRate,
  quoteAllShippingRates,
  autoSelectShippingRate,
  SIGNATURE_CONFIRMATION_FEE,
} from "../shippingRate.service.js";
import { resolveBookDimensions } from "../../isbn/dimensions.service.js";

describe("USPS Shipping Rate & Auto-Selection Engine", () => {
  it("calculates accurate USPS Media Mail tiered rates", () => {
    // 1 lb
    assert.strictEqual(calculateMediaMailRate(12), 4.63);
    // 2 lbs
    assert.strictEqual(calculateMediaMailRate(20), 5.41);
    // 3 lbs
    assert.strictEqual(calculateMediaMailRate(36), 6.19);
    // 5 lbs
    assert.strictEqual(calculateMediaMailRate(80), 7.75);
  });

  it("calculates USPS Ground Advantage tiered rates", () => {
    assert.strictEqual(calculateGroundAdvantageRate(3.5), 4.35);
    assert.strictEqual(calculateGroundAdvantageRate(7.0), 4.95);
    assert.strictEqual(calculateGroundAdvantageRate(11.5), 5.60);
    assert.strictEqual(calculateGroundAdvantageRate(15.0), 6.40);
  });

  it("auto-selects USPS Media Mail for standard book items", () => {
    const dimensions = resolveBookDimensions({ pages: 400 });
    const selection = autoSelectShippingRate(
      {
        isbn: "9780140449136",
        weightOz: dimensions.weightOz,
        length: dimensions.lengthInches,
        width: dimensions.widthInches,
        thickness: dimensions.thicknessInches,
        itemPrice: 16.99,
        isBookMedia: true,
      },
      dimensions
    );

    assert.strictEqual(selection.selectedRate.serviceId, "USPS_MEDIA_MAIL");
    assert.strictEqual(selection.selectedRate.rate, 4.63);
    assert.strictEqual(selection.isHighValueRouted, false);
  });

  it("automatically routes high-value items ($250+) to Expedited Priority Mail with Signature Confirmation", () => {
    const dimensions = resolveBookDimensions({ pages: 600, binding: "Hardcover" });
    const highValuePrice = 350.0;
    const selection = autoSelectShippingRate(
      {
        isbn: "9780547928227",
        weightOz: dimensions.weightOz,
        length: dimensions.lengthInches,
        width: dimensions.widthInches,
        thickness: dimensions.thicknessInches,
        itemPrice: highValuePrice,
        isBookMedia: true,
      },
      dimensions
    );

    assert.strictEqual(selection.isHighValueRouted, true);
    assert.strictEqual(selection.selectedRate.requiresSignature, true);
    assert.ok(selection.selectedRate.rate > 10.0);
    assert.match(selection.selectedRate.serviceId, /USPS_PRIORITY_MAIL/);
    assert.ok(selection.selectedRate.recommendationReason?.includes("High-Value Item Protection"));
  });
});


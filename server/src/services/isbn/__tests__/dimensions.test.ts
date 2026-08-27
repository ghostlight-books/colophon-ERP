import { describe, it } from "node:test";
import assert from "node:assert";
import {
  parseDimensionString,
  detectBindingFormat,
  determinePackageType,
  resolveBookDimensions,
  FORMAT_PRESETS,
} from "../dimensions.service.js";

describe("Dimensions & Physical Metadata Service", () => {
  it("parses verbose ISBNdb dimension strings correctly", () => {
    const raw = "Height: 9.0 Inches, Length: 6.0 Inches, Weight: 1.25 Pounds, Width: 1.1 Inches";
    const parsed = parseDimensionString(raw);
    assert.strictEqual(parsed.length, 9.0);
    assert.strictEqual(parsed.width, 1.1);
    assert.strictEqual(parsed.weightOz, 20); // 1.25 lbs * 16 = 20 oz
  });

  it("parses metric dimension strings into inches and ounces", () => {
    const raw = "22.86 x 15.24 x 2.54 cm; 453.59 grams";
    const parsed = parseDimensionString(raw);
    assert.ok(Math.abs((parsed.length ?? 0) - 9.0) < 0.2);
    assert.ok(Math.abs((parsed.width ?? 0) - 6.0) < 0.2);
    assert.ok(Math.abs((parsed.thickness ?? 0) - 1.0) < 0.2);
    assert.ok(Math.abs((parsed.weightOz ?? 0) - 16.0) < 0.2);
  });

  it("detects binding format accurately from description and titles", () => {
    assert.strictEqual(detectBindingFormat("Hardcover", "The Great Gatsby", "Cloth bound"), "Hardcover");
    assert.strictEqual(detectBindingFormat(null, "Dune (Mass Market Paperback)", "MMPB edition"), "Mass Market Paperback");
    assert.strictEqual(detectBindingFormat("Trade PB", "Sapiens", "Softcover"), "Paperback");
    assert.strictEqual(detectBindingFormat("Leather Bound", "Easton Press Classics", "Full leather"), "Leather Bound");
  });

  it("determines appropriate USPS package envelope or box", () => {
    // Fits in standard flat rate envelope
    assert.strictEqual(determinePackageType(9.0, 6.0, 1.2, 16), "Flat Rate Envelope");
    // Oversized book requires box
    assert.strictEqual(determinePackageType(13.0, 10.0, 3.5, 70), "Medium Flat Rate Box");
  });

  it("applies smart fallback estimations when metadata is sparse", () => {
    const sparseBook = resolveBookDimensions({
      binding: "Mass Market Paperback",
      pages: 350,
    });
    assert.strictEqual(sparseBook.bindingFormat, "Mass Market Paperback");
    assert.strictEqual(sparseBook.lengthInches, FORMAT_PRESETS.MASS_MARKET.length);
    assert.strictEqual(sparseBook.widthInches, FORMAT_PRESETS.MASS_MARKET.width);
    assert.ok(sparseBook.weightOz > 7.0);
    assert.strictEqual(sparseBook.packageType, "Flat Rate Envelope");
  });
});


import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateRareBookPricing } from "../libraryRarePricing.service.js";

describe("Library Rare Book Pricing & Scraper Valuation", () => {
  it("returns standard baseline replacement value when no rare attributes selected", async () => {
    const result = await evaluateRareBookPricing({
      isbn: "9780441172719",
      title: "Dune",
      author: "Frank Herbert",
      baselinePrice: 20.0,
      isSigned: false,
      isFirstEdition: false,
      isFirstPrinting: false,
    });

    assert.equal(result.rareMarketValue, 20.0);
    assert.equal(result.attributes.isSigned, false);
    assert.equal(result.attributes.isFirstEdition, false);
    assert.equal(result.attributes.isFirstPrinting, false);
  });

  it("applies collectible multiplier for Signed First Editions", async () => {
    const result = await evaluateRareBookPricing({
      isbn: "9780441172719",
      title: "Dune",
      author: "Frank Herbert",
      baselinePrice: 25.0,
      isSigned: true,
      isFirstEdition: true,
      isFirstPrinting: true,
      publishYear: 1965,
    });

    assert.equal(result.attributes.isSigned, true);
    assert.equal(result.attributes.isFirstEdition, true);
    assert.equal(result.attributes.isFirstPrinting, true);
    assert.ok(result.rareMarketValue > 150.0, "Rare valuation should exceed $150 for signed 1st ed 1st print");
    assert.ok(result.suggestedAskingPrice > 100.0, "Suggested asking price should reflect rare premium");
    assert.ok(result.sources.length > 0, "Should include valuation comps or appraisal source");
  });

  it("evaluates single attribute premium (Signed only)", async () => {
    const result = await evaluateRareBookPricing({
      isbn: "9780060935467",
      title: "To Kill a Mockingbird",
      author: "Harper Lee",
      baselinePrice: 18.0,
      isSigned: true,
      isFirstEdition: false,
      isFirstPrinting: false,
    });

    assert.equal(result.attributes.isSigned, true);
    assert.equal(result.attributes.isFirstEdition, false);
    assert.ok(result.rareMarketValue > 50.0, "Signed copy should have collectible premium");
  });

  it("adjusts valuation based on condition grade (Fine vs Poor)", async () => {
    const fineResult = await evaluateRareBookPricing({
      isbn: "9780441172719",
      title: "Dune",
      baselinePrice: 20.0,
      condition: "FINE",
    });

    const poorResult = await evaluateRareBookPricing({
      isbn: "9780441172719",
      title: "Dune",
      baselinePrice: 20.0,
      condition: "POOR",
    });

    assert.equal(fineResult.condition, "FINE");
    assert.equal(poorResult.condition, "POOR");
    assert.equal(fineResult.rareMarketValue, 25.0); // 20 * 1.25
    assert.equal(poorResult.rareMarketValue, 7.0);  // 20 * 0.35
    assert.ok(fineResult.rareMarketValue > poorResult.rareMarketValue);
  });
});

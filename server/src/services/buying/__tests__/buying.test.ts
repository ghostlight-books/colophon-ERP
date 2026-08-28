import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateBuyingSearchParams,
  getConditionDiscount,
  evaluateBuyingBook,
  processBuyingBatch,
} from "../../buying.service.js";
import { prisma } from "../../../config/database.js";

describe("Book Buying & 60% Valuation Engine", () => {
  describe("validateBuyingSearchParams", () => {
    it("rejects search when publication year is missing", () => {
      const result = validateBuyingSearchParams({
        publisher: "Penguin",
        author: "George Orwell",
      });
      assert.equal(result.valid, false);
      assert.match(result.error ?? "", /Publication Year is required/i);
    });

    it("rejects search when publication year is invalid", () => {
      const result = validateBuyingSearchParams({
        year: "invalid-year",
        title: "Dune",
      });
      assert.equal(result.valid, false);
      assert.match(result.error ?? "", /valid 4-digit year/i);
    });

    it("rejects search when year is provided but all companion criteria are empty", () => {
      const result = validateBuyingSearchParams({
        year: 1998,
        publisher: "",
        author: "   ",
        title: "",
        isbn: "",
      });
      assert.equal(result.valid, false);
      assert.match(result.error ?? "", /At least one additional search criterion/i);
    });

    it("accepts search with Year + Publisher", () => {
      const result = validateBuyingSearchParams({
        year: 1997,
        publisher: "Bioenergetics Press",
      });
      assert.equal(result.valid, true);
      assert.equal(result.cleanParams?.year, 1997);
      assert.equal(result.cleanParams?.publisher, "Bioenergetics Press");
    });

    it("accepts search with Year + Author", () => {
      const result = validateBuyingSearchParams({
        year: 2011,
        author: "Alexander Lowen",
      });
      assert.equal(result.valid, true);
      assert.equal(result.cleanParams?.year, 2011);
      assert.equal(result.cleanParams?.author, "Alexander Lowen");
    });

    it("accepts search with Year + ISBN", () => {
      const result = validateBuyingSearchParams({
        year: 2004,
        isbn: "9780974373729",
      });
      assert.equal(result.valid, true);
      assert.equal(result.cleanParams?.year, 2004);
      assert.equal(result.cleanParams?.isbn, "9780974373729");
    });

    it("accepts search with Year + Title", () => {
      const result = validateBuyingSearchParams({
        year: 1965,
        title: "Dune",
      });
      assert.equal(result.valid, true);
      assert.equal(result.cleanParams?.year, 1965);
      assert.equal(result.cleanParams?.title, "Dune");
    });
  });

  describe("getConditionDiscount", () => {
    it("returns accurate condition discounts", () => {
      assert.equal(getConditionDiscount("Fine"), 0.0);
      assert.equal(getConditionDiscount("Very Good"), 0.1);
      assert.equal(getConditionDiscount("Good"), 0.2);
      assert.equal(getConditionDiscount("Fair"), 0.35);
      assert.equal(getConditionDiscount("Poor"), 0.5);
    });
  });

  describe("60% Valuation Math Calculation", () => {
    it("accurately calculates 60% store cash offer and 70% trade credit", async () => {
      // Test evaluating a known ISBN
      const offer = await evaluateBuyingBook("9780974373729", "Good");
      assert.ok(offer.isbn);
      assert.ok(offer.estimatedRetailValue > 0);
      assert.equal(offer.offerPercentage, 60);

      // Verify exact 60% math
      const expectedOffer = Number((offer.estimatedRetailValue * 0.60).toFixed(2));
      assert.equal(offer.offerAmount, expectedOffer);

      // Verify 70% trade-in credit math
      const expectedCredit = Number((offer.estimatedRetailValue * 0.70).toFixed(2));
      assert.equal(offer.storeCreditOfferAmount, expectedCredit);

      // Verify market sources range exists
      assert.ok(typeof offer.marketSources.priceRangeLow === "number");
      assert.ok(typeof offer.marketSources.priceRangeHigh === "number");
      assert.ok(offer.marketSources.priceRangeLow <= offer.marketSources.priceRangeHigh);
    });
  });

  describe("processBuyingBatch Inventory Ingestion", () => {
    it("successfully persists acquired books to active inventory, Book model, and InventoryItem", async () => {
      const testIsbn = "9780143127741";
      const initialCache = await prisma.isbnLookupCache.findUnique({ where: { isbn: testIsbn } });
      const initialQty = initialCache?.quantityOnHand ?? 0;

      const result = await processBuyingBatch({
        items: [
          {
            isbn: testIsbn,
            title: "Test Acquired Book",
            author: "Test Author",
            condition: "Good",
            sellPrice: 15.0,
            buyOffer: 9.0,
          },
        ],
        paymentMethod: "cash",
        customerName: "Alice Walker",
      });

      assert.equal(result.success, true);
      assert.equal(result.itemsProcessed, 1);
      assert.equal(result.totalPaid, 9.0);

      // Verify IsbnLookupCache quantity incremented
      const updatedCache = await prisma.isbnLookupCache.findUnique({ where: { isbn: testIsbn } });
      assert.ok(updatedCache);
      assert.equal(updatedCache.quantityOnHand, initialQty + 1);
      assert.equal(updatedCache.listPrice, 15.0);

      // Verify Book model created/updated
      const book = await prisma.book.findUnique({
        where: { isbn13: testIsbn },
        include: { inventoryItems: true },
      });
      assert.ok(book);
      assert.equal(book.listPriceCents, 1500);
      assert.ok(book.inventoryItems.length > 0);
      const totalInventoryItemQty = book.inventoryItems.reduce((sum, item) => sum + item.quantityOnHand, 0);
      assert.ok(totalInventoryItemQty >= 1);
    });
  });
});


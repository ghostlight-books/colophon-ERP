import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateSuggestedBundlePrice,
  createProductBundle,
  unbundleProduct,
  listProductBundles,
  searchAvailableItemsForBundling,
} from "../../bundle.service.js";
import { prisma } from "../../../config/database.js";

describe("Product Bundling System", () => {
  describe("calculateSuggestedBundlePrice", () => {
    it("correctly calculates 10% off and rounds to the nearest .99", () => {
      // Test 1: $30.00 total -> 10% off = $27.00 -> nearest .99 = $26.99
      const res1 = calculateSuggestedBundlePrice([15.00, 15.00]);
      assert.equal(res1.totalIndividualPrice, 30.00);
      assert.equal(res1.discountedPrice, 27.00);
      assert.equal(res1.suggestedBundlePrice, 26.99);
      assert.equal(res1.savingsAmount, 3.01);

      // Test 2: $38.97 total -> 10% off = $35.07 -> nearest .99 = $34.99
      const res2 = calculateSuggestedBundlePrice([12.99, 12.99, 12.99]);
      assert.equal(res2.totalIndividualPrice, 38.97);
      assert.equal(res2.discountedPrice, 35.07);
      assert.equal(res2.suggestedBundlePrice, 34.99);

      // Test 3: $10.00 total -> 10% off = $9.00 -> nearest .99 = $8.99
      const res3 = calculateSuggestedBundlePrice([10.00]);
      assert.equal(res3.suggestedBundlePrice, 8.99);

      // Test 4: $50.00 total -> 10% off = $45.00 -> nearest .99 = $44.99
      const res4 = calculateSuggestedBundlePrice([25.00, 25.00]);
      assert.equal(res4.suggestedBundlePrice, 44.99);
    });

    it("handles edge cases gracefully", () => {
      const resEmpty = calculateSuggestedBundlePrice([]);
      assert.equal(resEmpty.suggestedBundlePrice, 9.99);

      const resZero = calculateSuggestedBundlePrice([0, 0]);
      assert.equal(resZero.suggestedBundlePrice, 9.99);
    });
  });

  describe("createProductBundle and unbundleProduct lifecycle", () => {
    it("creates a parent SKU, marks child items unavailable individually, and restores them upon unbundling", async () => {
      const isbn1 = `978000000001${Date.now().toString().slice(-1)}`;
      const isbn2 = `978000000002${Date.now().toString().slice(-1)}`;

      // 1. Setup 2 test books in database
      await prisma.isbnLookupCache.upsert({
        where: { isbn: isbn1 },
        create: {
          isbn: isbn1,
          sku: `TEST-${isbn1.slice(-6)}`,
          title: "Dune Volume 1",
          author: "Frank Herbert",
          listPrice: 15.00,
          quantityOnHand: 2,
          category: "Science Fiction",
          source: "test",
        },
        update: { quantityOnHand: 2, isBundledChild: false },
      });

      await prisma.isbnLookupCache.upsert({
        where: { isbn: isbn2 },
        create: {
          isbn: isbn2,
          sku: `TEST-${isbn2.slice(-6)}`,
          title: "Dune Volume 2",
          author: "Frank Herbert",
          listPrice: 15.00,
          quantityOnHand: 1,
          category: "Science Fiction",
          source: "test",
        },
        update: { quantityOnHand: 1, isBundledChild: false },
      });

      // 2. Create Bundle
      const bundle = await createProductBundle({
        title: "Frank Herbert Sci-Fi Bundle",
        topic: "Science Fiction",
        items: [
          {
            isbn: isbn1,
            sku: `TEST-${isbn1.slice(-6)}`,
            title: "Dune Volume 1",
            author: "Frank Herbert",
            listPrice: 15.00,
            category: "Science Fiction",
          },
          {
            isbn: isbn2,
            sku: `TEST-${isbn2.slice(-6)}`,
            title: "Dune Volume 2",
            author: "Frank Herbert",
            listPrice: 15.00,
            category: "Science Fiction",
          },
        ],
      });

      assert.ok(bundle.id);
      assert.ok(bundle.parentSku.startsWith("BDL-SCIE"));
      assert.equal(bundle.bundlePrice, 26.99); // 10% off $30.00 nearest .99
      assert.equal(bundle.items.length, 2);
      assert.equal(bundle.status, "ACTIVE");

      // Verify child items are now marked as bundled and their individual quantity is decremented
      const child1 = await prisma.isbnLookupCache.findUnique({ where: { isbn: isbn1 } });
      const child2 = await prisma.isbnLookupCache.findUnique({ where: { isbn: isbn2 } });
      assert.equal(child1?.isBundledChild, true);
      assert.equal(child1?.bundleParentId, bundle.id);
      assert.equal(child1?.quantityOnHand, 1); // was 2, now 1
      assert.equal(child2?.isBundledChild, true);
      assert.equal(child2?.quantityOnHand, 0); // was 1, now 0 (unavailable for individual sale)

      // Verify parent bundle exists in active inventory
      const parentInCache = await prisma.isbnLookupCache.findFirst({ where: { sku: bundle.parentSku } });
      assert.ok(parentInCache);
      assert.equal(parentInCache.quantityOnHand, 1);
      assert.equal(parentInCache.isBundle, true);
      assert.equal(parentInCache.listPrice, 26.99);

      // Verify listing active bundles
      const activeBundles = await listProductBundles("ACTIVE");
      const found = activeBundles.find((b) => b.id === bundle.id);
      assert.ok(found);

      // 3. Unbundle
      const unbundleRes = await unbundleProduct(bundle.id);
      assert.equal(unbundleRes.success, true);
      assert.equal(unbundleRes.itemsRestored, 2);

      // Verify child items restored to active inventory
      const restored1 = await prisma.isbnLookupCache.findUnique({ where: { isbn: isbn1 } });
      const restored2 = await prisma.isbnLookupCache.findUnique({ where: { isbn: isbn2 } });
      assert.equal(restored1?.isBundledChild, false);
      assert.equal(restored1?.bundleParentId, null);
      assert.equal(restored1?.quantityOnHand, 2); // restored back to 2
      assert.equal(restored2?.isBundledChild, false);
      assert.equal(restored2?.quantityOnHand, 1); // restored back to 1

      // Verify parent bundle is deactivated
      const parentAfter = await prisma.isbnLookupCache.findFirst({ where: { sku: bundle.parentSku } });
      assert.equal(parentAfter?.quantityOnHand, 0);
    });
  });
});


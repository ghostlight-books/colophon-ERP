import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveEbayCategory,
  EBAY_CATEGORY_ANTIQUARIAN_BOOKS,
  EBAY_CATEGORY_GENERAL_BOOKS,
} from "../mappers/ebayCategory.mapper.js";

import {
  mapConditionToEbay,
  extractSpecialAttributes,
  detectFormatBinding,
  mapBookToEbayAspects,
} from "../mappers/ebayAspect.mapper.js";

import { resolveEbayPolicies } from "../mappers/ebayPolicy.mapper.js";

test("resolveEbayCategory: routes pre-1970 vintage books to Antiquarian category", () => {
  const result = resolveEbayCategory({
    title: "The Great Gatsby",
    publishedYear: 1925,
    price: 350.0,
  });

  assert.equal(result.categoryId, EBAY_CATEGORY_ANTIQUARIAN_BOOKS);
  assert.equal(result.isAntiquarian, true);
  assert.match(result.reason, /1925/);
});

test("resolveEbayCategory: routes signed and first edition books to Antiquarian category", () => {
  const resultSigned = resolveEbayCategory({
    title: "Kafka on the Shore (Signed Copy)",
    publishedYear: 2005,
    catalogTags: "Signed, First Edition",
    price: 180.0,
  });

  assert.equal(resultSigned.categoryId, EBAY_CATEGORY_ANTIQUARIAN_BOOKS);
  assert.equal(resultSigned.isAntiquarian, true);
});

test("resolveEbayCategory: routes modern trade books to General Books category", () => {
  const resultTrade = resolveEbayCategory({
    title: "Atomic Habits",
    author: "James Clear",
    publishedYear: 2018,
    category: "Self-Help",
    price: 18.0,
  });

  assert.equal(resultTrade.categoryId, EBAY_CATEGORY_GENERAL_BOOKS);
  assert.equal(resultTrade.isAntiquarian, false);
});

test("mapConditionToEbay: maps bookstore grading accurately to eBay condition enum", () => {
  assert.equal(mapConditionToEbay("Brand New").condition, "NEW");
  assert.equal(mapConditionToEbay("Fine").condition, "LIKE_NEW");
  assert.equal(mapConditionToEbay("Near Fine").condition, "VERY_GOOD");
  assert.equal(mapConditionToEbay("Very Good").condition, "VERY_GOOD");
  assert.equal(mapConditionToEbay("Good").condition, "GOOD");
  assert.equal(mapConditionToEbay("Fair / Reading Copy").condition, "ACCEPTABLE");
});

test("extractSpecialAttributes: accurately extracts collectible book features", () => {
  const text = "A rare 1st edition hardcover copy signed by author with dust jacket in mylar.";
  const attributes = extractSpecialAttributes(text);

  assert.ok(attributes.includes("1st Edition"));
  assert.ok(attributes.includes("Signed"));
  assert.ok(attributes.includes("Dust Jacket"));
});

test("detectFormatBinding: detects hardcover, paperback, and leather formats", () => {
  assert.equal(detectFormatBinding("Easton Press Leatherbound Classics"), "Leather Bound");
  assert.equal(detectFormatBinding("First Edition Hardcover with DJ"), "Hardcover");
  assert.equal(detectFormatBinding("Trade Paperback Edition"), "Paperback");
});

test("mapBookToEbayAspects: builds complete eBay Item Specifics payload", () => {
  const book = {
    isbn: "978-0-7432-7356-5",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    publisher: "Scribner",
    publishedYear: 1925,
    description: "Signed 1st Edition Hardcover in original Dust Jacket.",
    condition: "Fine",
    category: "Classics",
    subcategory: "American Literature",
  };

  const aspects = mapBookToEbayAspects(book);

  assert.equal(aspects.condition, "LIKE_NEW");
  assert.equal(aspects.aspects.Title[0], "The Great Gatsby");
  assert.equal(aspects.aspects.Author[0], "F. Scott Fitzgerald");
  assert.equal(aspects.aspects.Publisher[0], "Scribner");
  assert.equal(aspects.aspects["Publication Year"][0], "1925");
  assert.equal(aspects.aspects.Format[0], "Hardcover");
  assert.ok(aspects.aspects["Special Attributes"].includes("1st Edition"));
  assert.ok(aspects.aspects["Special Attributes"].includes("Signed"));
  assert.equal(aspects.aspects.ISBN[0], "9780743273565");
});

test("resolveEbayPolicies: routes high-value items ($250+) to expedited signature policy", () => {
  const config = {
    fulfillmentPolicyId: "STANDARD_MEDIA_MAIL",
    paymentPolicyId: "PAYMENT_DEFAULT",
    returnPolicyId: "RETURN_30_DAYS",
    highValueFulfillmentPolicyId: "EXPEDITED_SIGNATURE_REQUIRED",
    highValueThreshold: 250,
  };

  const standardItem = resolveEbayPolicies(config, 45.0);
  assert.equal(standardItem.fulfillmentPolicyId, "STANDARD_MEDIA_MAIL");
  assert.equal(standardItem.isHighValueRouted, false);

  const rareItem = resolveEbayPolicies(config, 550.0);
  assert.equal(rareItem.fulfillmentPolicyId, "EXPEDITED_SIGNATURE_REQUIRED");
  assert.equal(rareItem.isHighValueRouted, true);
});

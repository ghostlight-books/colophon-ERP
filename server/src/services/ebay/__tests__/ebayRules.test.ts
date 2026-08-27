import test from "node:test";
import assert from "node:assert/strict";

import { evaluateBookAgainstRule, type EbayRuleEntity } from "../../rules/ebayRules.service.js";

const sampleBook = {
  isbn: "9780140449136",
  sku: "BK-9780140449136",
  title: "The Odyssey",
  author: "Homer",
  description: "Signed 1st Edition Translation by Robert Fagles",
  coverUrl: "https://images.colophon.dev/covers/odyssey.jpg",
  listPrice: 55.0,
  condition: "Fine",
  category: "Classics",
  subcategory: "Ancient Greek",
  catalogTags: "Signed, 1st Edition",
  createdAt: new Date(Date.now() - 75 * 24 * 60 * 60 * 1000), // 75 days ago
};

test("evaluateBookAgainstRule: matches when item satisfies min price and aging criteria", () => {
  const rule: EbayRuleEntity = {
    id: "rule-1",
    name: "Aging High-Value Rule",
    enabled: true,
    minPrice: 40.0,
    maxPrice: null,
    minDaysInInventory: 60,
    requiredCondition: "Fine, Near Fine, Like New",
    mustHaveCoverImage: true,
    includeKeywords: null,
    excludeKeywords: null,
    onlyFirstEditionOrSigned: true,
    autoPublish: false,
  };

  const result = evaluateBookAgainstRule(sampleBook, rule);
  assert.equal(result.matched, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.matchedRuleName, "Aging High-Value Rule");
});

test("evaluateBookAgainstRule: rejects items below minimum price threshold", () => {
  const rule: EbayRuleEntity = {
    id: "rule-2",
    name: "Rare High Price Only",
    enabled: true,
    minPrice: 100.0, // Item is $55
    maxPrice: null,
    minDaysInInventory: null,
    requiredCondition: null,
    mustHaveCoverImage: true,
    includeKeywords: null,
    excludeKeywords: null,
    onlyFirstEditionOrSigned: false,
    autoPublish: false,
  };

  const result = evaluateBookAgainstRule(sampleBook, rule);
  assert.equal(result.matched, false);
  assert.match(result.reasons[0], /below rule minimum/);
});

test("evaluateBookAgainstRule: fails validation when missing cover image", () => {
  const bookWithoutImage = { ...sampleBook, coverUrl: null };
  const rule: EbayRuleEntity = {
    id: "rule-3",
    name: "Image Required Rule",
    enabled: true,
    minPrice: null,
    maxPrice: null,
    minDaysInInventory: null,
    requiredCondition: null,
    mustHaveCoverImage: true,
    includeKeywords: null,
    excludeKeywords: null,
    onlyFirstEditionOrSigned: false,
    autoPublish: false,
  };

  const result = evaluateBookAgainstRule(bookWithoutImage, rule);
  assert.equal(result.matched, false);
  assert.equal(result.isComplete, false);
  assert.ok(result.missingFields.includes("Cover Image"));
});


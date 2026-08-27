import test from "node:test";
import assert from "node:assert/strict";

import { calculateOpportunityScore } from "../../recommendations/ebayOpportunity.service.js";

test("calculateOpportunityScore: gives high score to rare items with high margin and low competition", () => {
  const localPrice = 20.0;
  const marketMedian = 85.0;
  const marketLowest = 75.0;
  const competitorCount = 1; // High scarcity
  const daysInInventory = 70; // Aging in store

  const scoreData = calculateOpportunityScore(
    localPrice,
    marketMedian,
    marketLowest,
    competitorCount,
    daysInInventory
  );

  assert.ok(scoreData.opportunityScore >= 75, `Expected score >= 75, got ${scoreData.opportunityScore}`);
  assert.ok(scoreData.estimatedNetMargin > 40, `Expected margin > $40, got ${scoreData.estimatedNetMargin}`);
  assert.ok(scoreData.suggestedPrice >= 70, `Expected suggested price >= $70, got ${scoreData.suggestedPrice}`);
});

test("calculateOpportunityScore: scores lower when competition is high and margin is negative after fees", () => {
  const localPrice = 30.0;
  const marketMedian = 25.0; // Selling lower on eBay than in store
  const marketLowest = 18.0;
  const competitorCount = 35; // Oversaturated
  const daysInInventory = 5;

  const scoreData = calculateOpportunityScore(
    localPrice,
    marketMedian,
    marketLowest,
    competitorCount,
    daysInInventory
  );

  assert.ok(scoreData.opportunityScore < 40, `Expected score < 40, got ${scoreData.opportunityScore}`);
  assert.ok(scoreData.estimatedNetMargin < 0, `Expected negative margin after take rate, got ${scoreData.estimatedNetMargin}`);
});


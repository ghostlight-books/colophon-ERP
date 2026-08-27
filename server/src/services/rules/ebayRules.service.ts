import { prisma } from "../../config/database.js";
import { publishBookToEbay } from "../ebay/ebayInventory.service.js";
import { extractSpecialAttributes } from "../ebay/mappers/ebayAspect.mapper.js";

export interface EbayRuleEntity {
  id: string;
  name: string;
  enabled: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  minDaysInInventory: number | null;
  requiredCondition: string | null;
  mustHaveCoverImage: boolean;
  includeKeywords: string | null;
  excludeKeywords: string | null;
  onlyFirstEditionOrSigned: boolean;
  autoPublish: boolean;
}

export interface RuleEvaluationResult {
  isbn: string;
  sku: string;
  title: string | null;
  matched: boolean;
  matchedRuleName?: string;
  autoPublish: boolean;
  isComplete: boolean;
  missingFields: string[];
  reasons: string[];
}

export function evaluateBookAgainstRule(
  book: {
    isbn: string;
    sku: string;
    title: string | null;
    author: string | null;
    description: string | null;
    coverUrl: string | null;
    listPrice: number | null;
    condition: string | null;
    category: string | null;
    subcategory: string | null;
    catalogTags: string | null;
    createdAt: Date;
  },
  rule: EbayRuleEntity
): RuleEvaluationResult {
  const reasons: string[] = [];
  const missingFields: string[] = [];

  // Completeness Checks
  if (!book.title || book.title.trim().length < 2) missingFields.push("Title");
  if (!book.author || book.author.trim().length < 2) missingFields.push("Author");
  if (!book.listPrice || book.listPrice <= 0) missingFields.push("Valid List Price");
  if (rule.mustHaveCoverImage && (!book.coverUrl || !book.coverUrl.startsWith("http"))) {
    missingFields.push("Cover Image");
  }

  const isComplete = missingFields.length === 0;
  if (!isComplete) {
    return {
      isbn: book.isbn,
      sku: book.sku,
      title: book.title,
      matched: false,
      autoPublish: false,
      isComplete: false,
      missingFields,
      reasons: [`Missing required fields: ${missingFields.join(", ")}`],
    };
  }

  const price = book.listPrice!;

  // 1. Min Price
  if (typeof rule.minPrice === "number" && rule.minPrice > 0 && price < rule.minPrice) {
    reasons.push(`Price ($${price.toFixed(2)}) is below rule minimum ($${rule.minPrice.toFixed(2)})`);
    return { isbn: book.isbn, sku: book.sku, title: book.title, matched: false, autoPublish: false, isComplete, missingFields, reasons };
  }

  // 2. Max Price
  if (typeof rule.maxPrice === "number" && rule.maxPrice > 0 && price > rule.maxPrice) {
    reasons.push(`Price ($${price.toFixed(2)}) exceeds rule maximum ($${rule.maxPrice.toFixed(2)})`);
    return { isbn: book.isbn, sku: book.sku, title: book.title, matched: false, autoPublish: false, isComplete, missingFields, reasons };
  }

  // 3. Inventory Aging (Days)
  if (typeof rule.minDaysInInventory === "number" && rule.minDaysInInventory > 0) {
    const daysInInventory = Math.floor((Date.now() - new Date(book.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysInInventory < rule.minDaysInInventory) {
      reasons.push(`Item has been in inventory for ${daysInInventory} days (rule requires at least ${rule.minDaysInInventory} days)`);
      return { isbn: book.isbn, sku: book.sku, title: book.title, matched: false, autoPublish: false, isComplete, missingFields, reasons };
    }
  }

  // 4. Condition Whitelist
  if (rule.requiredCondition && rule.requiredCondition.trim()) {
    const acceptable = rule.requiredCondition.split(",").map((c) => c.trim().toLowerCase());
    const current = (book.condition ?? "Good").toLowerCase();
    if (!acceptable.some((acc) => current.includes(acc) || acc.includes(current))) {
      reasons.push(`Condition "${book.condition}" not in whitelist: ${rule.requiredCondition}`);
      return { isbn: book.isbn, sku: book.sku, title: book.title, matched: false, autoPublish: false, isComplete, missingFields, reasons };
    }
  }

  // 5. Special Attributes (1st Edition / Signed)
  const fullText = [book.title, book.description, book.catalogTags, book.category, book.subcategory].filter(Boolean).join(" ");
  if (rule.onlyFirstEditionOrSigned) {
    const specials = extractSpecialAttributes(fullText);
    if (!specials.includes("Signed") && !specials.includes("1st Edition")) {
      reasons.push("Item is not identified as 1st Edition or Signed");
      return { isbn: book.isbn, sku: book.sku, title: book.title, matched: false, autoPublish: false, isComplete, missingFields, reasons };
    }
  }

  // 6. Include Keywords
  if (rule.includeKeywords && rule.includeKeywords.trim()) {
    const requiredWords = rule.includeKeywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    const hasAny = requiredWords.some((word) => fullText.toLowerCase().includes(word));
    if (!hasAny) {
      reasons.push(`Did not match any required include keywords: ${rule.includeKeywords}`);
      return { isbn: book.isbn, sku: book.sku, title: book.title, matched: false, autoPublish: false, isComplete, missingFields, reasons };
    }
  }

  // 7. Exclude Keywords
  if (rule.excludeKeywords && rule.excludeKeywords.trim()) {
    const excludedWords = rule.excludeKeywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    const hasExcluded = excludedWords.find((word) => fullText.toLowerCase().includes(word));
    if (hasExcluded) {
      reasons.push(`Matched excluded keyword: "${hasExcluded}"`);
      return { isbn: book.isbn, sku: book.sku, title: book.title, matched: false, autoPublish: false, isComplete, missingFields, reasons };
    }
  }

  return {
    isbn: book.isbn,
    sku: book.sku,
    title: book.title,
    matched: true,
    matchedRuleName: rule.name,
    autoPublish: rule.autoPublish,
    isComplete: true,
    missingFields: [],
    reasons: [`Matched rule "${rule.name}"`],
  };
}

export async function runRulesEvaluationForStore(
  storeId: string,
  dryRun = false
): Promise<{
  totalEvaluated: number;
  matchedCount: number;
  publishedCount: number;
  results: RuleEvaluationResult[];
}> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    include: { ebayRules: { where: { enabled: true } } },
  });
  const storePk = store?.id ?? storeId;

  const rules = store?.ebayRules ?? [];
  if (rules.length === 0) {
    return { totalEvaluated: 0, matchedCount: 0, publishedCount: 0, results: [] };
  }

  const items = await prisma.isbnLookupCache.findMany({
    where: { quantityOnHand: { gt: 0 } },
    include: {
      store: {
        include: {
          ebayListings: true,
        },
      },
    },
  });

  const activeListings = await prisma.ebayListing.findMany({
    where: { storeId: storePk },
  });
  const activeListingIsbns = new Set(
    activeListings.filter((l) => l.listingStatus === "ACTIVE" || l.autoListExcluded).map((l) => l.isbn)
  );

  const evaluationResults: RuleEvaluationResult[] = [];
  let publishedCount = 0;

  for (const item of items) {
    if (activeListingIsbns.has(item.isbn)) {
      continue; // Skip items already listed or excluded
    }

    let itemMatched = false;
    for (const rule of rules) {
      const evalRes = evaluateBookAgainstRule(item, rule);
      if (evalRes.matched) {
        evaluationResults.push(evalRes);
        itemMatched = true;

        if (!dryRun && evalRes.autoPublish) {
          try {
            await publishBookToEbay(storePk, item.isbn);
            publishedCount++;
          } catch (err) {
            console.warn(`[Rule Engine] Auto-publish failed for ${item.isbn}:`, err);
          }
        }
        break; // Match first eligible rule
      }
    }
  }

  return {
    totalEvaluated: items.length,
    matchedCount: evaluationResults.length,
    publishedCount,
    results: evaluationResults,
  };
}


import { prisma } from "../../config/database.js";
import { searchEbayMarketListings } from "../ebay/ebayBrowse.service.js";

const SCAN_CACHE_WINDOW_DAYS = 7;
const SCAN_CACHE_MS = SCAN_CACHE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const EBAY_TAKE_RATE = 0.145; // ~14.5% final value fee + payment processing
const ESTIMATED_SHIPPING_USD = 4.13; // Media Mail average

export interface OpportunityCalculationResult {
  isbn: string;
  sku: string;
  title: string | null;
  author: string | null;
  localPrice: number;
  marketLowestPrice: number | null;
  marketMedianPrice: number | null;
  marketHighestPrice: number | null;
  competitorCount: number;
  suggestedPrice: number;
  estimatedNetMargin: number;
  opportunityScore: number; // 0 to 100
  scoreBreakdown: {
    marginScore: number;
    scarcityScore: number;
    ageVelocityScore: number;
  };
}

export function calculateOpportunityScore(
  localPrice: number,
  marketMedian: number | null,
  marketLowest: number | null,
  competitorCount: number,
  daysInInventory: number
): {
  opportunityScore: number;
  suggestedPrice: number;
  estimatedNetMargin: number;
  marginScore: number;
  scarcityScore: number;
  ageVelocityScore: number;
} {
  // If no market data found, use standard markup estimate
  const effectiveMedian = marketMedian && marketMedian > 0 ? marketMedian : localPrice * 1.35;
  const suggestedPrice = Number(Math.max(localPrice, effectiveMedian * 0.96).toFixed(2));

  // Net Proceeds after eBay take rate and shipping
  const netProceeds = suggestedPrice * (1 - EBAY_TAKE_RATE) - ESTIMATED_SHIPPING_USD;
  const estimatedNetMargin = Number((netProceeds - localPrice).toFixed(2));

  // 1. Margin Score (0 - 100)
  let marginScore = 0;
  if (estimatedNetMargin > 0) {
    // $0 to $30+ margin maps to 10 - 100
    marginScore = Math.min(100, Math.round(15 + (estimatedNetMargin / 25) * 85));
  } else if (estimatedNetMargin > -3) {
    marginScore = 15;
  }

  // 2. Scarcity Score (0 - 100)
  let scarcityScore = 20;
  if (competitorCount === 0) {
    scarcityScore = 100; // Monopoly listing
  } else if (competitorCount <= 2) {
    scarcityScore = 85;
  } else if (competitorCount <= 5) {
    scarcityScore = 70;
  } else if (competitorCount <= 10) {
    scarcityScore = 50;
  } else if (competitorCount <= 20) {
    scarcityScore = 35;
  }

  // 3. Age Velocity Score (0 - 100)
  let ageVelocityScore = 30;
  if (daysInInventory >= 90) {
    ageVelocityScore = 100;
  } else if (daysInInventory >= 60) {
    ageVelocityScore = 85;
  } else if (daysInInventory >= 30) {
    ageVelocityScore = 65;
  } else if (daysInInventory >= 14) {
    ageVelocityScore = 45;
  }

  // Weighted total: 40% margin + 35% scarcity + 25% velocity
  const rawScore = (marginScore * 0.40) + (scarcityScore * 0.35) + (ageVelocityScore * 0.25);
  const opportunityScore = Math.min(100, Math.max(0, Math.round(rawScore)));

  return {
    opportunityScore,
    suggestedPrice,
    estimatedNetMargin,
    marginScore,
    scarcityScore,
    ageVelocityScore,
  };
}

export async function scanInventoryOpportunities(
  storeId: string,
  forceRescan = false,
  limit = 40
): Promise<{ scannedCount: number; updatedCount: number; opportunities: OpportunityCalculationResult[] }> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    select: { id: true },
  });
  const storePk = store?.id ?? storeId;

  // Retrieve active inventory items
  const items = await prisma.isbnLookupCache.findMany({
    where: { quantityOnHand: { gt: 0 } },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });

  const now = Date.now();
  const results: OpportunityCalculationResult[] = [];
  let scannedCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    const existingOpp = await prisma.ebayOpportunity.findUnique({
      where: { storeId_isbn: { storeId: storePk, isbn: item.isbn } },
    });

    const isCacheFresh = existingOpp && (now - new Date(existingOpp.scannedAt).getTime() < SCAN_CACHE_MS);
    if (isCacheFresh && !forceRescan) {
      results.push({
        isbn: item.isbn,
        sku: item.sku,
        title: item.title,
        author: item.author,
        localPrice: existingOpp.localPrice,
        marketLowestPrice: existingOpp.marketLowestPrice,
        marketMedianPrice: existingOpp.marketMedianPrice,
        marketHighestPrice: existingOpp.marketHighestPrice,
        competitorCount: existingOpp.competitorCount,
        suggestedPrice: existingOpp.suggestedPrice ?? existingOpp.localPrice,
        estimatedNetMargin: existingOpp.estimatedNetMargin ?? 0,
        opportunityScore: existingOpp.opportunityScore,
        scoreBreakdown: {
          marginScore: Math.round(existingOpp.opportunityScore * 0.4),
          scarcityScore: Math.round(existingOpp.opportunityScore * 0.35),
          ageVelocityScore: Math.round(existingOpp.opportunityScore * 0.25),
        },
      });
      continue;
    }

    scannedCount++;
    const localPrice = item.listPrice && item.listPrice > 0 ? item.listPrice : 14.99;
    const daysInInventory = Math.floor((now - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    // Research market pricing via Browse API
    const marketData = await searchEbayMarketListings(storePk, item.isbn, item.title, item.author);

    const scoreResult = calculateOpportunityScore(
      localPrice,
      marketData.marketMedianPrice,
      marketData.marketLowestPrice,
      marketData.competitorCount,
      daysInInventory
    );

    // Upsert into EbayOpportunity table
    await prisma.ebayOpportunity.upsert({
      where: { storeId_isbn: { storeId: storePk, isbn: item.isbn } },
      create: {
        storeId: storePk,
        isbn: item.isbn,
        sku: item.sku,
        title: item.title,
        author: item.author,
        localPrice,
        opportunityScore: scoreResult.opportunityScore,
        marketLowestPrice: marketData.marketLowestPrice,
        marketMedianPrice: marketData.marketMedianPrice,
        marketHighestPrice: marketData.marketHighestPrice,
        competitorCount: marketData.competitorCount,
        suggestedPrice: scoreResult.suggestedPrice,
        estimatedNetMargin: scoreResult.estimatedNetMargin,
        scannedAt: new Date(),
      },
      update: {
        localPrice,
        opportunityScore: scoreResult.opportunityScore,
        marketLowestPrice: marketData.marketLowestPrice,
        marketMedianPrice: marketData.marketMedianPrice,
        marketHighestPrice: marketData.marketHighestPrice,
        competitorCount: marketData.competitorCount,
        suggestedPrice: scoreResult.suggestedPrice,
        estimatedNetMargin: scoreResult.estimatedNetMargin,
        scannedAt: new Date(),
      },
    });

    updatedCount++;

    results.push({
      isbn: item.isbn,
      sku: item.sku,
      title: item.title,
      author: item.author,
      localPrice,
      marketLowestPrice: marketData.marketLowestPrice,
      marketMedianPrice: marketData.marketMedianPrice,
      marketHighestPrice: marketData.marketHighestPrice,
      competitorCount: marketData.competitorCount,
      suggestedPrice: scoreResult.suggestedPrice,
      estimatedNetMargin: scoreResult.estimatedNetMargin,
      opportunityScore: scoreResult.opportunityScore,
      scoreBreakdown: {
        marginScore: scoreResult.marginScore,
        scarcityScore: scoreResult.scarcityScore,
        ageVelocityScore: scoreResult.ageVelocityScore,
      },
    });
  }

  // Sort results by highest opportunity score
  results.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return { scannedCount, updatedCount, opportunities: results };
}

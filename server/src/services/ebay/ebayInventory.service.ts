import { EbayClient } from "./ebayClient.service.js";
import { prisma } from "../../config/database.js";
import { mapBookToEbayAspects } from "./mappers/ebayAspect.mapper.js";
import { resolveEbayCategory } from "./mappers/ebayCategory.mapper.js";
import { resolveEbayPolicies } from "./mappers/ebayPolicy.mapper.js";

export interface EbayInventoryItemPayload {
  availability: {
    shipToLocationAvailability: {
      quantity: number;
    };
  };
  condition: string;
  conditionDescription?: string;
  conditionDescriptors?: Array<{ name: string; value: string[]; additionalInfo?: string }>;
  product: {
    title: string;
    description: string;
    aspects: Record<string, string[]>;
    imageUrls: string[];
    isbn?: string[];
  };
  packageWeightAndSize?: {
    weight: {
      value: number;
      unit: "POUND" | "OUNCE";
    };
    dimensions?: {
      length: number;
      width: number;
      height: number;
      unit: "INCH";
    };
  };
}

export interface EbayOfferPayload {
  sku: string;
  marketplaceId: "EBAY_US";
  format: "FIXED_PRICE";
  availableQuantity: number;
  categoryId: string;
  listingDescription: string;
  pricingSummary: {
    price: {
      value: string;
      currency: "USD";
    };
  };
  listingPolicies: {
    fulfillmentPolicyId?: string;
    paymentPolicyId?: string;
    returnPolicyId?: string;
  };
  merchantLocationKey: string;
}

export async function createOrReplaceInventoryItem(
  storeId: string,
  isbn: string,
  quantityOverride?: number
): Promise<{ success: boolean; sku: string; message?: string }> {
  const book = await prisma.isbnLookupCache.findUnique({ where: { isbn } });
  if (!book) {
    throw new Error(`Book with ISBN ${isbn} was not found in catalog.`);
  }

  const client = await EbayClient.forStore(storeId);
  const aspectResult = mapBookToEbayAspects(book);

  const images = [book.coverUrl].filter((url): url is string => Boolean(url && url.startsWith("http")));
  if (images.length === 0) {
    images.push("https://covers.openlibrary.org/b/isbn/" + book.isbn + "-L.jpg");
  }

  const quantity = typeof quantityOverride === "number" ? quantityOverride : Math.max(1, book.quantityOnHand);

  const payload: EbayInventoryItemPayload = {
    availability: {
      shipToLocationAvailability: {
        quantity,
      },
    },
    condition: aspectResult.condition,
    conditionDescription: aspectResult.conditionDescription,
    ...(aspectResult.conditionDescriptors.length > 0 ? { conditionDescriptors: aspectResult.conditionDescriptors } : {}),
    product: {
      title: (book.title ?? `Book ISBN ${book.isbn}`).slice(0, 80),
      description: `<h3>${book.title ?? "Book"}</h3><p><strong>Author:</strong> ${book.author ?? "Unknown"}</p><p><strong>Condition:</strong> ${aspectResult.conditionDescription}</p><p>${book.description ?? "Clean independent bookstore copy."}</p>`,
      aspects: aspectResult.aspects,
      imageUrls: images,
      isbn: [book.isbn.replace(/[^0-9X]/gi, "")],
    },
    packageWeightAndSize: {
      weight: {
        value: 1.2,
        unit: "POUND",
      },
      dimensions: {
        length: 9,
        width: 6,
        height: 1.5,
        unit: "INCH",
      },
    },
  };

  const endpoint = `/sell/inventory/v1/inventory_item/${encodeURIComponent(book.sku)}`;
  await client.request(endpoint, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  return { success: true, sku: book.sku };
}

export async function createOrUpdateOffer(
  storeId: string,
  isbn: string,
  priceOverride?: number
): Promise<{ offerId: string; categoryId: string; price: number }> {
  const [book, store] = await Promise.all([
    prisma.isbnLookupCache.findUnique({ where: { isbn } }),
    prisma.store.findFirst({
      where: { OR: [{ id: storeId }, { slug: storeId }] },
      include: { ebayConfig: true },
    }),
  ]);

  if (!book) throw new Error(`Book ${isbn} not found.`);
  if (!store?.ebayConfig) throw new Error("eBay store configuration not found.");

  const client = await EbayClient.forStore(storeId);
  const targetPrice = priceOverride ?? (book.listPrice && book.listPrice > 0 ? book.listPrice : 19.99);

  // Check if an existing offer exists for this SKU
  const existingOffers = await client.request<{ offers?: Array<{ offerId: string; sku: string }> }>(
    `/sell/inventory/v1/offer?sku=${encodeURIComponent(book.sku)}`
  ).catch(() => ({ data: { offers: [] } }));

  const categoryResolution = resolveEbayCategory({
    title: book.title,
    description: book.description,
    category: book.category,
    subcategory: book.subcategory,
    catalogTags: book.catalogTags,
    seoKeywords: book.seoKeywords,
    price: targetPrice,
    condition: book.condition,
  });

  const policyResolution = resolveEbayPolicies(store.ebayConfig, targetPrice);

  const offerPayload: EbayOfferPayload = {
    sku: book.sku,
    marketplaceId: "EBAY_US",
    format: "FIXED_PRICE",
    availableQuantity: Math.max(1, book.quantityOnHand),
    categoryId: categoryResolution.categoryId,
    listingDescription: `<p>${book.title ?? "Book"} by ${book.author ?? "Unknown"}. Shipped promptly with tracking from Ghostlight Books.</p>`,
    pricingSummary: {
      price: {
        value: targetPrice.toFixed(2),
        currency: "USD",
      },
    },
    listingPolicies: {
      ...(policyResolution.fulfillmentPolicyId ? { fulfillmentPolicyId: policyResolution.fulfillmentPolicyId } : {}),
      ...(policyResolution.paymentPolicyId ? { paymentPolicyId: policyResolution.paymentPolicyId } : {}),
      ...(policyResolution.returnPolicyId ? { returnPolicyId: policyResolution.returnPolicyId } : {}),
    },
    merchantLocationKey: policyResolution.merchantLocationKey,
  };

  const existingOfferId = existingOffers.data?.offers?.[0]?.offerId;
  if (existingOfferId) {
    await client.request(`/sell/inventory/v1/offer/${existingOfferId}`, {
      method: "PUT",
      body: JSON.stringify(offerPayload),
    });
    return { offerId: existingOfferId, categoryId: categoryResolution.categoryId, price: targetPrice };
  }

  const createRes = await client.request<{ offerId: string }>("/sell/inventory/v1/offer", {
    method: "POST",
    body: JSON.stringify(offerPayload),
  });

  return { offerId: createRes.data.offerId, categoryId: categoryResolution.categoryId, price: targetPrice };
}

export async function publishOffer(
  storeId: string,
  offerId: string
): Promise<{ listingId: string }> {
  const client = await EbayClient.forStore(storeId);
  const response = await client.request<{ listingId: string }>(
    `/sell/inventory/v1/offer/${offerId}/publish/`,
    { method: "POST" }
  );

  return { listingId: response.data.listingId };
}

export async function withdrawOffer(
  storeId: string,
  isbn: string
): Promise<{ success: boolean; message?: string }> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    select: { id: true },
  });
  const storePk = store?.id ?? storeId;

  const listing = await prisma.ebayListing.findUnique({
    where: { storeId_isbn: { storeId: storePk, isbn } },
  });

  if (!listing || !listing.ebayOfferId || listing.listingStatus !== "ACTIVE") {
    return { success: true, message: "No active eBay listing to withdraw." };
  }

  try {
    const client = await EbayClient.forStore(storePk);
    await client.request(`/sell/inventory/v1/offer/${listing.ebayOfferId}/withdraw`, {
      method: "POST",
    });

    await prisma.ebayListing.update({
      where: { id: listing.id },
      data: {
        listingStatus: "ENDED",
        lastSyncedAt: new Date(),
      },
    });

    await prisma.ebaySyncLog.create({
      data: {
        storeId: storePk,
        direction: "OUTBOUND",
        eventType: "OFFER_WITHDRAW",
        isbn,
        sku: listing.sku,
        status: "SUCCESS",
        payload: JSON.stringify({ offerId: listing.ebayOfferId }),
        response: JSON.stringify({ status: "ENDED" }),
      },
    });

    return { success: true, message: `eBay listing for ${isbn} withdrawn.` };
  } catch (err: any) {
    await prisma.ebaySyncLog.create({
      data: {
        storeId: storePk,
        direction: "OUTBOUND",
        eventType: "OFFER_WITHDRAW",
        isbn,
        sku: listing.sku,
        status: "FAILURE",
        errorMessage: err.message,
      },
    });
    throw err;
  }
}

export async function publishBookToEbay(
  storeId: string,
  isbn: string,
  priceOverride?: number
): Promise<{ success: boolean; listingId?: string; ebayUrl?: string; message: string }> {
  const store = await prisma.store.findFirst({
    where: { OR: [{ id: storeId }, { slug: storeId }] },
    select: { id: true },
  });
  const storePk = store?.id ?? storeId;

  const book = await prisma.isbnLookupCache.findUnique({ where: { isbn } });
  if (!book) throw new Error(`Book ${isbn} not found.`);

  try {
    // Step 1: Create or Replace Inventory Item
    await createOrReplaceInventoryItem(storePk, isbn);

    // Step 2: Create or Update Offer
    const offerRes = await createOrUpdateOffer(storePk, isbn, priceOverride);

    // Step 3: Publish Offer
    const pubRes = await publishOffer(storePk, offerRes.offerId);
    const ebayUrl = `https://www.ebay.com/itm/${pubRes.listingId}`;

    // Step 4: Upsert listing record
    await prisma.ebayListing.upsert({
      where: { storeId_isbn: { storeId: storePk, isbn } },
      create: {
        storeId: storePk,
        isbn: book.isbn,
        sku: book.sku,
        ebayItemId: pubRes.listingId,
        ebayOfferId: offerRes.offerId,
        listingStatus: "ACTIVE",
        price: offerRes.price,
        ebayCategoryId: offerRes.categoryId,
        ebayUrl,
        lastSyncedAt: new Date(),
      },
      update: {
        ebayItemId: pubRes.listingId,
        ebayOfferId: offerRes.offerId,
        listingStatus: "ACTIVE",
        price: offerRes.price,
        ebayCategoryId: offerRes.categoryId,
        ebayUrl,
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });

    // Step 5: Log audit entry
    await prisma.ebaySyncLog.create({
      data: {
        storeId: storePk,
        direction: "OUTBOUND",
        eventType: "OFFER_PUBLISH",
        isbn: book.isbn,
        sku: book.sku,
        status: "SUCCESS",
        payload: JSON.stringify({ offerId: offerRes.offerId, price: offerRes.price }),
        response: JSON.stringify({ listingId: pubRes.listingId, ebayUrl }),
      },
    });

    return {
      success: true,
      listingId: pubRes.listingId,
      ebayUrl,
      message: `Published ${book.title ?? book.isbn} to eBay (Item ID: ${pubRes.listingId})`,
    };
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    await prisma.ebayListing.upsert({
      where: { storeId_isbn: { storeId: storePk, isbn } },
      create: {
        storeId: storePk,
        isbn: book.isbn,
        sku: book.sku,
        listingStatus: "ERROR",
        price: priceOverride ?? book.listPrice ?? 0,
        lastError: errorMsg,
        lastSyncedAt: new Date(),
      },
      update: {
        listingStatus: "ERROR",
        lastError: errorMsg,
        lastSyncedAt: new Date(),
      },
    });

    await prisma.ebaySyncLog.create({
      data: {
        storeId: storePk,
        direction: "OUTBOUND",
        eventType: "OFFER_PUBLISH",
        isbn: book.isbn,
        sku: book.sku,
        status: "FAILURE",
        errorMessage: errorMsg,
      },
    });

    throw error;
  }
}


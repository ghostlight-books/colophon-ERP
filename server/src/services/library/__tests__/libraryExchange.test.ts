import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import {
  listExchangeMarketplace,
  submitLibraryOffer,
  listIncomingLibraryOffers,
  respondToLibraryOffer,
  getLibraryNotifications,
  markLibraryNotificationRead,
  getLibraryCollectionHealth,
} from "../libraryExchange.service.js";
import {
  createLibraryVolume,
  deleteLibraryVolume,
  ensureLibraryTablesExist,
} from "../libraryVolume.service.js";
import { prisma } from "../../../config/database.js";

describe("Library Exchange & Offers Engine", () => {
  const createdVolumeIds: string[] = [];
  const createdOfferIds: string[] = [];

  beforeEach(async () => {
    await ensureLibraryTablesExist();
  });

  after(async () => {
    // Delete created offers
    for (const offerId of createdOfferIds) {
      try {
        await prisma.libraryOffer.delete({ where: { id: offerId } });
      } catch {}
    }
    // Delete created volumes
    for (const volId of createdVolumeIds) {
      try {
        await deleteLibraryVolume(volId);
      } catch {}
    }
  });

  test("creates a library volume open for trade and lists it in marketplace", async () => {
    const volume = await createLibraryVolume({
      isbn: "9780060935467",
      title: "Temporary Mockingbird Trade Test",
      author: "Harper Lee",
      deweyDecimal: "813.54",
      replacementValue: 125.0,
      listingStatus: "OPEN_FOR_TRADE",
      askingPrice: 120.0,
      tradePreferences: "Looking for vintage Faulkner or Steinbeck",
    });

    createdVolumeIds.push(volume.id);
    assert.ok(volume.id);
    assert.equal(volume.listingStatus, "OPEN_FOR_TRADE");
    assert.equal(volume.tradePreferences, "Looking for vintage Faulkner or Steinbeck");

    const market = await listExchangeMarketplace({ query: "Mockingbird" });
    const match = market.find((m) => m.id === volume.id);
    assert.ok(match, "Marketplace includes book marked for trade");
    assert.equal(match?.listingStatus, "OPEN_FOR_TRADE");
  });

  test("submits cash and trade offers on open volumes and retrieves incoming offers", async () => {
    const volume = await createLibraryVolume({
      isbn: "9780345391803",
      title: "Temporary Hitchhiker Offer Test",
      author: "Douglas Adams",
      deweyDecimal: "823.914",
      replacementValue: 45.0,
      listingStatus: "ALLOW_OFFERS",
      askingPrice: 40.0,
    });

    createdVolumeIds.push(volume.id);

    // 1. Submit a cash offer
    const offer = await submitLibraryOffer({
      volumeId: volume.id,
      offerType: "CASH",
      offererType: "COLLECTOR",
      offererName: "Arthur Dent",
      offererEmail: "arthur@earth.org",
      cashOfferAmount: 35.0,
      notes: "Will pay via PayPal or in cash at book fair.",
    });

    createdOfferIds.push(offer.id);
    assert.ok(offer.id);
    assert.equal(offer.status, "PENDING");
    assert.equal(offer.cashOfferAmount, 35.0);

    // 2. Submit a bookstore buy offer
    const storeOffer = await submitLibraryOffer({
      volumeId: volume.id,
      offerType: "BOOKSTORE_BUY_OFFER",
      offererType: "BOOKSTORE",
      offererStoreName: "Ghostlight Books",
      offererName: "Sarah (Buyer)",
      offererEmail: "buyer@ghostlightbooks.com",
      cashOfferAmount: 28.0,
      notes: "Offering $28 cash or $38 store trade credit.",
    });

    createdOfferIds.push(storeOffer.id);
    assert.ok(storeOffer.id);
    assert.equal(storeOffer.offerType, "BOOKSTORE_BUY_OFFER");

    // 3. List incoming offers
    const incoming = await listIncomingLibraryOffers();
    const volumeOffers = incoming.filter((o) => o.volumeId === volume.id);
    assert.equal(volumeOffers.length, 2);

    // 4. Respond to offer (Counter-offer)
    const countered = await respondToLibraryOffer({
      offerId: offer.id,
      action: "COUNTER",
      counterAmount: 38.0,
      counterNotes: "Meet in the middle at $38?",
    });

    assert.equal(countered.status, "COUNTERED");
    assert.equal(countered.counterAmount, 38.0);
  });

  test("generates collection health and completeness metrics", async () => {
    const health = await getLibraryCollectionHealth();
    assert.ok(typeof health.totalVolumes === "number");
    assert.ok(typeof health.classificationPercent === "number");
    assert.ok(typeof health.totalInsuredValue === "number");
    assert.ok(["excellent", "good", "needs_attention"].includes(health.healthStatus));
  });

  test("manages library-specific notifications", async () => {
    const notifications = await getLibraryNotifications(5);
    assert.ok(Array.isArray(notifications));
    if (notifications.length > 0) {
      const read = await markLibraryNotificationRead(notifications[0].id);
      assert.equal(read.read, true);
    }
  });
});

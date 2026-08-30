import { prisma } from "../../config/database.js";
import { ensureLibraryTablesExist } from "./libraryVolume.service.js";

export interface CreateOfferInput {
  volumeId: string;
  offerType: "CASH" | "TRADE" | "BOOKSTORE_BUY_OFFER";
  offererType?: "COLLECTOR" | "BOOKSTORE";
  offererId?: string;
  offererName: string;
  offererEmail: string;
  offererStoreName?: string;
  cashOfferAmount?: number;
  offeredTradeItemsJson?: string;
  notes?: string;
}

export interface RespondOfferInput {
  offerId: string;
  action: "ACCEPT" | "COUNTER" | "DECLINE" | "COMPLETE";
  counterAmount?: number;
  counterNotes?: string;
}

export interface ExchangeMarketplaceFilters {
  query?: string;
  status?: "ALLOW_OFFERS" | "OPEN_FOR_TRADE" | "FOR_SALE";
  deweyPrefix?: string;
  maxPrice?: number;
  limit?: number;
}

// 1. Browse Public/Community Library Marketplace (titles open for trade or offers)
export async function listExchangeMarketplace(filters: ExchangeMarketplaceFilters = {}) {
  await ensureLibraryTablesExist();

  const whereClause: any = {
    listingStatus: {
      in: filters.status ? [filters.status] : ["ALLOW_OFFERS", "OPEN_FOR_TRADE", "FOR_SALE"],
    },
  };

  if (filters.query) {
    const q = filters.query.trim();
    whereClause.OR = [
      { title: { contains: q } },
      { author: { contains: q } },
      { isbn: { contains: q } },
      { tradePreferences: { contains: q } },
    ];
  }

  if (filters.deweyPrefix) {
    whereClause.deweyDecimal = { startsWith: filters.deweyPrefix };
  }

  if (typeof filters.maxPrice === "number" && !isNaN(filters.maxPrice)) {
    whereClause.askingPrice = { lte: filters.maxPrice };
  }

  const items = await prisma.libraryVolume.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    take: filters.limit ?? 50,
    include: {
      offers: {
        where: { status: "PENDING" },
        select: { id: true, offerType: true, cashOfferAmount: true },
      },
    },
  });

  return items;
}

// 2. Submit a Cash or Trade Offer on a Library Volume
export async function submitLibraryOffer(input: CreateOfferInput) {
  await ensureLibraryTablesExist();

  const volume = await prisma.libraryVolume.findUnique({
    where: { id: input.volumeId },
  });

  if (!volume) {
    throw new Error(`Library volume ${input.volumeId} not found.`);
  }

  if (volume.listingStatus === "COLLECTION_ONLY") {
    throw new Error(`"${volume.title}" is marked as Permanent Collection and is not currently accepting offers.`);
  }

  const offer = await prisma.libraryOffer.create({
    data: {
      volumeId: input.volumeId,
      offerType: input.offerType,
      offererType: input.offererType || "COLLECTOR",
      offererId: input.offererId,
      offererName: input.offererName,
      offererEmail: input.offererEmail,
      offererStoreName: input.offererStoreName,
      cashOfferAmount: input.cashOfferAmount,
      offeredTradeItemsJson: input.offeredTradeItemsJson,
      notes: input.notes,
      status: "PENDING",
    },
  });

  // Create an in-app notification for the collection owner
  const formattedAmount = input.cashOfferAmount ? `$${input.cashOfferAmount.toFixed(2)}` : "a trade proposal";
  const offererDesc = input.offererStoreName
    ? `${input.offererStoreName} (${input.offererName})`
    : input.offererName;

  await prisma.libraryNotification.create({
    data: {
      title: `New ${input.offerType === "BOOKSTORE_BUY_OFFER" ? "Bookstore Buy Offer" : input.offerType === "TRADE" ? "Trade Proposal" : "Cash Offer"}`,
      detail: `${offererDesc} offered ${formattedAmount} for "${volume.title}".`,
      type: input.offerType === "TRADE" ? "TRADE" : "OFFER",
      actionUrl: `/library/exchange?offerId=${offer.id}`,
    },
  });

  return offer;
}

// 3. List all incoming offers for the current user's library
export async function listIncomingLibraryOffers() {
  await ensureLibraryTablesExist();

  // Clean up any orphaned offers from deleted volumes
  await prisma.$executeRawUnsafe(
    `DELETE FROM "LibraryOffer" WHERE "volumeId" NOT IN (SELECT "id" FROM "LibraryVolume")`
  ).catch(() => null);

  const offers = await prisma.libraryOffer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      volume: {
        select: {
          id: true,
          title: true,
          author: true,
          coverUrl: true,
          isbn: true,
          deweyDecimal: true,
          replacementValue: true,
          askingPrice: true,
          tradePreferences: true,
          listingStatus: true,
          roomName: true,
          shelfName: true,
        },
      },
    },
  });

  return offers;
}

// 4. Respond to an Offer (Accept, Counter, Decline, Complete)
export async function respondToLibraryOffer(input: RespondOfferInput) {
  await ensureLibraryTablesExist();

  const offer = await prisma.libraryOffer.findUnique({
    where: { id: input.offerId },
    include: { volume: true },
  });

  if (!offer) {
    throw new Error(`Offer with ID ${input.offerId} not found.`);
  }

  const newStatus =
    input.action === "ACCEPT"
      ? "ACCEPTED"
      : input.action === "COUNTER"
      ? "COUNTERED"
      : input.action === "DECLINE"
      ? "DECLINED"
      : "COMPLETED";

  const updatedOffer = await prisma.libraryOffer.update({
    where: { id: input.offerId },
    data: {
      status: newStatus,
      counterAmount: input.counterAmount,
      counterNotes: input.counterNotes,
    },
  });

  // If accepted and trade completed, log notification
  const actionLabel =
    input.action === "ACCEPT"
      ? "accepted your offer"
      : input.action === "COUNTER"
      ? `counter-offered $${input.counterAmount?.toFixed(2) || ""}`
      : "declined your offer";

  await prisma.libraryNotification.create({
    data: {
      title: `Offer Update: "${offer.volume.title}"`,
      detail: `Owner ${actionLabel} on "${offer.volume.title}".`,
      type: "OFFER",
      actionUrl: `/library/exchange`,
    },
  });

  return updatedOffer;
}

// 5. Get Notifications for Library
export async function getLibraryNotifications(limit = 20) {
  await ensureLibraryTablesExist();

  const notifications = await prisma.libraryNotification.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return notifications;
}

export async function markLibraryNotificationRead(id: string) {
  await ensureLibraryTablesExist();
  return prisma.libraryNotification.update({
    where: { id },
    data: { read: true },
  });
}

export async function markAllLibraryNotificationsRead() {
  await ensureLibraryTablesExist();
  return prisma.libraryNotification.updateMany({
    where: { read: false },
    data: { read: true },
  });
}

// 6. Comprehensive Collection Health & Insights (distinct from Store Health)
export async function getLibraryCollectionHealth() {
  await ensureLibraryTablesExist();

  const [totalVolumes, classifiedDewey, classifiedLoc, loanedVolumes, openOffers, unreadNotes, allVolumes] =
    await Promise.all([
      prisma.libraryVolume.count(),
      prisma.libraryVolume.count({
        where: {
          deweyDecimal: { not: null },
        },
      }),
      prisma.libraryVolume.count({
        where: {
          locClassification: { not: null },
        },
      }),
      prisma.libraryVolume.count({
        where: { isLoaned: true },
      }),
      prisma.libraryOffer.count({
        where: { status: "PENDING" },
      }),
      prisma.libraryNotification.count({
        where: { read: false },
      }),
      prisma.libraryVolume.findMany({
        select: { replacementValue: true },
      }),
    ]);

  const totalValue = allVolumes.reduce((sum, v) => sum + (v.replacementValue || 0), 0);
  const classificationPercent = totalVolumes > 0 ? Math.round((classifiedDewey / totalVolumes) * 100) : 100;

  return {
    totalVolumes,
    classificationPercent,
    classifiedDeweyCount: classifiedDewey,
    classifiedLocCount: classifiedLoc,
    loanedVolumesCount: loanedVolumes,
    openOffersCount: openOffers,
    unreadNotificationsCount: unreadNotes,
    totalInsuredValue: totalValue,
    healthStatus: classificationPercent > 80 ? "excellent" : classificationPercent > 50 ? "good" : "needs_attention",
  };
}


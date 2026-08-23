import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const book = await prisma.book.upsert({
    where: { isbn13: "9780143127741" },
    update: {},
    create: {
      isbn13: "9780143127741",
      title: "The Martian",
      author: "Andy Weir",
      publisher: "Broadway Books",
      publishedYear: 2014,
      listPriceCents: 1799,
      genre: "Science Fiction"
    }
  });

  const inventory = await prisma.inventoryItem.upsert({
    where: { sku: "BK-9780143127741-USED-GOOD" },
    update: {},
    create: {
      bookId: book.id,
      sku: "BK-9780143127741-USED-GOOD",
      condition: "GOOD",
      quantityOnHand: 4,
      quantityReserved: 0,
      locationCode: "A1-SF"
    }
  });

  await prisma.isbnLookupCache.upsert({
    where: { isbn: book.isbn13 },
    update: {
      title: book.title,
      author: book.author,
      publisher: book.publisher,
      quantityOnHand: inventory.quantityOnHand,
      listPrice: book.listPriceCents / 100,
      category: book.genre,
      sku: inventory.sku,
      labelTitle: book.title,
      source: "seed-sync",
      mediaType: "Book",
    },
    create: {
      isbn: book.isbn13,
      title: book.title,
      author: book.author,
      publisher: book.publisher,
      quantityOnHand: inventory.quantityOnHand,
      listPrice: book.listPriceCents / 100,
      category: book.genre,
      sku: inventory.sku,
      labelTitle: book.title,
      source: "seed-sync",
      mediaType: "Book",
    },
  });

  await prisma.networkPeer.upsert({
    where: { endpoint: "https://peer1.colophon.local" },
    update: { status: "ONLINE" },
    create: {
      name: "Peer 1",
      endpoint: "https://peer1.colophon.local",
      status: "ONLINE"
    }
  });

  await prisma.posTransaction.create({
    data: {
      transactionNumber: `TXN-${Date.now()}`,
      cashierUserId: "00000000-0000-0000-0000-000000000001",
      subtotalCents: 1200,
      taxCents: 96,
      totalCents: 1296,
      paymentMethod: "CARD",
      lineItems: {
        create: [
          {
            inventoryItemId: inventory.id,
            quantity: 1,
            unitPriceCents: 1200,
            lineTotalCents: 1200
          }
        ]
      }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

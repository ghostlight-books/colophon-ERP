export interface BookCategoryContext {
  title?: string | null;
  author?: string | null;
  description?: string | null;
  publishedYear?: number | null;
  catalogTags?: string | null;
  seoKeywords?: string | null;
  category?: string | null;
  subcategory?: string | null;
  price?: number | null;
  condition?: string | null;
}

export const EBAY_CATEGORY_ANTIQUARIAN_BOOKS = "29223"; // Books & Magazines > Antiquarian & Collectible
export const EBAY_CATEGORY_GENERAL_BOOKS = "267"; // Books & Magazines > Books

const ANTIQUARIAN_KEYWORDS = [
  "signed",
  "autographed",
  "first edition",
  "1st edition",
  "1st ed",
  "first printing",
  "1st printing",
  "inscribed",
  "rare",
  "collectible",
  "limited edition",
  "numbered edition",
  "leather bound",
  "leatherbound",
  "antique",
  "antiquarian",
  "vintage book",
  "illuminated",
  "folio society",
  "franklin library",
  "easton press",
];

export function resolveEbayCategory(book: BookCategoryContext): {
  categoryId: string;
  categoryName: string;
  isAntiquarian: boolean;
  reason: string;
} {
  // 1. Check publication vintage threshold (pre-1970)
  if (book.publishedYear && book.publishedYear > 0 && book.publishedYear <= 1970) {
    return {
      categoryId: EBAY_CATEGORY_ANTIQUARIAN_BOOKS,
      categoryName: "Books & Magazines > Antiquarian & Collectible",
      isAntiquarian: true,
      reason: `Published in ${book.publishedYear} (pre-1970 vintage/antique threshold)`,
    };
  }

  // 2. Check title, description, tags, and category for collectible keywords
  const searchableText = [
    book.title,
    book.description,
    book.catalogTags,
    book.seoKeywords,
    book.category,
    book.subcategory,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const keyword of ANTIQUARIAN_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(searchableText)) {
      return {
        categoryId: EBAY_CATEGORY_ANTIQUARIAN_BOOKS,
        categoryName: "Books & Magazines > Antiquarian & Collectible",
        isAntiquarian: true,
        reason: `Matched collectible keyword: "${keyword}"`,
      };
    }
  }

  // 3. High value condition check (Fine / Near Fine over $150)
  const normCondition = (book.condition ?? "").toLowerCase();
  if ((normCondition.includes("fine") || normCondition.includes("mint")) && (book.price ?? 0) >= 150) {
    return {
      categoryId: EBAY_CATEGORY_ANTIQUARIAN_BOOKS,
      categoryName: "Books & Magazines > Antiquarian & Collectible",
      isAntiquarian: true,
      reason: `High value collectible item ($${book.price} in ${book.condition} condition)`,
    };
  }

  // Default to standard trade books category
  return {
    categoryId: EBAY_CATEGORY_GENERAL_BOOKS,
    categoryName: "Books & Magazines > Books",
    isAntiquarian: false,
    reason: "Standard trade book catalog entry",
  };
}

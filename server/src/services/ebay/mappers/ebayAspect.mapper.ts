export interface BookAspectContext {
  isbn: string;
  title: string | null;
  author: string | null;
  publisher: string | null;
  publishedYear?: number | null;
  description?: string | null;
  condition?: string | null;
  category?: string | null;
  subcategory?: string | null;
  catalogTags?: string | null;
  mediaType?: string;
  language?: string;
}

export type EbayConditionEnum = "NEW" | "LIKE_NEW" | "VERY_GOOD" | "GOOD" | "ACCEPTABLE";

export interface EbayConditionDescriptor {
  name: string;
  value: string[];
  additionalInfo?: string;
}

export interface EbayAspectResult {
  condition: EbayConditionEnum;
  conditionId: number;
  conditionDescription: string;
  conditionDescriptors: EbayConditionDescriptor[];
  aspects: Record<string, string[]>;
}

export function mapConditionToEbay(conditionRaw?: string | null): {
  condition: EbayConditionEnum;
  conditionId: number;
  description: string;
} {
  const norm = (conditionRaw ?? "").trim().toLowerCase();

  if (norm.includes("mint") || norm === "new" || norm.includes("brand new")) {
    return {
      condition: "NEW",
      conditionId: 1000,
      description: "Brand new, unread copy in perfect condition.",
    };
  }

  if (norm.includes("near fine") || norm.includes("very good") || norm === "vg") {
    return {
      condition: "VERY_GOOD",
      conditionId: 4000,
      description: "Very good condition. Minimal shelf wear, tight spine, clean text block.",
    };
  }

  if (norm.includes("fine") || norm.includes("like new")) {
    return {
      condition: "LIKE_NEW",
      conditionId: 2750,
      description: "Appears unread. Crisp, clean cover and pristine pages without remainder marks.",
    };
  }

  if (norm.includes("good") || norm === "g") {
    return {
      condition: "GOOD",
      conditionId: 5000,
      description: "Good condition. Standard shelf wear; tight binding, complete and intact pages.",
    };
  }

  // Fair / Reading Copy / Acceptable
  return {
    condition: "ACCEPTABLE",
    conditionId: 6000,
    description: "Acceptable reading copy. Noticeable cosmetic wear, complete text.",
  };
}

export function extractSpecialAttributes(text: string): string[] {
  const attributes: string[] = [];
  const lower = text.toLowerCase();

  if (lower.includes("1st edition") || lower.includes("first edition") || lower.includes("1st ed")) {
    attributes.push("1st Edition");
  }
  if (lower.includes("signed") || lower.includes("autographed")) {
    attributes.push("Signed");
  }
  if (lower.includes("inscribed")) {
    attributes.push("Inscribed");
  }
  if (lower.includes("dust jacket") || lower.includes("with dj") || lower.includes("in dj")) {
    attributes.push("Dust Jacket");
  }
  if (lower.includes("illustrated") || lower.includes("illustrations")) {
    attributes.push("Illustrated");
  }
  if (lower.includes("limited edition") || lower.includes("numbered edition")) {
    attributes.push("Limited Edition");
  }
  if (lower.includes("leather") || lower.includes("leatherbound")) {
    attributes.push("Leather Bound");
  }
  if (lower.includes("large print")) {
    attributes.push("Large Print");
  }

  return attributes;
}

export function detectFormatBinding(text: string, mediaType = "Book"): string {
  const lower = text.toLowerCase();
  if (lower.includes("leather")) return "Leather Bound";
  if (lower.includes("hardcover") || lower.includes("hardback") || lower.includes("cloth")) return "Hardcover";
  if (lower.includes("paperback") || lower.includes("softcover") || lower.includes("trade paper") || lower.includes("mass market")) return "Paperback";
  if (lower.includes("audiobook") || mediaType.toLowerCase().includes("audio")) return "Audio CD";
  return "Hardcover"; // default bookstore format
}

export function mapBookToEbayAspects(book: BookAspectContext): EbayAspectResult {
  const conditionData = mapConditionToEbay(book.condition);
  const textPool = [book.title, book.description, book.catalogTags, book.category, book.subcategory]
    .filter(Boolean)
    .join(" ");

  const specialAttributes = extractSpecialAttributes(textPool);
  const binding = detectFormatBinding(textPool, book.mediaType);
  const genre = book.subcategory || book.category || "Literature & Fiction";

  const conditionDescriptors: EbayConditionDescriptor[] = [];
  if (specialAttributes.includes("Signed")) {
    conditionDescriptors.push({ name: "Signed", value: ["Signed by Author"] });
  }
  if (specialAttributes.includes("Dust Jacket")) {
    conditionDescriptors.push({ name: "Dust Jacket Condition", value: ["Good"] });
  }

  const cleanIsbn = book.isbn.replace(/[^0-9X]/gi, "");

  const aspects: Record<string, string[]> = {
    Title: [book.title ?? "Book"],
    Author: [book.author ?? "Unknown Author"],
    Publisher: [book.publisher ?? "Independent Publisher"],
    Language: [book.language ?? "English"],
    Format: [binding],
    Genre: [genre],
    Topic: [book.subcategory ?? book.category ?? "Books"],
  };

  if (cleanIsbn.length === 10 || cleanIsbn.length === 13) {
    aspects.ISBN = [cleanIsbn];
  }

  if (book.publishedYear && book.publishedYear > 1000) {
    aspects["Publication Year"] = [String(book.publishedYear)];
  }

  if (specialAttributes.length > 0) {
    aspects["Special Attributes"] = specialAttributes;
  }

  return {
    condition: conditionData.condition,
    conditionId: conditionData.conditionId,
    conditionDescription: conditionData.description,
    conditionDescriptors,
    aspects,
  };
}

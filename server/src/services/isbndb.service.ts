import { env } from "../config/env.js";

export interface IsbndbBookData {
  isbn: string;
  title: string | null;
  author: string | null;
  publisher: string | null;
  description: string | null;
  coverUrl: string | null;
  listPrice: number | null;
  category: string; // "Print Books"
  genre: string | null;
  subcategory: string | null;
  subjects: string[];
  tags: string[];
  dimensionsRaw?: string | null;
  weightRaw?: string | number | null;
  dimensionsStructured?: any;
  pages?: number | null;
  binding?: string | null;
  format?: string | null;
}

const GENRE_RULES: Array<[string, string[]]> = [
  ["Fantasy", ["fantasy", "epic fantasy", "urban fantasy", "high fantasy", "magic", "sword and sorcery", "wizards", "sorcery"]],
  ["Science Fiction", ["science fiction", "sci-fi", "space opera", "dystopian", "cyberpunk", "time travel", "aliens", "post-apocalyptic"]],
  ["Mystery & Thriller", ["mystery", "thriller", "suspense", "crime", "detective", "espionage", "noir", "cozy mystery", "police procedural"]],
  ["Romance", ["romance", "romantic", "love stories", "contemporary romance", "historical romance", "paranormal romance"]],
  ["Horror", ["horror", "ghosts", "vampires", "zombies", "supernatural", "gothic", "occult"]],
  ["Historical Fiction", ["historical fiction", "historical", "period piece", "regency"]],
  ["Literary Fiction", ["literary", "literature", "classic", "contemporary fiction", "fiction"]],
  ["Biography & Memoir", ["biography", "autobiography", "memoir", "letters", "diaries", "personal memoirs"]],
  ["History", ["history", "military history", "civil war", "world war", "ancient history", "american history", "european history"]],
  ["True Crime", ["true crime", "murder", "criminology", "serial killers"]],
  ["Children's Books", ["juvenile", "children", "picture book", "early reader", "middle grade", "fairy tales", "juvenile fiction"]],
  ["Young Adult", ["young adult", "ya", "teen", "young adult fiction"]],
  ["Graphic Novels & Comics", ["graphic novel", "comic", "comics", "manga", "anime", "superheroes"]],
  ["Science & Nature", ["science", "physics", "biology", "astronomy", "evolution", "nature", "environment", "animals", "zoology"]],
  ["Philosophy & Religion", ["philosophy", "religion", "theology", "spirituality", "buddhism", "christianity", "islam", "judaism", "mythology"]],
  ["Self-Help & Psychology", ["self-help", "psychology", "personal development", "mindfulness", "motivation", "mental health"]],
  ["Business & Economics", ["business", "economics", "investing", "management", "finance", "entrepreneurship", "marketing", "leadership"]],
  ["Cooking & Food", ["cooking", "cookbook", "culinary", "baking", "food", "wine", "recipes", "gastronomy"]],
  ["Art & Photography", ["art", "photography", "design", "architecture", "music", "film", "performing arts", "painting"]],
  ["Travel & Adventure", ["travel", "guidebook", "exploration", "adventure", "expeditions", "geography"]],
  ["Poetry & Drama", ["poetry", "poems", "drama", "plays", "theater", "screenplays"]],
  ["Crafts & Hobbies", ["crafts", "gardening", "hobbies", "woodworking", "knitting", "games", "puzzles", "needlework"]],
];

export function extractGenreAndCategory(rawSubjects: string[], providerCategory: string | null = null): { category: string; genre: string | null; subcategory: string | null; tags: string[] } {
  // Always Category: "Print Books"
  const category = "Print Books";

  // Flatten subjects (splitting "/" or ";" if BISAC hierarchical like "Fiction / Fantasy / Epic")
  const flattenedSubjects: string[] = [];
  if (providerCategory) {
    flattenedSubjects.push(providerCategory);
  }
  for (const s of rawSubjects) {
    if (!s) continue;
    const parts = s.split(/[/;,>]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      flattenedSubjects.push(...parts);
    } else {
      flattenedSubjects.push(s.trim());
    }
  }

  const uniqueSubjects = [...new Set(flattenedSubjects)];
  const lowerSubjects = uniqueSubjects.map((s) => s.toLowerCase());

  let matchedGenre: string | null = null;
  for (const [genreName, keywords] of GENRE_RULES) {
    if (lowerSubjects.some((s) => keywords.some((k) => s === k || s.includes(k)))) {
      matchedGenre = genreName;
      break;
    }
  }

  if (!matchedGenre && uniqueSubjects.length > 0) {
    matchedGenre = uniqueSubjects[0];
  }

  const subcategory = uniqueSubjects.find(
    (s) => s.toLowerCase() !== matchedGenre?.toLowerCase() && s.toLowerCase() !== "fiction" && s.toLowerCase() !== "general" && s.toLowerCase() !== "non-fiction"
  ) ?? matchedGenre;

  const tags = ["Print Books", matchedGenre, subcategory, ...uniqueSubjects.slice(0, 8)]
    .filter((t): t is string => Boolean(t?.trim()))
    .map((t) => t.trim())
    .filter((t, i, all) => all.indexOf(t) === i);

  return {
    category,
    genre: matchedGenre,
    subcategory,
    tags,
  };
}

export async function lookupIsbndb(isbn: string): Promise<IsbndbBookData | null> {
  const apiKey = env.ISBNDB_API_KEY || process.env.ISBNDB_API_KEY;
  if (!apiKey) {
    return null;
  }

  const cleanIsbn = isbn.replace(/[^0-9X]/gi, "");
  try {
    const response = await fetch(`https://api2.isbndb.com/book/${cleanIsbn}`, {
      headers: {
        Authorization: apiKey,
        "X-API-KEY": apiKey,
        "User-Agent": "ColophonERP/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      book?: {
        title?: string;
        title_long?: string;
        authors?: string[];
        publisher?: string;
        synopsis?: string;
        overview?: string;
        image?: string;
        subjects?: string[];
        msrp?: number | string;
        dimensions?: string;
        dimensions_structured?: any;
        weight?: string | number;
        pages?: number | string;
        binding?: string;
        format?: string;
      };
    };

    const book = data.book;
    if (!book) return null;

    const subjects = book.subjects ?? [];
    const classification = extractGenreAndCategory(subjects);

    let price: number | null = null;
    if (typeof book.msrp === "number" && book.msrp > 0) {
      price = book.msrp;
    } else if (typeof book.msrp === "string") {
      const parsed = parseFloat(book.msrp.replace(/[^0-9.]/g, ""));
      if (!isNaN(parsed) && parsed > 0) price = parsed;
    }

    let parsedPages: number | null = null;
    if (typeof book.pages === "number" && book.pages > 0) {
      parsedPages = book.pages;
    } else if (typeof book.pages === "string") {
      const p = parseInt(book.pages.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(p) && p > 0) parsedPages = p;
    }

    return {
      isbn: cleanIsbn,
      title: book.title_long || book.title || null,
      author: book.authors?.join(", ") || null,
      publisher: book.publisher || null,
      description: book.synopsis || book.overview || null,
      coverUrl: book.image || null,
      listPrice: price,
      category: classification.category, // "Print Books"
      genre: classification.genre,
      subcategory: classification.subcategory,
      subjects,
      tags: classification.tags,
      dimensionsRaw: book.dimensions || null,
      weightRaw: book.weight ?? null,
      dimensionsStructured: book.dimensions_structured || null,
      pages: parsedPages,
      binding: book.binding || null,
      format: book.format || null,
    };
  } catch (error) {
    console.warn("ISBNdb API lookup failed for " + isbn, error);
    return null;
  }
}

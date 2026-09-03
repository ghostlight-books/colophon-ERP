import type { DetectedSpine, ValuedBook } from "../types/shelfScanner";

const GOOGLE_BOOKS_ENDPOINT = "https://www.googleapis.com/books/v1/volumes";
const CONCURRENCY_LIMIT = 5;

const PREMIUM_PUBLISHERS = ["easton press", "franklin library", "folio society", "heritage press", "chilton"];

const MAJOR_TRADE_HOUSES = [
  "knopf",
  "scribner",
  "random house",
  "viking",
  "harper & row",
  "harpercollins",
  "harper collins",
  "doubleday",
  "simon & schuster",
  "little, brown",
  "little brown",
  "farrar, straus",
  "farrar straus",
  "putnam",
  "houghton mifflin",
];

const HIGH_VALUE_AUTHORS = [
  "frank herbert",
  "cormac mccarthy",
  "stephen king",
  "ernest hemingway",
  "tolkien",
  "harper lee",
  "f. scott fitzgerald",
  "william faulkner",
  "toni morrison",
  "kurt vonnegut",
  "flannery o'connor",
];

const YELLOW_INSPECTION_CHECKLIST = [
  'Inspect the copyright page for a complete number line (e.g. "1 2 3 4 5 6 7 8 9 10") or an explicit "First Edition" statement.',
  "Check the inner dust jacket flap for a printed retail price -- its absence often indicates a Book Club Edition.",
  "Look for a blind-stamped (deboss) impression on the lower-right corner of the rear board, a common Book Club Edition marker.",
];

interface GoogleBooksVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    categories?: string[];
  };
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().trim();
}

function matchesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

async function queryGoogleBooks(title: string, author: string): Promise<GoogleBooksVolume | null> {
  const q = `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`;
  try {
    const response = await fetch(`${GOOGLE_BOOKS_ENDPOINT}?q=${q}&maxResults=3`);
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { items?: GoogleBooksVolume[] };
    return payload.items?.[0] ?? null;
  } catch {
    // Network failure or offline -- fall back to vision-only data.
    return null;
  }
}

type ValuationFields = Pick<
  ValuedBook,
  "triage" | "estimatedLow" | "estimatedHigh" | "medianMarketValue" | "editionNotes" | "inspectionChecklist"
>;

/**
 * Applies the field-triage heuristics: premium imprints and notable authors
 * in hardcover are flagged GREEN, hardcovers from major trade houses are
 * YELLOW (value hinges on print state -- needs in-person inspection), and
 * everything else defaults to GRAY (common, low-margin stock).
 */
function classifyValuation(spine: DetectedSpine): ValuationFields {
  const publisher = normalize(spine.publisher);
  const author = normalize(spine.author);
  const isPremiumImprint = matchesAny(publisher, PREMIUM_PUBLISHERS);
  const isMajorTradeHouse = matchesAny(publisher, MAJOR_TRADE_HOUSES);
  const isNotableAuthor = matchesAny(author, HIGH_VALUE_AUTHORS);
  const isHardcoverOrLeather = spine.formatConfidence === "Hardcover" || spine.formatConfidence === "Leather";
  const isPaperback = spine.formatConfidence === "Paperback";

  if (isPremiumImprint) {
    return {
      triage: "GREEN",
      estimatedLow: 60,
      estimatedHigh: 250,
      medianMarketValue: 120,
      editionNotes: `Fine-press or limited imprint (${spine.publisher ?? "premium binding"}). These hold consistent collector demand independent of print run size.`,
      inspectionChecklist: [
        "Confirm the binding, slipcase (if any), and gilt edges are complete and undamaged.",
        "Verify the limitation/colophon page number if this is a numbered edition.",
      ],
    };
  }

  if (isNotableAuthor && isHardcoverOrLeather) {
    return {
      triage: "GREEN",
      estimatedLow: 40,
      estimatedHigh: 180,
      medianMarketValue: 75,
      editionNotes: `${spine.author} is a high-demand author; hardcover editions of significant titles regularly clear $40+ even without a true first printing.`,
      inspectionChecklist: [
        "Check the copyright page for a true first-edition/first-printing statement -- this can multiply value further.",
        "Confirm a matching, unclipped dust jacket is present if applicable.",
      ],
    };
  }

  if (isMajorTradeHouse && isHardcoverOrLeather) {
    return {
      triage: "YELLOW",
      estimatedLow: 5,
      estimatedHigh: 500,
      medianMarketValue: 45,
      editionNotes: `Hardcover from a major trade house${spine.publisher ? ` (${spine.publisher})` : ""}. Value swings drastically between a true first printing ($100-$500+) and a book club or later printing ($5-$15) -- in-person inspection required.`,
      inspectionChecklist: [...YELLOW_INSPECTION_CHECKLIST],
    };
  }

  if (isPaperback) {
    return {
      triage: "GRAY",
      estimatedLow: 3,
      estimatedHigh: 8,
      medianMarketValue: 5,
      editionNotes: "Mass-market paperback with saturated used-market supply. Not typically worth pulling unless in exceptional condition or part of a bulk lot.",
      inspectionChecklist: [],
    };
  }

  if (!isMajorTradeHouse && !isPremiumImprint && spine.publisher) {
    return {
      triage: "GRAY",
      estimatedLow: 3,
      estimatedHigh: 10,
      medianMarketValue: 6,
      editionNotes: "Common trade edition from a publisher without notable collector demand. Likely a pass unless condition or demand data says otherwise.",
      inspectionChecklist: [],
    };
  }

  // Publisher unreadable/unresolved -- treat cautiously rather than dismissing it.
  return {
    triage: "YELLOW",
    estimatedLow: 8,
    estimatedHigh: 60,
    medianMarketValue: 20,
    editionNotes: "Publisher or edition could not be confidently classified from the spine or bibliographic lookup. Worth a closer look before passing.",
    inspectionChecklist: [
      "Check the copyright page for the publisher, edition, and printing statement.",
      "Look up the exact title, author, and printing details before pricing.",
    ],
  };
}

async function resolveOne(spine: DetectedSpine): Promise<ValuedBook> {
  const volume = await queryGoogleBooks(spine.title, spine.author);
  const info = volume?.volumeInfo;

  const isbn =
    info?.industryIdentifiers?.find((id) => id.type === "ISBN_13")?.identifier ??
    info?.industryIdentifiers?.find((id) => id.type === "ISBN_10")?.identifier;

  const resolvedSpine: DetectedSpine = {
    ...spine,
    title: info?.title || spine.title,
    author: info?.authors && info.authors.length > 0 ? info.authors.join(", ") : spine.author,
    publisher: info?.publisher || spine.publisher,
  };

  const valuation = classifyValuation(resolvedSpine);

  return {
    ...resolvedSpine,
    ...valuation,
    googleBooksId: volume?.id,
    isbn,
    publishedDate: info?.publishedDate,
  };
}

/**
 * Runs `worker` over `items` with at most `limit` in flight at once,
 * resolving to one settled result per item (never throws for an individual
 * failure) -- the concurrency-bounded equivalent of Promise.allSettled.
 */
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    try {
      const value = await worker(items[index]);
      results[index] = { status: "fulfilled", value };
    } catch (error) {
      results[index] = { status: "rejected", reason: error };
    }
    await runNext();
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));
  return results;
}

/**
 * Resolves bibliographic details for each detected spine via Google Books
 * (falling back gracefully to the vision-only reading if the lookup fails
 * or finds nothing) and applies field-triage pricing heuristics to every
 * volume.
 */
export async function resolveBookValuations(spines: DetectedSpine[]): Promise<ValuedBook[]> {
  const settled = await runWithConcurrencyLimit(spines, CONCURRENCY_LIMIT, resolveOne);

  return settled.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    // Bibliographic lookup itself threw (rare -- resolveOne already catches
    // fetch errors) -- still surface the item using the raw vision reading.
    const spine = spines[index];
    return { ...spine, ...classifyValuation(spine) };
  });
}

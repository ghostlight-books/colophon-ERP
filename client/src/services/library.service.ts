export interface LibrarySpace {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  location: string | null;
  icon: string;
  color: string;
  isDefault: boolean;
  storeId: string;
  createdAt: string;
  updatedAt: string;
  volumeCount: number;
  totalValue: number;
  shelvesCount: number;
}

export interface LibraryVolume {
  id: string;
  isbn: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publishYear: string | null;
  description: string | null;
  coverUrl: string | null;
  deweyDecimal: string | null;
  deweyCategory: string | null;
  locClassification: string | null;
  lccn: string | null;
  oclcNumber: string | null;
  subjects: string | null;
  pageCount: number | null;
  bindingFormat: string | null;
  language: string;
  roomName: string | null;
  bookcaseName: string | null;
  shelfName: string | null;
  shelfLocationId: string | null;
  shelfLocation?: LibraryShelfLocation | null;
  librarySpaceId?: string | null;
  librarySpace?: LibrarySpace | null;
  replacementValue: number;
  rareMarketValue?: number | null;
  valuationNotes?: string | null;
  condition?: "FINE" | "VERY_GOOD" | "GOOD" | "FAIR" | "POOR" | string;
  isSigned?: boolean;
  isFirstEdition?: boolean;
  isFirstPrinting?: boolean;
  acquisitionPrice: number | null;
  acquisitionDate: string | null;
  readingStatus: "UNREAD" | "READING" | "COMPLETED" | "WISHLIST";
  rating: number | null;
  personalNotes: string | null;
  exLibrisTags: string | null;
  listingStatus: "COLLECTION_ONLY" | "ALLOW_OFFERS" | "OPEN_FOR_TRADE" | "FOR_SALE";
  askingPrice: number | null;
  minimumOffer: number | null;
  tradePreferences: string | null;
  offers?: LibraryOffer[];
  isLoaned: boolean;
  borrowerName: string | null;
  borrowerContact: string | null;
  loanDate: string | null;
  dueDate: string | null;
  returnDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryOffer {
  id: string;
  volumeId: string;
  volume?: LibraryVolume;
  offerType: "CASH" | "TRADE" | "BOOKSTORE_BUY_OFFER";
  offererType: "COLLECTOR" | "BOOKSTORE";
  offererId: string | null;
  offererName: string;
  offererEmail: string;
  offererStoreName: string | null;
  cashOfferAmount: number | null;
  offeredTradeItemsJson: string | null;
  notes: string | null;
  status: "PENDING" | "ACCEPTED" | "COUNTERED" | "DECLINED" | "COMPLETED";
  counterAmount: number | null;
  counterNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryNotification {
  id: string;
  title: string;
  detail: string;
  type: "OFFER" | "TRADE" | "LOAN_DUE" | "CATALOG";
  read: boolean;
  actionUrl: string | null;
  createdAt: string;
}

export interface LibraryCollectionHealth {
  totalVolumes: number;
  classificationPercent: number;
  classifiedDeweyCount: number;
  classifiedLocCount: number;
  loanedVolumesCount: number;
  openOffersCount: number;
  unreadNotificationsCount: number;
  totalInsuredValue: number;
  healthStatus: "excellent" | "good" | "needs_attention";
}

export interface LibraryShelfLocation {
  id: string;
  roomName: string;
  bookcaseName: string;
  shelfName: string;
  fullLocationLabel: string;
  description: string | null;
  capacity: number;
  volumeCount?: number;
  totalValue?: number;
  percentFull?: number;
  sampleCovers?: string[];
}

export interface LibraryDashboardSummary {
  totalVolumes: number;
  totalReplacementValue: number;
  shelvesCount: number;
  readingStats: {
    completed: number;
    reading: number;
    unread: number;
    wishlist: number;
    readPercentage: number;
  };
  loanedCount: number;
  activeLoans: Array<{
    id: string;
    title: string;
    author: string | null;
    coverUrl: string | null;
    borrowerName: string | null;
    borrowerContact: string | null;
    loanDate: string | null;
    dueDate: string | null;
    isOverdue: boolean;
  }>;
  deweyDistribution: Array<{
    divisionKey: string;
    label: string;
    count: number;
    totalValue: number;
  }>;
  recentAdditions: LibraryVolume[];
}

export interface LibraryValuationReport {
  generatedAt: string;
  totalVolumes: number;
  totalReplacementValue: number;
  totalAcquisitionCost: number;
  averageVolumeValue: number;
  roomBreakdown: Array<{
    room: string;
    count: number;
    totalValue: number;
  }>;
  highValueVolumes: LibraryVolume[];
  volumes: LibraryVolume[];
}

export interface LibraryEnrichmentPreview {
  isbn: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publishYear: string | null;
  description: string | null;
  coverUrl: string | null;
  deweyDecimal: string | null;
  deweyCategory: string | null;
  locClassification: string | null;
  locSubject: string | null;
  lccn: string | null;
  oclcNumber: string | null;
  subjects: string[];
  pageCount: number | null;
  bindingFormat: string | null;
  language: string;
  replacementValue: number;
}

function resolveApiUrl(endpointPath: string): string {
  const envBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  const path = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;

  if (envBase) {
    const cleanBase = envBase.replace(/\/+$/, "");
    if (cleanBase.endsWith("/api")) {
      return `${cleanBase}${path.startsWith("/api") ? path.slice(4) : path}`;
    }
    return `${cleanBase}${path.startsWith("/api") ? path : `/api${path}`}`;
  }
  return path.startsWith("/api") ? path : `/api${path}`;
}

const PROVIDER_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLibrarySpaces(): Promise<LibrarySpace[]> {
  const url = resolveApiUrl(`/library/spaces?t=${Date.now()}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Failed to fetch library spaces.");
  return res.json() as Promise<LibrarySpace[]>;
}

export async function createLibrarySpace(data: {
  name: string;
  description?: string | null;
  location?: string | null;
  icon?: string | null;
  color?: string | null;
  isDefault?: boolean;
}): Promise<LibrarySpace> {
  const url = resolveApiUrl("/library/spaces");
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create library space.");
  return res.json() as Promise<LibrarySpace>;
}

export async function updateLibrarySpace(id: string, data: Partial<LibrarySpace>): Promise<LibrarySpace> {
  const url = resolveApiUrl(`/library/spaces/${id}`);
  const res = await fetchWithTimeout(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update library space.");
  return res.json() as Promise<LibrarySpace>;
}

export async function deleteLibrarySpace(id: string): Promise<{ success: boolean; movedToDefaultId?: string }> {
  const url = resolveApiUrl(`/library/spaces/${id}`);
  const res = await fetchWithTimeout(url, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete library space.");
  return res.json() as Promise<{ success: boolean; movedToDefaultId?: string }>;
}

export async function fetchLibraryDashboard(): Promise<LibraryDashboardSummary> {
  const url = resolveApiUrl(`/library/dashboard?t=${Date.now()}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Failed to load library dashboard data.");
  return res.json() as Promise<LibraryDashboardSummary>;
}

export async function fetchLibraryVolumes(params: {
  query?: string;
  dewey?: string;
  loc?: string;
  shelfLocationId?: string;
  roomName?: string;
  readingStatus?: string;
  condition?: string;
  librarySpaceId?: string;
  isLoaned?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<{ total: number; items: LibraryVolume[] }> {
  const queryParams = new URLSearchParams();
  if (params.query) queryParams.set("query", params.query);
  if (params.dewey) queryParams.set("dewey", params.dewey);
  if (params.loc) queryParams.set("loc", params.loc);
  if (params.shelfLocationId) queryParams.set("shelfLocationId", params.shelfLocationId);
  if (params.roomName) queryParams.set("roomName", params.roomName);
  if (params.readingStatus && params.readingStatus !== "ALL") queryParams.set("readingStatus", params.readingStatus);
  if (params.condition && params.condition !== "ALL") queryParams.set("condition", params.condition);
  if (params.librarySpaceId && params.librarySpaceId !== "ALL") queryParams.set("librarySpaceId", params.librarySpaceId);
  if (typeof params.isLoaned === "boolean") queryParams.set("isLoaned", String(params.isLoaned));
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.offset) queryParams.set("offset", String(params.offset));
  queryParams.set("t", String(Date.now()));

  const url = resolveApiUrl(`/library/volumes?${queryParams.toString()}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Failed to fetch library volumes.");
  return res.json() as Promise<{ total: number; items: LibraryVolume[] }>;
}

export async function scanLibraryIsbn(
  isbn: string,
  shelfLocationId?: string | null,
  customData?: Partial<LibraryVolume>
): Promise<LibraryVolume> {
  const url = resolveApiUrl("/library/scan");
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isbn, shelfLocationId, ...customData }),
    });
  } catch {
    res = await fetchWithTimeout("/api/library/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isbn, shelfLocationId, ...customData }),
    });
  }

  if (!res.ok) {
    let errMessage = `Failed to scan book (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) errMessage = body.error;
    } catch {}
    throw new Error(errMessage);
  }
  return res.json() as Promise<LibraryVolume>;
}

export async function addLibraryVolume(data: Partial<LibraryVolume>): Promise<LibraryVolume> {
  const url = resolveApiUrl("/library/volumes");
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to add book to library.");
  return res.json() as Promise<LibraryVolume>;
}

export async function updateLibraryVolume(id: string, data: Partial<LibraryVolume>): Promise<LibraryVolume> {
  const url = resolveApiUrl(`/library/volumes/${encodeURIComponent(id)}`);
  const res = await fetchWithTimeout(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update volume.");
  return res.json() as Promise<LibraryVolume>;
}

export async function deleteLibraryVolume(id: string): Promise<void> {
  const url = resolveApiUrl(`/library/volumes/${encodeURIComponent(id)}`);
  const res = await fetchWithTimeout(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete volume.");
}

export async function bulkDeleteLibraryVolumes(ids: string[]): Promise<{ count: number }> {
  const url = resolveApiUrl("/library/volumes/bulk-delete");
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Failed to bulk delete volumes.");
  return res.json() as Promise<{ count: number }>;
}

export async function bulkMoveLibraryVolumes(
  ids: string[],
  target: { librarySpaceId?: string | null; shelfLocationId?: string | null }
): Promise<{ count: number }> {
  const promises = ids.map((id) =>
    updateLibraryVolume(id, {
      librarySpaceId: target.librarySpaceId,
      shelfLocationId: target.shelfLocationId,
    })
  );
  await Promise.all(promises);
  return { count: ids.length };
}

export async function fetchShelves(): Promise<LibraryShelfLocation[]> {
  const url = resolveApiUrl(`/library/shelves?t=${Date.now()}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { shelves: LibraryShelfLocation[] };
  return Array.isArray(data.shelves) ? data.shelves : [];
}

export async function createShelf(data: {
  roomName: string;
  bookcaseName: string;
  shelfName: string;
  description?: string;
  capacity?: number;
}): Promise<LibraryShelfLocation> {
  const url = resolveApiUrl("/library/shelves");
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create shelf location.");
  return res.json() as Promise<LibraryShelfLocation>;
}

export async function deleteShelf(id: string): Promise<void> {
  const url = resolveApiUrl(`/library/shelves/${encodeURIComponent(id)}`);
  const res = await fetchWithTimeout(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete shelf.");
}

export async function loanVolume(
  id: string,
  borrowerName: string,
  borrowerContact?: string,
  dueDate?: string
): Promise<LibraryVolume> {
  const url = resolveApiUrl(`/library/volumes/${encodeURIComponent(id)}/loan`);
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ borrowerName, borrowerContact, dueDate }),
  });
  if (!res.ok) throw new Error("Failed to loan volume.");
  return res.json() as Promise<LibraryVolume>;
}

export async function returnVolume(id: string): Promise<LibraryVolume> {
  const url = resolveApiUrl(`/library/volumes/${encodeURIComponent(id)}/return`);
  const res = await fetchWithTimeout(url, { method: "POST" });
  if (!res.ok) throw new Error("Failed to return volume.");
  return res.json() as Promise<LibraryVolume>;
}

export async function fetchValuationReport(): Promise<LibraryValuationReport> {
  const url = resolveApiUrl(`/library/valuation-report?t=${Date.now()}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Failed to generate valuation report.");
  return res.json() as Promise<LibraryValuationReport>;
}

export async function enrichIsbnPreview(isbn: string): Promise<LibraryEnrichmentPreview> {
  const url = resolveApiUrl(`/library/enrich-isbn/${encodeURIComponent(isbn)}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Failed to enrich ISBN.");
  return res.json() as Promise<LibraryEnrichmentPreview>;
}

// Exchange & Offers Marketplace API
export async function fetchExchangeMarketplace(params: {
  query?: string;
  status?: string;
  deweyPrefix?: string;
  maxPrice?: number;
  limit?: number;
} = {}): Promise<LibraryVolume[]> {
  const q = new URLSearchParams();
  if (params.query) q.set("query", params.query);
  if (params.status) q.set("status", params.status);
  if (params.deweyPrefix) q.set("deweyPrefix", params.deweyPrefix);
  if (typeof params.maxPrice === "number") q.set("maxPrice", String(params.maxPrice));
  if (params.limit) q.set("limit", String(params.limit));

  const url = resolveApiUrl(`/library/exchange/marketplace?${q.toString()}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Failed to load exchange marketplace.");
  const data = (await res.json()) as { items?: LibraryVolume[] };
  return Array.isArray(data.items) ? data.items : [];
}

export async function submitOffer(data: {
  volumeId: string;
  offerType: "CASH" | "TRADE" | "BOOKSTORE_BUY_OFFER";
  offererType?: "COLLECTOR" | "BOOKSTORE";
  offererName: string;
  offererEmail: string;
  offererStoreName?: string;
  cashOfferAmount?: number;
  offeredTradeItemsJson?: string;
  notes?: string;
}): Promise<LibraryOffer> {
  const url = resolveApiUrl("/library/exchange/offers");
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || "Failed to submit offer.");
  }
  return res.json() as Promise<LibraryOffer>;
}

export async function fetchIncomingOffers(): Promise<LibraryOffer[]> {
  const url = resolveApiUrl(`/library/exchange/offers?t=${Date.now()}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Failed to fetch incoming offers.");
  const data = (await res.json()) as { offers?: LibraryOffer[] };
  return Array.isArray(data.offers) ? data.offers : [];
}

export async function respondToOffer(
  offerId: string,
  action: "ACCEPT" | "COUNTER" | "DECLINE" | "COMPLETE",
  counterAmount?: number,
  counterNotes?: string
): Promise<LibraryOffer> {
  const url = resolveApiUrl(`/library/exchange/offers/${encodeURIComponent(offerId)}/respond`);
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, counterAmount, counterNotes }),
  });
  if (!res.ok) throw new Error("Failed to respond to offer.");
  return res.json() as Promise<LibraryOffer>;
}

// Library Notifications Feed API
export async function fetchLibraryNotifications(limit = 20): Promise<LibraryNotification[]> {
  const url = resolveApiUrl(`/library/notifications?limit=${limit}&t=${Date.now()}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Failed to fetch notifications.");
  const data = (await res.json()) as { notifications?: LibraryNotification[] };
  return Array.isArray(data.notifications) ? data.notifications : [];
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const url = resolveApiUrl(`/library/notifications/${encodeURIComponent(id)}/read`);
  await fetchWithTimeout(url, { method: "POST" });
}
export const markLibraryNotificationRead = markNotificationAsRead;

export async function markAllNotificationsAsRead(): Promise<void> {
  const url = resolveApiUrl("/library/notifications/read-all");
  await fetchWithTimeout(url, { method: "POST" });
}

// Collection Health API (for Library Shell)
export async function fetchCollectionHealth(): Promise<LibraryCollectionHealth> {
  const url = resolveApiUrl(`/library/collection-health?t=${Date.now()}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("Failed to fetch collection health.");
  return res.json() as Promise<LibraryCollectionHealth>;
}

export interface RareBookComp {
  source: string;
  title: string;
  price: number;
  conditionNotes: string;
  attributes: string[];
}

export interface RarePricingResult {
  isbn: string;
  baselinePrice: number;
  rareMarketValue: number;
  suggestedAskingPrice: number;
  confidenceScore: number;
  condition?: string;
  attributes: {
    isSigned: boolean;
    isFirstEdition: boolean;
    isFirstPrinting: boolean;
  };
  valuationRationale: string;
  sources: RareBookComp[];
}

export async function evaluateRareBookPricing(params: {
  isbn: string;
  title?: string;
  author?: string;
  condition?: string;
  isSigned?: boolean;
  isFirstEdition?: boolean;
  isFirstPrinting?: boolean;
  baselinePrice?: number;
  publishYear?: string | number | null;
  bindingFormat?: string | null;
}): Promise<RarePricingResult> {
  const url = resolveApiUrl("/library/evaluate-rare-pricing");
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to evaluate rare pricing.");
  }
  return res.json() as Promise<RarePricingResult>;
}

export interface CoverCandidate {
  source: "Google Books" | "Open Library" | "ThriftBooks" | "AbeBooks" | "ISBNdb" | "LibraryThing";
  url: string;
  quality: "high" | "medium" | "standard";
}

export async function fetchCoverCandidates(params: {
  isbn: string;
  title?: string;
  author?: string;
}): Promise<CoverCandidate[]> {
  const query = new URLSearchParams();
  if (params.isbn) query.set("isbn", params.isbn);
  if (params.title) query.set("title", params.title);
  if (params.author) query.set("author", params.author);

  const url = resolveApiUrl(`/library/covers/lookup?${query.toString()}`);
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { candidates?: CoverCandidate[] };
  return Array.isArray(data.candidates) ? data.candidates : [];
}

export async function updateVolumeCover(volumeId: string, coverUrl: string): Promise<LibraryVolume> {
  const url = resolveApiUrl(`/library/volumes/${encodeURIComponent(volumeId)}/cover`);
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coverUrl }),
  });
  if (!res.ok) throw new Error("Failed to update cover image.");
  return res.json() as Promise<LibraryVolume>;
}

export async function refreshMissingCovers(): Promise<{ totalChecked: number; updatedCount: number }> {
  const url = resolveApiUrl("/library/volumes/refresh-missing-covers");
  const res = await fetchWithTimeout(url, { method: "POST" });
  if (!res.ok) throw new Error("Failed to refresh covers.");
  return res.json() as Promise<{ totalChecked: number; updatedCount: number }>;
}

export interface RecognizedCoverMatch {
  isbn: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publishYear: number | null;
  coverUrl: string | null;
  description: string | null;
  pageCount: number | null;
  category: string | null;
  deweyDecimal?: string | null;
  libraryOfCongress?: string | null;
  replacementValue: number;
  confidence: number;
  matchSource: string;
}

export interface IdentifyCoverResult {
  success: boolean;
  detectedQuery: {
    title: string | null;
    author: string | null;
    publisher?: string | null;
    publishYear?: number | null;
    rawText?: string | null;
  };
  topMatch: RecognizedCoverMatch | null;
  candidates: RecognizedCoverMatch[];
  error?: string;
}

export async function identifyBookByCover(params: {
  imageBase64?: string;
  imageUrl?: string;
  mimeType?: string;
  textHint?: string;
}): Promise<IdentifyCoverResult> {
  const url = resolveApiUrl("/library/identify-cover");
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to identify book cover image.");
  }
  return res.json() as Promise<IdentifyCoverResult>;
}




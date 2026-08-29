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
  replacementValue: number;
  acquisitionPrice: number | null;
  acquisitionDate: string | null;
  readingStatus: "UNREAD" | "READING" | "COMPLETED" | "WISHLIST";
  rating: number | null;
  personalNotes: string | null;
  exLibrisTags: string | null;
  isLoaned: boolean;
  borrowerName: string | null;
  borrowerContact: string | null;
  loanDate: string | null;
  dueDate: string | null;
  returnDate: string | null;
  createdAt: string;
  updatedAt: string;
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
  return `http://localhost:4000${path.startsWith("/api") ? path : `/api${path}`}`;
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

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import SurfaceCard from "../components/ui/SurfaceCard";
import SyncStatusIndicator from "../components/common/SyncStatusIndicator";
import CameraBarcodeScanner from "../components/common/CameraBarcodeScanner";
import {
  searchBuyingEditions,
  evaluateBuyingBook,
  processBuyingBatch,
} from "../services/buying.service";
import type {
  BookBuyingCondition,
  BookBuyingOffer,
  BookBuyingSearchParams,
  BookBuyingSearchResult,
  BuyingBatchItem,
} from "@colophon/shared";

const conditionOptions: Array<{ value: BookBuyingCondition; label: string; modifier: number }> = [
  { value: "Fine", label: "Fine (Like New - 100%)", modifier: 1.0 },
  { value: "Very Good", label: "Very Good (Minor wear - 90%)", modifier: 0.9 },
  { value: "Good", label: "Good (Standard reading copy - 80%)", modifier: 0.8 },
  { value: "Fair", label: "Fair (Noticeable wear/creases - 70%)", modifier: 0.7 },
  { value: "Poor", label: "Poor (Heavy wear/binding issues - 60%)", modifier: 0.6 },
];

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

export default function BuyingPage(): JSX.Element {
  // Mode selection: "scanner" vs "advanced-search"
  const [intakeMode, setIntakeMode] = useState<"scanner" | "search">("scanner");

  // Scanner state
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("Camera is off");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Advanced Search Form State (Year is required + at least 1 other field)
  const [searchYear, setSearchYear] = useState<string>(() => String(new Date().getFullYear()));
  const [searchPublisher, setSearchPublisher] = useState("");
  const [searchAuthor, setSearchAuthor] = useState("");
  const [searchIsbn, setSearchIsbn] = useState("");
  const [searchTitle, setSearchTitle] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<BookBuyingSearchResult[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Active Evaluated Book (The 60% Math Engine)
  const [activeOffer, setActiveOffer] = useState<BookBuyingOffer | null>(null);
  const [customSellPrice, setCustomSellPrice] = useState<string>("");
  const [selectedCondition, setSelectedCondition] = useState<BookBuyingCondition>("Good");

  // Buying Batch (Customer Cart)
  const [batchItems, setBatchItems] = useState<BuyingBatchItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem("colophon-buying-batch") ?? "[]") as BuyingBatchItem[];
    } catch {
      return [];
    }
  });

  // Customer & Payout details
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "storecredit" | "check">("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [processingBuyout, setProcessingBuyout] = useState(false);
  const [completedReceipt, setCompletedReceipt] = useState<{
    batchId: string;
    itemsCount: number;
    totalPaid: number;
    paymentMethod: string;
    timestamp: string;
  } | null>(null);

  // Save batch to local storage
  useEffect(() => {
    window.localStorage.setItem("colophon-buying-batch", JSON.stringify(batchItems));
  }, [batchItems]);

  // Focus barcode input on mount and mode switch
  useEffect(() => {
    if (intakeMode === "scanner") {
      barcodeRef.current?.focus();
    }
  }, [intakeMode]);

  // Calculate live offer based on customSellPrice or default
  const effectiveSellPrice = useMemo(() => {
    const parsed = parseFloat(customSellPrice);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    return activeOffer?.estimatedRetailValue ?? 0;
  }, [customSellPrice, activeOffer]);

  const computedCashOffer = useMemo(() => {
    return Number((effectiveSellPrice * 0.60).toFixed(2));
  }, [effectiveSellPrice]);

  const computedCreditOffer = useMemo(() => {
    return Number((effectiveSellPrice * 0.70).toFixed(2));
  }, [effectiveSellPrice]);

  // Batch summary calculations
  const batchSummary = useMemo(() => {
    const totalItems = batchItems.length;
    const totalEstimatedResaleValue = batchItems.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalCashOffer = batchItems.reduce((sum, item) => sum + item.buyOffer, 0);
    const totalCreditOffer = batchItems.reduce((sum, item) => sum + Number((item.sellPrice * 0.70).toFixed(2)), 0);

    return {
      totalItems,
      totalEstimatedResaleValue: Number(totalEstimatedResaleValue.toFixed(2)),
      totalCashOffer: Number(totalCashOffer.toFixed(2)),
      totalCreditOffer: Number(totalCreditOffer.toFixed(2)),
    };
  }, [batchItems]);

  // Handle ISBN Evaluation
  const handleLookupIsbn = async (isbnToLookup: string): Promise<void> => {
    const clean = isbnToLookup.trim();
    if (!clean) return;

    setLookupBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const evaluation = await evaluateBuyingBook(clean, selectedCondition);
      setActiveOffer(evaluation);
      setCustomSellPrice(String(evaluation.estimatedRetailValue));
      setSelectedCondition(evaluation.condition);
      setSuccessMessage(`Evaluated "${evaluation.title}" · 60% Offer: ${formatCurrency(evaluation.offerAmount)}`);
      setBarcodeInput("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to evaluate book.");
    } finally {
      setLookupBusy(false);
      barcodeRef.current?.focus();
    }
  };

  // Handle Condition Change for active book
  const handleConditionChange = async (newCondition: BookBuyingCondition): Promise<void> => {
    setSelectedCondition(newCondition);
    if (!activeOffer) return;

    try {
      const evaluation = await evaluateBuyingBook(activeOffer.isbn, newCondition);
      setActiveOffer(evaluation);
      setCustomSellPrice(String(evaluation.estimatedRetailValue));
    } catch {
      // Fallback local calculation
      const option = conditionOptions.find((c) => c.value === newCondition);
      const modifier = option ? option.modifier : 0.8;
      const base = activeOffer.marketSources.thriftbooksPrice ?? activeOffer.marketSources.abebooksPrice ?? 12.99;
      const adjusted = Number((base * modifier).toFixed(2));
      setActiveOffer((prev) => (prev ? {
        ...prev,
        condition: newCondition,
        estimatedRetailValue: adjusted,
        offerAmount: Number((adjusted * 0.60).toFixed(2)),
        storeCreditOfferAmount: Number((adjusted * 0.70).toFixed(2)),
      } : null));
      setCustomSellPrice(String(adjusted));
    }
  };

  // Handle Advanced Search Validation & Execution
  const handleSearchSubmit = async (e?: FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    setSearchError(null);
    setSearchResults([]);

    const yearNum = parseInt(searchYear.trim(), 10);
    if (isNaN(yearNum) || yearNum < 1450 || yearNum > 2100) {
      setSearchError("Publication Year is required (e.g. 1998).");
      return;
    }

    const hasCompanionField = Boolean(
      searchPublisher.trim() || searchAuthor.trim() || searchIsbn.trim() || searchTitle.trim(),
    );

    if (!hasCompanionField) {
      setSearchError("Please provide at least one companion field: Publisher, Author, ISBN, or Title.");
      return;
    }

    setSearchBusy(true);
    setSearchPerformed(true);

    try {
      const results = await searchBuyingEditions({
        year: yearNum,
        publisher: searchPublisher.trim() || undefined,
        author: searchAuthor.trim() || undefined,
        isbn: searchIsbn.trim() || undefined,
        title: searchTitle.trim() || undefined,
      });

      setSearchResults(results);
      if (results.length === 0) {
        setSearchError("No editions found matching those exact criteria. Try broadening author or title keywords.");
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search query failed.");
    } finally {
      setSearchBusy(false);
    }
  };

  // Select an edition from search results
  const handleSelectSearchResult = async (result: BookBuyingSearchResult): Promise<void> => {
    setLookupBusy(true);
    setErrorMessage(null);
    try {
      const evaluation = await evaluateBuyingBook(result.isbn, selectedCondition);
      setActiveOffer(evaluation);
      setCustomSellPrice(String(evaluation.estimatedRetailValue));
      setSuccessMessage(`Loaded "${evaluation.title}" from search results.`);
    } catch {
      // Fallback using search result pricing
      setActiveOffer({
        isbn: result.isbn,
        title: result.title,
        author: result.author,
        publisher: result.publisher,
        year: result.year,
        coverUrl: result.coverUrl,
        condition: selectedCondition,
        conditionDiscount: 0.2,
        estimatedRetailValue: result.estimatedRetailValue,
        offerPercentage: 60,
        offerAmount: result.offerAmount,
        storeCreditOfferAmount: Number((result.estimatedRetailValue * 0.70).toFixed(2)),
        marketSources: {
          priceRangeLow: Number((result.estimatedRetailValue * 0.8).toFixed(2)),
          priceRangeHigh: Number((result.estimatedRetailValue * 1.2).toFixed(2)),
        },
      });
      setCustomSellPrice(String(result.estimatedRetailValue));
    } finally {
      setLookupBusy(false);
    }
  };

  // Add active evaluated book to the customer batch
  const handleAddToBatch = (): void => {
    if (!activeOffer) return;

    const newItem: BuyingBatchItem = {
      id: `ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      isbn: activeOffer.isbn,
      title: activeOffer.title || "Untitled Book",
      author: activeOffer.author,
      publisher: activeOffer.publisher,
      year: activeOffer.year,
      coverUrl: activeOffer.coverUrl,
      condition: selectedCondition,
      sellPrice: effectiveSellPrice,
      buyOffer: computedCashOffer,
      marketSources: activeOffer.marketSources,
      addedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setBatchItems((prev) => [newItem, ...prev]);
    setSuccessMessage(`Added "${newItem.title}" to batch · 60% Offer: ${formatCurrency(newItem.buyOffer)}`);
    setActiveOffer(null);
    setCustomSellPrice("");
    barcodeRef.current?.focus();
  };

  // Remove item from batch
  const handleRemoveFromBatch = (id: string): void => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Clear batch
  const handleClearBatch = (): void => {
    if (batchItems.length === 0) return;
    if (window.confirm("Clear all items from this buying batch?")) {
      setBatchItems([]);
      setActiveOffer(null);
    }
  };

  // Process and finalize customer buyout
  const handleProcessBuyout = async (): Promise<void> => {
    if (batchItems.length === 0) {
      setErrorMessage("Please add at least one book to the batch before finalizing buyout.");
      return;
    }

    setProcessingBuyout(true);
    setErrorMessage(null);

    try {
      const result = await processBuyingBatch({
        items: batchItems,
        paymentMethod,
        customerName: customerName.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
      });

      setCompletedReceipt({
        batchId: result.batchId,
        itemsCount: result.itemsProcessed,
        totalPaid: result.totalPaid,
        paymentMethod: result.paymentMethod,
        timestamp: result.timestamp,
      });

      // Clear batch upon successful ingestion
      setBatchItems([]);
      setActiveOffer(null);
      window.dispatchEvent(new Event("colophon-inventory-updated"));
      setSuccessMessage(`Successfully purchased ${result.itemsProcessed} books for ${formatCurrency(result.totalPaid)}!`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to process buyout.");
    } finally {
      setProcessingBuyout(false);
    }
  };

  // Camera Barcode Scanning Handler
  const handleToggleCamera = async (): Promise<void> => {
    if (cameraActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
      setCameraStatus("Camera is off");
      return;
    }

    try {
      setCameraStatus("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setCameraStatus("Camera active · Scan barcode directly");

      // Start detection loop
      if ("BarcodeDetector" in window) {
        const detector = new (window as unknown as { BarcodeDetector: BarcodeDetectorConstructor }).BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"],
        });

        const scanFrame = async (): Promise<void> => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              const detected = barcodes[0].rawValue;
              void handleLookupIsbn(detected);
            }
          } catch {
            // ignore frame read glitch
          }
          if (streamRef.current) {
            requestAnimationFrame(() => void scanFrame());
          }
        };
        requestAnimationFrame(() => void scanFrame());
      }
    } catch {
      setCameraStatus("Camera unavailable or permission denied.");
      setCameraActive(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Bar with Live Sync Engine status */}
      <div className="relative z-30 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/60 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Book Buying & Trade-In Desk</h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              60% Valuation Math
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Scan or search incoming books, evaluate market prices across ThriftBooks & AbeBooks, and compute standard 60% purchase offers.
          </p>
        </div>
        <SyncStatusIndicator />
      </div>

      {/* Alert Banners */}
      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-sm animate-in fade-in">
          <div className="flex items-center justify-between">
            <p className="font-semibold">⚠️ {errorMessage}</p>
            <button type="button" onClick={() => setErrorMessage(null)} className="text-xs text-rose-600 hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm animate-in fade-in">
          <div className="flex items-center justify-between">
            <p className="font-semibold">✓ {successMessage}</p>
            <button type="button" onClick={() => setSuccessMessage(null)} className="text-xs text-emerald-600 hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Left side intake & search; Right side valuation & batch */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Intake Controls & Multi-Criteria Search (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Mode Switcher */}
          <div className="flex rounded-2xl bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setIntakeMode("scanner")}
              className={[
                "flex-1 rounded-xl py-2 text-xs font-bold transition",
                intakeMode === "scanner"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              📷 Rapid Scanner & ISBN
            </button>
            <button
              type="button"
              onClick={() => setIntakeMode("search")}
              className={[
                "flex-1 rounded-xl py-2 text-xs font-bold transition",
                intakeMode === "search"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              🔍 Multi-Criteria Search
            </button>
          </div>

          {/* Mode 1: Scanner Station */}
          {intakeMode === "scanner" && (
            <SurfaceCard className="space-y-4 p-5">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Scan Book Barcode</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Use your USB barcode scanner or type any ISBN-10 / ISBN-13 below.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleLookupIsbn(barcodeInput);
                }}
                className="space-y-3"
              >
                <div className="relative">
                  <input
                    ref={barcodeRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Scan barcode or enter ISBN..."
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    disabled={lookupBusy}
                  />
                  <button
                    type="submit"
                    disabled={lookupBusy || !barcodeInput.trim()}
                    className="absolute right-2 top-2 rounded-xl bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
                  >
                    {lookupBusy ? "Scraping..." : "Evaluate →"}
                  </button>
                </div>
              </form>

              {/* Camera Scanner Toggle */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-700">Camera Barcode Scanner</p>
                    <p className="text-[11px] text-slate-400">Position barcode in front of camera</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCameraActive(!cameraActive)}
                    className={[
                      "rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer",
                      cameraActive
                        ? "bg-rose-600 text-white hover:bg-rose-700"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
                    ].join(" ")}
                  >
                    {cameraActive ? "Stop Camera" : "📷 Start Camera"}
                  </button>
                </div>
                {cameraActive && (
                  <div className="mt-3">
                    <CameraBarcodeScanner
                      onScan={(isbn) => {
                        setBarcodeInput(isbn);
                        void handleLookupIsbn(isbn);
                      }}
                    />
                  </div>
                )}
              </div>
            </SurfaceCard>
          )}

          {/* Mode 2: Multi-Criteria Edition Search (Year REQUIRED + at least 1 other field) */}
          {intakeMode === "search" && (
            <SurfaceCard className="space-y-4 p-5">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">Advanced Edition Search</h3>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                    Year Required
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Search requires publication year plus at least one of: Publisher, Author, ISBN, or Title.
                </p>
              </div>

              <form onSubmit={(e) => void handleSearchSubmit(e)} className="space-y-3">
                {/* Year Field (Mandatory) */}
                <div>
                  <label className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>Publication Year <span className="text-rose-500">*</span></span>
                    <span className="text-[10px] font-normal text-slate-400">e.g. 1997, 2021</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1450}
                    max={2100}
                    value={searchYear}
                    onChange={(e) => setSearchYear(e.target.value)}
                    placeholder="YYYY (Required)"
                    className="mt-1 w-full rounded-xl border border-amber-300 bg-amber-50/40 px-3 py-2 text-xs font-semibold focus:border-sky-500 focus:outline-none"
                  />
                </div>

                {/* Publisher Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-700">Publisher</label>
                  <input
                    type="text"
                    value={searchPublisher}
                    onChange={(e) => setSearchPublisher(e.target.value)}
                    placeholder="e.g. Bioenergetics Press, Penguin, Tor"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>

                {/* Author Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-700">Author</label>
                  <input
                    type="text"
                    value={searchAuthor}
                    onChange={(e) => setSearchAuthor(e.target.value)}
                    placeholder="e.g. Alexander Lowen, Stephen King"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>

                {/* Title Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-700">Title</label>
                  <input
                    type="text"
                    value={searchTitle}
                    onChange={(e) => setSearchTitle(e.target.value)}
                    placeholder="e.g. Pleasure, Dune, The Shining"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>

                {/* ISBN Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-700">ISBN</label>
                  <input
                    type="text"
                    value={searchIsbn}
                    onChange={(e) => setSearchIsbn(e.target.value)}
                    placeholder="e.g. 9780974373729"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>

                {searchError && (
                  <p className="rounded-lg bg-rose-50 p-2 text-xs font-medium text-rose-700">
                    ⚠️ {searchError}
                  </p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={searchBusy}
                    className="flex-1 rounded-xl bg-sky-600 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
                  >
                    {searchBusy ? "Searching Editions..." : "🔍 Search Editions"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchPublisher("");
                      setSearchAuthor("");
                      setSearchTitle("");
                      setSearchIsbn("");
                      setSearchResults([]);
                      setSearchPerformed(false);
                      setSearchError(null);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Reset
                  </button>
                </div>
              </form>
            </SurfaceCard>
          )}

          {/* Search Results List */}
          {intakeMode === "search" && searchResults.length > 0 && (
            <SurfaceCard className="space-y-3 p-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Matching Editions ({searchResults.length})
                </h4>
                <span className="text-[11px] text-slate-400">Click to evaluate</span>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {searchResults.map((result) => (
                  <button
                    key={result.isbn}
                    type="button"
                    onClick={() => void handleSelectSearchResult(result)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-sky-400 hover:bg-sky-50/50"
                  >
                    {result.coverUrl ? (
                      <img src={result.coverUrl} alt="" className="h-12 w-9 rounded object-cover shadow-sm" />
                    ) : (
                      <div className="grid h-12 w-9 place-items-center rounded bg-slate-100 text-[9px] font-bold text-slate-400">
                        Book
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800">{result.title}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {result.author ?? "Unknown author"} · {result.year ?? "N/A"} · {result.publisher ?? "Publisher N/A"}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">ISBN: {result.isbn}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-emerald-600">{formatCurrency(result.offerAmount)}</p>
                      <p className="text-[10px] text-slate-400">60% Offer</p>
                    </div>
                  </button>
                ))}
              </div>
            </SurfaceCard>
          )}
        </div>

        {/* Right Column: Active Valuation (60% Math) & Customer Batch Cart (7 cols) */}
        <div className="space-y-6 lg:col-span-7">
          {/* Active Book Valuation Card */}
          {activeOffer ? (
            <SurfaceCard className="border-2 border-sky-400/80 bg-white p-6 shadow-xl animate-in zoom-in-95 duration-150">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex gap-4">
                  {activeOffer.coverUrl ? (
                    <img
                      src={activeOffer.coverUrl}
                      alt=""
                      className="h-24 w-16 flex-shrink-0 rounded-lg object-cover shadow-md"
                    />
                  ) : (
                    <div className="grid h-24 w-16 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-400">
                      No cover
                    </div>
                  )}
                  <div>
                    <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-800">
                      Evaluated Item
                    </span>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{activeOffer.title}</h2>
                    <p className="text-xs text-slate-500">
                      {activeOffer.author ?? "Unknown Author"} · {activeOffer.publisher ?? "Publisher unlisted"}
                    </p>
                    <p className="mt-1 font-mono text-[11px] font-medium text-slate-400">ISBN: {activeOffer.isbn}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveOffer(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Close active evaluation"
                >
                  ✕
                </button>
              </div>

              {/* Market Comparison & Price Range Badges */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400">ThriftBooks</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">
                    {formatCurrency(activeOffer.marketSources.thriftbooksPrice)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400">AbeBooks</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">
                    {formatCurrency(activeOffer.marketSources.abebooksPrice)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Google Books</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">
                    {formatCurrency(activeOffer.marketSources.googleBooksPrice)}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 text-center">
                  <p className="text-[10px] font-bold uppercase text-emerald-700">Market Range</p>
                  <p className="mt-0.5 text-xs font-bold text-emerald-800">
                    {formatCurrency(activeOffer.marketSources.priceRangeLow)} – {formatCurrency(activeOffer.marketSources.priceRangeHigh)}
                  </p>
                </div>
              </div>

              {/* Condition Selector */}
              <div className="mt-4">
                <label className="block text-xs font-bold text-slate-700">Book Condition</label>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {conditionOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => void handleConditionChange(opt.value)}
                      className={[
                        "rounded-xl border px-2 py-2 text-center text-xs font-bold transition",
                        selectedCondition === opt.value
                          ? "border-sky-600 bg-sky-50 text-sky-900 shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      {opt.value}
                    </button>
                  ))}
                </div>
              </div>

              {/* The 60% Valuation Calculation Box */}
              <div className="mt-5 rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50/90 to-teal-50/80 p-4">
                <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-3">
                  {/* Resale Price Input */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700">
                      Our Sell Price ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0.5}
                      value={customSellPrice}
                      onChange={(e) => setCustomSellPrice(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 shadow-inner focus:border-emerald-500 focus:outline-none"
                    />
                    <p className="mt-0.5 text-[10px] text-slate-400">Target retail list price</p>
                  </div>

                  {/* 60% Cash Buy Offer Badge */}
                  <div className="rounded-xl border border-emerald-300 bg-emerald-600 p-3 text-center text-white shadow-md">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                      60% Store Cash Offer
                    </p>
                    <p className="mt-0.5 text-2xl font-black">{formatCurrency(computedCashOffer)}</p>
                    <p className="text-[10px] text-emerald-200">60% of {formatCurrency(effectiveSellPrice)}</p>
                  </div>

                  {/* 70% Store Credit Offer Badge */}
                  <div className="rounded-xl border border-amber-300 bg-amber-500 p-3 text-center text-white shadow-md">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-100">
                      Trade-In Store Credit (70%)
                    </p>
                    <p className="mt-0.5 text-2xl font-black">{formatCurrency(computedCreditOffer)}</p>
                    <p className="text-[10px] text-amber-100">+10% Trade bonus</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveOffer(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={handleAddToBatch}
                  className="rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg transition hover:bg-emerald-700 active:scale-95"
                >
                  ✓ Accept & Add to Batch ({formatCurrency(computedCashOffer)})
                </button>
              </div>
            </SurfaceCard>
          ) : (
            <div className="grid place-items-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
              <span className="text-3xl">📚</span>
              <h3 className="mt-2 text-sm font-bold text-slate-700">No Book Currently in Valuation</h3>
              <p className="mt-1 max-w-sm text-xs text-slate-400">
                Scan an ISBN barcode with your scanner or use the Multi-Criteria Search to pull live ThriftBooks & AbeBooks pricing and calculate your 60% buy offer.
              </p>
            </div>
          )}

          {/* Customer Buying Batch & Buyout Cart */}
          <SurfaceCard className="space-y-4 p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Current Customer Buying Batch</h3>
                <p className="text-xs text-slate-500">
                  {batchItems.length} book{batchItems.length !== 1 ? "s" : ""} evaluated in this session
                </p>
              </div>

              {batchItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearBatch}
                  className="text-xs font-semibold text-rose-600 hover:underline"
                >
                  Clear Batch
                </button>
              )}
            </div>

            {/* Batch Items Table */}
            {batchItems.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                The batch is empty. Scanned and accepted books will appear here for checkout.
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {batchItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-800">{item.title}</p>
                        <p className="truncate text-[11px] text-slate-400">
                          {item.author ?? "Unknown"} · Condition: <span className="font-semibold text-slate-600">{item.condition}</span> · Retail: {formatCurrency(item.sellPrice)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-bold text-emerald-600">{formatCurrency(item.buyOffer)}</p>
                        <p className="text-[10px] text-slate-400">60% Offer</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFromBatch(item.id)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Remove item"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Batch Totals Summary Box */}
            {batchItems.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-white p-2.5 shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Total Books</p>
                    <p className="mt-0.5 text-lg font-black text-slate-800">{batchSummary.totalItems}</p>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Est. Resale Value</p>
                    <p className="mt-0.5 text-lg font-black text-slate-800">
                      {formatCurrency(batchSummary.totalEstimatedResaleValue)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-emerald-600 p-2.5 text-white shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-emerald-100">Total Store Offer</p>
                    <p className="mt-0.5 text-lg font-black">{formatCurrency(batchSummary.totalCashOffer)}</p>
                  </div>
                </div>

                {/* Payment Method & Customer Form */}
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700">Payment Payout Method</label>
                    <div className="mt-1 flex gap-2">
                      {(["cash", "storecredit", "check"] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          className={[
                            "flex-1 rounded-xl py-2 text-xs font-bold capitalize transition",
                            paymentMethod === method
                              ? "bg-slate-900 text-white shadow-sm"
                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100",
                          ].join(" ")}
                        >
                          {method === "storecredit" ? "Store Credit (+10%)" : method}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer Name"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
                    />
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone (optional)"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
                    />
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email (optional)"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  {/* Finalize Button */}
                  <button
                    type="button"
                    disabled={processingBuyout}
                    onClick={() => void handleProcessBuyout()}
                    className="w-full rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-xl transition hover:bg-emerald-700 active:scale-98 disabled:opacity-50"
                  >
                    {processingBuyout
                      ? "Ingesting Inventory & Logging Buyout..."
                      : `💰 Complete Buyout & Ingest ${batchSummary.totalItems} Items (${formatCurrency(
                          paymentMethod === "storecredit"
                            ? batchSummary.totalCreditOffer
                            : batchSummary.totalCashOffer,
                        )})`}
                  </button>
                </div>
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>

      {/* Completed Receipt Modal */}
      {completedReceipt && (
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-6 shadow-2xl space-y-4">
            <div className="text-center">
              <span className="text-4xl">🎉</span>
              <h3 className="mt-2 text-xl font-bold text-slate-900">Buyout Completed!</h3>
              <p className="text-xs text-slate-500">Batch Ref: {completedReceipt.batchId}</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Items Acquired:</span>
                <span className="font-bold text-slate-800">{completedReceipt.itemsCount} books</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Payout:</span>
                <span className="font-bold text-emerald-600">{formatCurrency(completedReceipt.totalPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Tender:</span>
                <span className="font-bold capitalize text-slate-800">{completedReceipt.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold text-emerald-700">Added to Active Inventory ✓</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                🖨️ Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setCompletedReceipt(null)}
                className="flex-1 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-black"
              >
                Start Next Buyout →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


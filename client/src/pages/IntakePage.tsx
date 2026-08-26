import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import SurfaceCard from "../components/ui/SurfaceCard";
import { getIntakeContainer, lookupBookByIsbn, receiveInventory, searchBooks, type BookCondition, type BookLookup, type BookSearchResult, type IntakeContainer } from "../services/intake.service";

type ScanHistoryItem = {
  id: string;
  isbn: string;
  title: string | null;
  status: "Received" | "Not added";
  condition: BookCondition | null;
  container: IntakeContainer | null;
  reason: string | null;
  day: string;
  time: string;
  value: number | null;
};

type ScanSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  items: ScanHistoryItem[];
};

type ScannerStation = {
  name: string;
  state: "Offline" | "Online" | "Calibrating";
};

type ScannedBook = BookLookup & {
  container: IntakeContainer;
  condition: BookCondition;
  listPrice: number | null;
  scannedAt: string;
};

const conditionOptions: Array<{ value: BookCondition; discount: number }> = [
  { value: "Fine", discount: 0 },
  { value: "Very Good", discount: 0.1 },
  { value: "Good", discount: 0.2 },
  { value: "Fair", discount: 0.3 },
  { value: "Poor", discount: 0.4 },
];

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function nowDay(): string {
  return new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function readScanSessions(): ScanSession[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem("colophon-scan-sessions") ?? "[]") as ScanSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readCurrentScannedBooks(): ScannedBook[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem("colophon-current-scanned-books") ?? "[]") as ScannedBook[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function IntakePage(): JSX.Element {
  const [activeView, setActiveView] = useState<"scan" | "history">("scan");
  const [scannerConnected, setScannerConnected] = useState(false);
  const [sessionActive] = useState(true);
  const [message, setMessage] = useState("Ready to scan or enter an ISBN.");
  const [barcode, setBarcode] = useState("");
  const [manualSkuOrIsbn, setManualSkuOrIsbn] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualAuthor, setManualAuthor] = useState("");
  const [editionModalOpen, setEditionModalOpen] = useState(false);
  const [editionResults, setEditionResults] = useState<BookSearchResult[]>([]);
  const [editionLoadingIsbn, setEditionLoadingIsbn] = useState<string | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scannerBufferRef = useRef("");
  const scannerTimerRef = useRef<number | null>(null);
  const [scannedBooks, setScannedBooks] = useState<ScannedBook[]>(readCurrentScannedBooks);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [pendingBook, setPendingBook] = useState<BookLookup | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("Camera is off.");
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [stations, setStations] = useState<ScannerStation[]>([
    { name: "Station A", state: "Offline" },
    { name: "Station B", state: "Offline" },
    { name: "Station C", state: "Calibrating" },
  ]);
  const [scanSessions, setScanSessions] = useState<ScanSession[]>(readScanSessions);
  const [currentSessionId] = useState(() => `INTAKE-${Date.now()}`);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historySortField, setHistorySortField] = useState<"time" | "title" | "condition" | "container" | "value" | "status">("time");
  const [historySortDir, setHistorySortDir] = useState<"asc" | "desc">("desc");

  const handleHistoryHeaderSort = (field: "time" | "title" | "condition" | "container" | "value" | "status"): void => {
    if (historySortField === field) {
      setHistorySortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setHistorySortField(field);
      setHistorySortDir(field === "time" ? "desc" : "asc");
    }
  };

  const scannedToday = scannedBooks.length;
  const flaggedCount = 0;
  const matchRate = useMemo(() => {
    const denominator = Math.max(scannedToday, 1);
    const matched = Math.max(scannedToday - flaggedCount, 0);
    return `${((matched / denominator) * 100).toFixed(1)}%`;
  }, [flaggedCount, scannedToday]);

  const historyItems = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    const items = scanSessions.flatMap((session) => session.items);
    const filtered = query
      ? items.filter((item) => [item.title, item.isbn, item.status, item.condition, item.container].some((value) => value?.toLowerCase().includes(query)))
      : items;
    return [...filtered].sort((left, right) => {
      let cmp = 0;
      switch (historySortField) {
        case "title":
          cmp = (left.title ?? "").localeCompare(right.title ?? "");
          break;
        case "time": {
          const leftStamp = `${left.day} ${left.time}`;
          const rightStamp = `${right.day} ${right.time}`;
          cmp = leftStamp.localeCompare(rightStamp);
          break;
        }
        case "condition":
          cmp = (left.condition ?? "").localeCompare(right.condition ?? "");
          break;
        case "container":
          cmp = (left.container ?? "").localeCompare(right.container ?? "");
          break;
        case "value":
          cmp = (left.value ?? 0) - (right.value ?? 0);
          break;
        case "status":
          cmp = (left.status ?? "").localeCompare(right.status ?? "");
          break;
        default:
          cmp = 0;
      }
      return historySortDir === "asc" ? cmp : -cmp;
    });
  }, [historyQuery, historySortDir, historySortField, scanSessions]);

  useEffect(() => {
    window.localStorage.setItem("colophon-scan-sessions", JSON.stringify(scanSessions));
  }, [scanSessions]);

  useEffect(() => {
    window.localStorage.setItem("colophon-current-scanned-books", JSON.stringify(scannedBooks));
  }, [scannedBooks]);

  useEffect(() => {
    setScanSessions((current) => current.some((session) => session.id === currentSessionId)
      ? current
      : [{ id: currentSessionId, startedAt: `${nowDay()} ${nowTime()}`, endedAt: null, items: [] }, ...current]);
  }, [currentSessionId]);

  const addSessionItem = (item: Omit<ScanHistoryItem, "id" | "day" | "time">): void => {
    if (!currentSessionId) return;
    setScanSessions((current) => current.map((session) => session.id === currentSessionId
      ? { ...session, items: [{ ...item, id: `SCAN-${Date.now()}`, day: nowDay(), time: nowTime() }, ...session.items] }
      : session));
  };

  const handleConnectScanner = (): void => {
    setScannerConnected((current) => {
      const next = !current;
      setStations((stationList) =>
        stationList.map((station, index) => {
          if (index < 2) {
            return { ...station, state: next ? "Online" : "Offline" };
          }
          return { ...station, state: "Calibrating" };
        }),
      );
      setMessage(next ? "Scanner station connected. Ready to scan." : "Scanner disconnected.");
      return next;
    });
  };

  const addScannedBook = async (book: BookLookup, condition: BookCondition): Promise<void> => {
    const normalizedIsbn = book.isbn.replace(/[^0-9X]/gi, "").toUpperCase();
    const duplicate = scannedBooks.some((item) => item.isbn.replace(/[^0-9X]/gi, "").toUpperCase() === normalizedIsbn);
    if (duplicate) {
      setMessage(`${book.title ?? "This ISBN"} is already on this session's scan list.`);
      return;
    }
    const basePrice = book.thriftbooksPrice;
    const discount = conditionOptions.find((option) => option.value === condition)?.discount ?? 0;
    const listPrice = basePrice === null ? null : Number((basePrice * (1 - discount)).toFixed(2));
    const container = getIntakeContainer(listPrice);
    await receiveInventory(book, condition, listPrice, container);
    const scannedBook: ScannedBook = { ...book, container, condition, listPrice, scannedAt: nowTime() };
    setScannedBooks((current) => [scannedBook, ...current]);
    setBarcode("");
    window.requestAnimationFrame(() => barcodeInputRef.current?.focus());
    setMessage(listPrice === null ? `${book.title ?? "Book"} routed to ${container} for manual price lookup.` : `${book.title ?? "Book"} routed to ${container}.`);
    addSessionItem({ isbn: book.isbn, title: book.title, status: "Received", condition, container, reason: null, value: listPrice });
  };

  const handleConditionSelected = async (condition: BookCondition): Promise<void> => {
    if (!pendingBook) {
      return;
    }
    try {
      await addScannedBook(pendingBook, condition);
      setPendingBook(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inventory could not be updated.");
    }
  };

  const handleBarcodeLookup = async (value = barcode): Promise<void> => {
    if (lookupBusy) {
      return;
    }

    setLookupBusy(true);
    try {
      const book = await lookupBookByIsbn(value);
      setPendingBook(book);
    } catch (error) {
      addSessionItem({ isbn: value.replace(/[^0-9X]/gi, "").toUpperCase(), title: null, status: "Not added", condition: null, container: null, reason: error instanceof Error ? error.message : "Lookup failed", value: null });
      setMessage(error instanceof Error ? error.message : "Unable to look up this ISBN.");
    } finally {
      setLookupBusy(false);
    }
  };

  const handleManualSearch = async (event?: FormEvent): Promise<void> => {
    if (event) event.preventDefault();
    const skuIsbn = manualSkuOrIsbn.trim();
    const title = manualTitle.trim();
    const author = manualAuthor.trim();

    if (!skuIsbn && !title && !author) {
      setMessage("Enter an SKU, ISBN, Title, or Author to search.");
      return;
    }

    // Direct lookup if only a valid ISBN was entered
    if (skuIsbn && !title && !author) {
      const normalized = skuIsbn.replace(/[^0-9X]/gi, "").toUpperCase();
      if (normalized.length === 10 || normalized.length === 13) {
        setLookupBusy(true);
        try {
          const book = await lookupBookByIsbn(normalized);
          setPendingBook(book);
          setManualSkuOrIsbn("");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Unable to look up this SKU/ISBN.");
        } finally {
          setLookupBusy(false);
        }
        return;
      }
    }

    setSearchBusy(true);
    try {
      const results = await searchBooks(title, author, skuIsbn);
      if (results.length === 0) {
        setMessage("No books found matching those details. Try adjusting your search.");
      } else if (results.length === 1) {
        setLookupBusy(true);
        try {
          const book = await lookupBookByIsbn(results[0].isbn);
          setPendingBook(book);
          setManualSkuOrIsbn("");
          setManualTitle("");
          setManualAuthor("");
        } finally {
          setLookupBusy(false);
        }
      } else {
        setEditionResults(results);
        setEditionModalOpen(true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Book search failed.");
    } finally {
      setSearchBusy(false);
    }
  };

  const handleEditionSelected = async (result: BookSearchResult): Promise<void> => {
    setEditionLoadingIsbn(result.isbn);
    setLookupBusy(true);
    try {
      const book = await lookupBookByIsbn(result.isbn);
      setEditionModalOpen(false);
      setPendingBook(book);
      setManualSkuOrIsbn("");
      setManualTitle("");
      setManualAuthor("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load that title.");
    } finally {
      setLookupBusy(false);
      setEditionLoadingIsbn(null);
    }
  };

  useEffect(() => {
    const handleScannerKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") {
        return;
      }

      if (event.key === "Enter") {
        const value = scannerBufferRef.current;
        scannerBufferRef.current = "";
        if (value.length === 10 || value.length === 13) {
          setBarcode(value);
          void handleBarcodeLookup(value);
        }
        return;
      }

      if (/^[0-9Xx]$/.test(event.key)) {
        event.preventDefault();
        scannerBufferRef.current = `${scannerBufferRef.current}${event.key}`.slice(-13);
        setBarcode(scannerBufferRef.current);
        if (scannerTimerRef.current !== null) {
          window.clearTimeout(scannerTimerRef.current);
        }
        scannerTimerRef.current = window.setTimeout(() => {
          scannerBufferRef.current = "";
        }, 300);
      }
    };

    window.addEventListener("keydown", handleScannerKey);
    return () => {
      window.removeEventListener("keydown", handleScannerKey);
      if (scannerTimerRef.current !== null) {
        window.clearTimeout(scannerTimerRef.current);
      }
    };
  }, []);

  const stopCamera = (): void => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraActive(false);
    setCameraMessage("Camera is off.");
  };

  const startCamera = (): void => {
    setCameraMessage("Requesting camera access...");
    setCameraActive(true);
  };

  useEffect(() => {
    if (!cameraActive) {
      return undefined;
    }

    let cancelled = false;
    let animationFrame = 0;

    const runCamera = async (): Promise<void> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraMessage("Camera access is unavailable. Enter the ISBN manually.");
        setCameraActive(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          await cameraVideoRef.current.play();
        }

        const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
        if (!Detector) {
          setCameraMessage("Camera preview is active. Enter the ISBN manually in this browser.");
          return;
        }

        const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        const detectFrame = async (): Promise<void> => {
          if (cancelled || !cameraVideoRef.current) {
            return;
          }
          const matches = await detector.detect(cameraVideoRef.current);
          const value = matches[0]?.rawValue;
          if (value) {
            setBarcode(value);
            stopCamera();
            setCameraMessage("Barcode captured. Looking up book...");
            return;
          }
          animationFrame = window.requestAnimationFrame(() => void detectFrame());
        };

        setCameraMessage("Point the camera at the book barcode.");
        void detectFrame();
      } catch {
        setCameraMessage("Camera permission was not granted. Enter the ISBN manually.");
        setCameraActive(false);
      }
    };

    void runCamera();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [cameraActive]);


  return (
    <section className="grid gap-4">
      <div className="rounded-full bg-white/55 p-1.5">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
          <button type="button" onClick={() => setActiveView("scan")} className={["rounded-full px-4 py-2.5", activeView === "scan" ? "bg-white text-slate-700 shadow-[0_5px_14px_rgba(76,86,103,0.12)]" : "hover:bg-white/70"].join(" ")}>Scan Session</button>
          <button type="button" onClick={() => setActiveView("history")} className={["rounded-full px-4 py-2.5", activeView === "history" ? "bg-white text-slate-700 shadow-[0_5px_14px_rgba(76,86,103,0.12)]" : "hover:bg-white/70"].join(" ")}>Intake History</button>
        </div>
      </div>
      {activeView === "scan" ? (
      <>
      {editionModalOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-white/70 bg-[#f7f7f8] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Manual Entry Matches</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-800">Select Book Edition</h2>
                <p className="mt-0.5 text-xs text-slate-500">Found {editionResults.length} matching titles. Choose the correct edition to route and price.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditionModalOpen(false)}
                className="rounded-lg px-2.5 py-1 text-sm font-medium text-slate-500 hover:bg-white"
                aria-label="Close edition selector"
              >
                ✕ Close
              </button>
            </div>

            <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
              {editionResults.map((result) => {
                const isLoading = editionLoadingIsbn === result.isbn;
                return (
                  <button
                    key={result.isbn}
                    type="button"
                    disabled={lookupBusy}
                    onClick={() => void handleEditionSelected(result)}
                    className="group flex w-full items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-sky-400 hover:bg-sky-50/70 disabled:opacity-50"
                  >
                    {result.coverUrl ? (
                      <img src={result.coverUrl} alt="" className="h-16 w-11 flex-shrink-0 rounded-md object-cover shadow-sm" />
                    ) : (
                      <div className="grid h-16 w-11 flex-shrink-0 place-items-center rounded-md bg-slate-100 text-center text-[10px] font-semibold text-slate-400">
                        No cover
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="line-clamp-1 block text-sm font-semibold text-slate-800 group-hover:text-sky-700">
                        {result.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {result.author ?? "Author unavailable"}
                        {result.year ? ` · ${result.year}` : ""}
                        {result.publisher ? ` · ${result.publisher}` : ""}
                      </span>
                      <span className="mt-1.5 inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600">
                        ISBN: {result.isbn}
                      </span>
                    </div>
                    <div className="text-right">
                      {isLoading ? (
                        <span className="text-xs font-semibold text-sky-600">Loading...</span>
                      ) : (
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition group-hover:bg-sky-600 group-hover:text-white">
                          Select →
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {pendingBook ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/70 bg-[#f7f7f8] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Condition check</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-800">{pendingBook.title ?? "Scanned book"}</h2>
                <p className="mt-1 text-sm text-slate-500">{pendingBook.author ?? "Author unavailable"} · {pendingBook.isbn}</p>
              </div>
              <button type="button" onClick={() => { setPendingBook(null); setBarcode(""); }} className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-white" aria-label="Cancel condition selection">Close</button>
            </div>
            <p className="mt-4 rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-600">
              Resale Value: {pendingBook.thriftbooksPrice === null ? "No value" : `$${pendingBook.thriftbooksPrice.toFixed(2)}`}. Select a condition to set the list price and bin.
            </p>
            <div className="mt-4 grid gap-2">
              {conditionOptions.map((option) => {
                const listPrice = pendingBook.thriftbooksPrice === null ? null : Number((pendingBook.thriftbooksPrice * (1 - option.discount)).toFixed(2));
                const container = getIntakeContainer(listPrice);
                return (
                  <button key={option.value} type="button" onClick={() => void handleConditionSelected(option.value)} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-sky-400 hover:bg-sky-50">
                    <span><span className="font-semibold text-slate-800">{option.value}</span><span className="ml-2 text-xs text-slate-500">{option.discount === 0 ? "Full price" : `${option.discount * 100}% off`}</span></span>
                    <span className="text-right text-sm font-semibold text-slate-700">{listPrice === null ? "No price" : `$${listPrice.toFixed(2)}`}<span className="block text-xs font-normal text-slate-400">{container}</span></span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      <div className="order-2">
        <SurfaceCard className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleConnectScanner}
              className="rounded-full bg-white px-5 py-2 text-[1.02rem] font-semibold text-slate-600"
            >
              {scannerConnected ? "Disconnect Scanner" : "Connect Scanner"}
            </button>
          </div>
          <p className="mt-3 rounded-xl bg-white/60 px-3 py-2 text-xs font-medium text-slate-600">{message}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {[
              { label: "Scanned Today", value: String(scannedToday) },
              { label: "Match Rate", value: matchRate },
              { label: "Flagged", value: String(flaggedCount) },
              { label: "Scans This View", value: String(scannedBooks.length) },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-white/70 p-2.5">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-700">{item.value}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>

      </div>

        <SurfaceCard className="order-1 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Scan Intake</p>
              <p className="mt-1 text-xs text-slate-500">Scan a barcode or enter an ISBN to identify and route the book.</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              {scannedBooks.length} scanned now
            </span>
          </div>

          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void handleBarcodeLookup();
            }}
          >
            <input
              ref={barcodeInputRef}
              autoFocus
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleBarcodeLookup(event.currentTarget.value);
                }
              }}
              placeholder="Scan barcode or enter ISBN"
              aria-label="Barcode or ISBN"
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
            />
            <button
              type="submit"
              disabled={lookupBusy || barcode.trim().length === 0}
              className="h-11 rounded-xl bg-[#e9ff63] px-5 text-sm font-semibold text-slate-700 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {lookupBusy ? "Looking up..." : "Look Up ISBN"}
            </button>
            <button
              type="button"
              onClick={cameraActive ? stopCamera : startCamera}
              className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {cameraActive ? "Stop Camera" : "Use Camera"}
            </button>
          </form>

          <form className="mt-4 border-t border-slate-200/70 pt-4" onSubmit={(event) => void handleManualSearch(event)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-700">Manual Book Entry</p>
                <p className="text-xs text-slate-500">Enter SKU, ISBN, Title, and/or Author when barcode is unavailable.</p>
              </div>
              {(manualSkuOrIsbn || manualTitle || manualAuthor) ? (
                <button
                  type="button"
                  onClick={() => {
                    setManualSkuOrIsbn("");
                    setManualTitle("");
                    setManualAuthor("");
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear fields
                </button>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <input
                value={manualSkuOrIsbn}
                onChange={(event) => setManualSkuOrIsbn(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleManualSearch();
                  }
                }}
                placeholder="Manual SKU or ISBN"
                aria-label="Manual SKU or ISBN"
                className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
              />
              <input
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleManualSearch();
                  }
                }}
                placeholder="Title"
                aria-label="Search by title"
                className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
              />
              <input
                value={manualAuthor}
                onChange={(event) => setManualAuthor(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleManualSearch();
                  }
                }}
                placeholder="Author"
                aria-label="Search by author"
                className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400"
              />
            </div>

            <div className="mt-2.5 flex justify-end">
              <button
                type="submit"
                disabled={searchBusy || lookupBusy || (!manualSkuOrIsbn.trim() && !manualTitle.trim() && !manualAuthor.trim())}
                className="h-10 rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {searchBusy ? "Searching..." : "Find & Route Book"}
              </button>
            </div>
          </form>

          {cameraActive ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
              <video ref={cameraVideoRef} muted playsInline className="aspect-video max-h-72 w-full object-cover" />
              <p className="px-3 py-2 text-xs text-slate-300">{cameraMessage}</p>
            </div>
          ) : null}

          {scannedBooks.length > 0 ? (
            <div className="mt-4 border-t border-slate-200/70 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Running scan list ({scannedBooks.length})</p>
                <button
                  type="button"
                  onClick={() => setScannedBooks([])}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600"
                >
                  Clear scan list
                </button>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
              {scannedBooks.map((book, index) => (
                <div
                  key={`${book.isbn}-${book.scannedAt}-${index}`}
                  className={[
                    "grid gap-3 rounded-2xl border p-3 sm:grid-cols-[88px_1fr_auto]",
                    book.container === "Green Box"
                      ? "border-emerald-300 bg-emerald-100"
                      : book.container === "Blue Bin"
                        ? "border-sky-300 bg-sky-100"
                        : "border-rose-300 bg-rose-100",
                  ].join(" ")}
                >
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt="" className="h-28 w-[88px] rounded-lg object-cover" />
                  ) : (
                    <div className="grid h-28 w-[88px] place-items-center rounded-lg bg-slate-100 text-center text-[11px] font-semibold text-slate-400">
                      No cover
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold text-slate-800">{book.title ?? "Title unavailable"}</p>
                    <p className="mt-1 text-xs text-slate-500">{book.author ?? "Author unavailable"}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                      <dt>ISBN</dt>
                      <dd className="text-right font-medium text-slate-700">{book.isbn}</dd>
                      <dt>Qty on hand</dt>
                      <dd className="text-right font-medium text-slate-700">{book.quantityOnHand}</dd>
                      <dt>Resale Value</dt>
                      <dd className="text-right font-medium text-slate-700">
                        {book.thriftbooksPrice === null ? "No value" : `$${book.thriftbooksPrice.toFixed(2)}`}
                      </dd>
                      <dt>List price</dt>
                      <dd className="text-right font-medium text-slate-700">
                        {book.listPrice === null ? "No value" : `$${book.listPrice.toFixed(2)}`}
                      </dd>
                      <dt>Condition</dt>
                      <dd className="text-right font-medium text-slate-700">{book.condition}</dd>
                      <dt>Category</dt>
                      <dd className="text-right font-medium text-slate-700">{book.category ?? "Uncategorized"}</dd>
                      <dt>Subcategory</dt>
                      <dd className="text-right font-medium text-slate-700">{book.subcategory ?? "None"}</dd>
                    </dl>
                    <p className="mt-2 text-[11px] text-slate-400">Source: {book.source}</p>
                    <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white/70 p-2.5 text-xs text-slate-600">
                      <p className="font-semibold text-slate-700">Inventory Label</p>
                      <p className="mt-1">SKU: {book.label.sku}</p>
                      <p>Barcode: {book.label.barcode}</p>
                    </div>
                  </div>
                  <span
                    className={[
                      "self-start rounded-full px-3 py-1 text-center text-xs font-bold",
                      book.container === "Green Box"
                        ? "bg-emerald-100 text-emerald-700"
                        : book.container === "Blue Bin"
                          ? "bg-sky-100 text-sky-700"
                          : "bg-rose-100 text-rose-700",
                    ].join(" ")}
                  >
                    {book.container}
                    {book.listPrice === null ? <span className="mt-1 block text-[10px] font-semibold">Manual price lookup</span> : null}
                  </span>
                </div>
              ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
              Waiting for the first barcode scan.
            </div>
          )}
        </SurfaceCard>

      </>
      ) : null}

      {activeView === "history" ? <SurfaceCard className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-sm font-semibold text-slate-700">Intake Report</p><p className="mt-1 text-xs text-slate-500">Every scanned title, timestamp, condition, bin, and value.</p></div>
          <button type="button" onClick={() => setScanSessions([])} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">Clear History</button>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search title, ISBN, condition, or bin" aria-label="Search intake report" className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-sky-400" />
        </div>
        <div className="mt-3 overflow-x-auto">
          {historyItems.length === 0 ? <p className="rounded-xl bg-white/60 px-3 py-2 text-sm text-slate-500">No scans match this report.</p> : (
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  {[
                    { field: "title" as const, label: "Title" },
                    { field: "time" as const, label: "Day" },
                    { field: "time" as const, label: "Time" },
                    { field: "condition" as const, label: "Condition" },
                    { field: "container" as const, label: "Bin" },
                    { field: "value" as const, label: "Value" },
                    { field: "status" as const, label: "Status" },
                  ].map(({ field, label }, idx) => {
                    const isActive = historySortField === field && (field !== "time" || idx === 1);
                    return (
                      <th
                        key={`${field}-${label}`}
                        scope="col"
                        onClick={() => handleHistoryHeaderSort(field)}
                        className="cursor-pointer select-none px-3 py-2 transition-colors hover:text-slate-700"
                        title={`Sort by ${label}`}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <span className={isActive ? "font-bold text-slate-800" : ""}>{label}</span>
                          <span className={["text-xs transition-colors", isActive ? "font-bold text-sky-600" : "text-slate-300"].join(" ")}>
                            {isActive ? (historySortDir === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {historyItems.map((item) => (
                  <tr key={item.id} className="bg-white/80">
                    <td className="rounded-l-xl px-3 py-3"><p className="font-semibold text-slate-800">{item.title ?? "Title unavailable"}</p><p className="mt-1 text-xs text-slate-500">{item.isbn}</p></td>
                    <td className="px-3 py-3 text-xs">{item.day}</td>
                    <td className="px-3 py-3 text-xs">{item.time}</td>
                    <td className="px-3 py-3 text-xs">{item.condition ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{item.container ?? "—"}</td>
                    <td className="px-3 py-3 font-semibold">{item.value === null ? "Manual lookup" : `$${item.value.toFixed(2)}`}</td>
                    <td className="rounded-r-xl px-3 py-3 text-xs font-semibold"><span className={item.status === "Received" ? "text-emerald-700" : "text-rose-700"}>{item.status}</span>{item.reason ? <span className="mt-1 block font-normal text-slate-500">{item.reason}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SurfaceCard> : null}
    </section>
  );
}

export default IntakePage;

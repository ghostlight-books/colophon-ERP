import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import SurfaceCard from "../../components/ui/SurfaceCard";
import LibrarySpaceSwitcher from "../../components/library/LibrarySpaceSwitcher";
import CameraBarcodeScanner from "../../components/common/CameraBarcodeScanner";
import { useLibrarySpace } from "../../context/LibrarySpaceContext";
import {
  scanLibraryIsbn,
  fetchShelves,
  deleteLibraryVolume,
  bulkDeleteLibraryVolumes,
  updateLibraryVolume,
  evaluateRareBookPricing,
  type LibraryVolume,
  type LibraryShelfLocation,
  type RarePricingResult,
} from "../../services/library.service";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

// Audio chime synthesized via Web Audio API for fast zero-asset feedback
function playScanChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12); // A6
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {}
}

export default function LibraryScannerPage() {
  const { activeSpace, activeSpaceId } = useLibrarySpace();
  const [isbnInput, setIsbnInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Shelves selection
  const [shelves, setShelves] = useState<LibraryShelfLocation[]>([]);
  const [selectedShelfId, setSelectedShelfId] = useState<string>("");

  // Scan Session State
  const [sessionVolumes, setSessionVolumes] = useState<LibraryVolume[]>([]);
  const [lastScanned, setLastScanned] = useState<LibraryVolume | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Rare Attributes & Collectible Pricing State
  const [condition, setCondition] = useState<"FINE" | "VERY_GOOD" | "GOOD" | "FAIR" | "POOR">("VERY_GOOD");
  const [isSigned, setIsSigned] = useState(false);
  const [isFirstEdition, setIsFirstEdition] = useState(false);
  const [isFirstPrinting, setIsFirstPrinting] = useState(false);
  const [takeOffers, setTakeOffers] = useState(false);
  const [evaluatingPricing, setEvaluatingPricing] = useState(false);
  const [rarePricing, setRarePricing] = useState<RarePricingResult | null>(null);

  // Video feed ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningIntervalRef = useRef<number | null>(null);

  // Load shelves on mount
  useEffect(() => {
    void fetchShelves().then((list) => {
      setShelves(list);
      if (list.length > 0) setSelectedShelfId(list[0].id);
    });
  }, []);

  // Handle Camera Start / Stop
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      startBarcodeDetection();
    } catch (err) {
      setCameraError("Could not access camera. Please allow camera permissions or enter ISBN manually.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (scanningIntervalRef.current) {
      clearInterval(scanningIntervalRef.current);
      scanningIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Barcode Detection Loop using native BarcodeDetector API if available
  const startBarcodeDetection = () => {
    if (!("BarcodeDetector" in window)) {
      return;
    }

    const detector = new (window as any).BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"],
    });

    let lastDetectedIsbn = "";
    let lastDetectedTime = 0;

    scanningIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          const raw = barcodes[0].rawValue;
          const clean = raw.replace(/[^0-9X]/gi, "").toUpperCase();
          const now = Date.now();
          if (clean && clean.length >= 10 && (clean !== lastDetectedIsbn || now - lastDetectedTime > 3000)) {
            lastDetectedIsbn = clean;
            lastDetectedTime = now;
            playScanChime();
            void handleProcessIsbn(clean);
          }
        }
      } catch {}
    }, 400);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Process and Intake ISBN
  const handleProcessIsbn = async (rawIsbn: string) => {
    const clean = rawIsbn.replace(/[^0-9X]/gi, "").toUpperCase();
    if (!clean || clean.length < 8) {
      setErrorMessage("Please enter a valid 10 or 13-digit ISBN.");
      return;
    }

    setIsScanning(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSigned(false);
    setIsFirstEdition(false);
    setIsFirstPrinting(false);
    setTakeOffers(false);
    setRarePricing(null);

    try {
      const volume = await scanLibraryIsbn(clean, selectedShelfId || null, {
        librarySpaceId: activeSpaceId !== "ALL" ? activeSpaceId : undefined,
        condition,
      });
      playScanChime();
      setLastScanned(volume);
      setSessionVolumes((prev) => [volume, ...prev]);
      setSuccessMessage(`Cataloged "${volume.title}" (${volume.deweyDecimal ? `Dewey: ${volume.deweyDecimal}` : "Classified"})`);
      setIsbnInput("");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to classify and intake ISBN.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleToggleSpecialOption = async (option: "signed" | "firstEd" | "firstPrint" | "offers") => {
    if (!lastScanned) return;

    let nextSigned = isSigned;
    let nextFirstEd = isFirstEdition;
    let nextFirstPrint = isFirstPrinting;
    let nextOffers = takeOffers;

    if (option === "signed") {
      nextSigned = !isSigned;
      setIsSigned(nextSigned);
    } else if (option === "firstEd") {
      nextFirstEd = !isFirstEdition;
      setIsFirstEdition(nextFirstEd);
    } else if (option === "firstPrint") {
      nextFirstPrint = !isFirstPrinting;
      setIsFirstPrinting(nextFirstPrint);
    } else if (option === "offers") {
      nextOffers = !takeOffers;
      setTakeOffers(nextOffers);
      await updateLibraryVolume(lastScanned.id, {
        listingStatus: nextOffers ? "ALLOW_OFFERS" : "COLLECTION_ONLY",
      });
      return;
    }

    setEvaluatingPricing(true);
    try {
      const evaluation = await evaluateRareBookPricing({
        isbn: lastScanned.isbn,
        title: lastScanned.title,
        author: lastScanned.author || undefined,
        condition,
        isSigned: nextSigned,
        isFirstEdition: nextFirstEd,
        isFirstPrinting: nextFirstPrint,
        baselinePrice: lastScanned.replacementValue || 18.99,
        publishYear: lastScanned.publishYear,
        bindingFormat: lastScanned.bindingFormat,
      });

      setRarePricing(evaluation);
      await updateLibraryVolume(lastScanned.id, {
        condition,
        isSigned: nextSigned,
        isFirstEdition: nextFirstEd,
        isFirstPrinting: nextFirstPrint,
        rareMarketValue: evaluation.rareMarketValue,
        askingPrice: evaluation.suggestedAskingPrice,
        valuationNotes: evaluation.valuationRationale,
      });
    } catch (err) {
      console.warn("Pricing evaluation error:", err);
    } finally {
      setEvaluatingPricing(false);
    }
  };

  const handleConditionChange = async (nextCondition: "FINE" | "VERY_GOOD" | "GOOD" | "FAIR" | "POOR") => {
    setCondition(nextCondition);
    if (!lastScanned) return;

    setEvaluatingPricing(true);
    try {
      const evaluation = await evaluateRareBookPricing({
        isbn: lastScanned.isbn,
        title: lastScanned.title,
        author: lastScanned.author || undefined,
        condition: nextCondition,
        isSigned,
        isFirstEdition,
        isFirstPrinting,
        baselinePrice: lastScanned.replacementValue || 18.99,
        publishYear: lastScanned.publishYear,
        bindingFormat: lastScanned.bindingFormat,
      });

      setRarePricing(evaluation);
      await updateLibraryVolume(lastScanned.id, {
        condition: nextCondition,
        rareMarketValue: evaluation.rareMarketValue,
        askingPrice: evaluation.suggestedAskingPrice,
        valuationNotes: evaluation.valuationRationale,
      });
    } catch (err) {
      console.warn("Condition evaluation error:", err);
    } finally {
      setEvaluatingPricing(false);
    }
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isbnInput.trim()) {
      void handleProcessIsbn(isbnInput);
    }
  };

  const handleRemoveVolume = async (vol: LibraryVolume) => {
    try {
      await deleteLibraryVolume(vol.id);
      setSessionVolumes((prev) => prev.filter((v) => v.id !== vol.id));
      if (lastScanned?.id === vol.id) {
        setLastScanned(null);
      }
      setSuccessMessage(`Removed "${vol.title}" from library.`);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to remove volume.");
    }
  };

  const handleDeleteAllSessionVolumes = async () => {
    if (sessionVolumes.length === 0) return;
    const confirmed = window.confirm(
      `Remove all ${sessionVolumes.length} volumes scanned this session from your library collection?`
    );
    if (!confirmed) return;
    try {
      await bulkDeleteLibraryVolumes(sessionVolumes.map((v) => v.id));
      const count = sessionVolumes.length;
      setSessionVolumes([]);
      setLastScanned(null);
      setSuccessMessage(`Removed ${count} session volumes from library.`);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to remove session volumes.");
    }
  };

  const totalSessionValue = sessionVolumes.reduce((sum, v) => sum + (v.replacementValue || 0), 0);

  return (
    <div className="space-y-6">
      {/* Full-Screen Camera Overlay */}
      {cameraActive && (
        <div className="fixed inset-0 z-[9990] bg-black pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
          <CameraBarcodeScanner
            onScan={handleProcessIsbn}
            onClose={() => setCameraActive(false)}
            className="w-full h-full rounded-none border-none"
          />
        </div>
      )}

      {/* Header card */}
      <SurfaceCard className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 text-xl font-bold shadow-sm">
              📷
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  {activeSpaceId === "ALL" ? "All Libraries" : activeSpace?.name || "Library"} Scanner
                </h1>
                <LibrarySpaceSwitcher />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Scanning books into <span className="font-bold text-slate-700">{activeSpace?.name || "Primary Library"}</span> &bull; auto-extracts Dewey Decimal, LOC Call Numbers, Cover Images & Rare Valuations
              </p>
            </div>
          </div>

          {/* Session totals pill & Quick Scanner Link */}
          <div className="flex items-center gap-3">
            <Link
              to="/library/quick-scan"
              className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition"
            >
              <span>📱</span>
              <span>Quick Phone Scanner</span>
            </Link>
            <div className="px-3.5 py-1.5 bg-indigo-50 rounded-xl border border-indigo-200 text-xs font-bold text-indigo-800">
              Session Scans: <span className="text-indigo-950 font-black">{sessionVolumes.length}</span>
            </div>
            <div className="px-3.5 py-1.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs font-bold text-emerald-800">
              Session Value: <span className="text-emerald-950 font-black">{formatCurrency(totalSessionValue)}</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
            <button type="button" onClick={() => setErrorMessage(null)} className="text-rose-600 font-bold px-1">✕</button>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <span>✅</span>
              <span>{successMessage}</span>
            </div>
            <button type="button" onClick={() => setSuccessMessage(null)} className="text-emerald-600 font-bold px-1">✕</button>
          </div>
        )}

        {/* Target Shelf Pre-Selector */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <span>🗄️</span>
            <span>Assign Scanned Volumes to Shelf Location:</span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedShelfId}
              onChange={(e) => setSelectedShelfId(e.target.value)}
              className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-indigo-500 shadow-2xs"
            >
              <option value="">-- No Shelf Assigned (Unassigned) --</option>
              {shelves.map((shelf) => (
                <option key={shelf.id} value={shelf.id}>
                  {shelf.fullLocationLabel} ({shelf.volumeCount ?? 0} books)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Scanner Input Controls: Camera View & Manual Barcode Input */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-1">
          {/* Left Column: Camera Viewfinder (6 cols) */}
          <div className="lg:col-span-6 space-y-3">
            <div className="relative w-full h-[280px] bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 flex flex-col items-center justify-center shadow-md text-center p-6 space-y-3 text-slate-400">
              <span className="text-4xl block">📷</span>
              <p className="text-xs font-semibold text-slate-200">Device Camera Scanner</p>
              <p className="text-[11px] text-slate-400 max-w-[260px]">
                Position your book's barcode in front of the camera for instant auto-intake
              </p>
              <button
                type="button"
                onClick={() => setCameraActive(true)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium text-xs rounded-2xl transition shadow-xs cursor-pointer"
              >
                Start Camera Scanner
              </button>
            </div>

            {cameraError && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-2.5">{cameraError}</p>
            )}
          </div>

          {/* Right Column: Manual Barcode / USB Scanner Input & Fast Submit (6 cols) */}
          <div className="lg:col-span-6 space-y-4 flex flex-col justify-between">
            <form onSubmit={handleManualSubmit} className="space-y-3 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>⌨️</span> Manual or USB Handheld Barcode Input
                </span>
                <span className="text-[10px] text-slate-400">Press Enter to Scan</span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">ISBN-10 or ISBN-13</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={isbnInput}
                    onChange={(e) => setIsbnInput(e.target.value)}
                    placeholder="e.g. 9780553293357 or 0441172717"
                    autoFocus
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 font-mono font-bold focus:outline-none focus:border-indigo-500 focus:bg-white transition"
                  />
                  <button
                    type="submit"
                    disabled={isScanning || !isbnInput.trim()}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    {isScanning ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Classifying...</span>
                      </>
                    ) : (
                      <>
                        <span>Intake Book</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Compatible with any USB/Bluetooth laser barcode scanner. Simply click the input box and pull the trigger!
              </p>
            </form>

            {/* Classification Feature Highlights */}
            <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200/70 space-y-2 text-xs text-indigo-950">
              <span className="font-bold flex items-center gap-1.5">
                <span>✨</span> Auto-Extracted Library Metadata
              </span>
              <ul className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <li className="flex items-center gap-1">
                  <span className="text-indigo-600">✔</span> Dewey Decimal (000-900)
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-indigo-600">✔</span> Library of Congress (LCC/LCCN)
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-indigo-600">✔</span> Replacement Insurance Value
                </li>
                <li className="flex items-center gap-1">
                  <span className="text-indigo-600">✔</span> Cover Images & Physical Pages
                </li>
              </ul>
            </div>
          </div>
        </div>
      </SurfaceCard>

      {/* Last Scanned Volume Card Inspector */}
      {lastScanned && (
        <SurfaceCard className="space-y-4 animate-fadeIn border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/30 to-white">
          <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[11px] rounded-md border border-emerald-200">
                Just Cataloged
              </span>
              <h2 className="text-sm font-bold text-slate-900">Volume Details & Classification</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-slate-500">ISBN: {lastScanned.isbn}</span>
              <button
                type="button"
                onClick={() => handleRemoveVolume(lastScanned)}
                className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="Remove this book from library"
              >
                <span>🗑️</span>
                <span>Remove (Undo Scan)</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-5 items-start">
            {/* Book Cover Photo */}
            <div className="w-24 h-36 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm shrink-0 flex items-center justify-center">
              {lastScanned.coverUrl ? (
                <img src={lastScanned.coverUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl">📖</span>
              )}
            </div>

            {/* Metadata breakdown */}
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-base font-black text-slate-900">{lastScanned.title}</h3>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  {lastScanned.author || "Unknown Author"} &bull; {lastScanned.publisher || "Unknown Publisher"}{" "}
                  {lastScanned.publishYear ? `(${lastScanned.publishYear})` : ""}
                </p>
              </div>

              {/* Classification Badges */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {lastScanned.deweyDecimal && (
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-lg font-bold">
                    Dewey: <span className="font-mono">{lastScanned.deweyDecimal}</span>
                  </span>
                )}
                {lastScanned.deweyCategory && (
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg font-medium">
                    {lastScanned.deweyCategory}
                  </span>
                )}
                {lastScanned.locClassification && (
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg font-bold">
                    LOC: <span className="font-mono">{lastScanned.locClassification}</span>
                  </span>
                )}
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg font-bold">
                  Standard Insurance Value: {formatCurrency(lastScanned.replacementValue)}
                </span>
                {lastScanned.roomName && (
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg font-medium">
                    📍 {lastScanned.roomName} &gt; {lastScanned.shelfName}
                  </span>
                )}
              </div>

              {/* Book Condition Selector */}
              <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">Condition Grade:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: "FINE", label: "💎 Fine / Like New" },
                    { key: "VERY_GOOD", label: "✨ Very Good" },
                    { key: "GOOD", label: "📖 Good" },
                    { key: "FAIR", label: "📑 Fair" },
                    { key: "POOR", label: "🩹 Poor" },
                  ].map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => handleConditionChange(c.key as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        condition === c.key
                          ? "bg-indigo-600 border-indigo-500 text-white shadow-xs"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Special Edition Toggles (Signed, 1st Ed, 1st Print, Take Offers) */}
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <span>🏷️</span>
                    <span>Special Attributes (Auto Re-Scrapes Rare Market):</span>
                  </span>

                  {evaluatingPricing && (
                    <span className="text-indigo-600 font-bold flex items-center gap-1 text-[11px]">
                      <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <span>Re-evaluating AbeBooks & Rare Auctions...</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleSpecialOption("signed")}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isSigned
                        ? "bg-amber-100 border-amber-300 text-amber-900 shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>✨</span>
                    <span>Signed Copy</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleSpecialOption("firstEd")}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isFirstEdition
                        ? "bg-indigo-100 border-indigo-300 text-indigo-900 shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>🥇</span>
                    <span>First Edition</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleSpecialOption("firstPrint")}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isFirstPrinting
                        ? "bg-purple-100 border-purple-300 text-purple-900 shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>🔢</span>
                    <span>1st Printing</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleSpecialOption("offers")}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      takeOffers
                        ? "bg-emerald-100 border-emerald-300 text-emerald-900 shadow-xs"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>🤝</span>
                    <span>Take Offers / Open to Trade</span>
                  </button>
                </div>

                {/* Rare Appraised Pricing Card Banner */}
                {(isSigned || isFirstEdition || isFirstPrinting || rarePricing) && (
                  <div className="p-3 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-200 text-amber-900 font-bold rounded text-[10px]">
                          Rare Collectible Appraisal
                        </span>
                        <span className="font-mono font-black text-amber-900 text-sm">
                          {formatCurrency(rarePricing?.rareMarketValue || lastScanned.rareMarketValue || lastScanned.replacementValue)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {rarePricing?.valuationRationale || "Appraised based on collectible attributes and verified AbeBooks comps."}
                      </p>
                    </div>

                    {rarePricing?.suggestedAskingPrice && (
                      <div className="shrink-0 text-right">
                        <span className="text-[10px] text-slate-500 block">Suggested Asking Price</span>
                        <span className="font-mono font-black text-emerald-700 text-sm">
                          {formatCurrency(rarePricing.suggestedAskingPrice)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {lastScanned.description && (
                <p className="text-xs text-slate-500 line-clamp-2">{lastScanned.description}</p>
              )}
            </div>
          </div>
        </SurfaceCard>
      )}

      {/* Session Scanned Queue Table */}
      {sessionVolumes.length > 0 && (
        <SurfaceCard className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <h2 className="text-sm font-bold text-slate-900">
                Current Scanning Session Log ({sessionVolumes.length} Volumes &bull; Total Value: {formatCurrency(totalSessionValue)})
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDeleteAllSessionVolumes}
                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                🗑️ Delete All Scanned ({sessionVolumes.length})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
                  <th className="py-2.5 px-3">Cover</th>
                  <th className="py-2.5 px-3">Title & Author</th>
                  <th className="py-2.5 px-3">ISBN</th>
                  <th className="py-2.5 px-3">Dewey (DDC)</th>
                  <th className="py-2.5 px-3">LOC Call #</th>
                  <th className="py-2.5 px-3">Shelf Location</th>
                  <th className="py-2.5 px-3 text-right">Replacement Value</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessionVolumes.map((vol) => (
                  <tr key={vol.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-2 px-3">
                      <div className="w-8 h-11 bg-slate-100 rounded overflow-hidden border border-slate-200 flex items-center justify-center">
                        {vol.coverUrl ? (
                          <img src={vol.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span>📖</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 min-w-[200px]">
                      <p className="font-bold text-slate-900 truncate">{vol.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">{vol.author || "Unknown"}</p>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600">{vol.isbn}</td>
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                      {vol.deweyDecimal || "--"}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-700">
                      {vol.locClassification || "--"}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {vol.roomName ? `${vol.roomName} > ${vol.shelfName}` : "Unassigned"}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700">
                      {formatCurrency(vol.replacementValue)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveVolume(vol)}
                        title={`Remove "${vol.title}" from library`}
                        className="px-2 py-1 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-500 rounded-lg text-[11px] font-bold transition flex items-center gap-1 mx-auto cursor-pointer"
                      >
                        <span>🗑️</span>
                        <span>Remove</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}


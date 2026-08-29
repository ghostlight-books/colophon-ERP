import { useEffect, useRef, useState, type FormEvent } from "react";
import SurfaceCard from "../../components/ui/SurfaceCard";
import {
  scanLibraryIsbn,
  fetchShelves,
  type LibraryVolume,
  type LibraryShelfLocation,
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

    try {
      const volume = await scanLibraryIsbn(clean, selectedShelfId || null);
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

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isbnInput.trim()) {
      void handleProcessIsbn(isbnInput);
    }
  };

  const totalSessionValue = sessionVolumes.reduce((sum, v) => sum + (v.replacementValue || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header card */}
      <SurfaceCard className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 text-xl font-bold shadow-sm">
              📷
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Camera & ISBN Library Scanner</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Scan barcodes with device camera to extract Dewey Decimal, LOC Call Numbers, Cover Images & Replacement Valuation
              </p>
            </div>
          </div>

          {/* Session totals pill */}
          <div className="flex items-center gap-3">
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
            <div className="relative w-full h-[280px] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 flex flex-col items-center justify-center shadow-md">
              <video
                ref={videoRef}
                className={`w-full h-full object-cover ${cameraActive ? "block" : "hidden"}`}
                playsInline
                muted
              />

              {!cameraActive && (
                <div className="text-center p-6 space-y-3 text-slate-400">
                  <span className="text-4xl block">📷</span>
                  <p className="text-xs font-bold text-slate-300">Device Camera Scanner</p>
                  <p className="text-[11px] text-slate-400 max-w-[260px]">
                    Position your book's barcode in front of the lens for instant auto-intake
                  </p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-sm cursor-pointer"
                  >
                    Start Camera
                  </button>
                </div>
              )}

              {cameraActive && (
                <>
                  {/* Viewfinder Target Box Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[70%] h-[40%] border-2 border-dashed border-emerald-400/90 rounded-2xl bg-emerald-500/10 shadow-[0_0_15px_rgba(52,211,153,0.3)] animate-pulse flex items-center justify-center">
                      <span className="text-[10px] font-bold text-emerald-300 bg-slate-900/80 px-2 py-0.5 rounded-full">
                        Align Barcode Here
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={stopCamera}
                    className="absolute top-3 right-3 px-2.5 py-1 bg-slate-900/80 hover:bg-slate-900 text-slate-200 border border-slate-700 text-xs font-bold rounded-lg transition"
                  >
                    Stop Camera
                  </button>
                </>
              )}
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
            <span className="text-xs font-mono font-bold text-slate-500">ISBN: {lastScanned.isbn}</span>
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
                  Insurance Value: {formatCurrency(lastScanned.replacementValue)}
                </span>
                {lastScanned.roomName && (
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg font-medium">
                    📍 {lastScanned.roomName} &gt; {lastScanned.shelfName}
                  </span>
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
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>📋</span> Current Scanning Session Log ({sessionVolumes.length} Volumes)
            </h2>
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

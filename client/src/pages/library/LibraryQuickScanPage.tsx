import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import LibrarySpaceSwitcher from "../../components/library/LibrarySpaceSwitcher";
import { useLibrarySpace } from "../../context/LibrarySpaceContext";
import {
  scanLibraryIsbn,
  deleteLibraryVolume,
  updateLibraryVolume,
  evaluateRareBookPricing,
  fetchShelves,
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

function triggerHapticSuccess() {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([25, 40, 30]);
    } catch {}
  }
}

export default function LibraryQuickScanPage() {
  const navigate = useNavigate();
  const { activeSpace, activeSpaceId } = useLibrarySpace();

  // Video & Stream State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanMode, setScanMode] = useState<"barcode" | "manual">("barcode");

  // Continuous Batch Mode
  const [batchMode, setBatchMode] = useState(true);

  // Manual input state
  const [manualIsbn, setManualIsbn] = useState("");
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  // Scan & Intake State
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [scannedVolume, setScannedVolume] = useState<LibraryVolume | null>(null);
  const [sessionVolumes, setSessionVolumes] = useState<LibraryVolume[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Condition State for next scan
  const [defaultCondition, setDefaultCondition] = useState<"FINE" | "VERY_GOOD" | "GOOD" | "FAIR" | "POOR">("VERY_GOOD");

  // Shelves
  const [shelves, setShelves] = useState<LibraryShelfLocation[]>([]);
  const [selectedShelfId, setSelectedShelfId] = useState<string>("");

  useEffect(() => {
    void fetchShelves().then(setShelves);
  }, []);

  // Initialize and attach camera stream
  const startCamera = useCallback(async (facing: "environment" | "user" = cameraFacing) => {
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setErrorMessage(null);

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await videoRef.current.play();
      }

      // Check for flashlight / torch support on track
      const track = newStream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() as any;
      if (capabilities && "torch" in capabilities) {
        setHasTorch(true);
      } else {
        setHasTorch(false);
      }
    } catch (err) {
      console.warn("Camera init error:", err);
      setCameraActive(false);
      setErrorMessage("Camera access unavailable. You can enter ISBNs manually below.");
    }
  }, [cameraFacing, stream]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setCameraActive(false);
    setTorchOn(false);
  }, [stream]);

  // Flip Camera
  const handleFlipCamera = () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(nextFacing);
    void startCamera(nextFacing);
  };

  // Toggle Torch/Flashlight
  const handleToggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (err) {
      console.warn("Flashlight toggle error:", err);
    }
  };

  // Process and Intake ISBN
  const handleProcessIsbn = async (rawIsbn: string) => {
    const clean = rawIsbn.replace(/[^0-9X]/gi, "").toUpperCase();
    if (clean.length < 9) {
      setErrorMessage("Please scan or enter a valid 10 or 13-digit ISBN.");
      return;
    }

    // Check if duplicate in current session
    if (sessionVolumes.some((v) => v.isbn.replace(/[^0-9X]/gi, "").toUpperCase() === clean)) {
      setStatusFeedback(`"${clean}" already in current scan session.`);
      setTimeout(() => setStatusFeedback(null), 2500);
    }

    setIsProcessingScan(true);
    setErrorMessage(null);
    setStatusFeedback("Scanning ISBN and fetching Library of Congress & metadata...");

    try {
      const volume = await scanLibraryIsbn(clean, selectedShelfId || undefined, {
        condition: defaultCondition,
        librarySpaceId: activeSpaceId !== "ALL" ? activeSpaceId : undefined,
      });

      playScanChime();
      triggerHapticSuccess();
      setScannedVolume(volume);
      setSessionVolumes((prev) => [volume, ...prev]);
      setStatusFeedback(`Cataloged: "${volume.title}"`);
      setTimeout(() => setStatusFeedback(null), 3000);
      setManualIsbn("");
      setIsManualModalOpen(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to scan volume.");
      setStatusFeedback(null);
    } finally {
      setIsProcessingScan(false);
    }
  };

  // Live Barcode Detector Loop (native BarcodeDetector API)
  useEffect(() => {
    if (!cameraActive || isProcessingScan) return;

    let detector: any = null;
    if ("BarcodeDetector" in window) {
      try {
        detector = new (window as any).BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"],
        });
      } catch {}
    }

    let intervalId: number;
    let isScanningFrame = false;

    const scanFrame = async () => {
      if (!videoRef.current || isScanningFrame || isProcessingScan) return;
      if (videoRef.current.readyState < 2) return;

      isScanningFrame = true;
      try {
        if (detector) {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const detectedValue = barcodes[0].rawValue;
            if (detectedValue && detectedValue.length >= 9) {
              await handleProcessIsbn(detectedValue);
            }
          }
        }
      } catch (err) {
        // BarcodeDetector scan error
      } finally {
        isScanningFrame = false;
      }
    };

    intervalId = window.setInterval(scanFrame, 300);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [cameraActive, isProcessingScan, activeSpaceId, defaultCondition, selectedShelfId]);

  // Start Camera on initial mount
  useEffect(() => {
    void startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Update volume attributes from recent drawer
  const handleUpdateVolumeCondition = async (vol: LibraryVolume, newCond: string) => {
    try {
      const updated = await updateLibraryVolume(vol.id, { condition: newCond });
      setSessionVolumes((prev) => prev.map((v) => (v.id === vol.id ? updated : v)));
      if (scannedVolume?.id === vol.id) setScannedVolume(updated);
    } catch (err) {
      console.warn("Failed to update condition:", err);
    }
  };

  const handleToggleVolumeTag = async (vol: LibraryVolume, tag: "signed" | "firstEd" | "offers") => {
    let nextSigned = vol.isSigned;
    let nextFirstEd = vol.isFirstEdition;
    let nextOffers = vol.listingStatus === "ALLOW_OFFERS";

    if (tag === "signed") nextSigned = !nextSigned;
    if (tag === "firstEd") nextFirstEd = !nextFirstEd;
    if (tag === "offers") nextOffers = !nextOffers;

    try {
      const updated = await updateLibraryVolume(vol.id, {
        isSigned: nextSigned,
        isFirstEdition: nextFirstEd,
        listingStatus: nextOffers ? "ALLOW_OFFERS" : "COLLECTION_ONLY",
      });
      setSessionVolumes((prev) => prev.map((v) => (v.id === vol.id ? updated : v)));
      if (scannedVolume?.id === vol.id) setScannedVolume(updated);
    } catch (err) {
      console.warn("Failed to update tag:", err);
    }
  };

  const handleRemoveVolume = async (volId: string) => {
    try {
      await deleteLibraryVolume(volId);
      setSessionVolumes((prev) => prev.filter((v) => v.id !== volId));
      if (scannedVolume?.id === volId) setScannedVolume(null);
      setStatusFeedback("Book removed from collection.");
      setTimeout(() => setStatusFeedback(null), 2500);
    } catch (err) {
      setErrorMessage("Failed to remove book.");
    }
  };

  const sessionTotalValue = sessionVolumes.reduce(
    (sum, v) => sum + (v.rareMarketValue || v.replacementValue || 0),
    0
  );

  return (
    <div className="fixed inset-0 z-[9980] bg-black text-white flex flex-col justify-between select-none overflow-hidden font-sans">
      {/* Hidden Canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 1. Top Immersive Header Bar */}
      <header className="p-3.5 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 flex items-center justify-between z-30 shrink-0 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            to="/library/catalog"
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 flex items-center justify-center text-slate-200 text-sm font-bold transition shrink-0"
            title="Back to Catalog"
          >
            ←
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <h1 className="text-xs font-black tracking-tight text-white truncate">
                {activeSpace?.name || "Library"} Scanner
              </h1>
            </div>
            {/* Live Rolling Counter Bar */}
            <p className="text-[10px] text-slate-300 truncate">
              <span className="font-bold text-indigo-400">{sessionVolumes.length} Books</span> • {formatCurrency(sessionTotalValue)}
            </p>
          </div>
        </div>

        {/* Space Selector & Batch Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <LibrarySpaceSwitcher />

          {/* Continuous Batch Mode Toggle Pill */}
          <button
            type="button"
            onClick={() => setBatchMode(!batchMode)}
            className={`px-2.5 py-1.5 rounded-full text-[10px] font-black tracking-tight transition flex items-center gap-1 cursor-pointer active:scale-95 ${
              batchMode
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20"
                : "bg-slate-800 text-slate-400 border border-slate-700"
            }`}
          >
            <span>⚡</span>
            <span>{batchMode ? "Batch ON" : "Single"}</span>
          </button>
        </div>
      </header>

      {/* 2. Main Full-Screen Viewfinder Area */}
      <main className="relative flex-1 flex flex-col items-center justify-center overflow-hidden bg-black">
        {/* Video Camera Stream */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Viewfinder Dark Overlay Vignette */}
        <div className="absolute inset-0 pointer-events-none bg-radial-[circle_at_center,transparent_40%,rgba(0,0,0,0.65)_90%]" />

        {/* Glowing Rounded Haptic Scan-Box */}
        <div className="relative w-[76%] max-w-[340px] aspect-[1.4/1] pointer-events-none z-10">
          <div className="absolute inset-0 rounded-3xl border-2 border-indigo-400/90 shadow-[0_0_30px_rgba(99,102,241,0.5)] flex flex-col items-center justify-between p-3.5 bg-indigo-500/5 backdrop-blur-[1px]">
            {/* Corner Indicators */}
            <div className="w-full flex justify-between">
              <div className="w-4 h-4 border-t-3 border-l-3 border-white rounded-tl-lg" />
              <div className="w-4 h-4 border-t-3 border-r-3 border-white rounded-tr-lg" />
            </div>

            {/* Center Laser Line Animation */}
            <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-pulse" />

            <div className="w-full flex justify-between items-end">
              <div className="w-4 h-4 border-b-3 border-l-3 border-white rounded-bl-lg" />
              <div className="w-4 h-4 border-b-3 border-r-3 border-white rounded-br-lg" />
            </div>
          </div>

          {/* Prompt pill under scan box */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className="text-[10px] font-bold tracking-wide text-slate-200 bg-slate-950/80 border border-slate-700/80 px-3 py-1 rounded-full backdrop-blur-md shadow-md">
              {isProcessingScan ? "Reading ISBN & Dewey Index..." : "Align Book Barcode Inside Box"}
            </span>
          </div>
        </div>

        {/* Processing Spinner Overlay */}
        {isProcessingScan && (
          <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center gap-3 animate-fadeIn">
            <div className="w-10 h-10 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-100">Intaking Book into Library...</p>
          </div>
        )}

        {/* Feedback / Error Toast */}
        {statusFeedback && (
          <div className="absolute top-4 left-4 right-4 z-20 p-3 bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs font-bold rounded-2xl backdrop-blur-md shadow-xl text-center animate-slideDown">
            ✅ {statusFeedback}
          </div>
        )}

        {errorMessage && (
          <div className="absolute top-4 left-4 right-4 z-20 p-3 bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs font-bold rounded-2xl backdrop-blur-md shadow-xl flex items-center justify-between animate-slideDown">
            <span>⚠️ {errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage(null)} className="text-white px-2">✕</button>
          </div>
        )}

        {/* Floating Quick Camera Controls (Torch, Flip, Manual) */}
        <div className="absolute right-4 bottom-4 z-20 flex flex-col gap-3">
          {hasTorch && (
            <button
              type="button"
              onClick={handleToggleTorch}
              className={`w-11 h-11 rounded-full backdrop-blur-xl flex items-center justify-center text-lg shadow-lg border transition cursor-pointer active:scale-95 ${
                torchOn ? "bg-amber-400 text-slate-950 border-amber-300 shadow-amber-400/30" : "bg-slate-900/80 text-white border-slate-700"
              }`}
              title="Toggle Flashlight"
            >
              {torchOn ? "🔦" : "💡"}
            </button>
          )}

          <button
            type="button"
            onClick={handleFlipCamera}
            className="w-11 h-11 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-700 backdrop-blur-xl flex items-center justify-center text-lg text-white shadow-lg transition cursor-pointer active:scale-95"
            title="Flip Camera"
          >
            🔄
          </button>

          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/50 backdrop-blur-xl flex items-center justify-center text-lg text-white shadow-lg transition cursor-pointer active:scale-95"
            title="Enter ISBN Manually"
          >
            ⌨️
          </button>
        </div>
      </main>

      {/* 3. Bottom Slide-Out Recent Scans Tray */}
      <footer className="bg-slate-950/95 backdrop-blur-2xl border-t border-slate-800/90 p-3.5 z-30 shrink-0 space-y-3">
        {sessionVolumes.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold px-1">
              <span>Recently Cataloged ({sessionVolumes.length})</span>
              <Link to="/library/catalog" className="text-indigo-400 hover:text-indigo-300 font-bold">
                View in Catalog →
              </Link>
            </div>

            {/* Horizontal Scrollable Intake Cards */}
            <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
              {sessionVolumes.map((vol) => (
                <div
                  key={vol.id}
                  className="w-64 shrink-0 bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 space-y-2 shadow-lg"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-10 h-14 bg-slate-800 rounded-lg overflow-hidden shrink-0 border border-slate-700 flex items-center justify-center">
                      {vol.coverUrl ? (
                        <img src={vol.coverUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span>📖</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-black text-white truncate">{vol.title}</h4>
                      <p className="text-[10px] text-slate-400 truncate">{vol.author || "Unknown"}</p>
                      <p className="text-[10px] font-mono font-bold text-indigo-400 mt-0.5">
                        {vol.deweyDecimal ? `DDC: ${vol.deweyDecimal}` : vol.locClassification || "--"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveVolume(vol.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 text-xs cursor-pointer"
                      title="Undo scan"
                    >
                      ✕
                    </button>
                  </div>

                  {/* 1-Tap Condition Grading Buttons */}
                  <div className="flex items-center gap-1 text-[9px] pt-1 border-t border-slate-800">
                    {(["FINE", "VERY_GOOD", "GOOD", "FAIR"] as const).map((cond) => {
                      const isSelected = (vol.condition || "VERY_GOOD") === cond;
                      return (
                        <button
                          key={cond}
                          type="button"
                          onClick={() => handleUpdateVolumeCondition(vol, cond)}
                          className={`flex-1 py-1 rounded-md font-bold transition cursor-pointer ${
                            isSelected
                              ? "bg-indigo-600 text-white shadow-xs"
                              : "bg-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {cond === "FINE" ? "💎 Fine" : cond === "VERY_GOOD" ? "✨ VG" : cond === "GOOD" ? "📖 Good" : "Fair"}
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick Collectible Tag Toggles */}
                  <div className="flex items-center gap-1 text-[9px]">
                    <button
                      type="button"
                      onClick={() => handleToggleVolumeTag(vol, "signed")}
                      className={`flex-1 py-0.5 rounded-md font-bold transition cursor-pointer ${
                        vol.isSigned ? "bg-amber-500/30 text-amber-300 border border-amber-500/50" : "bg-slate-800 text-slate-500"
                      }`}
                    >
                      ✍️ Signed
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleVolumeTag(vol, "firstEd")}
                      className={`flex-1 py-0.5 rounded-md font-bold transition cursor-pointer ${
                        vol.isFirstEdition ? "bg-purple-500/30 text-purple-300 border border-purple-500/50" : "bg-slate-800 text-slate-500"
                      }`}
                    >
                      ⭐ 1st Ed
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleVolumeTag(vol, "offers")}
                      className={`flex-1 py-0.5 rounded-md font-bold transition cursor-pointer ${
                        vol.listingStatus === "ALLOW_OFFERS" ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/50" : "bg-slate-800 text-slate-500"
                      }`}
                    >
                      🤝 Offers
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-2 text-center text-xs text-slate-400">
            <p>Ready to scan. Point camera at book ISBN barcodes.</p>
          </div>
        )}
      </footer>

      {/* Manual ISBN Input Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>⌨️</span>
                <span>Enter ISBN Barcode</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualIsbn.trim()) void handleProcessIsbn(manualIsbn);
              }}
              className="space-y-3"
            >
              <input
                type="text"
                autoFocus
                value={manualIsbn}
                onChange={(e) => setManualIsbn(e.target.value)}
                placeholder="e.g. 9780141439518 or 0316769487"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl p-3 text-xs font-mono font-bold placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!manualIsbn.trim() || isProcessingScan}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer disabled:opacity-50"
              >
                {isProcessingScan ? "Fetching Metadata..." : "Intake Book"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

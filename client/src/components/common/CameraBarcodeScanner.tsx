import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { createWorker } from "tesseract.js";

// Synthesizes a fast confirmation chime via Web Audio API
export function playScanChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // A6 note

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {}
}

export function triggerHapticFeedback(): void {
  try {
    if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
      navigator.vibrate(80);
    }
  } catch {}
}

/**
 * Extracts standard 10-digit or 13-digit ISBN from any OCR text string
 */
export function extractIsbnFromText(rawText: string): string | null {
  if (!rawText) return null;

  // Clean common OCR noise
  const text = rawText.replace(/[\r\n]+/g, " ");

  // 1. Look for explicit ISBN labeled patterns, e.g. "ISBN 978-0-14-143951-8" or "ISBN: 0141439513"
  const explicitMatches = text.matchAll(/ISBN(?:-1[03])?[\s:]*([0-9Xx\s-]{10,22})/gi);
  for (const m of explicitMatches) {
    const cleaned = m[1].replace(/[^0-9Xx]/gi, "").toUpperCase();
    if (cleaned.length === 13 && (cleaned.startsWith("978") || cleaned.startsWith("979"))) {
      return cleaned;
    }
    if (cleaned.length === 10) {
      return cleaned;
    }
  }

  // 2. Look for standalone 13-digit numbers starting with 978 or 979
  const isbn13Matches = text.matchAll(/\b(97[89][0-9Xx\s-]{10,18})\b/gi);
  for (const m of isbn13Matches) {
    const cleaned = m[1].replace(/[^0-9Xx]/gi, "").toUpperCase();
    if (cleaned.length === 13) {
      return cleaned;
    }
  }

  // 3. Fallback: search any continuous 10-digit or 13-digit chunk
  const genericMatches = text.matchAll(/([0-9Xx]{10,13})/gi);
  for (const m of genericMatches) {
    const cleaned = m[1].toUpperCase();
    if (cleaned.length === 13 && (cleaned.startsWith("978") || cleaned.startsWith("979"))) {
      return cleaned;
    }
    if (cleaned.length === 10) {
      return cleaned;
    }
  }

  return null;
}

export interface CameraBarcodeScannerProps {
  onScan: (barcode: string) => void | Promise<void>;
  onClose?: () => void;
  cooldownMs?: number;
  continuous?: boolean;
  className?: string;
}

export default function CameraBarcodeScanner({
  onScan,
  onClose,
  cooldownMs = 1800,
  continuous = true,
  className = "",
}: CameraBarcodeScannerProps) {
  const containerId = useRef(`colophon-qr-reader-${Math.random().toString(36).substring(2, 9)}`).current;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedTime = useRef<number>(0);
  const lastScannedCode = useRef<string>("");
  const isProcessingRef = useRef<boolean>(false);

  // Mode: "barcode" (default) or "ocr" (text scanning)
  const [scanMode, setScanMode] = useState<"barcode" | "ocr">("barcode");
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [torchAvailable, setTorchAvailable] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // OCR state
  const [isOcrProcessing, setIsOcrProcessing] = useState<boolean>(false);
  const [ocrStatusText, setOcrStatusText] = useState<string>("");
  const [manualIsbnInput, setManualIsbnInput] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    async function initScanner() {
      setIsInitializing(true);
      setErrorMessage(null);

      try {
        // 1. Discover cameras
        const devices = await Html5Qrcode.getCameras().catch(() => []);
        if (isMounted && devices && devices.length > 0) {
          const list = devices.map((d) => ({
            id: d.id,
            label: d.label || `Camera ${d.id.substring(0, 5)}`,
          }));
          setCameras(list);
          const backCam = list.find((c) => /back|rear|environment/i.test(c.label)) || list[0];
          setSelectedCameraId(backCam.id);
        }

        // 2. Initialize Html5Qrcode with all barcode formats
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
        ];

        const html5QrCode = new Html5Qrcode(containerId, {
          formatsToSupport,
          verbose: false,
        });
        scannerRef.current = html5QrCode;

        // 3. Start scanning with environment camera (or chosen camera)
        const cameraConfig = selectedCameraId ? { deviceId: { exact: selectedCameraId } } : { facingMode: "environment" };

        const scanConfig = {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxWidth = Math.max(240, Math.floor(minEdge * 0.85));
            const qrboxHeight = Math.max(140, Math.floor(qrboxWidth * 0.65));
            return { width: qrboxWidth, height: qrboxHeight };
          },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          cameraConfig,
          scanConfig,
          async (decodedText) => {
            if (scanMode !== "barcode") return; // In OCR mode, don't trigger barcode listener
            const clean = decodedText.replace(/[^0-9X]/gi, "").toUpperCase();
            if (!clean || clean.length < 8) return;

            const now = Date.now();
            if (isProcessingRef.current) return;
            if (clean === lastScannedCode.current && now - lastScannedTime.current < cooldownMs) {
              return;
            }

            lastScannedCode.current = clean;
            lastScannedTime.current = now;
            isProcessingRef.current = true;

            playScanChime();
            triggerHapticFeedback();

            try {
              await onScan(clean);
            } finally {
              isProcessingRef.current = false;
              if (!continuous && isMounted) {
                if (html5QrCode.isScanning) {
                  await html5QrCode.stop().catch(() => {});
                }
              }
            }
          },
          () => {
            // Ignore normal frame parse errors
          }
        );

        if (isMounted) {
          setHasPermission(true);
          setIsInitializing(false);

          // Check torch capability
          try {
            const capabilities = html5QrCode.getRunningTrackCapabilities() as { torch?: boolean };
            if (capabilities && "torch" in capabilities && capabilities.torch) {
              setTorchAvailable(true);
            }
          } catch {}
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.error("Camera init error:", err);
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Permission") || msg.includes("NotAllowedError") || msg.includes("denied")) {
            setErrorMessage("Camera access was denied. Please grant camera permission in your browser settings.");
          } else if (msg.includes("NotFoundError") || msg.includes("DevicesNotFoundError")) {
            setErrorMessage("No camera was found on this device. You can enter ISBNs manually.");
          } else {
            setErrorMessage("Could not start camera feed. Please check device permissions or enter ISBN manually.");
          }
          setHasPermission(false);
          setIsInitializing(false);
        }
      }
    }

    void initScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(() => {});
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    };
  }, [containerId, selectedCameraId, cooldownMs, continuous, onScan, scanMode]);

  // Capture video frame and run OCR to extract printed ISBN text
  const handleSnapAndOcr = async () => {
    if (isOcrProcessing) return;
    setIsOcrProcessing(true);
    setOcrStatusText("Capturing frame for text recognition…");

    try {
      // Find the video element inside container
      const container = document.getElementById(containerId);
      const video = container?.querySelector("video") as HTMLVideoElement | null;
      if (!video || video.readyState < 2) {
        setOcrStatusText("Camera preview not ready. Please try again.");
        setIsOcrProcessing(false);
        return;
      }

      // Draw video frame to canvas
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setIsOcrProcessing(false);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      setOcrStatusText("Running OCR text recognition…");
      const worker = await createWorker("eng");
      const ret = await worker.recognize(canvas);
      await worker.terminate();

      const extractedText = ret?.data?.text || "";
      const matchedIsbn = extractIsbnFromText(extractedText);

      if (matchedIsbn) {
        setOcrStatusText(`Found ISBN: ${matchedIsbn}!`);
        playScanChime();
        triggerHapticFeedback();
        await onScan(matchedIsbn);
      } else {
        setOcrStatusText("No clear ISBN text found. Position the printed 'ISBN 978-...' in view and tap again.");
      }
    } catch (err) {
      console.warn("OCR Error:", err);
      setOcrStatusText("OCR recognition error. You can type the ISBN below.");
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !torchAvailable) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any],
      });
      setTorchOn(nextTorch);
    } catch {
      setTorchAvailable(false);
    }
  };

  const handleCameraChange = async (newDeviceId: string) => {
    if (newDeviceId === selectedCameraId) return;
    setSelectedCameraId(newDeviceId);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualIsbnInput.replace(/[^0-9X]/gi, "").toUpperCase();
    if (clean.length >= 8) {
      playScanChime();
      triggerHapticFeedback();
      void onScan(clean);
      setManualIsbnInput("");
    }
  };

  return (
    <div className={`relative flex flex-col items-center overflow-hidden rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl text-white ${className}`}>
      {/* Top Header Bar with Mode Toggle */}
      <div className="w-full px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-10 flex-wrap gap-2">
        {/* Mode Selector Tabs (Barcode vs ISBN Text OCR) */}
        <div className="flex items-center p-1 bg-slate-800 rounded-xl text-xs font-medium border border-slate-700">
          <button
            type="button"
            onClick={() => setScanMode("barcode")}
            className={`px-3 py-1 rounded-lg transition cursor-pointer font-medium flex items-center gap-1.5 ${
              scanMode === "barcode"
                ? "bg-emerald-600 text-white shadow-xs font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>📊</span>
            <span>Barcode</span>
          </button>
          <button
            type="button"
            onClick={() => setScanMode("ocr")}
            className={`px-3 py-1 rounded-lg transition cursor-pointer font-medium flex items-center gap-1.5 ${
              scanMode === "ocr"
                ? "bg-indigo-600 text-white shadow-xs font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>🔤</span>
            <span>Scan ISBN Text (OCR)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Torch / Flash Toggle */}
          {torchAvailable && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`px-2.5 py-1 rounded-xl text-xs font-medium transition cursor-pointer border ${
                torchOn
                  ? "bg-amber-400 text-slate-950 border-amber-300 font-semibold shadow-xs"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
            >
              {torchOn ? "🔦 Flash ON" : "🔦 Flash"}
            </button>
          )}

          {/* Close Scanner Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-semibold cursor-pointer transition"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Video Viewfinder Area */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] max-h-[380px] bg-black flex items-center justify-center overflow-hidden">
        {/* Html5Qrcode rendering target */}
        <div id={containerId} className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />

        {/* Laser Targeting / Viewfinder Overlay */}
        {!errorMessage && !isInitializing && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {/* Viewfinder Target Box */}
            <div className={`relative w-64 h-36 sm:w-72 sm:h-40 border-2 rounded-2xl flex items-center justify-center transition duration-300 ${
              scanMode === "ocr"
                ? "border-indigo-400/90 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                : "border-emerald-400/80 shadow-[0_0_20px_rgba(52,211,153,0.3)]"
            }`}>
              {/* Corner accents */}
              <div className={`absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 rounded-tl-lg ${scanMode === "ocr" ? "border-indigo-400" : "border-emerald-400"}`} />
              <div className={`absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 rounded-tr-lg ${scanMode === "ocr" ? "border-indigo-400" : "border-emerald-400"}`} />
              <div className={`absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 rounded-bl-lg ${scanMode === "ocr" ? "border-indigo-400" : "border-emerald-400"}`} />
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 rounded-br-lg ${scanMode === "ocr" ? "border-indigo-400" : "border-emerald-400"}`} />

              {/* Animated Laser Scanning Line */}
              <div className={`w-full h-0.5 bg-gradient-to-r from-transparent ${scanMode === "ocr" ? "via-indigo-400" : "via-rose-500"} to-transparent shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse`} />
            </div>

            <p className="mt-3 text-[11px] font-medium text-slate-300 bg-slate-950/70 px-3 py-1 rounded-full backdrop-blur-xs">
              {scanMode === "ocr" ? "Align printed 'ISBN 978...' text in box & tap Snap" : "Align book barcode in frame"}
            </p>
          </div>
        )}

        {/* OCR Action Trigger Button (When in OCR mode) */}
        {scanMode === "ocr" && !isInitializing && !errorMessage && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={handleSnapAndOcr}
              disabled={isOcrProcessing}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold text-xs rounded-full shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isOcrProcessing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Reading Text…</span>
                </>
              ) : (
                <>
                  <span>📸</span>
                  <span>Snap & Recognize ISBN</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Loading Spinner */}
        {isInitializing && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 p-4 text-center">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-300 font-medium">Opening camera stream…</p>
          </div>
        )}

        {/* Error Fallback Notice */}
        {errorMessage && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="text-2xl">📷</span>
            <p className="text-xs font-semibold text-rose-400 max-w-sm leading-relaxed">
              {errorMessage}
            </p>
          </div>
        )}
      </div>

      {/* OCR Status Banner */}
      {ocrStatusText && (
        <div className="w-full px-4 py-2 bg-indigo-950/80 border-t border-indigo-800/60 text-[11px] font-medium text-indigo-200 text-center animate-fadeIn">
          {ocrStatusText}
        </div>
      )}

      {/* Bottom Manual ISBN Input + Camera Switcher */}
      <div className="w-full p-3 bg-slate-900/90 border-t border-slate-800 space-y-2 text-xs">
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder="Type or paste ISBN (e.g. 9780141439518)..."
            value={manualIsbnInput}
            onChange={(e) => setManualIsbnInput(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!manualIsbnInput.trim()}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 active:scale-95 disabled:opacity-40 text-white font-medium rounded-xl text-xs transition cursor-pointer"
          >
            Scan & Submit
          </button>
        </form>

        {cameras.length > 1 && (
          <div className="flex items-center justify-between text-slate-400 pt-1">
            <span className="text-[11px] font-medium">Camera:</span>
            <select
              value={selectedCameraId}
              onChange={(e) => handleCameraChange(e.target.value)}
              className="bg-slate-800 text-slate-200 text-[11px] rounded-xl px-2 py-0.5 border border-slate-700 cursor-pointer font-medium"
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

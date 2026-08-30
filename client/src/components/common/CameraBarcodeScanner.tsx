import { useEffect, useRef, useState, useCallback } from "react";
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
} from "@zxing/library";
import { createWorker } from "tesseract.js";

// Synthesizes a fast confirmation chime via Web Audio API
export function playScanChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // A6 note

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  } catch {}
}

export function triggerHapticFeedback(): void {
  try {
    if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
      navigator.vibrate([30, 40, 50]);
    }
  } catch {}
}

/**
 * Extracts standard 10-digit or 13-digit ISBN from any OCR text string
 */
export function extractIsbnFromText(rawText: string): string | null {
  if (!rawText) return null;
  const text = rawText.replace(/[\r\n]+/g, " ");

  // 1. Look for explicit ISBN labeled patterns, e.g. "ISBN 978-0-14-143951-8" or "ISBN: 0141439513"
  const explicitMatches = text.matchAll(
    /ISBN(?:-1[03])?[\s:]*([0-9Xx\s-]{10,22})/gi
  );
  for (const m of explicitMatches) {
    const cleaned = m[1].replace(/[^0-9Xx]/gi, "").toUpperCase();
    if (
      cleaned.length === 13 &&
      (cleaned.startsWith("978") || cleaned.startsWith("979"))
    ) {
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
    if (
      cleaned.length === 13 &&
      (cleaned.startsWith("978") || cleaned.startsWith("979"))
    ) {
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
  cooldownMs = 1500,
  continuous = true,
  className = "",
}: CameraBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scanningLoopIdRef = useRef<number | null>(null);

  const lastScannedTime = useRef<number>(0);
  const lastScannedCode = useRef<string>("");
  const isProcessingRef = useRef<boolean>(false);

  // Modes: "barcode" (default) or "ocr" (printed text recognition)
  const [scanMode, setScanMode] = useState<"barcode" | "ocr">("barcode");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Camera Capabilities: Focus, Zoom, Flash
  const [torchAvailable, setTorchAvailable] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(1);
  const [tapFocusPoint, setTapFocusPoint] = useState<{ x: number; y: number } | null>(null);

  // OCR state
  const [isOcrProcessing, setIsOcrProcessing] = useState<boolean>(false);
  const [ocrStatusText, setOcrStatusText] = useState<string>("");
  const [manualIsbnInput, setManualIsbnInput] = useState<string>("");

  // Discover connected camera devices
  useEffect(() => {
    async function loadCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        setCameras(videoInputs);
        if (videoInputs.length > 0) {
          // Default to environment / back-facing camera
          const backCamera =
            videoInputs.find((d) => /back|rear|environment|macro/i.test(d.label)) ||
            videoInputs[0];
          setSelectedDeviceId(backCamera.deviceId);
        }
      } catch (err) {
        console.warn("Could not list video devices:", err);
      }
    }
    void loadCameras();
  }, []);

  // Handle successful barcode recognition and auto-submission
  const handleBarcodeDecoded = useCallback(
    async (decodedText: string) => {
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

      // Audio + Haptic Feedback
      playScanChime();
      triggerHapticFeedback();

      try {
        await onScan(clean);
      } finally {
        isProcessingRef.current = false;
        if (!continuous && streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
      }
    },
    [cooldownMs, continuous, onScan]
  );

  // Initialize Camera Stream with Continuous Autofocus & High Definition
  useEffect(() => {
    let isCancelled = false;

    async function startCameraStream() {
      setIsInitializing(true);
      setErrorMessage(null);

      // Stop any prior stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (readerRef.current) {
        readerRef.current.reset();
      }

      try {
        // Build video constraints with full autofocus and macro focus
        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            facingMode: selectedDeviceId ? undefined : { ideal: "environment" },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            frameRate: { ideal: 30, min: 15 },
            // Advanced WebRTC focus & exposure controls
            advanced: [
              { focusMode: "continuous" } as any,
              { focusDistance: { min: 0.05, ideal: 0.1 } } as any,
              { exposureMode: "continuous" } as any,
              { whiteBalanceMode: "continuous" } as any,
            ],
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];

        // Attach to video element
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Query Capabilities (Autofocus, Zoom, Flash)
        if (videoTrack && typeof videoTrack.getCapabilities === "function") {
          const caps = videoTrack.getCapabilities() as {
            torch?: boolean;
            zoom?: { min: number; max: number; step: number };
            focusMode?: string[];
          };

          if (caps.torch) {
            setTorchAvailable(true);
          }
          if (caps.zoom) {
            setZoomRange({
              min: caps.zoom.min || 1,
              max: Math.min(caps.zoom.max || 5, 5),
              step: caps.zoom.step || 0.1,
            });
            setCurrentZoom(caps.zoom.min || 1);
          }
        }

        setIsInitializing(false);

        // 2. Setup ZXing Reader with Try Harder & Multiple 1D/2D Formats
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.ITF,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const codeReader = new BrowserMultiFormatReader(hints, 100);
        readerRef.current = codeReader;

        // 3. Start ZXing continuous decoding loop
        if (videoRef.current) {
          codeReader.decodeContinuously(videoRef.current, (result) => {
            if (result && !isCancelled) {
              const text = result.getText();
              if (text) {
                void handleBarcodeDecoded(text);
              }
            }
          });
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          console.error("Camera stream error:", err);
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
            setErrorMessage("Camera access was denied. Please allow camera permissions in your browser.");
          } else if (msg.includes("NotFoundError") || msg.includes("DevicesNotFoundError")) {
            setErrorMessage("No camera was found on this device.");
          } else {
            setErrorMessage("Could not activate camera. You can type or paste the ISBN below.");
          }
          setIsInitializing(false);
        }
      }
    }

    void startCameraStream();

    return () => {
      isCancelled = true;
      if (scanningLoopIdRef.current) {
        window.cancelAnimationFrame(scanningLoopIdRef.current);
      }
      if (readerRef.current) {
        readerRef.current.reset();
        readerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [selectedDeviceId, handleBarcodeDecoded]);

  // Tap-to-Focus on Viewfinder Coordinate
  const handleViewfinderTap = async (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    setTapFocusPoint({ x: clientX - rect.left, y: clientY - rect.top });
    setTimeout(() => setTapFocusPoint(null), 1200);

    const track = streamRef.current?.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === "function") {
      try {
        await track.applyConstraints({
          advanced: [
            {
              focusMode: "continuous",
              pointsOfInterest: [{ x, y }],
            } as any,
          ],
        });
      } catch {
        // Tap to focus fallback
      }
    }
  };

  // Set Hardware Camera Zoom
  const applyZoom = async (newZoom: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === "function") {
      try {
        await track.applyConstraints({
          advanced: [{ zoom: newZoom } as any],
        });
        setCurrentZoom(newZoom);
      } catch (err) {
        console.warn("Zoom not supported:", err);
      }
    }
  };

  // Toggle Torch / Flashlight
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === "function") {
      try {
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any],
        });
        setTorchOn(nextState);
      } catch {
        setTorchAvailable(false);
      }
    }
  };

  // Capture video frame and run OCR to extract printed ISBN text
  const handleSnapAndOcr = async () => {
    if (isOcrProcessing) return;
    setIsOcrProcessing(true);
    setOcrStatusText("Capturing frame for text recognition…");

    try {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        setOcrStatusText("Camera preview not ready. Please try again.");
        setIsOcrProcessing(false);
        return;
      }

      // Draw high-resolution frame to offscreen canvas
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setIsOcrProcessing(false);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      setOcrStatusText("Reading printed text via OCR…");
      const worker = await createWorker("eng");
      const ret = await worker.recognize(canvas);
      await worker.terminate();

      const extractedText = ret?.data?.text || "";
      const matchedIsbn = extractIsbnFromText(extractedText);

      if (matchedIsbn) {
        setOcrStatusText(`Found ISBN: ${matchedIsbn}! Auto-submitting…`);
        playScanChime();
        triggerHapticFeedback();
        await onScan(matchedIsbn);
      } else {
        setOcrStatusText("No clear ISBN text found. Position the printed 'ISBN 978-...' in view and tap again.");
      }
    } catch (err) {
      console.warn("OCR Error:", err);
      setOcrStatusText("OCR recognition error. You can type the ISBN manually below.");
    } finally {
      setIsOcrProcessing(false);
    }
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
    <div className={`relative flex flex-col items-center overflow-hidden rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl text-white select-none ${className}`}>
      {/* 1. Header Toolbar */}
      <div className="w-full px-4 py-3 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between z-20 flex-wrap gap-2">
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

        {/* Quick Tools: Torch, Close */}
        <div className="flex items-center gap-2">
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

      {/* 2. Interactive Video Viewfinder with Tap-To-Focus */}
      <div
        onClick={handleViewfinderTap}
        className="relative w-full aspect-[4/3] sm:aspect-[16/10] max-h-[380px] bg-black flex items-center justify-center overflow-hidden cursor-crosshair"
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover"
        />

        {/* Tap-to-Focus Animated Ring */}
        {tapFocusPoint && (
          <div
            style={{ left: `${tapFocusPoint.x - 24}px`, top: `${tapFocusPoint.y - 24}px` }}
            className="absolute pointer-events-none w-12 h-12 border-2 border-amber-400 rounded-full animate-ping z-30"
          />
        )}

        {/* Laser Targeting Overlay */}
        {!errorMessage && !isInitializing && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {/* Viewfinder Target Box */}
            <div
              className={`relative w-64 h-36 sm:w-72 sm:h-40 border-2 rounded-2xl flex items-center justify-center transition duration-300 ${
                scanMode === "ocr"
                  ? "border-indigo-400/90 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                  : "border-emerald-400/80 shadow-[0_0_20px_rgba(52,211,153,0.3)]"
              }`}
            >
              {/* Corner brackets */}
              <div className={`absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 rounded-tl-lg ${scanMode === "ocr" ? "border-indigo-400" : "border-emerald-400"}`} />
              <div className={`absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 rounded-tr-lg ${scanMode === "ocr" ? "border-indigo-400" : "border-emerald-400"}`} />
              <div className={`absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 rounded-bl-lg ${scanMode === "ocr" ? "border-indigo-400" : "border-emerald-400"}`} />
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 rounded-br-lg ${scanMode === "ocr" ? "border-indigo-400" : "border-emerald-400"}`} />

              {/* Animated Laser Scanning Line */}
              <div
                className={`w-full h-0.5 bg-gradient-to-r from-transparent ${
                  scanMode === "ocr" ? "via-indigo-400" : "via-rose-500"
                } to-transparent shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse`}
              />
            </div>

            <p className="mt-3 text-[11px] font-medium text-slate-200 bg-slate-950/75 px-3 py-1 rounded-full backdrop-blur-xs shadow-md">
              {scanMode === "ocr"
                ? "Align printed ISBN text & tap Snap"
                : "Continuous autofocus active · Tap screen to refocus"}
            </p>
          </div>
        )}

        {/* Hardware Zoom Quick Controls (1x, 2x, 3x) */}
        {zoomRange && (
          <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5 pointer-events-auto">
            {[1, 1.5, 2, 3]
              .filter((z) => z <= (zoomRange?.max || 3))
              .map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void applyZoom(z);
                  }}
                  className={`w-8 h-8 rounded-full text-[11px] font-black transition backdrop-blur-md shadow-md border cursor-pointer ${
                    Math.abs(currentZoom - z) < 0.2
                      ? "bg-amber-400 text-slate-950 border-amber-300 font-bold"
                      : "bg-slate-900/80 text-white border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  {z}x
                </button>
              ))}
          </div>
        )}

        {/* OCR Action Trigger Button (When in OCR mode) */}
        {scanMode === "ocr" && !isInitializing && !errorMessage && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleSnapAndOcr();
              }}
              disabled={isOcrProcessing}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold text-xs rounded-full shadow-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
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
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 p-4 text-center z-30">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-300 font-medium">Starting HD Camera Feed…</p>
          </div>
        )}

        {/* Error Fallback Notice */}
        {errorMessage && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-3 p-6 text-center z-30">
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

      {/* 3. Manual ISBN Input & Camera Switcher Bar */}
      <div className="w-full p-3 bg-slate-900/95 border-t border-slate-800 space-y-2 text-xs">
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
            <span className="text-[11px] font-medium">Camera Device:</span>
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-slate-800 text-slate-200 text-[11px] rounded-xl px-2 py-0.5 border border-slate-700 cursor-pointer font-medium"
            >
              {cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label || `Camera ${c.deviceId.substring(0, 5)}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

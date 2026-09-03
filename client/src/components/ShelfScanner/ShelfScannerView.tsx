import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle, ChevronRight, DollarSign, Key, Loader2, Plus, Upload } from "lucide-react";
import { analyzeShelfImage, preprocessShelfImage } from "../../services/geminiShelfService";
import { resolveBookValuations } from "../../services/valuationService";
import type { TriageFlag, ValuedBook } from "../../types/shelfScanner";

export interface ShelfScannerViewProps {
  /** Called when the user commits a triaged book to the Colophon catalog.
   *  This view does not write to inventory itself -- the host page decides
   *  how (and where) the item actually gets recorded. */
  onAddToInventory?: (book: ValuedBook) => void;
}

const API_KEY_STORAGE_KEY = "colophon-gemini-api-key";
const TARGET_COST_STORAGE_KEY = "colophon-shelf-target-cost";
const TARGET_RETURN_STORAGE_KEY = "colophon-shelf-target-return";
const DEFAULT_TARGET_COST = 1;
const DEFAULT_TARGET_RETURN_PERCENT = 300;

type AnalysisStage = "idle" | "preprocessing" | "detecting" | "valuing" | "done";
type FilterOption = "ALL" | "TARGET" | "GREEN" | "YELLOW";

function readStoredNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const parsed = raw !== null ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Return on cost using the median market estimate: ((value - cost) / cost) * 100. */
function computeReturnPercent(book: ValuedBook, cost: number): number | null {
  if (!(cost > 0)) return null;
  return ((book.medianMarketValue - cost) / cost) * 100;
}

const STAGE_LABELS: Record<"preprocessing" | "detecting" | "valuing", string> = {
  preprocessing: "Preparing photo for analysis...",
  detecting: "Analyzing spine geometry...",
  valuing: "Querying bibliographic records...",
};

const TRIAGE_STYLES: Record<
  TriageFlag,
  { borderWidth: string; border: string; bg: string; bgHover: string; text: string; dot: string; label: string }
> = {
  GREEN: {
    borderWidth: "border-2",
    border: "border-emerald-500",
    bg: "bg-emerald-500/20",
    bgHover: "hover:bg-emerald-500/40",
    text: "text-emerald-300",
    dot: "bg-emerald-500",
    label: "High Priority",
  },
  YELLOW: {
    borderWidth: "border-2",
    border: "border-amber-500",
    bg: "bg-amber-500/20",
    bgHover: "hover:bg-amber-500/40",
    text: "text-amber-300",
    dot: "bg-amber-500",
    label: "Inspect In-Person",
  },
  GRAY: {
    borderWidth: "border",
    border: "border-slate-500",
    bg: "bg-slate-500/10",
    bgHover: "hover:bg-slate-500/30",
    text: "text-slate-400",
    dot: "bg-slate-500",
    label: "Pass",
  },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function ApiKeySetupCard({ onSave }: { onSave: (key: string) => void }): JSX.Element {
  const [value, setValue] = useState("");

  return (
    <div className="max-w-md mx-auto mt-10 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-lg">
      <div className="flex items-center gap-2 text-slate-900 dark:text-white">
        <Key size={18} />
        <h2 className="text-sm font-black">Connect Gemini API Key</h2>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Shelf Scanner uses Google's Gemini vision model to read book spines from a photo. Your key is stored only on this device and is never sent anywhere but Google's API.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
        className="space-y-2"
      >
        <input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste your Gemini API key"
          autoFocus
          className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-2 transition cursor-pointer"
        >
          Save & Continue
        </button>
      </form>
      <p className="text-[11px] text-slate-400">
        Get a free key from{" "}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-500 hover:text-indigo-600 underline"
        >
          Google AI Studio
        </a>
        , then paste it above.
      </p>
    </div>
  );
}

function UploadZone({ onFileSelected, busy }: { onFileSelected: (file: File) => void; busy: boolean }): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null): void => {
    const file = files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (!busy) handleFiles(event.dataTransfer.files);
      }}
      onClick={() => !busy && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      className={`relative rounded-3xl border-2 border-dashed p-8 text-center transition ${
        busy ? "opacity-60 pointer-events-none" : "cursor-pointer"
      } ${
        isDragging
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
          : "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:border-indigo-400"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <Upload className="mx-auto mb-2 text-slate-400" size={28} />
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Drop a shelf photo here, or click to upload</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">JPG, PNG, or WEBP -- one photo can capture an entire shelf.</p>
    </div>
  );
}

function TargetSettingsBar({
  targetCost,
  onTargetCostChange,
  targetReturnPercent,
  onTargetReturnPercentChange,
}: {
  targetCost: number;
  onTargetCostChange: (value: number) => void;
  targetReturnPercent: number;
  onTargetReturnPercentChange: (value: number) => void;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 shrink-0">
        <DollarSign size={16} />
        <p className="text-xs font-black uppercase tracking-wide">Your Resale Targets</p>
      </div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
        Cost per book ($)
        <input
          type="number"
          min={0}
          step="0.25"
          value={targetCost}
          onChange={(event) => onTargetCostChange(Math.max(0, Number(event.target.value) || 0))}
          className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
        Min. return (%)
        <input
          type="number"
          min={0}
          step="25"
          value={targetReturnPercent}
          onChange={(event) => onTargetReturnPercentChange(Math.max(0, Number(event.target.value) || 0))}
          className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
        />
      </label>
      <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
        💰 flags any book worth at least {formatCurrency(targetCost * (1 + targetReturnPercent / 100))} at your ${targetCost.toFixed(2)} cost.
      </p>
    </div>
  );
}

function SpineOverlayBox({
  book,
  isSelected,
  hitsTarget,
  onSelect,
}: {
  book: ValuedBook;
  isSelected: boolean;
  hitsTarget: boolean;
  onSelect: () => void;
}): JSX.Element {
  const style = TRIAGE_STYLES[book.triage];
  const top = book.box2d.ymin / 10;
  const left = book.box2d.xmin / 10;
  const height = Math.max(0, (book.box2d.ymax - book.box2d.ymin) / 10);
  const width = Math.max(0, (book.box2d.xmax - book.box2d.xmin) / 10);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{ top: `${top}%`, left: `${left}%`, height: `${height}%`, width: `${width}%` }}
      title={`${book.title} -- ${style.label}${hitsTarget ? " -- hits your return target" : ""}`}
      className={`absolute rounded-md transition cursor-pointer ${style.borderWidth} ${style.border} ${style.bg} ${style.bgHover} ${
        isSelected
          ? "ring-2 ring-white ring-offset-1 ring-offset-black z-10"
          : hitsTarget
            ? "ring-2 ring-amber-300 ring-offset-1 ring-offset-black z-10"
            : ""
      }`}
    >
      {hitsTarget && (
        <span className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black flex items-center justify-center shadow-md">
          $
        </span>
      )}
    </button>
  );
}

function InspectionDrawer({
  book,
  targetCost,
  returnPercent,
  hitsTarget,
  onAddToInventory,
  alreadyAdded,
}: {
  book: ValuedBook;
  targetCost: number;
  returnPercent: number | null;
  hitsTarget: boolean;
  onAddToInventory: () => void;
  alreadyAdded: boolean;
}): JSX.Element {
  const style = TRIAGE_STYLES[book.triage];

  return (
    <div className={`rounded-2xl border ${style.border} bg-white dark:bg-slate-900 p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">{book.title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{book.author}</p>
          {book.publisher && (
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {book.publisher}
              {book.publishedDate ? ` · ${book.publishedDate}` : ""}
            </p>
          )}
        </div>
        <span className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-black border ${style.bg} ${style.text} ${style.border}`}>
          {book.formatConfidence}
        </span>
      </div>

      {returnPercent !== null && (
        <div className={`flex items-center justify-between rounded-xl p-2.5 border-2 ${
          hitsTarget
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-700"
            : "bg-slate-50 dark:bg-slate-800/60 border-transparent"
        }`}>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Your Return at {formatCurrency(targetCost)} Cost</p>
            <p className={`text-sm font-black ${hitsTarget ? "text-amber-700 dark:text-amber-300" : "text-slate-700 dark:text-slate-300"}`}>
              {returnPercent >= 0 ? "+" : ""}{returnPercent.toFixed(0)}%
            </p>
          </div>
          {hitsTarget && (
            <span className="px-2 py-1 rounded-full text-[10px] font-black bg-amber-400 text-slate-950">
              💰 HITS TARGET
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2.5">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Valuation Range</p>
          <p className="text-sm font-black text-slate-900 dark:text-white">
            {formatCurrency(book.estimatedLow)} – {formatCurrency(book.estimatedHigh)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Median Estimate</p>
          <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(book.medianMarketValue)}</p>
        </div>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-300">{book.editionNotes}</p>

      {book.spineNotes && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic border-l-2 border-slate-200 dark:border-slate-700 pl-2">
          {book.spineNotes}
        </p>
      )}

      {book.inspectionChecklist.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Field Inspection Checklist</p>
          <ul className="space-y-1.5">
            {book.inspectionChecklist.map((item, index) => (
              <li key={index} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                <CheckCircle size={13} className="shrink-0 mt-0.5 text-slate-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onAddToInventory}
        disabled={alreadyAdded}
        className={`w-full flex items-center justify-center gap-1.5 rounded-xl text-xs font-bold py-2.5 transition cursor-pointer disabled:cursor-not-allowed ${
          alreadyAdded ? "bg-emerald-600 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"
        }`}
      >
        {alreadyAdded ? (
          <>
            <CheckCircle size={14} />
            <span>Added to Colophon Inventory</span>
          </>
        ) : (
          <>
            <Plus size={14} />
            <span>Add to Colophon Inventory</span>
          </>
        )}
      </button>
    </div>
  );
}

export default function ShelfScannerView({ onAddToInventory }: ShelfScannerViewProps): JSX.Element {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(API_KEY_STORAGE_KEY);
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [stage, setStage] = useState<AnalysisStage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [books, setBooks] = useState<ValuedBook[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterOption>("ALL");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [targetCost, setTargetCost] = useState<number>(() => readStoredNumber(TARGET_COST_STORAGE_KEY, DEFAULT_TARGET_COST));
  const [targetReturnPercent, setTargetReturnPercent] = useState<number>(() =>
    readStoredNumber(TARGET_RETURN_STORAGE_KEY, DEFAULT_TARGET_RETURN_PERCENT),
  );

  useEffect(() => {
    window.localStorage.setItem(TARGET_COST_STORAGE_KEY, String(targetCost));
  }, [targetCost]);

  useEffect(() => {
    window.localStorage.setItem(TARGET_RETURN_STORAGE_KEY, String(targetReturnPercent));
  }, [targetReturnPercent]);

  const isBusy = stage !== "idle" && stage !== "done";

  const handleSaveApiKey = (key: string): void => {
    window.localStorage.setItem(API_KEY_STORAGE_KEY, key);
    setApiKey(key);
  };

  const handleClearApiKey = (): void => {
    window.localStorage.removeItem(API_KEY_STORAGE_KEY);
    setApiKey(null);
  };

  const handleFileSelected = async (file: File): Promise<void> => {
    if (!apiKey) return;

    setErrorMessage(null);
    setBooks([]);
    setSelectedBookId(null);
    setAddedIds(new Set());

    try {
      setStage("preprocessing");
      const compressed = await preprocessShelfImage(file);
      setImagePreview(compressed);

      setStage("detecting");
      const spines = await analyzeShelfImage(compressed, apiKey);

      if (spines.length === 0) {
        setErrorMessage("No book spines were detected in this photo. Try a closer, well-lit shot of the shelf.");
        setStage("idle");
        return;
      }

      setStage("valuing");
      const valued = await resolveBookValuations(spines);

      setBooks(valued);
      setSelectedBookId(valued[0]?.id ?? null);
      setStage("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong analyzing this shelf.");
      setStage("idle");
    }
  };

  const hitsTarget = (book: ValuedBook): boolean => {
    const pct = computeReturnPercent(book, targetCost);
    return pct !== null && pct >= targetReturnPercent;
  };

  const filteredBooks = useMemo(() => {
    if (filter === "ALL") return books;
    if (filter === "TARGET") return books.filter(hitsTarget);
    return books.filter((book) => book.triage === filter);
  }, [books, filter, targetCost, targetReturnPercent]);

  const selectedBook = books.find((book) => book.id === selectedBookId) ?? null;

  const summary = useMemo(
    () => ({
      total: books.length,
      target: books.filter(hitsTarget).length,
      green: books.filter((book) => book.triage === "GREEN").length,
      yellow: books.filter((book) => book.triage === "YELLOW").length,
      gray: books.filter((book) => book.triage === "GRAY").length,
    }),
    [books, targetCost, targetReturnPercent],
  );

  const handleAddToInventory = (book: ValuedBook): void => {
    onAddToInventory?.(book);
    setAddedIds((current) => new Set(current).add(book.id));
  };

  if (!apiKey) {
    return <ApiKeySetupCard onSave={handleSaveApiKey} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-black text-slate-900 dark:text-white">Shelf Scanner & Rapid Spine Valuation</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Photograph a shelf to detect, price, and triage every spine at once.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClearApiKey}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer"
        >
          Change API Key
        </button>
      </div>

      <TargetSettingsBar
        targetCost={targetCost}
        onTargetCostChange={setTargetCost}
        targetReturnPercent={targetReturnPercent}
        onTargetReturnPercentChange={setTargetReturnPercent}
      />

      <UploadZone onFileSelected={(file) => void handleFileSelected(file)} busy={isBusy} />

      {isBusy && (
        <div className="flex items-center gap-2 justify-center text-sm font-semibold text-indigo-600 dark:text-indigo-400 py-2">
          <Loader2 className="animate-spin" size={16} />
          <span>{STAGE_LABELS[stage as "preprocessing" | "detecting" | "valuing"]}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold p-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {books.length > 0 && imagePreview && (
        <>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {summary.total} Books Detected — <span className="text-amber-600 dark:text-amber-400">{summary.target} Hit Your Return Target</span>, {summary.green} High Priority, {summary.yellow} Inspect In-Person, {summary.gray} Pass
            </p>
            <div className="flex items-center gap-1.5">
              {(["ALL", "TARGET", "GREEN", "YELLOW"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                    filter === option
                      ? option === "TARGET"
                        ? "bg-amber-500 text-slate-950"
                        : "bg-indigo-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {option === "ALL" ? "All" : option === "TARGET" ? "💰 Hits Target" : option === "GREEN" ? "Green Only" : "Yellow Only"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-black">
              <img src={imagePreview} alt="Scanned shelf" className="w-full h-auto block" />
              <div className="absolute inset-0">
                {filteredBooks.map((book) => (
                  <SpineOverlayBox
                    key={book.id}
                    book={book}
                    isSelected={book.id === selectedBookId}
                    hitsTarget={hitsTarget(book)}
                    onSelect={() => setSelectedBookId(book.id)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {filteredBooks.length === 0 ? (
                  <p className="p-4 text-xs text-center text-slate-400">No books match this filter.</p>
                ) : (
                  filteredBooks.map((book) => {
                    const style = TRIAGE_STYLES[book.triage];
                    const bookHitsTarget = hitsTarget(book);
                    return (
                      <button
                        key={book.id}
                        type="button"
                        onClick={() => setSelectedBookId(book.id)}
                        className={`w-full flex items-center gap-2.5 p-3 text-left transition cursor-pointer ${
                          book.id === selectedBookId ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-slate-900 dark:text-white truncate">{book.title}</span>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">{book.author}</span>
                        </span>
                        {bookHitsTarget && <span className="shrink-0 text-sm" title="Hits your return target">💰</span>}
                        <ChevronRight size={14} className="text-slate-400 shrink-0" />
                      </button>
                    );
                  })
                )}
              </div>

              {selectedBook && (
                <InspectionDrawer
                  book={selectedBook}
                  targetCost={targetCost}
                  returnPercent={computeReturnPercent(selectedBook, targetCost)}
                  hitsTarget={hitsTarget(selectedBook)}
                  onAddToInventory={() => handleAddToInventory(selectedBook)}
                  alreadyAdded={addedIds.has(selectedBook.id)}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Camera, Download, Key, Loader2, Search, Trash2 } from "lucide-react";
import {
  fetchLibraryVolumes,
  fetchLibraryNotes,
  createLibraryNote,
  removeLibraryNote,
  type LibraryVolume,
  type LibraryNote,
} from "../../services/library.service";
import { preprocessShelfImage } from "../../services/geminiShelfService";
import { transcribePageImage } from "../../services/geminiOcrService";

const API_KEY_STORAGE_KEY = "colophon-gemini-api-key";

function buildCitationPreview(volume: LibraryVolume, pageNumber: string): string {
  const parts: string[] = [];
  if (volume.author) parts.push(volume.author);
  parts.push(volume.title);
  const publisherYear = [volume.publisher, volume.publishYear].filter(Boolean).join(", ");
  if (publisherYear) parts.push(publisherYear);
  let citation = parts.join(". ");
  if (pageNumber.trim()) citation += `, p. ${pageNumber.trim()}`;
  return `${citation}.`;
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Renders a shareable quote card to a PNG data URL for the user to download. */
function generateQuoteCardDataUrl(quoteText: string, citation: string, bookTitle: string): string {
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(251,191,36,0.5)";
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 48, size - 96, size - 96);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "600 28px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("“", size / 2, 170);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "400 40px Georgia, serif";
  const lines = wrapCanvasText(ctx, quoteText, size - 220);
  const lineHeight = 56;
  const startY = size / 2 - (lines.length * lineHeight) / 2;
  lines.slice(0, 10).forEach((line, index) => {
    ctx.fillText(line, size / 2, startY + index * lineHeight);
  });

  ctx.fillStyle = "#94a3b8";
  ctx.font = "italic 24px Georgia, serif";
  ctx.fillText(`— ${bookTitle}`, size / 2, startY + Math.min(lines.length, 10) * lineHeight + 60);

  ctx.font = "20px Georgia, serif";
  ctx.fillStyle = "#64748b";
  const citationLines = wrapCanvasText(ctx, citation, size - 220);
  citationLines.forEach((line, index) => {
    ctx.fillText(line, size / 2, size - 100 + index * 26);
  });

  return canvas.toDataURL("image/png");
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function LibraryNotesPage(): JSX.Element {
  const [apiKey, setApiKey] = useState<string | null>(() => window.localStorage.getItem(API_KEY_STORAGE_KEY));
  const [apiKeyInput, setApiKeyInput] = useState("");

  const [volumeQuery, setVolumeQuery] = useState("");
  const [volumeResults, setVolumeResults] = useState<LibraryVolume[]>([]);
  const [selectedVolume, setSelectedVolume] = useState<LibraryVolume | null>(null);
  const [searching, setSearching] = useState(false);

  const [quoteText, setQuoteText] = useState("");
  const [personalNote, setPersonalNote] = useState("");
  const [pageNumber, setPageNumber] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [notes, setNotes] = useState<LibraryNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);

  const loadNotes = async (): Promise<void> => {
    setLoadingNotes(true);
    try {
      const items = await fetchLibraryNotes();
      setNotes(items);
    } catch (err) {
      console.warn("fetchLibraryNotes error:", err);
    } finally {
      setLoadingNotes(false);
    }
  };

  useEffect(() => {
    void loadNotes();
  }, []);

  useEffect(() => {
    if (!volumeQuery.trim()) {
      setVolumeResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await fetchLibraryVolumes({ query: volumeQuery, limit: 8 });
        setVolumeResults(result.items);
      } catch {
        setVolumeResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [volumeQuery]);

  const handleSaveApiKey = (): void => {
    if (!apiKeyInput.trim()) return;
    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKeyInput.trim());
    setApiKey(apiKeyInput.trim());
  };

  const handlePhotoSelected = async (file: File): Promise<void> => {
    if (!apiKey) return;
    setErrorMessage(null);
    setIsTranscribing(true);
    try {
      const compressed = await preprocessShelfImage(file);
      const text = await transcribePageImage(compressed, apiKey);
      setQuoteText((current) => (current.trim() ? `${current}\n\n${text}` : text));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to read text from that photo.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSaveNote = async (): Promise<void> => {
    if (!selectedVolume) {
      setErrorMessage("Choose a book for this note first.");
      return;
    }
    if (!quoteText.trim() && !personalNote.trim()) {
      setErrorMessage("Add a quote or a note before saving.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await createLibraryNote({
        volumeId: selectedVolume.id,
        quoteText: quoteText.trim() || undefined,
        personalNote: personalNote.trim() || undefined,
        pageNumber: pageNumber.trim() || undefined,
      });
      setQuoteText("");
      setPersonalNote("");
      setPageNumber("");
      setSelectedVolume(null);
      setVolumeQuery("");
      void loadNotes();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save note.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (id: string): Promise<void> => {
    try {
      await removeLibraryNote(id);
      setNotes((current) => current.filter((note) => note.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove note.");
    }
  };

  const handleShareNote = (note: LibraryNote): void => {
    const dataUrl = generateQuoteCardDataUrl(
      note.quoteText || note.personalNote || "",
      note.citationText || "",
      note.volume?.title || "",
    );
    if (dataUrl) downloadDataUrl(dataUrl, `quote-${note.id}.png`);
  };

  if (!apiKey) {
    return (
      <div className="max-w-md mx-auto mt-10 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-lg">
        <div className="flex items-center gap-2 text-slate-900 dark:text-white">
          <Key size={18} />
          <h2 className="text-sm font-black">Connect Gemini API Key</h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Research Notes uses Gemini to transcribe photos of book pages into text. This is the same key used by Shelf Scanner -- if you've already set one there, it should already be picked up here too.
        </p>
        <div className="space-y-2">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(event) => setApiKeyInput(event.target.value)}
            placeholder="Paste your Gemini API key"
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={handleSaveApiKey}
            disabled={!apiKeyInput.trim()}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold py-2 transition cursor-pointer"
          >
            Save & Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 font-sans max-w-4xl mx-auto">
      {/* Capture Card */}
      <div className="p-4 sm:p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-4">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">Capture a Quote or Note</h3>

        {/* Book Picker */}
        <div className="relative">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              type="text"
              value={selectedVolume ? selectedVolume.title : volumeQuery}
              onChange={(event) => {
                setSelectedVolume(null);
                setVolumeQuery(event.target.value);
              }}
              placeholder="Search your catalog for the book this note is about..."
              className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            />
            {searching && <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />}
          </div>
          {!selectedVolume && volumeResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-56 overflow-y-auto">
              {volumeResults.map((volume) => (
                <button
                  key={volume.id}
                  type="button"
                  onClick={() => {
                    setSelectedVolume(volume);
                    setVolumeResults([]);
                  }}
                  className="w-full flex items-center gap-2.5 p-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <div className="w-8 h-11 bg-slate-100 dark:bg-slate-900 rounded overflow-hidden shrink-0 flex items-center justify-center">
                    {volume.coverUrl ? (
                      <img src={volume.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[8px] text-slate-400">BOOK</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{volume.title}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{volume.author || "Unknown"}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Photo Capture */}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handlePhotoSelected(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isTranscribing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
          >
            {isTranscribing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            {isTranscribing ? "Reading page..." : "Photograph a Page"}
          </button>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">or type the quote directly below</span>
        </div>

        <textarea
          value={quoteText}
          onChange={(event) => setQuoteText(event.target.value)}
          rows={4}
          placeholder="Quote text (from a photo, or typed)..."
          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
        />
        <textarea
          value={personalNote}
          onChange={(event) => setPersonalNote(event.target.value)}
          rows={2}
          placeholder="Your own research note or commentary (optional)..."
          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={pageNumber}
            onChange={(event) => setPageNumber(event.target.value)}
            placeholder="Page #"
            className="w-24 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          {selectedVolume && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic flex-1 min-w-0">
              Will be cited as: {buildCitationPreview(selectedVolume, pageNumber)}
            </p>
          )}
        </div>

        {errorMessage && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{errorMessage}</p>}

        <button
          type="button"
          onClick={() => void handleSaveNote()}
          disabled={isSaving}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Note"}
        </button>
      </div>

      {/* Notes List */}
      <div className="p-4 sm:p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-4">
        <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">
          Research Notes ({notes.length})
        </h3>

        {loadingNotes ? (
          <div className="p-12 text-center text-slate-500 text-xs">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
            <p className="text-xs font-semibold text-slate-800 dark:text-white">No notes yet.</p>
            <p className="text-[11px] text-slate-500">Photograph a page above, or type a quote, to save your first note.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="p-3.5 bg-white dark:bg-slate-700/70 rounded-2xl border border-slate-300 dark:border-slate-600 space-y-2"
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-12 bg-slate-100 dark:bg-slate-900 rounded overflow-hidden shrink-0 flex items-center justify-center">
                    {note.volume?.coverUrl ? (
                      <img src={note.volume.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[8px] text-slate-400">BOOK</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{note.volume?.title}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{note.volume?.author || "Unknown"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteNote(note.id)}
                    className="text-slate-400 hover:text-rose-500 shrink-0 cursor-pointer"
                    title="Delete note"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {note.quoteText && (
                  <blockquote className="text-xs text-slate-700 dark:text-slate-200 italic border-l-2 border-amber-400 pl-2.5 line-clamp-4">
                    "{note.quoteText}"
                  </blockquote>
                )}
                {note.personalNote && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-3">{note.personalNote}</p>
                )}
                {note.citationText && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{note.citationText}</p>
                )}

                <button
                  type="button"
                  onClick={() => handleShareNote(note)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition cursor-pointer"
                >
                  <Download size={12} />
                  Save Quote Card to Share
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

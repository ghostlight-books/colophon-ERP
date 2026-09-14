import { useEffect, useState } from "react";

export type CoverCandidate = {
  source: "Google Books" | "Open Library" | "ThriftBooks" | "AbeBooks" | "ISBNdb" | "LibraryThing";
  url: string;
  quality: "high" | "medium" | "standard";
};

interface CoverPickerModalProps {
  title: string;
  isbn: string;
  author?: string | null;
  currentCoverUrl: string | null;
  fetchCandidates: (params: { isbn: string; title?: string; author?: string }) => Promise<CoverCandidate[]>;
  onSelect: (url: string) => void | Promise<void>;
  onClose: () => void;
}

const SOURCE_BADGE: Record<CoverCandidate["source"], string> = {
  "Google Books": "bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300",
  "Open Library": "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300",
  ThriftBooks: "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300",
  AbeBooks: "bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300",
  ISBNdb: "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200",
  LibraryThing: "bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300",
};

export default function CoverPickerModal({ title, isbn, author, currentCoverUrl, fetchCandidates, onSelect, onClose }: CoverPickerModalProps) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<CoverCandidate[]>([]);
  const [customUrl, setCustomUrl] = useState("");
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCandidates({ isbn, title, author: author || undefined })
      .then((list) => {
        if (!cancelled) setCandidates(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isbn]);

  const applyCover = async (url: string) => {
    setApplying(url);
    try {
      await onSelect(url);
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-scaleUp border border-slate-200 dark:border-slate-800">
        <div className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 px-5 py-4 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Cover Images & Editions</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
              {title} {isbn ? `• ISBN ${isbn}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-500 font-medium">Registries:</span>
            <span className="px-2 py-0.5 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg text-[10px] font-medium">Google Books HD</span>
            <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-[10px] font-medium">Open Library CDN</span>
            <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[10px] font-medium">ThriftBooks</span>
            <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg text-[10px] font-medium">AbeBooks</span>
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg text-[10px] font-medium">ISBNdb</span>
          </div>

          {loading && (
            <div className="py-12 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-slate-800 dark:border-white border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Probing multi-source book cover registries in parallel…</p>
            </div>
          )}

          {!loading && candidates.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Found {candidates.length} Verified Cover {candidates.length === 1 ? "Edition" : "Editions"}:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {candidates.map((cand, idx) => {
                  const isCurrent = currentCoverUrl === cand.url;
                  const isApplying = applying === cand.url;
                  return (
                    <div
                      key={idx}
                      onClick={() => void applyCover(cand.url)}
                      className={`group relative rounded-2xl border p-2 flex flex-col justify-between items-center text-center cursor-pointer transition ${
                        isCurrent
                          ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-2 ring-emerald-500"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-md"
                      }`}
                    >
                      <div className="w-full aspect-[2/3] rounded-xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 mb-2 flex items-center justify-center">
                        <img src={cand.url} alt={`Cover candidate from ${cand.source}`} className="w-full h-full object-cover group-hover:scale-105 transition" />
                      </div>
                      <div className="w-full space-y-1">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${SOURCE_BADGE[cand.source]}`}>{cand.source}</span>
                        <button
                          type="button"
                          disabled={isApplying}
                          className={`w-full py-1 text-[10px] font-medium rounded-lg transition disabled:opacity-60 ${
                            isCurrent ? "bg-emerald-600 text-white font-semibold" : "bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white"
                          }`}
                        >
                          {isApplying ? "Applying…" : isCurrent ? "✓ Active Cover" : "Select Cover"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && candidates.length === 0 && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 text-center space-y-1">
              <p className="font-semibold text-slate-800 dark:text-slate-200">No registry covers automatically matched.</p>
              <p className="text-slate-500 dark:text-slate-400 text-[11px]">You can paste any custom image link below to set a custom book cover.</p>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <label className="block font-semibold text-slate-800 dark:text-slate-200">Or Paste Custom Image URL:</label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://example.com/cover.jpg"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white"
              />
              <button
                type="button"
                disabled={!customUrl.trim() || applying !== null}
                onClick={() => void applyCover(customUrl.trim())}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium rounded-xl disabled:opacity-50 cursor-pointer"
              >
                Use This
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

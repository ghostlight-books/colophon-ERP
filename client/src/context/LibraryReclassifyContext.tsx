import React, { createContext, useContext, useState, useRef, useCallback } from "react";
import { reclassifyVolumesBatch } from "../services/library.service";

interface ReclassifyProgress {
  processed: number;
  total: number;
  updated: number;
}

interface LibraryReclassifyContextType {
  isRunning: boolean;
  progress: ReclassifyProgress | null;
  resultMessage: string | null;
  startReclassify: () => void;
  cancelReclassify: () => void;
  dismissResult: () => void;
}

const LibraryReclassifyContext = createContext<LibraryReclassifyContextType | undefined>(undefined);

// Runs the catalog-wide Dewey/LOC re-classification job here instead of
// inside the Catalog page itself, so it keeps running (and stays visible via
// a small indicator, not a blocking modal) no matter which Library page the
// user navigates to while it's in progress.
export function LibraryReclassifyProvider({ children }: { children: React.ReactNode }) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ReclassifyProgress | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const runningRef = useRef(false);

  const startReclassify = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    cancelledRef.current = false;
    setIsRunning(true);
    setResultMessage(null);
    setProgress(null);

    void (async () => {
      let offset = 0;
      let total = 0;
      let totalUpdated = 0;
      const allErrors: Array<{ id: string; title: string; error: string }> = [];

      try {
        while (true) {
          const result = await reclassifyVolumesBatch(offset, 10);
          total = result.total;
          totalUpdated += result.updated;
          allErrors.push(...result.errors);
          offset = result.nextOffset;
          setProgress({ processed: offset, total, updated: totalUpdated });

          if (cancelledRef.current || !result.hasMore) break;
        }

        const scope = cancelledRef.current ? `${offset} of ${total} books (stopped early)` : `all ${total} books`;
        setResultMessage(
          allErrors.length > 0
            ? `Checked ${scope} -- ${totalUpdated} updated, ${allErrors.length} couldn't be checked.`
            : `Checked ${scope} -- ${totalUpdated} got updated Dewey/LOC numbers.`
        );
      } catch (err) {
        setResultMessage(err instanceof Error ? err.message : "Failed to re-classify catalog.");
      } finally {
        setIsRunning(false);
        setProgress(null);
        runningRef.current = false;
      }
    })();
  }, []);

  const cancelReclassify = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const dismissResult = useCallback(() => setResultMessage(null), []);

  return (
    <LibraryReclassifyContext.Provider
      value={{ isRunning, progress, resultMessage, startReclassify, cancelReclassify, dismissResult }}
    >
      {children}
    </LibraryReclassifyContext.Provider>
  );
}

export function useLibraryReclassify() {
  const context = useContext(LibraryReclassifyContext);
  if (!context) {
    throw new Error("useLibraryReclassify must be used within a LibraryReclassifyProvider");
  }
  return context;
}

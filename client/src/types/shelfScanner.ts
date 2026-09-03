// Types for the Shelf Scanner & Rapid Spine Valuation feature.
// A shelf photo is analyzed by a multimodal vision model to detect individual
// book spines, which are then bibliographically resolved and valued so a
// scout can triage an entire shelf at a glance.

/** Bounding box coordinates normalized on a 0-1000 scale, matching Gemini's
 *  documented convention for object detection (not 0-1 and not pixels). */
export interface SpineBoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

/** Field triage classification for a detected spine. */
export type TriageFlag = "GREEN" | "YELLOW" | "GRAY";

/** Physical binding format read (or inferred) from the spine. */
export type BindingFormat = "Hardcover" | "Paperback" | "Leather" | "Unknown";

/** Raw detection returned directly by the vision model, before bibliographic
 *  resolution or valuation. */
export interface DetectedSpine {
  id: string;
  box2d: SpineBoundingBox;
  title: string;
  author: string;
  publisher: string | null;
  formatConfidence: BindingFormat;
  spineNotes: string;
}

/** A detected spine after bibliographic enrichment, pricing heuristics, and
 *  triage classification have been applied. */
export interface ValuedBook extends DetectedSpine {
  triage: TriageFlag;
  estimatedLow: number;
  estimatedHigh: number;
  medianMarketValue: number;
  editionNotes: string;
  inspectionChecklist: string[];
  googleBooksId?: string;
  isbn?: string;
  publishedDate?: string;
}

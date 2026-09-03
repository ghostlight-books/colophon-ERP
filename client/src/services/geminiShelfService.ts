import type { BindingFormat, DetectedSpine, SpineBoundingBox } from "../types/shelfScanner";

const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;

const SPINE_DETECTION_PROMPT = `You are an expert antiquarian bookseller and bibliographer analyzing a photograph of books on a bookshelf.

For every distinct book spine visible:
1. Accurately detect its bounding box coordinates in [ymin, xmin, ymax, xmax] normalized on a 0-1000 scale, where (0,0) is the top-left corner of the image and (1000,1000) is the bottom-right corner.
2. Read the title, author, and publisher imprinted on the spine, handling vertical, curved, embossed, or stylized typography.
3. Identify the physical binding format (Hardcover, Paperback, or Leather). Use "Unknown" only if truly indeterminate from the spine's appearance.
4. If this title is known to have collector significance on early printings (for example, works by Frank Herbert, Cormac McCarthy, or Stephen King, notable First Editions, or fine-press imprints like Easton Press or Franklin Library), note in spineNotes what to look for on the copyright page or dust jacket to help identify a true first edition or first printing.

Return every spine you can identify, even partially obscured ones, with your best-effort reading. Do not skip a spine just because the text is hard to read -- give your best interpretation and describe any uncertainty in spineNotes instead of omitting it.`;

const DETECTION_RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING", description: "The book's title as read from the spine." },
      author: { type: "STRING", description: "The author's name as read from the spine." },
      publisher: { type: "STRING", description: "The publisher or imprint, if legible." },
      formatConfidence: {
        type: "STRING",
        enum: ["Hardcover", "Paperback", "Leather", "Unknown"],
        description: "The physical binding format of the volume.",
      },
      spineNotes: {
        type: "STRING",
        description: "Collector-significance notes, first-edition identification hints, or reading uncertainty.",
      },
      box2d: {
        type: "OBJECT",
        properties: {
          ymin: { type: "NUMBER" },
          xmin: { type: "NUMBER" },
          ymax: { type: "NUMBER" },
          xmax: { type: "NUMBER" },
        },
        required: ["ymin", "xmin", "ymax", "xmax"],
      },
    },
    required: ["title", "author", "box2d"],
  },
} as const;

/**
 * Loads an image (from a File/Blob or an existing data URL) into an
 * off-screen canvas, downsizes it so neither dimension exceeds
 * MAX_DIMENSION while preserving aspect ratio, and re-encodes it as a
 * compressed JPEG data URL. Keeps the payload small enough for a fast
 * round trip to the vision model.
 */
export async function preprocessShelfImage(source: File | Blob | string): Promise<string> {
  const dataUrl = typeof source === "string" ? source : await blobToDataUrl(source);
  const image = await loadImage(dataUrl);

  const { width, height } = image;
  let targetWidth = width;
  let targetHeight = height;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width >= height) {
      targetWidth = MAX_DIMENSION;
      targetHeight = Math.round((height / width) * MAX_DIMENSION);
    } else {
      targetHeight = MAX_DIMENSION;
      targetWidth = Math.round((width / height) * MAX_DIMENSION);
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not prepare a canvas to process this image.");
  }

  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read the image file."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load the image. Try a different file."));
    img.src = dataUrl;
  });
}

function splitDataUrl(image: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(image);
  if (match) {
    return { mimeType: match[1], data: match[2] };
  }
  // Assume the caller passed raw base64 with no data URL prefix.
  return { mimeType: "image/jpeg", data: image };
}

function clampBoxValue(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1000, Math.max(0, num));
}

function normalizeBox2d(raw: unknown): SpineBoundingBox {
  const box = (raw ?? {}) as Partial<Record<keyof SpineBoundingBox, unknown>>;
  return {
    ymin: clampBoxValue(box.ymin),
    xmin: clampBoxValue(box.xmin),
    ymax: clampBoxValue(box.ymax),
    xmax: clampBoxValue(box.xmax),
  };
}

const VALID_FORMATS: BindingFormat[] = ["Hardcover", "Paperback", "Leather", "Unknown"];

function normalizeFormat(raw: unknown): BindingFormat {
  return typeof raw === "string" && (VALID_FORMATS as string[]).includes(raw) ? (raw as BindingFormat) : "Unknown";
}

function normalizeDetectedSpine(raw: unknown, index: number): DetectedSpine {
  const entry = (raw ?? {}) as Record<string, unknown>;
  return {
    id: `spine-${Date.now()}-${index}`,
    box2d: normalizeBox2d(entry.box2d),
    title: typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : "Untitled Spine",
    author: typeof entry.author === "string" && entry.author.trim() ? entry.author.trim() : "Unknown Author",
    publisher: typeof entry.publisher === "string" && entry.publisher.trim() ? entry.publisher.trim() : null,
    formatConfidence: normalizeFormat(entry.formatConfidence),
    spineNotes: typeof entry.spineNotes === "string" ? entry.spineNotes.trim() : "",
  };
}

/**
 * Sends a preprocessed shelf photo to Gemini for structured spine detection.
 * `base64Image` may be a full data URL (as returned by preprocessShelfImage)
 * or raw base64; either is accepted.
 */
export async function analyzeShelfImage(base64Image: string, apiKey: string): Promise<DetectedSpine[]> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("A Gemini API key is required. Add one in Shelf Scanner settings.");
  }
  if (!base64Image) {
    throw new Error("No image was provided to analyze.");
  }

  const { mimeType, data } = splitDataUrl(base64Image);
  if (!data) {
    throw new Error("The image payload was empty or invalid.");
  }

  let response: Response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: SPINE_DETECTION_PROMPT }, { inlineData: { mimeType, data } }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: DETECTION_RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      }),
    });
  } catch {
    throw new Error("Could not reach the Gemini API. Check your internet connection and try again.");
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Gemini API rate limit reached. Wait a moment before analyzing another shelf.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Gemini API key was rejected. Check that it's valid and has Generative Language API access enabled.");
    }
    let detail = "";
    try {
      const errorBody = (await response.json()) as { error?: { message?: string } };
      detail = errorBody?.error?.message ?? "";
    } catch {
      // Response body wasn't JSON; fall through with no extra detail.
    }
    throw new Error(`Gemini API request failed (${response.status}).${detail ? ` ${detail}` : ""}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("Gemini returned an empty response. Try a clearer or better-lit photo.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Gemini's response could not be parsed. Try analyzing the photo again.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini's response was not in the expected format.");
  }

  return parsed.map((entry, index) => normalizeDetectedSpine(entry, index));
}

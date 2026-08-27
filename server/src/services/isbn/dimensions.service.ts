import type { BookPhysicalDimensions, PackageType } from "@colophon/shared";

export interface RawDimensionInput {
  dimensionsRaw?: string | null;
  dimensionsStructured?: {
    length?: { unit?: string; value?: number };
    width?: { unit?: string; value?: number };
    height?: { unit?: string; value?: number };
    weight?: { unit?: string; value?: number };
  } | null;
  weightRaw?: string | number | null;
  pages?: number | null;
  binding?: string | null;
  format?: string | null;
  title?: string | null;
  description?: string | null;
}

/**
 * Standard bookstore format presets with realistic physical dimensions (in inches) and base weights (in ounces).
 */
export const FORMAT_PRESETS = {
  MASS_MARKET: {
    formatName: "Mass Market Paperback",
    length: 6.87,
    width: 4.25,
    thickness: 0.85,
    baseWeightOz: 7.5,
  },
  TRADE_PAPERBACK: {
    formatName: "Trade Paperback",
    length: 8.5,
    width: 5.5,
    thickness: 0.95,
    baseWeightOz: 13.0,
  },
  STANDARD_HARDCOVER: {
    formatName: "Standard Hardcover",
    length: 9.25,
    width: 6.25,
    thickness: 1.25,
    baseWeightOz: 22.0,
  },
  LARGE_HARDCOVER_TEXTBOOK: {
    formatName: "Large Hardcover / Textbook",
    length: 11.0,
    width: 8.5,
    thickness: 1.6,
    baseWeightOz: 44.0,
  },
};

/**
 * Parses textual dimension and weight strings from various metadata sources into standardized numbers.
 */
export function parseDimensionString(raw: string): {
  length?: number;
  width?: number;
  thickness?: number;
  weightOz?: number;
} {
  const result: { length?: number; width?: number; thickness?: number; weightOz?: number } = {};
  if (!raw || !raw.trim()) return result;

  const normalized = raw.toLowerCase();

  // Pattern 1: "Height: 9.0 Inches, Length: 6.0 Inches, Weight: 1.25 Pounds, Width: 1.1 Inches"
  const heightMatch = normalized.match(/height:\s*([\d.]+)\s*(inches|inch|in|cm|mm)?/);
  const lengthMatch = normalized.match(/length:\s*([\d.]+)\s*(inches|inch|in|cm|mm)?/);
  const widthMatch = normalized.match(/width:\s*([\d.]+)\s*(inches|inch|in|cm|mm)?/);
  const weightMatch = normalized.match(/weight:\s*([\d.]+)\s*(pounds|pound|lbs|lb|ounces|ounce|oz|grams|g|kg)?/);

  if (heightMatch) {
    let val = parseFloat(heightMatch[1]);
    if (heightMatch[2] === "cm") val = val / 2.54;
    if (heightMatch[2] === "mm") val = val / 25.4;
    result.length = Math.round(val * 100) / 100;
  }

  if (lengthMatch && !result.length) {
    let val = parseFloat(lengthMatch[1]);
    if (lengthMatch[2] === "cm") val = val / 2.54;
    result.length = Math.round(val * 100) / 100;
  }

  if (widthMatch) {
    let val = parseFloat(widthMatch[1]);
    if (widthMatch[2] === "cm") val = val / 2.54;
    result.width = Math.round(val * 100) / 100;
  }

  // Thickness / Depth
  const thicknessMatch = normalized.match(/(depth|thickness):\s*([\d.]+)\s*(inches|inch|in|cm|mm)?/);
  if (thicknessMatch) {
    let val = parseFloat(thicknessMatch[2]);
    if (thicknessMatch[3] === "cm") val = val / 2.54;
    result.thickness = Math.round(val * 100) / 100;
  }

  // Pattern 2: "9.0 x 6.0 x 1.2 inches" or "23 x 15 x 3 cm"
  if (!result.length || !result.width) {
    const dim3Match = normalized.match(/([\d.]+)\s*(?:x|×|\*)\s*([\d.]+)\s*(?:x|×|\*)\s*([\d.]+)\s*(inches|inch|in|cm|mm)?/);
    if (dim3Match) {
      let l = parseFloat(dim3Match[1]);
      let w = parseFloat(dim3Match[2]);
      let t = parseFloat(dim3Match[3]);
      const unit = dim3Match[4] || "in";
      if (unit === "cm") {
        l /= 2.54;
        w /= 2.54;
        t /= 2.54;
      }
      result.length = Math.max(l, w);
      result.width = Math.min(l, w);
      result.thickness = t;
    }
  }

  // Weight parsing
  let weightMatchFinal = weightMatch;
  if (!weightMatchFinal) {
    weightMatchFinal = normalized.match(/([\d.]+)\s*(pounds|pound|lbs|lb|ounces|ounce|oz|grams|gram|g|kg)\b/);
  }

  if (weightMatchFinal) {
    const val = parseFloat(weightMatchFinal[1]);
    const unit = weightMatchFinal[2] || "lb";
    if (unit.startsWith("pound") || unit.startsWith("lb")) {
      result.weightOz = Math.round(val * 16 * 10) / 10;
    } else if (unit.startsWith("oz") || unit.startsWith("ounce")) {
      result.weightOz = Math.round(val * 10) / 10;
    } else if (unit === "g" || unit.startsWith("gram")) {
      result.weightOz = Math.round((val / 28.3495) * 10) / 10;
    } else if (unit === "kg") {
      result.weightOz = Math.round(val * 35.274 * 10) / 10;
    }
  }

  return result;
}

/**
 * Detects format and binding from text markers.
 */
export function detectBindingFormat(bindingRaw?: string | null, title?: string | null, description?: string | null): string {
  const combined = `${bindingRaw ?? ""} ${title ?? ""} ${description ?? ""}`.toLowerCase();

  if (combined.includes("mass market") || combined.includes("pocket book") || combined.includes("mmpb")) {
    return "Mass Market Paperback";
  }
  if (combined.includes("leather") || combined.includes("easton press") || combined.includes("franklin library")) {
    return "Leather Bound";
  }
  if (combined.includes("hardcover") || combined.includes("cloth") || combined.includes("library binding") || combined.includes("casebound")) {
    return "Hardcover";
  }
  if (combined.includes("paperback") || combined.includes("softcover") || combined.includes("trade pb") || combined.includes("perfect paperback")) {
    return "Paperback";
  }
  return "Paperback";
}

/**
 * Determines package envelope / box type based on dimensions and format.
 */
export function determinePackageType(length: number, width: number, thickness: number, weightOz: number): PackageType {
  // Padded Flat Rate Envelope maximum interior: ~9.5" x 12.5" x 2" and <= 70 lbs
  if (length <= 11.5 && width <= 8.5 && thickness <= 2.2) {
    return "Flat Rate Envelope";
  }

  // Oversized or Multi-volume sets
  if (length > 12.0 || width > 9.5 || thickness > 3.0 || weightOz > 64) {
    return "Medium Flat Rate Box";
  }

  return "Package/Thick Envelope";
}

/**
 * Resolves complete BookPhysicalDimensions using structured inputs, string parsers, and smart fallbacks.
 */
export function resolveBookDimensions(input: RawDimensionInput): BookPhysicalDimensions {
  let length: number | undefined;
  let width: number | undefined;
  let thickness: number | undefined;
  let weightOz: number | undefined;

  // 1. Check structured dimensions if provided
  if (input.dimensionsStructured) {
    const s = input.dimensionsStructured;
    if (s.height?.value) length = s.height.unit === "cm" ? s.height.value / 2.54 : s.height.value;
    if (s.length?.value && !length) length = s.length.unit === "cm" ? s.length.value / 2.54 : s.length.value;
    if (s.width?.value) width = s.width.unit === "cm" ? s.width.value / 2.54 : s.width.value;
    if (s.weight?.value) {
      weightOz = s.weight.unit === "pounds" || s.weight.unit === "lbs"
        ? s.weight.value * 16
        : s.weight.value;
    }
  }

  // 2. Parse raw dimension string if fields missing
  if ((!length || !width || !weightOz) && input.dimensionsRaw) {
    const parsed = parseDimensionString(input.dimensionsRaw);
    if (!length && parsed.length) length = parsed.length;
    if (!width && parsed.width) width = parsed.width;
    if (!thickness && parsed.thickness) thickness = parsed.thickness;
    if (!weightOz && parsed.weightOz) weightOz = parsed.weightOz;
  }

  // 3. Parse direct weightRaw if available
  if (!weightOz && input.weightRaw !== undefined && input.weightRaw !== null) {
    if (typeof input.weightRaw === "number") {
      // If <= 5, assume lbs; if > 5, assume oz or grams
      weightOz = input.weightRaw <= 10 ? input.weightRaw * 16 : input.weightRaw;
    } else if (typeof input.weightRaw === "string") {
      const parsedWeight = parseDimensionString(`weight: ${input.weightRaw}`);
      if (parsedWeight.weightOz) weightOz = parsedWeight.weightOz;
    }
  }

  // 4. Determine format
  const bindingFormat = detectBindingFormat(input.binding || input.format, input.title, input.description);

  // 5. Smart fallback for missing dimensions based on format and page count
  const pages = input.pages && input.pages > 0 ? input.pages : 320;

  if (!length || !width || !thickness) {
    if (bindingFormat === "Mass Market Paperback") {
      length = length || FORMAT_PRESETS.MASS_MARKET.length;
      width = width || FORMAT_PRESETS.MASS_MARKET.width;
      thickness = thickness || Math.max(0.6, (pages * 0.0022));
    } else if (bindingFormat === "Hardcover" || bindingFormat === "Leather Bound") {
      if (pages > 650) {
        length = length || FORMAT_PRESETS.LARGE_HARDCOVER_TEXTBOOK.length;
        width = width || FORMAT_PRESETS.LARGE_HARDCOVER_TEXTBOOK.width;
        thickness = thickness || Math.max(1.4, (pages * 0.0025));
      } else {
        length = length || FORMAT_PRESETS.STANDARD_HARDCOVER.length;
        width = width || FORMAT_PRESETS.STANDARD_HARDCOVER.width;
        thickness = thickness || Math.max(0.9, (pages * 0.0024));
      }
    } else {
      // Trade Paperback default
      length = length || FORMAT_PRESETS.TRADE_PAPERBACK.length;
      width = width || FORMAT_PRESETS.TRADE_PAPERBACK.width;
      thickness = thickness || Math.max(0.7, (pages * 0.0022));
    }
  }

  // 6. Smart fallback for missing weight based on format + pages
  if (!weightOz || weightOz <= 0) {
    if (bindingFormat === "Mass Market Paperback") {
      weightOz = FORMAT_PRESETS.MASS_MARKET.baseWeightOz + Math.max(0, (pages - 250) * 0.015);
    } else if (bindingFormat === "Hardcover" || bindingFormat === "Leather Bound") {
      weightOz = FORMAT_PRESETS.STANDARD_HARDCOVER.baseWeightOz + Math.max(0, (pages - 300) * 0.035);
    } else {
      weightOz = FORMAT_PRESETS.TRADE_PAPERBACK.baseWeightOz + Math.max(0, (pages - 280) * 0.025);
    }
  }

  // Standardize outputs
  length = Math.round(length * 100) / 100;
  width = Math.round(width * 100) / 100;
  thickness = Math.round(thickness * 100) / 100;
  weightOz = Math.round(weightOz * 10) / 10;
  const weightLbs = Math.round((weightOz / 16) * 100) / 100;
  const packageType = determinePackageType(length, width, thickness, weightOz);

  return {
    weightOz,
    weightLbs,
    lengthInches: length,
    widthInches: width,
    thicknessInches: thickness,
    pageCount: input.pages || null,
    bindingFormat,
    packageType,
  };
}

/**
 * Optional Google Books API query for volume dimensions.
 */
export async function queryGoogleBooksDimensions(isbn: string): Promise<Partial<RawDimensionInput> | null> {
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, "");
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      items?: Array<{
        volumeInfo?: {
          pageCount?: number;
          dimensions?: {
            height?: string;
            width?: string;
            thickness?: string;
          };
          printType?: string;
        };
      }>;
    };

    const volume = data.items?.[0]?.volumeInfo;
    if (!volume) return null;

    const result: Partial<RawDimensionInput> = {
      pages: volume.pageCount || null,
    };

    if (volume.dimensions) {
      const d = volume.dimensions;
      result.dimensionsRaw = `Height: ${d.height || ""}, Width: ${d.width || ""}, Thickness: ${d.thickness || ""}`;
    }

    return result;
  } catch {
    return null;
  }
}

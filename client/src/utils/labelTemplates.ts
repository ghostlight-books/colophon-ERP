export type LabelField =
  | "title"
  | "author"
  | "publisher"
  | "price"
  | "category"
  | "subcategory"
  | "sku"
  | "condition"
  | "isbnText"
  | "barcode";

export const LABEL_FIELDS: Array<{ key: LabelField; label: string }> = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "publisher", label: "Publisher" },
  { key: "price", label: "Price" },
  { key: "category", label: "Category" },
  { key: "subcategory", label: "Subcategory" },
  { key: "sku", label: "SKU" },
  { key: "condition", label: "Condition" },
  { key: "isbnText", label: "ISBN (as text)" },
  { key: "barcode", label: "Barcode (scannable)" },
];

export interface LabelTemplate {
  widthIn: number;
  heightIn: number;
  fields: LabelField[];
}

// Starting point per the shop's own Dymo stock -- deliberately just numeric
// width/height rather than a fixed list of Dymo SKUs, since label size is a
// per-shop choice, not something this app should hardcode.
export const DEFAULT_LABEL_TEMPLATE: LabelTemplate = {
  widthIn: 2,
  heightIn: 1.25,
  fields: ["price", "category", "subcategory", "barcode"],
};

export interface LabelData {
  title: string | null;
  author: string | null;
  publisher: string | null;
  price: number | null;
  category: string | null;
  subcategory: string | null;
  sku: string | null;
  condition: string | null;
  isbn: string | null;
}

const TEMPLATE_KEY = "colophon_label_template";

export function loadLabelTemplate(): LabelTemplate {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LabelTemplate>;
      if (typeof parsed.widthIn === "number" && typeof parsed.heightIn === "number" && Array.isArray(parsed.fields)) {
        return { widthIn: parsed.widthIn, heightIn: parsed.heightIn, fields: parsed.fields as LabelField[] };
      }
    }
  } catch {}
  return DEFAULT_LABEL_TEMPLATE;
}

export function saveLabelTemplate(template: LabelTemplate): void {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(template));
  } catch {}
}

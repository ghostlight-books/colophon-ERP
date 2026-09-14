import type { JSX } from "react";
import Barcode from "./Barcode";
import type { LabelData, LabelField, LabelTemplate } from "../../utils/labelTemplates";

interface LabelPrintModalProps {
  items: LabelData[];
  template: LabelTemplate;
  onClose: () => void;
}

const PRINT_AREA_ID = "colophon-label-print-area";
const PRINT_PAGE_CLASS = "colophon-label-page";

function renderField(field: LabelField, data: LabelData): JSX.Element | null {
  switch (field) {
    case "title":
      return data.title ? (
        <p key={field} className="text-[9px] font-bold text-center leading-tight line-clamp-2">
          {data.title}
        </p>
      ) : null;
    case "author":
      return data.author ? (
        <p key={field} className="text-[8px] text-center text-slate-700">
          {data.author}
        </p>
      ) : null;
    case "publisher":
      return data.publisher ? (
        <p key={field} className="text-[7px] text-center text-slate-500">
          {data.publisher}
        </p>
      ) : null;
    case "price":
      return typeof data.price === "number" ? (
        <p key={field} className="text-sm font-black">
          ${data.price.toFixed(2)}
        </p>
      ) : null;
    case "category":
      return data.category ? (
        <p key={field} className="text-[8px] font-bold uppercase tracking-wide">
          {data.category}
        </p>
      ) : null;
    case "subcategory":
      return data.subcategory ? (
        <p key={field} className="text-[8px] text-slate-600">
          {data.subcategory}
        </p>
      ) : null;
    case "sku":
      return data.sku ? (
        <p key={field} className="text-[8px] font-mono">
          {data.sku}
        </p>
      ) : null;
    case "condition":
      return data.condition ? (
        <p key={field} className="text-[8px] font-semibold">
          {data.condition}
        </p>
      ) : null;
    case "isbnText":
      return data.isbn ? (
        <p key={field} className="text-[8px] font-mono">
          {data.isbn}
        </p>
      ) : null;
    case "barcode":
      return data.isbn ? <Barcode key={field} value={data.isbn} height={22} /> : null;
    default:
      return null;
  }
}

function LabelPage({ item, template }: { item: LabelData; template: LabelTemplate }) {
  return (
    <div
      className={PRINT_PAGE_CLASS}
      style={{ width: `${template.widthIn}in`, height: `${template.heightIn}in` }}
    >
      <div className="w-full h-full bg-white text-slate-900 flex flex-col items-center justify-center gap-0.5 overflow-hidden p-1">
        {template.fields.map((field) => renderField(field, item))}
      </div>
    </div>
  );
}

export default function LabelPrintModal({ items, template, onClose }: LabelPrintModalProps) {
  const isBatch = items.length > 1;

  return (
    <div className="fixed inset-0 z-[100000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #${PRINT_AREA_ID}, #${PRINT_AREA_ID} * { visibility: visible; }
          #${PRINT_AREA_ID} { position: absolute; top: 0; left: 0; }
          .${PRINT_PAGE_CLASS} { page-break-after: always; }
          .${PRINT_PAGE_CLASS}:last-child { page-break-after: auto; }
          @page { size: ${template.widthIn}in ${template.heightIn}in; margin: 0; }
        }
      `}</style>

      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-5 space-y-4 animate-scaleUp">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">
            {isBatch ? `Print Batch (${items.length} Labels)` : "Print Label"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {template.widthIn}" × {template.heightIn}" -- each label prints as its own page, one after another, so your
          Dymo advances the stock between them. Make sure that size is loaded before printing.
        </p>

        <div className="flex flex-col items-center gap-3 bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-4 max-h-[45vh] overflow-y-auto">
          <div id={PRINT_AREA_ID} className="flex flex-col items-center gap-3 print:block print:gap-0">
            {items.map((item, index) => (
              <div key={index} className="border border-slate-300 bg-white print:border-0">
                <LabelPage item={item} template={template} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-md cursor-pointer"
          >
            🖨️ Print {isBatch ? `${items.length} Labels` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

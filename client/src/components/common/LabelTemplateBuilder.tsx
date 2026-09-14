import { useState } from "react";
import { LABEL_FIELDS, type LabelField, type LabelTemplate } from "../../utils/labelTemplates";

interface LabelTemplateBuilderProps {
  initialTemplate: LabelTemplate;
  onSave: (template: LabelTemplate) => void;
  onClose: () => void;
}

export default function LabelTemplateBuilder({ initialTemplate, onSave, onClose }: LabelTemplateBuilderProps) {
  const [widthIn, setWidthIn] = useState(String(initialTemplate.widthIn));
  const [heightIn, setHeightIn] = useState(String(initialTemplate.heightIn));
  const [fields, setFields] = useState<LabelField[]>(initialTemplate.fields);

  const usedFields = new Set(fields);

  const addField = () => {
    const next = LABEL_FIELDS.find((f) => !usedFields.has(f.key))?.key;
    if (next) setFields((prev) => [...prev, next]);
  };

  const updateField = (index: number, field: LabelField) => {
    setFields((prev) => prev.map((f, i) => (i === index ? field : f)));
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = () => {
    const w = parseFloat(widthIn);
    const h = parseFloat(heightIn);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return;
    onSave({ widthIn: w, heightIn: h, fields });
  };

  return (
    <div className="fixed inset-0 z-[100000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full max-h-[90vh] overflow-y-auto animate-scaleUp space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Label Settings</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Set your Dymo label size and exactly what prints on it. Every shop can set its own.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0"
          >
            ✕
          </button>
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
            Label Size (inches)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0.1"
              value={widthIn}
              onChange={(e) => setWidthIn(e.target.value)}
              placeholder="Width"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-slate-400 text-xs font-bold">×</span>
            <input
              type="number"
              step="0.01"
              min="0.1"
              value={heightIn}
              onChange={(e) => setHeightIn(e.target.value)}
              placeholder="Height"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            What Prints On The Label (in order)
          </label>
          {fields.map((field, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700"
            >
              <span className="w-5 h-5 shrink-0 rounded-full bg-slate-800 dark:bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
                {index + 1}
              </span>
              <select
                value={field}
                onChange={(e) => updateField(index, e.target.value as LabelField)}
                className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {LABEL_FIELDS.filter((f) => f.key === field || !usedFields.has(f.key)).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              <div className="flex flex-col shrink-0">
                <button
                  type="button"
                  onClick={() => moveField(index, -1)}
                  disabled={index === 0}
                  className="text-[10px] leading-none text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed px-0.5"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveField(index, 1)}
                  disabled={index === fields.length - 1}
                  className="text-[10px] leading-none text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed px-0.5"
                >
                  ▼
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeField(index)}
                disabled={fields.length <= 1}
                className="shrink-0 w-6 h-6 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center text-xs font-bold"
              >
                🗑
              </button>
            </div>
          ))}

          {fields.length < LABEL_FIELDS.length && (
            <button
              type="button"
              onClick={addField}
              className="w-full py-2 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              + Add Field
            </button>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-md cursor-pointer"
          >
            Save Label Settings
          </button>
        </div>
      </div>
    </div>
  );
}

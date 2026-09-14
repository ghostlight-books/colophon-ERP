import { useState } from "react";
import { SORT_FIELDS, MAX_SORT_LEVELS, type SortField, type SortLevel, type SortPreset } from "../../utils/librarySort";

interface CustomSortBuilderProps {
  initialLevels: SortLevel[];
  initialPresetId?: string;
  initialPresetName?: string;
  presets: SortPreset[];
  onApply: (levels: SortLevel[]) => void;
  onSave: (name: string, levels: SortLevel[], presetIdToUpdate?: string) => void;
  onDeletePreset: (id: string) => void;
  onEditPreset: (preset: SortPreset) => void;
  onClose: () => void;
}

function fieldLabel(field: SortField): string {
  return SORT_FIELDS.find((f) => f.key === field)?.label || field;
}

export default function CustomSortBuilder({
  initialLevels,
  initialPresetId,
  initialPresetName,
  presets,
  onApply,
  onSave,
  onDeletePreset,
  onEditPreset,
  onClose,
}: CustomSortBuilderProps) {
  const [levels, setLevels] = useState<SortLevel[]>(initialLevels.length > 0 ? initialLevels : [{ field: "title", direction: "asc" }]);
  const [presetName, setPresetName] = useState(initialPresetName || "");

  const usedFields = new Set(levels.map((l) => l.field));

  const updateLevel = (index: number, patch: Partial<SortLevel>) => {
    setLevels((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const removeLevel = (index: number) => {
    setLevels((prev) => prev.filter((_, i) => i !== index));
  };

  const addLevel = () => {
    const nextField = SORT_FIELDS.find((f) => !usedFields.has(f.key))?.key;
    if (!nextField) return;
    setLevels((prev) => [...prev, { field: nextField, direction: "asc" }]);
  };

  const moveLevel = (index: number, dir: -1 | 1) => {
    setLevels((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full max-h-[90vh] overflow-y-auto animate-scaleUp space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Custom Sort Builder</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Sort your catalog by any combination of fields, in the order you choose.
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

        {/* Sort Levels */}
        <div className="space-y-2">
          {levels.map((level, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700"
            >
              <span className="w-5 h-5 shrink-0 rounded-full bg-slate-800 dark:bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">
                {index + 1}
              </span>

              <select
                value={level.field}
                onChange={(e) => updateLevel(index, { field: e.target.value as SortField })}
                className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {SORT_FIELDS.filter((f) => f.key === level.field || !usedFields.has(f.key)).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => updateLevel(index, { direction: level.direction === "asc" ? "desc" : "asc" })}
                title="Toggle sort direction"
                className="shrink-0 px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                {level.direction === "asc" ? "↑ Asc" : "↓ Desc"}
              </button>

              <div className="flex flex-col shrink-0">
                <button
                  type="button"
                  onClick={() => moveLevel(index, -1)}
                  disabled={index === 0}
                  className="text-[10px] leading-none text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed px-0.5"
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveLevel(index, 1)}
                  disabled={index === levels.length - 1}
                  className="text-[10px] leading-none text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed px-0.5"
                  title="Move down"
                >
                  ▼
                </button>
              </div>

              <button
                type="button"
                onClick={() => removeLevel(index)}
                disabled={levels.length <= 1}
                title="Remove this level"
                className="shrink-0 w-6 h-6 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center text-xs font-bold"
              >
                🗑
              </button>
            </div>
          ))}

          {levels.length < MAX_SORT_LEVELS && levels.length < SORT_FIELDS.length && (
            <button
              type="button"
              onClick={addLevel}
              className="w-full py-2 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              + Add Sort Level
            </button>
          )}

          <p className="text-[10px] text-slate-500 dark:text-slate-400 px-1">
            Example: sort by <strong>Category</strong>, then by <strong>Author</strong>, to browse shelf-by-shelf within each
            category.
          </p>
        </div>

        {/* Saved Presets */}
        {presets.length > 0 && (
          <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Your Saved Sorts
            </h4>
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{preset.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {preset.levels.map((l) => fieldLabel(l.field)).join(" → ")}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEditPreset(preset)}
                    className="px-2 py-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeletePreset(preset.id)}
                    className="px-2 py-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Save / Apply */}
        <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Name this sort (optional, to save it for reuse)
            </label>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g. By Category & Author"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onApply(levels)}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-bold rounded-xl text-xs cursor-pointer"
            >
              Apply Once
            </button>
            <button
              type="button"
              disabled={!presetName.trim()}
              onClick={() => onSave(presetName.trim(), levels, initialPresetId)}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl text-xs shadow-md cursor-pointer"
            >
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { useLibrarySpace } from "../../context/LibrarySpaceContext";
import type { LibrarySpace } from "../../services/library.service";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

const COLOR_OPTIONS = [
  "#6366f1", // Indigo
  "#0ea5e9", // Sky
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#64748b", // Slate
];

export default function LibrarySpaceSwitcher() {
  const {
    spaces,
    activeSpace,
    activeSpaceId,
    setActiveSpaceId,
    createSpace,
    updateSpace,
    deleteSpace,
  } = useLibrarySpace();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingSpace, setEditingSpace] = useState<LibrarySpace | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openCreateModal = () => {
    setName("");
    setLocation("");
    setDescription("");
    setColor("#6366f1");
    setIsDefault(false);
    setError(null);
    setIsCreating(true);
    setEditingSpace(null);
  };

  const openEditModal = (space: LibrarySpace, e: React.MouseEvent) => {
    e.stopPropagation();
    setName(space.name);
    setLocation(space.location || "");
    setDescription(space.description || "");
    setColor(space.color || "#6366f1");
    setIsDefault(space.isDefault);
    setError(null);
    setEditingSpace(space);
    setIsCreating(true);
  };

  const handleSaveSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide a name for this library.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (editingSpace) {
        await updateSpace(editingSpace.id, {
          name: name.trim(),
          location: location.trim() || undefined,
          description: description.trim() || undefined,
          color,
          isDefault,
        });
      } else {
        await createSpace({
          name: name.trim(),
          location: location.trim() || undefined,
          description: description.trim() || undefined,
          color,
          isDefault,
        });
      }
      setIsCreating(false);
      setEditingSpace(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save library space.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSpace = async (space: LibrarySpace, e: React.MouseEvent) => {
    e.stopPropagation();
    const count = space.volumeCount;
    const msg =
      count > 0
        ? `Are you sure you want to delete "${space.name}"?\n\nIts ${count} cataloged books will automatically be moved to your primary Main Library.`
        : `Delete library space "${space.name}"?`;

    if (!window.confirm(msg)) return;

    try {
      await deleteSpace(space.id);
      if (activeSpaceId === space.id) {
        setActiveSpaceId("ALL");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete space.");
    }
  };

  const totalAllVolumes = spaces.reduce((sum, s) => sum + (s.volumeCount || 0), 0);
  const totalAllValue = spaces.reduce((sum, s) => sum + (s.totalValue || 0), 0);

  return (
    <div className="relative inline-block text-left font-sans">
      {/* Active Library Pill Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 bg-[#e8eef5] hover:bg-[#dce4ee] dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xs transition cursor-pointer text-xs group"
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: activeSpaceId === "ALL" ? "#6366f1" : (activeSpace?.color || "#6366f1") }}
        />
        <div className="text-left">
          <div className="font-semibold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 flex items-center gap-1">
            <span>{activeSpaceId === "ALL" ? "All Libraries" : activeSpace?.name || "Select Library"}</span>
            <span className="text-[10px] text-slate-400">▾</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            {activeSpaceId === "ALL"
              ? `${totalAllVolumes} vols • ${formatCurrency(totalAllValue)}`
              : `${activeSpace?.volumeCount || 0} vols • ${formatCurrency(activeSpace?.totalValue || 0)}`}
          </p>
        </div>
      </button>

      {/* Switcher Dropdown Popover */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[9990]" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-[#f1f5f9] dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-800 z-[9999] overflow-hidden animate-scaleUp p-3.5 space-y-3">
            <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">Your Libraries & Spaces</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">Switch or manage library spaces</p>
              </div>
              <button
                type="button"
                onClick={openCreateModal}
                className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 font-medium rounded-lg text-xs transition cursor-pointer flex items-center gap-1 border border-indigo-200 dark:border-indigo-800"
              >
                <span>+</span>
                <span>New Library</span>
              </button>
            </div>

            {/* List of Libraries */}
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {/* Option: All Libraries combined */}
              <div
                onClick={() => {
                  setActiveSpaceId("ALL");
                  setIsOpen(false);
                }}
                className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                  activeSpaceId === "ALL"
                    ? "bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-400 ring-1 ring-indigo-400"
                    : "bg-white dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-300 dark:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-semibold shadow-2xs">
                    ALL
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">All Libraries (Combined)</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                      {totalAllVolumes} volumes across all locations &bull; {formatCurrency(totalAllValue)}
                    </p>
                  </div>
                </div>
                {activeSpaceId === "ALL" && <span className="text-indigo-600 dark:text-indigo-400 font-medium text-xs">Active</span>}
              </div>

              {/* Individual Spaces */}
              {spaces.map((space) => {
                const isActive = activeSpaceId === space.id;
                return (
                  <div
                    key={space.id}
                    onClick={() => {
                      setActiveSpaceId(space.id);
                      setIsOpen(false);
                    }}
                    className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between group ${
                      isActive
                        ? "bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-400 ring-1 ring-indigo-400"
                        : "bg-white dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] shadow-2xs shrink-0 text-white font-semibold"
                        style={{ backgroundColor: space.color || "#6366f1" }}
                      >
                        {space.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate">{space.name}</h4>
                          {space.isDefault && (
                            <span className="text-[9px] font-normal px-1.5 py-0.2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate">
                          {space.location ? `${space.location} • ` : ""}
                          {space.volumeCount} vols &bull; {formatCurrency(space.totalValue)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={(e) => openEditModal(space, e)}
                        className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-medium transition"
                        title="Edit Space"
                      >
                        Edit
                      </button>
                      {!space.isDefault && spaces.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSpace(space, e)}
                          className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg text-xs font-bold transition"
                          title="Delete Space"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Create / Edit Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm animate-fadeIn" onClick={() => setIsCreating(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 z-10 animate-scaleUp space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {editingSpace ? `Edit "${editingSpace.name}"` : "Create New Library Space"}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Organize books by physical room, separate building, or client office.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs font-bold">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveSpace} className="space-y-4 text-xs">
              <div>
                <label className="block font-black text-slate-900 dark:text-white mb-1">
                  Library Space Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Downtown Office, Vacation Cabin, Master Study"
                  required
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white font-bold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-black text-slate-900 dark:text-white mb-1">
                  Physical Address / Location (Optional)
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. 100 Main St, Suite 400 or Home 2nd Floor"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Color Theme Selector */}
              <div>
                <label className="block font-black text-slate-900 dark:text-white mb-1.5">
                  Color Accent
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition cursor-pointer ${
                        color === c ? "ring-3 ring-indigo-500 scale-110" : "hover:scale-105 opacity-80"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-black text-slate-900 dark:text-white mb-1">
                  Description / Notes (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Notes about this library space, insurance policy number, etc."
                  rows={2}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black shadow-md transition"
                >
                  {submitting ? "Saving…" : editingSpace ? "Save Changes" : "Create Library"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

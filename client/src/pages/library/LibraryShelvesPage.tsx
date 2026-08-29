import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import SurfaceCard from "../../components/ui/SurfaceCard";
import {
  fetchShelves,
  createShelf,
  deleteShelf,
  fetchLibraryVolumes,
  type LibraryShelfLocation,
  type LibraryVolume,
} from "../../services/library.service";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export default function LibraryShelvesPage() {
  const [shelves, setShelves] = useState<LibraryShelfLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShelf, setSelectedShelf] = useState<LibraryShelfLocation | null>(null);
  const [shelfVolumes, setShelfVolumes] = useState<LibraryVolume[]>([]);
  const [loadingVolumes, setLoadingVolumes] = useState(false);

  // New Shelf Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [bookcaseName, setBookcaseName] = useState("");
  const [shelfName, setShelfName] = useState("");
  const [capacity, setCapacity] = useState("30");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadShelves = async () => {
    setLoading(true);
    try {
      const list = await fetchShelves();
      setShelves(list);
      if (list.length > 0 && !selectedShelf) {
        setSelectedShelf(list[0]);
      }
    } catch (err) {
      console.warn("fetchShelves error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadShelves();
  }, []);

  // When selected shelf changes, load its volumes
  useEffect(() => {
    if (selectedShelf) {
      setLoadingVolumes(true);
      void fetchLibraryVolumes({ shelfLocationId: selectedShelf.id, limit: 100 })
        .then((res) => setShelfVolumes(res.items))
        .catch(() => setShelfVolumes([]))
        .finally(() => setLoadingVolumes(false));
    } else {
      setShelfVolumes([]);
    }
  }, [selectedShelf]);

  const handleCreateShelf = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomName.trim() || !bookcaseName.trim() || !shelfName.trim()) return;

    setIsSubmitting(true);
    try {
      const newShelf = await createShelf({
        roomName: roomName.trim(),
        bookcaseName: bookcaseName.trim(),
        shelfName: shelfName.trim(),
        capacity: parseInt(capacity, 10) || 30,
        description: description.trim() || undefined,
      });
      setIsModalOpen(false);
      setRoomName("");
      setBookcaseName("");
      setShelfName("");
      setDescription("");
      setCapacity("30");
      void loadShelves();
      setSelectedShelf(newShelf);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create shelf.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteShelf = async (shelf: LibraryShelfLocation) => {
    const confirmed = window.confirm(
      `Delete shelf "${shelf.fullLocationLabel}"?\n\nAny volumes on this shelf will remain in your catalog as Unassigned.`
    );
    if (!confirmed) return;

    try {
      await deleteShelf(shelf.id);
      if (selectedShelf?.id === shelf.id) setSelectedShelf(null);
      void loadShelves();
    } catch (err) {
      alert("Failed to delete shelf location.");
    }
  };

  // Group shelves by Room
  const roomsMap = shelves.reduce<Record<string, LibraryShelfLocation[]>>((acc, s) => {
    if (!acc[s.roomName]) acc[s.roomName] = [];
    acc[s.roomName].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <SurfaceCard className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 text-xl font-bold shadow-sm">
              🗄️
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Shelves & Rooms Organizer</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Map your books to physical rooms, bookcases, and shelf levels with visual capacity tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>➕ Add Room / Shelf</span>
            </button>
          </div>
        </div>

        {/* Quick Summary Pill Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          <div className="px-3.5 py-1.5 bg-slate-100 rounded-xl border border-slate-200 font-bold text-slate-700">
            Total Rooms: <span className="text-slate-950 font-black">{Object.keys(roomsMap).length}</span>
          </div>
          <div className="px-3.5 py-1.5 bg-indigo-50 rounded-xl border border-indigo-200 font-bold text-indigo-800">
            Total Shelves: <span className="text-indigo-950 font-black">{shelves.length}</span>
          </div>
          <div className="px-3.5 py-1.5 bg-emerald-50 rounded-xl border border-emerald-200 font-bold text-emerald-800">
            Tracked Value on Shelves:{" "}
            <span className="text-emerald-950 font-black">
              {formatCurrency(shelves.reduce((sum, s) => sum + (s.totalValue || 0), 0))}
            </span>
          </div>
        </div>
      </SurfaceCard>

      {/* Main Grid: Left Shelves Directory, Right Shelf Volumes (5 / 7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Room & Bookcase Tree (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <SurfaceCard className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>📍</span> Shelf Locations
              </h2>
              <span className="text-xs text-slate-400 font-medium">{shelves.length} Total</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs">Loading shelf directory...</div>
            ) : shelves.length === 0 ? (
              <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl space-y-2">
                <span className="text-3xl block">🗄️</span>
                <p className="text-xs font-bold text-slate-700">No shelf locations created yet.</p>
                <p className="text-[11px] text-slate-500">Click "Add Room / Shelf" above to organize your physical space!</p>
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(roomsMap).map(([room, roomShelves]) => (
                  <div key={room} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-black text-slate-900 bg-slate-100/80 px-3 py-1.5 rounded-xl">
                      <span>🚪</span>
                      <span>{room}</span>
                      <span className="text-[10px] text-slate-500 font-normal ml-auto">
                        {roomShelves.length} {roomShelves.length === 1 ? "shelf" : "shelves"}
                      </span>
                    </div>

                    <div className="space-y-2 pl-2">
                      {roomShelves.map((shelf) => {
                        const isSelected = selectedShelf?.id === shelf.id;
                        return (
                          <div
                            key={shelf.id}
                            onClick={() => setSelectedShelf(shelf)}
                            className={`p-3 rounded-xl border transition cursor-pointer flex flex-col gap-2 ${
                              isSelected
                                ? "bg-indigo-50/70 border-indigo-300 shadow-xs"
                                : "bg-white hover:bg-slate-50 border-slate-200/80"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h4 className="text-xs font-bold text-slate-900">
                                  {shelf.bookcaseName} &gt; {shelf.shelfName}
                                </h4>
                                {shelf.description && (
                                  <p className="text-[10px] text-slate-500 line-clamp-1">{shelf.description}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteShelf(shelf);
                                }}
                                className="text-slate-400 hover:text-rose-600 text-xs px-1"
                                title="Delete shelf"
                              >
                                ✕
                              </button>
                            </div>

                            {/* Capacity Progress Bar */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                                <span>{shelf.volumeCount ?? 0} / {shelf.capacity} Books ({shelf.percentFull ?? 0}%)</span>
                                <span className="font-bold text-emerald-700">{formatCurrency(shelf.totalValue)}</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    (shelf.percentFull ?? 0) > 90
                                      ? "bg-rose-500"
                                      : (shelf.percentFull ?? 0) > 70
                                      ? "bg-amber-500"
                                      : "bg-indigo-600"
                                  }`}
                                  style={{ width: `${Math.min(100, shelf.percentFull ?? 0)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SurfaceCard>
        </div>

        {/* Right Column: Volumes currently sitting on selected shelf (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {selectedShelf ? (
            <SurfaceCard className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>📖</span> Books in {selectedShelf.fullLocationLabel}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {shelfVolumes.length} volumes &bull; Total Value: {formatCurrency(selectedShelf.totalValue)}
                  </p>
                </div>
                <Link
                  to={`/library/scan`}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200"
                >
                  + Scan into this Shelf
                </Link>
              </div>

              {loadingVolumes ? (
                <div className="p-8 text-center text-slate-400 text-xs">Loading shelf books...</div>
              ) : shelfVolumes.length === 0 ? (
                <div className="p-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl space-y-2">
                  <span className="text-3xl block">📚</span>
                  <p className="text-xs font-bold text-slate-700">This shelf is currently empty.</p>
                  <p className="text-[11px] text-slate-500">Scan books into this shelf or assign existing volumes in the Catalog!</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {shelfVolumes.map((vol) => (
                    <div
                      key={vol.id}
                      className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col justify-between space-y-2"
                    >
                      <div className="w-full aspect-[2/3] bg-white rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center shadow-2xs">
                        {vol.coverUrl ? (
                          <img src={vol.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl">📖</span>
                        )}
                      </div>
                      <div>
                        <h4 className="text-[11px] font-bold text-slate-900 line-clamp-2">{vol.title}</h4>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">{vol.author || "Unknown"}</p>
                      </div>
                      <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[10px]">
                        <span className="font-mono font-bold text-indigo-700">
                          {vol.deweyDecimal ? `DDC ${vol.deweyDecimal}` : "--"}
                        </span>
                        <span className="font-bold text-emerald-700">{formatCurrency(vol.replacementValue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SurfaceCard>
          ) : (
            <SurfaceCard className="p-12 text-center text-slate-400 space-y-2">
              <span className="text-4xl block">🗄️</span>
              <p className="text-sm font-bold text-slate-700">Select a shelf location from the left</p>
              <p className="text-xs text-slate-500">Click on any room or bookcase shelf to view all sitting volumes.</p>
            </SurfaceCard>
          )}
        </div>
      </div>

      {/* Add Shelf Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateShelf}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <span>🗄️</span> Create New Shelf Location
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Room Name *</label>
              <input
                type="text"
                required
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Living Room, Study, Home Office"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Bookcase / Unit *</label>
              <input
                type="text"
                required
                value={bookcaseName}
                onChange={(e) => setBookcaseName(e.target.value)}
                placeholder="e.g. Oak Bookcase A, North Wall Unit"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Shelf Level *</label>
                <input
                  type="text"
                  required
                  value={shelfName}
                  onChange={(e) => setShelfName(e.target.value)}
                  placeholder="e.g. Shelf 1 (Top), Middle Shelf"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Capacity (Books)</label>
                <input
                  type="number"
                  min="1"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Notes / Genre (Optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Sci-Fi & Fantasy Hardcovers"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs"
              >
                {isSubmitting ? "Creating..." : "Create Shelf"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

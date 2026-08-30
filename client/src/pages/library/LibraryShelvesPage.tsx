import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import LibrarySpaceSwitcher from "../../components/library/LibrarySpaceSwitcher";
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

const ROOM_COLORS: Record<string, { bg: string; dot: string; ring: string }> = {
  "Study Room": { bg: "bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800", dot: "bg-blue-600", ring: "ring-blue-400" },
  "Living Room": { bg: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-600", ring: "ring-emerald-400" },
  "Bedside TBR": { bg: "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800", dot: "bg-amber-600", ring: "ring-amber-400" },
  "Rare Stacks": { bg: "bg-purple-50 dark:bg-purple-950/30 text-purple-800 dark:text-purple-200 border-purple-200 dark:border-purple-800", dot: "bg-purple-600", ring: "ring-purple-400" },
  "Audiobooks": { bg: "bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-800", dot: "bg-sky-600", ring: "ring-sky-400" },
  "Wishlist": { bg: "bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800", dot: "bg-rose-600", ring: "ring-rose-400" },
};

function getRoomBadge(roomName: string) {
  return ROOM_COLORS[roomName] || {
    bg: "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700",
    dot: "bg-slate-500",
    ring: "ring-slate-400",
  };
}

export default function LibraryShelvesPage() {
  const [shelves, setShelves] = useState<LibraryShelfLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShelf, setSelectedShelf] = useState<LibraryShelfLocation | null>(null);
  const [shelfVolumes, setShelfVolumes] = useState<LibraryVolume[]>([]);
  const [loadingVolumes, setLoadingVolumes] = useState(false);
  const [activeRoomFilter, setActiveRoomFilter] = useState<string>("ALL");

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
    } catch {
      alert("Failed to delete shelf location.");
    }
  };

  // Group shelves by Room
  const roomsMap = shelves.reduce<Record<string, LibraryShelfLocation[]>>((acc, s) => {
    if (!acc[s.roomName]) acc[s.roomName] = [];
    acc[s.roomName].push(s);
    return acc;
  }, {});

  const roomNames = Object.keys(roomsMap);
  const filteredShelves = activeRoomFilter === "ALL" 
    ? shelves 
    : shelves.filter((s) => s.roomName === activeRoomFilter);

  const totalCapacity = shelves.reduce((sum, s) => sum + (s.capacity || 0), 0);
  const totalOccupied = shelves.reduce((sum, s) => sum + (s.volumeCount || 0), 0);
  const totalValueOnShelves = shelves.reduce((sum, s) => sum + (s.totalValue || 0), 0);

  return (
    <div className="space-y-6 pb-24 font-sans max-w-4xl mx-auto">
      {/* 1. Header Bar: Location Switcher & Action */}
      <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
        <LibrarySpaceSwitcher />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium text-xs rounded-2xl transition shadow-2xs cursor-pointer flex items-center gap-1.5"
          >
            <span>+ Add Shelf</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary Stat Cards (Matching Home Style) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Rooms
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">
            {roomNames.length}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Physical spaces
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Shelves
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">
            {shelves.length}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Bookcase tiers
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Shelf Capacity
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-indigo-400">
            {totalOccupied} / {totalCapacity}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            {totalCapacity > 0 ? `${Math.round((totalOccupied / totalCapacity) * 100)}% utilized` : "No capacity defined"}
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Tracked Value
          </p>
          <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
            {formatCurrency(totalValueOnShelves)}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            On active shelves
          </p>
        </div>
      </div>

      {/* 3. Room Quick Filters (Pills) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveRoomFilter("ALL")}
          className={`px-4 py-1.5 rounded-full text-xs font-medium tracking-tight shrink-0 transition cursor-pointer ${
            activeRoomFilter === "ALL"
              ? "bg-slate-800 dark:bg-indigo-600 text-white shadow-sm"
              : "bg-[#e2e8f0] hover:bg-[#cbd5e1] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 shadow-2xs"
          }`}
        >
          All Rooms ({shelves.length})
        </button>
        {roomNames.map((room) => {
          const badge = getRoomBadge(room);
          const isSelected = activeRoomFilter === room;
          return (
            <button
              key={room}
              type="button"
              onClick={() => setActiveRoomFilter(room)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium tracking-tight shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? "bg-slate-800 dark:bg-indigo-600 text-white shadow-sm"
                  : `${badge.bg} border shadow-2xs hover:opacity-90`
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : badge.dot}`} />
              <span>{room}</span>
              <span className="opacity-70 text-[10px]">({roomsMap[room].length})</span>
            </button>
          );
        })}
      </div>

      {/* 4. Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Shelves Directory (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">
                Shelf Locations
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                {filteredShelves.length} Shelves
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs">Loading shelf directory...</div>
            ) : filteredShelves.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">No shelf locations created yet.</p>
                <p className="text-[11px] text-slate-500">Click "+ Add Shelf" above to organize your physical space.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                {filteredShelves.map((shelf) => {
                  const isSelected = selectedShelf?.id === shelf.id;
                  const percent = shelf.percentFull ?? 0;
                  return (
                    <div
                      key={shelf.id}
                      onClick={() => setSelectedShelf(shelf)}
                      className={`p-3 rounded-2xl border transition cursor-pointer flex flex-col gap-2 ${
                        isSelected
                          ? "bg-white dark:bg-slate-700 border-slate-400 dark:border-indigo-500 shadow-xs ring-1 ring-slate-300 dark:ring-indigo-500"
                          : "bg-white/70 dark:bg-slate-800/70 hover:bg-white dark:hover:bg-slate-700 border-slate-300 dark:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 font-medium">{shelf.roomName} &bull;</span>
                            <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {shelf.bookcaseName} &gt; {shelf.shelfName}
                            </h4>
                          </div>
                          {shelf.description && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                              {shelf.description}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteShelf(shelf);
                          }}
                          className="text-slate-400 hover:text-rose-600 text-xs px-1 transition cursor-pointer"
                          title="Delete shelf"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Capacity Meter Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                          <span>{shelf.volumeCount ?? 0} / {shelf.capacity} Books ({percent}%)</span>
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(shelf.totalValue)}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              percent > 90
                                ? "bg-rose-500"
                                : percent > 70
                                ? "bg-amber-500"
                                : "bg-emerald-600"
                            }`}
                            style={{ width: `${Math.min(100, percent)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Volumes sitting on selected shelf (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          {selectedShelf ? (
            <div className="p-4 sm:p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedShelf.fullLocationLabel}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                    {shelfVolumes.length} volumes &bull; Total Value: {formatCurrency(selectedShelf.totalValue)}
                  </p>
                </div>
                <Link
                  to="/library/quick-scan"
                  className="px-3 py-1.5 bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-800 dark:text-slate-200 font-medium text-xs rounded-xl border border-slate-300 dark:border-slate-600 shadow-2xs transition"
                >
                  + Scan into Shelf
                </Link>
              </div>

              {loadingVolumes ? (
                <div className="p-12 text-center text-slate-500 text-xs">Loading shelf books...</div>
              ) : shelfVolumes.length === 0 ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl space-y-2">
                  <p className="text-xs font-semibold text-slate-800 dark:text-white">This shelf is currently empty.</p>
                  <p className="text-[11px] text-slate-500">Scan books directly into this shelf or assign existing volumes in the Catalog.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {shelfVolumes.map((vol, idx) => (
                    <div
                      key={vol.id}
                      className="bg-white dark:bg-slate-700/60 rounded-2xl p-2.5 shadow-2xs border border-slate-300 dark:border-slate-600 flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-12 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-600 flex items-center justify-center">
                          {vol.coverUrl ? (
                            <img src={vol.coverUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[9px] font-medium text-slate-500">BOOK</span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {vol.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate mt-0.5">
                            {vol.author || "Unknown Author"}
                          </p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                            <span>{vol.deweyDecimal ? `DDC ${vol.deweyDecimal}` : "General"}</span>
                            <span>•</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              {formatCurrency(vol.rareMarketValue || vol.replacementValue)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg shrink-0">
                        #{idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 text-center text-slate-500 space-y-1 shadow-xs">
              <p className="text-xs font-semibold text-slate-800 dark:text-white">Select a shelf location from the left</p>
              <p className="text-[11px] text-slate-500">Click on any shelf to browse all volumes sitting on that tier.</p>
            </div>
          )}
        </div>
      </div>

      {/* 5. Add Shelf Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateShelf}
            className="bg-[#f8fafc] dark:bg-slate-900 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Create New Shelf Location
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Room Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Study Room, Living Room, Bedside TBR"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Bookcase *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. North Wall Case A"
                    value={bookcaseName}
                    onChange={(e) => setBookcaseName(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Shelf Tier *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shelf 1 (Top)"
                    value={shelfName}
                    onChange={(e) => setShelfName(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Capacity (Books)</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Notes / Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Vintage leatherbound fiction & philosophy"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium rounded-xl transition cursor-pointer"
              >
                {isSubmitting ? "Creating..." : "Create Shelf Location"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

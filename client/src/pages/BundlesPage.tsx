import { useEffect, useMemo, useState, type FormEvent } from "react";
import SurfaceCard from "../components/ui/SurfaceCard";
import SyncStatusIndicator from "../components/common/SyncStatusIndicator";
import {
  fetchBundles,
  searchBundlingItems,
  previewBundlePricing,
  createBundle,
  unbundle,
  type AvailableBundleItem,
} from "../services/bundle.service";
import type {
  ProductBundle,
  BundlePricingSuggestion,
} from "@colophon/shared";

const TOPIC_OPTIONS = [
  "All",
  "Science Fiction",
  "Fantasy",
  "Mystery & Thriller",
  "Philosophy & Religion",
  "Self-Help & Psychology",
  "History",
  "Biography & Memoir",
  "Literary Fiction",
  "Romance",
  "Horror",
  "Art & Photography",
  "Science & Nature",
  "Business & Economics",
  "Children's Books",
  "Young Adult",
  "Poetry & Drama",
  "Cooking & Food",
  "Travel & Adventure",
  "Crafts & Hobbies",
];

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

export default function BundlesPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<"builder" | "active">("builder");

  // Search & Filter state
  const [selectedTopic, setSelectedTopic] = useState("All");
  const [authorQuery, setAuthorQuery] = useState("");
  const [titleQuery, setTitleQuery] = useState("");
  const [keywordQuery, setKeywordQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AvailableBundleItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Selected items in bundle draft
  const [selectedItems, setSelectedItems] = useState<AvailableBundleItem[]>([]);

  // Bundle metadata & pricing draft
  const [bundleTitle, setBundleTitle] = useState("");
  const [bundleTopic, setBundleTopic] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  const [customPriceInput, setCustomPriceInput] = useState("");
  const [isCreatingBundle, setIsCreatingBundle] = useState(false);

  // Active bundles state
  const [activeBundles, setActiveBundles] = useState<ProductBundle[]>([]);
  const [bundlesLoading, setBundlesLoading] = useState(false);
  const [unbundlingId, setUnbundlingId] = useState<string | null>(null);

  // Notifications
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Calculate live pricing suggestion whenever selected items change
  const pricingSuggestion: BundlePricingSuggestion = useMemo(() => {
    const prices = selectedItems.map((i) => i.listPrice || 9.99);
    const total = prices.reduce((sum, p) => sum + p, 0);
    if (total <= 0) {
      return {
        totalIndividualPrice: 0,
        discountPercent: 10,
        discountedPrice: 0,
        suggestedBundlePrice: 9.99,
        savingsAmount: 0,
        savingsPercent: 10,
      };
    }
    const tenPercentOff = total * 0.90;
    let nearestPoint99 = Math.round(tenPercentOff) - 0.01;
    if (nearestPoint99 < 0.99) nearestPoint99 = 0.99;

    const suggested = Number(nearestPoint99.toFixed(2));
    const savings = Number(Math.max(0, total - suggested).toFixed(2));
    const savingsPct = Number(((savings / total) * 100).toFixed(1));

    return {
      totalIndividualPrice: Number(total.toFixed(2)),
      discountPercent: 10,
      discountedPrice: Number(tenPercentOff.toFixed(2)),
      suggestedBundlePrice: suggested,
      savingsAmount: savings,
      savingsPercent: savingsPct,
    };
  }, [selectedItems]);

  // Sync custom price input with suggested price when selection changes
  useEffect(() => {
    if (selectedItems.length > 0) {
      setCustomPriceInput(String(pricingSuggestion.suggestedBundlePrice));
      
      // Auto-suggest a smart title if user hasn't typed a custom one
      if (!bundleTitle || bundleTitle.startsWith("Curated") || bundleTitle.includes("Bundle")) {
        const topicName = selectedTopic !== "All" ? selectedTopic : (selectedItems[0]?.category || "Curated");
        const authors = Array.from(new Set(selectedItems.map((i) => i.author).filter(Boolean)));
        const primaryAuthor = authors.length === 1 ? `${authors[0]} Collection` : "";
        const autoTitle = primaryAuthor
          ? `${primaryAuthor} (${selectedItems.length} Books)`
          : `${topicName} Book Bundle (${selectedItems.length} Books)`;
        setBundleTitle(autoTitle);
        setBundleTopic(topicName);
      }
    } else {
      setCustomPriceInput("");
      setBundleTitle("");
    }
  }, [selectedItems, pricingSuggestion.suggestedBundlePrice, selectedTopic]);

  // Load available items on initial mount & topic change
  const handleSearch = async (event?: FormEvent): Promise<void> => {
    if (event) event.preventDefault();
    setSearchLoading(true);
    setErrorMessage(null);
    try {
      const items = await searchBundlingItems({
        topic: selectedTopic !== "All" ? selectedTopic : undefined,
        author: authorQuery.trim() || undefined,
        title: titleQuery.trim() || undefined,
        query: keywordQuery.trim() || undefined,
      });
      setSearchResults(items);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to search inventory.");
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    void handleSearch();
  }, [selectedTopic]);

  // Load active bundles
  const loadActiveBundles = async (): Promise<void> => {
    setBundlesLoading(true);
    try {
      const bundles = await fetchBundles("ACTIVE");
      setActiveBundles(bundles);
    } catch (err) {
      console.warn("Failed to load bundles:", err);
    } finally {
      setBundlesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "active") {
      void loadActiveBundles();
    }
  }, [activeTab]);

  // Toggle single item selection
  const handleToggleItem = (item: AvailableBundleItem): void => {
    setSelectedItems((prev) => {
      const exists = prev.some((i) => i.isbn === item.isbn);
      if (exists) {
        return prev.filter((i) => i.isbn !== item.isbn);
      }
      return [...prev, item];
    });
  };

  // Remove item from draft cart
  const handleRemoveSelectedItem = (isbn: string): void => {
    setSelectedItems((prev) => prev.filter((i) => i.isbn !== isbn));
  };

  // Select all search results
  const handleSelectAllVisible = (): void => {
    const newItems = searchResults.filter((res) => !selectedItems.some((s) => s.isbn === res.isbn));
    setSelectedItems((prev) => [...prev, ...newItems]);
  };

  // Clear selected items
  const handleClearSelection = (): void => {
    setSelectedItems([]);
  };

  // Handle bundle creation
  const handleCreateBundle = async (): Promise<void> => {
    if (selectedItems.length < 2) {
      setErrorMessage("Please select at least 2 books to create a bundle.");
      return;
    }

    const priceNum = parseFloat(customPriceInput);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setErrorMessage("Please enter a valid bundle price.");
      return;
    }

    setIsCreatingBundle(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const newBundle = await createBundle({
        title: bundleTitle.trim() || undefined,
        topic: bundleTopic.trim() || (selectedTopic !== "All" ? selectedTopic : undefined),
        description: bundleDescription.trim() || undefined,
        customBundlePrice: priceNum,
        items: selectedItems.map((item) => ({
          isbn: item.isbn,
          sku: item.sku,
          title: item.title,
          author: item.author,
          coverUrl: item.coverUrl,
          condition: item.condition,
          listPrice: item.listPrice,
          category: item.category,
          subcategory: item.subcategory,
        })),
      });

      setSuccessMessage(`Successfully created "${newBundle.title}" (SKU: ${newBundle.parentSku}) with ${newBundle.items.length} titles for ${formatCurrency(newBundle.bundlePrice)}!`);
      setSelectedItems([]);
      setBundleTitle("");
      setBundleDescription("");
      void handleSearch();
      void loadActiveBundles();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to create bundle.");
    } finally {
      setIsCreatingBundle(false);
    }
  };

  // Handle Unbundle
  const handleUnbundle = async (bundle: ProductBundle): Promise<void> => {
    const confirmed = window.confirm(
      `Are you sure you want to dissolve "${bundle.title}"?\n\nAll ${bundle.items.length} titles will immediately be returned to individual active inventory.`
    );
    if (!confirmed) return;

    setUnbundlingId(bundle.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await unbundle(bundle.id);
      setSuccessMessage(res.message);
      void loadActiveBundles();
      void handleSearch();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to unbundle.");
    } finally {
      setUnbundlingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <SurfaceCard>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 w-full pb-5 mb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xl font-bold shadow-inner">
                📦
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  Product Bundling Studio
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                    10% Off · Nearest .99
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Group titles by topic, author, or series into parent bundle SKUs with automated value pricing
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SyncStatusIndicator />
            <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab("builder")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "builder"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>📦 Bundle Builder</span>
                {selectedItems.length > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500 text-slate-950 font-bold">
                    {selectedItems.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("active")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "active"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>🗂️ Active Bundles</span>
                {activeBundles.length > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-700 text-slate-200 font-bold">
                    {activeBundles.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
        {/* Banner Messages */}
        {errorMessage && (
          <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between animate-fadeIn">
            <span className="flex items-center gap-2">
              <span className="text-sm">⚠️</span> {errorMessage}
            </span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-rose-200 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
            <span className="flex items-center gap-2">
              <span className="text-sm">✨</span> {successMessage}
            </span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-400 hover:text-emerald-200 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab 1: Bundle Builder */}
        {activeTab === "builder" && (
          <div className="space-y-6">
            {/* Multi-Criteria Search Filter Bar */}
            <form
              onSubmit={handleSearch}
              className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                  <span>🔍</span> Search Available Inventory for Bundling
                </span>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Showing {searchResults.length} eligible titles in stock</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Topic / Genre dropdown */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Topic / Genre</label>
                  <select
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
                  >
                    {TOPIC_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t === "All" ? "All Topics & Genres" : t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Author search */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Author</label>
                  <input
                    type="text"
                    value={authorQuery}
                    onChange={(e) => setAuthorQuery(e.target.value)}
                    placeholder="e.g. Stephen King, Herbert"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                {/* Title search */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Title</label>
                  <input
                    type="text"
                    value={titleQuery}
                    onChange={(e) => setTitleQuery(e.target.value)}
                    placeholder="e.g. Dune, Fellowship"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                {/* Keyword search & action */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Keyword / ISBN</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={keywordQuery}
                      onChange={(e) => setKeywordQuery(e.target.value)}
                      placeholder="e.g. Hardcover, 978..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      type="submit"
                      disabled={searchLoading}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-colors shrink-0 flex items-center gap-1.5"
                    >
                      {searchLoading ? (
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span>Search</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>

            {/* Split Builder Layout: Inventory Picker (Left) & Bundle Cart (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Inventory Items Picker */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span>Click books below to add them to your bundle draft:</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSelectAllVisible}
                      className="text-amber-400 hover:text-amber-300 font-semibold"
                    >
                      + Select All Visible
                    </button>
                    {selectedItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="text-slate-400 hover:text-slate-200"
                      >
                        Clear Selection ({selectedItems.length})
                      </button>
                    )}
                  </div>
                </div>

                {searchLoading ? (
                  <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800 flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    <span>Searching active inventory...</span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
                    <span className="text-3xl block mb-2">📚</span>
                    <p className="text-sm font-semibold text-slate-300">No unbundled inventory items match your search.</p>
                    <p className="text-xs text-slate-500 mt-1">Try broadening your criteria or selecting "All Topics".</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[620px] overflow-y-auto pr-1">
                    {searchResults.map((item) => {
                      const isSelected = selectedItems.some((s) => s.isbn === item.isbn);
                      return (
                        <div
                          key={item.isbn}
                          onClick={() => handleToggleItem(item)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex gap-3 select-none ${
                            isSelected
                              ? "bg-amber-500/15 border-amber-500/50 shadow-md shadow-amber-500/5 ring-1 ring-amber-500/30"
                              : "bg-slate-900/50 border-slate-800/80 hover:bg-slate-900/90 hover:border-slate-700"
                          }`}
                        >
                          {/* Thumbnail / Cover */}
                          <div className="w-14 h-20 bg-slate-950 rounded-lg overflow-hidden shrink-0 border border-slate-800 flex items-center justify-center">
                            {item.coverUrl ? (
                              <img
                                src={item.coverUrl}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <span className="text-xl">📖</span>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              <div className="flex items-start justify-between gap-1">
                                <h3 className="text-xs font-semibold text-slate-200 line-clamp-2 leading-snug">
                                  {item.title}
                                </h3>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // handled by parent div onClick
                                  className="accent-amber-500 rounded mt-0.5"
                                />
                              </div>
                              <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.author || "Unknown Author"}</p>
                              {item.category && (
                                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-medium">
                                  {item.category}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/60">
                              <span className="text-xs font-bold text-amber-400">
                                {formatCurrency(item.listPrice)}
                              </span>
                              <span className="text-[10px] text-slate-500">Qty: {item.quantityOnHand}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Bundle Staging Cart & Pricing Box */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">✨</span>
                      <h2 className="text-sm font-bold text-slate-200">Curated Bundle Draft</h2>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                      {selectedItems.length} Titles Selected
                    </span>
                  </div>

                  {/* Selected Item Chips */}
                  {selectedItems.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                      <span className="text-2xl block mb-1.5">📦</span>
                      <p className="text-xs font-semibold text-slate-400">Your bundle draft is empty.</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Select at least 2 books from the left to start.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {selectedItems.map((item) => (
                        <div
                          key={item.isbn}
                          className="flex items-center justify-between gap-2 p-2 bg-slate-950/80 rounded-lg border border-slate-800/80 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {item.coverUrl ? (
                              <img src={item.coverUrl} alt="" className="w-6 h-8 object-cover rounded shrink-0" />
                            ) : (
                              <span className="w-6 h-8 bg-slate-900 rounded flex items-center justify-center text-xs shrink-0">📖</span>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-200 truncate">{item.title}</p>
                              <p className="text-[10px] text-slate-400 truncate">{item.author || "Unknown Author"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-medium text-slate-300">{formatCurrency(item.listPrice)}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSelectedItem(item.isbn)}
                              className="text-slate-500 hover:text-rose-400 text-sm font-bold px-1"
                              title="Remove from draft"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Live Pricing Math Breakdown Box */}
                  <div className="p-3.5 bg-slate-950/90 rounded-xl border border-amber-500/20 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Total Individual Price Sum:</span>
                      <span className="text-slate-200 font-medium">
                        {formatCurrency(pricingSuggestion.totalIndividualPrice)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-emerald-400">
                      <span className="flex items-center gap-1">
                        <span>🏷️</span> Bundle Discount (10% Off):
                      </span>
                      <span className="font-semibold">
                        -{formatCurrency(pricingSuggestion.savingsAmount)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-amber-400/90 block font-semibold">Suggested Bundle Price</span>
                        <span className="text-[10px] text-slate-500">(Nearest ending in .99)</span>
                      </div>
                      <span className="text-lg font-extrabold text-amber-300">
                        {formatCurrency(pricingSuggestion.suggestedBundlePrice)}
                      </span>
                    </div>

                    {pricingSuggestion.savingsAmount > 0 && (
                      <div className="text-[11px] text-center text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded py-1 font-medium">
                        Customer saves {formatCurrency(pricingSuggestion.savingsAmount)} ({pricingSuggestion.savingsPercent}%) vs. individual purchase!
                      </div>
                    )}
                  </div>

                  {/* Bundle Configuration Form */}
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Bundle Title <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={bundleTitle}
                        onChange={(e) => setBundleTitle(e.target.value)}
                        placeholder="e.g. Isaac Asimov Classic Sci-Fi Bundle"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">Topic / Category</label>
                        <input
                          type="text"
                          value={bundleTopic}
                          onChange={(e) => setBundleTopic(e.target.value)}
                          placeholder="e.g. Science Fiction"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Bundle Price ($) <span className="text-amber-400 font-normal">(Editable)</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.99"
                          value={customPriceInput}
                          onChange={(e) => setCustomPriceInput(e.target.value)}
                          placeholder="26.99"
                          className="w-full bg-slate-950 border border-amber-500/40 rounded-lg px-3 py-2 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="button"
                      disabled={selectedItems.length < 2 || isCreatingBundle}
                      onClick={handleCreateBundle}
                      className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg ${
                        selectedItems.length < 2 || isCreatingBundle
                          ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50"
                          : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/20 active:scale-[0.99]"
                      }`}
                    >
                      {isCreatingBundle ? (
                        <>
                          <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                          <span>Creating Parent SKU & Reserving Stock...</span>
                        </>
                      ) : (
                        <>
                          <span>📦 Create Product Bundle ({selectedItems.length} Books)</span>
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-center text-slate-500 leading-normal">
                      Creating a bundle reserves the individual items so they are sold only as a single set. You can unbundle at any time.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Active Bundles */}
        {activeTab === "active" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <span>🗂️</span> Active Curated Bundles
              </h2>
              <button
                type="button"
                onClick={loadActiveBundles}
                disabled={bundlesLoading}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
              >
                <span>🔄 Refresh</span>
              </button>
            </div>

            {bundlesLoading ? (
              <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800 flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span>Loading active bundles...</span>
              </div>
            ) : activeBundles.length === 0 ? (
              <div className="p-12 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
                <span className="text-3xl block mb-2">📦</span>
                <p className="text-sm font-semibold text-slate-300">No active bundles created yet.</p>
                <p className="text-xs text-slate-500 mt-1">Switch to the Bundle Builder tab to create your first multi-book bundle!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeBundles.map((bundle) => (
                  <div
                    key={bundle.id}
                    className="p-4 bg-slate-900/70 rounded-2xl border border-slate-800 hover:border-slate-700/80 transition-all space-y-3.5 shadow-lg"
                  >
                    {/* Header: Title & Badges */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {bundle.parentSku}
                          </span>
                          {bundle.topic && (
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-800 text-slate-300">
                              {bundle.topic}
                            </span>
                          )}
                          <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {bundle.items.length} Books
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-100 line-clamp-1">{bundle.title}</h3>
                      </div>

                      {/* Pricing badge */}
                      <div className="text-right shrink-0">
                        <span className="text-base font-extrabold text-amber-300 block">
                          {formatCurrency(bundle.bundlePrice)}
                        </span>
                        <span className="text-[10px] text-slate-500 line-through">
                          {formatCurrency(bundle.originalTotalPrice)}
                        </span>
                      </div>
                    </div>

                    {/* Child Book Thumbnails Grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80">
                      {bundle.items.map((child) => (
                        <div key={child.id} className="space-y-1">
                          <div className="w-full h-24 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                            {child.coverUrl ? (
                              <img src={child.coverUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-lg">📖</span>
                            )}
                          </div>
                          <p className="text-[10px] font-semibold text-slate-300 truncate">{child.title}</p>
                          <p className="text-[9px] text-slate-500 truncate">{child.author || "Unknown"}</p>
                        </div>
                      ))}
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-[11px] text-slate-400">
                        Created {new Date(bundle.createdAt).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        disabled={unbundlingId === bundle.id}
                        onClick={() => handleUnbundle(bundle)}
                        className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/30 font-semibold rounded-lg transition-all flex items-center gap-1.5"
                      >
                        {unbundlingId === bundle.id ? (
                          <>
                            <div className="w-3 h-3 border border-rose-300 border-t-transparent rounded-full animate-spin" />
                            <span>Restoring Items...</span>
                          </>
                        ) : (
                          <>
                            <span>🔓 Unbundle & Restore</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}

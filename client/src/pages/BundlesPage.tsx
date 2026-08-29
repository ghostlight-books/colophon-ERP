import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import SurfaceCard from "../components/ui/SurfaceCard";
import SyncStatusIndicator from "../components/common/SyncStatusIndicator";
import {
  fetchBundles,
  searchBundlingItems,
  createBundle,
  unbundle,
  syncBundleToShopify,
  syncAllBundlesToShopify,
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

  const location = useLocation();

  // Selected items in bundle draft
  const [selectedItems, setSelectedItems] = useState<AvailableBundleItem[]>(() => {
    const preloaded = (location.state as { preselectedItems?: AvailableBundleItem[] } | null)?.preselectedItems;
    return Array.isArray(preloaded) && preloaded.length > 0 ? preloaded : [];
  });

  // Also listen to location state changes if navigating again
  useEffect(() => {
    const preloaded = (location.state as { preselectedItems?: AvailableBundleItem[] } | null)?.preselectedItems;
    if (Array.isArray(preloaded) && preloaded.length > 0) {
      setSelectedItems(preloaded);
      setActiveTab("builder");
    }
  }, [location.state]);

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
  const [syncingShopifyId, setSyncingShopifyId] = useState<string | null>(null);
  const [isSyncingAllShopify, setIsSyncingAllShopify] = useState(false);

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
      if (!bundleTitle || bundleTitle.startsWith("Curated") || bundleTitle.includes("Bundle") || bundleTitle.includes("Collection")) {
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

    const parsedPrice = parseFloat(customPriceInput);
    const finalPrice = Number.isFinite(parsedPrice) && parsedPrice > 0
      ? parsedPrice
      : (pricingSuggestion.suggestedBundlePrice > 0 ? pricingSuggestion.suggestedBundlePrice : 9.99);

    const defaultTopic = selectedTopic !== "All" ? selectedTopic : (selectedItems[0]?.category || "Curated");
    const finalTopic = bundleTopic.trim() || defaultTopic;

    const defaultTitle = `${finalTopic} Book Bundle (${selectedItems.length} Books)`;
    const finalTitle = bundleTitle.trim() || defaultTitle;

    setIsCreatingBundle(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const newBundle = await createBundle({
        title: finalTitle,
        topic: finalTopic,
        description: bundleDescription.trim() || undefined,
        customBundlePrice: finalPrice,
        items: selectedItems.map((item) => ({
          isbn: item.isbn,
          sku: item.sku || `ITEM-${item.isbn}`,
          title: item.title || "Untitled Book",
          author: item.author,
          coverUrl: item.coverUrl,
          condition: item.condition || "Good",
          listPrice: item.listPrice || 9.99,
          category: item.category || finalTopic,
          subcategory: item.subcategory,
        })),
      });

      setSuccessMessage(`Successfully created "${newBundle.title}" (SKU: ${newBundle.parentSku}) with ${newBundle.items.length} titles for ${formatCurrency(newBundle.bundlePrice)}!`);
      setSelectedItems([]);
      setBundleTitle("");
      setBundleDescription("");
      void handleSearch();
      void loadActiveBundles();
      setActiveTab("active");
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

  // Handle Shopify Sync for Single Bundle
  const handleSyncBundleToShopify = async (bundle: ProductBundle): Promise<void> => {
    setSyncingShopifyId(bundle.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await syncBundleToShopify(bundle.id);
      setSuccessMessage(`Successfully published "${bundle.title}" (SKU: ${bundle.parentSku}) to Shopify / Ecommerce!`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to sync bundle to Shopify.");
    } finally {
      setSyncingShopifyId(null);
    }
  };

  // Handle Shopify Sync for All Active Bundles
  const handleSyncAllBundlesToShopify = async (): Promise<void> => {
    if (activeBundles.length === 0) return;
    setIsSyncingAllShopify(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await syncAllBundlesToShopify();
      setSuccessMessage(res.message || `Successfully synced ${res.synced} bundles to Shopify!`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to sync all bundles to Shopify.");
    } finally {
      setIsSyncingAllShopify(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card matching Colophon ERP Light Theme */}
      <SurfaceCard className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 text-xl font-bold shadow-sm">
                📦
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  Product Bundling Studio
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200/80">
                    10% Off · Nearest .99
                  </span>
                </h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  Curate multi-book sets by topic, author, or series into parent bundle SKUs with automated value pricing
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SyncStatusIndicator />
            {/* Clean Tab Switcher */}
            <div className="flex rounded-2xl bg-slate-100 p-1 border border-slate-200/80">
              <button
                type="button"
                onClick={() => setActiveTab("builder")}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === "builder"
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>📦 Bundle Builder</span>
                {selectedItems.length > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500 text-white font-bold">
                    {selectedItems.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("active")}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === "active"
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200/60"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>🗂️ Active Bundles</span>
                {activeBundles.length > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200 text-slate-700 font-bold">
                    {activeBundles.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Banner Messages */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between shadow-sm animate-fadeIn">
            <span className="flex items-center gap-2 font-medium">
              <span className="text-sm">⚠️</span> {errorMessage}
            </span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-600 hover:text-rose-900 font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between shadow-sm animate-fadeIn">
            <span className="flex items-center gap-2 font-medium">
              <span className="text-sm">✓</span> {successMessage}
            </span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-900 font-bold ml-2"
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
              className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3 shadow-inner"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <span>🔍</span> Filter Available Inventory for Bundling
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {searchResults.length} eligible in-stock items
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Topic / Genre dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Topic / Genre</label>
                  <select
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-sm"
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Author</label>
                  <input
                    type="text"
                    value={authorQuery}
                    onChange={(e) => setAuthorQuery(e.target.value)}
                    placeholder="e.g. Stephen King, Herbert"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-sm"
                  />
                </div>

                {/* Title search */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={titleQuery}
                    onChange={(e) => setTitleQuery(e.target.value)}
                    placeholder="e.g. Dune, Fellowship"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-sm"
                  />
                </div>

                {/* Keyword search & action */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Keyword / ISBN</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={keywordQuery}
                      onChange={(e) => setKeywordQuery(e.target.value)}
                      placeholder="e.g. Hardcover, 978..."
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-sm"
                    />
                    <button
                      type="submit"
                      disabled={searchLoading}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition shadow-sm shrink-0 flex items-center gap-1.5"
                    >
                      {searchLoading ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
              {/* Left Column: Inventory Items Picker (7 cols) */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                  <span>Click books to select them for your bundle:</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSelectAllVisible}
                      className="text-amber-700 hover:text-amber-800 font-bold"
                    >
                      + Select All Visible
                    </button>
                    {selectedItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="text-slate-500 hover:text-slate-800 font-medium"
                      >
                        Clear Selection ({selectedItems.length})
                      </button>
                    )}
                  </div>
                </div>

                {searchLoading ? (
                  <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-medium">Searching active inventory...</span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
                    <span className="text-3xl block mb-2">📚</span>
                    <p className="text-sm font-bold text-slate-800">No unbundled inventory items match your search.</p>
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
                          className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex gap-3 select-none ${
                            isSelected
                              ? "bg-amber-50/90 border-amber-400 shadow-md ring-2 ring-amber-400/40"
                              : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-sm"
                          }`}
                        >
                          {/* Thumbnail / Cover */}
                          <div className="w-14 h-20 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
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
                                <h3 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                                  {item.title}
                                </h3>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // handled by card onClick
                                  className="accent-amber-600 rounded mt-0.5 cursor-pointer"
                                />
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-0.5">{item.author || "Unknown Author"}</p>
                              {item.category && (
                                <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                                  {item.category}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100">
                              <span className="text-sm font-extrabold text-amber-700">
                                {formatCurrency(item.listPrice)}
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium">Qty: {item.quantityOnHand}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Bundle Staging Cart & Pricing Box (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">✨</span>
                      <h2 className="text-sm font-bold text-slate-900">Curated Bundle Draft</h2>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
                        Bundle Qty: 1
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200/80">
                        {selectedItems.length} Books
                      </span>
                    </div>
                  </div>

                  {/* Selected Item Chips */}
                  {selectedItems.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <span className="text-3xl block mb-1.5">📦</span>
                      <p className="text-xs font-bold text-slate-700">Your bundle draft is empty.</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Select at least 2 books from the left to start.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                      {selectedItems.map((item) => (
                        <div
                          key={item.isbn}
                          className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {item.coverUrl ? (
                              <img src={item.coverUrl} alt="" className="w-7 h-9 object-cover rounded shadow-xs shrink-0" />
                            ) : (
                              <span className="w-7 h-9 bg-slate-200 rounded flex items-center justify-center text-xs shrink-0">📖</span>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{item.title}</p>
                              <p className="text-[11px] text-slate-500 truncate">{item.author || "Unknown Author"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-bold text-slate-800">{formatCurrency(item.listPrice)}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSelectedItem(item.isbn)}
                              className="text-slate-400 hover:text-rose-600 text-sm font-bold px-1"
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
                  <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200/80 space-y-2.5 shadow-xs">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>Total Individual Price Sum:</span>
                      <span className="text-slate-900 font-bold">
                        {formatCurrency(pricingSuggestion.totalIndividualPrice)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-emerald-800">
                      <span className="flex items-center gap-1 font-semibold">
                        <span>🏷️</span> Bundle Discount (10% Off):
                      </span>
                      <span className="font-bold">
                        -{formatCurrency(pricingSuggestion.savingsAmount)}
                      </span>
                    </div>

                    <div className="pt-2.5 border-t border-amber-200/80 flex items-center justify-between">
                      <div>
                        <span className="text-xs text-amber-900 block font-bold">Suggested Bundle Price</span>
                        <span className="text-[11px] text-slate-500">(Nearest ending in .99)</span>
                      </div>
                      <span className="text-2xl font-black text-amber-700">
                        {formatCurrency(pricingSuggestion.suggestedBundlePrice)}
                      </span>
                    </div>

                    {pricingSuggestion.savingsAmount > 0 && (
                      <div className="text-xs text-center text-emerald-800 bg-emerald-100/80 border border-emerald-200 rounded-xl py-1.5 font-bold">
                        Customer saves {formatCurrency(pricingSuggestion.savingsAmount)} ({pricingSuggestion.savingsPercent}%) vs. individual purchase!
                      </div>
                    )}
                  </div>

                  {/* Bundle Configuration Form */}
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Bundle Title <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={bundleTitle}
                        onChange={(e) => setBundleTitle(e.target.value)}
                        placeholder="e.g. Isaac Asimov Classic Sci-Fi Bundle"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-medium shadow-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">Topic / Category</label>
                        <input
                          type="text"
                          value={bundleTopic}
                          onChange={(e) => setBundleTopic(e.target.value)}
                          placeholder="e.g. Science Fiction"
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          Bundle Price ($) <span className="text-slate-500 font-normal">(Editable)</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.99"
                          value={customPriceInput}
                          onChange={(e) => setCustomPriceInput(e.target.value)}
                          placeholder="26.99"
                          className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-xs text-amber-800 font-extrabold focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-sm"
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="button"
                      disabled={selectedItems.length < 2 || isCreatingBundle}
                      onClick={handleCreateBundle}
                      className={`w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-sm ${
                        selectedItems.length < 2 || isCreatingBundle
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                          : "bg-amber-600 hover:bg-amber-700 text-white active:scale-[0.99]"
                      }`}
                    >
                      {isCreatingBundle ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Creating Parent SKU & Reserving Stock...</span>
                        </>
                      ) : (
                        <>
                          <span>📦 Create Product Bundle ({selectedItems.length} Books)</span>
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-center text-slate-500 leading-normal">
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
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 flex-wrap gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>🗂️</span> Active Curated Bundles ({activeBundles.length})
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncAllBundlesToShopify}
                  disabled={isSyncingAllShopify || activeBundles.length === 0}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl transition shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                  title="Publish and sync all active bundles to Shopify"
                >
                  {isSyncingAllShopify ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Syncing to Shopify...</span>
                    </>
                  ) : (
                    <>
                      <span>🛍️ Sync All to Shopify</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={loadActiveBundles}
                  disabled={bundlesLoading}
                  className="text-xs text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1"
                >
                  <span>🔄 Refresh</span>
                </button>
              </div>
            </div>

            {bundlesLoading ? (
              <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium">Loading active bundles...</span>
              </div>
            ) : activeBundles.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-3xl block mb-2">📦</span>
                <p className="text-sm font-bold text-slate-800">No active bundles created yet.</p>
                <p className="text-xs text-slate-500 mt-1">Switch to the Bundle Builder tab to create your first multi-book bundle!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeBundles.map((bundle) => (
                  <div
                    key={bundle.id}
                    className="p-5 bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 hover:shadow-md transition space-y-4"
                  >
                    {/* Header: Title & Badges */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            {bundle.parentSku}
                          </span>
                          {bundle.topic && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700">
                              {bundle.topic}
                            </span>
                          )}
                          <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                            Qty: 1
                          </span>
                          <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {bundle.items.length}-Book Set
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{bundle.title}</h3>
                      </div>

                      {/* Pricing badge */}
                      <div className="text-right shrink-0">
                        <span className="text-lg font-black text-amber-700 block">
                          {formatCurrency(bundle.bundlePrice)}
                        </span>
                        <span className="text-xs text-slate-400 line-through">
                          {formatCurrency(bundle.originalTotalPrice)}
                        </span>
                      </div>
                    </div>

                    {/* Child Book Thumbnails Grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                      {bundle.items.map((child) => (
                        <div key={child.id} className="space-y-1">
                          <div className="w-full h-24 bg-white rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center shadow-2xs">
                            {child.coverUrl ? (
                              <img src={child.coverUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-lg">📖</span>
                            )}
                          </div>
                          <p className="text-[11px] font-bold text-slate-800 truncate">{child.title}</p>
                          <p className="text-[10px] text-slate-500 truncate">{child.author || "Unknown"}</p>
                        </div>
                      ))}
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between pt-1 text-xs flex-wrap gap-2">
                      <span className="text-xs text-slate-500 font-medium">
                        Created {new Date(bundle.createdAt).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={syncingShopifyId === bundle.id}
                          onClick={() => handleSyncBundleToShopify(bundle)}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-xl transition flex items-center gap-1 shadow-2xs cursor-pointer"
                          title="Publish this bundle product and inventory to Shopify"
                        >
                          {syncingShopifyId === bundle.id ? (
                            <>
                              <div className="w-3 h-3 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
                              <span>Publishing...</span>
                            </>
                          ) : (
                            <>
                              <span>🛍️ Sync to Shopify</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={unbundlingId === bundle.id}
                          onClick={() => handleUnbundle(bundle)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl transition flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          {unbundlingId === bundle.id ? (
                            <>
                              <div className="w-3 h-3 border-2 border-rose-700 border-t-transparent rounded-full animate-spin" />
                              <span>Restoring Items...</span>
                            </>
                          ) : (
                            <>
                              <span>🔓 Unbundle</span>
                            </>
                          )}
                        </button>
                      </div>
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

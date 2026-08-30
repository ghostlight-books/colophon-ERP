import { useEffect, useState, type FormEvent } from "react";
import LibrarySpaceSwitcher from "../../components/library/LibrarySpaceSwitcher";
import {
  fetchExchangeMarketplace,
  fetchIncomingOffers,
  respondToOffer,
  submitOffer,
  type LibraryVolume,
  type LibraryOffer,
} from "../../services/library.service";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export default function LibraryExchangePage() {
  const [activeTab, setActiveTab] = useState<"incoming" | "marketplace">("incoming");

  // Incoming Offers State
  const [incomingOffers, setIncomingOffers] = useState<LibraryOffer[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);

  // Marketplace State
  const [marketplaceItems, setMarketplaceItems] = useState<LibraryVolume[]>([]);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Counter Modal State
  const [counterModalOffer, setCounterModalOffer] = useState<LibraryOffer | null>(null);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterNotes, setCounterNotes] = useState("");

  // Submit Offer Modal State (for browsing marketplace)
  const [selectedMarketVolume, setSelectedMarketVolume] = useState<LibraryVolume | null>(null);
  const [offerType, setOfferType] = useState<"CASH" | "TRADE" | "BOOKSTORE_BUY_OFFER">("CASH");
  const [offererName, setOffererName] = useState("Sarah (Bookstore & Collector)");
  const [offererEmail, setOffererEmail] = useState("owner@ghostlightbooks.com");
  const [offererStoreName, setOffererStoreName] = useState("Ghostlight Books");
  const [cashAmount, setCashAmount] = useState("");
  const [tradeDetails, setTradeDetails] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);

  const loadOffers = async () => {
    setLoadingOffers(true);
    try {
      const list = await fetchIncomingOffers();
      setIncomingOffers(list);
    } catch (err) {
      console.warn("fetchIncomingOffers error:", err);
    } finally {
      setLoadingOffers(false);
    }
  };

  const loadMarketplace = async () => {
    setLoadingMarket(true);
    try {
      const items = await fetchExchangeMarketplace({
        query: searchQuery || undefined,
        status: statusFilter || undefined,
      });
      setMarketplaceItems(items);
    } catch (err) {
      console.warn("fetchExchangeMarketplace error:", err);
    } finally {
      setLoadingMarket(false);
    }
  };

  useEffect(() => {
    void loadOffers();
  }, []);

  useEffect(() => {
    if (activeTab === "marketplace") {
      void loadMarketplace();
    }
  }, [activeTab, statusFilter]);

  const handleRespond = async (
    offerId: string,
    action: "ACCEPT" | "COUNTER" | "DECLINE" | "COMPLETE",
    amount?: number,
    notes?: string
  ) => {
    try {
      await respondToOffer(offerId, action, amount, notes);
      setCounterModalOffer(null);
      void loadOffers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update offer.");
    }
  };

  const handleSubmitOffer = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedMarketVolume) return;

    setIsSubmittingOffer(true);
    try {
      await submitOffer({
        volumeId: selectedMarketVolume.id,
        offerType,
        offererName: offererName.trim(),
        offererEmail: offererEmail.trim(),
        offererStoreName: offererStoreName.trim() || undefined,
        cashOfferAmount: cashAmount ? parseFloat(cashAmount) : undefined,
        offeredTradeItemsJson: tradeDetails.trim() || undefined,
        notes: offerNotes.trim() || undefined,
      });
      alert(`Offer successfully submitted for "${selectedMarketVolume.title}"!`);
      setSelectedMarketVolume(null);
      setCashAmount("");
      setTradeDetails("");
      setOfferNotes("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit offer.");
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  const pendingOffers = incomingOffers.filter((o) => o.status === "PENDING");
  const completedDeals = incomingOffers.filter((o) => o.status === "ACCEPTED" || o.status === "COMPLETED");

  return (
    <div className="space-y-6 pb-24 font-sans max-w-4xl mx-auto">
      {/* 1. Location Switcher & View Switcher */}
      <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
        <LibrarySpaceSwitcher />

        {/* Tab Navigation (Matching Grid/List toggle style) */}
        <div className="flex items-center p-1 bg-[#e8eef5] dark:bg-slate-800 rounded-2xl shadow-2xs border border-slate-300 dark:border-slate-700 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("incoming")}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "incoming"
                ? "bg-slate-800 dark:bg-indigo-600 text-white shadow-xs font-semibold"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white"
            }`}
          >
            <span>Incoming Offers</span>
            {pendingOffers.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-semibold ${activeTab === "incoming" ? "bg-rose-500 text-white" : "bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200"}`}>
                {pendingOffers.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("marketplace")}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
              activeTab === "marketplace"
                ? "bg-slate-800 dark:bg-indigo-600 text-white shadow-xs font-semibold"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white"
            }`}
          >
            <span>Network Marketplace</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary Metric Cards (Matching Home Style) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Pending Offers
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white">
            {pendingOffers.length}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Awaiting your response
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Completed Deals
          </p>
          <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
            {completedDeals.length}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Accepted trades & sales
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Partner Network
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-sky-400">
            Active
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Independent bookshops
          </p>
        </div>

        <div className="p-4 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Exchange Market
          </p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-indigo-400">
            {marketplaceItems.length}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
            Books open for trade
          </p>
        </div>
      </div>

      {/* TAB 1: INCOMING OFFERS */}
      {activeTab === "incoming" && (
        <div className="p-4 sm:p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">
              Incoming Offers on Your Collection ({incomingOffers.length})
            </h3>
          </div>

          {loadingOffers ? (
            <div className="p-12 text-center text-slate-500 text-xs">Loading offers...</div>
          ) : incomingOffers.length === 0 ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-white">No offers received yet.</p>
              <p className="text-[11px] text-slate-500">
                To receive offers from collectors and bookstores, mark books in your Catalog as "Allow Offers" or "Open for Trade".
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {incomingOffers.map((offer) => {
                const vol = offer.volume;
                const isPending = offer.status === "PENDING";
                const isBookstore = offer.offererType === "BOOKSTORE" || offer.offerType === "BOOKSTORE_BUY_OFFER";

                return (
                  <div
                    key={offer.id}
                    className={`p-4 rounded-2xl border transition flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                      isPending
                        ? "bg-white dark:bg-slate-700/80 border-slate-300 dark:border-slate-600 shadow-xs"
                        : "bg-white/60 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700 opacity-80"
                    }`}
                  >
                    {/* Left: Book Cover & Details */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="w-12 h-16 bg-slate-100 dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center shadow-2xs">
                        {vol?.coverUrl ? (
                          <img src={vol.coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-medium text-slate-500">BOOK</span>
                        )}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {vol?.title || "Unknown Book"}
                          </h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            offer.status === "PENDING"
                              ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                              : offer.status === "ACCEPTED"
                              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                              : offer.status === "COUNTERED"
                              ? "bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                              : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                          }`}>
                            {offer.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate">
                          {vol?.author || "Unknown"} &bull; Insured Value: {formatCurrency(vol?.replacementValue)}
                        </p>

                        {/* Offerer Info & Pitch */}
                        <div className="pt-1 text-xs space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {isBookstore ? "Bookstore Buyer:" : "Collector:"}
                            </span>
                            <span className="text-slate-900 dark:text-white font-medium">
                              {offer.offererStoreName ? `${offer.offererStoreName} (${offer.offererName})` : offer.offererName}
                            </span>
                            <span className="text-slate-400 text-[10px]">({offer.offererEmail})</span>
                          </div>

                          {offer.cashOfferAmount && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500 dark:text-slate-400 font-normal">Cash Offer:</span>
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400 text-sm">
                                {formatCurrency(offer.cashOfferAmount)}
                              </span>
                            </div>
                          )}

                          {offer.offeredTradeItemsJson && (
                            <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 text-[11px] text-amber-950 dark:text-amber-200 font-normal">
                              <span className="font-medium">Proposed Trade:</span> {offer.offeredTradeItemsJson}
                            </div>
                          )}

                          {offer.notes && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 italic">"{offer.notes}"</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Response Actions */}
                    {isPending && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0 self-end md:self-center">
                        <button
                          type="button"
                          onClick={() => handleRespond(offer.id, "ACCEPT")}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-xl transition shadow-2xs cursor-pointer"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCounterModalOffer(offer);
                            setCounterAmount(offer.cashOfferAmount ? String(offer.cashOfferAmount + 5) : "");
                          }}
                          className="px-3.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-800 dark:text-slate-200 font-medium text-xs rounded-xl border border-slate-300 dark:border-slate-600 transition cursor-pointer"
                        >
                          Counter
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRespond(offer.id, "DECLINE")}
                          className="px-3.5 py-1.5 bg-slate-200 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-medium text-xs rounded-xl transition cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BROWSE MARKETPLACE */}
      {activeTab === "marketplace" && (
        <div className="p-4 sm:p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider">
              Network Marketplace Catalog
            </h3>

            {/* Filter Bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadMarketplace()}
                placeholder="Search titles, authors..."
                className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="">All Trade & Offers</option>
                <option value="ALLOW_OFFERS">Allow Cash Offers</option>
                <option value="OPEN_FOR_TRADE">Open for Trade</option>
                <option value="FOR_SALE">For Sale</option>
              </select>
            </div>
          </div>

          {loadingMarket ? (
            <div className="p-12 text-center text-slate-500 text-xs">Loading exchange catalog...</div>
          ) : marketplaceItems.length === 0 ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-white">No volumes currently listed for exchange.</p>
              <p className="text-[11px] text-slate-500">Check back soon as collectors and bookstores list new titles.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {marketplaceItems.map((vol) => (
                <div
                  key={vol.id}
                  className="p-3.5 bg-white dark:bg-slate-700/70 rounded-2xl border border-slate-300 dark:border-slate-600 hover:shadow-md transition flex flex-col justify-between space-y-3"
                >
                  <div className="flex gap-3 items-start">
                    <div className="w-14 h-20 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center">
                      {vol.coverUrl ? (
                        <img src={vol.coverUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-medium text-slate-500">BOOK</span>
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <span className={`px-2 py-0.2 text-[9px] font-medium rounded-full inline-block ${
                        vol.listingStatus === "OPEN_FOR_TRADE"
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                          : vol.listingStatus === "ALLOW_OFFERS"
                          ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                          : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                      }`}>
                        {vol.listingStatus.replace(/_/g, " ")}
                      </span>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2">{vol.title}</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate">{vol.author || "Unknown"}</p>
                      {vol.askingPrice && (
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          Asking: {formatCurrency(vol.askingPrice)}
                        </p>
                      )}
                    </div>
                  </div>

                  {vol.tradePreferences && (
                    <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-[10.5px] text-slate-700 dark:text-slate-300">
                      <span className="font-medium text-slate-900 dark:text-white block mb-0.5">Looking to trade for:</span>
                      <p className="line-clamp-2">{vol.tradePreferences}</p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                      {vol.deweyDecimal ? `DDC ${vol.deweyDecimal}` : "--"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMarketVolume(vol);
                        setCashAmount(vol.askingPrice ? String(vol.askingPrice) : "");
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium text-xs rounded-xl transition shadow-2xs cursor-pointer"
                    >
                      Make Offer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COUNTER OFFER MODAL */}
      {counterModalOffer && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#f8fafc] dark:bg-slate-900 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp text-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Counter Offer for "{counterModalOffer.volume?.title}"
            </h3>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Counter Cash Amount ($)</label>
              <input
                type="number"
                step="0.01"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                placeholder="e.g. 45.00"
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-medium text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Counter Message / Terms</label>
              <textarea
                rows={3}
                value={counterNotes}
                onChange={(e) => setCounterNotes(e.target.value)}
                placeholder="Include shipping details, condition notes, or terms..."
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCounterModalOffer(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleRespond(
                    counterModalOffer.id,
                    "COUNTER",
                    parseFloat(counterAmount) || undefined,
                    counterNotes
                  )
                }
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium rounded-xl cursor-pointer transition"
              >
                Send Counter Offer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAKE AN OFFER MODAL (for browsing marketplace) */}
      {selectedMarketVolume && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitOffer}
            className="bg-[#f8fafc] dark:bg-slate-900 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Submit Offer / Trade Proposal
              </h3>
              <button
                type="button"
                onClick={() => setSelectedMarketVolume(null)}
                className="text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 flex items-center gap-3">
              <div className="w-10 h-14 bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                {selectedMarketVolume.coverUrl ? (
                  <img src={selectedMarketVolume.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[9px] font-medium text-slate-500">BOOK</span>
                )}
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {selectedMarketVolume.title}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate">
                  {selectedMarketVolume.author || "Unknown"}
                </p>
                {selectedMarketVolume.askingPrice && (
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    Asking: {formatCurrency(selectedMarketVolume.askingPrice)}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Offer Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOfferType("CASH")}
                    className={`py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
                      offerType === "CASH"
                        ? "bg-slate-800 dark:bg-indigo-600 text-white border-slate-800 dark:border-indigo-600"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfferType("TRADE")}
                    className={`py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
                      offerType === "TRADE"
                        ? "bg-slate-800 dark:bg-indigo-600 text-white border-slate-800 dark:border-indigo-600"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    Book Trade
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfferType("BOOKSTORE_BUY_OFFER")}
                    className={`py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
                      offerType === "BOOKSTORE_BUY_OFFER"
                        ? "bg-slate-800 dark:bg-indigo-600 text-white border-slate-800 dark:border-indigo-600"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700"
                    }`}
                  >
                    Store Buy
                  </button>
                </div>
              </div>

              {(offerType === "CASH" || offerType === "BOOKSTORE_BUY_OFFER") && (
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Cash Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required={offerType === "CASH"}
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    placeholder="e.g. 35.00"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              )}

              {offerType === "TRADE" && (
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Offered Books / Barter Items</label>
                  <textarea
                    rows={2}
                    required
                    value={tradeDetails}
                    onChange={(e) => setTradeDetails(e.target.value)}
                    placeholder="e.g. 1st Edition Steinbeck 'East of Eden' or $30 store trade credit"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Your Name & Email</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={offererName}
                    onChange={(e) => setOffererName(e.target.value)}
                    placeholder="Your Name"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none"
                  />
                  <input
                    type="email"
                    required
                    value={offererEmail}
                    onChange={(e) => setOffererEmail(e.target.value)}
                    placeholder="Your Email"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Notes / Terms</label>
                <textarea
                  rows={2}
                  value={offerNotes}
                  onChange={(e) => setOfferNotes(e.target.value)}
                  placeholder="e.g. Can meet in person or handle standard media mail shipping."
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedMarketVolume(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingOffer}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium rounded-xl transition cursor-pointer"
              >
                {isSubmittingOffer ? "Submitting..." : "Send Offer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

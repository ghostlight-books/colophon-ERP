import { useEffect, useState, type FormEvent } from "react";
import {
  fetchExchangeMarketplace,
  submitOffer,
  type LibraryVolume,
} from "../services/library.service";

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function OpenNetworkPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<"community" | "bookstores">("community");
  const [communityVolumes, setCommunityVolumes] = useState<LibraryVolume[]>([]);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Bookstore Offer Modal
  const [targetVolume, setTargetVolume] = useState<LibraryVolume | null>(null);
  const [offerCashAmount, setOfferCashAmount] = useState("");
  const [tradeCreditAmount, setTradeCreditAmount] = useState("");
  const [buyerNotes, setBuyerNotes] = useState("");
  const [submittingOffer, setSubmittingOffer] = useState(false);

  const partners = [
    { name: "Riverlight Books", status: "Connected", focus: "Inventory swaps & rare edition network" },
    { name: "Juniper Shelf", status: "Pending", focus: "Event cross-promotion" },
    { name: "Maple Street Books", status: "Connected", focus: "Shared hard-to-find requests" },
  ];

  const loadCommunityVolumes = async () => {
    setLoadingCommunity(true);
    try {
      const items = await fetchExchangeMarketplace({ query: searchQuery || undefined });
      setCommunityVolumes(items);
    } catch (err) {
      console.warn("fetchExchangeMarketplace error:", err);
    } finally {
      setLoadingCommunity(false);
    }
  };

  useEffect(() => {
    void loadCommunityVolumes();
  }, []);

  const handleMakeStoreOffer = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetVolume) return;

    setSubmittingOffer(true);
    try {
      const notes = [
        buyerNotes.trim(),
        tradeCreditAmount ? `Alternative Store Credit: $${parseFloat(tradeCreditAmount).toFixed(2)}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      await submitOffer({
        volumeId: targetVolume.id,
        offerType: "BOOKSTORE_BUY_OFFER",
        offererType: "BOOKSTORE",
        offererStoreName: "Ghostlight Books",
        offererName: "Sarah (Book Buyer)",
        offererEmail: "buying@ghostlightbooks.com",
        cashOfferAmount: offerCashAmount ? parseFloat(offerCashAmount) : undefined,
        notes: notes || undefined,
      });

      alert(`Buy offer successfully sent to the collector of "${targetVolume.title}"!`);
      setTargetVolume(null);
      setOfferCashAmount("");
      setTradeCreditAmount("");
      setBuyerNotes("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit store offer.");
    } finally {
      setSubmittingOffer(false);
    }
  };

  return (
    <section className="grid gap-4">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>🌐</span> Open Network & Collector Exchange
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Shared database for independent bookstores & community collector library discovery
            </p>
          </div>

          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab("community")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === "community"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>🏛️ Collector Libraries ({communityVolumes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("bookstores")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === "bookstores"
                  ? "bg-white text-indigo-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>🏪 Partner Bookstores</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: COMMUNITY COLLECTOR LIBRARIES */}
      {activeTab === "community" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Collector Titles Open for Offers & Trades
              </h3>
              <p className="text-xs text-slate-500">
                Independent bookstores can make store cash buy offers or store trade credit proposals directly to collectors.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadCommunityVolumes()}
                placeholder="Search collector titles, authors..."
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => void loadCommunityVolumes()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition"
              >
                Search
              </button>
            </div>
          </div>

          {loadingCommunity ? (
            <div className="p-8 text-center text-slate-400 text-xs">Scanning community network...</div>
          ) : communityVolumes.length === 0 ? (
            <div className="p-12 text-center text-slate-500 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <span className="text-3xl block">📖</span>
              <p className="text-xs font-bold text-slate-800">No community collector titles found.</p>
              <p className="text-[11px] text-slate-500">
                When collectors mark books in Colophon Library Edition as "Allow Offers" or "Open for Trade", they appear here automatically!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {communityVolumes.map((vol) => (
                <div
                  key={vol.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-300 hover:shadow-md transition flex flex-col justify-between space-y-3"
                >
                  <div className="flex gap-3 items-start">
                    <div className="w-14 h-20 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                      {vol.coverUrl ? (
                        <img src={vol.coverUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xl">📖</span>
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <span className="px-2 py-0.2 text-[9px] font-bold rounded bg-indigo-100 text-indigo-900 border border-indigo-200 inline-block">
                        {vol.listingStatus.replace(/_/g, " ")}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-2">{vol.title}</h4>
                      <p className="text-[11px] text-slate-500 truncate">{vol.author || "Unknown Author"}</p>
                      {vol.askingPrice && (
                        <p className="text-xs font-black text-emerald-700">
                          Asking: {formatCurrency(vol.askingPrice)}
                        </p>
                      )}
                    </div>
                  </div>

                  {vol.tradePreferences && (
                    <div className="p-2 bg-amber-50 rounded-xl border border-amber-200 text-[10.5px] text-amber-950">
                      <span className="font-bold block">Collector Wants:</span>
                      <p className="line-clamp-2">{vol.tradePreferences}</p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-[10.5px] font-mono text-indigo-700 font-bold">
                      {vol.deweyDecimal ? `DDC ${vol.deweyDecimal}` : "--"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetVolume(vol);
                        setOfferCashAmount(vol.askingPrice ? String((vol.askingPrice * 0.6).toFixed(2)) : "");
                        setTradeCreditAmount(vol.askingPrice ? String((vol.askingPrice * 0.8).toFixed(2)) : "");
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-2xs cursor-pointer"
                    >
                      🏪 Make Store Buy Offer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PARTNER BOOKSTORES */}
      {activeTab === "bookstores" && (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Partner Stores</h3>
            <div className="mt-4 space-y-3">
              {partners.map((partner) => (
                <article key={partner.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-base font-semibold text-slate-800">{partner.name}</h4>
                    <span
                      className={[
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        partner.status === "Connected" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                      ].join(" ")}
                    >
                      {partner.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{partner.focus}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Network Activity</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Active Stores</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-800">18</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Collector Volumes Discovered</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-800">{communityVolumes.length}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Open Buy Proposals</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-800">4</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOOKSTORE BUY OFFER MODAL */}
      {targetVolume && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleMakeStoreOffer}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase">Bookstore Inventory Purchase</span>
                <h3 className="text-sm font-black text-slate-900">
                  Send Buy Offer for "{targetVolume.title}"
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTargetVolume(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
              <p className="text-slate-700">
                <span className="font-bold">Author:</span> {targetVolume.author || "Unknown"}
              </p>
              <p className="text-slate-700">
                <span className="font-bold">Appraised Value:</span> {formatCurrency(targetVolume.replacementValue)}
              </p>
              {targetVolume.askingPrice && (
                <p className="text-slate-700">
                  <span className="font-bold">Collector Asking:</span> {formatCurrency(targetVolume.askingPrice)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Store Cash Offer ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={offerCashAmount}
                  onChange={(e) => setOfferCashAmount(e.target.value)}
                  placeholder="e.g. 24.00"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Store Trade Credit ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={tradeCreditAmount}
                  onChange={(e) => setTradeCreditAmount(e.target.value)}
                  placeholder="e.g. 35.00"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Buyer Notes & Instructions for Collector</label>
              <textarea
                rows={2}
                value={buyerNotes}
                onChange={(e) => setBuyerNotes(e.target.value)}
                placeholder="Include shipping instructions, bookstore drop-off address, or payout terms..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setTargetVolume(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingOffer}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition cursor-pointer"
              >
                {submittingOffer ? "Sending..." : "Submit Store Buy Offer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default OpenNetworkPage;

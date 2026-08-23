import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import SurfaceCard from "../components/ui/SurfaceCard";
import { addPosCustomCartItem } from "../services/posRegister.service";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
const USPS_FLAT_RATE = 9.99;
const partnerStores = [
  { name: "Riverlight Books", street: "18 River Street", line2: "", city: "Portland", state: "ME", zip: "04101" },
  { name: "Maple Street Books", street: "220 Maple Street", line2: "", city: "Boston", state: "MA", zip: "02108" },
];

function savedAddress(key: string): string {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(key) ?? "";
}

function savedAddressField(key: string, index: number): string {
  return savedAddress(key).split("\n")[index] ?? "";
}

function NetworkOrderRequestPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [partnerStoreName, setPartnerStoreName] = useState(params.get("partner") ?? partnerStores[0].name);
  const [isbn] = useState(params.get("isbn") ?? "");
  const [title] = useState(params.get("title") ?? "");
  const [coverUrl] = useState(params.get("cover") ?? "");
  const [requestedPrice, setRequestedPrice] = useState(params.get("price") ?? "");
  const [shippingFee, setShippingFee] = useState(String(USPS_FLAT_RATE));
  const [fulfillmentTarget, setFulfillmentTarget] = useState<"store" | "customer">("store");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState(() => savedAddress("colophon-customer-address"));
  const [storeAddress, setStoreAddress] = useState(() => savedAddress("colophon-store-address"));
  const savedKey = fulfillmentTarget === "store" ? "colophon-store-address" : "colophon-customer-address";
  const [recipientStreet, setRecipientStreet] = useState(() => savedAddressField(savedKey, 0));
  const [recipientLine2, setRecipientLine2] = useState(() => savedAddressField(savedKey, 1));
  const [recipientCity, setRecipientCity] = useState(() => savedAddressField(savedKey, 2).split(",")[0] ?? "");
  const [recipientState, setRecipientState] = useState(() => savedAddressField(savedKey, 2).match(/,\s*([A-Za-z]{2})\s/)?.[1] ?? "");
  const [recipientZip, setRecipientZip] = useState(() => savedAddressField(savedKey, 2).match(/\s(\d{5}(?:-\d{4})?)$/)?.[1] ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const key = fulfillmentTarget === "store" ? "colophon-store-address" : "colophon-customer-address";
    const saved = savedAddress(key).split("\n");
    const locality = saved[2] ?? "";
    setRecipientStreet(saved[0] ?? "");
    setRecipientLine2(saved[1] ?? "");
    setRecipientCity(locality.split(",")[0] ?? "");
    setRecipientState(locality.match(/,\s*([A-Za-z]{2})\s/)?.[1] ?? "");
    setRecipientZip(locality.match(/\s(\d{5}(?:-\d{4})?)$/)?.[1] ?? "");
    setShippingFee(String(USPS_FLAT_RATE));
  }, [fulfillmentTarget]);

  const partner = partnerStores.find((store) => store.name === partnerStoreName) ?? partnerStores[0];
  const multipleAvailable = true;
  const markup = multipleAvailable ? Number((Number(requestedPrice || 0) * 0.2).toFixed(2)) : 0;
  const totalCost = Number((Number(requestedPrice || 0) + markup + Number(shippingFee || 0)).toFixed(2));

  function recalculateShipping(): void {
    setShippingFee(String(USPS_FLAT_RATE));
  }

  function composedAddress(): string {
    return [recipientStreet, recipientLine2, `${recipientCity}, ${recipientState} ${recipientZip}`].filter(Boolean).join("\n");
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/open-network/order-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerStoreName, isbn, title, requestedPrice: Number(requestedPrice) + markup, shippingFee: Number(shippingFee), fulfillmentTarget, customerName, customerEmail, customerAddress: composedAddress(), destinationAddress: composedAddress() }),
      });
      const result = (await response.json()) as { error?: string; id?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Order request could not be saved.");
      }
      await addPosCustomCartItem({ id: `network-${isbn}`, title, option: `Order from ${partnerStoreName}`, unitPrice: totalCost });
      window.localStorage.setItem(fulfillmentTarget === "store" ? "colophon-store-address" : "colophon-customer-address", composedAddress());
      setMessage(`Order request ${result.id ?? "created"} added to the POS cart.`);
      navigate("/pos-register");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Order request could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid gap-4">
      <SurfaceCard className="p-5">
        <button type="button" onClick={() => navigate("/inventory")} className="text-sm font-semibold text-sky-700">Back to Inventory</button>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Open Network order</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-800">Order from Store</h2>
        <p className="mt-1 text-sm text-slate-500">Request an item from a partner store and choose where it should be fulfilled.</p>
      </SurfaceCard>

      <form onSubmit={(event) => void submit(event)} className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <SurfaceCard className="p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Order details</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-[112px_1fr]">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {coverUrl ? <img src={coverUrl} alt={`Cover of ${title}`} className="aspect-[3/4] h-full w-full object-cover" /> : <div className="grid aspect-[3/4] place-items-center p-3 text-center text-xs font-semibold text-slate-400">No cover available</div>}
            </div>
            <div className="grid content-start gap-3">
              <label className="grid gap-1 text-sm text-slate-600">Buy from<select required value={partnerStoreName} onChange={(event) => setPartnerStoreName(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3">{partnerStores.map((store) => <option key={store.name} value={store.name}>{store.name} · {store.city}, {store.state}</option>)}</select></label>
              <label className="grid gap-1 text-sm text-slate-600">Title<input readOnly value={title} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3" /></label>
              <label className="grid gap-1 text-sm text-slate-600">Barcode / ISBN<input readOnly value={isbn} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3" /></label>
              <label className="grid gap-1 text-sm text-slate-600">Item price<input required type="number" min="0" step="0.01" value={requestedPrice} onChange={(event) => setRequestedPrice(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label>
            </div>
          </div>
        </SurfaceCard>
        <SurfaceCard className="grid content-start gap-3 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fulfillment</h3>
          <label className="grid gap-1 text-sm text-slate-600">Ship to<select value={fulfillmentTarget} onChange={(event) => setFulfillmentTarget(event.target.value as "store" | "customer")} className="h-10 rounded-xl border border-slate-200 bg-white px-3"><option value="store">Our store</option><option value="customer">Directly to customer</option></select></label>
          {fulfillmentTarget === "customer" ? <label className="grid gap-1 text-sm text-slate-600">Customer name<input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label> : null}
          {fulfillmentTarget === "customer" ? <label className="grid gap-1 text-sm text-slate-600">Customer email<input type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label> : null}
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm text-slate-600 sm:col-span-2">{fulfillmentTarget === "store" ? "Store name" : "Recipient name"}<input required value={fulfillmentTarget === "store" ? "Ghostlight Books" : customerName} onChange={(event) => fulfillmentTarget === "customer" ? setCustomerName(event.target.value) : undefined} readOnly={fulfillmentTarget === "store"} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><label className="grid gap-1 text-sm text-slate-600 sm:col-span-2">Street address<input required value={recipientStreet} onChange={(event) => setRecipientStreet(event.target.value)} placeholder="Street address" className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><label className="grid gap-1 text-sm text-slate-600 sm:col-span-2">Address line 2<input value={recipientLine2} onChange={(event) => setRecipientLine2(event.target.value)} placeholder="Suite, unit, or floor" className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><label className="grid gap-1 text-sm text-slate-600">City<input required value={recipientCity} onChange={(event) => setRecipientCity(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><label className="grid gap-1 text-sm text-slate-600">State<input required maxLength={2} value={recipientState} onChange={(event) => setRecipientState(event.target.value.toUpperCase())} className="h-10 rounded-xl border border-slate-200 bg-white px-3 uppercase" /></label><label className="grid gap-1 text-sm text-slate-600">ZIP<input required value={recipientZip} onChange={(event) => setRecipientZip(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label></div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><p>USPS Flat Rate shipping: <strong>${Number(shippingFee).toFixed(2)}</strong></p><p>Network markup: <strong>{multipleAvailable ? "20%" : "None"}</strong> because multiple partner stores are available.</p><p className="mt-1 text-base font-semibold text-slate-800">Estimated total: ${totalCost.toFixed(2)}</p><p className="mt-1 text-xs text-slate-400">Flat-rate shipping applies regardless of recipient location.</p></div>
          {fulfillmentTarget === "customer" ? <button type="button" onClick={recalculateShipping} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">Recalculate shipping</button> : null}
          <button type="submit" disabled={saving} className="mt-2 h-11 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Ordering..." : "Order from Store"}</button>
          {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        </SurfaceCard>
      </form>
    </section>
  );
}

export default NetworkOrderRequestPage;
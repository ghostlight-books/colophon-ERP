import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import SurfaceCard from "../components/ui/SurfaceCard";

type Product = {
  id: string;
  isbn: string;
  title: string | null;
  author: string | null;
  publisher: string | null;
  description: string | null;
  coverUrl: string | null;
  thriftbooksPrice: number | null;
  listPrice: number | null;
  category: string | null;
  subcategory: string | null;
  mediaType: string;
  sku: string;
  catalogTags: string | null;
  seoKeywords: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  quantityOnHand: number;
};

type ProductResponse = { product: Product; similar: Product[]; partnerAvailability: string };
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
const tagOptions = ["Rare", "Signed", "First Edition"];

function ProductPage(): JSX.Element {
  const { isbn = "" } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [similar, setSimilar] = useState<Product[]>([]);
  const [partnerAvailability, setPartnerAvailability] = useState("");
  const [draft, setDraft] = useState<Partial<Product>>({});
  const [message, setMessage] = useState("Loading product...");
  const [saving, setSaving] = useState(false);
  const [pullingMetadata, setPullingMetadata] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/inventory/products/${encodeURIComponent(isbn)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Product not found");
        return (await response.json()) as ProductResponse;
      })
      .then((payload) => { setProduct(payload.product); setDraft(payload.product); setSimilar(payload.similar); setPartnerAvailability(payload.partnerAvailability); setMessage("Product loaded."); })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Product could not be loaded."));
  }, [isbn]);

  function updateField(field: keyof Product, value: string): void {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function generateSeo(): void {
    const title = draft.title ?? product?.title ?? "Book";
    const author = draft.author ?? product?.author ?? "";
    const category = draft.category ?? product?.category ?? "books";
    const subcategory = draft.subcategory ?? product?.subcategory ?? "";
    const seoTitle = `${title}${author ? ` by ${author}` : ""}`;
    const seoDescription = `Shop ${title}${author ? ` by ${author}` : ""} at Ghostlight Books. Explore ${category}${subcategory ? ` and ${subcategory}` : ""}.`;
    setDraft((current) => ({ ...current, seoTitle: seoTitle.length > 60 ? `${seoTitle.slice(0, 57).trimEnd()}...` : seoTitle, seoDescription: seoDescription.length > 155 ? `${seoDescription.slice(0, 152).trimEnd()}...` : seoDescription, seoKeywords: [...new Set([title, author, category, subcategory, "independent bookstore"].filter(Boolean))].join(", ") }));
    setMessage("SEO fields generated. Review them before saving.");
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/inventory/products/${encodeURIComponent(isbn)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      if (!response.ok) throw new Error("Product could not be saved.");
      const saved = (await response.json()) as Product;
      setProduct(saved); setDraft(saved); setMessage("Product details saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Product could not be saved."); }
    finally { setSaving(false); }
  }

  async function removeFromInventory(): Promise<void> {
    if (!window.confirm(`Remove all on-hand units of ${product?.title ?? isbn} from active inventory?`)) return;
    try {
      const response = await fetch(`${API_BASE}/inventory/products/${encodeURIComponent(isbn)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Inventory item could not be removed.");
      setProduct((current) => current ? { ...current, quantityOnHand: 0 } : current);
      setMessage("Product removed from active inventory.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Inventory item could not be removed."); }
  }

  async function pullOpenLibrary(): Promise<void> {
    setPullingMetadata(true);
    try {
      const response = await fetch(`${API_BASE}/inventory/products/${encodeURIComponent(isbn)}/pull-open-library`, { method: "POST" });
      const metadata = (await response.json()) as Partial<Product> & { error?: string };
      if (!response.ok) throw new Error(metadata.error ?? "Open Library metadata could not be loaded.");
      setDraft((current) => ({ ...current, ...metadata }));
      setMessage("Open Library fields loaded. Review them, then save the product.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Open Library metadata could not be loaded.");
    } finally {
      setPullingMetadata(false);
    }
  }

  if (!product) return <section className="grid gap-4"><SurfaceCard className="p-5"><button type="button" onClick={() => navigate("/inventory")} className="text-sm font-semibold text-sky-700">Back to Inventory</button><p className="mt-5 text-sm text-slate-500">{message}</p></SurfaceCard></section>;
  const tags = (draft.catalogTags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);

  return <section className="grid gap-4">
    <SurfaceCard className="p-5"><button type="button" onClick={() => navigate("/inventory")} className="text-sm font-semibold text-sky-700">Back to Inventory</button><div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Product record</p><h2 className="mt-1 text-2xl font-semibold text-slate-800">{product.title ?? "Untitled product"}</h2><p className="mt-1 text-sm text-slate-500">SKU {product.sku} · ISBN {product.isbn}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void pullOpenLibrary()} disabled={pullingMetadata} className="rounded-xl bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-700">{pullingMetadata ? "Pulling..." : "Pull from Open Library"}</button><button type="button" onClick={() => setMessage("E-commerce publishing is ready for a connected Shopify or WooCommerce store.")} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Send to e-commerce</button><button type="button" onClick={() => void removeFromInventory()} className="rounded-xl bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700">Remove from inventory</button><button type="button" onClick={() => setMessage(partnerAvailability)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">Check network</button></div></div></SurfaceCard>
    <div className="grid gap-4 xl:grid-cols-[260px_1fr]"><SurfaceCard className="p-4"><div className="overflow-hidden rounded-xl bg-slate-100">{product.coverUrl ? <img src={product.coverUrl} alt={`Cover of ${product.title ?? "product"}`} className="aspect-[3/4] w-full object-cover" /> : <div className="grid aspect-[3/4] place-items-center text-sm text-slate-400">No cover image</div>}</div><div className="mt-4 space-y-2 text-sm text-slate-600"><p><strong>Price:</strong> {product.listPrice === null ? "Manual lookup" : `$${product.listPrice.toFixed(2)}`}</p><p><strong>Resale Value:</strong> {product.thriftbooksPrice === null ? "No value" : `$${product.thriftbooksPrice.toFixed(2)}`}</p><p><strong>On hand:</strong> {product.quantityOnHand}</p></div></SurfaceCard>
      <SurfaceCard className="grid gap-4 p-5"><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm text-slate-600">Title<input value={draft.title ?? ""} onChange={(event) => updateField("title", event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><label className="grid gap-1 text-sm text-slate-600">Author<input value={draft.author ?? ""} onChange={(event) => updateField("author", event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><label className="grid gap-1 text-sm text-slate-600">Publisher<input value={draft.publisher ?? ""} onChange={(event) => updateField("publisher", event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><label className="grid gap-1 text-sm text-slate-600">Media type<input value={draft.mediaType ?? "Book"} onChange={(event) => updateField("mediaType", event.target.value)} placeholder="Book, Vinyl, CD, Cassette" className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><label className="grid gap-1 text-sm text-slate-600">Category<input value={draft.category ?? ""} onChange={(event) => updateField("category", event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><label className="grid gap-1 text-sm text-slate-600">Subcategory<input value={draft.subcategory ?? ""} onChange={(event) => updateField("subcategory", event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label></div><label className="grid gap-1 text-sm text-slate-600">Description<textarea value={draft.description ?? ""} onChange={(event) => updateField("description", event.target.value)} placeholder="Add a product description" className="min-h-28 rounded-xl border border-slate-200 bg-white px-3 py-2" /></label><label className="grid gap-1 text-sm text-slate-600">Catalog tags<input value={draft.catalogTags ?? ""} onChange={(event) => updateField("catalogTags", event.target.value)} placeholder="Rare, Signed, First Edition" className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><div className="flex flex-wrap gap-2">{tagOptions.map((tag) => <button key={tag} type="button" onClick={() => setDraft((current) => ({ ...current, catalogTags: tags.includes(tag) ? tags.filter((item) => item !== tag).join(", ") : [...tags, tag].join(", ") }))} className={["rounded-full px-3 py-1.5 text-xs font-semibold", tags.includes(tag) ? "bg-[#e9ff63] text-slate-800" : "bg-slate-100 text-slate-600"].join(" ")}>{tag}</button>)}</div><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate-500">{message}</p><button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white">{saving ? "Saving..." : "Save product"}</button></div></SurfaceCard></div>
    <SurfaceCard className="grid gap-4 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-semibold text-slate-800">SEO metadata</h3><p className="mt-1 text-sm text-slate-500">Generated suggestions are editable before saving.</p></div><button type="button" onClick={generateSeo} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-600">Generate SEO</button></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm text-slate-600">SEO title<input value={draft.seoTitle ?? ""} onChange={(event) => updateField("seoTitle", event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><label className="grid gap-1 text-sm text-slate-600">SEO keywords<input value={draft.seoKeywords ?? ""} onChange={(event) => updateField("seoKeywords", event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3" /></label><label className="grid gap-1 text-sm text-slate-600 sm:col-span-2">SEO description<textarea value={draft.seoDescription ?? ""} onChange={(event) => updateField("seoDescription", event.target.value)} className="min-h-20 rounded-xl border border-slate-200 bg-white px-3 py-2" /></label></div></SurfaceCard>
    <SurfaceCard className="p-5"><h3 className="text-xl font-semibold text-slate-800">Similar titles</h3><p className="mt-1 text-sm text-slate-500">Matched by author, category, or subject.</p><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{similar.map((item) => <button key={item.id} type="button" onClick={() => navigate(`/inventory/product/${encodeURIComponent(item.isbn)}`)} className="rounded-xl bg-slate-50 p-3 text-left hover:bg-sky-50"><p className="line-clamp-2 text-sm font-semibold text-slate-800">{item.title ?? "Untitled"}</p><p className="mt-1 text-xs text-slate-500">{item.author ?? "Author unavailable"}</p></button>)}</div></SurfaceCard>
  </section>;
}

export default ProductPage;

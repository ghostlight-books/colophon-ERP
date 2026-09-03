import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createLibraryAuthorAlias,
  fetchLibraryAuthorAliases,
  fetchLibraryAuthorDetail,
  removeLibraryAuthorAlias,
  seedLibraryAuthorAliases,
  type LibraryAuthorAlias,
  type LibraryAuthorDetail,
} from "../../services/library.service";

function bookshopSearchUrl(query: string): string {
  return `https://bookshop.org/search?keywords=${encodeURIComponent(query)}`;
}

export default function LibraryAuthorDetailPage(): JSX.Element {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const canonicalName = name ? decodeURIComponent(name) : "";

  const [detail, setDetail] = useState<LibraryAuthorDetail | null>(null);
  const [aliases, setAliases] = useState<LibraryAuthorAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newAlias, setNewAlias] = useState("");
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canonicalName) return;
    try {
      const [detailData, aliasData] = await Promise.all([
        fetchLibraryAuthorDetail(canonicalName),
        fetchLibraryAuthorAliases(),
      ]);
      setDetail(detailData);
      setAliases(aliasData.filter((a) => a.canonicalName === canonicalName));
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load this author.");
    } finally {
      setLoading(false);
    }
  }, [canonicalName]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function handleAddAlias(e: React.FormEvent) {
    e.preventDefault();
    if (!newAlias.trim()) return;
    setMergeBusy(true);
    setMergeError(null);
    try {
      await createLibraryAuthorAlias(newAlias.trim(), canonicalName);
      setNewAlias("");
      await load();
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Failed to merge that name in.");
    } finally {
      setMergeBusy(false);
    }
  }

  async function handleRemoveAlias(id: string) {
    await removeLibraryAuthorAlias(id);
    await load();
  }

  async function handleSeed() {
    setSeedBusy(true);
    setSeedMessage(null);
    try {
      const result = await seedLibraryAuthorAliases(canonicalName);
      setSeedMessage(
        result.added > 0
          ? `Added ${result.added} alternate name${result.added === 1 ? "" : "s"} from OpenLibrary.`
          : "No new alternate names found on OpenLibrary.",
      );
      await load();
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : "OpenLibrary lookup failed.");
    } finally {
      setSeedBusy(false);
    }
  }

  if (loading) {
    return <div className="p-12 text-center text-slate-500 text-xs">Loading author...</div>;
  }

  if (errorMessage || !detail) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs space-y-3">
        <p>{errorMessage ?? "Could not load this author."}</p>
        <button
          onClick={() => navigate("/library/authors")}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
        >
          Back to Authors
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 font-sans max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/library/authors" className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
            &larr; All Authors
          </Link>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">{detail.canonicalName}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {detail.volumes.length} book{detail.volumes.length === 1 ? "" : "s"} in your collection
          </p>
        </div>
        <a
          href={bookshopSearchUrl(detail.canonicalName)}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-sm"
        >
          Buy more by {detail.canonicalName} &rarr;
        </a>
      </div>

      {/* Books grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {detail.volumes.map((volume) => (
          <div
            key={volume.id}
            className="p-3 bg-[#f1f5f9] dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-2"
          >
            {volume.coverUrl ? (
              <img src={volume.coverUrl} alt="" className="w-full aspect-[2/3] object-cover rounded-xl bg-slate-200 dark:bg-slate-700" />
            ) : (
              <div className="w-full aspect-[2/3] rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-400 text-[10px] px-2 text-center">
                No cover
              </div>
            )}
            <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2">{volume.title}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/library/catalog?query=${encodeURIComponent(volume.title)}`)}
                className="flex-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-[10px] font-semibold text-slate-700 dark:text-slate-200"
              >
                View in Catalog
              </button>
              <a
                href={bookshopSearchUrl(volume.isbn || volume.title)}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold"
              >
                Buy
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Related authors */}
      {detail.relatedAuthors.length > 0 && (
        <div className="p-4 sm:p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-3">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider px-1">
            If you like {detail.canonicalName}, you may like...
          </h3>
          <div className="flex flex-wrap gap-2">
            {detail.relatedAuthors.map((related) => (
              <Link
                key={related}
                to={`/library/authors/${encodeURIComponent(related)}`}
                className="px-3 py-1.5 rounded-full border border-indigo-300 dark:border-indigo-700 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
              >
                {related}
              </Link>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            Based on shared subjects and classification with authors already in your collection.
          </p>
        </div>
      )}

      {/* Name unification / merge management */}
      <div className="p-4 sm:p-5 bg-[#f1f5f9] dark:bg-slate-800 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-semibold text-slate-800 dark:text-white uppercase tracking-wider px-1">
            Name Unification
          </h3>
          <button
            onClick={handleSeed}
            disabled={seedBusy}
            className="px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 disabled:opacity-50"
          >
            {seedBusy ? "Checking OpenLibrary..." : "Check OpenLibrary for alternate names"}
          </button>
        </div>
        {seedMessage && <p className="text-[11px] text-slate-500 dark:text-slate-400">{seedMessage}</p>}

        {aliases.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Also known as:</p>
            <div className="flex flex-wrap gap-2">
              {aliases.map((alias) => (
                <span
                  key={alias.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-[11px] text-slate-700 dark:text-slate-200"
                >
                  {alias.alias}
                  {alias.source === "OPENLIBRARY" && (
                    <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-semibold">OL</span>
                  )}
                  <button
                    onClick={() => handleRemoveAlias(alias.id)}
                    className="text-slate-400 hover:text-red-500"
                    aria-label={`Remove alias ${alias.alias}`}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleAddAlias} className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            placeholder="e.g. Tom Wright"
            className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={mergeBusy || !newAlias.trim()}
            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50"
          >
            {mergeBusy ? "Merging..." : "Merge in as this author"}
          </button>
        </form>
        {mergeError && <p className="text-[11px] text-red-500">{mergeError}</p>}
        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          Merging a name treats any book credited to it as written by {detail.canonicalName} from now on.
        </p>
      </div>
    </div>
  );
}

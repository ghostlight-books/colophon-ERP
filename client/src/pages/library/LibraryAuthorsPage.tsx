import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLibraryAuthors, type LibraryAuthorSummary } from "../../services/library.service";

function AuthorInitial({ name }: { name: string }): JSX.Element {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="w-full aspect-[2/3] rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-white text-3xl font-black">
      {initial}
    </div>
  );
}

export default function LibraryAuthorsPage(): JSX.Element {
  const [authors, setAuthors] = useState<LibraryAuthorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLibraryAuthors();
        if (!cancelled) setAuthors(data);
      } catch (err) {
        if (!cancelled) setErrorMessage(err instanceof Error ? err.message : "Failed to load authors.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return authors;
    return authors.filter((a) => a.canonicalName.toLowerCase().includes(q));
  }, [authors, query]);

  if (loading) {
    return <div className="p-12 text-center text-slate-500 text-xs">Grouping your collection by author...</div>;
  }

  if (errorMessage) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs">
        {errorMessage}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24 font-sans max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {authors.length} author{authors.length === 1 ? "" : "s"} across your collection. Name variants like
          &ldquo;N.T. Wright&rdquo; and &ldquo;N. T. Wright&rdquo; are unified automatically -- open an author&apos;s
          page to merge in a pen name or alternate spelling manually.
        </p>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search authors..."
        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-xs">
          No authors match &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((author) => (
            <Link
              key={author.canonicalName}
              to={`/library/authors/${encodeURIComponent(author.canonicalName)}`}
              className="group p-3 bg-[#f1f5f9] dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-xs hover:border-indigo-400 dark:hover:border-indigo-500 transition space-y-2"
            >
              {author.sampleCoverUrl ? (
                <img
                  src={author.sampleCoverUrl}
                  alt=""
                  className="w-full aspect-[2/3] object-cover rounded-xl bg-slate-200 dark:bg-slate-700"
                />
              ) : (
                <AuthorInitial name={author.canonicalName} />
              )}
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                  {author.canonicalName}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {author.bookCount} book{author.bookCount === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

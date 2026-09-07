import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useWorkspace, type WorkspaceMode } from "../contexts/WorkspaceContext";
import BrandLogo from "../components/common/BrandLogo";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
const AUTH_TOKEN_STORAGE_KEY = "colophon-auth-token";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { setMode } = useWorkspace();

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("colophon_theme");
      if (stored === "dark" || stored === "light") return stored;
    }
    return "light";
  });

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("colophon_theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const preferredEdition: WorkspaceMode | null = (() => {
    const fromParam = searchParams.get("edition");
    return fromParam === "library" || fromParam === "bookstore" ? fromParam : null;
  })();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Which editions this account is actually entitled to -- known only after
  // a successful login, not chosen up front. null until we've authenticated.
  const [entitlements, setEntitlements] = useState<{ hasStoreAccess: boolean; hasLibraryAccess: boolean } | null>(null);

  const finalizeLogin = (edition: WorkspaceMode) => {
    setMode(edition);
    const fromState = (location.state as { from?: { pathname: string } })?.from?.pathname;
    const targetPath = fromState && fromState !== "/login"
      ? fromState
      : edition === "library"
      ? "/library"
      : "/dashboard";
    navigate(targetPath, { replace: true });
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!res.ok) {
        throw new Error("Invalid email or password.");
      }

      const data = (await res.json()) as {
        token: string;
        storeId: string | null;
        role: string | null;
        hasStoreAccess: boolean;
        hasLibraryAccess: boolean;
      };

      const userObj = {
        name: displayName.trim() || email.trim(),
        email: email.trim(),
        role: data.role || "Owner",
      };

      localStorage.setItem("colophon-current-user", JSON.stringify(userObj));
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.token);

      const canLibrary = data.hasLibraryAccess;
      const canStore = data.hasStoreAccess;

      if (canLibrary && canStore) {
        if (preferredEdition) {
          finalizeLogin(preferredEdition);
        } else {
          setEntitlements({ hasStoreAccess: true, hasLibraryAccess: true });
        }
      } else if (canLibrary) {
        finalizeLogin("library");
      } else if (canStore) {
        finalizeLogin("bookstore");
      } else {
        setErrorMessage("Your account doesn't have access to any workspace yet. Contact your administrator.");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#e2e8f0] dark:bg-slate-950 flex flex-col justify-center items-center pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] px-4 relative overflow-hidden font-sans transition-colors duration-300">
      {/* Background subtle radial glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/10 dark:bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-sky-500/10 dark:bg-sky-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top Controls: Theme Toggle */}
      <div className="absolute top-[calc(env(safe-area-inset-top,0px)+1rem)] right-5 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f1f5f9] dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer"
        >
          <span>{theme === "dark" ? "☀️ Light" : "🌙 Dark"}</span>
        </button>
      </div>

      {/* Main Login Card Container */}
      <div className="w-full max-w-md bg-[#f8fafc] dark:bg-slate-900/90 backdrop-blur-xl border border-slate-300 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 relative z-10 animate-scaleUp">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-slate-900 dark:bg-slate-800 rounded-2xl border border-slate-700 text-white shadow-md">
            <BrandLogo className="h-9 w-9" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              Colophon Unified Suite
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal mt-0.5">
              Personal Library & Bookstore ERP Platform
            </p>
          </div>
        </div>

        {entitlements ? (
          /* Post-auth Workspace Chooser -- shown only for accounts entitled
             to both editions; a single-entitlement account skips straight
             through without ever seeing the option it doesn't have. */
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">
              Choose Your Workspace
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => finalizeLogin("library")}
                className="p-3 rounded-xl text-left transition flex flex-col justify-between space-y-1 cursor-pointer bg-[#e8eef5] dark:bg-slate-950 border border-slate-300 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500"
              >
                <span className="text-[10px] font-semibold tracking-wider text-indigo-700 dark:text-indigo-400 uppercase">
                  Library Edition
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Personal & Pro</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5 leading-tight">
                    Catalog, DDC/LOC, Shelves & Values
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => finalizeLogin("bookstore")}
                className="p-3 rounded-xl text-left transition flex flex-col justify-between space-y-1 cursor-pointer bg-[#e8eef5] dark:bg-slate-950 border border-slate-300 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500"
              >
                <span className="text-[10px] font-semibold tracking-wider text-amber-700 dark:text-amber-400 uppercase">
                  Bookstore ERP
                </span>
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">Retail ERP</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5 leading-tight">
                    POS, Buyback, Shopify & Sales
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* Credentials Form */
          <form onSubmit={handleLogin} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Your Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should we address you?"
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 font-normal"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 font-normal"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-700 dark:text-slate-300 font-medium">Password</label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-normal"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 font-normal"
              />
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-slate-800 focus:ring-slate-400"
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-400 font-normal">Remember this session</span>
              </label>
            </div>

            {errorMessage && (
              <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-[11px] font-medium">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 sm:py-3 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium text-xs rounded-xl transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In &rarr;</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

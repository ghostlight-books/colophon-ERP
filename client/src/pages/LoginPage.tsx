import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useWorkspace, type WorkspaceMode } from "../contexts/WorkspaceContext";
import BrandLogo from "../components/common/BrandLogo";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { mode: currentMode, setMode } = useWorkspace();

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

  const [selectedEdition, setSelectedEdition] = useState<WorkspaceMode>(() => {
    const fromParam = searchParams.get("edition");
    if (fromParam === "library" || fromParam === "bookstore") return fromParam;
    return currentMode || "library";
  });

  const [email, setEmail] = useState(() => (selectedEdition === "library" ? "morgan@personalstacks.org" : "owner@ghostlightbooks.com"));
  const [password, setPassword] = useState("••••••••••••");
  const [displayName, setDisplayName] = useState(() => (selectedEdition === "library" ? "Morgan" : "Sarah"));
  const [role, setRole] = useState("Owner");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Update defaults if edition toggle changes without manual typing
  const handleEditionChange = (edition: WorkspaceMode) => {
    setSelectedEdition(edition);
    if (edition === "library" && (displayName === "Sarah" || !displayName)) {
      setDisplayName("Morgan");
      setEmail("morgan@personalstacks.org");
    } else if (edition === "bookstore" && (displayName === "Morgan" || !displayName)) {
      setDisplayName("Sarah");
      setEmail("owner@ghostlightbooks.com");
    }
  };

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const userObj = {
      name: displayName.trim() || (selectedEdition === "library" ? "Morgan" : "Sarah"),
      email: email.trim() || (selectedEdition === "library" ? "morgan@personalstacks.org" : "owner@ghostlightbooks.com"),
      role: role || "Owner",
    };

    try {
      localStorage.setItem("colophon-current-user", JSON.stringify(userObj));
    } catch {}

    setMode(selectedEdition);

    // If redirected from a specific page, go back there; else go to the edition home
    const fromState = (location.state as { from?: { pathname: string } })?.from?.pathname;
    const targetPath = fromState && fromState !== "/login"
      ? fromState
      : selectedEdition === "library"
      ? "/library"
      : "/dashboard";

    setTimeout(() => {
      setIsLoading(false);
      navigate(targetPath, { replace: true });
    }, 350);
  };

  const selectDemoProfile = (profile: { name: string; email: string; role: string; edition: WorkspaceMode }) => {
    setDisplayName(profile.name);
    setEmail(profile.email);
    setRole(profile.role);
    setSelectedEdition(profile.edition);
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

        {/* Workspace Edition Selector */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">
            Select Workspace Edition
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#e8eef5] dark:bg-slate-950 rounded-2xl border border-slate-300 dark:border-slate-800">
            {/* Library Edition Card */}
            <button
              type="button"
              onClick={() => handleEditionChange("library")}
              className={`p-2.5 sm:p-3 rounded-xl text-left transition flex flex-col justify-between space-y-1 cursor-pointer ${
                selectedEdition === "library"
                  ? "bg-white dark:bg-slate-800 border border-slate-400 dark:border-indigo-500/80 shadow-xs ring-1 ring-slate-300 dark:ring-indigo-500 text-slate-900 dark:text-white"
                  : "hover:bg-white/60 dark:hover:bg-slate-900/60 border border-transparent text-slate-600 dark:text-slate-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold tracking-wider text-indigo-700 dark:text-indigo-400 uppercase">
                  Library Edition
                </span>
                {selectedEdition === "library" && (
                  <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 shadow-2xs" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">Personal & Pro</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5 leading-tight">
                  Catalog, DDC/LOC, Shelves & Values
                </p>
              </div>
            </button>

            {/* Bookstore Edition Card */}
            <button
              type="button"
              onClick={() => handleEditionChange("bookstore")}
              className={`p-2.5 sm:p-3 rounded-xl text-left transition flex flex-col justify-between space-y-1 cursor-pointer ${
                selectedEdition === "bookstore"
                  ? "bg-white dark:bg-slate-800 border border-slate-400 dark:border-amber-500/80 shadow-xs ring-1 ring-slate-300 dark:ring-amber-500 text-slate-900 dark:text-white"
                  : "hover:bg-white/60 dark:hover:bg-slate-900/60 border border-transparent text-slate-600 dark:text-slate-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold tracking-wider text-amber-700 dark:text-amber-400 uppercase">
                  Bookstore ERP
                </span>
                {selectedEdition === "bookstore" && (
                  <span className="w-2 h-2 rounded-full bg-amber-600 dark:bg-amber-400 shadow-2xs" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">Retail ERP</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5 leading-tight">
                  POS, Buyback, Shopify & Sales
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleLogin} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Your Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Morgan or Sarah"
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
              placeholder="e.g. user@colophon.app"
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

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 sm:py-3 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium text-xs rounded-xl transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Launching {selectedEdition === "library" ? "Library Edition" : "Bookstore ERP"}...</span>
              </>
            ) : (
              <span>Sign In to {selectedEdition === "library" ? "Colophon Library" : "Colophon Bookstore"} &rarr;</span>
            )}
          </button>
        </form>

        {/* 1-Click Quick Demo Profiles */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">
            Quick 1-Click Profiles
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => selectDemoProfile({ name: "Morgan", email: "morgan@personalstacks.org", role: "Owner", edition: "library" })}
              className="p-2.5 bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-700 text-left transition cursor-pointer shadow-2xs"
            >
              <p className="text-[11px] font-semibold text-slate-900 dark:text-white">Morgan (Librarian)</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">Personal Library Edition</p>
            </button>

            <button
              type="button"
              onClick={() => selectDemoProfile({ name: "Sarah", email: "owner@ghostlightbooks.com", role: "Owner", edition: "bookstore" })}
              className="p-2.5 bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-700 text-left transition cursor-pointer shadow-2xs"
            >
              <p className="text-[11px] font-semibold text-slate-900 dark:text-white">Sarah (Store Owner)</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">Bookstore ERP Edition</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

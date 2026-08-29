import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useWorkspace, type WorkspaceMode } from "../contexts/WorkspaceContext";
import BrandLogo from "../components/common/BrandLogo";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { mode: currentMode, setMode } = useWorkspace();

  const [selectedEdition, setSelectedEdition] = useState<WorkspaceMode>(() => {
    const fromParam = searchParams.get("edition");
    if (fromParam === "library" || fromParam === "bookstore") return fromParam;
    return currentMode || "bookstore";
  });

  const [email, setEmail] = useState("owner@ghostlightbooks.com");
  const [password, setPassword] = useState("••••••••••••");
  const [displayName, setDisplayName] = useState("Sarah");
  const [role, setRole] = useState("Owner");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const userObj = {
      name: displayName.trim() || (selectedEdition === "library" ? "Morgan" : "Sarah"),
      email: email.trim() || "owner@ghostlightbooks.com",
      role: role || "Owner",
    };

    try {
      localStorage.setItem("colophon-current-user", JSON.stringify(userObj));
    } catch {}

    setMode(selectedEdition);

    setTimeout(() => {
      setIsLoading(false);
      navigate(selectedEdition === "library" ? "/library" : "/dashboard");
    }, 400);
  };

  const selectDemoProfile = (profile: { name: string; email: string; role: string; edition: WorkspaceMode }) => {
    setDisplayName(profile.name);
    setEmail(profile.email);
    setRole(profile.role);
    setSelectedEdition(profile.edition);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background ambient lighting */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-amber-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card Container */}
      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-7 shadow-2xl space-y-6 relative z-10 animate-scaleUp">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-slate-800/80 rounded-2xl border border-slate-700/80 shadow-md">
            <BrandLogo className="h-10 w-10" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">Colophon Unified Suite</h1>
          <p className="text-xs text-slate-400">
            Select your workspace edition and sign in to your dashboard
          </p>
        </div>

        {/* Workspace Edition Selector */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
            Choose Workspace Edition
          </label>
          <div className="grid grid-cols-2 gap-2.5 p-1 bg-slate-950/80 rounded-2xl border border-slate-800">
            {/* Bookstore Edition Card */}
            <button
              type="button"
              onClick={() => setSelectedEdition("bookstore")}
              className={`p-3 rounded-xl text-left transition flex flex-col justify-between space-y-1 cursor-pointer ${
                selectedEdition === "bookstore"
                  ? "bg-amber-500/20 border border-amber-500/50 shadow-xs text-amber-200"
                  : "hover:bg-slate-900 border border-transparent text-slate-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg">🏪</span>
                {selectedEdition === "bookstore" && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                )}
              </div>
              <div>
                <p className="text-xs font-black text-white">Bookstore ERP</p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  POS, Buyback, Shopify, Bundles & Sales
                </p>
              </div>
            </button>

            {/* Library Edition Card */}
            <button
              type="button"
              onClick={() => setSelectedEdition("library")}
              className={`p-3 rounded-xl text-left transition flex flex-col justify-between space-y-1 cursor-pointer ${
                selectedEdition === "library"
                  ? "bg-indigo-500/20 border border-indigo-500/50 shadow-xs text-indigo-200"
                  : "hover:bg-slate-900 border border-transparent text-slate-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg">🏛️</span>
                {selectedEdition === "library" && (
                  <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
                )}
              </div>
              <div>
                <p className="text-xs font-black text-white">Library Edition</p>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  Dewey/LOC, Shelves, Loans & Appraisal
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleLogin} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-300 font-bold mb-1">Your Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-slate-950/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-950/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-3 rounded-xl font-bold text-xs transition shadow-md flex items-center justify-center gap-2 cursor-pointer ${
              selectedEdition === "library"
                ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-900/30"
                : "bg-amber-600 hover:bg-amber-700 text-white shadow-amber-900/30"
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Launching {selectedEdition === "library" ? "Library Edition" : "Bookstore ERP"}...</span>
              </>
            ) : (
              <>
                <span>Sign In to {selectedEdition === "library" ? "Colophon Library" : "Colophon Bookstore"} &rarr;</span>
              </>
            )}
          </button>
        </form>

        {/* 1-Click Quick Demo Profiles */}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">
            Quick 1-Click Demo Profiles
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => selectDemoProfile({ name: "Sarah", email: "owner@ghostlightbooks.com", role: "Owner", edition: "bookstore" })}
              className="p-2 bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700/70 text-left transition"
            >
              <p className="text-[11px] font-bold text-amber-300">🏪 Sarah (Store Owner)</p>
              <p className="text-[9.5px] text-slate-400">Full Bookstore Access</p>
            </button>

            <button
              type="button"
              onClick={() => selectDemoProfile({ name: "Morgan", email: "librarian@ghostlight.org", role: "Owner", edition: "library" })}
              className="p-2 bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700/70 text-left transition"
            >
              <p className="text-[11px] font-bold text-indigo-300">🏛️ Morgan (Librarian)</p>
              <p className="text-[9.5px] text-slate-400">Library & Appraisal</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

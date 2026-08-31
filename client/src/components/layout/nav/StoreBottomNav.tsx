import { Link, useLocation } from "react-router-dom";
import { HomeLineIcon } from "./NavIcons";

function triggerHaptic() {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(8);
    } catch {}
  }
}

export default function StoreBottomNav(): JSX.Element {
  const location = useLocation();
  const currentPath = location.pathname;

  const isDashboard = currentPath === "/dashboard";
  const isIntake = currentPath.startsWith("/intake");
  const isInventory = currentPath.startsWith("/inventory") || currentPath.startsWith("/bundles");
  const isSales = currentPath.startsWith("/sales");

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-[9980] lg:hidden bg-[#e8eef5]/95 dark:bg-[#090d16]/95 backdrop-blur-2xl border-t border-slate-300 dark:border-slate-800 px-3 pt-2 pb-[calc(0.6rem+env(safe-area-inset-bottom,0px))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.6)] flex items-center justify-around select-none text-slate-800 dark:text-white"
    >
      <Link
        to="/dashboard"
        onClick={triggerHaptic}
        className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
          isDashboard
            ? "bg-slate-300/80 dark:bg-white/10 text-slate-950 dark:text-white font-semibold scale-105"
            : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <HomeLineIcon className="w-5 h-5 text-slate-800 dark:text-white" />
        <span className="text-[10px] font-medium tracking-tight">Overview</span>
      </Link>

      <Link
        to="/inventory"
        onClick={triggerHaptic}
        className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
          isInventory
            ? "bg-slate-300/80 dark:bg-white/10 text-slate-950 dark:text-white font-semibold scale-105"
            : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <img
          src="/icons/quicknav/040-books.png"
          alt="Inventory"
          className="w-5 h-5 object-contain dark:brightness-0 dark:invert"
        />
        <span className="text-[10px] font-medium tracking-tight">Inventory</span>
      </Link>

      {/* Center Floating POS Action Button */}
      <Link
        to="/pos-register"
        onClick={triggerHaptic}
        className="relative -top-3.5 flex flex-col items-center justify-center w-13 h-13 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white font-semibold shadow-[0_6px_20px_rgba(245,158,11,0.4)] border-2 border-white active:scale-95 transition"
      >
        <img
          src="/icons/quicknav/dollar@3x.png"
          alt="POS"
          className="w-6 h-6 object-contain brightness-0 invert"
        />
        <span className="text-[8px] font-semibold uppercase tracking-tighter text-white">POS</span>
      </Link>

      <Link
        to="/intake"
        onClick={triggerHaptic}
        className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
          isIntake
            ? "bg-slate-300/80 dark:bg-white/10 text-slate-950 dark:text-white font-semibold scale-105"
            : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <img
          src="/icons/quicknav/barcode@3x.png"
          alt="Intake"
          className="w-5 h-5 object-contain dark:brightness-0 dark:invert"
        />
        <span className="text-[10px] font-medium tracking-tight">Intake</span>
      </Link>

      <Link
        to="/sales"
        onClick={triggerHaptic}
        className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition ${
          isSales
            ? "bg-slate-300/80 dark:bg-white/10 text-slate-950 dark:text-white font-semibold scale-105"
            : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <img
          src="/icons/quicknav/money@3x.png"
          alt="Sales"
          className="w-5 h-5 object-contain dark:brightness-0 dark:invert"
        />
        <span className="text-[10px] font-medium tracking-tight">Sales</span>
      </Link>
    </nav>
  );
}

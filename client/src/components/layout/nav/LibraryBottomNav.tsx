import { Link, useLocation } from "react-router-dom";
import { BookshelfIcon, HomeLineIcon } from "./NavIcons";

export interface LibraryBottomNavProps {
  openOffersCount?: number;
  loanedCount?: number;
}

function triggerHaptic() {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(8);
    } catch {}
  }
}

export default function LibraryBottomNav({ openOffersCount = 0 }: LibraryBottomNavProps): JSX.Element {
  const location = useLocation();
  const currentPath = location.pathname;

  const isDashboard = currentPath === "/library";
  const isCatalog = currentPath.startsWith("/library/catalog");
  const isShelves = currentPath.startsWith("/library/shelves");
  const isExchange = currentPath.startsWith("/library/exchange") || currentPath.startsWith("/library/lending");
  const isQuickScan = currentPath.startsWith("/library/quick-scan") || currentPath.startsWith("/library/scan");

  return (
    <nav
      aria-label="Mobile Library Navigation"
      className="fixed bottom-0 left-0 right-0 z-[9980] lg:hidden bg-[#e8eef5]/95 dark:bg-[#090d16]/95 backdrop-blur-2xl border-t border-slate-300 dark:border-slate-800 px-2 pt-1.5 pb-[calc(0.6rem+env(safe-area-inset-bottom,0px))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.6)] grid grid-cols-5 items-center select-none text-slate-800 dark:text-white"
    >
      {/* 1. Home */}
      <Link
        to="/library"
        onClick={triggerHaptic}
        className={`justify-self-center flex flex-col items-center gap-1 px-2.5 py-1 rounded-xl transition ${
          isDashboard
            ? "bg-slate-300/80 dark:bg-white/10 text-slate-950 dark:text-white font-semibold scale-105"
            : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <HomeLineIcon className="w-5 h-5 text-slate-800 dark:text-white" />
        <span className="text-[10px] font-medium tracking-tight">Home</span>
      </Link>

      {/* 2. Catalog */}
      <Link
        to="/library/catalog"
        onClick={triggerHaptic}
        className={`justify-self-center flex flex-col items-center gap-1 px-2.5 py-1 rounded-xl transition ${
          isCatalog
            ? "bg-slate-300/80 dark:bg-white/10 text-slate-950 dark:text-white font-semibold scale-105"
            : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <img
          src="/icons/quicknav/002-book.png"
          alt="Catalog"
          className="w-5 h-5 object-contain dark:brightness-0 dark:invert"
        />
        <span className="text-[10px] font-medium tracking-tight">Catalog</span>
      </Link>

      {/* 3. Center Floating Barcode Scanner -> Quick Camera Scanner Page */}
      <Link
        to="/library/scan"
        onClick={triggerHaptic}
        className={`justify-self-center relative -top-3 flex flex-col items-center justify-center w-13 h-13 rounded-full bg-gradient-to-tr from-slate-700 via-slate-800 to-slate-900 dark:from-sky-400 dark:via-indigo-600 dark:to-indigo-700 text-white font-semibold shadow-[0_8px_20px_rgba(0,0,0,0.25)] dark:shadow-[0_8px_25px_rgba(79,70,229,0.5)] border-2 border-white active:scale-95 transition group ${
          isQuickScan ? "ring-4 ring-slate-400/50 dark:ring-indigo-400/50" : ""
        }`}
        title="Quick Camera Scanner"
      >
        <img
          src="/icons/quicknav/barcode@3x.png"
          alt="Scan"
          className="w-7 h-7 object-contain brightness-0 invert group-hover:scale-110 transition"
        />
      </Link>

      {/* 4. Shelves */}
      <Link
        to="/library/shelves"
        onClick={triggerHaptic}
        className={`justify-self-center flex flex-col items-center gap-1 px-2.5 py-1 rounded-xl transition ${
          isShelves
            ? "bg-slate-300/80 dark:bg-white/10 text-slate-950 dark:text-white font-semibold scale-105"
            : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <BookshelfIcon className="w-5 h-5 text-slate-800 dark:text-white" />
        <span className="text-[10px] font-medium tracking-tight">Shelves</span>
      </Link>

      {/* 5. Store: Buy / Sell / Trade (Exchange & Offers page) */}
      <Link
        to="/library/exchange"
        onClick={triggerHaptic}
        className={`justify-self-center relative flex flex-col items-center gap-1 px-2.5 py-1 rounded-xl transition ${
          isExchange
            ? "bg-slate-300/80 dark:bg-white/10 text-slate-950 dark:text-white font-semibold scale-105"
            : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <img
          src="/icons/quicknav/bag@3x.png"
          alt="Store"
          className="w-5 h-5 object-contain dark:brightness-0 dark:invert"
        />
        <span className="text-[10px] font-medium tracking-tight">Store</span>
        {openOffersCount > 0 && (
          <span className="absolute -top-0.5 right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-medium text-[9px] flex items-center justify-center shadow-xs">
            {openOffersCount}
          </span>
        )}
      </Link>
    </nav>
  );
}

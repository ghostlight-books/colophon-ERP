import React from "react";
import { Link, useLocation } from "react-router-dom";

export interface MobileBottomNavProps {
  workspaceMode?: "bookstore" | "library";
  openOffersCount?: number;
  loanedCount?: number;
}

// 1. Home Line Icon (Vector)
function HomeLineIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

// 2. Bookshelf Line Icon (Vector)
function BookshelfIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Outer Cabinet Frame */}
      <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.8" />
      {/* Top Shelf Line */}
      <line x1="3" y1="12" x2="21" y2="12" strokeWidth="1.8" />
      {/* Books on Top Shelf */}
      <path d="M6 12V6h2v6M10 12V5h2.5v7M14 12V7h2v5" strokeWidth="1.6" />
      {/* Books on Bottom Shelf */}
      <path d="M6 21v-6h2.5v6M10.5 21v-7h2.5v7M15 21v-6h3v6" strokeWidth="1.6" />
    </svg>
  );
}

export default function MobileBottomNav({
  workspaceMode = "library",
  openOffersCount = 0,
}: MobileBottomNavProps) {
  const location = useLocation();
  const currentPath = location.pathname;

  const triggerHaptic = () => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(8);
      } catch {}
    }
  };

  // ----------------------------------------------------
  // Bookstore Mobile Tabs
  // ----------------------------------------------------
  if (workspaceMode === "bookstore") {
    const isDashboard = currentPath === "/dashboard";
    const isPos = currentPath.startsWith("/pos-register");
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

  // ----------------------------------------------------
  // Colophon Library Mobile Tabs (Lightish Blue-Grey Theme in Light Mode)
  // ----------------------------------------------------
  const isDashboard = currentPath === "/library";
  const isCatalog = currentPath.startsWith("/library/catalog");
  const isShelves = currentPath.startsWith("/library/shelves");
  const isExchange = currentPath.startsWith("/library/exchange") || currentPath.startsWith("/library/lending");
  const isQuickScan = currentPath.startsWith("/library/quick-scan") || currentPath.startsWith("/library/scan");

  return (
    <nav
      aria-label="Mobile Library Navigation"
      className="fixed bottom-0 left-0 right-0 z-[9980] lg:hidden bg-[#e8eef5]/95 dark:bg-[#090d16]/95 backdrop-blur-2xl border-t border-slate-300 dark:border-slate-800 px-3 pt-1.5 pb-[calc(0.6rem+env(safe-area-inset-bottom,0px))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.6)] flex items-center justify-around select-none text-slate-800 dark:text-white"
    >
      {/* 1. Home Line Icon */}
      <Link
        to="/library"
        onClick={triggerHaptic}
        className={`flex flex-col items-center gap-1 px-2.5 py-1 rounded-xl transition ${
          isDashboard
            ? "bg-slate-300/80 dark:bg-white/10 text-slate-950 dark:text-white font-semibold scale-105"
            : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <HomeLineIcon className="w-5 h-5 text-slate-800 dark:text-white" />
        <span className="text-[10px] font-medium tracking-tight">Home</span>
      </Link>

      {/* 2. Catalog: 002-book.png */}
      <Link
        to="/library/catalog"
        onClick={triggerHaptic}
        className={`flex flex-col items-center gap-1 px-2.5 py-1 rounded-xl transition ${
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

      {/* 3. Center Floating Barcode Scanner */}
      <Link
        to="/library/quick-scan"
        onClick={triggerHaptic}
        className={`relative -top-3 flex flex-col items-center justify-center w-13 h-13 rounded-full bg-gradient-to-tr from-slate-700 via-slate-800 to-slate-900 dark:from-sky-400 dark:via-indigo-600 dark:to-indigo-700 text-white font-semibold shadow-[0_8px_20px_rgba(0,0,0,0.25)] dark:shadow-[0_8px_25px_rgba(79,70,229,0.5)] border-2 border-white active:scale-95 transition group ${
          isQuickScan ? "ring-4 ring-slate-400/50 dark:ring-indigo-400/50" : ""
        }`}
        title="Quick Barcode Scanner"
      >
        <img
          src="/icons/quicknav/barcode@3x.png"
          alt="Scanner"
          className="w-7 h-7 object-contain brightness-0 invert group-hover:scale-110 transition"
        />
      </Link>

      {/* 4. Shelves: Bookshelf Line Icon */}
      <Link
        to="/library/shelves"
        onClick={triggerHaptic}
        className={`flex flex-col items-center gap-1 px-2.5 py-1 rounded-xl transition ${
          isShelves
            ? "bg-slate-300/80 dark:bg-white/10 text-slate-950 dark:text-white font-semibold scale-105"
            : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <BookshelfIcon className="w-5 h-5 text-slate-800 dark:text-white" />
        <span className="text-[10px] font-medium tracking-tight">Shelves</span>
      </Link>

      {/* 5. Offers: $ Sign / Money */}
      <Link
        to="/library/exchange"
        onClick={triggerHaptic}
        className={`relative flex flex-col items-center gap-1 px-2.5 py-1 rounded-xl transition ${
          isExchange
            ? "bg-slate-300/80 dark:bg-white/10 text-slate-950 dark:text-white font-semibold scale-105"
            : "text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white"
        }`}
      >
        <img
          src="/icons/quicknav/money@3x.png"
          alt="Offers"
          className="w-5 h-5 object-contain dark:brightness-0 dark:invert"
        />
        <span className="text-[10px] font-medium tracking-tight">Offers</span>
        {openOffersCount > 0 && (
          <span className="absolute -top-0.5 right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-medium text-[9px] flex items-center justify-center shadow-xs">
            {openOffersCount}
          </span>
        )}
      </Link>
    </nav>
  );
}

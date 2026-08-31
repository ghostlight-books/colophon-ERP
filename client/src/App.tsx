import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import Shell, { type LoggedInUser, type ShellNavItem } from "./components/layout/Shell";
import CalendarPage from "./pages/CalendarPage";
import DashboardPage from "./pages/DashboardPage";
import FinancePage from "./pages/FinancePage";
import IntakePage from "./pages/IntakePage";
import ActiveInventoryPage from "./pages/ActiveInventoryPage";
import AdminPage from "./pages/AdminPage";
import InventoryPage from "./pages/InventoryPage";
import ListsPage from "./pages/ListsPage";
import MarketingPage from "./pages/MarketingPage";
import OpenNetworkPage from "./pages/OpenNetworkPage";
import NetworkOrderRequestPage from "./pages/NetworkOrderRequestPage";
import OperationsPage from "./pages/OperationsPage";
import PosRegisterPage from "./pages/PosRegisterPage";
import ProductPage from "./pages/ProductPage";
import ShopifyPage from "./pages/ShopifyPage";
import EbayPage from "./pages/EbayPage";
import BuyingPage from "./pages/BuyingPage";
import BundlesPage from "./pages/BundlesPage";
import LoginPage from "./pages/LoginPage";
import LibraryDashboardPage from "./pages/library/LibraryDashboardPage";
import LibraryScannerPage from "./pages/library/LibraryScannerPage";
import LibraryQuickScanPage from "./pages/library/LibraryQuickScanPage";
import LibraryCatalogPage from "./pages/library/LibraryCatalogPage";
import LibraryShelvesPage from "./pages/library/LibraryShelvesPage";
import LibraryExchangePage from "./pages/library/LibraryExchangePage";
import LibraryLendingPage from "./pages/library/LibraryLendingPage";
import LibraryValuationReportPage from "./pages/library/LibraryValuationReportPage";
import { WorkspaceProvider, useWorkspace } from "./contexts/WorkspaceContext";
import { LibrarySpaceProvider } from "./context/LibrarySpaceContext";
import { hasModuleAccess, normalizeRole, type SystemModule } from "@colophon/shared";

function EbayIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M4 8h16M4 12h16M4 16h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="18" cy="16" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ShopifyIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function OrdersIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <polyline points="10 9 9 9 8 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RequestIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GridIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function RegisterIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <rect x="7" y="6" width="10" height="3" rx="1" fill="currentColor" opacity="0.35" />
      <path d="M8 13h2M12 13h2M16 13h0M8 17h2M12 17h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BoxIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 20v-8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function WalletIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function OperationsIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16.5" cy="14" r="1.5" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function ListsIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M8 7h11M8 12h11M8 17h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="4.5" cy="7" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="17" r="1.2" fill="currentColor" />
    </svg>
  );
}

function MarketingIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M5 17V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 17v-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 17v-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 17v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 20h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3.8v3M16 3.8v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="7" y="12" width="3" height="3" rx="0.8" fill="currentColor" opacity="0.85" />
      <rect x="12" y="12" width="3" height="3" rx="0.8" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

function NetworkIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="6" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11l7.8-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 13l7.8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function RootRedirect(): JSX.Element {
  const { mode } = useWorkspace();
  return <Navigate to={mode === "library" ? "/library" : "/dashboard"} replace />;
}

function App(): JSX.Element {
  return (
    <WorkspaceProvider>
      <LibrarySpaceProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/library/quick-scan" element={<LibraryQuickScanPage />} />
            <Route path="/" element={<ShellRouteLayout />}>
              <Route index element={<RootRedirect />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="pos-register" element={<PosRegisterPage />} />
              <Route path="intake" element={<IntakePage />} />
              <Route path="buying" element={<BuyingPage />} />
              <Route path="sales" element={<InventoryPage />} />
              <Route path="operations" element={<OperationsPage />} />
              <Route path="marketing" element={<MarketingPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="lists" element={<ListsPage />} />
              <Route path="inventory" element={<ActiveInventoryPage />} />
              <Route path="inventory/product/:isbn" element={<ProductPage />} />
              <Route path="bundles" element={<BundlesPage />} />
              <Route path="finance" element={<FinancePage />} />
              <Route path="shopify" element={<ShopifyPage />} />
              <Route path="ebay" element={<EbayPage />} />
              <Route path="open-network" element={<OpenNetworkPage />} />
              <Route path="open-network/order" element={<NetworkOrderRequestPage />} />

              {/* Colophon Library Edition Routes */}
              <Route path="library" element={<LibraryDashboardPage />} />
              <Route path="library/scan" element={<LibraryScannerPage />} />
              <Route path="library/quick-scan" element={<LibraryQuickScanPage />} />
              <Route path="library/catalog" element={<LibraryCatalogPage />} />
              <Route path="library/shelves" element={<LibraryShelvesPage />} />
              <Route path="library/exchange" element={<LibraryExchangePage />} />
              <Route path="library/lending" element={<LibraryLendingPage />} />
              <Route path="library/valuation" element={<LibraryValuationReportPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LibrarySpaceProvider>
    </WorkspaceProvider>
  );
}

function ShellRouteLayout(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, setMode } = useWorkspace();
  const [currentUser, setCurrentUser] = useState<LoggedInUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem("colophon-current-user");
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<LoggedInUser>;
        if (parsed.name && parsed.email) {
          return {
            name: parsed.name,
            email: parsed.email,
            role: parsed.role ?? "Owner",
          };
        }
      }
    } catch {}
    return null;
  });
  const [accessWarning, setAccessWarning] = useState("");

  useEffect(() => {
    if (currentUser) {
      window.localStorage.setItem("colophon-current-user", JSON.stringify(currentUser));
    }
  }, [currentUser]);

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Bookstore Nav Items
  const bookstoreNavItems = useMemo<ShellNavItem[]>(() => {
    const items: Array<ShellNavItem & { module: SystemModule }> = [
      {
        key: "dashboard",
        label: "Dashboard",
        to: "/dashboard",
        icon: <GridIcon />,
        module: "DASHBOARD",
      },
      {
        key: "pos-register",
        label: "Point of Sale",
        to: "/pos-register",
        icon: <RegisterIcon />,
        module: "POS",
      },
      {
        key: "inventory",
        label: "Inventory",
        to: "/inventory",
        icon: <BoxIcon />,
        module: "INVENTORY",
        children: [
          { key: "active-inventory", label: "Active Inventory", to: "/inventory", icon: <BoxIcon /> },
          { key: "bundles", label: "Product Bundles", to: "/bundles", icon: <BoxIcon /> },
          { key: "ebay", label: "eBay Hub", to: "/ebay", icon: <EbayIcon /> },
          { key: "shopify", label: "Shopify Sync", to: "/shopify", icon: <ShopifyIcon /> },
        ],
      },
      {
        key: "intake",
        label: "Intake",
        to: "/intake",
        icon: <BoxIcon />,
        module: "INTAKE",
        children: [
          { key: "intake-scanner", label: "Scanner Station", to: "/intake", icon: <BoxIcon /> },
          { key: "buying-desk", label: "Book Buying Desk", to: "/buying", icon: <WalletIcon /> },
        ],
      },
      {
        key: "open-network",
        label: "Open Network",
        to: "/open-network",
        icon: <NetworkIcon />,
        module: "INVENTORY",
        children: [
          { key: "network-directory", label: "Bookstore Directory", to: "/open-network", icon: <NetworkIcon /> },
          { key: "network-order", label: "Book Order Request", to: "/open-network/order", icon: <RequestIcon /> },
        ],
      },
      {
        key: "calendar",
        label: "Calendar",
        to: "/calendar",
        icon: <CalendarIcon />,
        module: "CALENDAR",
      },
      {
        key: "lists",
        label: "Lists",
        to: "/lists",
        icon: <ListsIcon />,
        module: "LISTS",
      },
      {
        key: "operations",
        label: "Operations",
        to: "/operations",
        icon: <OperationsIcon />,
        module: "DASHBOARD",
      },
      {
        key: "marketing",
        label: "Marketing",
        to: "/marketing",
        icon: <MarketingIcon />,
        module: "LISTS",
      },
      {
        key: "finance",
        label: "Accounting",
        to: "/finance",
        icon: <WalletIcon />,
        module: "ACCOUNTING",
      },
    ];
    return items.filter((item) => hasModuleAccess(normalizeRole(currentUser.role), item.module));
  }, [currentUser.role]);

  // Library Nav Items
  const libraryNavItems = useMemo<ShellNavItem[]>(() => {
    return [
      {
        key: "library-dashboard",
        label: "Library Dashboard",
        to: "/library",
        icon: <GridIcon />,
      },
      {
        key: "library-scan",
        label: "Camera Scanner",
        to: "/library/scan",
        icon: <BoxIcon />,
      },
      {
        key: "library-catalog",
        label: "Collection Catalog",
        to: "/library/catalog",
        icon: <ListsIcon />,
      },
      {
        key: "library-shelves",
        label: "Shelves & Rooms",
        to: "/library/shelves",
        icon: <OperationsIcon />,
      },
      {
        key: "library-exchange",
        label: "Exchange & Offers",
        to: "/library/exchange",
        icon: <RequestIcon />,
      },
      {
        key: "library-lending",
        label: "Lending & Circulation",
        to: "/library/lending",
        icon: <NetworkIcon />,
      },
      {
        key: "library-valuation",
        label: "Insurance Appraisal",
        to: "/library/valuation",
        icon: <WalletIcon />,
      },
    ];
  }, []);

  const activeNavItems = mode === "library" ? libraryNavItems : bookstoreNavItems;
  const routeModules: Record<string, SystemModule> = {
    "/dashboard": "DASHBOARD",
    "/pos-register": "POS",
    "/sales": "POS",
    "/calendar": "CALENDAR",
    "/lists": "LISTS",
    "/buying": "INTAKE",
    "/inventory": "INVENTORY",
    "/bundles": "INVENTORY",
    "/ebay": "INVENTORY",
    "/shopify": "INVENTORY",
    "/finance": "ACCOUNTING",
    "/marketing": "LISTS",
    "/open-network": "INVENTORY",
    "/open-network/order": "INVENTORY",
  };

  const pageMeta: Record<string, { title: string; subtitle: string }> = {
    "/dashboard": {
      title: "Store Overview",
      subtitle: "Here's what is happening in your store.",
    },
    "/pos-register": {
      title: "Point of Sale",
      subtitle: "POS machine and cart are ready for checkout.",
    },
    "/intake": {
      title: "Book Intake",
      subtitle: "Scan incoming books, match ISBNs, and route review exceptions.",
    },
    "/buying": {
      title: "Buy Back Books",
      subtitle: "Evaluate incoming books, live comparative market prices, and purchase offers.",
    },
    "/bundles": {
      title: "Product Bundles",
      subtitle: "Curate multi-book product bundles and manage active sets.",
    },
    "/sales": {
      title: "Orders & Sales",
      subtitle: "Track orders, invoices, and team sales activity.",
    },
    "/operations": {
      title: "Operations & Tasks",
      subtitle: "Coordinate receiving, tasks, and operational workflows.",
    },
    "/marketing": {
      title: "Marketing Hub",
      subtitle: "Manage social channels, review stats, and publish campaigns.",
    },
    "/calendar": {
      title: "Calendar & Schedule",
      subtitle: "Track events, rentals, and key operational dates.",
    },
    "/lists": {
      title: "Task Boards & Lists",
      subtitle: "Shared team boards and store-wide task lists.",
    },
    "/inventory": {
      title: "Store Inventory",
      subtitle: "Monitor stock levels, low-quantity alerts, and replenishment workflow.",
    },
    "/ebay": {
      title: "eBay Integration",
      subtitle: "Two-way inventory sync, opportunity scoring, criteria push rules, and single-copy protection.",
    },
    "/finance": {
      title: "Financial Reports",
      subtitle: "Accounting pulse and due bills at a glance.",
    },
    "/shopify": {
      title: "Shopify Integration",
      subtitle: "Connect your Shopify store, sync inventory, and import recent orders.",
    },
    "/open-network": {
      title: "Open Book Network",
      subtitle: "Shared database and communications hub for independent bookstores.",
    },
    "/library": {
      title: "Library Dashboard",
      subtitle: "Cataloging, Dewey/LOC classification, shelf organization & insurance valuation.",
    },
    "/library/scan": {
      title: "Quick Camera Scanner",
      subtitle: "Device camera barcode scanner with instant Dewey/LOC classification & shelf intake.",
    },
    "/library/quick-scan": {
      title: "Batch Camera Scanner",
      subtitle: "Rapid batch intake and camera scanning.",
    },
    "/library/catalog": {
      title: "Library Catalog",
      subtitle: "Browse and search your collection by call number, subject, and room location.",
    },
    "/library/shelves": {
      title: "Bookcases & Shelves",
      subtitle: "Physical room, bookcase, and shelf organizer with volume capacity meters.",
    },
    "/library/exchange": {
      title: "Marketplace & Offers",
      subtitle: "Review incoming cash offers and propose book trades across community libraries and bookstores.",
    },
    "/library/lending": {
      title: "Lending Tracker",
      subtitle: "Track borrowed books, return due dates, and patron contact logs.",
    },
    "/library/valuation": {
      title: "Insurance Valuation",
      subtitle: "Collection replacement appraisal schedule for personal property insurance.",
    },
  };

  const allNavLinks = activeNavItems.flatMap((item) => [item, ...(item.children ?? [])]);
  const activePath = allNavLinks.find((item) => item.to === location.pathname || (item.to !== "/dashboard" && item.to !== "/library" && location.pathname.startsWith(item.to)))?.to ?? (mode === "library" ? "/library" : "/dashboard");
  const meta = pageMeta[activePath] ?? pageMeta[mode === "library" ? "/library" : "/dashboard"];

  useEffect(() => {
    if (location.pathname.startsWith("/library")) {
      if (mode !== "library") setMode("library");
      return;
    }
    if (mode !== "bookstore") setMode("bookstore");
    const matchedPath = Object.keys(routeModules).find((path) => location.pathname.startsWith(path));
    const module = matchedPath ? routeModules[matchedPath] : "DASHBOARD";
    if (!hasModuleAccess(normalizeRole(currentUser.role), module)) {
      setAccessWarning("You do not have access to that area.");
      navigate("/dashboard", { replace: true });
    }
  }, [currentUser.role, location.pathname, navigate, mode, setMode]);

  return (
    <Shell
      greeting={meta.title}
      subtitle={meta.subtitle}
      navItems={activeNavItems}
      activePath={activePath}
      workspaceMode={mode}
      onWorkspaceModeChange={(newMode) => {
        setMode(newMode);
        navigate(newMode === "library" ? "/library" : "/dashboard");
      }}
      onNavigate={(to) => navigate(to)}
      currentUser={currentUser}
      onCurrentUserChange={setCurrentUser}
    >
      {accessWarning ? <div className="fixed right-4 top-4 z-[9999] rounded-xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-800 shadow-lg" role="alert">{accessWarning}</div> : null}
      <Outlet context={{ currentUser }} />
    </Shell>
  );
}

export default App;

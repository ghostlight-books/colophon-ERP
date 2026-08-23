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
import { hasModuleAccess, normalizeRole, type SystemModule } from "@colophon/shared";

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

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/" element={<ShellRouteLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="pos-register" element={<PosRegisterPage />} />
          <Route path="intake" element={<IntakePage />} />
          <Route path="sales" element={<InventoryPage />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="marketing" element={<MarketingPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="lists" element={<ListsPage />} />
          <Route path="inventory" element={<ActiveInventoryPage />} />
          <Route path="inventory/product/:isbn" element={<ProductPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="shopify" element={<ShopifyPage />} />
          <Route path="open-network" element={<OpenNetworkPage />} />
          <Route path="open-network/order" element={<NetworkOrderRequestPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function ShellRouteLayout(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<LoggedInUser>(() => {
    if (typeof window === "undefined") {
      return {
        name: "Sarah",
        email: "owner@ghostlightbooks.com",
        role: "Owner",
      };
    }

    try {
      const stored = window.localStorage.getItem("colophon-current-user");
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<LoggedInUser>;
        return {
          name: parsed.name ?? "Sarah",
          email: parsed.email ?? "owner@ghostlightbooks.com",
          role: parsed.role ?? "Owner",
        };
      }
    } catch {
      // fall through to default user
    }

    return {
      name: "Sarah",
      email: "owner@ghostlightbooks.com",
      role: "Owner",
    };
  });
  const [accessWarning, setAccessWarning] = useState("");

  useEffect(() => {
    window.localStorage.setItem("colophon-current-user", JSON.stringify(currentUser));
  }, [currentUser]);

  const navItems = useMemo<ShellNavItem[]>(() => {
    const items: Array<ShellNavItem & { module: SystemModule }> = [
      { key: "dashboard", label: "Dashboard", to: "/dashboard", icon: <GridIcon />, module: "DASHBOARD" },
      { key: "pos-register", label: "Point of Sale", to: "/pos-register", icon: <RegisterIcon />, module: "POS" },
      { key: "calendar", label: "Calendar", to: "/calendar", icon: <CalendarIcon />, module: "CALENDAR" },
      { key: "lists", label: "Lists", to: "/lists", icon: <ListsIcon />, module: "LISTS" },
      { key: "intake", label: "Intake", to: "/intake", icon: <BoxIcon />, module: "INTAKE" },
      { key: "inventory", label: "Inventory", to: "/inventory", icon: <BoxIcon />, module: "INVENTORY" },
      { key: "operations", label: "Operations", to: "/operations", icon: <OperationsIcon />, module: "DASHBOARD" },
      { key: "marketing", label: "Marketing", to: "/marketing", icon: <MarketingIcon />, module: "LISTS" },
      { key: "finance", label: "Accounting", to: "/finance", icon: <WalletIcon />, module: "ACCOUNTING" },
      { key: "shopify", label: "Shopify", to: "/shopify", icon: <NetworkIcon />, module: "INVENTORY" },
      { key: "open-network", label: "Open Network", to: "/open-network", icon: <NetworkIcon />, module: "INVENTORY" },
    ];
    return items.filter((item) => hasModuleAccess(normalizeRole(currentUser.role), item.module));
  }, [currentUser.role]);

  const routeModules: Record<string, SystemModule> = { "/dashboard": "DASHBOARD", "/pos-register": "POS", "/calendar": "CALENDAR", "/lists": "LISTS", "/intake": "INTAKE", "/inventory": "INVENTORY", "/finance": "ACCOUNTING", "/operations": "DASHBOARD", "/marketing": "LISTS", "/shopify": "INVENTORY", "/open-network": "INVENTORY" };

  const pageMeta: Record<string, { subtitle: string }> = {
    "/dashboard": {
      subtitle: "Here s what happening in your store.",
    },
    "/pos-register": {
      subtitle: "POS machine and cart are ready for checkout.",
    },
    "/intake": {
      subtitle: "Scan incoming books, match ISBNs, and route review exceptions.",
    },
    "/sales": {
      subtitle: "Track orders, invoices, and team sales activity.",
    },
    "/operations": {
      subtitle: "Coordinate receiving, tasks, and operational workflows.",
    },
    "/marketing": {
      subtitle: "Manage social channels, review stats, and publish campaigns.",
    },
    "/calendar": {
      subtitle: "Track events, rentals, and key operational dates.",
    },
    "/lists": {
      subtitle: "Shared team boards and store-wide task lists.",
    },
    "/inventory": {
      subtitle: "Monitor stock levels, low-quantity alerts, and replenishment workflow.",
    },
    "/finance": {
      subtitle: "Accounting pulse and due bills at a glance.",
    },
    "/shopify": {
      subtitle: "Connect your Shopify store, sync inventory, and import recent orders.",
    },
    "/open-network": {
      subtitle: "Shared database and communications hub for independent bookstores.",
    },
  };

  const activePath = navItems.find((item) => location.pathname.startsWith(item.to))?.to ?? "/dashboard";
  const meta = pageMeta[activePath] ?? pageMeta["/dashboard"];

  useEffect(() => {
    const matchedPath = Object.keys(routeModules).find((path) => location.pathname.startsWith(path));
    const module = matchedPath ? routeModules[matchedPath] : "DASHBOARD";
    if (!hasModuleAccess(normalizeRole(currentUser.role), module)) {
      setAccessWarning("You do not have access to that area.");
      navigate("/dashboard", { replace: true });
    }
  }, [currentUser.role, location.pathname, navigate]);

  return (
    <Shell
      greeting={`Welcome, ${currentUser.name} 🎉`}
      subtitle={meta.subtitle}
      navItems={navItems}
      activePath={activePath}
      onNavigate={(to) => navigate(to)}
      currentUser={currentUser}
      onCurrentUserChange={setCurrentUser}
    >
      {accessWarning ? <div className="fixed right-4 top-4 z-50 rounded-xl bg-rose-100 px-4 py-3 text-sm font-semibold text-rose-800 shadow-lg" role="alert">{accessWarning}</div> : null}
      <Outlet context={{ currentUser }} />
    </Shell>
  );
}

export default App;

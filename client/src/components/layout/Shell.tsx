import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Menu, Moon, Search, Sun, UserRound, X } from "lucide-react";
import MobileBottomNav from "./MobileBottomNav";
import InstallAppPrompt from "../common/InstallAppPrompt";
import LibrarySpaceSwitcher from "../library/LibrarySpaceSwitcher";
import { fetchLibraryDashboard, type LibraryDashboardSummary } from "../../services/library.service";

export type ShellNavChild = {
  key: string;
  label: string;
  to: string;
  icon?: ReactNode;
};

export type ShellNavItem = {
  key: string;
  label: string;
  icon: ReactNode;
  to: string;
  children?: ShellNavChild[];
};

export type LoggedInUser = {
  name: string;
  email: string;
  role: string;
};

type ShellProps = {
  greeting: string;
  subtitle: string;
  navItems: ShellNavItem[];
  activePath: string;
  onNavigate: (to: string) => void;
  currentUser: LoggedInUser;
  onCurrentUserChange: (user: LoggedInUser) => void;
  workspaceMode?: "bookstore" | "library";
  onWorkspaceModeChange?: (mode: "bookstore" | "library") => void;
  children: ReactNode;
};

type ToolbarMenu = "none" | "menu" | "search" | "notifications" | "calendar" | "account";
type ThemeMode = "light" | "dark";
type SearchCategory = "all" | "navigation" | "orders" | "inventory" | "customers";

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  category: SearchCategory;
  to?: string;
};

type NotificationItem = {
  id: string;
  title: string;
  time: string;
  unread: boolean;
  source: "Automated" | "Manual" | "Reminder";
};

type ReminderItem = {
  id: string;
  title: string;
  due: string;
  completed: boolean;
};

type ServiceHealth = {
  key: string;
  label: string;
  detail: string;
  status: "green" | "yellow" | "red";
  path?: string;
};

function Shell({
  greeting,
  subtitle,
  navItems,
  activePath,
  onNavigate,
  currentUser,
  onCurrentUserChange,
  workspaceMode = "bookstore",
  onWorkspaceModeChange,
  children,
}: ShellProps): JSX.Element {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    const storedTheme = window.localStorage.getItem("colophon-theme");
    return storedTheme === "dark" ? "dark" : "light";
  });
  const [menu, setMenu] = useState<ToolbarMenu>("none");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState<SearchCategory>("all");
  const [manualNotificationTitle, setManualNotificationTitle] = useState("");
  const [profileDraft, setProfileDraft] = useState<LoggedInUser>(currentUser);
  const [isPosSidebarOpen, setIsPosSidebarOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth[]>([]);
  const [librarySummary, setLibrarySummary] = useState<LibraryDashboardSummary | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [reminders, setReminders] = useState<ReminderItem[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("colophon-reminders") ?? "[]") as ReminderItem[]; } catch { return []; }
  });
  const [manualNotifications, setManualNotifications] = useState<NotificationItem[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const stored = window.localStorage.getItem("colophon-manual-notifications");
      if (!stored) {
        return [];
      }

      const parsed = JSON.parse(stored) as NotificationItem[];
      return parsed.filter((item) => item.source === "Manual");
    } catch {
      return [];
    }
  });
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const automatedNotifications = useMemo<NotificationItem[]>(
    () => [
      { id: "auto-1", title: "7 orders need shipped today", time: "just now", unread: true, source: "Automated" },
      { id: "auto-2", title: "3 pickup orders are overdue", time: "14m ago", unread: true, source: "Automated" },
      { id: "auto-3", title: "Inventory sync complete", time: "1h ago", unread: false, source: "Automated" },
      { id: "auto-4", title: "Daily sales report generated", time: "2h ago", unread: false, source: "Automated" },
    ],
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const loadHealth = async (): Promise<void> => {
      try {
        const rawBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
        const apiBase = rawBase.replace(/\/$/, "").replace(/\/api$/, "") + "/api";
        const [healthRes, pingRes, dbRes] = await Promise.allSettled([
          fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(3000) }),
          fetch(`${apiBase}/ping`, { signal: AbortSignal.timeout(3000) }),
          fetch(`${apiBase}/db/status`, { signal: AbortSignal.timeout(3000) }),
        ]);

        if (cancelled) return;

        const results: ServiceHealth[] = [
          {
            key: "api",
            label: "API Server",
            status: healthRes.status === "fulfilled" && healthRes.value.ok ? "green" : "red",
            detail: healthRes.status === "fulfilled" && healthRes.value.ok ? "200 OK · :4000" : "Unreachable",
            path: "/health",
          },
          {
            key: "latency",
            label: "Ping",
            status: pingRes.status === "fulfilled" && pingRes.value.ok ? "green" : "yellow",
            detail: pingRes.status === "fulfilled" && pingRes.value.ok ? "< 5ms" : "Slow / timeout",
            path: "/ping",
          },
          {
            key: "db",
            label: "Database",
            status: dbRes.status === "fulfilled" && dbRes.value.ok ? "green" : "yellow",
            detail: dbRes.status === "fulfilled" && dbRes.value.ok ? "SQLite Ready" : "Connecting…",
            path: "/db/status",
          },
        ];

        setServiceHealth(results);
      } catch {
        // Keep the health panel quiet until the API is reachable.
      }
    };

    const loadLibHealth = async (): Promise<void> => {
      try {
        const h = await fetchLibraryDashboard();
        if (!cancelled) setLibrarySummary(h);
      } catch {}
    };

    void loadHealth();
    void loadLibHealth();
    const timer = window.setInterval(() => {
      void loadHealth();
      void loadLibHealth();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Close toolbar menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        setMenu("none");
      }
    }

    if (menu !== "none") {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menu]);

  // Global Cmd+K / Ctrl+K search shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMenu((curr) => (curr === "search" ? "none" : "search"));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const notifications = useMemo<NotificationItem[]>(() => [
    ...manualNotifications,
    ...automatedNotifications,
    ...reminders.filter((reminder) => !reminder.completed).map((reminder) => ({ id: reminder.id, title: reminder.title, time: reminder.due, unread: true, source: "Reminder" as const })),
  ], [automatedNotifications, manualNotifications, reminders]);

  const searchableItems = useMemo<SearchResult[]>(
    () => [
      ...navItems.flatMap((item) => [
        {
          id: `nav-${item.key}`,
          title: item.label,
          subtitle: "Open module",
          category: "navigation" as const,
          to: item.to,
        },
        ...(item.children ?? []).map((child) => ({
          id: `nav-${child.key}`,
          title: `${item.label} > ${child.label}`,
          subtitle: "Open sub-menu",
          category: "navigation" as const,
          to: child.to,
        })),
      ]),
      { id: "order-1", title: "Order #4529", subtitle: "Awaiting shipment", category: "orders", to: "/sales" },
      { id: "order-2", title: "Order #4518", subtitle: "Packed and ready", category: "orders", to: "/sales" },
      { id: "inv-1", title: "Piranesi", subtitle: "Low stock: 9 units", category: "inventory", to: "/inventory" },
      { id: "inv-2", title: "Dune", subtitle: "Restock requested", category: "inventory", to: "/inventory" },
      { id: "cust-1", title: "Loyalty: Harper Quinn", subtitle: "Needs follow-up", category: "customers", to: "/sales" },
      { id: "cust-2", title: "Customer: Eli Thomas", subtitle: "Pending pickup", category: "customers", to: "/sales" },
    ],
    [navItems],
  );

  const filteredSearchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return searchableItems
      .filter((item) => (searchCategory === "all" ? true : item.category === searchCategory))
      .filter((item) => {
        if (!query) {
          return true;
        }

        return item.title.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query);
      })
      .slice(0, 8);
  }, [searchCategory, searchQuery, searchableItems]);

  const unreadCount = notifications.filter((note) => note.unread).length;
  const isPosRoute = activePath.startsWith("/pos");
  const shouldHideSidebar = isPosRoute && !isPosSidebarOpen;

  useEffect(() => {
    if (!isPosRoute) {
      setIsPosSidebarOpen(false);
    }
  }, [isPosRoute]);

  useEffect(() => {
    window.localStorage.setItem("colophon-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("colophon-manual-notifications", JSON.stringify(manualNotifications));
  }, [manualNotifications]);

  useEffect(() => {
    window.localStorage.setItem("colophon-reminders", JSON.stringify(reminders));
  }, [reminders]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const dateKey = currentTime.toISOString().slice(0, 10);
    if (currentTime.getHours() < 20 || (currentTime.getHours() === 20 && currentTime.getMinutes() < 30)) {
      return;
    }
    setReminders((current) => current.some((reminder) => reminder.id === `closing-${dateKey}`)
      ? current
      : [{ id: `closing-${dateKey}`, title: "Complete closing tasks", due: "Due now · 9:00 PM close", completed: false }, ...current]);
  }, [currentTime]);

  useEffect(() => {
    setProfileDraft(currentUser);
  }, [currentUser]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent): void {
      if (!toolbarRef.current) {
        return;
      }

      if (!toolbarRef.current.contains(event.target as Node)) {
        setMenu("none");
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMenu("none");
      }
    }

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function handleSearchSelect(item: SearchResult): void {
    setMenu("none");
    setSearchQuery("");

    if (item.to) {
      onNavigate(item.to);
    }
  }

  function markNotificationRead(id: string): void {
    setManualNotifications((current) => current.map((item) => (item.id === id ? { ...item, unread: false } : item)));
  }

  function addManualNotification(): void {
    const title = manualNotificationTitle.trim();
    if (!title) {
      return;
    }

    const next: NotificationItem = {
      id: `manual-${Date.now()}`,
      title,
      time: "Just now",
      unread: true,
      source: "Manual",
    };

    setManualNotifications((current) => [next, ...current].slice(0, 12));
    setManualNotificationTitle("");
  }

  function saveProfileDraft(): void {
    const nextName = profileDraft.name.trim();
    const nextEmail = profileDraft.email.trim();
    const nextRole = profileDraft.role.trim();

    if (!nextName || !nextEmail || !nextRole) {
      return;
    }

    onCurrentUserChange({
      name: nextName,
      email: nextEmail,
      role: nextRole,
    });
  }

  const isDark = theme === "dark";

  return (
    <div className={[
      "min-h-screen transition-colors duration-300 font-sans",
      isPosRoute ? "p-1 md:p-2" : "p-3 md:p-4",
      isDark ? "bg-[#090d16]" : "bg-[#e2e8f0]",
    ].join(" ")}>
      <div
        className={[
          "relative min-h-[calc(100vh-1.5rem)] overflow-visible border shadow-sm transition-colors duration-300",
          isPosRoute ? "rounded-[18px]" : "rounded-[34px]",
          isDark
            ? "border-slate-800 bg-[#0f1422] text-slate-100"
            : "border-slate-300 bg-[#f8fafc] text-slate-900",
        ].join(" ")}
      >
        {isPosRoute ? (
          <button
            type="button"
            onClick={() => setIsPosSidebarOpen((current) => !current)}
            className={[
              "fixed left-1 top-1/2 z-30 -translate-y-1/2 rounded-r-lg border border-l-0 px-1.5 py-5 backdrop-blur transition",
              isDark ? "border-slate-700 bg-slate-800 text-slate-100" : "border-slate-300 bg-white text-slate-800 shadow-sm",
            ].join(" ")}
            aria-label={isPosSidebarOpen ? "Hide menu" : "Show menu"}
          >
            {isPosSidebarOpen ? <ChevronLeft size={16} strokeWidth={2.2} aria-hidden="true" /> : <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />}
          </button>
        ) : null}

        {/* Desktop Sidebar */}
        <aside
          className={[
            "fixed bottom-7 left-7 top-7 z-20 hidden lg:flex w-64 flex-col rounded-[28px] border p-4 shadow-lg backdrop-blur-xl transition-all duration-300",
            shouldHideSidebar ? "lg:-translate-x-[120%] lg:opacity-0 lg:pointer-events-none" : "lg:translate-x-0 lg:opacity-100",
            isDark ? "border-slate-800 bg-[#131927]/95 text-slate-100" : "border-slate-300 bg-[#f1f5f9]/95 text-slate-900",
          ].join(" ")}
        >
          <div className={[
            "flex items-center justify-between gap-2 px-2 py-1.5 transition-colors duration-300",
            isDark ? "text-slate-100" : "text-slate-900",
          ].join(" ")}>
            <div className="flex items-center gap-2.5">
              <BrandLogo className="h-9 w-9 shrink-0" />
              <div>
                <p className={[
                  "text-[0.75rem] tracking-[0.01em] transition-colors duration-300 font-semibold",
                  isDark ? "text-white" : "text-slate-900",
                ].join(" ")}>
                  {workspaceMode === "library" ? "Colophon Library" : "Colophon Bookstore"}
                </p>
                <p className="text-[10px] text-slate-500 font-normal">
                  {workspaceMode === "library" ? "Personal & Pro Edition" : "Retail ERP Edition"}
                </p>
              </div>
            </div>
          </div>

          {/* Workspace Mode Switcher Pill */}
          <div className={[
            "mt-2 mb-1 p-1 rounded-2xl flex items-center gap-1 transition-colors duration-300",
            isDark ? "bg-slate-800" : "bg-slate-100",
          ].join(" ")}>
            <button
              type="button"
              onClick={() => onWorkspaceModeChange?.("bookstore")}
              className={[
                "flex-1 py-1.5 px-2 rounded-xl text-[11px] font-medium transition flex items-center justify-center gap-1 cursor-pointer",
                workspaceMode === "bookstore"
                  ? isDark
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-indigo-950 shadow-sm border border-slate-200"
                  : isDark
                    ? "text-slate-400 hover:text-white"
                    : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              <span>🏪</span>
              <span>Store</span>
            </button>
            <button
              type="button"
              onClick={() => onWorkspaceModeChange?.("library")}
              className={[
                "flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer",
                workspaceMode === "library"
                  ? isDark
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-white text-indigo-950 shadow-sm border border-slate-200"
                  : isDark
                    ? "text-slate-400 hover:text-white"
                    : "text-slate-600 hover:text-slate-900",
              ].join(" ")}
            >
              <span>🏛️</span>
              <span>Library</span>
            </button>
          </div>

          {workspaceMode === "library" && (
            <div className="my-1.5 w-full">
              <LibrarySpaceSwitcher />
            </div>
          )}

          <div className={[
            "my-2 h-px transition-colors duration-300",
            isDark ? "bg-slate-800" : "bg-slate-200",
          ].join(" ")}></div>

          <nav className="mt-0.5 flex flex-1 flex-col gap-1 overflow-y-auto pr-0.5" aria-label="Primary">
            {navItems.map((item) => {
              const hasChildren = Boolean(item.children && item.children.length > 0);
              const isChildActive = hasChildren && (item.children?.some((child) => activePath === child.to || (child.to !== "/dashboard" && activePath.startsWith(child.to))) ?? false);
              const isDirectActive = activePath === item.to || (!hasChildren && item.to !== "/dashboard" && activePath.startsWith(item.to));
              const isParentActive = isDirectActive || isChildActive;
              const isExpanded = expandedMenus[item.key] ?? isParentActive;

              return (
                <div key={item.key} className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (hasChildren) {
                        setExpandedMenus((prev) => ({
                          ...prev,
                          [item.key]: !isExpanded,
                        }));
                      }
                      if (!hasChildren || activePath !== item.to) {
                        onNavigate(item.to);
                      }
                    }}
                    className={[
                      "group flex items-center justify-between rounded-full px-3.5 py-1.5 text-left text-[0.88rem] font-bold transition cursor-pointer",
                      isDirectActive && !hasChildren
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                        : isParentActive
                          ? isDark
                            ? "bg-indigo-950/60 text-indigo-200 border border-indigo-800"
                            : "bg-indigo-50 text-indigo-900 border border-indigo-200/80"
                          : isDark
                            ? "text-slate-200 hover:bg-slate-800 hover:text-white"
                            : "text-slate-800 hover:bg-slate-100 hover:text-slate-950",
                    ].join(" ")}
                    aria-current={isDirectActive && !hasChildren ? "page" : undefined}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={[
                          "grid h-6 w-6 place-items-center rounded-full transition text-sm",
                          isDirectActive && !hasChildren
                            ? "bg-white/20 text-white"
                            : isDark
                              ? "bg-white/10 text-slate-200 group-hover:bg-white/20"
                              : "bg-slate-100 text-slate-700 group-hover:bg-slate-200",
                        ].join(" ")}
                      >
                        {item.icon}
                      </span>
                      <span className="font-extrabold">{item.label}</span>
                    </div>
                    {hasChildren ? (
                      <ChevronDown
                        size={14}
                        className={[
                          "transition-transform duration-200",
                          isExpanded ? "rotate-180" : "",
                          isDark ? "text-slate-300" : "text-slate-500",
                        ].join(" ")}
                      />
                    ) : null}
                  </button>

                  {/* Sub-menu items */}
                  {hasChildren && isExpanded ? (
                    <div className={[
                      "ml-3.5 flex flex-col gap-0.5 border-l-2 pl-2.5 py-0.5 my-0.5 animate-in fade-in slide-in-from-top-1 duration-150",
                      isDark ? "border-slate-700" : "border-slate-300",
                    ].join(" ")}>
                      {item.children!.map((child) => {
                        const isThisChildActive = activePath === child.to || (child.to !== "/dashboard" && activePath.startsWith(child.to));
                        return (
                          <button
                            key={child.key}
                            type="button"
                            onClick={() => onNavigate(child.to)}
                            className={[
                              "group flex items-center gap-2 rounded-lg px-2.5 py-1 text-left text-[11.5px] font-bold transition cursor-pointer",
                              isThisChildActive
                                ? "bg-indigo-600 text-white shadow-xs"
                                : isDark
                                  ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
                            ].join(" ")}
                            aria-current={isThisChildActive ? "page" : undefined}
                          >
                            {child.icon ? (
                              <span className="shrink-0 opacity-80 group-hover:opacity-100">{child.icon}</span>
                            ) : (
                              <span
                                className={[
                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                  isThisChildActive ? "bg-white" : isDark ? "bg-slate-500" : "bg-slate-400",
                                ].join(" ")}
                              />
                            )}
                            <span className="truncate">{child.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          {/* Service Health Widget in Sidebar */}
          <div className={[
            "mt-auto pt-2 border-t text-[11px] transition-colors duration-300",
            isDark ? "border-slate-800" : "border-slate-200",
          ].join(" ")}>
            <div className="flex items-center justify-between px-1 py-1">
              <span className="font-bold text-slate-600 dark:text-slate-300">System Status</span>
              <div className="flex items-center gap-1.5">
                {serviceHealth.map((s) => (
                  <span
                    key={s.key}
                    className={`h-2 w-2 rounded-full ${
                      s.status === "green" ? "bg-emerald-500" : s.status === "yellow" ? "bg-amber-500" : "bg-red-500"
                    }`}
                    title={`${s.label}: ${s.detail}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className={[
          "relative z-10 overflow-visible",
          isPosRoute
            ? isPosSidebarOpen
              ? "lg:pl-[18rem] pr-2 pt-2"
              : "pl-2 pr-2 pt-2"
            : "lg:pl-[18rem] p-3 sm:p-6",
        ].join(" ")}>
          {isPosRoute ? null : (
            <header
              className={[
                "relative z-[120] overflow-visible flex items-center justify-between rounded-[20px] sm:rounded-[26px] border px-3.5 py-2.5 sm:px-6 sm:py-3.5 transition-colors duration-300 shadow-xs",
                isDark ? "border-slate-800 bg-[#131927] text-white" : "border-slate-300 bg-[#f1f5f9] text-slate-900",
              ].join(" ")}
            >
              {/* Left: Mobile Hamburger + Brand Logo Badge */}
              <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsMobileDrawerOpen(true)}
                  className={[
                    "grid lg:hidden h-9 w-9 place-items-center rounded-xl border transition shrink-0 cursor-pointer active:scale-95",
                    isDark ? "border-slate-700 bg-slate-800 text-slate-100" : "border-slate-300 bg-slate-100 text-slate-800",
                  ].join(" ")}
                  aria-label="Open Navigation Menu"
                  title="Open Navigation"
                >
                  <Menu size={18} strokeWidth={2.2} />
                </button>

                <div className="flex items-center gap-2 min-w-0">
                  <BrandLogo className="h-7 w-7 text-indigo-500 shrink-0" />
                  <span className={[
                    "text-xs sm:text-sm font-bold tracking-tight truncate",
                    isDark ? "text-white" : "text-slate-900",
                  ].join(" ")}>
                    {workspaceMode === "library" ? "Colophon Library" : "Colophon Bookstore"}
                  </span>
                </div>
              </div>

              {/* Right: Unified Header Menu Button */}
              <div ref={toolbarRef} className="relative z-[140] shrink-0">
                <button
                  type="button"
                  onClick={() => setMenu((current) => (current === "none" ? "menu" : "none"))}
                  className={[
                    "flex items-center gap-2 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl border transition cursor-pointer active:scale-95 shadow-xs font-semibold text-xs",
                    menu !== "none"
                      ? isDark
                        ? "border-indigo-500 bg-indigo-950/80 text-white ring-2 ring-indigo-500/40"
                        : "border-indigo-400 bg-indigo-50 text-indigo-950 ring-2 ring-indigo-300"
                      : isDark
                        ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                        : "border-slate-300 bg-[#e2e8f0] text-slate-800 hover:bg-[#cbd5e1]",
                  ].join(" ")}
                  aria-label="Toggle Menu"
                  title="Menu"
                >
                  <div className="relative flex items-center justify-center">
                    <div className="h-7 w-7 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-xs shadow-xs">
                      {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white dark:border-slate-900 bg-emerald-500" />
                  </div>

                  <span className="font-bold text-xs truncate max-w-[100px]">
                    {currentUser.name ? currentUser.name.split(" ")[0] : "Menu"}
                  </span>

                  {unreadCount > 0 && (
                    <span className="min-w-[18px] h-[18px] rounded-full bg-rose-500 px-1 text-[10px] font-black text-white flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}

                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 text-slate-500 dark:text-slate-400 ${
                      menu !== "none" ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Consolidated Menu Dropdown */}
                {menu !== "none" && (
                  <div
                    className={[
                      "absolute right-0 top-[52px] z-[1000] w-80 sm:w-96 rounded-3xl border p-4 shadow-2xl animate-scaleUp",
                      isDark ? "border-slate-700 bg-[#131927]/98 backdrop-blur-2xl text-slate-100" : "border-slate-200 bg-white/98 backdrop-blur-2xl text-slate-800",
                    ].join(" ")}
                    role="dialog"
                    aria-label="Header Menu"
                  >
                    {/* 1. Main Consolidated Menu View */}
                    {menu === "menu" && (
                      <div className="space-y-3 animate-fadeIn">
                        {/* User Profile Summary */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-10 w-10 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-sm shadow-xs shrink-0">
                              {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {currentUser.name}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {currentUser.email}
                              </p>
                              <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 rounded border border-indigo-200 dark:border-indigo-800">
                                {currentUser.role}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setMenu("account")}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition cursor-pointer"
                          >
                            Edit
                          </button>
                        </div>

                        {/* Quick Menu Options */}
                        <div className="space-y-1">
                          {/* 1. Search */}
                          <button
                            type="button"
                            onClick={() => setMenu("search")}
                            className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                                <Search size={14} />
                              </span>
                              <span>Search System</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">⌘K</span>
                          </button>

                          {/* 2. Theme Switcher */}
                          <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <div className="flex items-center gap-2.5">
                              <span className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                                {isDark ? <Moon size={14} /> : <Sun size={14} />}
                              </span>
                              <span>Appearance</span>
                            </div>

                            {/* Toggle Pill */}
                            <div className="flex items-center p-0.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-[11px]">
                              <button
                                type="button"
                                onClick={() => setTheme("light")}
                                className={`px-2 py-0.5 rounded-md transition font-bold cursor-pointer ${
                                  !isDark
                                    ? "bg-white text-slate-900 shadow-xs"
                                    : "text-slate-400 hover:text-white"
                                }`}
                              >
                                Light
                              </button>
                              <button
                                type="button"
                                onClick={() => setTheme("dark")}
                                className={`px-2 py-0.5 rounded-md transition font-bold cursor-pointer ${
                                  isDark
                                    ? "bg-indigo-600 text-white shadow-xs"
                                    : "text-slate-600 hover:text-slate-900"
                                }`}
                              >
                                Dark
                              </button>
                            </div>
                          </div>

                          {/* 3. Notifications */}
                          <button
                            type="button"
                            onClick={() => setMenu("notifications")}
                            className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
                                <Bell size={14} />
                              </span>
                              <span>Notifications</span>
                            </div>
                            {unreadCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                                {unreadCount} new
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-semibold">All read</span>
                            )}
                          </button>

                          {/* 4. Calendar & Tasks */}
                          <button
                            type="button"
                            onClick={() => setMenu("calendar")}
                            className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                                <CalendarDays size={14} />
                              </span>
                              <span>Calendar & Tasks</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-semibold">
                              {reminders.filter((r) => !r.completed).length} open
                            </span>
                          </button>
                        </div>

                        {/* Footer: Clock + Sign Out */}
                        <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-mono font-medium">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            <span>
                              {currentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              window.localStorage.removeItem("colophon-current-user");
                              setMenu("none");
                              onNavigate("/login");
                            }}
                            className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-bold transition cursor-pointer"
                          >
                            Sign Out
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 2. Search Subpanel */}
                    {menu === "search" && (
                      <div className="space-y-3 animate-fadeIn">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setMenu("menu")}
                            className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            <ChevronLeft size={14} />
                            <span>Back to Menu</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMenu("none")}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg text-xs font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>

                        <div>
                          <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Search System</p>
                          <input
                            autoFocus
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && filteredSearchResults[0]) {
                                handleSearchSelect(filteredSearchResults[0]);
                                setMenu("none");
                              }
                            }}
                            placeholder="Search books, orders, customers..."
                            className="mt-2 w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                          />
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {[
                              { label: "All", value: "all" as const },
                              { label: "Navigation", value: "navigation" as const },
                              { label: "Orders", value: "orders" as const },
                              { label: "Inventory", value: "inventory" as const },
                              { label: "Customers", value: "customers" as const },
                            ].map((chip) => (
                              <button
                                key={chip.label}
                                type="button"
                                onClick={() => setSearchCategory(chip.value)}
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition cursor-pointer ${
                                  searchCategory === chip.value
                                    ? "bg-indigo-600 text-white shadow-xs"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                                }`}
                              >
                                {chip.label}
                              </button>
                            ))}
                          </div>

                          <div className="mt-3 max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
                            {filteredSearchResults.length === 0 ? (
                              <p className="p-3 text-center text-xs text-slate-500 font-semibold">No matches found.</p>
                            ) : (
                              filteredSearchResults.map((result) => (
                                <button
                                  key={result.id}
                                  type="button"
                                  onClick={() => {
                                    handleSearchSelect(result);
                                    setMenu("none");
                                  }}
                                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                  <p className="text-xs font-black text-slate-900 dark:text-white">{result.title}</p>
                                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-semibold">{result.subtitle}</p>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3. Notifications Subpanel */}
                    {menu === "notifications" && (
                      <div className="space-y-3 animate-fadeIn">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setMenu("menu")}
                            className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            <ChevronLeft size={14} />
                            <span>Back to Menu</span>
                          </button>
                          <span className="text-[11px] text-slate-500 font-semibold">{unreadCount} unread</span>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                          {notifications.length === 0 ? (
                            <p className="p-4 text-center text-xs text-slate-500 font-medium">No notifications.</p>
                          ) : (
                            notifications.map((note) => (
                              <div
                                key={note.id}
                                onClick={() => markNotificationRead(note.id)}
                                className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                                  note.unread
                                    ? "bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800"
                                    : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700"
                                }`}
                              >
                                <p className="font-bold text-slate-900 dark:text-white">{note.title}</p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">{note.time}</p>
                              </div>
                            ))
                          )}
                        </div>

                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            addManualNotification();
                          }}
                          className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800"
                        >
                          <input
                            type="text"
                            value={manualNotificationTitle}
                            onChange={(e) => setManualNotificationTitle(e.target.value)}
                            placeholder="Add custom reminder..."
                            className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2 text-xs font-semibold focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="px-3 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-xs"
                          >
                            Add
                          </button>
                        </form>
                      </div>
                    )}

                    {/* 4. Calendar & Tasks Subpanel */}
                    {menu === "calendar" && (
                      <div className="space-y-3 animate-fadeIn">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setMenu("menu")}
                            className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            <ChevronLeft size={14} />
                            <span>Back to Menu</span>
                          </button>
                          <span className="text-[11px] text-slate-500 font-semibold">
                            {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                          </span>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                          {reminders.length === 0 ? (
                            <p className="p-4 text-center text-xs text-slate-500 font-medium">No schedule items.</p>
                          ) : (
                            reminders.map((r) => (
                              <div
                                key={r.id}
                                className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                              >
                                <span className="font-semibold text-slate-900 dark:text-white">{r.title}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{r.due}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* 5. Account Settings Subpanel */}
                    {menu === "account" && (
                      <div className="space-y-3 animate-fadeIn">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => setMenu("menu")}
                            className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            <ChevronLeft size={14} />
                            <span>Back to Menu</span>
                          </button>
                          <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Account Settings</p>
                        </div>

                        <div className="flex items-center gap-3 pb-2">
                          <div className="w-10 h-10 rounded-full bg-amber-400 text-slate-900 font-black flex items-center justify-center text-sm shadow-xs">
                            {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-900 dark:text-white">{currentUser.name}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">{currentUser.email}</p>
                          </div>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div>
                            <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Name</label>
                            <input
                              type="text"
                              value={profileDraft.name}
                              onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })}
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2 font-semibold"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Role</label>
                            <select
                              value={profileDraft.role}
                              onChange={(e) => setProfileDraft({ ...profileDraft, role: e.target.value })}
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl p-2 font-semibold"
                            >
                              <option value="Owner">Owner</option>
                              <option value="Manager">Manager</option>
                              <option value="Staff">Staff</option>
                              <option value="Librarian">Librarian</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => {
                              window.localStorage.removeItem("colophon-current-user");
                              setMenu("none");
                              onNavigate("/login");
                            }}
                            className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-medium cursor-pointer"
                          >
                            Sign Out
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              saveProfileDraft();
                              setMenu("menu");
                            }}
                            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium text-xs rounded-xl shadow-xs cursor-pointer transition"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </header>
          )}

          <main className={isPosRoute ? "pb-2 pt-0" : "pb-8 pt-4"}>
            {/* Page Title & Subtitle Banner (Full-Width, Nestled Right Above the Library Selector & Page Controls) */}
            {!isPosRoute && greeting && (
              <div className="mb-4 sm:mb-5 max-w-4xl mx-auto px-1 animate-fadeIn">
                <h1 className={[
                  "text-xl sm:text-2xl lg:text-3xl font-black tracking-tight transition-colors duration-300",
                  isDark ? "text-white" : "text-slate-900",
                ].join(" ")}>
                  {greeting}
                </h1>
                {subtitle && (
                  <p className={[
                    "mt-1 text-xs sm:text-sm font-medium transition-colors duration-300",
                    isDark ? "text-slate-400" : "text-slate-500",
                  ].join(" ")}>
                    {subtitle}
                  </p>
                )}
              </div>
            )}

            {children}
          </main>
        </div>

        {/* Mobile Navigation Tab Bar (Phones & Tablets) */}
        <MobileBottomNav
          workspaceMode={workspaceMode}
          loanedCount={librarySummary?.loanedCount}
        />

        {/* Mobile PWA Install Prompt Banner */}
        <InstallAppPrompt />

        {/* Mobile Sliding Sidebar Drawer */}
        {isMobileDrawerOpen && (
          <div className="fixed inset-0 z-[99999] lg:hidden flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
              onClick={() => setIsMobileDrawerOpen(false)}
            />

            {/* Drawer Panel */}
            <div
              className={[
                "relative w-72 max-w-[85vw] h-full flex flex-col p-4 shadow-2xl border-r z-10 animate-slideRight overflow-y-auto",
                isDark ? "bg-[#131927] border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <BrandLogo className="h-8 w-8 shrink-0" />
                  <div>
                    <p className="text-xs font-black text-slate-900 dark:text-white">{workspaceMode === "library" ? "Colophon Library" : "Colophon Bookstore"}</p>
                    <p className="text-[10px] text-slate-500 font-semibold">Mobile Edition</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Workspace Mode Switcher */}
              <div className="mt-3 mb-2 p-1 rounded-2xl flex items-center gap-1 bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    onWorkspaceModeChange?.("bookstore");
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                    workspaceMode === "bookstore" ? "bg-white text-indigo-950 shadow-sm" : "text-slate-500"
                  }`}
                >
                  <span>🏪</span>
                  <span>Store</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onWorkspaceModeChange?.("library");
                    setIsMobileDrawerOpen(false);
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                    workspaceMode === "library" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500"
                  }`}
                >
                  <span>🏛️</span>
                  <span>Library</span>
                </button>
              </div>

              {/* Library Space Switcher inside Mobile Drawer */}
              {workspaceMode === "library" && (
                <div className="my-2 p-2.5 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200/50 dark:border-indigo-800/50 space-y-1.5">
                  <span className="text-[10px] font-bold text-indigo-900 dark:text-indigo-300 block uppercase tracking-wider">
                    🏛️ Active Library Space
                  </span>
                  <LibrarySpaceSwitcher />
                </div>
              )}

              {/* Nav Items List */}
              <nav className="mt-3 space-y-1 flex-1">
                {navItems.map((item) => {
                  const isActive = item.to ? activePath.startsWith(item.to) : false;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        if (item.to) {
                          onNavigate(item.to);
                          setIsMobileDrawerOpen(false);
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition text-left cursor-pointer ${
                        isActive
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="text-base">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* User Account / Sign Out in Drawer */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{currentUser.name}</p>
                  <p className="text-[10px] text-slate-500 font-normal">{currentUser.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.localStorage.removeItem("colophon-current-user");
                    setIsMobileDrawerOpen(false);
                    onNavigate("/login");
                  }}
                  className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-xs font-medium cursor-pointer transition"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function toolbarButtonClass(isDark: boolean, isActive: boolean): string {
  if (isActive) {
    return "relative grid h-8 w-8 place-items-center rounded-full bg-indigo-600 text-white font-black shadow-xs";
  }

  return [
    "relative grid h-8 w-8 place-items-center rounded-full transition cursor-pointer",
    isDark
      ? "bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white border border-slate-700"
      : "bg-white text-slate-800 hover:bg-slate-100 hover:text-slate-950 border border-slate-300 shadow-2xs",
  ].join(" ");
}

function BrandLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 120 90"
      className={className}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path
        d="M6 74V14C20 8 33 8 50 12C57 14 63 22 60 31C57 22 51 15 43 12C31 8 20 9 6 14"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M114 74V14C100 8 87 8 70 12C63 14 57 22 60 31C63 22 69 15 77 12C89 8 100 9 114 14"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 74C22 70 38 70 60 77C82 70 98 70 114 74"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M60 31V78"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default Shell;
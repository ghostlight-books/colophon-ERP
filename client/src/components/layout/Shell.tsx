import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Moon, Search, Sun, UserRound } from "lucide-react";

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
  children: ReactNode;
};

type ToolbarMenu = "none" | "search" | "notifications" | "calendar" | "account";
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

function Shell({ greeting, subtitle, navItems, activePath, onNavigate, currentUser, onCurrentUserChange, children }: ShellProps): JSX.Element {
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
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth[]>([]);
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
        const response = await fetch(`${apiBase}/health/services?storeId=ghostlight-demo&updatedAt=${Date.now()}`);
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { services: ServiceHealth[] };
        if (!cancelled) {
          setServiceHealth(payload.services);
        }
      } catch {
        // Keep the health panel quiet until the API is reachable.
      }
    };
    void loadHealth();
    const timer = window.setInterval(() => void loadHealth(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
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

    function onEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMenu("none");
      }
    }

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  function handleSearchSelect(result: SearchResult): void {
    if (result.to) {
      onNavigate(result.to);
    }

    setMenu("none");
    setSearchQuery("");
  }

  function addManualNotification(): void {
    const title = manualNotificationTitle.trim();
    if (!title) {
      return;
    }

    const next: NotificationItem = {
      id: `manual-${Date.now()}`,
      title,
      time: "just now",
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
      "min-h-screen transition-colors duration-300",
      isPosRoute ? "p-1 md:p-2" : "p-3 md:p-4",
      isDark ? "bg-[#1a1d24]" : "bg-[#f1f1f3]",
    ].join(" ")}>
      <div
        className={[
          "relative min-h-[calc(100vh-1.5rem)] overflow-visible border shadow-[0_20px_50px_rgba(60,70,86,0.16)] transition-colors duration-300",
          isPosRoute ? "rounded-[18px]" : "rounded-[34px]",
          isDark
            ? "border-white/10 bg-[radial-gradient(circle_at_85%_88%,rgba(47,90,136,0.42)_0%,rgba(27,32,45,0)_35%),radial-gradient(circle_at_66%_70%,rgba(80,62,139,0.36)_0%,rgba(20,22,34,0)_40%),linear-gradient(145deg,#1f2430_0%,#161a23_100%)]"
            : "border-white/80 bg-[radial-gradient(circle_at_85%_88%,rgba(168,224,255,0.48)_0%,rgba(241,238,255,0)_32%),radial-gradient(circle_at_66%_70%,rgba(225,204,255,0.45)_0%,rgba(238,240,255,0)_38%),linear-gradient(145deg,#ececef_0%,#dfe0e3_100%)]",
        ].join(" ")}
      >
        {isPosRoute ? (
          <button
            type="button"
            onClick={() => setIsPosSidebarOpen((current) => !current)}
            className={[
              "fixed left-1 top-1/2 z-30 -translate-y-1/2 rounded-r-lg border border-l-0 px-1.5 py-5 backdrop-blur transition",
              isDark ? "border-white/15 bg-white/10 text-slate-100" : "border-white/80 bg-white/80 text-slate-700",
            ].join(" ")}
            aria-label={isPosSidebarOpen ? "Hide menu" : "Show menu"}
          >
            {isPosSidebarOpen ? <ChevronLeft size={16} strokeWidth={2.2} aria-hidden="true" /> : <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />}
          </button>
        ) : null}

        <aside
          className={[
            "fixed bottom-7 left-7 top-7 z-20 flex w-64 flex-col rounded-[28px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl transition-all duration-300",
            shouldHideSidebar ? "-translate-x-[120%] opacity-0 pointer-events-none" : "translate-x-0 opacity-100",
            isDark ? "border-white/10 bg-white/5" : "border-white/70 bg-white/28",
          ].join(" ")}
        >
          <div className={[
            "flex items-center gap-2.5 px-2 py-2 transition-colors duration-300",
            isDark ? "text-slate-100" : "text-slate-700",
          ].join(" ")}>
            <BrandLogo className="h-10 w-10 shrink-0" />
            <div>
              <p className={[
                "text-[0.7rem] tracking-[0.01em] transition-colors duration-300",
                isDark ? "text-slate-400" : "text-slate-500",
              ].join(" ")}>Colophon ERP</p>
            </div>
          </div>

          <div className={[
            "my-3 h-px transition-colors duration-300",
            isDark ? "bg-white/15" : "bg-white/70",
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
                      "group flex items-center justify-between rounded-full px-3.5 py-1.5 text-left text-[0.88rem] font-semibold transition",
                      isDirectActive && !hasChildren
                        ? "bg-[#e9ff63] text-slate-800 shadow-[inset_0_0_0_1px_rgba(201,224,86,0.48)]"
                        : isParentActive
                          ? isDark
                            ? "bg-white/14 text-slate-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                            : "bg-white/65 text-slate-800 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
                          : isDark
                            ? "bg-white/8 text-slate-300 hover:bg-white/14 hover:text-white"
                            : "bg-white/40 text-slate-600 hover:bg-white/72 hover:text-slate-800",
                    ].join(" ")}
                    aria-current={isDirectActive && !hasChildren ? "page" : undefined}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={[
                          "grid h-6 w-6 place-items-center rounded-full transition",
                          isDirectActive && !hasChildren
                            ? "bg-black/10 text-slate-700"
                            : isDark
                              ? "bg-white/15 text-slate-300 group-hover:bg-white/20"
                              : "bg-white/80 text-slate-500 group-hover:bg-white",
                        ].join(" ")}
                      >
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </div>
                    {hasChildren ? (
                      <ChevronDown
                        size={14}
                        className={[
                          "transition-transform duration-200",
                          isExpanded ? "rotate-180" : "",
                          isDark ? "text-slate-400" : "text-slate-400",
                        ].join(" ")}
                      />
                    ) : null}
                  </button>

                  {/* Sub-menu items */}
                  {hasChildren && isExpanded ? (
                    <div className={[
                      "ml-3.5 flex flex-col gap-0.5 border-l-2 pl-2.5 py-0.5 my-0.5 animate-in fade-in slide-in-from-top-1 duration-150",
                      isDark ? "border-white/15" : "border-slate-300/70",
                    ].join(" ")}>
                      {item.children!.map((child) => {
                        const isThisChildActive = activePath === child.to || (child.to !== "/dashboard" && activePath.startsWith(child.to));
                        return (
                          <button
                            key={child.key}
                            type="button"
                            onClick={() => onNavigate(child.to)}
                            className={[
                              "group flex items-center gap-2 rounded-lg px-2.5 py-1 text-left text-[11.5px] font-semibold transition",
                              isThisChildActive
                                ? "bg-[#e9ff63] text-slate-900 shadow-sm"
                                : isDark
                                  ? "text-slate-300 hover:bg-white/10 hover:text-white"
                                  : "text-slate-600 hover:bg-white/70 hover:text-slate-900",
                            ].join(" ")}
                            aria-current={isThisChildActive ? "page" : undefined}
                          >
                            {child.icon ? (
                              <span className="shrink-0 opacity-80 group-hover:opacity-100">{child.icon}</span>
                            ) : (
                              <span
                                className={[
                                  "h-1.5 w-1.5 shrink-0 rounded-full",
                                  isThisChildActive ? "bg-slate-900" : isDark ? "bg-slate-500" : "bg-slate-400",
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

          <div
            className={[
              "rounded-2xl p-3 text-xs transition-colors duration-300",
              isDark ? "bg-white/8 text-slate-300" : "bg-white/50 text-slate-600",
            ].join(" ")}
          >
            <div className="flex items-center justify-between">
              <p className={[
                "font-semibold transition-colors duration-300",
                isDark ? "text-slate-100" : "text-slate-700",
              ].join(" ")}>Store Health</p>
              <span className="text-[10px] font-medium text-slate-400">Live</span>
            </div>
            <div className="mt-2 space-y-1">
              {serviceHealth.length === 0 ? <p className="py-1 text-slate-400">Checking services...</p> : serviceHealth.map((service) => (
                <button
                  key={service.key}
                  type="button"
                  onClick={() => {
                    if (service.path) onNavigate(service.path);
                    else if (service.key === "ecommerce") onNavigate("/shopify");
                    else if (service.key === "payments") onNavigate("/payments");
                    else if (service.key === "network") onNavigate("/network");
                    else if (service.key === "marketing") onNavigate("/marketing");
                  }}
                  className={[
                    "group flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left transition",
                    isDark ? "hover:bg-white/10" : "hover:bg-white/80",
                  ].join(" ")}
                  title={`${service.label}: ${service.detail}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className={[
                        "h-2 w-2 shrink-0 rounded-full transition-all",
                        service.status === "green"
                          ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                          : service.status === "yellow"
                            ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
                            : "bg-rose-500",
                      ].join(" ")}
                      aria-label={`${service.label}: ${service.status}`}
                    />
                    <span className="truncate font-medium">{service.label}</span>
                  </div>
                  <span
                    className={[
                      "text-[10px] font-semibold shrink-0",
                      service.status === "green"
                        ? "text-emerald-700"
                        : service.status === "yellow"
                          ? "text-amber-700"
                          : "text-slate-400",
                    ].join(" ")}
                  >
                    {service.status === "green" ? "Active" : service.status === "yellow" ? "Check" : "Off"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className={[
          "relative z-10 overflow-visible",
          isPosRoute
            ? isPosSidebarOpen
              ? "pl-[18rem] pr-3 pt-3"
              : "pl-3 pr-3 pt-3"
            : "pl-[18rem] pr-6 pt-6",
        ].join(" ")}>
          {isPosRoute ? null : (
            <header
              className={[
                "relative z-[120] overflow-visible flex items-start justify-between rounded-[26px] border px-7 py-5 backdrop-blur-sm transition-colors duration-300",
                isDark ? "border-white/12 bg-white/6" : "border-white/70 bg-white/35",
              ].join(" ")}
            >
              <div>
                <h1 className={[
                  "text-[2.1rem] font-semibold tracking-tight transition-colors duration-300",
                  isDark ? "text-slate-100" : "text-slate-700",
                ].join(" ")}>{greeting}</h1>
                <p className={[
                  "mt-1 text-[1rem] transition-colors duration-300",
                  isDark ? "text-slate-400" : "text-slate-500",
                ].join(" ")}>{subtitle}</p>
              </div>

                <div
                ref={toolbarRef}
                className={[
                  "relative z-[140] mt-1 flex flex-col items-stretch rounded-[20px] border px-2 py-1.5 transition-colors duration-300",
                  isDark ? "border-white/15 bg-white/8 text-slate-300" : "border-white/80 bg-white/60 text-slate-500",
                ].join(" ")}
              >
                <div className="flex items-center justify-center gap-2">
                <button
                type="button"
                onClick={() => setMenu((current) => (current === "search" ? "none" : "search"))}
                className={toolbarButtonClass(isDark, menu === "search")}
                aria-label="Search"
                title="Search"
              >
                <Search size={15} strokeWidth={2} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
                className={toolbarButtonClass(isDark, false)}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? <Sun size={15} strokeWidth={2} aria-hidden="true" /> : <Moon size={15} strokeWidth={2} aria-hidden="true" />}
              </button>

              <button
                type="button"
                onClick={() => setMenu((current) => (current === "notifications" ? "none" : "notifications"))}
                className={toolbarButtonClass(isDark, menu === "notifications")}
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell size={15} strokeWidth={2} aria-hidden="true" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => setMenu((current) => (current === "calendar" ? "none" : "calendar"))}
                className={toolbarButtonClass(isDark, menu === "calendar")}
                aria-label="Calendar"
                title="Calendar"
              >
                <CalendarDays size={15} strokeWidth={2} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => setMenu((current) => (current === "account" ? "none" : "account"))}
                className={[
                  "relative grid h-8 w-8 place-items-center rounded-full transition",
                  isDark ? "bg-amber-400 text-slate-900" : "bg-[#f9d94f] text-slate-700",
                ].join(" ")}
                aria-label="Account"
                title="Account"
              >
                <UserRound size={15} strokeWidth={2} aria-hidden="true" />
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500"></span>
              </button>

              {menu !== "none" ? (
                <div
                  className={[
                    "absolute right-0 top-[52px] z-[1000] w-80 rounded-2xl border p-3 shadow-[0_14px_40px_rgba(20,28,40,0.24)]",
                    isDark ? "border-white/12 bg-[#1f2430] text-slate-100" : "border-white/70 bg-white text-slate-700",
                  ].join(" ")}
                  role="dialog"
                  aria-label="Toolbar panel"
                >
                  {menu === "search" ? (
                    <div>
                      <p className="text-sm font-semibold">Search</p>
                      <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && filteredSearchResults[0]) {
                            handleSearchSelect(filteredSearchResults[0]);
                          }
                        }}
                        placeholder="Search books, orders, customers"
                        className={[
                          "mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none",
                          isDark
                            ? "border-white/15 bg-white/8 text-slate-100 placeholder:text-slate-400 focus:border-slate-300"
                            : "border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:border-slate-400",
                        ].join(" ")}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
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
                            className={[
                              "rounded-full px-3 py-1.5 text-xs font-semibold",
                              searchCategory === chip.value
                                ? "bg-[#e9ff63] text-slate-800"
                                : isDark
                                  ? "bg-white/12 text-slate-200"
                                  : "bg-slate-100 text-slate-600",
                            ].join(" ")}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-3 max-h-56 overflow-y-auto space-y-2">
                        {filteredSearchResults.length === 0 ? (
                          <p className={[
                            "rounded-xl px-3 py-2 text-sm",
                            isDark ? "bg-white/6 text-slate-400" : "bg-slate-50 text-slate-500",
                          ].join(" ")}>No matches found.</p>
                        ) : (
                          filteredSearchResults.map((result) => (
                            <button
                              key={result.id}
                              type="button"
                              onClick={() => handleSearchSelect(result)}
                              className={[
                                "w-full rounded-xl border px-3 py-2 text-left transition",
                                isDark
                                  ? "border-white/10 bg-white/4 hover:bg-white/10"
                                  : "border-slate-100 bg-slate-50 hover:bg-slate-100",
                              ].join(" ")}
                            >
                              <p className="text-sm font-semibold">{result.title}</p>
                              <p className={[
                                "text-xs",
                                isDark ? "text-slate-400" : "text-slate-500",
                              ].join(" ")}>{result.subtitle}</p>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}

                  {menu === "notifications" ? (
                    <div>
                      <p className="text-sm font-semibold">Notifications</p>

                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Reminders</p>
                      <div className="mt-2 space-y-2">
                        {reminders.length === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">No reminders yet.</p> : reminders.map((reminder) => (
                          <label key={reminder.id} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-sm">
                            <input type="checkbox" checked={reminder.completed} onChange={() => setReminders((current) => current.map((item) => item.id === reminder.id ? { ...item, completed: !item.completed } : item))} className="mt-0.5 accent-emerald-500" />
                            <span className={reminder.completed ? "text-slate-400 line-through" : "text-slate-700"}><span className="block font-medium">{reminder.title}</span><span className="text-xs text-slate-400">{reminder.due}</span></span>
                          </label>
                        ))}
                      </div>

                      <div className="mt-2 rounded-xl border border-emerald-200/40 bg-emerald-100/40 p-2.5">
                        <p className={[
                          "text-xs font-semibold",
                          isDark ? "text-emerald-200" : "text-emerald-800",
                        ].join(" ")}>Manual Alert</p>
                        <div className="mt-2 flex gap-2">
                          <input
                            value={manualNotificationTitle}
                            onChange={(event) => setManualNotificationTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                addManualNotification();
                              }
                            }}
                            placeholder="Add note e.g. Call publisher at 3PM"
                            className={[
                              "w-full rounded-lg border px-2.5 py-2 text-xs outline-none",
                              isDark
                                ? "border-white/15 bg-white/8 text-slate-100 placeholder:text-slate-400"
                                : "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400",
                            ].join(" ")}
                          />
                          <button
                            type="button"
                            onClick={addManualNotification}
                            className="rounded-lg bg-[#e9ff63] px-3 text-xs font-semibold text-slate-800"
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Automated</p>
                      <ul className="mt-2 space-y-2">
                        {automatedNotifications.map((note) => (
                          <li
                            key={note.id}
                            className={[
                              "rounded-xl border p-2.5 text-sm",
                              isDark ? "border-white/10 bg-white/4" : "border-slate-100 bg-slate-50",
                            ].join(" ")}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span>{note.title}</span>
                              {note.unread ? <span className="mt-1 h-2 w-2 rounded-full bg-[#e9ff63]"></span> : null}
                            </div>
                            <p className={[
                              "mt-1 text-xs",
                              isDark ? "text-slate-400" : "text-slate-500",
                            ].join(" ")}>{note.time}</p>
                          </li>
                        ))}
                      </ul>

                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Manual</p>
                      <ul className="mt-2 space-y-2">
                        {manualNotifications.length === 0 ? (
                          <li className={[
                            "rounded-xl border p-2.5 text-xs",
                            isDark ? "border-white/10 bg-white/4 text-slate-400" : "border-slate-100 bg-slate-50 text-slate-500",
                          ].join(" ")}>No manual notifications yet.</li>
                        ) : (
                          manualNotifications.map((note) => (
                            <li
                              key={note.id}
                              className={[
                                "rounded-xl border p-2.5 text-sm",
                                isDark ? "border-white/10 bg-white/4" : "border-slate-100 bg-slate-50",
                              ].join(" ")}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <span>{note.title}</span>
                                {note.unread ? <span className="mt-1 h-2 w-2 rounded-full bg-[#e9ff63]"></span> : null}
                              </div>
                              <p className={[
                                "mt-1 text-xs",
                                isDark ? "text-slate-400" : "text-slate-500",
                              ].join(" ")}>{note.time}</p>
                            </li>
                          ))
                        )}
                      </ul>
                      <button
                        type="button"
                        onClick={() => {
                          setManualNotifications((current) => current.map((note) => ({ ...note, unread: false })));
                        }}
                        className={[
                          "mt-3 rounded-lg px-3 py-2 text-xs font-semibold",
                          isDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-600",
                        ].join(" ")}
                      >
                        Mark Manual as Read
                      </button>
                      <p className={[
                        "mt-2 text-[11px]",
                        isDark ? "text-slate-400" : "text-slate-500",
                      ].join(" ")}>Unread total: {unreadCount}</p>
                    </div>
                  ) : null}

                  {menu === "calendar" ? (
                    <div>
                      <p className="text-sm font-semibold">Calendar</p>
                      <p className={[
                        "mt-1 text-xs",
                        isDark ? "text-slate-400" : "text-slate-500",
                      ].join(" ")}>Today, Aug 19</p>
                      <div className="mt-2 space-y-2">
                        {[
                          ["10:00", "Team standup"],
                          ["13:30", "Inventory sync review"],
                          ["16:00", "POS training"],
                        ].map(([time, title]) => (
                          <div
                            key={time + title}
                            className={[
                              "rounded-xl border p-2.5",
                              isDark ? "border-white/10 bg-white/4" : "border-slate-100 bg-slate-50",
                            ].join(" ")}
                          >
                            <p className="text-xs font-semibold">{time}</p>
                            <p className={[
                              "text-sm",
                              isDark ? "text-slate-200" : "text-slate-700",
                            ].join(" ")}>{title}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {menu === "account" ? (
                    <div>
                      <p className="text-sm font-semibold">{currentUser.name}</p>
                      <p className={[
                        "mt-1 text-xs",
                        isDark ? "text-slate-400" : "text-slate-500",
                      ].join(" ")}>{currentUser.email}</p>
                      <p className={[
                        "mt-1 text-[11px]",
                        isDark ? "text-slate-500" : "text-slate-500",
                      ].join(" ")}>Role: {currentUser.role}</p>

                      <div className="mt-3 space-y-2 rounded-xl border border-white/20 p-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Profile Switcher</p>
                        <input
                          value={profileDraft.name}
                          onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Full name"
                          className={[
                            "w-full rounded-lg border px-2.5 py-2 text-xs outline-none",
                            isDark
                              ? "border-white/15 bg-white/8 text-slate-100 placeholder:text-slate-400"
                              : "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400",
                          ].join(" ")}
                        />
                        <input
                          value={profileDraft.email}
                          onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))}
                          placeholder="Email"
                          className={[
                            "w-full rounded-lg border px-2.5 py-2 text-xs outline-none",
                            isDark
                              ? "border-white/15 bg-white/8 text-slate-100 placeholder:text-slate-400"
                              : "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400",
                          ].join(" ")}
                        />
                        <input
                          value={profileDraft.role}
                          onChange={(event) => setProfileDraft((current) => ({ ...current, role: event.target.value }))}
                          placeholder="Role"
                          className={[
                            "w-full rounded-lg border px-2.5 py-2 text-xs outline-none",
                            isDark
                              ? "border-white/15 bg-white/8 text-slate-100 placeholder:text-slate-400"
                              : "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400",
                          ].join(" ")}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={saveProfileDraft}
                            className="rounded-lg bg-[#e9ff63] px-3 py-2 text-xs font-semibold text-slate-800"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setProfileDraft(currentUser)}
                            className={[
                              "rounded-lg px-3 py-2 text-xs font-semibold",
                              isDark ? "bg-white/12 text-slate-200" : "bg-slate-100 text-slate-600",
                            ].join(" ")}
                          >
                            Reset
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setProfileDraft({ name: "Sarah", email: "owner@ghostlightbooks.com", role: "Owner" })}
                            className={[
                              "rounded-lg px-2 py-1.5 text-[11px] font-semibold",
                              isDark ? "bg-white/8 text-slate-300" : "bg-slate-100 text-slate-600",
                            ].join(" ")}
                          >
                            Load Owner
                          </button>
                          <button
                            type="button"
                            onClick={() => setProfileDraft({ name: "Avery", email: "manager@ghostlightbooks.com", role: "Manager" })}
                            className={[
                              "rounded-lg px-2 py-1.5 text-[11px] font-semibold",
                              isDark ? "bg-white/8 text-slate-300" : "bg-slate-100 text-slate-600",
                            ].join(" ")}
                          >
                            Load Manager
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2">
                        {[
                          "Profile",
                          "Store Settings",
                          "Help Center",
                          "Sign Out",
                        ].map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              if (item === "Store Settings") {
                                onNavigate("/shopify");
                                setMenu("none");
                              } else if (item === "Help Center") {
                                setMenu("none");
                                window.alert("Help Center is coming soon. Use the deployment and connector status panels for live diagnostics.");
                              } else if (item === "Sign Out") {
                                window.localStorage.removeItem("colophon-current-user");
                                onCurrentUserChange({ name: "Sarah", email: "owner@ghostlightbooks.com", role: "Owner" });
                                setMenu("none");
                              }
                            }}
                            className={[
                              "rounded-xl px-3 py-2 text-left text-sm font-medium transition",
                              isDark ? "bg-white/8 hover:bg-white/12" : "bg-slate-50 hover:bg-slate-100",
                            ].join(" ")}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
                </div>
                <p className={["mt-2 w-full text-center text-lg font-semibold tabular-nums", isDark ? "text-slate-300" : "text-slate-600"].join(" ")}>{currentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</p>
              </div>
            </header>
          )}

          <main className={isPosRoute ? "pb-2 pt-0" : "pb-8 pt-5"}>{children}</main>
        </div>
      </div>
    </div>
  );
}

function toolbarButtonClass(isDark: boolean, isActive: boolean): string {
  if (isActive) {
    return "relative grid h-8 w-8 place-items-center rounded-full bg-[#e9ff63] text-slate-800";
  }

  return [
    "relative grid h-8 w-8 place-items-center rounded-full transition",
    isDark ? "bg-white/10 text-slate-200 hover:bg-white/16" : "bg-white/70 text-slate-500 hover:bg-white",
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
      />
      <path
        d="M60 40C63 33 70 33 73 40C70 47 63 47 60 40ZM60 40C57 33 50 33 47 40C50 47 57 47 60 40ZM60 40C67 40 67 47 60 50C53 47 53 40 60 40ZM60 40C67 40 67 33 60 30C53 33 53 40 60 40Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default Shell;
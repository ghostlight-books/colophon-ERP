import { Fragment, useMemo, useState } from "react";

type CalendarCategory = "event" | "rental" | "important";
type CalendarViewMode = "month" | "week" | "day";
type CalendarRecurrence = "none" | "daily" | "weekly" | "monthly";

type CalendarItem = {
  id: string;
  title: string;
  when: string;
  category: CalendarCategory;
  details: string;
  durationMinutes: number;
  recurrence: CalendarRecurrence;
  color: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  supplyList: string[];
};

type CalendarOccurrence = {
  occurrenceId: string;
  sourceId: string;
  title: string;
  category: CalendarCategory;
  details: string;
  recurrence: CalendarRecurrence;
  durationMinutes: number;
  startsAt: Date;
  endsAt: Date;
  color: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  supplyList: string[];
};

const seedItems: CalendarItem[] = [
  {
    id: "CAL-101",
    title: "Author Signing - Main Floor",
    when: "2026-08-23T14:00",
    category: "event",
    details: "Set up 40 chairs, mic check at 1:15 PM, signed copies at front desk.",
    durationMinutes: 90,
    recurrence: "none",
    color: "#67e8f9",
    contactName: "Melissa Park",
    contactPhone: "(615) 555-0199",
    contactEmail: "melissa@example.com",
    supplyList: ["40 folding chairs", "Wireless mic", "Signing table"],
  },
  {
    id: "CAL-102",
    title: "Community Room Rental",
    when: "2026-08-24T10:30",
    category: "rental",
    details: "Local school board meeting, projector + coffee service requested.",
    durationMinutes: 120,
    recurrence: "weekly",
    color: "#fcd34d",
    contactName: "Jordan Mills",
    contactPhone: "(615) 555-0144",
    contactEmail: "jordan@example.com",
    supplyList: ["Projector", "Coffee service", "Name placards"],
  },
  {
    id: "CAL-103",
    title: "Back-to-School Promo Launch",
    when: "2026-08-25T09:00",
    category: "important",
    details: "All floor staff mention 15% educator discount at checkout.",
    durationMinutes: 60,
    recurrence: "none",
    color: "#fda4af",
    contactName: "Sarah",
    contactPhone: "(615) 555-0100",
    contactEmail: "owner@ghostlightbooks.com",
    supplyList: ["Counter signs", "Promo bookmarks", "Staff huddle notes"],
  },
];

const categoryStyles: Record<CalendarCategory, string> = {
  event: "bg-cyan-100 text-cyan-700",
  rental: "bg-amber-100 text-amber-700",
  important: "bg-rose-100 text-rose-700",
};

const categoryLabels: Record<CalendarCategory, string> = {
  event: "Event",
  rental: "Rental",
  important: "Important",
};

const recurrenceLabels: Record<CalendarRecurrence, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const weekDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const timeSlots = Array.from({ length: 15 }, (_, index) => 7 + index);
const defaultCreateColor = "#60a5fa";

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function monthTitle(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function dayTitle(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function shortDayTitle(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" }).format(date);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toLocalDateTimeValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function buildMonthGrid(monthDate: Date): Date[] {
  const firstOfMonth = startOfMonth(monthDate);
  const monthStartWeekday = firstOfMonth.getDay();
  const firstGridDate = addDays(firstOfMonth, -monthStartWeekday);
  return Array.from({ length: 42 }, (_, index) => addDays(firstGridDate, index));
}

function formatHour(hour: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2026, 0, 1, hour, 0, 0));
}

function weekRangeTitle(date: Date): string {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  const startLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(start);
  const endLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(end);
  return `${startLabel} - ${endLabel}`;
}

function clampDuration(minutes: number): number {
  return Math.min(720, Math.max(15, minutes));
}

function getCalendarRange(viewMode: CalendarViewMode, visibleDate: Date): { start: Date; end: Date } {
  if (viewMode === "month") {
    const monthDays = buildMonthGrid(visibleDate);
    const start = new Date(monthDays[0]);
    start.setHours(0, 0, 0, 0);
    const end = new Date(monthDays[monthDays.length - 1]);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (viewMode === "week") {
    const start = startOfWeek(visibleDate);
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  const start = new Date(visibleDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(visibleDate);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getContrastTextColor(hexColor: string): string {
  const normalized = hexColor.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "#0f172a";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 150 ? "#0f172a" : "#f8fafc";
}

function parseSupplyList(raw: string): string[] {
  return raw
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function formatSupplyList(items: string[]): string {
  return items.join("\n");
}

function buildOccurrences(item: CalendarItem, rangeStart: Date, rangeEnd: Date, cap = 300): CalendarOccurrence[] {
  const base = new Date(item.when);
  if (Number.isNaN(base.getTime())) {
    return [];
  }

  const results: CalendarOccurrence[] = [];
  const duration = clampDuration(item.durationMinutes);
  let cursor = new Date(base);
  let guard = 0;

  if (item.recurrence === "none") {
    const end = new Date(cursor.getTime() + duration * 60_000);
    if (cursor <= rangeEnd && end >= rangeStart) {
      results.push({
        occurrenceId: `${item.id}-${cursor.getTime()}`,
        sourceId: item.id,
        title: item.title,
        category: item.category,
        details: item.details,
        recurrence: item.recurrence,
        durationMinutes: duration,
        startsAt: cursor,
        endsAt: end,
        color: item.color,
        contactName: item.contactName,
        contactPhone: item.contactPhone,
        contactEmail: item.contactEmail,
        supplyList: item.supplyList,
      });
    }
    return results;
  }

  while (cursor < rangeStart && guard < cap) {
    if (item.recurrence === "daily") {
      cursor = addDays(cursor, 1);
    } else if (item.recurrence === "weekly") {
      cursor = addDays(cursor, 7);
    } else {
      cursor = addMonths(cursor, 1);
    }
    guard += 1;
  }

  while (cursor <= rangeEnd && guard < cap) {
    const end = new Date(cursor.getTime() + duration * 60_000);
    if (end >= rangeStart) {
      results.push({
        occurrenceId: `${item.id}-${cursor.getTime()}`,
        sourceId: item.id,
        title: item.title,
        category: item.category,
        details: item.details,
        recurrence: item.recurrence,
        durationMinutes: duration,
        startsAt: new Date(cursor),
        endsAt: end,
        color: item.color,
        contactName: item.contactName,
        contactPhone: item.contactPhone,
        contactEmail: item.contactEmail,
        supplyList: item.supplyList,
      });
    }

    if (item.recurrence === "daily") {
      cursor = addDays(cursor, 1);
    } else if (item.recurrence === "weekly") {
      cursor = addDays(cursor, 7);
    } else {
      cursor = addMonths(cursor, 1);
    }
    guard += 1;
  }

  return results;
}

function CalendarPage(): JSX.Element {
  const [items, setItems] = useState<CalendarItem[]>(seedItems);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [visibleDate, setVisibleDate] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [createTitle, setCreateTitle] = useState("");
  const [createCategory, setCreateCategory] = useState<CalendarCategory>("event");
  const [createColor, setCreateColor] = useState(defaultCreateColor);
  const [createStart, setCreateStart] = useState<string>(() => {
    const now = new Date();
    now.setHours(10, 0, 0, 0);
    return toLocalDateTimeValue(now);
  });
  const [createEnd, setCreateEnd] = useState<string>(() => {
    const now = new Date();
    now.setHours(11, 0, 0, 0);
    return toLocalDateTimeValue(now);
  });
  const [createContactName, setCreateContactName] = useState("");
  const [createContactPhone, setCreateContactPhone] = useState("");
  const [createContactEmail, setCreateContactEmail] = useState("");
  const [createSupplyList, setCreateSupplyList] = useState("");
  const [createDetails, setCreateDetails] = useState("");
  const [createRecurrence, setCreateRecurrence] = useState<CalendarRecurrence>("none");

  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState<CalendarCategory>("event");
  const [editColor, setEditColor] = useState(defaultCreateColor);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editContactName, setEditContactName] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editSupplyList, setEditSupplyList] = useState("");
  const [editDetails, setEditDetails] = useState("");
  const [editRecurrence, setEditRecurrence] = useState<CalendarRecurrence>("none");

  const monthDays = useMemo(() => buildMonthGrid(visibleDate), [visibleDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(visibleDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [visibleDate]);

  const visibleRange = useMemo(() => getCalendarRange(viewMode, visibleDate), [viewMode, visibleDate]);

  const visibleOccurrences = useMemo(() => {
    return items
      .flatMap((item) => buildOccurrences(item, visibleRange.start, visibleRange.end))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }, [items, visibleRange]);

  const upcomingRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, 60);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, []);

  const upcomingOccurrences = useMemo(() => {
    return items
      .flatMap((item) => buildOccurrences(item, upcomingRange.start, upcomingRange.end, 700))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, 80);
  }, [items, upcomingRange]);

  const occurrencesByDay = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const occurrence of visibleOccurrences) {
      const key = getDayKey(occurrence.startsAt);
      const existing = map.get(key) ?? [];
      existing.push(occurrence);
      map.set(key, existing);
    }

    for (const [key, list] of map.entries()) {
      list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      map.set(key, list);
    }

    return map;
  }, [visibleOccurrences]);

  const selectedDayOccurrences = useMemo(() => {
    return visibleOccurrences.filter((entry) => sameDay(entry.startsAt, selectedDay));
  }, [visibleOccurrences, selectedDay]);

  function openCreateModal(day: Date, hour?: number): void {
    const start = new Date(day);
    start.setHours(hour ?? 10, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);
    setSelectedDay(day);
    setVisibleDate(day);
    setCreateTitle("");
    setCreateCategory("event");
    setCreateColor(defaultCreateColor);
    setCreateStart(toLocalDateTimeValue(start));
    setCreateEnd(toLocalDateTimeValue(end));
    setCreateContactName("");
    setCreateContactPhone("");
    setCreateContactEmail("");
    setCreateSupplyList("");
    setCreateDetails("");
    setCreateRecurrence("none");
    setIsCreateModalOpen(true);
  }

  function addItem(): void {
    const trimmedTitle = createTitle.trim();
    const start = new Date(createStart);
    const end = new Date(createEnd);
    if (!trimmedTitle || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return;
    }

    const next: CalendarItem = {
      id: `CAL-${Date.now()}`,
      title: trimmedTitle,
      when: createStart,
      category: createCategory,
      details: createDetails.trim() || "No extra details.",
      durationMinutes: clampDuration(Math.round((end.getTime() - start.getTime()) / 60_000)),
      recurrence: createRecurrence,
      color: createColor,
      contactName: createContactName.trim(),
      contactPhone: createContactPhone.trim(),
      contactEmail: createContactEmail.trim(),
      supplyList: parseSupplyList(createSupplyList),
    };

    setItems((current) => [next, ...current]);
    setIsCreateModalOpen(false);
  }

  function removeItem(sourceId: string): void {
    setItems((current) => current.filter((item) => item.id !== sourceId));
    if (editingSourceId === sourceId) {
      setEditingSourceId(null);
    }
  }

  function selectDay(day: Date): void {
    setSelectedDay(day);
    setVisibleDate(day);
  }

  function jumpPeriod(offset: number): void {
    setVisibleDate((current) => {
      if (viewMode === "month") {
        return new Date(current.getFullYear(), current.getMonth() + offset, 1);
      }

      if (viewMode === "week") {
        return addDays(current, offset * 7);
      }

      return addDays(current, offset);
    });
  }

  function jumpToday(): void {
    const now = new Date();
    setVisibleDate(now);
    setSelectedDay(now);
  }

  function getHeaderTitle(): string {
    if (viewMode === "month") {
      return monthTitle(visibleDate);
    }
    if (viewMode === "week") {
      return weekRangeTitle(visibleDate);
    }
    return dayTitle(visibleDate);
  }

  function moveItemToDay(sourceId: string, targetDay: Date, hour?: number): void {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== sourceId) {
          return item;
        }

        const sourceDate = new Date(item.when);
        const next = new Date(targetDay);
        const sourceHour = Number.isNaN(sourceDate.getTime()) ? 10 : sourceDate.getHours();
        const sourceMinute = Number.isNaN(sourceDate.getTime()) ? 0 : sourceDate.getMinutes();
        next.setHours(typeof hour === "number" ? hour : sourceHour, sourceMinute, 0, 0);

        return {
          ...item,
          when: toLocalDateTimeValue(next),
        };
      }),
    );
  }

  function openEditor(occurrence: CalendarOccurrence): void {
    const source = items.find((item) => item.id === occurrence.sourceId);
    if (!source) {
      return;
    }

    const start = new Date(source.when);
    const end = new Date(start.getTime() + source.durationMinutes * 60_000);

    setEditingSourceId(source.id);
    setEditTitle(source.title);
    setEditCategory(source.category);
    setEditColor(source.color);
    setEditStart(toLocalDateTimeValue(start));
    setEditEnd(toLocalDateTimeValue(end));
    setEditContactName(source.contactName);
    setEditContactPhone(source.contactPhone);
    setEditContactEmail(source.contactEmail);
    setEditSupplyList(formatSupplyList(source.supplyList));
    setEditDetails(source.details);
    setEditRecurrence(source.recurrence);
  }

  function saveEditor(): void {
    if (!editingSourceId) {
      return;
    }

    const nextTitle = editTitle.trim();
    const start = new Date(editStart);
    const end = new Date(editEnd);
    if (!nextTitle || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.id === editingSourceId
          ? {
              ...item,
              title: nextTitle,
              when: editStart,
              category: editCategory,
              details: editDetails.trim() || "No extra details.",
              durationMinutes: clampDuration(Math.round((end.getTime() - start.getTime()) / 60_000)),
              recurrence: editRecurrence,
              color: editColor,
              contactName: editContactName.trim(),
              contactPhone: editContactPhone.trim(),
              contactEmail: editContactEmail.trim(),
              supplyList: parseSupplyList(editSupplyList),
            }
          : item,
      ),
    );

    setEditingSourceId(null);
  }

  function resizeItemDuration(sourceId: string, deltaMinutes: number): void {
    setItems((current) =>
      current.map((item) =>
        item.id === sourceId
          ? {
              ...item,
              durationMinutes: clampDuration(item.durationMinutes + deltaMinutes),
            }
          : item,
      ),
    );
  }

  function handleDropOnDay(targetDay: Date): void {
    if (!draggingItemId) {
      return;
    }
    moveItemToDay(draggingItemId, targetDay);
    setDraggingItemId(null);
  }

  function handleDropOnSlot(targetDay: Date, hour: number): void {
    if (!draggingItemId) {
      return;
    }
    moveItemToDay(draggingItemId, targetDay, hour);
    setDraggingItemId(null);
  }

  function renderEventChip(occurrence: CalendarOccurrence, compact = false): JSX.Element {
    const textColor = getContrastTextColor(occurrence.color);

    return (
      <div
        key={occurrence.occurrenceId}
        draggable
        onDragStart={() => setDraggingItemId(occurrence.sourceId)}
        onDragEnd={() => setDraggingItemId(null)}
        onClick={(event) => {
          event.stopPropagation();
          openEditor(occurrence);
        }}
        className="w-full cursor-grab rounded-md px-1.5 py-1 text-left text-[11px] font-medium active:cursor-grabbing"
        style={{ backgroundColor: occurrence.color, color: textColor }}
        title={`${occurrence.title} - ${formatWhen(occurrence.startsAt)}`}
      >
        {compact ? (
          <>
            <p className="leading-tight opacity-85">{formatTime(occurrence.startsAt)}</p>
            <p className="whitespace-normal break-words leading-tight">{occurrence.title}</p>
          </>
        ) : (
          <>
            <p className="whitespace-normal break-words leading-tight">{occurrence.title}</p>
            <p className="leading-tight opacity-85">{formatTime(occurrence.startsAt)} - {formatTime(occurrence.endsAt)}</p>
          </>
        )}
      </div>
    );
  }

  function renderOccurrenceCard(occurrence: CalendarOccurrence): JSX.Element {
    return (
      <article key={occurrence.occurrenceId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border border-white/70 shadow-sm" style={{ backgroundColor: occurrence.color }} aria-hidden="true"></span>
            <h3 className="text-sm font-semibold text-slate-800">{occurrence.title}</h3>
          </div>
          <span className={["rounded-full px-2 py-0.5 text-[11px] font-semibold", categoryStyles[occurrence.category]].join(" ")}>
            {categoryLabels[occurrence.category]}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">{formatWhen(occurrence.startsAt)} - {formatTime(occurrence.endsAt)}</p>
        <p className="text-[11px] text-slate-500">{recurrenceLabels[occurrence.recurrence]}</p>
        {occurrence.contactName ? <p className="mt-2 text-sm text-slate-700">Contact: {occurrence.contactName}</p> : null}
        {occurrence.contactPhone ? <p className="text-sm text-slate-600">Phone: {occurrence.contactPhone}</p> : null}
        {occurrence.contactEmail ? <p className="text-sm text-slate-600">Email: {occurrence.contactEmail}</p> : null}
        {occurrence.supplyList.length > 0 ? <p className="mt-2 text-sm text-slate-600">Supplies: {occurrence.supplyList.join(", ")}</p> : null}
        <p className="mt-2 text-sm text-slate-700">{occurrence.details}</p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => openEditor(occurrence)}
            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => removeItem(occurrence.sourceId)}
            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500"
          >
            Remove Series
          </button>
        </div>
      </article>
    );
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => jumpPeriod(-1)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => jumpPeriod(1)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Next
          </button>
          <button
            type="button"
            onClick={jumpToday}
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-700"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => openCreateModal(selectedDay)}
            className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100"
          >
            New Event
          </button>

          <p className="ml-1 text-sm font-semibold text-slate-700">{getHeaderTitle()}</p>

          <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {(["month", "week", "day"] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  viewMode === mode ? "bg-white text-slate-700" : "text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-500">Double-click any day or time slot to open the full event form.</p>

        {viewMode === "month" ? (
          <>
            <div className="mt-3 grid grid-cols-7 gap-2 text-xs font-semibold text-slate-500">
              {weekDayLabels.map((label) => (
                <div key={label} className="rounded-lg bg-slate-50 px-2 py-1 text-center">{label}</div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {monthDays.map((day) => {
                const inCurrentMonth = day.getMonth() === visibleDate.getMonth();
                const today = sameDay(day, new Date());
                const selected = sameDay(day, selectedDay);
                const dayItems = occurrencesByDay.get(getDayKey(day)) ?? [];

                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    onClick={() => selectDay(day)}
                    onDoubleClick={() => openCreateModal(day)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDropOnDay(day)}
                    className={[
                      "min-h-32 rounded-xl border p-2 text-left transition",
                      inCurrentMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 text-slate-400",
                      selected ? "ring-2 ring-cyan-400" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between">
                      <span className={[
                        "text-xs font-semibold",
                        today ? "rounded-full bg-cyan-600 px-2 py-0.5 text-white" : "text-slate-700",
                      ].join(" ")}
                      >
                        {day.getDate()}
                      </span>
                      {dayItems.length > 0 ? (
                        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{dayItems.length}</span>
                      ) : null}
                    </div>

                    <div className="mt-1 space-y-1">
                      {dayItems.slice(0, 2).map((occurrence) => renderEventChip(occurrence, true))}
                      {dayItems.length > 2 ? <p className="text-[11px] text-slate-500">+{dayItems.length - 2} more</p> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <div className={viewMode === "week" ? "min-w-[980px]" : "min-w-[520px]"}>
              <div className={viewMode === "week" ? "grid grid-cols-[80px_repeat(7,minmax(0,1fr))]" : "grid grid-cols-[80px_minmax(0,1fr)]"}>
                <div className="border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-500">Time</div>
                {(viewMode === "week" ? weekDays : [visibleDate]).map((day) => (
                  <button
                    type="button"
                    key={day.toISOString()}
                    onClick={() => selectDay(day)}
                    className={[
                      "border-b border-r border-slate-200 px-2 py-2 text-sm font-semibold",
                      sameDay(day, selectedDay) ? "bg-cyan-50 text-cyan-700" : "bg-white text-slate-700",
                    ].join(" ")}
                  >
                    {shortDayTitle(day)}
                  </button>
                ))}

                {timeSlots.map((hour) => (
                  <Fragment key={`row-${hour}`}>
                    <div className="border-b border-r border-slate-200 bg-slate-50 px-2 py-3 text-xs text-slate-500">
                      {formatHour(hour)}
                    </div>
                    {(viewMode === "week" ? weekDays : [visibleDate]).map((day) => {
                      const dayItems = occurrencesByDay.get(getDayKey(day)) ?? [];
                      const slotItems = dayItems.filter((occurrence) => {
                        const startHour = occurrence.startsAt.getHours();
                        const endHour = Math.max(startHour + 1, occurrence.endsAt.getHours() + (occurrence.endsAt.getMinutes() > 0 ? 1 : 0));
                        return hour >= startHour && hour < endHour;
                      });

                      return (
                        <button
                          type="button"
                          key={`${day.toISOString()}-${hour}`}
                          onClick={() => {
                            setSelectedDay(day);
                            setVisibleDate(day);
                          }}
                          onDoubleClick={() => openCreateModal(day, hour)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => handleDropOnSlot(day, hour)}
                          className="min-h-16 border-b border-r border-slate-200 bg-white p-1 text-left align-top"
                        >
                          <div className="space-y-1">
                            {slotItems.slice(0, 1).map((occurrence) => (
                              <div key={`${occurrence.occurrenceId}-${hour}`} className="space-y-1">
                                {renderEventChip(occurrence, true)}
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      resizeItemDuration(occurrence.sourceId, -30);
                                    }}
                                    className="rounded bg-white/80 px-1 py-0.5 text-[10px] font-semibold text-slate-600"
                                  >
                                    -30m
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      resizeItemDuration(occurrence.sourceId, 30);
                                    }}
                                    className="rounded bg-white/80 px-1 py-0.5 text-[10px] font-semibold text-slate-600"
                                  >
                                    +30m
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-800">Selected Day Items</h2>
          <p className="mt-1 text-xs text-cyan-700">{dayTitle(selectedDay)}</p>
          <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {selectedDayOccurrences.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">No items on selected day.</p>
            ) : (
              selectedDayOccurrences.map((occurrence) => renderOccurrenceCard(occurrence))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-800">Upcoming (Next 60 Days)</h2>
        <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {upcomingOccurrences.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">No items yet.</p>
          ) : (
            upcomingOccurrences.map((occurrence) => renderOccurrenceCard(occurrence))
          )}
        </div>
      </div>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-900/35 p-4">
          <div className="relative z-[121] w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">New Event</h3>
                <p className="text-xs text-slate-500">Add full event details for {dayTitle(selectedDay)}.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Event Name
                <input
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Color
                <input
                  type="color"
                  value={createColor}
                  onChange={(event) => setCreateColor(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-2"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Start Time
                <input
                  type="datetime-local"
                  value={createStart}
                  onChange={(event) => setCreateStart(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                End Time
                <input
                  type="datetime-local"
                  value={createEnd}
                  onChange={(event) => setCreateEnd(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Type
                <select
                  value={createCategory}
                  onChange={(event) => setCreateCategory(event.target.value as CalendarCategory)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                >
                  <option value="event">Event</option>
                  <option value="rental">Rental</option>
                  <option value="important">Important</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Repeats
                <select
                  value={createRecurrence}
                  onChange={(event) => setCreateRecurrence(event.target.value as CalendarRecurrence)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Contact Name
                <input
                  value={createContactName}
                  onChange={(event) => setCreateContactName(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Phone Number
                <input
                  value={createContactPhone}
                  onChange={(event) => setCreateContactPhone(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                Email
                <input
                  type="email"
                  value={createContactEmail}
                  onChange={(event) => setCreateContactEmail(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                Supply List
                <textarea
                  value={createSupplyList}
                  onChange={(event) => setCreateSupplyList(event.target.value)}
                  placeholder="One per line or comma separated"
                  className="min-h-24 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                Notes
                <textarea
                  value={createDetails}
                  onChange={(event) => setCreateDetails(event.target.value)}
                  className="min-h-24 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={addItem}
                className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700"
              >
                Save Event
              </button>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingSourceId ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-900/35 p-4">
          <div className="relative z-[121] w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Edit Event</h3>
              <button
                type="button"
                onClick={() => setEditingSourceId(null)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Event Name
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Color
                <input
                  type="color"
                  value={editColor}
                  onChange={(event) => setEditColor(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-2"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Start Time
                <input
                  type="datetime-local"
                  value={editStart}
                  onChange={(event) => setEditStart(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                End Time
                <input
                  type="datetime-local"
                  value={editEnd}
                  onChange={(event) => setEditEnd(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Type
                <select
                  value={editCategory}
                  onChange={(event) => setEditCategory(event.target.value as CalendarCategory)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                >
                  <option value="event">Event</option>
                  <option value="rental">Rental</option>
                  <option value="important">Important</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Repeats
                <select
                  value={editRecurrence}
                  onChange={(event) => setEditRecurrence(event.target.value as CalendarRecurrence)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Contact Name
                <input
                  value={editContactName}
                  onChange={(event) => setEditContactName(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600">
                Phone Number
                <input
                  value={editContactPhone}
                  onChange={(event) => setEditContactPhone(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                Email
                <input
                  type="email"
                  value={editContactEmail}
                  onChange={(event) => setEditContactEmail(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                Supply List
                <textarea
                  value={editSupplyList}
                  onChange={(event) => setEditSupplyList(event.target.value)}
                  placeholder="One per line or comma separated"
                  className="min-h-24 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-slate-600 md:col-span-2">
                Notes
                <textarea
                  value={editDetails}
                  onChange={(event) => setEditDetails(event.target.value)}
                  className="min-h-24 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal text-slate-700 outline-none focus:border-cyan-400"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={saveEditor}
                className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editingSourceId) {
                    removeItem(editingSourceId);
                  }
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"
              >
                Delete Series
              </button>
              <button
                type="button"
                onClick={() => setEditingSourceId(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default CalendarPage;

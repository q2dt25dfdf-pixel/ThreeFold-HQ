"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Home, Plus, Trash2 } from "lucide-react";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type Assignee = "Alliyah" | "Hannah" | "Jordan";
type FilterOption = "All Events" | "Alliyah" | "Hannah" | "Jordan" | "Shared";
type Priority = "High" | "Medium" | "Low";
type EventType = "Client Meeting" | "Demo" | "Video Call" | "Delivery" | "Deadline" | "Internal Meeting" | "Other";

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  endTime?: string;
  assignedTo: Assignee[];
  type: EventType;
  priority?: Priority;
  notes?: string;
};

type CalendarView = "today" | "week" | "month";

const ASSIGNEES: Assignee[] = ["Alliyah", "Hannah", "Jordan"];
const eventTypes: EventType[] = ["Client Meeting", "Delivery", "Deadline", "Internal Meeting", "Other"];
const filterOptions: FilterOption[] = ["All Events", "Alliyah", "Hannah", "Jordan", "Shared"];

const eventTypeColors: Record<EventType, string> = {
  "Client Meeting": "border-l-2 border-blue-400 bg-blue-100 text-blue-700",
  Demo: "border-l-2 border-indigo-400 bg-indigo-100 text-indigo-700",
  "Video Call": "border-l-2 border-cyan-400 bg-cyan-100 text-cyan-700",
  Delivery: "border-l-2 border-emerald-400 bg-emerald-100 text-emerald-700",
  Deadline: "border-l-2 border-rose-500 bg-rose-100 text-rose-700",
  "Internal Meeting": "border-l-2 border-violet-400 bg-violet-100 text-violet-700",
  Other: "border-l-2 border-slate-400 bg-slate-100 text-slate-700",
};

const eventTypeDotColors: Record<EventType, string> = {
  "Client Meeting": "bg-blue-500",
  Demo: "bg-indigo-500",
  "Video Call": "bg-cyan-500",
  Delivery: "bg-emerald-500",
  Deadline: "bg-rose-500",
  "Internal Meeting": "bg-violet-500",
  Other: "bg-slate-400",
};

const assigneePillColors: Record<Assignee, string> = {
  Alliyah: "bg-violet-100 text-violet-700",
  Hannah: "bg-blue-100 text-blue-700",
  Jordan: "bg-emerald-100 text-emerald-700",
};

const assigneeActiveColors: Record<Assignee, string> = {
  Alliyah: "border-violet-400 bg-violet-100 text-violet-800",
  Hannah: "border-blue-400 bg-blue-100 text-blue-800",
  Jordan: "border-emerald-400 bg-emerald-100 text-emerald-800",
};

const emptyEvent = {
  title: "",
  date: "",
  time: "",
  assignedTo: [] as Assignee[],
  type: "Client Meeting" as EventType,
  notes: "",
};

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourSlots = Array.from({ length: 13 }, (_, i) => i + 8);

function normalizeAssignedTo(raw: unknown): Assignee[] {
  if (Array.isArray(raw)) return raw as Assignee[];
  if (typeof raw === "string") {
    if (raw === "All") return ["Alliyah", "Hannah", "Jordan"];
    if (raw.includes(",")) return raw.split(",") as Assignee[];
    if (raw === "") return [];
    return [raw as Assignee];
  }
  return [];
}

function eventMatchesFilter(assignedTo: Assignee[], filter: FilterOption): boolean {
  if (filter === "All Events") return true;
  if (filter === "Shared") return assignedTo.length >= 2;
  if (filter === "Alliyah") return assignedTo.includes("Alliyah");
  if (filter === "Hannah") return assignedTo.includes("Hannah");
  if (filter === "Jordan") return assignedTo.includes("Jordan");
  return true;
}

function formatAssignedTo(assignedTo: Assignee[]): string {
  if (assignedTo.length === 0) return "Unassigned";
  if (ASSIGNEES.every((a) => assignedTo.includes(a))) return "Team";
  return assignedTo.join(", ");
}

function formatTimeRange(event: CalendarEvent): string {
  if (!event.time) return "";
  if (!event.endTime) return event.time;
  return `${event.time} to ${event.endTime}`;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return start;
}

function toggleAssignee(current: Assignee[], assignee: Assignee): Assignee[] {
  return current.includes(assignee) ? current.filter((a) => a !== assignee) : [...current, assignee];
}

function PriorityDot({ priority }: { priority: Priority }) {
  return (
    <span
      className={`ml-1 inline-block h-2 w-2 shrink-0 rounded-full ${priority === "High" ? "bg-red-500" : priority === "Medium" ? "bg-amber-500" : "bg-slate-400"}`}
      aria-label={`${priority} priority`}
    />
  );
}

function eventPriority(event: CalendarEvent): Priority {
  return event.priority ?? "Low";
}

function AssigneeChips({ assignees }: { assignees: Assignee[] }) {
  if (assignees.length === 0) return null;
  const isTeam = ASSIGNEES.every((a) => assignees.includes(a));
  if (isTeam) {
    return (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
        Team
      </span>
    );
  }
  return (
    <>
      {assignees.map((a) => (
        <span
          key={a}
          title={a}
          className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${assigneePillColors[a]}`}
        >
          {a[0]}
        </span>
      ))}
    </>
  );
}

function EventPill({
  event,
  prefix,
  onDelete,
  onOpen,
}: {
  event: CalendarEvent;
  prefix?: string;
  onDelete?: (id: string) => void;
  onOpen?: (event: CalendarEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`flex w-full items-center overflow-hidden whitespace-nowrap rounded-md px-2 py-0.5 text-left text-xs font-semibold ${eventTypeColors[event.type] ?? eventTypeColors.Other}`}
      onClick={(e) => { e.stopPropagation(); onOpen?.(event); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpen?.(event); }
      }}
    >
      <span className="min-w-0 truncate">{prefix}{event.title}</span>
      <PriorityDot priority={eventPriority(event)} />
      <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-1">
        <AssigneeChips assignees={event.assignedTo} />
        {onDelete && (
          <button
            type="button"
            className="ml-0.5 shrink-0 rounded-full p-0.5 text-rose-600 hover:bg-rose-50"
            aria-label={`Delete ${event.title}`}
            onClick={(e) => { e.stopPropagation(); onDelete(event.id); }}
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

function AssigneeSelector({ value, onChange }: { value: Assignee[]; onChange: (v: Assignee[]) => void }) {
  return (
    <div className="flex gap-2">
      {ASSIGNEES.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(toggleAssignee(value, a))}
          className={`flex-1 rounded-2xl border px-2 py-2.5 text-xs font-semibold transition ${
            value.includes(a)
              ? assigneeActiveColors[a]
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

function AgendaEventCard({
  event,
  onOpen,
  onDelete,
  deletingId,
}: {
  event: CalendarEvent;
  onOpen: (e: CalendarEvent) => void;
  onDelete: (id: string) => void;
  deletingId: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex cursor-pointer items-center gap-3 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50 active:bg-slate-100"
      onClick={() => onOpen(event)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(event); } }}
    >
      <div className={`w-1 shrink-0 self-stretch rounded-full ${eventTypeDotColors[event.type] ?? "bg-slate-400"}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-950">{event.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{event.time || "All day"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="flex items-center gap-0.5">
          <AssigneeChips assignees={event.assignedTo} />
        </div>
        <PriorityDot priority={eventPriority(event)} />
        <button
          type="button"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
          aria-label={`Delete ${event.title}`}
          disabled={deletingId === event.id}
          onClick={(e) => { e.stopPropagation(); onDelete(event.id); }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [today] = useState(new Date());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<CalendarView>("month");
  const [mobileView, setMobileView] = useState<"agenda" | "grid">("agenda");
  const [filterOwner, setFilterOwner] = useState<FilterOption>("All Events");
  const { data: rawEvents, upsertItem, deleteItem, loading: eventsLoading, error } = useSupabaseTable<CalendarEvent>("calendar_events", []);
  const [showAdd, setShowAdd] = useState(false);
  const [showTodayDetails, setShowTodayDetails] = useState(false);
  const [form, setForm] = useState(() => ({ ...emptyEvent, date: formatDate(new Date()) }));
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventDraft, setEventDraft] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState(false);
  const addSave = useSaveState();
  const eventSave = useSaveState();
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const monthLabel = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const todayKey = formatDate(today);
  const todayLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const weekLabel = `${currentWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(currentWeek.getFullYear(), currentWeek.getMonth(), currentWeek.getDate() + 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const currentViewLabel = view === "week" ? weekLabel : view === "today" ? todayLabel : monthLabel;
  const gridTemplateColumns = "4rem repeat(7, minmax(0, 1fr))";

  const normalizedEvents = useMemo(() => {
    return rawEvents.map((e) => ({
      ...e,
      assignedTo: normalizeAssignedTo(e.assignedTo as unknown),
    }));
  }, [rawEvents]);

  const filteredEvents = useMemo(() => {
    return normalizedEvents.filter((e) => eventMatchesFilter(e.assignedTo, filterOwner));
  }, [normalizedEvents, filterOwner]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return { date, key: formatDate(date), inMonth: date.getMonth() === currentDate.getMonth() };
    });
  }, [currentDate]);

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(currentWeek);
      date.setDate(currentWeek.getDate() + i);
      return { date, key: formatDate(date) };
    });
  }, [currentWeek]);

  const eventsByDate = useMemo(() => {
    return filteredEvents
      .filter((e) => isValidDate(e.date))
      .reduce<Record<string, CalendarEvent[]>>((acc, event) => {
        acc[event.date] = [...(acc[event.date] ?? []), event];
        return acc;
      }, {});
  }, [filteredEvents]);

  const upcomingEvents = useMemo(() => {
    return [...filteredEvents]
      .filter((e) => isValidDate(e.date))
      .sort((a, b) => {
        const ds = a.date.localeCompare(b.date);
        return ds !== 0 ? ds : (a.time ?? "").localeCompare(b.time ?? "");
      });
  }, [filteredEvents]);

  const agendaGroups = useMemo(() => {
    const grouped = upcomingEvents
      .filter((e) => e.date >= todayKey)
      .reduce<Record<string, CalendarEvent[]>>((acc, e) => {
        acc[e.date] = [...(acc[e.date] ?? []), e];
        return acc;
      }, {});
    return Object.keys(grouped)
      .sort()
      .map((dateKey) => {
        const date = new Date(dateKey + "T00:00:00");
        const isToday = dateKey === todayKey;
        const label = isToday
          ? "Today"
          : date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
        return { dateKey, label, isToday, events: grouped[dateKey] };
      });
  }, [upcomingEvents, todayKey]);

  const changeMonth = (offset: number) => {
    setCurrentDate((c) => new Date(c.getFullYear(), c.getMonth() + offset, 1));
  };

  const changeWeek = (offset: number) => {
    setCurrentWeek((c) => {
      const next = new Date(c);
      next.setDate(c.getDate() + offset * 7);
      return next;
    });
  };

  const handlePrevious = () => {
    if (view === "today") return;
    if (view === "week") { changeWeek(-1); return; }
    changeMonth(-1);
  };

  const handleNext = () => {
    if (view === "today") return;
    if (view === "week") { changeWeek(1); return; }
    changeMonth(1);
  };

  const goToToday = () => {
    const d = new Date();
    setCurrentDate(new Date(d));
    const ws = new Date(d);
    ws.setDate(d.getDate() - d.getDay());
    setCurrentWeek(ws);
  };

  const freshForm = () => ({ ...emptyEvent, date: formatDate(new Date()) });

  const handleAddEvent = async () => {
    if (!form.title.trim()) { setFormError("Event title is required."); return; }
    if (!form.date) { setFormError("Event date is required."); return; }
    setFormError("");
    const newEvent = { id: `event-${Date.now()}`, ...form };
    await addSave.runSave(async () => {
      const response = await upsertItem(newEvent);
      if (!response.error) setForm(freshForm());
      return response;
    }, () => setShowAdd(false));
  };

  const handleDeleteEvent = (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    setDeletingId(id);
    void deleteItem(id).finally(() => setDeletingId(""));
    setSelectedEvent(null);
    setEventDraft(null);
    setEditingEvent(false);
  };

  const openEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventDraft({ ...event, priority: eventPriority(event), notes: event.notes ?? "" });
    setEditingEvent(false);
    eventSave.resetSaveState();
    setFormError("");
    setShowTodayDetails(false);
  };

  const closeEvent = () => {
    setSelectedEvent(null);
    setEventDraft(null);
    setEditingEvent(false);
    eventSave.resetSaveState();
  };

  const handleSaveEvent = async () => {
    if (!eventDraft) return;
    if (!eventDraft.title.trim()) { setFormError("Event title is required."); return; }
    if (!eventDraft.date) { setFormError("Event date is required."); return; }
    setFormError("");
    await eventSave.runSave(async () => {
      const response = await upsertItem(eventDraft);
      if (!response.error) setSelectedEvent(eventDraft);
      return response;
    }, () => closeEvent());
  };

  if (eventsLoading) return <LoadingState label="Loading calendar..." />;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <ErrorBanner message={error} />

      {/* Mobile header */}
      <div className="space-y-3 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex overflow-hidden rounded-xl border border-slate-300 bg-white">
            <button
              type="button"
              className={`min-h-11 px-4 py-2 text-xs font-semibold transition ${mobileView === "agenda" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setMobileView("agenda")}
            >
              Agenda
            </button>
            <button
              type="button"
              className={`min-h-11 border-l border-slate-300 px-4 py-2 text-xs font-semibold transition ${mobileView === "grid" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setMobileView("grid")}
            >
              Grid
            </button>
          </div>
          <button
            className="inline-flex min-h-11 items-center gap-1.5 rounded-3xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            type="button"
            onClick={() => { setFormError(""); addSave.resetSaveState(); setForm(freshForm()); setShowAdd(true); }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add event
          </button>
        </div>
        {mobileView === "grid" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50" type="button" onClick={handlePrevious} aria-label={view === "week" ? "Previous week" : "Previous month"}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="flex-1 text-center text-xs font-semibold text-slate-950">{currentViewLabel}</div>
              <button className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50" type="button" onClick={handleNext} aria-label={view === "week" ? "Next week" : "Next month"}>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <button className="inline-flex min-h-11 items-center gap-1 rounded-3xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={goToToday}>
                <Home className="h-3 w-3" aria-hidden="true" />
                Now
              </button>
            </div>
            <div className="flex gap-1.5">
              {(["today", "week", "month"] as const).map((option) => (
                <button
                  key={option}
                  className={`min-h-11 flex-1 rounded-3xl py-2 text-xs font-semibold capitalize ${view === option ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                  type="button"
                  onClick={() => setView(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Desktop header */}
      <div className="hidden flex-col gap-3 md:flex md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50" type="button" onClick={handlePrevious} aria-label={view === "week" ? "Previous week" : "Previous month"}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-fit text-xs font-semibold text-slate-950 md:text-base">
            {currentViewLabel}
          </div>
          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50" type="button" onClick={handleNext} aria-label={view === "week" ? "Next week" : "Next month"}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 md:text-sm" type="button" onClick={goToToday}>
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            Now
          </button>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 pb-1 md:w-auto md:overflow-visible md:pb-0">
          {(["today", "week", "month"] as const).map((option) => (
            <button
              key={option}
              className={`min-h-11 rounded-xl px-4 py-2 text-xs font-semibold capitalize md:min-h-0 md:text-sm ${
                view === option ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              type="button"
              onClick={() => setView(option)}
            >
              {option}
            </button>
          ))}
          <button
            className="ml-3 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 md:min-h-0 md:text-sm"
            type="button"
            onClick={() => { setFormError(""); addSave.resetSaveState(); setForm(freshForm()); setShowAdd(true); }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add event
          </button>
        </div>
      </div>

      {/* Event type legend — scrollable on mobile */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Client Meeting", className: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
          { label: "Delivery", className: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
          { label: "Deadline", className: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
          { label: "Internal Meeting", className: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
          { label: "Other", className: "bg-slate-100 text-slate-700", dot: "bg-slate-500" },
        ].map((item) => (
          <span key={item.label} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${item.className}`}>
            <span className={`inline-block h-2 w-2 rounded-full ${item.dot}`} />
            {item.label}
          </span>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setFilterOwner(opt)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition md:text-sm ${
              filterOwner === opt
                ? "bg-slate-950 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Mobile agenda view */}
      {mobileView === "agenda" && (
        <div className="space-y-5 md:hidden">
          {agendaGroups.length === 0 && (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500 md:text-sm">
              No upcoming events.
            </div>
          )}
          {agendaGroups.map(({ dateKey, label, isToday, events }) => (
            <div key={dateKey}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`shrink-0 text-xs font-bold uppercase tracking-widest ${isToday ? "text-slate-950" : "text-slate-500"}`}>
                  {label}
                </span>
                {isToday && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
                <div className="h-px min-w-0 flex-1 bg-slate-200" />
              </div>
              <div className="space-y-2">
                {events.map((event) => (
                  <AgendaEventCard
                    key={event.id}
                    event={event}
                    onOpen={openEvent}
                    onDelete={handleDeleteEvent}
                    deletingId={deletingId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Calendar grid views — always on desktop; on mobile only when mobileView === "grid" */}
      <div className={mobileView === "grid" ? "" : "hidden md:block"}>
        {/* Month view */}
        {view === "month" && (
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-7">
              {weekDays.map((day) => (
                <div key={day} className="border-b border-r border-slate-200 px-1 py-2 text-center text-[10px] font-semibold uppercase text-slate-400 last:border-r-0 md:px-2 md:text-xs">
                  {day}
                </div>
              ))}
              {calendarDays.map((day) => {
                const dayEvents = eventsByDate[day.key] ?? [];
                const visibleItems = dayEvents.slice(0, 3);
                const overflow = dayEvents.length - visibleItems.length;
                return (
                  <div
                    key={day.key}
                    className={`min-h-20 min-w-0 border-b border-r border-slate-200 p-1 last:border-r-0 md:min-h-28 md:p-2 ${day.inMonth ? "bg-white" : "bg-slate-50 text-slate-300"} ${day.key === todayKey ? "cursor-pointer bg-blue-50/40 hover:bg-blue-50" : ""}`}
                    onClick={() => { if (day.key === todayKey) setShowTodayDetails(true); }}
                  >
                    <div className={`ml-auto flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-slate-600 md:h-7 md:w-7 md:text-xs ${day.key === todayKey ? "bg-slate-950 text-white" : ""}`}>
                      {day.date.getDate()}
                    </div>
                    <div className="mt-1 min-w-0 space-y-1 md:mt-2">
                      {visibleItems.map((event) => (
                        <EventPill key={event.id} event={event} onDelete={handleDeleteEvent} onOpen={openEvent} />
                      ))}
                      {overflow > 0 && (
                        <div className="overflow-hidden truncate rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          +{overflow} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Week view */}
        {view === "week" && (
          <div className="overflow-x-auto rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="min-w-[36rem]">
              <div className="grid border-l border-t border-slate-200" style={{ gridTemplateColumns }}>
                <div className="w-16 shrink-0 border-b border-r border-slate-200" />
                {weekDates.map((day, i) => (
                  <div key={day.key} className={`min-w-0 overflow-hidden border-b border-r border-slate-200 px-3 py-3 ${day.key === todayKey ? "bg-blue-50/30" : "bg-white"}`}>
                    <p className="text-xs uppercase text-slate-400">{weekDays[i]}</p>
                    <p className={`mt-1 inline-flex text-xs font-semibold text-slate-600 md:text-sm ${day.key === todayKey ? "h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-white" : ""}`}>
                      {day.date.getDate()}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid border-l border-slate-200" style={{ gridTemplateColumns }}>
                <div className="w-16 shrink-0 border-b border-r border-slate-200 py-2 pr-2 text-right text-xs text-slate-400">All-day</div>
                {weekDates.map((day) => {
                  const allDayEvents = (eventsByDate[day.key] ?? []).filter((e) => !e.time);
                  return (
                    <div key={day.key} className={`min-h-16 min-w-0 overflow-hidden border-b border-r border-slate-200 p-2 ${day.key === todayKey ? "bg-blue-50/30" : "bg-white"}`}>
                      <div className="space-y-1">
                        {allDayEvents.map((event) => (
                          <EventPill key={event.id} event={event} onDelete={handleDeleteEvent} onOpen={openEvent} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {hourSlots.map((hour) => (
                <div key={hour} className="grid border-l border-slate-200" style={{ gridTemplateColumns }}>
                  <div className="h-14 w-16 shrink-0 border-b border-r border-slate-200 pr-2 pt-2 text-right text-xs text-slate-400">
                    {hour > 12 ? hour - 12 : hour}{hour >= 12 ? "pm" : "am"}
                  </div>
                  {weekDates.map((day) => {
                    const timedEvents = (eventsByDate[day.key] ?? []).filter((e) => e.time && Number(e.time.split(":")[0]) === hour);
                    return (
                      <div key={`${day.key}-${hour}`} className={`h-14 min-w-0 overflow-hidden border-b border-r border-slate-200 p-1.5 ${day.key === todayKey ? "bg-blue-50/30" : "bg-white"}`}>
                        <div className="space-y-1">
                          {timedEvents.map((event) => (
                            <EventPill key={event.id} event={event} prefix={`${event.time} `} onDelete={handleDeleteEvent} onOpen={openEvent} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Today view */}
        {view === "today" && (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400 md:text-sm">Today</p>
                <h2 className="mt-2 text-base font-bold text-slate-950 md:text-3xl">{todayLabel}</h2>
              </div>
              <button
                className="min-h-11 rounded-3xl bg-slate-950 px-5 py-3 text-xs font-semibold text-white hover:bg-slate-800 md:text-sm"
                type="button"
                onClick={() => {
                  setForm({ ...freshForm(), date: todayKey });
                  setFormError("");
                  addSave.resetSaveState();
                  setShowAdd(true);
                }}
              >
                Add event
              </button>
            </div>
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)]">
                <div className="border-b border-r border-slate-200 py-3 pr-2 text-right text-xs text-slate-400">All-day</div>
                <div className="min-h-16 min-w-0 overflow-hidden border-b border-slate-200 p-2 md:p-3">
                  <div className="space-y-1">
                    {(eventsByDate[todayKey] ?? []).filter((e) => !e.time).map((event) => (
                      <EventPill key={event.id} event={event} onDelete={handleDeleteEvent} onOpen={openEvent} />
                    ))}
                    {(eventsByDate[todayKey] ?? []).filter((e) => !e.time).length === 0 && (
                      <p className="text-xs text-slate-500 md:text-sm">No all-day events.</p>
                    )}
                  </div>
                </div>
              </div>
              {hourSlots.map((hour) => {
                const timedEvents = (eventsByDate[todayKey] ?? []).filter((e) => e.time && Number(e.time.split(":")[0]) === hour);
                return (
                  <div key={`today-${hour}`} className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)]">
                    <div className="h-16 w-16 shrink-0 border-b border-r border-slate-200 pr-2 pt-3 text-right text-xs text-slate-400">
                      {hour > 12 ? hour - 12 : hour}{hour >= 12 ? "pm" : "am"}
                    </div>
                    <div className={`h-16 min-w-0 overflow-hidden border-b border-slate-200 p-2 ${timedEvents.length === 0 ? "border-dashed bg-slate-50/40" : "bg-white"}`}>
                      <div className="space-y-1">
                        {timedEvents.map((event) => (
                          <EventPill key={event.id} event={event} prefix={`${event.time} `} onDelete={handleDeleteEvent} onOpen={openEvent} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Upcoming events — hidden on mobile when agenda is active (agenda already shows all events) */}
      <section className={`rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5 ${mobileView === "agenda" ? "hidden md:block" : ""}`}>
        <h2 className="text-base font-bold text-slate-950 md:text-xl">Upcoming events</h2>
        <div className="mt-4">
          <div className="divide-y divide-slate-200">
            {upcomingEvents.map((event) => (
              <div
                key={event.id}
                role="button"
                tabIndex={0}
                className="w-full cursor-pointer py-3 text-left hover:bg-slate-50"
                onClick={() => openEvent(event)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEvent(event); } }}
              >
                {/* Mobile card layout */}
                <div className="flex items-center gap-3 md:hidden">
                  <div className={`h-2 w-2 shrink-0 rounded-full ${eventTypeDotColors[event.type] ?? "bg-slate-400"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-950">{event.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{event.date} · {event.time || "All day"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <div className="flex items-center gap-0.5">
                      <AssigneeChips assignees={event.assignedTo} />
                    </div>
                    <PriorityDot priority={eventPriority(event)} />
                    <button
                      type="button"
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                      aria-label={`Delete ${event.title}`}
                      onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                      disabled={deletingId === event.id}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {/* Desktop grid layout */}
                <div className="hidden md:grid md:grid-cols-[1fr_auto_auto_auto_auto_auto] md:items-center md:gap-3">
                  <p className="text-xs font-semibold text-slate-950 md:text-sm">{event.title}</p>
                  <span className="text-xs text-slate-600 md:text-sm">{event.date}</span>
                  <span className="text-xs text-slate-600 md:text-sm">{event.time || "All-day"}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {formatAssignedTo(event.assignedTo)}
                  </span>
                  <span className="inline-flex items-center justify-center rounded-full bg-white px-2 py-1">
                    <PriorityDot priority={eventPriority(event)} />
                  </span>
                  <button
                    type="button"
                    className="flex min-h-10 min-w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
                    aria-label={`Delete ${event.title}`}
                    onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                    disabled={deletingId === event.id}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
            {upcomingEvents.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500 md:text-sm">No upcoming dated events yet.</div>
            )}
          </div>
        </div>
      </section>

      {/* Add event modal */}
      {showAdd && (
        <ModalShell
          title="Add event"
          onClose={() => { setShowAdd(false); setFormError(""); }}
          maxWidth="max-w-md"
          footer={
            <div className="space-y-2">
              <FieldError message={formError} />
              <div className="flex gap-3">
                <SaveButton state={addSave.saveState} onClick={handleAddEvent} mode="add" className="flex-1 py-3" />
                <button className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm" type="button" onClick={() => { setShowAdd(false); setFormError(""); }}>Cancel</button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Title</label>
              <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Date</label>
              <input type="date" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={form.date} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Time</label>
              <input type="time" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Assigned to</label>
              <AssigneeSelector value={form.assignedTo} onChange={(v) => setForm({ ...form, assignedTo: v })} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Type</label>
              <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 md:text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}>
                {eventTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Notes</label>
              <textarea rows={3} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        </ModalShell>
      )}

      {/* Event detail / edit modal */}
      {selectedEvent && eventDraft && (
        <ModalShell
          title={editingEvent ? "Edit event" : selectedEvent.title}
          subtitle={!editingEvent ? `${selectedEvent.date}${selectedEvent.time ? ` · ${formatTimeRange(selectedEvent)}` : ""} · ${formatAssignedTo(selectedEvent.assignedTo)}` : undefined}
          onClose={closeEvent}
          maxWidth="max-w-2xl"
          footer={
            <div className="space-y-3">
              <FieldError message={formError} />
              <div className="flex gap-3">
                {editingEvent ? (
                  <SaveButton state={eventSave.saveState} onClick={handleSaveEvent} className="flex-1 py-3" />
                ) : (
                  <>
                    <button className="min-h-11 flex-1 rounded-3xl bg-slate-950 py-3 text-xs font-semibold text-white hover:bg-slate-800 md:text-sm" type="button" onClick={() => { eventSave.resetSaveState(); setEditingEvent(true); }}>Edit</button>
                    <SaveButton state={eventSave.saveState} onClick={handleSaveEvent} className="flex-1 py-3" />
                  </>
                )}
              </div>
              <button className="w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 md:text-sm" type="button" disabled={deletingId === selectedEvent.id} onClick={() => handleDeleteEvent(selectedEvent.id)}>Delete event</button>
            </div>
          }
        >
          <div className="space-y-4">
            {editingEvent ? (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Title</label>
                  <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={eventDraft.title} onChange={(e) => setEventDraft({ ...eventDraft, title: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Date</label>
                  <input type="date" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={eventDraft.date} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => setEventDraft({ ...eventDraft, date: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Time</label>
                  <input type="time" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={eventDraft.time ?? ""} onChange={(e) => setEventDraft({ ...eventDraft, time: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Assigned to</label>
                  <AssigneeSelector value={eventDraft.assignedTo} onChange={(v) => setEventDraft({ ...eventDraft, assignedTo: v })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Type</label>
                  <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 md:text-sm" value={eventDraft.type} onChange={(e) => setEventDraft({ ...eventDraft, type: e.target.value as EventType })}>
                    {eventTypes.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Priority</label>
                  <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 md:text-sm" value={eventPriority(eventDraft)} onChange={(e) => setEventDraft({ ...eventDraft, priority: e.target.value as Priority })}>
                    <option>High</option><option>Medium</option><option>Low</option>
                  </select>
                </div>
              </>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 p-3 md:p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Type</p>
                  <p className="mt-2 text-xs font-semibold text-slate-950 md:text-sm">{selectedEvent.type}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-3 md:p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Assigned to</p>
                  <p className="mt-2 text-xs font-semibold text-slate-950 md:text-sm">{formatAssignedTo(selectedEvent.assignedTo)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-3 md:p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Priority</p>
                  <p className="mt-2 inline-flex items-center text-xs font-semibold text-slate-950 md:text-sm">{eventPriority(selectedEvent)}<PriorityDot priority={eventPriority(selectedEvent)} /></p>
                </div>
              </div>
            )}
            {editingEvent ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Notes</label>
                <textarea
                  rows={8}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  value={eventDraft.notes ?? ""}
                  onChange={(e) => setEventDraft({ ...eventDraft, notes: e.target.value })}
                />
              </div>
            ) : (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-700 md:text-sm">Notes</p>
                <div
                  className="max-h-56 min-h-[4rem] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-900 md:text-sm"
                  style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {eventDraft.notes?.trim()
                    ? eventDraft.notes
                    : <span className="italic text-slate-400">No notes.</span>
                  }
                </div>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* Today details modal */}
      {showTodayDetails && (
        <ModalShell
          title="Today"
          subtitle={today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          onClose={() => setShowTodayDetails(false)}
          maxWidth="max-w-lg"
          footer={
            <button className="min-h-11 w-full rounded-3xl bg-slate-950 py-3 text-xs font-semibold text-white hover:bg-slate-800 md:text-sm" type="button" onClick={() => { setForm({ ...freshForm(), date: todayKey }); setShowTodayDetails(false); setFormError(""); addSave.resetSaveState(); setShowAdd(true); }}>
              Add event
            </button>
          }
        >
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 md:text-sm">Events today</h3>
            <div className="space-y-2">
              {(eventsByDate[todayKey] ?? []).map((event) => (
                <EventPill key={event.id} event={event} prefix={event.time ? `${event.time} ` : undefined} onDelete={handleDeleteEvent} onOpen={openEvent} />
              ))}
              {(eventsByDate[todayKey] ?? []).length === 0 && (
                <p className="text-xs text-slate-500 md:text-sm">No events today.</p>
              )}
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

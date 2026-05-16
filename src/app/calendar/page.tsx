"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Home, Plus, Trash2 } from "lucide-react";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type Founder = "All" | "Alliyah" | "Hannah" | "Jordan";
type Priority = "High" | "Medium" | "Low";
type EventType = "Client Meeting" | "Demo" | "Video Call" | "Delivery" | "Deadline" | "Internal Meeting" | "Other";

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  assignedTo: Founder;
  type: EventType;
  priority?: Priority;
  notes?: string;
};

type CalendarView = "today" | "week" | "month";

const eventTypes: EventType[] = ["Client Meeting", "Demo", "Video Call", "Delivery", "Deadline", "Internal Meeting", "Other"];

const eventTypeColors: Record<EventType, string> = {
  "Client Meeting": "border-l-2 border-blue-400 bg-blue-100 text-blue-700",
  Demo: "border-l-2 border-indigo-400 bg-indigo-100 text-indigo-700",
  "Video Call": "border-l-2 border-cyan-400 bg-cyan-100 text-cyan-700",
  Delivery: "border-l-2 border-emerald-400 bg-emerald-100 text-emerald-700",
  Deadline: "border-l-2 border-rose-500 bg-rose-100 text-rose-700",
  "Internal Meeting": "border-l-2 border-violet-400 bg-violet-100 text-violet-700",
  Other: "border-l-2 border-slate-400 bg-slate-100 text-slate-700",
};
const emptyEvent = {
  title: "",
  date: "2026-05-13",
  time: "",
  assignedTo: "All" as Founder,
  type: "Client Meeting" as EventType,
  notes: "",
};
const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hourSlots = Array.from({ length: 13 }, (_, index) => index + 8);

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

function PriorityDot({ priority }: { priority: Priority }) {
  return (
    <span
      className={`ml-1 inline-block h-2 w-2 shrink-0 rounded-full ${priority === "High" ? "bg-rose-500" : priority === "Medium" ? "bg-amber-500" : "bg-emerald-500"}`}
      aria-label={`${priority} priority`}
    />
  );
}

function eventPriority(event: CalendarEvent): Priority {
  return event.priority ?? "Low";
}

function EventPill({ event, prefix, onDelete, onOpen }: { event: CalendarEvent; prefix?: string; onDelete?: (id: string) => void; onOpen?: (event: CalendarEvent) => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`flex w-full items-center overflow-hidden whitespace-nowrap rounded-md px-2 py-0.5 text-left text-xs font-semibold ${eventTypeColors[event.type] ?? eventTypeColors.Other}`}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onOpen?.(event);
      }}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault();
          keyEvent.stopPropagation();
          onOpen?.(event);
        }
      }}
    >
      <span className="min-w-0 truncate">{prefix}{event.title}</span>
      <PriorityDot priority={eventPriority(event)} />
      {onDelete && (
        <button
          type="button"
          className="ml-auto shrink-0 rounded-full p-0.5 text-rose-600 hover:bg-rose-50"
          aria-label={`Delete ${event.title}`}
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onDelete(event.id);
          }}
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const [today] = useState(new Date());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<CalendarView>("month");
  const { data: events, upsertItem, deleteItem, loading: eventsLoading, error } = useSupabaseTable<CalendarEvent>("calendar_events", []);
  const [showAdd, setShowAdd] = useState(false);
  const [showTodayDetails, setShowTodayDetails] = useState(false);
  const [form, setForm] = useState(emptyEvent);
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
  const weekLabel = `${currentWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${new Date(currentWeek.getFullYear(), currentWeek.getMonth(), currentWeek.getDate() + 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const gridTemplateColumns = "4rem repeat(7, minmax(0, 1fr))";

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        date,
        key: formatDate(date),
        inMonth: date.getMonth() === currentDate.getMonth(),
      };
    });
  }, [currentDate]);

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(currentWeek);
      date.setDate(currentWeek.getDate() + index);
      return { date, key: formatDate(date) };
    });
  }, [currentWeek]);


  const eventsByDate = useMemo(() => {
    return events.filter((event) => isValidDate(event.date)).reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      acc[event.date] = [...(acc[event.date] ?? []), event];
      return acc;
    }, {});
  }, [events]);

  const upcomingEvents = useMemo(() => {
    return [...events]
      .filter((event) => isValidDate(event.date))
      .sort((a, b) => {
        const dateSort = a.date.localeCompare(b.date);
        if (dateSort !== 0) return dateSort;
        return (a.time ?? "").localeCompare(b.time ?? "");
      });
  }, [events]);

  const changeMonth = (offset: number) => {
    setCurrentDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const changeWeek = (offset: number) => {
    setCurrentWeek((current) => {
      const next = new Date(current);
      next.setDate(current.getDate() + offset * 7);
      return next;
    });
  };

  const handlePrevious = () => {
    if (view === "today") return;
    if (view === "week") {
      changeWeek(-1);
      return;
    }
    changeMonth(-1);
  };

  const handleNext = () => {
    if (view === "today") return;
    if (view === "week") {
      changeWeek(1);
      return;
    }
    changeMonth(1);
  };

  const goToToday = () => {
    const todayDate = new Date();
    setCurrentDate(new Date(todayDate));
    const startOfWeek = new Date(todayDate);
    startOfWeek.setDate(todayDate.getDate() - todayDate.getDay());
    setCurrentWeek(new Date(startOfWeek));
  };

  const handleAddEvent = async () => {
    if (!form.title.trim()) {
      setFormError("Event title is required.");
      return;
    }
    if (!form.date) {
      setFormError("Event date is required.");
      return;
    }
    setFormError("");
    const newEvent = { id: `event-${Date.now()}`, ...form };
    await addSave.runSave(async () => {
      const response = await upsertItem(newEvent);
      if (!response.error) setForm(emptyEvent);
      return response;
    });
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
    if (!eventDraft.title.trim()) {
      setFormError("Event title is required.");
      return;
    }
    if (!eventDraft.date) {
      setFormError("Event date is required.");
      return;
    }
    setFormError("");
    await eventSave.runSave(async () => {
      const response = await upsertItem(eventDraft);
      if (!response.error) setSelectedEvent(eventDraft);
      return response;
    });
  };

  if (eventsLoading) return <LoadingState label="Loading calendar..." />;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <ErrorBanner message={error} />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50" type="button" onClick={handlePrevious} aria-label={view === "week" ? "Previous week" : "Previous month"}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-fit text-xs md:text-base font-semibold text-slate-950">{view === "week" ? weekLabel : view === "today" ? todayLabel : monthLabel}</div>
          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50" type="button" onClick={handleNext} aria-label={view === "week" ? "Next week" : "Next month"}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs md:text-sm font-medium text-slate-600 hover:bg-slate-50" type="button" onClick={goToToday}>
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            Now
          </button>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 pb-1 md:w-auto md:overflow-visible md:pb-0">
          {(["today", "week", "month"] as const).map((option) => (
            <button
              key={option}
              className={`min-h-11 rounded-xl px-4 py-2 text-xs md:text-sm font-semibold capitalize md:min-h-0 ${
                view === option
                  ? "bg-slate-950 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              type="button"
              onClick={() => setView(option)}
            >
              {option}
            </button>
          ))}
          <button className="ml-3 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs md:text-sm font-semibold text-white hover:bg-emerald-700 md:min-h-0" type="button" onClick={() => { setFormError(""); addSave.resetSaveState(); setShowAdd(true); }}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add event
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Client Meeting", className: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
            { label: "Demo", className: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
            { label: "Video Call", className: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500" },
            { label: "Delivery", className: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
            { label: "Deadline", className: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
            { label: "Internal Meeting", className: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
            { label: "Other", className: "bg-slate-100 text-slate-700", dot: "bg-slate-500" },
          ].map((item) => (
            <span key={item.label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${item.className}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${item.dot}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {view === "month" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
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
                  className={`min-h-20 min-w-0 border-b border-r border-slate-200 bg-white p-1 last:border-r-0 md:min-h-28 md:p-2 ${day.inMonth ? "" : "bg-slate-50 text-slate-300"} ${day.key === todayKey ? "cursor-pointer bg-blue-50/40 hover:bg-blue-50" : ""}`}
                  onClick={() => {
                    if (day.key === todayKey) setShowTodayDetails(true);
                  }}
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

      {view === "week" && (
        <div className="overflow-hidden border-l border-t border-slate-200 bg-white">
          <div className="min-w-0">
            <div className="grid" style={{ gridTemplateColumns }}>
              <div className="w-16 shrink-0 border-b border-r border-slate-200" />
              {weekDates.map((day, index) => (
                <div key={day.key} className={`min-w-0 overflow-hidden border-b border-r border-slate-200 px-3 py-3 ${day.key === todayKey ? "bg-blue-50/30" : "bg-white"}`}>
                  <p className="text-xs uppercase text-slate-400">{weekDays[index]}</p>
                  <p className={`mt-1 inline-flex text-xs md:text-sm font-semibold text-slate-600 ${day.key === todayKey ? "h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-white" : ""}`}>
                    {day.date.getDate()}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns }}>
              <div className="w-16 shrink-0 border-b border-r border-slate-200 py-2 pr-2 text-right text-xs text-slate-400">All-day</div>
              {weekDates.map((day) => {
                const allDayEvents = (eventsByDate[day.key] ?? []).filter((event) => !event.time);
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
              <div key={hour} className="grid" style={{ gridTemplateColumns }}>
                <div className="h-14 w-16 shrink-0 border-b border-r border-slate-200 pr-2 pt-2 text-right text-xs text-slate-400">
                  {hour > 12 ? hour - 12 : hour}{hour >= 12 ? "pm" : "am"}
                </div>
                {weekDates.map((day) => {
                  const timedEvents = (eventsByDate[day.key] ?? []).filter((event) => event.time && Number(event.time.split(":")[0]) === hour);
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

      {view === "today" && (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-2 md:p-6 shadow-md">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs md:text-sm uppercase tracking-[0.24em] text-slate-400">Today</p>
              <h2 className="mt-2 text-base md:text-3xl font-bold text-slate-950">{todayLabel}</h2>
            </div>
            <button
              className="min-h-11 rounded-3xl bg-slate-950 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800"
              type="button"
              onClick={() => {
                setForm({ ...emptyEvent, date: todayKey });
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
                  {(eventsByDate[todayKey] ?? []).filter((event) => !event.time).map((event) => (
                    <EventPill key={event.id} event={event} onDelete={handleDeleteEvent} onOpen={openEvent} />
                  ))}
                  {(eventsByDate[todayKey] ?? []).filter((event) => !event.time).length === 0 && (
                    <p className="text-xs md:text-sm text-slate-500">No all-day events.</p>
                  )}
                </div>
              </div>
            </div>

            {hourSlots.map((hour) => {
              const timedEvents = (eventsByDate[todayKey] ?? []).filter((event) => event.time && Number(event.time.split(":")[0]) === hour);
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

      <section className="rounded-[2rem] border border-slate-200 bg-white p-2 md:p-6 shadow-md">
        <h2 className="text-base md:text-xl font-bold text-slate-950">Upcoming events</h2>
        <div className="mt-4 overflow-hidden">
          <div className="min-w-0 divide-y divide-slate-200">
          {upcomingEvents.map((event) => (
            <div
              key={event.id}
              role="button"
              tabIndex={0}
              className="grid w-full cursor-pointer grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-3 py-3 text-left hover:bg-slate-50"
              onClick={() => openEvent(event)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                  keyEvent.preventDefault();
                  openEvent(event);
                }
              }}
            >
              <p className="text-xs md:text-sm font-semibold text-slate-950">{event.title}</p>
              <span className="text-xs md:text-sm text-slate-600">{event.date}</span>
              <span className="text-xs md:text-sm text-slate-600">{event.time || "All-day"}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{event.assignedTo}</span>
              <span className="inline-flex items-center justify-center rounded-full bg-white px-2 py-1">
                <PriorityDot priority={eventPriority(event)} />
              </span>
              <button
                type="button"
                className="rounded-full p-1 text-rose-600 hover:bg-rose-50"
                aria-label={`Delete ${event.title}`}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            handleDeleteEvent(event.id);
                          }}
                          disabled={deletingId === event.id}
                onKeyDown={(keyEvent) => keyEvent.stopPropagation()}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          {upcomingEvents.length === 0 && (
            <div className="py-3 md:py-6 text-xs md:text-sm text-slate-600">No upcoming dated events yet.</div>
          )}
          </div>
        </div>
      </section>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-2 md:p-3 shadow-xl md:p-8">
            <h2 className="text-base md:text-2xl font-semibold text-slate-950">Add event</h2>
            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Title</label>
                <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Date</label>
                <input type="date" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={form.date} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => setForm({ ...form, date: event.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Time</label>
                <input type="time" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Assigned to</label>
                <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm" value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value as Founder })}>
                  <option>All</option>
                  <option>Alliyah</option>
                  <option>Hannah</option>
                  <option>Jordan</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Type</label>
                <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as CalendarEvent["type"] })}>
                  {eventTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Notes</label>
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
            </div>
            <FieldError message={formError} />
            <div className="mt-6 flex gap-3">
              <SaveButton state={addSave.saveState} onClick={handleAddEvent} className="flex-1 py-3" />
              <button className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100" type="button" onClick={() => { setShowAdd(false); setFormError(""); }}>Cancel</button>
            </div>
            <FieldError message={formError} />
          </div>
        </div>
      )}

      {selectedEvent && eventDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-2 md:p-3 shadow-xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base md:text-2xl font-semibold text-slate-950">{editingEvent ? "Edit event" : selectedEvent.title}</h2>
                {!editingEvent && (
                  <p className="mt-1 text-xs md:text-sm text-slate-500">
                    {selectedEvent.date}{selectedEvent.time ? ` at ${selectedEvent.time}` : ""} · {selectedEvent.assignedTo}
                  </p>
                )}
              </div>
              <button className="rounded-full border border-slate-300 px-3 py-1 text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={closeEvent}>
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {editingEvent ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Title</label>
                    <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={eventDraft.title} onChange={(event) => setEventDraft({ ...eventDraft, title: event.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Date</label>
                    <input type="date" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={eventDraft.date} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => setEventDraft({ ...eventDraft, date: event.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Time</label>
                    <input type="time" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={eventDraft.time ?? ""} onChange={(event) => setEventDraft({ ...eventDraft, time: event.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Assigned to</label>
                    <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm" value={eventDraft.assignedTo} onChange={(event) => setEventDraft({ ...eventDraft, assignedTo: event.target.value as Founder })}>
                      <option>All</option>
                      <option>Alliyah</option>
                      <option>Hannah</option>
                      <option>Jordan</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Type</label>
                    <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm" value={eventDraft.type} onChange={(event) => setEventDraft({ ...eventDraft, type: event.target.value as CalendarEvent["type"] })}>
                      {eventTypes.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Priority</label>
                    <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm" value={eventPriority(eventDraft)} onChange={(event) => setEventDraft({ ...eventDraft, priority: event.target.value as Priority })}>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </div>
                </>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-2 md:p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Type</p>
                    <p className="mt-2 text-xs md:text-sm font-semibold text-slate-950">{selectedEvent.type}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-2 md:p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Assigned to</p>
                    <p className="mt-2 text-xs md:text-sm font-semibold text-slate-950">{selectedEvent.assignedTo}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-2 md:p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Priority</p>
                    <p className="mt-2 inline-flex items-center text-xs md:text-sm font-semibold text-slate-950">
                      {eventPriority(selectedEvent)}
                      <PriorityDot priority={eventPriority(selectedEvent)} />
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Notes</label>
                <textarea
                  rows={4}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  value={eventDraft.notes ?? ""}
                  onChange={(event) => setEventDraft({ ...eventDraft, notes: event.target.value })}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              {editingEvent ? (
                <SaveButton state={eventSave.saveState} onClick={handleSaveEvent} className="flex-1 py-3" />
              ) : (
                <button className="min-h-11 flex-1 rounded-3xl bg-slate-950 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800" type="button" onClick={() => { eventSave.resetSaveState(); setEditingEvent(true); }}>Edit</button>
              )}
              {!editingEvent && (
                <SaveButton state={eventSave.saveState} onClick={handleSaveEvent} className="flex-1 py-3" />
              )}
            </div>
            <button className="mt-3 min-h-11 w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-xs md:text-sm font-semibold text-rose-700 hover:bg-rose-100" type="button" disabled={deletingId === selectedEvent.id} onClick={() => handleDeleteEvent(selectedEvent.id)}>
              Delete event
            </button>
          </div>
        </div>
      )}

      {showTodayDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-2 md:p-3 shadow-xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base md:text-2xl font-semibold text-slate-950">Today</h2>
                <p className="mt-1 text-xs md:text-sm text-slate-500">{today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
              </div>
              <button className="rounded-full border border-slate-300 px-3 py-1 text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => setShowTodayDetails(false)}>
                Close
              </button>
            </div>
            <div className="mt-6 space-y-5">
              <div>
                <h3 className="text-xs md:text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Events today</h3>
                <div className="mt-3 space-y-2">
                  {(eventsByDate[todayKey] ?? []).map((event) => (
                    <EventPill key={event.id} event={event} prefix={event.time ? `${event.time} ` : undefined} onDelete={handleDeleteEvent} onOpen={openEvent} />
                  ))}
                  {(eventsByDate[todayKey] ?? []).length === 0 && <p className="text-xs md:text-sm text-slate-500">No events today.</p>}
                </div>
              </div>
            </div>
            <button
              className="mt-6 min-h-11 w-full rounded-3xl bg-slate-950 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800"
              type="button"
              onClick={() => {
                setForm({ ...emptyEvent, date: todayKey });
                setShowTodayDetails(false);
                setFormError("");
                addSave.resetSaveState();
                setShowAdd(true);
              }}
            >
              Add event
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

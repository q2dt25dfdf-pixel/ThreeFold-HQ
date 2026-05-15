"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Home, Plus, Trash2 } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type Founder = "Alliyah" | "Hannah" | "Jordan";
type Priority = "High" | "Medium" | "Low";

type Task = {
  id: string;
  title: string;
  dueDate: string;
  assignedTo: Founder;
  priority: Priority;
  time?: string;
  notes?: string;
  completed?: boolean;
};

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  assignedTo: Founder;
  type: "Task" | "Meeting" | "Deadline";
  priority?: Priority;
  notes?: string;
};

type CalendarView = "today" | "week" | "month";

const eventTypeColors: Record<CalendarEvent["type"], string> = {
  Meeting: "border-l-2 border-blue-400 bg-blue-100 text-blue-700",
  Deadline: "border-l-2 border-purple-400 bg-purple-100 text-purple-700",
  Task: "border-l-2 border-emerald-400 bg-emerald-100 text-emerald-700",
};
const emptyEvent = {
  title: "",
  date: "2026-05-13",
  time: "",
  assignedTo: "Alliyah" as Founder,
  type: "Task" as CalendarEvent["type"],
  priority: "Medium" as Priority,
  notes: "",
};
const defaultTasks: Task[] = [
  { id: "task-1", title: "Confirm print vendor for POPS order", dueDate: "2026-05-16", assignedTo: "Hannah", priority: "High", notes: "", completed: false },
  { id: "task-2", title: "Finalize all 4 POPS 2026 shirt designs", dueDate: "2026-05-16", assignedTo: "Jordan", priority: "High", notes: "Highway Badge, Dotted Circle, Golden Gate, Classic White on Black.", completed: false },
  { id: "task-3", title: "Reach out to neighboring DSPs at Bay Area hub", dueDate: "2026-05-18", assignedTo: "Alliyah", priority: "High", notes: "", completed: false },
  { id: "task-4", title: "Get pricing quote from print vendor", dueDate: "2026-05-20", assignedTo: "Hannah", priority: "High", notes: "", completed: false },
  { id: "task-5", title: "File California LLC after POPS test order", dueDate: "TBD", assignedTo: "Alliyah", priority: "Medium", notes: "$70 filing + $800 annual franchise tax.", completed: false },
  { id: "task-6", title: "Open Bluevine business bank account", dueDate: "TBD", assignedTo: "Hannah", priority: "Medium", notes: "Equal contributions from all three founders.", completed: false },
  { id: "task-7", title: "Draft operating agreement", dueDate: "TBD", assignedTo: "Alliyah", priority: "Medium", notes: "Must address unanimous vote on major decisions and Hannah/Jordan couple dynamic.", completed: false },
  { id: "task-8", title: "Build Threefold website for client pitches", dueDate: "TBD", assignedTo: "Jordan", priority: "Medium", notes: "", completed: false },
  { id: "task-9", title: "Reach out to dental offices in LumaDent territory", dueDate: "TBD", assignedTo: "Alliyah", priority: "Low", notes: "Use existing LumaDent relationships to pitch branded scrubs, polos, team gear.", completed: false },
];
const defaultEvents: CalendarEvent[] = [];

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

function TaskPill({ task, prefix, onDelete }: { task: Task; prefix?: string; onDelete?: (id: string) => void }) {
  return (
    <div className={`flex w-full items-center overflow-hidden whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${eventTypeColors.Task}`}>
      <span className="min-w-0 truncate">{prefix}{task.title}</span>
      <PriorityDot priority={task.priority} />
      {onDelete && (
        <button
          type="button"
          className="ml-auto shrink-0 rounded-full p-0.5 text-rose-600 hover:bg-rose-50"
          aria-label={`Delete ${task.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(task.id);
          }}
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function EventPill({ event, prefix, onDelete, onOpen }: { event: CalendarEvent; prefix?: string; onDelete?: (id: string) => void; onOpen?: (event: CalendarEvent) => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`flex w-full items-center overflow-hidden whitespace-nowrap rounded-md px-2 py-0.5 text-left text-xs font-semibold ${eventTypeColors[event.type]}`}
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
  const { data: tasks, deleteItem: deleteTask, loading: tasksLoading } = useSupabaseTable<Task>("tasks", defaultTasks);
  const { data: events, upsertItem: upsertEvent, deleteItem: deleteEvent, loading: eventsLoading } = useSupabaseTable<CalendarEvent>("calendar_events", defaultEvents);
  const [showAdd, setShowAdd] = useState(false);
  const [showTodayDetails, setShowTodayDetails] = useState(false);
  const [form, setForm] = useState(emptyEvent);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventDraft, setEventDraft] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState(false);

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

  const tasksByDate = useMemo(() => {
    return tasks.filter((task) => isValidDate(task.dueDate)).reduce<Record<string, Task[]>>((acc, task) => {
      acc[task.dueDate] = [...(acc[task.dueDate] ?? []), task];
      return acc;
    }, {});
  }, [tasks]);

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

  const handleAddEvent = () => {
    if (!form.title.trim() || !form.date) return;
    const newEvent = { id: `event-${Date.now()}`, ...form };
    upsertEvent(newEvent);
    setForm(emptyEvent);
    setShowAdd(false);
  };

  const handleDeleteTask = (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    deleteTask(id);
  };

  const handleDeleteEvent = (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    deleteEvent(id);
    setSelectedEvent(null);
    setEventDraft(null);
    setEditingEvent(false);
  };

  const openEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventDraft({ ...event, priority: eventPriority(event), notes: event.notes ?? "" });
    setEditingEvent(false);
    setShowTodayDetails(false);
  };

  const closeEvent = () => {
    setSelectedEvent(null);
    setEventDraft(null);
    setEditingEvent(false);
  };

  const handleSaveEvent = () => {
    if (!eventDraft || !eventDraft.title.trim() || !eventDraft.date) return;
    upsertEvent(eventDraft);
    setSelectedEvent(eventDraft);
    setEditingEvent(false);
  };

  if (tasksLoading || eventsLoading) return <div className="p-8 text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50" type="button" onClick={handlePrevious} aria-label={view === "week" ? "Previous week" : "Previous month"}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-fit text-base font-semibold text-slate-950">{view === "week" ? weekLabel : view === "today" ? todayLabel : monthLabel}</div>
          <button className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white hover:bg-slate-50" type="button" onClick={handleNext} aria-label={view === "week" ? "Next week" : "Next month"}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50" type="button" onClick={goToToday}>
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            Now
          </button>
        </div>
        <div className="flex items-center gap-2">
          {(["today", "week", "month"] as const).map((option) => (
            <button
              key={option}
              className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize ${
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
          <button className="ml-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700" type="button" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add event
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Meeting", className: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
            { label: "Deadline", className: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
            { label: "Task", className: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
          ].map((item) => (
            <span key={item.label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${item.className}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${item.dot}`} />
              {item.label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
            High priority
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Medium priority
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Low priority
          </span>
        </div>
      </div>

      {view === "month" && (
        <div>
          <div className="grid grid-cols-7 border-l border-t border-slate-200 bg-white">
            {weekDays.map((day) => (
              <div key={day} className="border-b border-r border-slate-200 px-2 py-2 text-xs uppercase text-slate-400">
                {day}
              </div>
            ))}
            {calendarDays.map((day) => {
              const dayTasks = tasksByDate[day.key] ?? [];
              const dayEvents = eventsByDate[day.key] ?? [];
              const visibleTasks = dayTasks.slice(0, 2);
              const overflow = dayTasks.length - visibleTasks.length;

              return (
                <div
                  key={day.key}
                  className={`min-h-28 border-b border-r border-slate-200 bg-white p-2 ${day.inMonth ? "" : "text-slate-300"} ${day.key === todayKey ? "cursor-pointer hover:bg-slate-50" : ""}`}
                  onClick={() => {
                    if (day.key === todayKey) setShowTodayDetails(true);
                  }}
                >
                  <div className={`text-sm text-slate-600 ${day.key === todayKey ? "flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-white" : ""}`}>
                    {day.date.getDate()}
                  </div>
                  <div className="mt-2 space-y-1">
                    {visibleTasks.map((task) => (
                      <TaskPill key={task.id} task={task} onDelete={handleDeleteTask} />
                    ))}
                    {overflow > 0 && (
                      <div className="overflow-hidden truncate rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        +{overflow} more
                      </div>
                    )}
                    {dayEvents.map((event) => (
                      <EventPill key={event.id} event={event} onDelete={handleDeleteEvent} onOpen={openEvent} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="overflow-x-auto border-l border-t border-slate-200 bg-white">
          <div className="min-w-[860px]">
            <div className="grid" style={{ gridTemplateColumns }}>
              <div className="w-16 shrink-0 border-b border-r border-slate-200" />
              {weekDates.map((day, index) => (
                <div key={day.key} className={`min-w-0 overflow-hidden border-b border-r border-slate-200 px-3 py-3 ${day.key === todayKey ? "bg-blue-50/30" : "bg-white"}`}>
                  <p className="text-xs uppercase text-slate-400">{weekDays[index]}</p>
                  <p className={`mt-1 inline-flex text-sm font-semibold text-slate-600 ${day.key === todayKey ? "h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-white" : ""}`}>
                    {day.date.getDate()}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns }}>
              <div className="w-16 shrink-0 border-b border-r border-slate-200 py-2 pr-2 text-right text-xs text-slate-400">All-day</div>
              {weekDates.map((day) => {
                const allDayTasks = (tasksByDate[day.key] ?? []).filter((task) => !task.time);
                const allDayEvents = (eventsByDate[day.key] ?? []).filter((event) => !event.time);
                return (
                  <div key={day.key} className={`min-h-16 min-w-0 overflow-hidden border-b border-r border-slate-200 p-2 ${day.key === todayKey ? "bg-blue-50/30" : "bg-white"}`}>
                    <div className="space-y-1">
                      {allDayTasks.map((task) => (
                        <TaskPill key={task.id} task={task} onDelete={handleDeleteTask} />
                      ))}
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
                  const timedTasks = (tasksByDate[day.key] ?? []).filter((task) => task.time && Number(task.time.split(":")[0]) === hour);
                  const timedEvents = (eventsByDate[day.key] ?? []).filter((event) => event.time && Number(event.time.split(":")[0]) === hour);
                  return (
                    <div key={`${day.key}-${hour}`} className={`h-14 min-w-0 overflow-hidden border-b border-r border-slate-200 p-1.5 ${day.key === todayKey ? "bg-blue-50/30" : "bg-white"}`}>
                      <div className="space-y-1">
                        {timedTasks.map((task) => (
                          <TaskPill key={task.id} task={task} prefix={`${task.time} `} onDelete={handleDeleteTask} />
                        ))}
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
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Today</p>
              <h2 className="mt-2 text-3xl font-bold text-slate-950">{todayLabel}</h2>
            </div>
            <button
              className="rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              type="button"
              onClick={() => {
                setForm({ ...emptyEvent, date: todayKey });
                setShowAdd(true);
              }}
            >
              Add event
            </button>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[4rem_minmax(0,1fr)]">
              <div className="border-b border-r border-slate-200 py-3 pr-2 text-right text-xs text-slate-400">All-day</div>
              <div className="min-h-16 min-w-0 overflow-hidden border-b border-slate-200 p-3">
                <div className="space-y-1">
                  {(tasksByDate[todayKey] ?? []).map((task) => (
                    <TaskPill key={task.id} task={task} prefix={task.time ? `${task.time} ` : undefined} onDelete={handleDeleteTask} />
                  ))}
                  {(eventsByDate[todayKey] ?? []).filter((event) => !event.time).map((event) => (
                    <EventPill key={event.id} event={event} onDelete={handleDeleteEvent} onOpen={openEvent} />
                  ))}
                  {(tasksByDate[todayKey] ?? []).length === 0 && (eventsByDate[todayKey] ?? []).filter((event) => !event.time).length === 0 && (
                    <p className="text-sm text-slate-500">No all-day tasks or events.</p>
                  )}
                </div>
              </div>
            </div>

            {hourSlots.map((hour) => {
              const timedEvents = (eventsByDate[todayKey] ?? []).filter((event) => event.time && Number(event.time.split(":")[0]) === hour);
              return (
                <div key={`today-${hour}`} className="grid grid-cols-[4rem_minmax(0,1fr)]">
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

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-md">
        <h2 className="text-xl font-bold text-slate-950">Upcoming events</h2>
        <div className="mt-4 divide-y divide-slate-200">
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
              <p className="text-sm font-semibold text-slate-950">{event.title}</p>
              <span className="text-sm text-slate-600">{event.date}</span>
              <span className="text-sm text-slate-600">{event.time || "All-day"}</span>
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
                onKeyDown={(keyEvent) => keyEvent.stopPropagation()}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          {upcomingEvents.length === 0 && (
            <div className="py-6 text-sm text-slate-600">No upcoming dated events yet.</div>
          )}
        </div>
      </section>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl">
            <h2 className="text-2xl font-semibold text-slate-950">Add event</h2>
            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Title</label>
                <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Date</label>
                <input type="date" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Time</label>
                <input type="time" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Assigned to</label>
                <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900" value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value as Founder })}>
                  <option>Alliyah</option>
                  <option>Hannah</option>
                  <option>Jordan</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Type</label>
                <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as CalendarEvent["type"] })}>
                  <option>Meeting</option>
                  <option>Deadline</option>
                  <option>Task</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Priority</label>
                <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Notes</label>
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button className="flex-1 rounded-3xl bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-slate-800" type="button" onClick={handleAddEvent}>Save</button>
              <button className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-gray-100" type="button" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {selectedEvent && eventDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-8 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">{editingEvent ? "Edit event" : selectedEvent.title}</h2>
                {!editingEvent && (
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedEvent.date}{selectedEvent.time ? ` at ${selectedEvent.time}` : ""} · {selectedEvent.assignedTo}
                  </p>
                )}
              </div>
              <button className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={closeEvent}>
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {editingEvent ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Title</label>
                    <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none" value={eventDraft.title} onChange={(event) => setEventDraft({ ...eventDraft, title: event.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Date</label>
                    <input type="date" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none" value={eventDraft.date} onChange={(event) => setEventDraft({ ...eventDraft, date: event.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Time</label>
                    <input type="time" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none" value={eventDraft.time ?? ""} onChange={(event) => setEventDraft({ ...eventDraft, time: event.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Assigned to</label>
                    <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900" value={eventDraft.assignedTo} onChange={(event) => setEventDraft({ ...eventDraft, assignedTo: event.target.value as Founder })}>
                      <option>Alliyah</option>
                      <option>Hannah</option>
                      <option>Jordan</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Type</label>
                    <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900" value={eventDraft.type} onChange={(event) => setEventDraft({ ...eventDraft, type: event.target.value as CalendarEvent["type"] })}>
                      <option>Meeting</option>
                      <option>Deadline</option>
                      <option>Task</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Priority</label>
                    <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900" value={eventPriority(eventDraft)} onChange={(event) => setEventDraft({ ...eventDraft, priority: event.target.value as Priority })}>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Type</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{selectedEvent.type}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Assigned to</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{selectedEvent.assignedTo}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Priority</p>
                    <p className="mt-2 inline-flex items-center text-sm font-semibold text-slate-950">
                      {eventPriority(selectedEvent)}
                      <PriorityDot priority={eventPriority(selectedEvent)} />
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Notes</label>
                <textarea
                  rows={4}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  value={eventDraft.notes ?? ""}
                  onChange={(event) => setEventDraft({ ...eventDraft, notes: event.target.value })}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              {editingEvent ? (
                <button className="flex-1 rounded-3xl bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-slate-800" type="button" onClick={handleSaveEvent}>Save</button>
              ) : (
                <button className="flex-1 rounded-3xl bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-slate-800" type="button" onClick={() => setEditingEvent(true)}>Edit</button>
              )}
              <button className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-gray-100" type="button" onClick={handleSaveEvent}>Save notes</button>
            </div>
            <button className="mt-3 w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100" type="button" onClick={() => handleDeleteEvent(selectedEvent.id)}>
              Delete event
            </button>
          </div>
        </div>
      )}

      {showTodayDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-8 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">Today</h2>
                <p className="mt-1 text-sm text-slate-500">{today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
              </div>
              <button className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => setShowTodayDetails(false)}>
                Close
              </button>
            </div>
            <div className="mt-6 space-y-5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Tasks due today</h3>
                <div className="mt-3 space-y-2">
                  {(tasksByDate[todayKey] ?? []).map((task) => (
                    <TaskPill key={task.id} task={task} prefix={task.time ? `${task.time} ` : undefined} onDelete={handleDeleteTask} />
                  ))}
                  {(tasksByDate[todayKey] ?? []).length === 0 && <p className="text-sm text-slate-500">No tasks due today.</p>}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Events today</h3>
                <div className="mt-3 space-y-2">
                  {(eventsByDate[todayKey] ?? []).map((event) => (
                    <EventPill key={event.id} event={event} prefix={event.time ? `${event.time} ` : undefined} onDelete={handleDeleteEvent} onOpen={openEvent} />
                  ))}
                  {(eventsByDate[todayKey] ?? []).length === 0 && <p className="text-sm text-slate-500">No events today.</p>}
                </div>
              </div>
            </div>
            <button
              className="mt-6 w-full rounded-3xl bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              type="button"
              onClick={() => {
                setForm({ ...emptyEvent, date: todayKey });
                setShowTodayDetails(false);
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

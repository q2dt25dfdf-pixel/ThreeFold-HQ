"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Home, Plus } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type Founder = "Alliyah" | "Hannah" | "Jordan";

type Task = {
  id: string;
  title: string;
  dueDate: string;
  assignedTo: Founder;
  priority: "High" | "Medium" | "Low";
  time?: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  assignedTo: Founder;
  type: "Task" | "Meeting" | "Deadline";
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
};
const defaultTasks: Task[] = [];
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

function PriorityDot({ priority }: { priority: Task["priority"] }) {
  if (priority === "Low") return null;
  return (
    <span
      className={`ml-1 inline-block h-2 w-2 shrink-0 rounded-full ${priority === "High" ? "bg-rose-500" : "bg-amber-500"}`}
      aria-label={`${priority} priority`}
    />
  );
}

function TaskPill({ task, prefix }: { task: Task; prefix?: string }) {
  return (
    <div className={`flex w-full items-center overflow-hidden whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${eventTypeColors.Task}`}>
      <span className="min-w-0 truncate">{prefix}{task.title}</span>
      <PriorityDot priority={task.priority} />
    </div>
  );
}

function EventPill({ event, prefix }: { event: CalendarEvent; prefix?: string }) {
  return (
    <div className={`flex w-full items-center overflow-hidden whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${eventTypeColors[event.type]}`}>
      <span className="min-w-0 truncate">{prefix}{event.title}</span>
    </div>
  );
}

export default function CalendarPage() {
  const [today] = useState(new Date());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<CalendarView>("month");
  const { data: tasks, loading: tasksLoading } = useSupabaseTable<Task>("tasks", defaultTasks);
  const { data: events, upsertItem: upsertEvent, loading: eventsLoading } = useSupabaseTable<CalendarEvent>("calendar_events", defaultEvents);
  const [showAdd, setShowAdd] = useState(false);
  const [showTodayDetails, setShowTodayDetails] = useState(false);
  const [form, setForm] = useState(emptyEvent);

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

  const upcomingTasks = useMemo(() => {
    return tasks
      .filter((task) => isValidDate(task.dueDate) && task.dueDate >= todayKey)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
  }, [tasks, todayKey]);

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
    if (!form.title.trim() || !form.date) return;
    await upsertEvent({ id: `event-${Date.now()}`, ...form });
    setForm(emptyEvent);
    setShowAdd(false);
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
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">Low priority</span>
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
                      <TaskPill key={task.id} task={task} />
                    ))}
                    {overflow > 0 && (
                      <div className="overflow-hidden truncate rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        +{overflow} more
                      </div>
                    )}
                    {dayEvents.map((event) => (
                      <EventPill key={event.id} event={event} />
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
                        <TaskPill key={task.id} task={task} />
                      ))}
                      {allDayEvents.map((event) => (
                        <EventPill key={event.id} event={event} />
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
                          <TaskPill key={task.id} task={task} prefix={`${task.time} `} />
                        ))}
                        {timedEvents.map((event) => (
                          <EventPill key={event.id} event={event} prefix={`${event.time} `} />
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
                    <TaskPill key={task.id} task={task} prefix={task.time ? `${task.time} ` : undefined} />
                  ))}
                  {(eventsByDate[todayKey] ?? []).filter((event) => !event.time).map((event) => (
                    <EventPill key={event.id} event={event} />
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
                        <EventPill key={event.id} event={event} prefix={`${event.time} `} />
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
        <h2 className="text-xl font-bold text-slate-950">Upcoming tasks</h2>
        <div className="mt-4 divide-y divide-slate-200">
          {upcomingTasks.map((task) => (
            <div key={task.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-3">
              <p className="text-sm font-semibold text-slate-950">{task.title}</p>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{task.assignedTo}</span>
              <span className="text-sm text-slate-600">{task.dueDate}</span>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase ${eventTypeColors.Task}`}>
                {task.priority}
                <PriorityDot priority={task.priority} />
              </span>
            </div>
          ))}
          {upcomingTasks.length === 0 && (
            <div className="py-6 text-sm text-slate-600">No upcoming dated tasks yet.</div>
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
            </div>
            <div className="mt-6 flex gap-3">
              <button className="flex-1 rounded-3xl bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-slate-800" type="button" onClick={handleAddEvent}>Save</button>
              <button className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-gray-100" type="button" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
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
                    <TaskPill key={task.id} task={task} prefix={task.time ? `${task.time} ` : undefined} />
                  ))}
                  {(tasksByDate[todayKey] ?? []).length === 0 && <p className="text-sm text-slate-500">No tasks due today.</p>}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Events today</h3>
                <div className="mt-3 space-y-2">
                  {(eventsByDate[todayKey] ?? []).map((event) => (
                    <EventPill key={event.id} event={event} prefix={event.time ? `${event.time} ` : undefined} />
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

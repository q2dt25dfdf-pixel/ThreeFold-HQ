"use client";

import { type ReactNode, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, Trash2 } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import SaveButton, { type SaveState, useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { businessTodayISO, dateToBusinessISO } from "@/lib/businessDate";

type TaskOwner = "Alliyah" | "Hannah" | "Jordan";
type TaskAssignee = TaskOwner | "All" | "";
type TaskColumn = TaskOwner;

type Task = {
  id: string;
  title: string;
  dueDate: string;
  assignedTo: TaskAssignee;
  owner?: TaskAssignee;
  status?: "Open" | "Done" | "Complete";
  priority: "High" | "Medium" | "Low";
  notes: string;
  completed: boolean;
  completedAt?: string;
  completed_at?: string;
  source?: "CRM" | string;
  crmLeadId?: string;
  leadId?: string;
  crm_lead_id?: string;
  lead_id?: string;
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

const emptyForm = { title: "", dueDate: "", assignedTo: "Alliyah" as Task["assignedTo"], priority: "Medium" as Task["priority"], notes: "", completed: false };

const priorityColors: Record<Task["priority"], string> = { High: "bg-red-100 text-red-800", Medium: "bg-amber-100 text-amber-800", Low: "bg-slate-100 text-slate-700" };
const priorityDotColors: Record<Task["priority"], string> = { High: "bg-red-500", Medium: "bg-amber-500", Low: "bg-slate-400" };
const ownerColors: Record<TaskOwner, string> = { Alliyah: "bg-violet-100 text-violet-800", Hannah: "bg-blue-100 text-blue-800", Jordan: "bg-emerald-100 text-emerald-800" };
const founderColumns: { name: TaskColumn; headerClass: string; accentClass: string }[] = [
  { name: "Alliyah", headerClass: "bg-violet-50 border-violet-400", accentClass: "bg-violet-400" },
  { name: "Hannah", headerClass: "bg-blue-50 border-blue-400", accentClass: "bg-blue-400" },
  { name: "Jordan", headerClass: "bg-emerald-50 border-emerald-400", accentClass: "bg-emerald-400" },
];
type TaskFormData = Omit<Task, "id">;

function taskAssignee(task: Task): TaskAssignee {
  return task.owner ?? task.assignedTo ?? "";
}

function isCrmTask(task: Task) {
  return task.source === "CRM" || Boolean(task.crmLeadId || task.leadId);
}

function taskMatchesSearch(task: Task, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return [task.title, task.assignedTo, task.owner, task.notes]
    .filter(Boolean)
    .some((f) => String(f).toLowerCase().includes(q));
}

type CompletionGroup = "today" | "yesterday" | "week" | "older";

function getCompletionGroup(completedAt: string | undefined): CompletionGroup {
  if (!completedAt) return "older";
  const d = new Date(completedAt);
  if (Number.isNaN(d.getTime())) return "older";
  const today = businessTodayISO();
  const completed = dateToBusinessISO(d);
  const diffDays = Math.round(
    (new Date(`${today}T00:00:00`).getTime() - new Date(`${completed}T00:00:00`).getTime()) / 86400000,
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays <= 6) return "week";
  return "older";
}

const COMPLETION_GROUP_LABELS: Record<CompletionGroup, string> = {
  today: "Completed Today",
  yesterday: "Completed Yesterday",
  week: "Completed This Week",
  older: "Older",
};

const COMPLETION_GROUP_ORDER: CompletionGroup[] = ["today", "yesterday", "week", "older"];


function FormFields<T extends TaskFormData | Task>({ data, onChange }: { data: T; onChange: (f: T) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="col-span-full">
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Task</label>
        <input type="text" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none" placeholder="What needs to get done?" value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Due date</label>
        <input type="date" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none" value={data.dueDate} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => onChange({ ...data, dueDate: e.target.value })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Assigned to</label>
        <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900" value={data.assignedTo} onChange={(e) => onChange({ ...data, assignedTo: e.target.value as Task["assignedTo"] })}>
          <option>Alliyah</option><option>Hannah</option><option>Jordan</option><option>All</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Priority</label>
        <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900" value={data.priority} onChange={(e) => onChange({ ...data, priority: e.target.value as Task["priority"] })}>
          <option>High</option><option>Medium</option><option>Low</option>
        </select>
      </div>
      <div className="col-span-full">
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Notes</label>
        <textarea rows={3} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none" placeholder="Additional context..." value={data.notes} onChange={(e) => onChange({ ...data, notes: e.target.value })} />
      </div>
    </div>
  );
}

function Modal({ title, onSave, onClose, onDelete, saveState, mode = "edit", error, children }: { title: string; onSave: () => void; onClose: () => void; onDelete?: () => void; saveState: SaveState; mode?: "add" | "edit"; error?: string; children: ReactNode }) {
  const footer = (
    <div className="space-y-3">
      {error && <FieldError message={error} />}
      <div className="flex gap-3">
        <SaveButton state={saveState} mode={mode} className="flex-1 py-3" onClick={onSave} />
        <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm" onClick={onClose}>Cancel</button>
      </div>
      {onDelete && (
        <button type="button" className="w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 md:text-sm" onClick={onDelete}>Delete task</button>
      )}
    </div>
  );
  return (
    <ModalShell title={title} onClose={onClose} maxWidth="max-w-3xl" footer={footer}>
      {children}
    </ModalShell>
  );
}

export default function TasksPage() {
  const { data: tasks, upsertItem, deleteItem, loading, error } = useSupabaseTable<Task>("tasks", defaultTasks);
  const [filterOwner, setFilterOwner] = useState<TaskOwner | "All">("All");
  const [search, setSearch] = useState("");
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const addSave = useSaveState();
  const editSave = useSaveState();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const isSearching = search.trim().length > 0;

  const toggle = (id: string) => {
    const task = tasks.find((current) => current.id === id);
    if (task) {
      const completed = !task.completed;
      const completedAt = completed ? new Date().toISOString() : undefined;
      upsertItem({
        ...task,
        completed,
        status: completed ? "Done" : "Open",
        completedAt,
        completed_at: completedAt,
      });
    }
  };

  const openAddForFounder = (founder: TaskColumn) => {
    setForm({ ...emptyForm, assignedTo: founder });
    setFormError("");
    addSave.resetSaveState();
    setShowAdd(true);
  };

  const openAddForTeam = () => {
    setForm({ ...emptyForm, assignedTo: "All" });
    setFormError("");
    addSave.resetSaveState();
    setShowAdd(true);
  };

  const handleAdd = async () => {
    if (!form.title.trim()) {
      setFormError("Task title is required.");
      return;
    }
    setFormError("");
    const newTask = { id: `task-${Date.now()}`, ...form };
    await addSave.runSave(async () => {
      const response = await upsertItem(newTask);
      if (!response.error) setForm(emptyForm);
      return response;
    }, () => { setShowAdd(false); setFormError(""); });
  };

  const handleSaveEdit = async () => {
    if (!editTask) return;
    if (!editTask.title.trim()) {
      setFormError("Task title is required.");
      return;
    }
    setFormError("");
    await editSave.runSave(() => upsertItem(editTask), () => { setEditTask(null); setFormError(""); });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    setDeletingId(id);
    await deleteItem(id);
    setDeletingId("");
    setEditTask(null);
  };

  const completedTasks = useMemo(
    () => tasks.filter((t) => t.completed && taskMatchesSearch(t, search)),
    [tasks, search],
  );

  const showCompletedContent = isSearching ? completedTasks.length > 0 : !completedCollapsed;

  const completedGroups = useMemo(
    () =>
      COMPLETION_GROUP_ORDER.map((key) => ({
        key,
        label: COMPLETION_GROUP_LABELS[key],
        tasks: completedTasks.filter((t) => getCompletionGroup(t.completedAt ?? t.completed_at) === key),
      })).filter((g) => g.tasks.length > 0),
    [completedTasks],
  );

  const TaskCard = ({ task }: { task: Task }) => {
    const owner = taskAssignee(task);
    return (
      <article
        role="button"
        tabIndex={0}
        onClick={() => { editSave.resetSaveState(); setEditTask({ ...task }); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            editSave.resetSaveState();
            setEditTask({ ...task });
          }
        }}
        className="w-full rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:p-5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${priorityDotColors[task.priority]}`} aria-label={`${task.priority} priority`} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 text-xs md:text-base font-semibold text-slate-950">{task.title}</p>
                {isCrmTask(task) && <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-white">CRM</span>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(task.id); }}
              className="min-h-11 rounded-3xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 md:min-h-0"
            >
              Done
            </button>
            <button
              type="button"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 md:min-h-10 md:min-w-10"
              disabled={deletingId === task.id}
              aria-label={`Delete ${task.title}`}
              onClick={(event) => {
                event.stopPropagation();
                handleDelete(task.id);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {owner !== "All" && owner !== "" && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ownerColors[owner as TaskOwner]}`}>{owner}</span>}
          {owner === "All" && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">All</span>}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${priorityColors[task.priority]}`}>{task.priority}</span>
        </div>
        <p className="mt-2 text-xs text-slate-600">Due {task.dueDate}</p>
      </article>
    );
  };

  if (loading) return <LoadingState label="Loading tasks..." />;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <ErrorBanner message={error} />

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-slate-600">Team tasks</p>
          <h1 className="mt-3 text-base md:text-3xl font-semibold text-slate-950">Task board</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative w-full md:w-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-xs md:text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-64"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            className="min-h-11 rounded-3xl bg-slate-950 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800"
            onClick={() => { setForm(emptyForm); setFormError(""); addSave.resetSaveState(); setShowAdd(true); }}
          >
            Add task
          </button>
          <select
            className="min-h-11 rounded-3xl border border-slate-300 bg-white px-4 py-3 text-xs md:text-sm text-slate-900"
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value as TaskOwner | "All")}
          >
            <option>All</option><option>Alliyah</option><option>Hannah</option><option>Jordan</option>
          </select>
        </div>
      </div>

      {/* Team Board — shared workspace for All-assigned tasks */}
      {(filterOwner === "All") && (
        <section className="rounded-[2rem] border-t-2 border-slate-800 bg-slate-50 p-4 shadow-sm md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Shared workspace</p>
              <h2 className="mt-0.5 text-base font-bold text-slate-950 md:text-lg">Team Board</h2>
            </div>
            <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
              {tasks.filter((t) => !t.completed && (taskAssignee(t) === "All" || taskAssignee(t) === "") && taskMatchesSearch(t, search)).length} open
            </span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {tasks
              .filter((t) => !t.completed && (taskAssignee(t) === "All" || taskAssignee(t) === "") && taskMatchesSearch(t, search))
              .map((task) => <TaskCard key={task.id} task={task} />)}
            {tasks.filter((t) => !t.completed && (taskAssignee(t) === "All" || taskAssignee(t) === "") && taskMatchesSearch(t, search)).length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-center text-xs text-slate-500 md:text-sm lg:col-span-2 xl:col-span-3">
                {isSearching ? "No team tasks match your search." : "No shared team tasks yet."}
              </div>
            )}
          </div>
          {!isSearching && (
            <div className="mt-4">
              <button
                type="button"
                className="min-h-11 w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 md:text-sm"
                onClick={openAddForTeam}
              >
                Add team task
              </button>
            </div>
          )}
        </section>
      )}

      {/* Active Kanban board — completed tasks never appear here */}
      <div className="grid gap-5 xl:grid-cols-3">
        {founderColumns
          .filter((founder) => filterOwner === "All" || founder.name === filterOwner)
          .map((founder) => {
            const visibleTasks = tasks.filter(
              (task) =>
                !task.completed &&
                taskAssignee(task) === founder.name &&
                taskMatchesSearch(task, search),
            );

            return (
              <section key={founder.name} className="flex min-h-[28rem] flex-col rounded-[2rem] border border-slate-200 bg-white shadow-sm">
                <div className={`rounded-t-[2rem] border-t-2 p-4 md:p-5 ${founder.headerClass}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 rounded-full ${founder.accentClass}`} aria-hidden="true" />
                      <h2 className="text-base md:text-lg font-bold text-slate-950">{founder.name}</h2>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                      {visibleTasks.length} open
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-3 md:p-4">
                  {visibleTasks.map((task) => <TaskCard key={task.id} task={task} />)}
                  {visibleTasks.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-xs text-slate-500 md:text-sm">
                      {isSearching ? "No tasks match your search." : "No tasks assigned yet."}
                    </div>
                  )}
                </div>
                {!isSearching && (
                  <div className="border-t border-slate-100 p-3 md:p-4">
                    <button
                      type="button"
                      className="min-h-11 w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 md:text-sm"
                      onClick={() => openAddForFounder(founder.name)}
                    >
                      Add task
                    </button>
                  </div>
                )}
              </section>
            );
          })}
      </div>

      {/* Completed tasks section — always present, collapsed by default */}
      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-[2rem] p-4 text-left md:p-5"
          onClick={() => { if (!isSearching) setCompletedCollapsed((prev) => !prev); }}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-base md:text-lg font-semibold text-slate-950">Completed</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {completedTasks.length}
            </span>
          </div>
          {!isSearching && (
            completedCollapsed
              ? <ChevronDown className="h-5 w-5 text-slate-400" aria-hidden="true" />
              : <ChevronUp className="h-5 w-5 text-slate-400" aria-hidden="true" />
          )}
        </button>

        {showCompletedContent && (
          <div className="border-t border-slate-100 p-4 md:p-5">
            {completedGroups.length === 0 ? (
              <p className="py-4 text-center text-xs md:text-sm text-slate-500">
                {isSearching ? "No completed tasks match your search." : "No completed tasks yet."}
              </p>
            ) : (
              <div className="space-y-6">
                {completedGroups.map((group) => (
                  <div key={group.key}>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {group.label}
                    </h3>
                    <div className="space-y-2">
                      {group.tasks.map((task) => {
                        const owner = taskAssignee(task);
                        return (
                          <div
                            key={task.id}
                            role="button"
                            tabIndex={0}
                            className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-200 hover:bg-white"
                            onClick={() => { editSave.resetSaveState(); setEditTask({ ...task }); }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                editSave.resetSaveState();
                                setEditTask({ ...task });
                              }
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-400 line-through md:text-sm">
                                {task.title}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {owner && owner !== "All" && (
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ownerColors[owner as TaskOwner]}`}>
                                    {owner}
                                  </span>
                                )}
                                {owner === "All" && (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">All</span>
                                )}
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${priorityColors[task.priority]}`}>
                                  {task.priority}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="min-h-11 shrink-0 rounded-3xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 md:min-h-0"
                              onClick={(e) => { e.stopPropagation(); toggle(task.id); }}
                            >
                              Reopen
                            </button>
                            <button
                              type="button"
                              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-500 hover:border-rose-200 hover:bg-rose-100 hover:text-rose-600 md:min-h-10 md:min-w-10"
                              disabled={deletingId === task.id}
                              aria-label={`Delete ${task.title}`}
                              onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {showAdd && (
        <Modal title="Add task" onSave={handleAdd} onClose={() => { setShowAdd(false); setFormError(""); }} saveState={addSave.saveState} mode="add" error={formError}>
          <FormFields data={form} onChange={(next) => { setForm(next); if (formError) setFormError(""); }} />
        </Modal>
      )}
      {editTask && (
        <Modal title="Edit task" onSave={handleSaveEdit} onClose={() => { setEditTask(null); setFormError(""); editSave.resetSaveState(); }} onDelete={() => handleDelete(editTask.id)} saveState={editSave.saveState} mode="edit" error={formError}>
          <FormFields data={editTask} onChange={(next) => { setEditTask(next); if (formError) setFormError(""); }} />
        </Modal>
      )}
    </div>
  );
}

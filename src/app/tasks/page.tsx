"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search, Trash2 } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import SaveButton, { type SaveState, useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { businessTodayISO, dateToBusinessISO } from "@/lib/businessDate";
import { isCrmTask } from "@/lib/followUps";

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
const founderColumns: { name: TaskColumn; headerClass: string; accentClass: string; avatarClass: string }[] = [
  { name: "Alliyah", headerClass: "bg-violet-50 border-violet-400", accentClass: "bg-violet-400", avatarClass: "bg-violet-500" },
  { name: "Hannah", headerClass: "bg-blue-50 border-blue-400", accentClass: "bg-blue-400", avatarClass: "bg-blue-500" },
  { name: "Jordan", headerClass: "bg-emerald-50 border-emerald-400", accentClass: "bg-emerald-400", avatarClass: "bg-emerald-500" },
];
type TaskFormData = Omit<Task, "id">;

function taskAssignee(task: Task): TaskAssignee {
  return task.owner ?? task.assignedTo ?? "";
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
    () => tasks.filter((t) => t.completed && !isCrmTask(t) && taskMatchesSearch(t, search)),
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

  // ── Workspace derivations — all pure, reuse the existing date rule + accessors ──
  const todayISO = businessTodayISO();
  const isDated = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

  // Base open set: not completed, NOT a CRM follow-up (phantom-task fix), matches search.
  const openTasks = tasks.filter((t) => !t.completed && !isCrmTask(t) && taskMatchesSearch(t, search));
  const overdueTasks = openTasks.filter((t) => isDated(t.dueDate) && t.dueDate < todayISO);
  const dueTodayTasks = openTasks.filter((t) => isDated(t.dueDate) && t.dueDate === todayISO);
  const urgentTasks = [...overdueTasks, ...dueTodayTasks]; // overdue first, disjoint by definition
  const urgentIds = new Set(urgentTasks.map((t) => t.id));

  // Team & anyone: assignee "All" or "" — excluding anything already in the urgent band.
  const teamTasks = openTasks.filter((t) => {
    const a = taskAssignee(t);
    return (a === "All" || a === "") && !urgentIds.has(t.id);
  });

  const OwnerChip = ({ owner, small = false }: { owner: TaskAssignee; small?: boolean }) => {
    const pad = small ? "px-2 py-0.5" : "px-3 py-1";
    if (owner === "All" || owner === "") {
      return <span className={`rounded-full bg-violet-100 ${pad} text-xs font-semibold text-violet-700`}>Anyone</span>;
    }
    return <span className={`rounded-full ${pad} text-xs font-semibold ${ownerColors[owner as TaskOwner]}`}>{owner}</span>;
  };

  const TaskCard = ({ task }: { task: Task }) => {
    const owner = taskAssignee(task);
    const isOverdue = !task.completed && isDated(task.dueDate) && task.dueDate < todayISO;
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
        className="w-full rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md md:p-3.5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${priorityDotColors[task.priority]}`} aria-label={`${task.priority} priority`} />
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
              className="inline-flex min-h-11 items-center gap-1.5 rounded-3xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 md:min-h-0"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
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
        <div className="mt-2 flex flex-wrap gap-1.5">
          <OwnerChip owner={owner} small />
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] ${priorityColors[task.priority]}`}>{task.priority}</span>
        </div>
        {isDated(task.dueDate) && (
          <p className={`mt-2 text-xs ${isOverdue ? "font-semibold text-rose-600" : "text-slate-600"}`}>
            Due {task.dueDate}
            {isOverdue && (
              <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-rose-700">Overdue</span>
            )}
          </p>
        )}
      </article>
    );
  };

  if (loading) return <LoadingState label="Loading tasks..." />;

  return (
    <div className="space-y-5 text-xs md:text-sm">
      <ErrorBanner message={error} />

      {/* ── Compact header: title + inline urgency line + search + add ─────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Team tasks</p>
          <h1 className="mt-1.5 text-base font-semibold text-slate-950 md:text-3xl">Tasks</h1>
          <p className="mt-2 text-xs md:text-sm">
            <span className={overdueTasks.length > 0 ? "font-semibold text-rose-600" : "text-slate-400"}>{overdueTasks.length} overdue</span>
            <span className="text-slate-300"> · </span>
            <span className={dueTodayTasks.length > 0 ? "font-semibold text-amber-600" : "text-slate-400"}>{dueTodayTasks.length} due today</span>
            <span className="text-slate-300"> · </span>
            <span className="text-slate-500">{openTasks.length} open</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative w-full md:w-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-xs text-slate-900 outline-none focus:border-slate-400 sm:w-64 md:text-sm"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            className="min-h-11 rounded-3xl bg-slate-950 px-5 py-3 text-xs font-semibold text-white hover:bg-slate-800 md:text-sm"
            onClick={() => { setForm(emptyForm); setFormError(""); addSave.resetSaveState(); setShowAdd(true); }}
          >
            Add task
          </button>
          <select
            className="min-h-11 rounded-3xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 md:text-sm"
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value as TaskOwner | "All")}
          >
            <option>All</option><option>Alliyah</option><option>Hannah</option><option>Jordan</option>
          </select>
        </div>
      </div>

      {/* ── Urgent band: overdue + due-today, actionable now ──────────────────── */}
      <section className={`rounded-[2rem] p-4 shadow-sm ring-1 md:p-5 ${
        urgentTasks.length === 0 ? "bg-white ring-slate-200" :
        overdueTasks.length > 0 ? "bg-rose-50 ring-rose-200" : "bg-amber-50 ring-amber-200"
      }`}>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Needs action now</h2>
        {urgentTasks.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>
            <p className="text-xs font-semibold text-emerald-800">All caught up — nothing urgent.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {urgentTasks.map((task) => {
              const overdue = isDated(task.dueDate) && task.dueDate < todayISO;
              return (
                <div key={task.id} className="flex flex-col gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${priorityDotColors[task.priority]}`} aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => { editSave.resetSaveState(); setEditTask({ ...task }); }}
                      className="truncate text-left text-xs font-semibold text-slate-900 hover:underline md:text-sm"
                    >
                      {task.title}
                    </button>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <OwnerChip owner={taskAssignee(task)} small />
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] ${overdue ? "bg-rose-600 text-white" : "bg-amber-500 text-white"}`}>
                      {overdue ? `Overdue ${task.dueDate}` : "Due today"}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(task.id)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Done
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Team & Anyone — shared tasks anyone can grab (only in the All view) ── */}
      {filterOwner === "All" && (
        <section className="rounded-[2rem] bg-violet-50 p-4 shadow-sm ring-1 ring-violet-200 md:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-500">Shared workspace</p>
              <h2 className="mt-0.5 text-base font-bold text-slate-950 md:text-lg">Team &amp; Anyone</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">Shared tasks anyone can grab &amp; complete.</p>
            </div>
            <span className="w-fit shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">{teamTasks.length} open</span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {teamTasks.map((task) => <TaskCard key={task.id} task={task} />)}
            {teamTasks.length === 0 && (
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

      {/* ── Person columns — the main workspace (urgent-band tasks excluded) ───── */}
      <div className="grid gap-5 xl:grid-cols-3">
        {founderColumns
          .filter((founder) => filterOwner === "All" || founder.name === filterOwner)
          .map((founder) => {
            const columnTasks = openTasks.filter(
              (task) => taskAssignee(task) === founder.name && !urgentIds.has(task.id),
            );

            return (
              <section key={founder.name} className="flex min-h-[26rem] flex-col rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200">
                <div className={`rounded-t-[2rem] border-t-2 p-4 md:p-5 ${founder.headerClass}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${founder.avatarClass}`} aria-hidden="true">{founder.name[0]}</span>
                      <h2 className="text-base font-bold text-slate-950 md:text-lg">{founder.name}</h2>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                      {columnTasks.length} open
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-3 md:p-4">
                  {columnTasks.map((task) => <TaskCard key={task.id} task={task} />)}
                  {columnTasks.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-xs text-slate-500 md:text-sm">
                      {isSearching ? "No tasks match your search." : "Nothing open — all clear."}
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

      {/* ── Completed (collapsed, unchanged behavior) ─────────────────────────── */}
      <section className="rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-[2rem] p-4 text-left md:p-5"
          onClick={() => { if (!isSearching) setCompletedCollapsed((prev) => !prev); }}
        >
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-950 md:text-lg">Completed</h2>
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
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">Anyone</span>
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

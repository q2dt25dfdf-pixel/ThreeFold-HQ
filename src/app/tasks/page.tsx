"use client";

import { type ReactNode, useState } from "react";
import { Trash2 } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

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
  source?: "CRM" | string;
  crmLeadId?: string;
  leadId?: string;
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

const priorityColors: Record<Task["priority"], string> = { High: "bg-rose-100 text-rose-800", Medium: "bg-amber-100 text-amber-800", Low: "bg-slate-100 text-slate-700" };
const priorityDotColors: Record<Task["priority"], string> = { High: "bg-rose-500", Medium: "bg-amber-500", Low: "bg-emerald-500" };
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

function crmFollowUpDetails(task: Task) {
  const fallback = task.title.replace(/^Follow up with\s+/i, "");
  const [leadName = fallback, company = "Lead"] = fallback.split(/\s+—\s+/);

  return { leadName, company };
}

function PipelineFollowUps({ tasks, onComplete, onOpen }: { tasks: Task[]; onComplete: (id: string) => void; onOpen: (task: Task) => void }) {
  const sortedTasks = [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-2 shadow-md md:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">CRM</p>
          <h2 className="text-base font-bold text-slate-950 md:text-lg">Pipeline Follow-Ups</h2>
        </div>
        <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800 shadow-md">
          {sortedTasks.filter((task) => !task.completed).length} open
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {sortedTasks.map((task) => {
          const { leadName, company } = crmFollowUpDetails(task);

          return (
            <article
              key={task.id}
              role="button"
              tabIndex={0}
              className={"rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition hover:border-amber-300 hover:shadow-md " + (task.completed ? "border-slate-200 opacity-60" : "border-amber-200")}
              onClick={() => onOpen(task)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(task);
                }
              }}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{leadName}</p>
                  <p className="mt-1 truncate text-xs text-slate-600">{company}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Due {task.dueDate}</span>
                  <button
                    type="button"
                    className={"min-h-11 rounded-2xl px-4 py-2 text-xs font-semibold text-white " + (task.completed ? "bg-slate-400" : "bg-slate-950 hover:bg-slate-800")}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!task.completed) onComplete(task.id);
                    }}
                  >
                    Mark complete
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {sortedTasks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-amber-200 bg-white/70 px-4 py-6 text-center text-xs text-slate-600 md:text-sm">
            No pipeline follow-ups yet.
          </div>
        )}
      </div>
    </section>
  );
}

function FormFields<T extends TaskFormData | Task>({ data, onChange }: { data: T; onChange: (f: T) => void }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Task</label>
        <input type="text" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:outline-none md:text-sm" placeholder="What needs to get done?" value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Due date</label>
        <input type="date" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:outline-none md:text-sm" value={data.dueDate} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => onChange({ ...data, dueDate: e.target.value })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Assigned to</label>
        <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm" value={data.assignedTo} onChange={(e) => onChange({ ...data, assignedTo: e.target.value as Task["assignedTo"] })}>
<option>Alliyah</option><option>Hannah</option><option>Jordan</option><option>All</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Priority</label>
        <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm" value={data.priority} onChange={(e) => onChange({ ...data, priority: e.target.value as Task["priority"] })}>
          <option>High</option><option>Medium</option><option>Low</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Notes</label>
        <textarea rows={3} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:outline-none md:text-sm" placeholder="Additional context..." value={data.notes} onChange={(e) => onChange({ ...data, notes: e.target.value })} />
      </div>
    </div>
  );
}

function Modal({ title, onSave, onClose, onDelete, saveLabel = "Save", children }: { title: string; onSave: () => void; onClose: () => void; onDelete?: () => void; saveLabel?: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white px-5 py-3 md:py-6 shadow-xl md:px-10 md:py-10">
        <h2 className="text-base md:text-2xl font-semibold text-slate-950 mb-6">{title}</h2>
        {children}
        <div className="mt-6 flex gap-3">
          <button className="min-h-11 flex-1 rounded-3xl bg-slate-950 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800" onClick={onSave}>{saveLabel}</button>
          <button className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100" onClick={onClose}>Cancel</button>
        </div>
        {onDelete && <button className="mt-3 w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-xs md:text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={onDelete}>Delete task</button>}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { data: tasks, upsertItem, deleteItem, loading } = useSupabaseTable<Task>("tasks", defaultTasks);
  const [filterOwner, setFilterOwner] = useState<TaskOwner | "All">("All");
  const [showAdd, setShowAdd] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editSaveLabel, setEditSaveLabel] = useState("Save Changes");
  const [form, setForm] = useState(emptyForm);

  const toggle = (id: string) => {
    const task = tasks.find((current) => current.id === id);
    if (task) {
      const completed = !task.completed;
      upsertItem({ ...task, completed, status: completed ? "Done" : "Open" });
    }
  };
  const openAddForFounder = (founder: TaskColumn) => {
    setForm({ ...emptyForm, assignedTo: founder });
    setShowAdd(true);
  };
  const handleAdd = () => {
    if (!form.title.trim()) return;
    const newTask = { id: `task-${Date.now()}`, ...form };
    upsertItem(newTask);
    setForm(emptyForm); setShowAdd(false);
  };
  const handleSaveEdit = async () => {
    if (!editTask) return;
    await upsertItem(editTask);
    setEditSaveLabel("Saved ✓");
    window.setTimeout(() => {
      setEditTask(null);
      setEditSaveLabel("Save Changes");
    }, 700);
  };
  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    await deleteItem(id);
    setEditTask(null);
  };

  const TaskCard = ({ task }: { task: Task }) => {
    const owner = taskAssignee(task);

    return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => setEditTask({ ...task })}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setEditTask({ ...task });
        }
      }}
      className={`rounded-[2rem] border bg-white p-2 md:p-5 shadow-md text-left transition hover:shadow-md hover:-translate-y-0.5 w-full ${task.completed ? "border-slate-300 opacity-60" : "border-slate-300"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${priorityDotColors[task.priority]}`} aria-label={`${task.priority} priority`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`min-w-0 text-xs md:text-base font-semibold ${task.completed ? "line-through text-slate-600" : "text-slate-950"}`}>{task.title}</p>
              {isCrmTask(task) && <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">CRM</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); toggle(task.id); }} className={`min-h-11 rounded-xl px-3 py-1 text-xs font-semibold text-white md:min-h-0 ${task.completed ? "bg-slate-400" : "bg-slate-950"}`}>{task.completed ? "Reopen" : "Done"}</button>
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-full p-1 text-rose-600 hover:bg-rose-50 md:min-h-0 md:min-w-0"
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
        {owner !== "All" && owner !== "" && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ownerColors[owner]}`}>{owner}</span>}
        {owner === "All" && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">All</span>}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${priorityColors[task.priority]}`}>{task.priority}</span>
      </div>
      <p className="mt-2 text-xs text-slate-600">Due {task.dueDate}</p>
    </article>
    );
  };

  if (loading) return <div className="p-2 md:p-8 text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-slate-600">Team tasks</p>
          <h1 className="mt-3 text-base md:text-3xl font-semibold text-slate-950">Task board</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="min-h-11 rounded-3xl bg-slate-950 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800" onClick={() => { setForm(emptyForm); setShowAdd(true); }}>Add task</button>
          <select className="min-h-11 rounded-3xl border border-slate-300 bg-white px-4 py-3 text-xs md:text-sm text-slate-900" value={filterOwner} onChange={(e) => setFilterOwner(e.target.value as TaskOwner | "All")}>
            <option>All</option><option>Alliyah</option><option>Hannah</option><option>Jordan</option>
          </select>
        </div>
      </div>

      <PipelineFollowUps tasks={tasks.filter(isCrmTask)} onComplete={toggle} onOpen={(task) => setEditTask({ ...task })} />

      <div className="grid gap-5 xl:grid-cols-3">
        {founderColumns
          .filter((founder) => filterOwner === "All" || founder.name === filterOwner)
          .map((founder) => {
          const founderTasks = tasks.filter((task) => !isCrmTask(task) && (taskAssignee(task) === founder.name || taskAssignee(task) === "All"));
          const founderOpen = founderTasks.filter((task) => !task.completed);
          const founderDone = founderTasks.filter((task) => task.completed);

          return (
            <section key={founder.name} className="flex min-h-[28rem] flex-col rounded-[2rem] border border-slate-300 bg-white shadow-md">
              <div className={`rounded-t-[2rem] border-t-2 p-2 md:p-5 ${founder.headerClass}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-3 w-3 rounded-full ${founder.accentClass}`} aria-hidden="true" />
                    <h2 className="text-base md:text-lg font-bold text-slate-950">{founder.name}</h2>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-md">
                    {founderOpen.length} open
                  </span>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-2 md:p-4">
                {founderOpen.map((task) => <TaskCard key={task.id} task={task} />)}
                {founderDone.length > 0 && (
                  <div className="mt-auto space-y-3 border-t border-slate-100 pt-3">
                    {founderDone.map((task) => <TaskCard key={task.id} task={task} />)}
                  </div>
                )}
                {founderTasks.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300 bg-gray-100 px-4 py-10 text-center text-xs md:text-sm text-slate-600">
                    No tasks assigned yet.
                  </div>
                )}
              </div>
              <div className="border-t border-slate-100 p-2 md:p-4">
                <button
                  type="button"
                  className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-xs md:text-sm font-semibold text-slate-700 transition hover:bg-gray-100"
                  onClick={() => openAddForFounder(founder.name)}
                >
                  Add task
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {showAdd && <Modal title="Add task" onSave={handleAdd} onClose={() => setShowAdd(false)}><FormFields data={form} onChange={setForm} /></Modal>}
      {editTask && <Modal title="Edit task" onSave={handleSaveEdit} onClose={() => { setEditTask(null); setEditSaveLabel("Save Changes"); }} onDelete={() => handleDelete(editTask.id)} saveLabel={editSaveLabel}><FormFields data={editTask} onChange={setEditTask} /></Modal>}
    </div>
  );
}

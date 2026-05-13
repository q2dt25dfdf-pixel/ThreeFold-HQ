"use client";

import { useState } from "react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type Task = {
  id: string;
  title: string;
  dueDate: string;
  assignedTo: "Alliyah" | "Hannah" | "Jordan";
  priority: "High" | "Medium" | "Low";
  notes: string;
  completed: boolean;
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
const ownerColors: Record<Task["assignedTo"], string> = { Alliyah: "bg-violet-100 text-violet-800", Hannah: "bg-blue-100 text-blue-800", Jordan: "bg-emerald-100 text-emerald-800" };
const founderColumns: { name: Task["assignedTo"]; headerClass: string; accentClass: string }[] = [
  { name: "Alliyah", headerClass: "bg-violet-50 border-violet-400", accentClass: "bg-violet-400" },
  { name: "Hannah", headerClass: "bg-blue-50 border-blue-400", accentClass: "bg-blue-400" },
  { name: "Jordan", headerClass: "bg-emerald-50 border-emerald-400", accentClass: "bg-emerald-400" },
];

export default function TasksPage() {
  const { data: tasks, upsertItem, deleteItem, loading } = useSupabaseTable<Task>("tasks", defaultTasks);
  const [filterOwner, setFilterOwner] = useState<Task["assignedTo"] | "All">("All");
  const [showAdd, setShowAdd] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);

  const toggle = (id: string) => {
    const task = tasks.find((current) => current.id === id);
    if (task) upsertItem({ ...task, completed: !task.completed });
  };
  const openAddForFounder = (founder: Task["assignedTo"]) => {
    setForm({ ...emptyForm, assignedTo: founder });
    setShowAdd(true);
  };
  const handleAdd = async () => {
    if (!form.title.trim()) return;
    await upsertItem({ id: `task-${Date.now()}`, ...form });
    setForm(emptyForm); setShowAdd(false);
  };
  const handleSaveEdit = async () => {
    if (!editTask) return;
    await upsertItem(editTask);
    setEditTask(null);
  };
  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this task?")) return;
    await deleteItem(id);
    setEditTask(null);
  };

  const FormFields = ({ data, onChange }: { data: any; onChange: (f: any) => void }) => (
    <div className="grid grid-cols-2 gap-6">
      <div className="col-span-2">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Task</label>
        <input type="text" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none" placeholder="What needs to get done?" value={data.title} onChange={(e) => onChange({ ...data, title: e.target.value })} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Due date</label>
        <input type="text" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none" placeholder="e.g. 2026-05-20 or TBD" value={data.dueDate} onChange={(e) => onChange({ ...data, dueDate: e.target.value })} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Assigned to</label>
        <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900" value={data.assignedTo} onChange={(e) => onChange({ ...data, assignedTo: e.target.value })}>
          <option>Alliyah</option><option>Hannah</option><option>Jordan</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Priority</label>
        <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900" value={data.priority} onChange={(e) => onChange({ ...data, priority: e.target.value })}>
          <option>High</option><option>Medium</option><option>Low</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Notes</label>
        <textarea rows={3} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none" placeholder="Additional context..." value={data.notes} onChange={(e) => onChange({ ...data, notes: e.target.value })} />
      </div>
    </div>
  );

  const Modal = ({ title, onSave, onClose, onDelete, children }: any) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl rounded-[2rem] bg-white px-10 py-10 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold text-slate-950 mb-6">{title}</h2>
        {children}
        <div className="mt-6 flex gap-3">
          <button className="flex-1 rounded-3xl bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-slate-800" onClick={onSave}>Save</button>
          <button className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-gray-100" onClick={onClose}>Cancel</button>
        </div>
        {onDelete && <button className="mt-3 w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={onDelete}>Delete task</button>}
      </div>
    </div>
  );

  const TaskCard = ({ task }: { task: Task }) => (
    <button onClick={() => setEditTask({ ...task })} className={`rounded-[2rem] border bg-white p-5 shadow-md text-left transition hover:shadow-md hover:-translate-y-0.5 w-full ${task.completed ? "border-slate-300 opacity-60" : "border-slate-300"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-base font-semibold ${task.completed ? "line-through text-slate-600" : "text-slate-950"}`}>{task.title}</p>
        <button onClick={(e) => { e.stopPropagation(); toggle(task.id); }} className={`shrink-0 rounded-xl px-3 py-1 text-xs font-semibold text-white ${task.completed ? "bg-slate-400" : "bg-slate-950"}`}>{task.completed ? "Reopen" : "Done"}</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ownerColors[task.assignedTo]}`}>{task.assignedTo}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${priorityColors[task.priority]}`}>{task.priority}</span>
      </div>
      <p className="mt-2 text-xs text-slate-600">Due {task.dueDate}</p>
    </button>
  );

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-600">Team tasks</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">Task board</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800" onClick={() => { setForm(emptyForm); setShowAdd(true); }}>Add task</button>
          <select className="rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900" value={filterOwner} onChange={(e) => setFilterOwner(e.target.value as any)}>
            <option>All</option><option>Alliyah</option><option>Hannah</option><option>Jordan</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {founderColumns.map((founder) => {
          const founderTasks = tasks.filter((task) => task.assignedTo === founder.name && (filterOwner === "All" || task.assignedTo === filterOwner));
          const founderOpen = founderTasks.filter((task) => !task.completed);
          const founderDone = founderTasks.filter((task) => task.completed);

          return (
            <section key={founder.name} className="flex min-h-[28rem] flex-col rounded-[2rem] border border-slate-300 bg-white shadow-md">
              <div className={`rounded-t-[2rem] border-t-2 p-5 ${founder.headerClass}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-3 w-3 rounded-full ${founder.accentClass}`} aria-hidden="true" />
                    <h2 className="text-lg font-bold text-slate-950">{founder.name}</h2>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-md">
                    {founderOpen.length} open
                  </span>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                {founderOpen.map((task) => <TaskCard key={task.id} task={task} />)}
                {founderDone.length > 0 && (
                  <div className="mt-auto space-y-3 border-t border-slate-100 pt-3">
                    {founderDone.map((task) => <TaskCard key={task.id} task={task} />)}
                  </div>
                )}
                {founderTasks.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300 bg-gray-100 px-4 py-10 text-center text-sm text-slate-600">
                    No tasks assigned yet.
                  </div>
                )}
              </div>
              <div className="border-t border-slate-100 p-4">
                <button
                  type="button"
                  className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-gray-100"
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
      {editTask && <Modal title="Edit task" onSave={handleSaveEdit} onClose={() => setEditTask(null)} onDelete={() => handleDelete(editTask.id)}><FormFields data={editTask} onChange={setEditTask} /></Modal>}
    </div>
  );
}
